import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import type {
  ActivityLogEntry,
  Complaint,
  CustomerConversation,
  CustomerQuery,
  Order,
  OrderStatus,
  PendingApproval,
  Product,
  SellerNotification,
  SellerProfile,
  SocialPostBatch,
  WorkspaceSnapshot,
} from '../src/types.ts';

interface StoredSellerRecord extends SellerProfile {
  passwordHash: string;
  isDemoSample?: boolean;
}

interface DatabaseSchema {
  sellers: StoredSellerRecord[];
  products: Product[];
  orders: Order[];
  conversations: CustomerConversation[];
  queries: CustomerQuery[];
  complaints: Complaint[];
  notifications: SellerNotification[];
  approvals: PendingApproval[];
  socialPosts: SocialPostBatch[];
  activityLogs: ActivityLogEntry[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'sellmate-store.json');

export function computeAvailableStock(p: Product): number {
  const physical =
    p.initialStock + p.manufacturedAddedStock - p.unitsSold + p.returnedCancelledUnits;
  return Math.max(0, physical - p.allocatedUnits);
}

export function buildUpiLink(upiId: string, storeName: string, amount: number, orderNumber: string): string {
  const params = new URLSearchParams({
    pa: upiId,
    pn: storeName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: `Order ${orderNumber}`,
  });
  return `upi://pay?${params.toString()}`;
}

export async function generateUpiQrDataUrl(upiLink: string): Promise<string> {
  return QRCode.toDataURL(upiLink, {
    width: 240,
    margin: 2,
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
}

function daysAgoIso(days: number, hoursOffset = 0): string {
  const dt = new Date(Date.now() - days * 86400000 - hoursOffset * 3600000);
  return dt.toISOString();
}

async function createSeedDatabase(): Promise<DatabaseSchema> {
  const demoSellerId = 'seller_earthloom_demo';
  const demoUpi = 'earthloom.crafts@okicici';
  const storeName = 'Earthloom Craft Studio';

  const prodKeychainId = 'prod_keychain_01';
  const prodCandleId = 'prod_candle_02';
  const prodToteId = 'prod_tote_03';
  const prodEarringsId = 'prod_earrings_04';

  const products: Product[] = [
    {
      id: prodKeychainId,
      sellerId: demoSellerId,
      name: 'Handmade Macrame Keychains',
      sku: 'EL-KC-01',
      category: 'Handmade Accessories',
      description: 'Hand-knotted organic cotton cord keychain with natural beechwood beads and antique brass clasp.',
      imageUrl: '/src/assets/images/product_handmade_keychain_1795710342140.jpg',
      materials: [
        { id: 'mat_1', name: '3mm Combed Cotton Cord', quantity: 2, unit: 'meters', unitCost: 14 },
        { id: 'mat_2', name: 'Natural Beechwood Beads', quantity: 4, unit: 'pcs', unitCost: 6 },
        { id: 'mat_3', name: 'Antique Brass Swivel Clasp', quantity: 1, unit: 'pc', unitCost: 28 },
      ],
      labourCost: 55,
      packagingCost: 18,
      otherExpenses: 12,
      desiredMarginPercent: 45,
      sellingPrice: 280,
      initialStock: 50,
      manufacturedAddedStock: 0,
      unitsSold: 40,
      returnedCancelledUnits: 0,
      allocatedUnits: 2,
      minStockThreshold: 10,
      createdAt: daysAgoIso(20),
      updatedAt: daysAgoIso(1),
    },
    {
      id: prodCandleId,
      sellerId: demoSellerId,
      name: 'Sandalwood Amber Soy Candle',
      sku: 'EL-SC-02',
      category: 'Home Fragrance',
      description: 'Hand-poured 226g natural soy wax candle in reusable amber apothecary jar with wood wick.',
      imageUrl: '/src/assets/images/product_soy_candle_1795710340594.jpg',
      materials: [
        { id: 'mat_4', name: 'Soy Wax Flakes', quantity: 230, unit: 'grams', unitCost: 0.45 },
        { id: 'mat_5', name: 'Amber Glass Apothecary Jar', quantity: 1, unit: 'pc', unitCost: 68 },
        { id: 'mat_6', name: 'Sandalwood Fragrance Oil', quantity: 20, unit: 'ml', unitCost: 3.5 },
        { id: 'mat_7', name: 'Wood Wick & Kraft Label', quantity: 1, unit: 'set', unitCost: 16 },
      ],
      labourCost: 75,
      packagingCost: 32,
      otherExpenses: 18,
      desiredMarginPercent: 42,
      sellingPrice: 640,
      initialStock: 35,
      manufacturedAddedStock: 10,
      unitsSold: 22,
      returnedCancelledUnits: 1,
      allocatedUnits: 2,
      minStockThreshold: 8,
      createdAt: daysAgoIso(25),
      updatedAt: daysAgoIso(2),
    },
    {
      id: prodToteId,
      sellerId: demoSellerId,
      name: 'Sage Woven Macrame Tote Bag',
      sku: 'EL-TB-03',
      category: 'Handwoven Bags',
      description: 'Artisanal cotton macramé tote bag in cream and sage with wooden bead handle accents.',
      imageUrl: '/src/assets/images/product_macrame_bag_1795710340546.jpg',
      materials: [
        { id: 'mat_8', name: '5mm Braided Cotton Cord', quantity: 45, unit: 'meters', unitCost: 9 },
        { id: 'mat_9', name: 'Cotton Canvas Inner Lining', quantity: 1, unit: 'pc', unitCost: 95 },
        { id: 'mat_10', name: 'Wooden Handle Beads', quantity: 8, unit: 'pcs', unitCost: 7 },
      ],
      labourCost: 320,
      packagingCost: 45,
      otherExpenses: 30,
      desiredMarginPercent: 40,
      sellingPrice: 1590,
      initialStock: 18,
      manufacturedAddedStock: 0,
      unitsSold: 7,
      returnedCancelledUnits: 0,
      allocatedUnits: 1,
      minStockThreshold: 5,
      createdAt: daysAgoIso(15),
      updatedAt: daysAgoIso(3),
    },
    {
      id: prodEarringsId,
      sellerId: demoSellerId,
      name: 'Terracotta & Sage Clay Earrings',
      sku: 'EL-CE-04',
      category: 'Handmade Jewellery',
      description: 'Lightweight textured polymer clay statement earrings with hypoallergenic gold-plated hooks.',
      imageUrl: '/src/assets/images/product_clay_earrings_1795710340985.jpg',
      materials: [
        { id: 'mat_11', name: 'Sculpey Polymer Clay', quantity: 30, unit: 'grams', unitCost: 2.2 },
        { id: 'mat_12', name: 'Hypoallergenic Brass Hooks', quantity: 1, unit: 'pair', unitCost: 24 },
      ],
      labourCost: 95,
      packagingCost: 22,
      otherExpenses: 10,
      desiredMarginPercent: 48,
      sellingPrice: 420,
      initialStock: 28,
      manufacturedAddedStock: 0,
      unitsSold: 14,
      returnedCancelledUnits: 0,
      allocatedUnits: 0,
      minStockThreshold: 6,
      createdAt: daysAgoIso(12),
      updatedAt: daysAgoIso(2),
    },
  ];

  const ord1Link = buildUpiLink(demoUpi, storeName, 560, 'SM-1041');
  const ord2Link = buildUpiLink(demoUpi, storeName, 1280, 'SM-1042');
  const ord3Link = buildUpiLink(demoUpi, storeName, 1590, 'SM-1043');
  const ord4Link = buildUpiLink(demoUpi, storeName, 420, 'SM-1040');

  const [ord1Qr, ord2Qr, ord3Qr, ord4Qr] = await Promise.all([
    generateUpiQrDataUrl(ord1Link),
    generateUpiQrDataUrl(ord2Link),
    generateUpiQrDataUrl(ord3Link),
    generateUpiQrDataUrl(ord4Link),
  ]);

  const orders: Order[] = [
    {
      id: 'ord_1042',
      orderNumber: 'SM-1042',
      sellerId: demoSellerId,
      customerName: 'Ananya Sharma',
      customerContact: '@ananya.sharma_ig',
      deliveryAddress: '42 Indiranagar 100ft Rd, Bengaluru 560038',
      channel: 'Instagram DM',
      items: [
        {
          productId: prodCandleId,
          productName: 'Sandalwood Amber Soy Candle',
          quantity: 2,
          unitPrice: 640,
          lineTotal: 1280,
        },
      ],
      totalAmount: 1280,
      status: 'Order Placed',
      statusHistory: [
        {
          status: 'Order Placed',
          timestamp: daysAgoIso(0, 3),
          updatedBy: 'ai_agent',
          note: 'Automated order captured via Instagram DM after buyer confirmation.',
        },
      ],
      payment: {
        status: 'Verification Required',
        method: 'UPI',
        expectedAmount: 1280,
        upiId: demoUpi,
        upiLink: ord2Link,
        qrDataUrl: ord2Qr,
        buyerReferenceNote: 'Paid via GPay UTR 631948220194',
        ocrResult: {
          extractedAmount: 1280,
          transactionId: '631948220194',
          payeeUpiOrName: 'earthloom.crafts@okicici',
          payerName: 'Ananya S',
          paymentApp: 'Google Pay',
          timestampText: 'Today, 09:42 AM',
          statusText: 'Completed',
          matchesExpectedAmount: true,
          matchesSellerUpi: true,
          confidenceNotes: 'Amount and UPI ID match order SM-1042. Awaiting seller bank confirmation.',
        },
        submittedAt: daysAgoIso(0, 2),
      },
      customerNotificationsSent: [
        {
          timestamp: daysAgoIso(0, 3),
          message: 'Thank you for placing order SM-1042 (₹1,280). Please complete UPI payment to earthloom.crafts@okicici.',
          channel: 'Instagram DM',
        },
      ],
      createdAt: daysAgoIso(0, 3),
      updatedAt: daysAgoIso(0, 2),
    },
    {
      id: 'ord_1041',
      orderNumber: 'SM-1041',
      sellerId: demoSellerId,
      customerName: 'Rohan Nair',
      customerContact: '+91 98450 22190',
      deliveryAddress: '18 Marine Drive Apartments, Kochi 682031',
      channel: 'WhatsApp Business',
      items: [
        {
          productId: prodKeychainId,
          productName: 'Handmade Macrame Keychains',
          quantity: 2,
          unitPrice: 280,
          lineTotal: 560,
        },
      ],
      totalAmount: 560,
      status: 'Payment Confirmed',
      statusHistory: [
        {
          status: 'Order Placed',
          timestamp: daysAgoIso(1, 5),
          updatedBy: 'ai_agent',
          note: 'Order placed via WhatsApp Business automated flow.',
        },
        {
          status: 'Payment Confirmed',
          timestamp: daysAgoIso(1, 2),
          updatedBy: 'seller',
          note: 'Seller verified ₹560 credit in ICICI statement.',
        },
      ],
      payment: {
        status: 'Payment Confirmed',
        method: 'UPI',
        expectedAmount: 560,
        upiId: demoUpi,
        upiLink: ord1Link,
        qrDataUrl: ord1Qr,
        verifiedAt: daysAgoIso(1, 2),
        verifiedBy: 'Meera Patel',
      },
      customerNotificationsSent: [
        {
          timestamp: daysAgoIso(1, 2),
          message: 'Payment confirmed for order SM-1041. Your Handmade Macrame Keychains are now queued for packing.',
          channel: 'WhatsApp Business',
        },
      ],
      createdAt: daysAgoIso(1, 5),
      updatedAt: daysAgoIso(1, 2),
    },
    {
      id: 'ord_1043',
      orderNumber: 'SM-1043',
      sellerId: demoSellerId,
      customerName: 'Priya Menon',
      customerContact: 'priya.menon@example.com',
      deliveryAddress: '7B Koregaon Park Lane 4, Pune 411001',
      channel: 'Storefront Chat',
      items: [
        {
          productId: prodToteId,
          productName: 'Sage Woven Macrame Tote Bag',
          quantity: 1,
          unitPrice: 1590,
          lineTotal: 1590,
        },
      ],
      totalAmount: 1590,
      status: 'Order Packed',
      statusHistory: [
        {
          status: 'Order Placed',
          timestamp: daysAgoIso(2, 4),
          updatedBy: 'ai_agent',
          note: 'Order confirmed via Storefront Chat.',
        },
        {
          status: 'Payment Confirmed',
          timestamp: daysAgoIso(2, 1),
          updatedBy: 'seller',
          note: 'UPI payment verified.',
        },
        {
          status: 'Order Packed',
          timestamp: daysAgoIso(1, 0),
          updatedBy: 'social_update',
          note: 'Updated via seller social batch update.',
        },
      ],
      payment: {
        status: 'Payment Confirmed',
        method: 'UPI',
        expectedAmount: 1590,
        upiId: demoUpi,
        upiLink: ord3Link,
        qrDataUrl: ord3Qr,
        verifiedAt: daysAgoIso(2, 1),
        verifiedBy: 'Meera Patel',
      },
      customerNotificationsSent: [
        {
          timestamp: daysAgoIso(1, 0),
          message: 'Good news! Your order SM-1043 has been packed and is getting ready for dispatch.',
          channel: 'Storefront Chat',
        },
      ],
      createdAt: daysAgoIso(2, 4),
      updatedAt: daysAgoIso(1, 0),
    },
    {
      id: 'ord_1040',
      orderNumber: 'SM-1040',
      sellerId: demoSellerId,
      customerName: 'Kavya Iyer',
      customerContact: '@kavya.iyer',
      deliveryAddress: '12 Besant Nagar 3rd Ave, Chennai 600090',
      channel: 'Instagram DM',
      items: [
        {
          productId: prodEarringsId,
          productName: 'Terracotta & Sage Clay Earrings',
          quantity: 1,
          unitPrice: 420,
          lineTotal: 420,
        },
      ],
      totalAmount: 420,
      status: 'Order Delivered',
      statusHistory: [
        { status: 'Order Placed', timestamp: daysAgoIso(7), updatedBy: 'ai_agent', note: 'Order placed via Instagram DM.' },
        { status: 'Payment Confirmed', timestamp: daysAgoIso(7), updatedBy: 'seller', note: 'Payment confirmed.' },
        { status: 'Order Dispatched', timestamp: daysAgoIso(5), updatedBy: 'seller', note: 'Shipped via Delhivery.' },
        { status: 'Order Delivered', timestamp: daysAgoIso(3), updatedBy: 'seller', note: 'Marked delivered.' },
      ],
      payment: {
        status: 'Payment Confirmed',
        method: 'UPI',
        expectedAmount: 420,
        upiId: demoUpi,
        upiLink: ord4Link,
        qrDataUrl: ord4Qr,
        verifiedAt: daysAgoIso(7),
        verifiedBy: 'Meera Patel',
      },
      customerNotificationsSent: [],
      createdAt: daysAgoIso(7),
      updatedAt: daysAgoIso(3),
    },
  ];

  const conversations: CustomerConversation[] = [
    {
      id: 'conv_ananya',
      sellerId: demoSellerId,
      customerName: 'Ananya Sharma',
      customerHandle: '@ananya.sharma_ig',
      channel: 'Instagram DM',
      consentGranted: true,
      messages: [
        {
          id: 'msg_1',
          sender: 'buyer',
          text: 'Hi! I would like to order 2 Sandalwood Amber Soy Candles.',
          timestamp: daysAgoIso(0, 3.2),
          intentDetected: 'order',
        },
        {
          id: 'msg_2',
          sender: 'ai',
          text: 'We have Sandalwood Amber Soy Candle in stock (₹640 each). Your total for 2 pieces is ₹1,280. Please confirm your full name and delivery address to register your order.',
          timestamp: daysAgoIso(0, 3.1),
        },
        {
          id: 'msg_3',
          sender: 'buyer',
          text: 'Ananya Sharma, 42 Indiranagar 100ft Rd, Bengaluru 560038. Confirm order!',
          timestamp: daysAgoIso(0, 3),
          intentDetected: 'order_confirmation',
          linkedOrderId: 'ord_1042',
        },
        {
          id: 'msg_4',
          sender: 'ai',
          text: 'Thank you for placing your order SM-1042! Total: ₹1,280. Please pay via UPI to earthloom.crafts@okicici and upload your payment screenshot for verification.',
          timestamp: daysAgoIso(0, 3),
          linkedOrderId: 'ord_1042',
        },
      ],
      lastUpdated: daysAgoIso(0, 2),
    },
    {
      id: 'conv_devika',
      sellerId: demoSellerId,
      customerName: 'Devika Rao',
      customerHandle: '+91 99001 44512',
      channel: 'WhatsApp Business',
      consentGranted: true,
      messages: [
        {
          id: 'msg_5',
          sender: 'buyer',
          text: 'Do you accept bulk corporate gifting orders for 80 macrame keychains with custom name tags by next Friday?',
          timestamp: daysAgoIso(0, 5),
          intentDetected: 'escalate_query',
        },
        {
          id: 'msg_6',
          sender: 'ai',
          text: 'Thank you for reaching out! Custom bulk timelines and custom name-tag pricing require confirmation from our studio owner. I have forwarded your request to our Queries queue and we will reply shortly.',
          timestamp: daysAgoIso(0, 5),
        },
      ],
      lastUpdated: daysAgoIso(0, 5),
    },
  ];

  const queries: CustomerQuery[] = [
    {
      id: 'qry_01',
      sellerId: demoSellerId,
      conversationId: 'conv_devika',
      customerName: 'Devika Rao',
      customerMessage: 'Do you accept bulk corporate gifting orders for 80 macrame keychains with custom name tags by next Friday?',
      relatedProductId: prodKeychainId,
      relatedProductName: 'Handmade Macrame Keychains',
      channel: 'WhatsApp Business',
      escalationReason: 'Custom bulk quantity exceeds current stock (8 remaining) and requires custom turnaround approval.',
      status: 'Unanswered',
      createdAt: daysAgoIso(0, 5),
    },
  ];

  const complaints: Complaint[] = [
    {
      id: 'cmp_01',
      sellerId: demoSellerId,
      orderId: 'ord_1040',
      orderNumber: 'SM-1036',
      customerName: 'Neha Verma',
      productDetails: 'Sandalwood Amber Soy Candle (226g)',
      category: 'Damaged product',
      description: 'Outer glass jar rim arrived chipped despite bubble wrap packaging.',
      status: 'Overdue',
      reminderCount: 2,
      lastReminderAt: daysAgoIso(1),
      createdAt: daysAgoIso(5),
    },
    {
      id: 'cmp_02',
      sellerId: demoSellerId,
      orderNumber: 'SM-1039',
      customerName: 'Vikram Joshi',
      productDetails: 'Sage Woven Macrame Tote Bag',
      category: 'Delayed delivery',
      description: 'Courier tracking has not moved from Mumbai hub for 4 days.',
      status: 'Open',
      reminderCount: 1,
      lastReminderAt: daysAgoIso(0, 6),
      createdAt: daysAgoIso(2),
    },
  ];

  const notifications: SellerNotification[] = [
    {
      id: 'notif_1',
      sellerId: demoSellerId,
      type: 'payment_verification',
      title: 'Payment Verification Required',
      message: 'Ananya Sharma submitted a GPay screenshot (₹1,280, UTR 631948220194) for Order SM-1042.',
      orderNumber: 'SM-1042',
      productName: 'Sandalwood Amber Soy Candle',
      customerName: 'Ananya Sharma',
      requiredAction: 'Verify ₹1,280 credit in bank/UPI app and confirm or reject payment.',
      targetTab: 'payments',
      isRead: false,
      isResolved: false,
      createdAt: daysAgoIso(0, 2),
    },
    {
      id: 'notif_2',
      sellerId: demoSellerId,
      type: 'low_stock',
      title: 'Low Stock Alert: Handmade Macrame Keychains',
      message: 'Remaining available stock is 8 pieces (Initial 50, Sold 40, Reserved 2). Minimum threshold is 10.',
      productName: 'Handmade Macrame Keychains',
      requiredAction: 'Restock units in Restock Management when new batch is ready.',
      targetTab: 'queries-complaints',
      isRead: false,
      isResolved: false,
      createdAt: daysAgoIso(0, 4),
    },
    {
      id: 'notif_3',
      sellerId: demoSellerId,
      type: 'complaint_overdue',
      title: 'Overdue Complaint Resolution (5 days open)',
      message: 'Damaged product complaint from Neha Verma on Order SM-1036 has been pending for 5 days.',
      orderNumber: 'SM-1036',
      productName: 'Sandalwood Amber Soy Candle',
      customerName: 'Neha Verma',
      requiredAction: 'Send replacement or refund update and record resolution details.',
      targetTab: 'queries-complaints',
      isRead: false,
      isResolved: false,
      createdAt: daysAgoIso(0, 1),
    },
    {
      id: 'notif_4',
      sellerId: demoSellerId,
      type: 'query_approval',
      title: 'Escalated Customer Query',
      message: 'Devika Rao asked about 80 custom macrame keychains for next Friday.',
      productName: 'Handmade Macrame Keychains',
      customerName: 'Devika Rao',
      requiredAction: 'Reply to query and optionally save policy to FAQ knowledge base.',
      targetTab: 'queries-complaints',
      isRead: false,
      isResolved: false,
      createdAt: daysAgoIso(0, 5),
    },
  ];

  const approvals: PendingApproval[] = [
    {
      id: 'apr_1',
      sellerId: demoSellerId,
      category: 'payment_verification',
      title: 'Confirm UPI Payment for Order SM-1042 (₹1,280)',
      description: 'Buyer Ananya Sharma uploaded a Google Pay screenshot. OCR extracted ₹1,280 to earthloom.crafts@okicici (UTR 631948220194).',
      aiAssessment: 'Screenshot fields match expected amount and UPI ID, but bank credit confirmation from seller is mandatory before confirming.',
      payload: { orderId: 'ord_1042', orderNumber: 'SM-1042', amount: 1280 },
      status: 'Pending',
      createdAt: daysAgoIso(0, 2),
    },
    {
      id: 'apr_2',
      sellerId: demoSellerId,
      category: 'serious_complaint',
      title: 'Approve Replacement Dispatch for Damaged Candle (SM-1036)',
      description: 'Neha Verma reported a chipped glass rim 5 days ago. Overdue reminder triggered.',
      aiAssessment: 'Recommend approving free replacement dispatch or full ₹640 refund and logging resolution.',
      payload: { complaintId: 'cmp_01', orderNumber: 'SM-1036' },
      status: 'Pending',
      createdAt: daysAgoIso(1),
    },
  ];

  const seller: StoredSellerRecord = {
    id: demoSellerId,
    username: 'meera.earthloom',
    email: 'demo@earthloom.in',
    passwordHash: 'DEMO_SAMPLE_NO_PASSWORD',
    isDemoSample: true,
    role: 'seller',
    storeName,
    storeSlug: 'earthloom-craft-studio',
    businessCategory: 'Handmade Home Decor & Crafts',
    upiId: demoUpi,
    currencySymbol: '₹',
    avatarUrl: '/src/assets/images/seller_avatar_artisan_1795710340594.jpg',
    deliverySla: 'Dispatched within 2 business days; standard delivery takes 4–6 business days across India.',
    cancellationPolicy: 'Orders can be cancelled within 12 hours of placement before packing begins.',
    returnPolicy: 'Damaged or incorrect items are eligible for free replacement or refund within 48 hours of delivery with unboxing photo.',
    paymentMethodsText: 'We accept UPI payments (Google Pay, PhonePe, Paytm, BHIM) via earthloom.crafts@okicici and verified QR code.',
    faqs: [
      {
        id: 'faq_1',
        question: 'How long does delivery take?',
        answer: 'Orders are packed within 48 hours and delivered in 4–6 business days across India.',
        source: 'seller_setup',
        updatedAt: daysAgoIso(14),
      },
      {
        id: 'faq_2',
        question: 'What payment methods do you accept?',
        answer: 'We accept all major UPI apps (GPay, PhonePe, Paytm) via UPI ID earthloom.crafts@okicici or QR scan.',
        source: 'seller_setup',
        updatedAt: daysAgoIso(14),
      },
      {
        id: 'faq_3',
        question: 'Can I cancel my order?',
        answer: 'Yes, you can request cancellation within 12 hours of placing the order, before it is packed.',
        source: 'seller_setup',
        updatedAt: daysAgoIso(14),
      },
    ],
    integrations: [
      {
        platform: 'Instagram Business',
        connected: true,
        handleOrEndpoint: '@earthloom.studio',
        mode: 'Manual Input / Webhook Ready',
        lastSyncedAt: daysAgoIso(0, 2),
      },
      {
        platform: 'WhatsApp Business',
        connected: true,
        handleOrEndpoint: '+91 98200 11420',
        mode: 'Manual Input / Webhook Ready',
        lastSyncedAt: daysAgoIso(0, 5),
      },
      {
        platform: 'Email Notifications',
        connected: true,
        handleOrEndpoint: 'demo@earthloom.in',
        mode: 'API Authorized',
        lastSyncedAt: daysAgoIso(0, 1),
      },
      {
        platform: 'UPI Payment Gateway',
        connected: true,
        handleOrEndpoint: demoUpi,
        mode: 'Manual Input / Webhook Ready',
        lastSyncedAt: daysAgoIso(0, 2),
      },
    ],
    createdAt: daysAgoIso(30),
  };

  const socialPosts: SocialPostBatch[] = [
    {
      id: 'sp_1',
      sellerId: demoSellerId,
      platform: 'Instagram Post',
      postText: 'All orders placed two days ago have been packed and are ready for courier pickup!',
      matchedOrderIds: ['ord_1043'],
      proposedStatus: 'Order Packed',
      ambiguityStatus: 'Clear',
      rationale: 'Matched Order SM-1043 (Priya Menon) placed 2 days ago.',
      applied: true,
      createdAt: daysAgoIso(1),
    },
  ];

  const activityLogs: ActivityLogEntry[] = [
    {
      id: 'act_1',
      sellerId: demoSellerId,
      actor: 'ai_agent',
      action: 'Order Placed & Stock Reserved',
      details: 'Captured Order SM-1042 for 2x Sandalwood Amber Soy Candle from Ananya Sharma via Instagram DM.',
      timestamp: daysAgoIso(0, 3),
    },
    {
      id: 'act_2',
      sellerId: demoSellerId,
      actor: 'ai_agent',
      action: 'OCR Payment Screening',
      details: 'Extracted ₹1,280 and UTR 631948220194 from screenshot for Order SM-1042. Queued for seller verification.',
      timestamp: daysAgoIso(0, 2),
    },
  ];

  return {
    sellers: [seller],
    products,
    orders,
    conversations,
    queries,
    complaints,
    notifications,
    approvals,
    socialPosts,
    activityLogs,
  };
}

let dbCache: DatabaseSchema | null = null;
let initPromise: Promise<DatabaseSchema> | null = null;

export async function getDb(): Promise<DatabaseSchema> {
  if (dbCache) return dbCache;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      dbCache = JSON.parse(raw) as DatabaseSchema;
      return dbCache;
    }
    const seed = await createSeedDatabase();
    dbCache = seed;
    saveDbSync(seed);
    return seed;
  })();

  return initPromise;
}

export function saveDbSync(db: DatabaseSchema): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

export function sanitizeSeller(record: StoredSellerRecord): SellerProfile {
  const { passwordHash: _ph, isDemoSample: _demo, ...safe } = record;
  return safe;
}

export async function getWorkspaceForSeller(sellerId: string): Promise<WorkspaceSnapshot | null> {
  const db = await getDb();
  const seller = db.sellers.find((s) => s.id === sellerId);
  if (!seller) return null;

  // Automatically check overdue complaints (> 3 days open and not resolved)
  const now = Date.now();
  let changed = false;
  for (const complaint of db.complaints) {
    if (
      complaint.sellerId === sellerId &&
      complaint.status !== 'Resolved' &&
      now - new Date(complaint.createdAt).getTime() > 3 * 86400000 &&
      complaint.status !== 'Overdue'
    ) {
      complaint.status = 'Overdue';
      changed = true;
    }
  }
  if (changed) saveDbSync(db);

  return {
    seller: sanitizeSeller(seller),
    products: db.products.filter((p) => p.sellerId === sellerId),
    orders: db.orders
      .filter((o) => o.sellerId === sellerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    conversations: db.conversations
      .filter((c) => c.sellerId === sellerId)
      .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()),
    queries: db.queries
      .filter((q) => q.sellerId === sellerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    complaints: db.complaints
      .filter((c) => c.sellerId === sellerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    notifications: db.notifications
      .filter((n) => n.sellerId === sellerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    approvals: db.approvals
      .filter((a) => a.sellerId === sellerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    socialPosts: db.socialPosts
      .filter((s) => s.sellerId === sellerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    activityLogs: db.activityLogs
      .filter((l) => l.sellerId === sellerId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 60),
  };
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

export function slugifyStoreName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'seller-store'
  );
}

export function addActivityLog(
  db: DatabaseSchema,
  sellerId: string,
  actor: ActivityLogEntry['actor'],
  action: string,
  details: string,
): void {
  db.activityLogs.unshift({
    id: createId('act'),
    sellerId,
    actor,
    action,
    details,
    timestamp: new Date().toISOString(),
  });
}

export function ensureLowStockNotification(db: DatabaseSchema, product: Product): void {
  const remaining = computeAvailableStock(product);
  if (remaining > product.minStockThreshold) return;

  const existingActive = db.notifications.find(
    (n) =>
      n.sellerId === product.sellerId &&
      n.type === 'low_stock' &&
      n.productName === product.name &&
      !n.isResolved,
  );
  if (existingActive) {
    existingActive.message = `Remaining available stock is ${remaining} pieces (Threshold: ${product.minStockThreshold}). Consider restocking this product.`;
    return;
  }

  db.notifications.unshift({
    id: createId('notif'),
    sellerId: product.sellerId,
    type: 'low_stock',
    title: `Low Stock Alert: ${product.name}`,
    message: `Your ${product.name} stock is running low. Only ${remaining} pieces remain (minimum threshold ${product.minStockThreshold}).`,
    productName: product.name,
    requiredAction: 'Review stock and log replenishment once new units are ready.',
    targetTab: 'queries-complaints',
    isRead: false,
    isResolved: false,
    createdAt: new Date().toISOString(),
  });
}

export const ORDER_STATUS_CUSTOMER_MESSAGE: Record<OrderStatus, string> = {
  'Order Placed': 'Thank you for your order! We have reserved your items and await payment verification.',
  'Payment Confirmed': 'Your payment has been confirmed! Your order is moving into preparation.',
  'Order Processing': 'We are currently preparing and crafting your order.',
  'Order Packed': 'Good news! Your order has been packed and is getting ready for dispatch.',
  'Ready to Deliver': 'Your order is packed and scheduled for courier handover.',
  'Order Dispatched': 'Your order has been dispatched. Thank you for shopping with us!',
  'Out for Delivery': 'Your order is out for delivery today. Please keep your phone reachable.',
  'Order Delivered': 'Your order has been delivered! Thank you for supporting our small business.',
  'Order Cancelled': 'Your order has been cancelled as confirmed. Reach out if you need any assistance.',
};
