export type OrderStatus =
  | 'Order Placed'
  | 'Payment Confirmed'
  | 'Order Processing'
  | 'Order Packed'
  | 'Ready to Deliver'
  | 'Order Dispatched'
  | 'Out for Delivery'
  | 'Order Delivered'
  | 'Order Cancelled';

export type PaymentStatus =
  | 'Payment Pending'
  | 'Verification Required'
  | 'Payment Confirmed'
  | 'Payment Failed'
  | 'Payment Rejected';

export type ChannelType = 'Instagram DM' | 'WhatsApp Business' | 'Storefront Chat' | 'Manual Entry';

export interface MaterialItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

export interface Product {
  id: string;
  sellerId: string;
  name: string;
  sku: string;
  category: string;
  description: string;
  imageUrl?: string;
  materials: MaterialItem[];
  labourCost: number;
  packagingCost: number;
  otherExpenses: number;
  desiredMarginPercent: number;
  sellingPrice: number;
  initialStock: number;
  manufacturedAddedStock: number;
  unitsSold: number;
  returnedCancelledUnits: number;
  allocatedUnits: number;
  minStockThreshold: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  timestamp: string;
  updatedBy: 'ai_agent' | 'seller' | 'social_update' | 'system';
  note: string;
}

export interface PaymentOCRResult {
  extractedAmount: number | null;
  transactionId: string | null;
  payeeUpiOrName: string | null;
  payerName: string | null;
  paymentApp: string | null;
  timestampText: string | null;
  statusText: string | null;
  matchesExpectedAmount: boolean;
  matchesSellerUpi: boolean;
  confidenceNotes: string;
}

export interface PaymentRecord {
  status: PaymentStatus;
  method: 'UPI' | 'Payment Gateway' | 'Cash on Delivery';
  expectedAmount: number;
  upiId: string;
  upiLink: string;
  qrDataUrl?: string;
  screenshotDataUrl?: string;
  buyerReferenceNote?: string;
  ocrResult?: PaymentOCRResult;
  submittedAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectionReason?: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  sellerId: string;
  customerName: string;
  customerContact: string;
  deliveryAddress: string;
  channel: ChannelType;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  statusHistory: OrderStatusHistoryEntry[];
  payment: PaymentRecord;
  customerNotificationsSent: Array<{
    timestamp: string;
    message: string;
    channel: ChannelType;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerMessage {
  id: string;
  sender: 'buyer' | 'ai' | 'seller';
  text: string;
  timestamp: string;
  intentDetected?: string;
  linkedOrderId?: string;
}

export interface CustomerConversation {
  id: string;
  sellerId: string;
  customerName: string;
  customerHandle: string;
  channel: ChannelType;
  consentGranted: boolean;
  draftOrderState?: {
    productId?: string;
    productName?: string;
    quantity?: number;
    customerName?: string;
    deliveryAddress?: string;
    customerContact?: string;
    awaitingConfirmation?: boolean;
  };
  messages: CustomerMessage[];
  lastUpdated: string;
}

export interface CustomerQuery {
  id: string;
  sellerId: string;
  conversationId?: string;
  customerName: string;
  customerMessage: string;
  relatedProductId?: string;
  relatedProductName?: string;
  channel: ChannelType;
  escalationReason: string;
  status: 'Unanswered' | 'Answered' | 'Added to FAQ';
  sellerAnswer?: string;
  createdAt: string;
  answeredAt?: string;
}

export type ComplaintCategory =
  | 'Damaged product'
  | 'Parcel not received'
  | 'Delayed delivery'
  | 'Incorrect product'
  | 'Missing items'
  | 'Other';

export interface Complaint {
  id: string;
  sellerId: string;
  orderId?: string;
  orderNumber: string;
  customerName: string;
  productDetails: string;
  category: ComplaintCategory;
  description: string;
  attachmentUrl?: string;
  status: 'Open' | 'In Progress' | 'Overdue' | 'Resolved';
  reminderCount: number;
  lastReminderAt?: string;
  resolutionDetails?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface SellerNotification {
  id: string;
  sellerId: string;
  type:
    | 'new_order'
    | 'payment_verification'
    | 'query_approval'
    | 'new_complaint'
    | 'complaint_pending'
    | 'complaint_overdue'
    | 'low_stock'
    | 'order_update'
    | 'pricing_review';
  title: string;
  message: string;
  orderNumber?: string;
  productName?: string;
  customerName?: string;
  requiredAction: string;
  targetTab: string;
  isRead: boolean;
  isResolved: boolean;
  createdAt: string;
}

export interface PendingApproval {
  id: string;
  sellerId: string;
  category:
    | 'payment_verification'
    | 'ambiguous_order_update'
    | 'refund_cancellation'
    | 'serious_complaint'
    | 'pricing_change'
    | 'stock_adjustment'
    | 'query_escalation';
  title: string;
  description: string;
  aiAssessment: string;
  payload: Record<string, unknown>;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
  decidedAt?: string;
}

export interface FAQEntry {
  id: string;
  question: string;
  answer: string;
  source: 'seller_setup' | 'promoted_query';
  updatedAt: string;
}

export interface ChannelIntegration {
  platform: 'Instagram Business' | 'WhatsApp Business' | 'Email Notifications' | 'UPI Payment Gateway';
  connected: boolean;
  handleOrEndpoint: string;
  mode: 'API Authorized' | 'Manual Input / Webhook Ready';
  lastSyncedAt?: string;
}

export interface SocialPostBatch {
  id: string;
  sellerId: string;
  platform: 'Instagram Post' | 'WhatsApp Broadcast' | 'Store Update';
  postText: string;
  matchedOrderIds: string[];
  proposedStatus: OrderStatus;
  ambiguityStatus: 'Clear' | 'Ambiguous';
  rationale: string;
  applied: boolean;
  createdAt: string;
}

export interface ActivityLogEntry {
  id: string;
  sellerId: string;
  actor: 'seller' | 'ai_agent' | 'buyer' | 'system';
  action: string;
  details: string;
  timestamp: string;
}

export interface SellerProfile {
  id: string;
  username: string;
  email: string;
  role: 'seller' | 'admin';
  storeName: string;
  storeSlug: string;
  businessCategory: string;
  upiId: string;
  currencySymbol: string;
  avatarUrl?: string;
  deliverySla: string;
  cancellationPolicy: string;
  returnPolicy: string;
  paymentMethodsText: string;
  faqs: FAQEntry[];
  integrations: ChannelIntegration[];
  createdAt: string;
}

export interface WorkspaceSnapshot {
  seller: SellerProfile;
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
