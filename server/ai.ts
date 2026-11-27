import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  CustomerConversation,
  Order,
  OrderStatus,
  PaymentOCRResult,
  Product,
  SellerProfile,
} from '../src/types.ts';
import { computeAvailableStock } from './store.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; status?: string; code?: number } };
    if (parsed?.error?.message) {
      return new Error(parsed.error.message);
    }
  } catch {
    // not JSON
  }
  return err instanceof Error ? err : new Error(raw);
}

async function withGeminiRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT');
      if (!isTransient || attempt === maxRetries) {
        throw formatGeminiError(err);
      }
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
  throw formatGeminiError(lastErr);
}


export interface CustomerReplyDecision {
  intent: 'order' | 'order_confirmation' | 'faq' | 'order_tracking' | 'complaint' | 'escalate_query';
  replyText: string;
  extractedProductId?: string;
  extractedQuantity?: number;
  extractedCustomerName?: string;
  extractedCustomerContact?: string;
  extractedDeliveryAddress?: string;
  awaitingConfirmation?: boolean;
  shouldCreateOrder: boolean;
  trackingOrderNumber?: string;
  complaintDetails?: {
    category:
      | 'Damaged product'
      | 'Parcel not received'
      | 'Delayed delivery'
      | 'Incorrect product'
      | 'Missing items'
      | 'Other';
    orderNumber?: string;
    productDetails?: string;
    description: string;
  };
  escalationReason?: string;
}

export async function processCustomerMessage(params: {
  seller: SellerProfile;
  products: Product[];
  orders: Order[];
  conversation: CustomerConversation;
  incomingText: string;
}): Promise<CustomerReplyDecision> {
  const ai = getAiClient();

  const catalogSummary = params.products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.sellingPrice,
    remainingStock: computeAvailableStock(p),
    description: p.description,
  }));

  const recentOrdersSummary = params.orders.slice(0, 20).map((o) => ({
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    status: o.status,
    paymentStatus: o.payment.status,
    totalAmount: o.totalAmount,
    items: o.items.map((i) => `${i.quantity}x ${i.productName}`).join(', '),
  }));

  const historyText = params.conversation.messages
    .slice(-10)
    .map((m) => `${m.sender.toUpperCase()}: ${m.text}`)
    .join('\n');

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `You are SELLMATE, the automated customer messaging assistant for "${params.seller.storeName}" (${params.seller.businessCategory}).

SELLER KNOWLEDGE BASE & POLICIES:
- Currency: ${params.seller.currencySymbol}
- UPI ID: ${params.seller.upiId}
- Accepted Payments: ${params.seller.paymentMethodsText}
- Delivery Timeline: ${params.seller.deliverySla}
- Cancellation Policy: ${params.seller.cancellationPolicy}
- Return/Refund Policy: ${params.seller.returnPolicy}
- Approved FAQs: ${JSON.stringify(params.seller.faqs)}
- Live Product Catalog & Available Stock: ${JSON.stringify(catalogSummary)}
- Recent Orders (for order tracking inquiries): ${JSON.stringify(recentOrdersSummary)}
- Current Draft Order State in this thread: ${JSON.stringify(params.conversation.draftOrderState || {})}

CONVERSATION HISTORY:
${historyText}

NEW BUYER MESSAGE:
"${params.incomingText}"

INSTRUCTIONS:
1. Identify intent:
   - "order": Buyer wants to buy/order a product, or is providing product/quantity/name/address details.
     * Check real remainingStock! Never promise out-of-stock quantities.
     * If product or quantity is missing, ask clearly.
     * If product & quantity are known, check stock, calculate total (quantity * price), and ask for customer name + delivery address + explicit confirmation ("Reply Confirm to place order").
     * Set awaitingConfirmation=true when summary is shown and details are ready.
   - "order_confirmation": Buyer explicitly confirms the pending draft order (e.g. "Confirm", "Yes place order", "Confirmed") AND we have productId, quantity, customerName (or conversation.customerName), and deliveryAddress (either in draftOrderState or in this message). Set shouldCreateOrder=true ONLY when productId, quantity > 0, and deliveryAddress are all present and buyer confirmed!
   - "faq": Answer strictly from seller's actual product prices, stock, policies, and FAQs. Never invent policies or discounts.
   - "order_tracking": If buyer asks to track an order and mentions order number or matching customer name, report real status from Recent Orders; if not found, ask for their order number.
   - "complaint": Buyer reports damaged product, parcel not received, delayed delivery, incorrect product, missing items, or defect. Register complaint details clearly and empathetically inform buyer the store owner has been alerted.
   - "escalate_query": If the buyer asks something NOT covered by the catalog/policies/FAQs (e.g. wholesale discount, custom bulk turnaround, special personalization not listed, unusual refund exception), DO NOT guess. Politely say the query has been escalated to the seller and set escalationReason.

Return valid JSON matching the schema.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          intent: {
            type: Type.STRING,
            enum: ['order', 'order_confirmation', 'faq', 'order_tracking', 'complaint', 'escalate_query'],
          },
          replyText: { type: Type.STRING },
          extractedProductId: { type: Type.STRING },
          extractedQuantity: { type: Type.NUMBER },
          extractedCustomerName: { type: Type.STRING },
          extractedCustomerContact: { type: Type.STRING },
          extractedDeliveryAddress: { type: Type.STRING },
          awaitingConfirmation: { type: Type.BOOLEAN },
          shouldCreateOrder: { type: Type.BOOLEAN },
          trackingOrderNumber: { type: Type.STRING },
          escalationReason: { type: Type.STRING },
          complaintDetails: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                enum: [
                  'Damaged product',
                  'Parcel not received',
                  'Delayed delivery',
                  'Incorrect product',
                  'Missing items',
                  'Other',
                ],
              },
              orderNumber: { type: Type.STRING },
              productDetails: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ['category', 'description'],
          },
        },
        required: ['intent', 'replyText', 'shouldCreateOrder'],
      },
    },
  }));

  const parsed = JSON.parse(response.text || '{}') as CustomerReplyDecision;
  return parsed;
}

export async function extractPaymentScreenshotOcr(params: {
  imageDataUrl: string;
  expectedAmount: number;
  sellerUpiId: string;
  currencySymbol: string;
}): Promise<PaymentOCRResult> {
  const ai = getAiClient();
  const match = params.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image format. Please upload a PNG, JPEG, or WebP payment screenshot.');
  }
  const [, mimeType, base64Data] = match;

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: `Perform strict OCR extraction on this payment screenshot.
Expected order amount: ${params.currencySymbol}${params.expectedAmount}
Expected seller UPI ID: ${params.sellerUpiId}

Extract ONLY what is visibly readable in the image. If any field is illegible or absent, return null for that field.
Remember: screenshot OCR alone NEVER confirms bank settlement; note any mismatches or missing UTR details in confidenceNotes.`,
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          extractedAmount: { type: Type.NUMBER, nullable: true },
          transactionId: { type: Type.STRING, nullable: true },
          payeeUpiOrName: { type: Type.STRING, nullable: true },
          payerName: { type: Type.STRING, nullable: true },
          paymentApp: { type: Type.STRING, nullable: true },
          timestampText: { type: Type.STRING, nullable: true },
          statusText: { type: Type.STRING, nullable: true },
          confidenceNotes: { type: Type.STRING },
        },
        required: ['confidenceNotes'],
      },
    },
  }));

  const parsed = JSON.parse(response.text || '{}') as {
    extractedAmount?: number | null;
    transactionId?: string | null;
    payeeUpiOrName?: string | null;
    payerName?: string | null;
    paymentApp?: string | null;
    timestampText?: string | null;
    statusText?: string | null;
    confidenceNotes?: string;
  };

  const extractedAmount =
    typeof parsed.extractedAmount === 'number' ? parsed.extractedAmount : null;
  const matchesExpectedAmount =
    extractedAmount !== null && Math.abs(extractedAmount - params.expectedAmount) < 0.01;
  const payeeLower = (parsed.payeeUpiOrName || '').toLowerCase();
  const matchesSellerUpi =
    Boolean(payeeLower) &&
    (payeeLower.includes(params.sellerUpiId.toLowerCase()) ||
      params.sellerUpiId.toLowerCase().includes(payeeLower));

  return {
    extractedAmount,
    transactionId: parsed.transactionId ?? null,
    payeeUpiOrName: parsed.payeeUpiOrName ?? null,
    payerName: parsed.payerName ?? null,
    paymentApp: parsed.paymentApp ?? null,
    timestampText: parsed.timestampText ?? null,
    statusText: parsed.statusText ?? null,
    matchesExpectedAmount,
    matchesSellerUpi,
    confidenceNotes:
      parsed.confidenceNotes ||
      'OCR extraction complete. Seller verification in banking app is required before confirming payment.',
  };
}

export interface SocialPostParseResult {
  ambiguityStatus: 'Clear' | 'Ambiguous';
  proposedStatus: OrderStatus;
  matchedOrderIds: string[];
  rationale: string;
  customerMessageTemplate: string;
}

export async function parseSocialUpdatePost(params: {
  postText: string;
  orders: Order[];
}): Promise<SocialPostParseResult> {
  const ai = getAiClient();
  const activeOrders = params.orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    createdAt: o.createdAt,
    dayOfWeek: new Date(o.createdAt).toLocaleDateString('en-US', { weekday: 'long' }),
    currentStatus: o.status,
    paymentStatus: o.payment.status,
    items: o.items.map((i) => `${i.quantity}x ${i.productName}`).join(', '),
  }));

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Current timestamp: ${new Date().toISOString()} (${new Date().toLocaleDateString('en-US', { weekday: 'long' })}).
Seller's social/broadcast update post:
"${params.postText}"

Seller's Orders:
${JSON.stringify(activeOrders)}

Determine:
1. Which specific order IDs clearly match the seller's update (e.g. by order number, customer name, day of week like "Monday", "today", "2 days ago", or current stage like "packed orders have been dispatched").
2. What target OrderStatus is indicated from the allowed list:
   - Order Placed
   - Payment Confirmed
   - Order Processing
   - Order Packed
   - Ready to Deliver
   - Order Dispatched
   - Out for Delivery
   - Order Delivered
   - Order Cancelled
3. Is the post "Clear" or "Ambiguous"?
   Mark "Ambiguous" if the post is vague (e.g., "some orders", "a few parcels", no clear timeframe/order IDs/filter, or zero confident matches, or multiple conflicting statuses). Never update unrelated orders when ambiguous!
4. Provide a concise rationale and a warm, accurate customer notification message.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ambiguityStatus: { type: Type.STRING, enum: ['Clear', 'Ambiguous'] },
          proposedStatus: {
            type: Type.STRING,
            enum: [
              'Order Placed',
              'Payment Confirmed',
              'Order Processing',
              'Order Packed',
              'Ready to Deliver',
              'Order Dispatched',
              'Out for Delivery',
              'Order Delivered',
              'Order Cancelled',
            ],
          },
          matchedOrderIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          rationale: { type: Type.STRING },
          customerMessageTemplate: { type: Type.STRING },
        },
        required: [
          'ambiguityStatus',
          'proposedStatus',
          'matchedOrderIds',
          'rationale',
          'customerMessageTemplate',
        ],
      },
    },
  }));

  const parsed = JSON.parse(response.text || '{}') as SocialPostParseResult;
  const validIds = new Set(params.orders.map((o) => o.id));
  parsed.matchedOrderIds = (parsed.matchedOrderIds || []).filter((id) => validIds.has(id));
  if (parsed.matchedOrderIds.length === 0) {
    parsed.ambiguityStatus = 'Ambiguous';
  }
  return parsed;
}
