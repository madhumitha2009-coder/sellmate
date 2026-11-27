import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  extractPaymentScreenshotOcr,
  parseSocialUpdatePost,
  processCustomerMessage,
} from './server/ai.ts';
import {
  type AuthenticatedRequest,
  hashPassword,
  issueSessionToken,
  requireSellerAuth,
  verifyPassword,
} from './server/auth.ts';
import {
  addActivityLog,
  buildUpiLink,
  computeAvailableStock,
  createId,
  ensureLowStockNotification,
  generateUpiQrDataUrl,
  getDb,
  getWorkspaceForSeller,
  ORDER_STATUS_CUSTOMER_MESSAGE,
  saveDbSync,
  slugifyStoreName,
} from './server/store.ts';
import type {
  ChannelIntegration,
  ChannelType,
  ComplaintCategory,
  CustomerConversation,
  MaterialItem,
  Order,
  OrderStatus,
  Product,
} from './src/types.ts';

const PORT = Number(process.env.DEFAULT_APP_PORT || 3000);

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (process.env.APP_URL && origin === process.env.APP_URL) return true;
  try {
    const parsed = new URL(origin);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname.endsWith('.run.app')
    );
  } catch {
    return false;
  }
}

async function startServer(): Promise<void> {
  await getDb();
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // 1. Authentication & Business Registration
  app.post('/api/auth/register', async (req, res) => {
    try {
      const {
        username,
        email,
        password,
        storeName,
        businessCategory,
        upiId,
        deliverySla,
        cancellationPolicy,
        returnPolicy,
        selectedChannels,
        initialProduct,
      } = req.body as {
        username?: string;
        email?: string;
        password?: string;
        storeName?: string;
        businessCategory?: string;
        upiId?: string;
        deliverySla?: string;
        cancellationPolicy?: string;
        returnPolicy?: string;
        selectedChannels?: string[];
        initialProduct?: {
          name?: string;
          category?: string;
          description?: string;
          materials?: Array<{ name: string; quantity: number; unit: string; unitCost: number }>;
          labourCost?: number;
          packagingCost?: number;
          otherExpenses?: number;
          sellingPrice?: number;
          initialStock?: number;
          minStockThreshold?: number;
        };
      };

      if (!username?.trim() || !email?.trim() || !password || password.length < 6 || !storeName?.trim() || !upiId?.trim()) {
        res.status(400).json({
          error: 'Username, email, password (min 6 chars), store name, and UPI ID are required.',
        });
        return;
      }

      const db = await getDb();
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedUsername = username.trim().toLowerCase();
      const duplicate = db.sellers.find(
        (s) => s.email.toLowerCase() === normalizedEmail || s.username.toLowerCase() === normalizedUsername,
      );
      if (duplicate) {
        res.status(409).json({ error: 'An account with this email or username already exists.' });
        return;
      }

      const sellerId = createId('seller');
      const now = new Date().toISOString();
      const channels = Array.isArray(selectedChannels) ? selectedChannels : [];

      const integrations: ChannelIntegration[] = [
        {
          platform: 'Instagram Business',
          connected: channels.includes('Instagram Business'),
          handleOrEndpoint: channels.includes('Instagram Business') ? `@${slugifyStoreName(storeName)}` : 'Not connected',
          mode: 'Manual Input / Webhook Ready',
        },
        {
          platform: 'WhatsApp Business',
          connected: channels.includes('WhatsApp Business'),
          handleOrEndpoint: channels.includes('WhatsApp Business') ? 'WhatsApp Business API Ready' : 'Not connected',
          mode: 'Manual Input / Webhook Ready',
        },
        {
          platform: 'Email Notifications',
          connected: true,
          handleOrEndpoint: normalizedEmail,
          mode: 'API Authorized',
          lastSyncedAt: now,
        },
        {
          platform: 'UPI Payment Gateway',
          connected: true,
          handleOrEndpoint: upiId.trim(),
          mode: 'Manual Input / Webhook Ready',
          lastSyncedAt: now,
        },
      ];

      db.sellers.push({
        id: sellerId,
        username: username.trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        role: 'seller',
        storeName: storeName.trim(),
        storeSlug: `${slugifyStoreName(storeName)}-${sellerId.slice(-4)}`,
        businessCategory: businessCategory?.trim() || 'Independent Retail',
        upiId: upiId.trim(),
        currencySymbol: '₹',
        deliverySla: deliverySla?.trim() || 'Orders ship within 2 business days; delivery in 4–6 days.',
        cancellationPolicy:
          cancellationPolicy?.trim() || 'Cancellations accepted within 12 hours before packing.',
        returnPolicy:
          returnPolicy?.trim() || 'Free replacement or refund within 48 hours for damaged or wrong items.',
        paymentMethodsText: `UPI payments accepted via ${upiId.trim()} (GPay, PhonePe, Paytm, BHIM).`,
        faqs: [
          {
            id: createId('faq'),
            question: 'What payment methods are accepted?',
            answer: `We accept UPI payments via ${upiId.trim()} and verified QR code.`,
            source: 'seller_setup',
            updatedAt: now,
          },
          {
            id: createId('faq'),
            question: 'How long will delivery take?',
            answer: deliverySla?.trim() || 'Orders ship within 2 business days; delivery in 4–6 days.',
            source: 'seller_setup',
            updatedAt: now,
          },
        ],
        integrations,
        createdAt: now,
      });

      if (initialProduct?.name?.trim()) {
        const materials: MaterialItem[] = (initialProduct.materials || [])
          .filter((m) => m.name.trim())
          .map((m) => ({
            id: createId('mat'),
            name: m.name.trim(),
            quantity: Number(m.quantity || 1),
            unit: m.unit?.trim() || 'unit',
            unitCost: Number(m.unitCost || 0),
          }));

        const matTotal = materials.reduce((sum, m) => sum + m.quantity * m.unitCost, 0);
        const labour = Number(initialProduct.labourCost || 0);
        const packaging = Number(initialProduct.packagingCost || 0);
        const other = Number(initialProduct.otherExpenses || 0);
        const prodCost = matTotal + labour + packaging + other;
        const price = Math.max(1, Number(initialProduct.sellingPrice || Math.ceil(prodCost * 1.4) || 199));

        const newProd: Product = {
          id: createId('prod'),
          sellerId,
          name: initialProduct.name.trim(),
          sku: `${slugifyStoreName(initialProduct.name).slice(0, 4).toUpperCase()}-01`,
          category: initialProduct.category?.trim() || businessCategory?.trim() || 'General',
          description: initialProduct.description?.trim() || `${initialProduct.name.trim()} from ${storeName.trim()}`,
          materials,
          labourCost: labour,
          packagingCost: packaging,
          otherExpenses: other,
          desiredMarginPercent: 40,
          sellingPrice: price,
          initialStock: Math.max(0, Number(initialProduct.initialStock ?? 20)),
          manufacturedAddedStock: 0,
          unitsSold: 0,
          returnedCancelledUnits: 0,
          allocatedUnits: 0,
          minStockThreshold: Math.max(1, Number(initialProduct.minStockThreshold ?? 5)),
          createdAt: now,
          updatedAt: now,
        };
        db.products.push(newProd);
        ensureLowStockNotification(db, newProd);
      }

      db.notifications.unshift({
        id: createId('notif'),
        sellerId,
        type: 'order_update',
        title: `Welcome to SELLMATE, ${storeName.trim()}`,
        message: 'Your isolated business workspace is active. Add products or test automated buyer messages anytime.',
        requiredAction: 'Add products or share your storefront chat to begin automating orders.',
        targetTab: 'products',
        isRead: false,
        isResolved: false,
        createdAt: now,
      });

      addActivityLog(db, sellerId, 'seller', 'Business Workspace Created', `Registered store "${storeName.trim()}" (${upiId.trim()}).`);
      saveDbSync(db);

      const token = issueSessionToken({ sellerId, email: normalizedEmail, role: 'seller' });
      const workspace = await getWorkspaceForSeller(sellerId);
      res.status(201).json({ token, workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Registration failed.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { identifier, password } = req.body as { identifier?: string; password?: string };
      if (!identifier?.trim() || !password) {
        res.status(400).json({ error: 'Email/username and password are required.' });
        return;
      }

      const db = await getDb();
      const needle = identifier.trim().toLowerCase();
      const seller = db.sellers.find(
        (s) => !s.isDemoSample && (s.email.toLowerCase() === needle || s.username.toLowerCase() === needle),
      );
      if (!seller || !verifyPassword(password, seller.passwordHash)) {
        res.status(401).json({ error: 'Invalid credentials. Please check your email/username and password.' });
        return;
      }

      const token = issueSessionToken({ sellerId: seller.id, email: seller.email, role: seller.role });
      const workspace = await getWorkspaceForSeller(seller.id);
      res.json({ token, workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Sign in failed.' });
    }
  });

  app.post('/api/auth/demo', async (_req, res) => {
    try {
      const db = await getDb();
      const demo = db.sellers.find((s) => s.isDemoSample);
      if (!demo) {
        res.status(404).json({ error: 'Sample studio workspace is unavailable.' });
        return;
      }
      const token = issueSessionToken({ sellerId: demo.id, email: demo.email, role: demo.role });
      const workspace = await getWorkspaceForSeller(demo.id);
      res.json({ token, workspace });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Could not open sample workspace.' });
    }
  });

  // 2. Authenticated Workspace & Profile
  app.get('/api/workspace', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const workspace = await getWorkspaceForSeller(req.auth!.sellerId);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }
    res.json(workspace);
  });

  app.put('/api/seller/profile', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const seller = db.sellers.find((s) => s.id === req.auth!.sellerId);
    if (!seller) {
      res.status(404).json({ error: 'Seller not found.' });
      return;
    }

    const {
      storeName,
      businessCategory,
      upiId,
      deliverySla,
      cancellationPolicy,
      returnPolicy,
      paymentMethodsText,
      faqs,
      integrations,
    } = req.body as Partial<typeof seller>;

    if (storeName?.trim()) seller.storeName = storeName.trim();
    if (businessCategory?.trim()) seller.businessCategory = businessCategory.trim();
    if (upiId?.trim()) seller.upiId = upiId.trim();
    if (deliverySla?.trim()) seller.deliverySla = deliverySla.trim();
    if (cancellationPolicy?.trim()) seller.cancellationPolicy = cancellationPolicy.trim();
    if (returnPolicy?.trim()) seller.returnPolicy = returnPolicy.trim();
    if (paymentMethodsText?.trim()) seller.paymentMethodsText = paymentMethodsText.trim();
    if (Array.isArray(faqs)) seller.faqs = faqs;
    if (Array.isArray(integrations)) seller.integrations = integrations;

    addActivityLog(db, seller.id, 'seller', 'Business Profile Updated', 'Updated store knowledge base, policies, or channel settings.');
    saveDbSync(db);
    res.json(await getWorkspaceForSeller(seller.id));
  });

  // 3. Products & Inventory
  app.post('/api/products', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const sellerId = req.auth!.sellerId;
    const body = req.body as Partial<Product>;
    if (!body.name?.trim() || typeof body.sellingPrice !== 'number') {
      res.status(400).json({ error: 'Product name and valid selling price are required.' });
      return;
    }

    const now = new Date().toISOString();
    const product: Product = {
      id: createId('prod'),
      sellerId,
      name: body.name.trim(),
      sku: body.sku?.trim() || `${slugifyStoreName(body.name).slice(0, 4).toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`,
      category: body.category?.trim() || 'General',
      description: body.description?.trim() || '',
      imageUrl: body.imageUrl,
      materials: Array.isArray(body.materials) ? body.materials : [],
      labourCost: Number(body.labourCost || 0),
      packagingCost: Number(body.packagingCost || 0),
      otherExpenses: Number(body.otherExpenses || 0),
      desiredMarginPercent: Number(body.desiredMarginPercent || 40),
      sellingPrice: Number(body.sellingPrice),
      initialStock: Math.max(0, Number(body.initialStock || 0)),
      manufacturedAddedStock: 0,
      unitsSold: 0,
      returnedCancelledUnits: 0,
      allocatedUnits: 0,
      minStockThreshold: Math.max(1, Number(body.minStockThreshold || 5)),
      createdAt: now,
      updatedAt: now,
    };

    db.products.push(product);
    ensureLowStockNotification(db, product);
    addActivityLog(db, sellerId, 'seller', 'Product Added', `Added "${product.name}" at ₹${product.sellingPrice} with ${product.initialStock} units.`);
    saveDbSync(db);
    res.status(201).json(await getWorkspaceForSeller(sellerId));
  });

  app.put('/api/products/:id', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const sellerId = req.auth!.sellerId;
    const product = db.products.find((p) => p.id === req.params.id && p.sellerId === sellerId);
    if (!product) {
      res.status(404).json({ error: 'Product not found in your workspace.' });
      return;
    }

    const body = req.body as Partial<Product>;
    const previousPrice = product.sellingPrice;
    if (body.name?.trim()) product.name = body.name.trim();
    if (body.category?.trim()) product.category = body.category.trim();
    if (typeof body.description === 'string') product.description = body.description.trim();
    if (Array.isArray(body.materials)) product.materials = body.materials;
    if (typeof body.labourCost === 'number') product.labourCost = body.labourCost;
    if (typeof body.packagingCost === 'number') product.packagingCost = body.packagingCost;
    if (typeof body.otherExpenses === 'number') product.otherExpenses = body.otherExpenses;
    if (typeof body.desiredMarginPercent === 'number') product.desiredMarginPercent = body.desiredMarginPercent;
    if (typeof body.sellingPrice === 'number') product.sellingPrice = body.sellingPrice;
    if (typeof body.minStockThreshold === 'number') product.minStockThreshold = Math.max(1, body.minStockThreshold);
    product.updatedAt = new Date().toISOString();

    if (previousPrice !== product.sellingPrice) {
      addActivityLog(
        db,
        sellerId,
        'seller',
        'Product Price Updated',
        `Updated "${product.name}" price from ₹${previousPrice} to ₹${product.sellingPrice}.`,
      );
    }
    ensureLowStockNotification(db, product);
    saveDbSync(db);
    res.json(await getWorkspaceForSeller(sellerId));
  });

  app.post('/api/products/:id/restock', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const sellerId = req.auth!.sellerId;
    const product = db.products.find((p) => p.id === req.params.id && p.sellerId === sellerId);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const { addedQuantity, note } = req.body as { addedQuantity?: number; note?: string };
    const qty = Number(addedQuantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      res.status(400).json({ error: 'Restock quantity must be greater than zero.' });
      return;
    }

    product.manufacturedAddedStock += Math.round(qty);
    product.updatedAt = new Date().toISOString();

    const newRemaining = computeAvailableStock(product);
    for (const n of db.notifications) {
      if (
        n.sellerId === sellerId &&
        n.type === 'low_stock' &&
        n.productName === product.name &&
        !n.isResolved &&
        newRemaining > product.minStockThreshold
      ) {
        n.isResolved = true;
        n.isRead = true;
      }
    }

    addActivityLog(
      db,
      sellerId,
      'seller',
      'Inventory Restocked',
      `Added ${Math.round(qty)} units to "${product.name}". Available stock is now ${newRemaining}. ${note || ''}`.trim(),
    );
    saveDbSync(db);
    res.json(await getWorkspaceForSeller(sellerId));
  });

  // 4. Orders, Payments & OCR Verification
  async function createOrderRecord(params: {
    sellerId: string;
    productId: string;
    quantity: number;
    customerName: string;
    customerContact: string;
    deliveryAddress: string;
    channel: ChannelType;
    createdBy: 'ai_agent' | 'seller';
  }): Promise<Order> {
    const db = await getDb();
    const seller = db.sellers.find((s) => s.id === params.sellerId)!;
    const product = db.products.find((p) => p.id === params.productId && p.sellerId === params.sellerId);
    if (!product) throw new Error('Product not found.');

    const available = computeAvailableStock(product);
    if (params.quantity <= 0 || params.quantity > available) {
      throw new Error(`Insufficient stock for ${product.name}. Only ${available} available.`);
    }

    const now = new Date().toISOString();
    const orderNumber = `SM-${1044 + db.orders.filter((o) => o.sellerId === params.sellerId).length}`;
    const totalAmount = Number((product.sellingPrice * params.quantity).toFixed(2));
    const upiLink = buildUpiLink(seller.upiId, seller.storeName, totalAmount, orderNumber);
    const qrDataUrl = await generateUpiQrDataUrl(upiLink);

    product.allocatedUnits += params.quantity;
    product.updatedAt = now;

    const order: Order = {
      id: createId('ord'),
      orderNumber,
      sellerId: params.sellerId,
      customerName: params.customerName.trim(),
      customerContact: params.customerContact.trim() || 'Direct Buyer',
      deliveryAddress: params.deliveryAddress.trim(),
      channel: params.channel,
      items: [
        {
          productId: product.id,
          productName: product.name,
          quantity: params.quantity,
          unitPrice: product.sellingPrice,
          lineTotal: totalAmount,
        },
      ],
      totalAmount,
      status: 'Order Placed',
      statusHistory: [
        {
          status: 'Order Placed',
          timestamp: now,
          updatedBy: params.createdBy,
          note: `Order created via ${params.channel}. ${params.quantity} unit(s) reserved in inventory.`,
        },
      ],
      payment: {
        status: 'Payment Pending',
        method: 'UPI',
        expectedAmount: totalAmount,
        upiId: seller.upiId,
        upiLink,
        qrDataUrl,
      },
      customerNotificationsSent: [
        {
          timestamp: now,
          message: `Order ${orderNumber} registered (₹${totalAmount}). Complete UPI payment to ${seller.upiId}.`,
          channel: params.channel,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    db.orders.unshift(order);
    db.notifications.unshift({
      id: createId('notif'),
      sellerId: params.sellerId,
      type: 'new_order',
      title: `New Order ${orderNumber} from ${order.customerName}`,
      message: `${params.quantity}x ${product.name} (₹${totalAmount}) via ${params.channel}. Stock reserved.`,
      orderNumber,
      productName: product.name,
      customerName: order.customerName,
      requiredAction: 'Monitor incoming UPI payment confirmation.',
      targetTab: 'orders',
      isRead: false,
      isResolved: false,
      createdAt: now,
    });

    ensureLowStockNotification(db, product);
    addActivityLog(
      db,
      params.sellerId,
      params.createdBy,
      'Order Placed & Stock Reserved',
      `Created ${orderNumber} (${params.quantity}x ${product.name}, ₹${totalAmount}) for ${order.customerName}.`,
    );
    saveDbSync(db);
    return order;
  }

  app.post('/api/orders', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { productId, quantity, customerName, customerContact, deliveryAddress, channel } = req.body as {
        productId?: string;
        quantity?: number;
        customerName?: string;
        customerContact?: string;
        deliveryAddress?: string;
        channel?: ChannelType;
      };
      if (!productId || !quantity || !customerName?.trim() || !deliveryAddress?.trim()) {
        res.status(400).json({ error: 'Product, quantity, customer name, and delivery address are required.' });
        return;
      }
      await createOrderRecord({
        sellerId: req.auth!.sellerId,
        productId,
        quantity: Number(quantity),
        customerName,
        customerContact: customerContact || 'Manual Entry',
        deliveryAddress,
        channel: channel || 'Manual Entry',
        createdBy: 'seller',
      });
      res.status(201).json(await getWorkspaceForSeller(req.auth!.sellerId));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Order creation failed.' });
    }
  });

  app.patch('/api/orders/:id/status', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const sellerId = req.auth!.sellerId;
    const order = db.orders.find((o) => o.id === req.params.id && o.sellerId === sellerId);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const { status, note } = req.body as { status?: OrderStatus; note?: string };
    if (!status) {
      res.status(400).json({ error: 'Target status is required.' });
      return;
    }

    const prevStatus = order.status;
    if (prevStatus === status) {
      res.json(await getWorkspaceForSeller(sellerId));
      return;
    }

    const now = new Date().toISOString();
    order.status = status;
    order.updatedAt = now;
    order.statusHistory.push({
      status,
      timestamp: now,
      updatedBy: 'seller',
      note: note?.trim() || `Status updated to ${status}.`,
    });

    // Inventory transition when delivered or cancelled
    if (status === 'Order Delivered' && prevStatus !== 'Order Delivered') {
      for (const item of order.items) {
        const prod = db.products.find((p) => p.id === item.productId && p.sellerId === sellerId);
        if (prod) {
          prod.allocatedUnits = Math.max(0, prod.allocatedUnits - item.quantity);
          prod.unitsSold += item.quantity;
          prod.updatedAt = now;
          ensureLowStockNotification(db, prod);
        }
      }
    } else if (status === 'Order Cancelled' && prevStatus !== 'Order Cancelled') {
      for (const item of order.items) {
        const prod = db.products.find((p) => p.id === item.productId && p.sellerId === sellerId);
        if (prod) {
          if (prevStatus === 'Order Delivered') {
            prod.returnedCancelledUnits += item.quantity;
          } else {
            prod.allocatedUnits = Math.max(0, prod.allocatedUnits - item.quantity);
          }
          prod.updatedAt = now;
        }
      }
    }

    const autoMsg = ORDER_STATUS_CUSTOMER_MESSAGE[status];
    order.customerNotificationsSent.push({
      timestamp: now,
      message: `${autoMsg} (Order ${order.orderNumber})`,
      channel: order.channel,
    });

    addActivityLog(db, sellerId, 'seller', 'Order Status Updated', `${order.orderNumber}: ${prevStatus} -> ${status}.`);
    saveDbSync(db);
    res.json(await getWorkspaceForSeller(sellerId));
  });

  app.post('/api/orders/:id/payment-ocr', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const db = await getDb();
      const sellerId = req.auth!.sellerId;
      const seller = db.sellers.find((s) => s.id === sellerId)!;
      const order = db.orders.find((o) => o.id === req.params.id && o.sellerId === sellerId);
      if (!order) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }

      const { screenshotDataUrl, buyerReferenceNote } = req.body as {
        screenshotDataUrl?: string;
        buyerReferenceNote?: string;
      };
      if (!screenshotDataUrl) {
        res.status(400).json({ error: 'Payment screenshot image is required.' });
        return;
      }

      const ocrResult = await extractPaymentScreenshotOcr({
        imageDataUrl: screenshotDataUrl,
        expectedAmount: order.totalAmount,
        sellerUpiId: seller.upiId,
        currencySymbol: seller.currencySymbol,
      });

      const now = new Date().toISOString();
      order.payment.screenshotDataUrl = screenshotDataUrl;
      order.payment.buyerReferenceNote = buyerReferenceNote?.trim() || order.payment.buyerReferenceNote;
      order.payment.ocrResult = ocrResult;
      order.payment.submittedAt = now;
      // CRITICAL: Never auto-confirm payment from screenshot alone!
      order.payment.status = 'Verification Required';
      order.updatedAt = now;

      db.approvals.unshift({
        id: createId('apr'),
        sellerId,
        category: 'payment_verification',
        title: `Verify UPI Payment for ${order.orderNumber} (₹${order.totalAmount})`,
        description: `OCR extracted Amount: ${ocrResult.extractedAmount !== null ? `₹${ocrResult.extractedAmount}` : 'Not legible'}, UTR: ${ocrResult.transactionId || 'Not found'}, Payee: ${ocrResult.payeeUpiOrName || 'Unknown'}.`,
        aiAssessment: ocrResult.confidenceNotes,
        payload: { orderId: order.id, orderNumber: order.orderNumber },
        status: 'Pending',
        createdAt: now,
      });

      db.notifications.unshift({
        id: createId('notif'),
        sellerId,
        type: 'payment_verification',
        title: `Payment Verification Required (${order.orderNumber})`,
        message: `Screenshot submitted for ${order.customerName}. Extracted ${ocrResult.extractedAmount !== null ? `₹${ocrResult.extractedAmount}` : 'unreadable amount'}. Seller verification required.`,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        requiredAction: 'Check your UPI/bank statement and Confirm or Reject payment.',
        targetTab: 'payments',
        isRead: false,
        isResolved: false,
        createdAt: now,
      });

      addActivityLog(
        db,
        sellerId,
        'ai_agent',
        'Payment OCR Screened',
        `Screened screenshot for ${order.orderNumber}. Marked "Verification Required" pending seller confirmation.`,
      );
      saveDbSync(db);
      res.json(await getWorkspaceForSeller(sellerId));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'OCR verification failed.' });
    }
  });

  app.post('/api/orders/:id/payment-decision', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const sellerId = req.auth!.sellerId;
    const seller = db.sellers.find((s) => s.id === sellerId)!;
    const order = db.orders.find((o) => o.id === req.params.id && o.sellerId === sellerId);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const { decision, reason } = req.body as {
      decision?: 'confirm' | 'reject' | 'fail';
      reason?: string;
    };
    const now = new Date().toISOString();

    if (decision === 'confirm') {
      order.payment.status = 'Payment Confirmed';
      order.payment.verifiedAt = now;
      order.payment.verifiedBy = seller.username;
      if (order.status === 'Order Placed') {
        order.status = 'Payment Confirmed';
        order.statusHistory.push({
          status: 'Payment Confirmed',
          timestamp: now,
          updatedBy: 'seller',
          note: 'Seller confirmed payment credit in bank/UPI statement.',
        });
      }
      order.customerNotificationsSent.push({
        timestamp: now,
        message: `Payment confirmed for order ${order.orderNumber} (₹${order.totalAmount}). Thank you!`,
        channel: order.channel,
      });
      addActivityLog(db, sellerId, 'seller', 'Payment Confirmed', `Confirmed payment for ${order.orderNumber} (₹${order.totalAmount}).`);
    } else {
      order.payment.status = decision === 'fail' ? 'Payment Failed' : 'Payment Rejected';
      order.payment.rejectionReason = reason?.trim() || 'Transaction not matched in seller bank statement.';
      order.customerNotificationsSent.push({
        timestamp: now,
        message: `We could not verify your payment for ${order.orderNumber}: ${order.payment.rejectionReason}. Please re-check and share a valid UTR.`,
        channel: order.channel,
      });
      addActivityLog(
        db,
        sellerId,
        'seller',
        order.payment.status,
        `Marked ${order.orderNumber} as ${order.payment.status}: ${order.payment.rejectionReason}`,
      );
    }

    for (const apr of db.approvals) {
      if (
        apr.sellerId === sellerId &&
        apr.category === 'payment_verification' &&
        apr.status === 'Pending' &&
        apr.payload.orderId === order.id
      ) {
        apr.status = decision === 'confirm' ? 'Approved' : 'Rejected';
        apr.decidedAt = now;
      }
    }
    for (const notif of db.notifications) {
      if (notif.sellerId === sellerId && notif.type === 'payment_verification' && notif.orderNumber === order.orderNumber) {
        notif.isRead = true;
        notif.isResolved = true;
      }
    }

    order.updatedAt = now;
    saveDbSync(db);
    res.json(await getWorkspaceForSeller(sellerId));
  });

  // 5. Automated Customer Conversations & AI Replies
  app.post('/api/conversations/new', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const db = await getDb();
      const sellerId = req.auth!.sellerId;
      const { customerName, customerHandle, channel, initialMessage } = req.body as {
        customerName?: string;
        customerHandle?: string;
        channel?: ChannelType;
        initialMessage?: string;
      };
      if (!customerName?.trim() || !initialMessage?.trim()) {
        res.status(400).json({ error: 'Customer name and message are required.' });
        return;
      }

      const now = new Date().toISOString();
      const conv: CustomerConversation = {
        id: createId('conv'),
        sellerId,
        customerName: customerName.trim(),
        customerHandle: customerHandle?.trim() || customerName.trim(),
        channel: channel || 'Instagram DM',
        consentGranted: true,
        messages: [],
        lastUpdated: now,
      };
      db.conversations.unshift(conv);
      saveDbSync(db);

      const updated = await handleIncomingCustomerMessage(sellerId, conv.id, initialMessage.trim());
      res.status(201).json(updated);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start conversation.' });
    }
  });

  app.post('/api/conversations/:id/message', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { text, sender } = req.body as { text?: string; sender?: 'buyer' | 'seller' };
      if (!text?.trim()) {
        res.status(400).json({ error: 'Message text is required.' });
        return;
      }

      const db = await getDb();
      const sellerId = req.auth!.sellerId;
      const conv = db.conversations.find((c) => c.id === req.params.id && c.sellerId === sellerId);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found.' });
        return;
      }

      if (sender === 'seller') {
        conv.messages.push({
          id: createId('msg'),
          sender: 'seller',
          text: text.trim(),
          timestamp: new Date().toISOString(),
        });
        conv.lastUpdated = new Date().toISOString();
        addActivityLog(db, sellerId, 'seller', 'Manual Customer Reply', `Sent direct reply to ${conv.customerName}.`);
        saveDbSync(db);
        res.json(await getWorkspaceForSeller(sellerId));
        return;
      }

      const workspace = await handleIncomingCustomerMessage(sellerId, conv.id, text.trim());
      res.json(workspace);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'AI customer reply failed.' });
    }
  });

  async function handleIncomingCustomerMessage(sellerId: string, conversationId: string, text: string) {
    const db = await getDb();
    const seller = db.sellers.find((s) => s.id === sellerId)!;
    const conv = db.conversations.find((c) => c.id === conversationId && c.sellerId === sellerId)!;
    const sellerProducts = db.products.filter((p) => p.sellerId === sellerId);
    const sellerOrders = db.orders.filter((o) => o.sellerId === sellerId);

    const buyerMsgTime = new Date().toISOString();
    const decision = await processCustomerMessage({
      seller,
      products: sellerProducts,
      orders: sellerOrders,
      conversation: conv,
      incomingText: text,
    });

    conv.messages.push({
      id: createId('msg'),
      sender: 'buyer',
      text,
      timestamp: buyerMsgTime,
      intentDetected: decision.intent,
    });

    // Merge extracted draft order fields
    const draft = conv.draftOrderState || {};
    if (decision.extractedProductId) {
      const matched = sellerProducts.find((p) => p.id === decision.extractedProductId);
      if (matched) {
        draft.productId = matched.id;
        draft.productName = matched.name;
      }
    }
    if (decision.extractedQuantity && decision.extractedQuantity > 0) {
      draft.quantity = Math.round(decision.extractedQuantity);
    }
    if (decision.extractedCustomerName) draft.customerName = decision.extractedCustomerName;
    if (decision.extractedCustomerContact) draft.customerContact = decision.extractedCustomerContact;
    if (decision.extractedDeliveryAddress) draft.deliveryAddress = decision.extractedDeliveryAddress;
    if (typeof decision.awaitingConfirmation === 'boolean') {
      draft.awaitingConfirmation = decision.awaitingConfirmation;
    }
    conv.draftOrderState = draft;

    let aiFinalReply = decision.replyText;
    let linkedOrderId: string | undefined;

    if (decision.shouldCreateOrder && draft.productId && draft.quantity && draft.deliveryAddress) {
      try {
        const createdOrder = await createOrderRecord({
          sellerId,
          productId: draft.productId,
          quantity: draft.quantity,
          customerName: draft.customerName || conv.customerName,
          customerContact: draft.customerContact || conv.customerHandle,
          deliveryAddress: draft.deliveryAddress,
          channel: conv.channel,
          createdBy: 'ai_agent',
        });
        linkedOrderId = createdOrder.id;
        conv.draftOrderState = undefined;
        aiFinalReply = `Thank you for placing your order! Order ${createdOrder.orderNumber} has been registered for ${createdOrder.items[0].quantity}x ${createdOrder.items[0].productName} (Total: ₹${createdOrder.totalAmount}). Please pay via UPI to ${seller.upiId} and share your payment screenshot for verification.`;
      } catch (orderErr) {
        aiFinalReply = orderErr instanceof Error ? orderErr.message : 'Unable to register order due to stock constraint.';
      }
    } else if (decision.intent === 'escalate_query') {
      const prod = draft.productId ? sellerProducts.find((p) => p.id === draft.productId) : undefined;
      const qryId = createId('qry');
      db.queries.unshift({
        id: qryId,
        sellerId,
        conversationId: conv.id,
        customerName: conv.customerName,
        customerMessage: text,
        relatedProductId: prod?.id,
        relatedProductName: prod?.name,
        channel: conv.channel,
        escalationReason: decision.escalationReason || 'Requires seller information or policy approval.',
        status: 'Unanswered',
        createdAt: new Date().toISOString(),
      });
      db.notifications.unshift({
        id: createId('notif'),
        sellerId,
        type: 'query_approval',
        title: `Query Escalated from ${conv.customerName}`,
        message: text,
        productName: prod?.name,
        customerName: conv.customerName,
        requiredAction: 'Review and answer in Queries & Complaints.',
        targetTab: 'queries-complaints',
        isRead: false,
        isResolved: false,
        createdAt: new Date().toISOString(),
      });
      db.approvals.unshift({
        id: createId('apr'),
        sellerId,
        category: 'query_escalation',
        title: `Answer Customer Query from ${conv.customerName}`,
        description: text,
        aiAssessment: decision.escalationReason || 'Outside current seller knowledge base.',
        payload: { queryId: qryId },
        status: 'Pending',
        createdAt: new Date().toISOString(),
      });
    } else if (decision.intent === 'complaint' && decision.complaintDetails) {
      const cmpId = createId('cmp');
      const now = new Date().toISOString();
      db.complaints.unshift({
        id: cmpId,
        sellerId,
        orderNumber: decision.complaintDetails.orderNumber || 'Pending Lookup',
        customerName: conv.customerName,
        productDetails: decision.complaintDetails.productDetails || draft.productName || 'Order Item',
        category: (decision.complaintDetails.category as ComplaintCategory) || 'Other',
        description: decision.complaintDetails.description,
        status: 'Open',
        reminderCount: 0,
        createdAt: now,
      });
      db.notifications.unshift({
        id: createId('notif'),
        sellerId,
        type: 'new_complaint',
        title: `New Customer Complaint (${decision.complaintDetails.category})`,
        message: `${conv.customerName}: ${decision.complaintDetails.description}`,
        orderNumber: decision.complaintDetails.orderNumber,
        customerName: conv.customerName,
        requiredAction: 'Investigate and resolve complaint with customer.',
        targetTab: 'queries-complaints',
        isRead: false,
        isResolved: false,
        createdAt: now,
      });
    }

    conv.messages.push({
      id: createId('msg'),
      sender: 'ai',
      text: aiFinalReply,
      timestamp: new Date().toISOString(),
      intentDetected: decision.intent,
      linkedOrderId,
    });
    conv.lastUpdated = new Date().toISOString();
    saveDbSync(db);
    return getWorkspaceForSeller(sellerId);
  }

  // 6. Queries & Complaints
  app.post('/api/queries/:id/answer', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const sellerId = req.auth!.sellerId;
    const seller = db.sellers.find((s) => s.id === sellerId)!;
    const query = db.queries.find((q) => q.id === req.params.id && q.sellerId === sellerId);
    if (!query) {
      res.status(404).json({ error: 'Query not found.' });
      return;
    }

    const { answer, addToFaq } = req.body as { answer?: string; addToFaq?: boolean };
    if (!answer?.trim()) {
      res.status(400).json({ error: 'Answer text is required.' });
      return;
    }

    const now = new Date().toISOString();
    query.sellerAnswer = answer.trim();
    query.status = addToFaq ? 'Added to FAQ' : 'Answered';
    query.answeredAt = now;

    if (addToFaq) {
      seller.faqs.unshift({
        id: createId('faq'),
        question: query.customerMessage,
        answer: answer.trim(),
        source: 'promoted_query',
        updatedAt: now,
      });
    }

    if (query.conversationId) {
      const conv = db.conversations.find((c) => c.id === query.conversationId && c.sellerId === sellerId);
      if (conv) {
        conv.messages.push({
          id: createId('msg'),
          sender: 'seller',
          text: answer.trim(),
          timestamp: now,
        });
        conv.lastUpdated = now;
      }
    }

    for (const apr of db.approvals) {
      if (apr.sellerId === sellerId && apr.payload.queryId === query.id && apr.status === 'Pending') {
        apr.status = 'Approved';
        apr.decidedAt = now;
      }
    }
    for (const n of db.notifications) {
      if (n.sellerId === sellerId && n.type === 'query_approval' && n.customerName === query.customerName) {
        n.isRead = true;
        n.isResolved = true;
      }
    }

    addActivityLog(
      db,
      sellerId,
      'seller',
      addToFaq ? 'Query Answered & Added to FAQ' : 'Query Answered',
      `Answered query from ${query.customerName}.`,
    );
    saveDbSync(db);
    res.json(await getWorkspaceForSeller(sellerId));
  });

  app.post('/api/complaints', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const sellerId = req.auth!.sellerId;
    const { orderNumber, customerName, productDetails, category, description, attachmentUrl } = req.body as {
      orderNumber?: string;
      customerName?: string;
      productDetails?: string;
      category?: ComplaintCategory;
      description?: string;
      attachmentUrl?: string;
    };
    if (!customerName?.trim() || !description?.trim()) {
      res.status(400).json({ error: 'Customer name and complaint description are required.' });
      return;
    }

    const now = new Date().toISOString();
    const complaint = {
      id: createId('cmp'),
      sellerId,
      orderNumber: orderNumber?.trim() || 'General',
      customerName: customerName.trim(),
      productDetails: productDetails?.trim() || 'Store Product',
      category: category || 'Other',
      description: description.trim(),
      attachmentUrl,
      status: 'Open' as const,
      reminderCount: 0,
      createdAt: now,
    };
    db.complaints.unshift(complaint);
    db.notifications.unshift({
      id: createId('notif'),
      sellerId,
      type: 'new_complaint',
      title: `Complaint Registered (${complaint.category})`,
      message: `${complaint.customerName} (${complaint.orderNumber}): ${complaint.description}`,
      orderNumber: complaint.orderNumber,
      customerName: complaint.customerName,
      requiredAction: 'Track and resolve complaint.',
      targetTab: 'queries-complaints',
      isRead: false,
      isResolved: false,
      createdAt: now,
    });

    addActivityLog(db, sellerId, 'seller', 'Complaint Registered', `Registered ${complaint.category} for ${complaint.orderNumber}.`);
    saveDbSync(db);
    res.status(201).json(await getWorkspaceForSeller(sellerId));
  });

  app.post('/api/complaints/:id/remind', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const sellerId = req.auth!.sellerId;
    const complaint = db.complaints.find((c) => c.id === req.params.id && c.sellerId === sellerId);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const now = new Date().toISOString();
    complaint.reminderCount += 1;
    complaint.lastReminderAt = now;
    if (complaint.status === 'Open') complaint.status = 'In Progress';

    db.notifications.unshift({
      id: createId('notif'),
      sellerId,
      type: 'complaint_pending',
      title: `Pending Complaint Reminder: ${complaint.orderNumber}`,
      message: `${complaint.category} from ${complaint.customerName} is still unresolved.`,
      orderNumber: complaint.orderNumber,
      customerName: complaint.customerName,
      requiredAction: 'Record resolution details and mark resolved once settled.',
      targetTab: 'queries-complaints',
      isRead: false,
      isResolved: false,
      createdAt: now,
    });

    saveDbSync(db);
    res.json(await getWorkspaceForSeller(sellerId));
  });

  app.post('/api/complaints/:id/resolve', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const sellerId = req.auth!.sellerId;
    const complaint = db.complaints.find((c) => c.id === req.params.id && c.sellerId === sellerId);
    if (!complaint) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }

    const { resolutionDetails } = req.body as { resolutionDetails?: string };
    if (!resolutionDetails?.trim()) {
      res.status(400).json({ error: 'Resolution details are required before marking resolved.' });
      return;
    }

    const now = new Date().toISOString();
    complaint.status = 'Resolved';
    complaint.resolutionDetails = resolutionDetails.trim();
    complaint.resolvedAt = now;

    for (const apr of db.approvals) {
      if (apr.sellerId === sellerId && apr.payload.complaintId === complaint.id && apr.status === 'Pending') {
        apr.status = 'Approved';
        apr.decidedAt = now;
      }
    }
    for (const n of db.notifications) {
      if (
        n.sellerId === sellerId &&
        (n.type === 'new_complaint' || n.type === 'complaint_pending' || n.type === 'complaint_overdue') &&
        n.orderNumber === complaint.orderNumber
      ) {
        n.isRead = true;
        n.isResolved = true;
      }
    }

    addActivityLog(db, sellerId, 'seller', 'Complaint Resolved', `Resolved ${complaint.orderNumber}: ${resolutionDetails.trim()}`);
    saveDbSync(db);
    res.json(await getWorkspaceForSeller(sellerId));
  });

  // 7. Social Media / Business Post Order Status Automation
  app.post('/api/ai/social-update', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const db = await getDb();
      const sellerId = req.auth!.sellerId;
      const { postText, platform } = req.body as {
        postText?: string;
        platform?: 'Instagram Post' | 'WhatsApp Broadcast' | 'Store Update';
      };
      if (!postText?.trim()) {
        res.status(400).json({ error: 'Update post text is required.' });
        return;
      }

      const sellerOrders = db.orders.filter((o) => o.sellerId === sellerId && o.status !== 'Order Cancelled');
      const parsed = await parseSocialUpdatePost({ postText: postText.trim(), orders: sellerOrders });

      const now = new Date().toISOString();
      const batchId = createId('sp');
      const batch = {
        id: batchId,
        sellerId,
        platform: platform || 'Instagram Post',
        postText: postText.trim(),
        matchedOrderIds: parsed.matchedOrderIds,
        proposedStatus: parsed.proposedStatus,
        ambiguityStatus: parsed.ambiguityStatus,
        rationale: parsed.rationale,
        applied: false,
        createdAt: now,
      };
      db.socialPosts.unshift(batch);

      if (parsed.ambiguityStatus === 'Ambiguous') {
        db.approvals.unshift({
          id: createId('apr'),
          sellerId,
          category: 'ambiguous_order_update',
          title: `Confirm Ambiguous Social Update (${batch.platform})`,
          description: `"${postText.trim()}" — AI held automatic status updates to avoid updating unrelated orders.`,
          aiAssessment: parsed.rationale,
          payload: { batchId, proposedStatus: parsed.proposedStatus, matchedOrderIds: parsed.matchedOrderIds },
          status: 'Pending',
          createdAt: now,
        });
        db.notifications.unshift({
          id: createId('notif'),
          sellerId,
          type: 'order_update',
          title: 'Ambiguous Order Update Needs Confirmation',
          message: `Your post "${postText.trim()}" was ambiguous. Please select or confirm affected orders before notifying customers.`,
          requiredAction: 'Review and approve affected orders in Pending Approvals.',
          targetTab: 'approvals',
          isRead: false,
          isResolved: false,
          createdAt: now,
        });
      }

      saveDbSync(db);
      res.json({ batch, customerMessageTemplate: parsed.customerMessageTemplate, workspace: await getWorkspaceForSeller(sellerId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Social update parsing failed.' });
    }
  });

  app.post('/api/social-update/:id/apply', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const sellerId = req.auth!.sellerId;
    const batch = db.socialPosts.find((b) => b.id === req.params.id && b.sellerId === sellerId);
    if (!batch) {
      res.status(404).json({ error: 'Social update batch not found.' });
      return;
    }

    const { orderIds, status } = req.body as { orderIds?: string[]; status?: OrderStatus };
    const targetIds = Array.isArray(orderIds) && orderIds.length > 0 ? orderIds : batch.matchedOrderIds;
    const targetStatus = status || batch.proposedStatus;
    const now = new Date().toISOString();

    for (const orderId of targetIds) {
      const order = db.orders.find((o) => o.id === orderId && o.sellerId === sellerId);
      if (order && order.status !== targetStatus) {
        const prev = order.status;
        order.status = targetStatus;
        order.updatedAt = now;
        order.statusHistory.push({
          status: targetStatus,
          timestamp: now,
          updatedBy: 'social_update',
          note: `Updated via ${batch.platform}: "${batch.postText}"`,
        });
        if (targetStatus === 'Order Delivered' && prev !== 'Order Delivered') {
          for (const item of order.items) {
            const prod = db.products.find((p) => p.id === item.productId && p.sellerId === sellerId);
            if (prod) {
              prod.allocatedUnits = Math.max(0, prod.allocatedUnits - item.quantity);
              prod.unitsSold += item.quantity;
            }
          }
        }
        order.customerNotificationsSent.push({
          timestamp: now,
          message: `${ORDER_STATUS_CUSTOMER_MESSAGE[targetStatus]} (Order ${order.orderNumber})`,
          channel: order.channel,
        });
      }
    }

    batch.applied = true;
    batch.matchedOrderIds = targetIds;
    batch.proposedStatus = targetStatus;

    for (const apr of db.approvals) {
      if (apr.sellerId === sellerId && apr.payload.batchId === batch.id && apr.status === 'Pending') {
        apr.status = 'Approved';
        apr.decidedAt = now;
      }
    }

    addActivityLog(
      db,
      sellerId,
      'ai_agent',
      'Automated Order Status Broadcast',
      `Applied "${targetStatus}" to ${targetIds.length} order(s) from ${batch.platform} update and notified customers.`,
    );
    saveDbSync(db);
    res.json(await getWorkspaceForSeller(sellerId));
  });

  // 8. Approvals & Notifications
  app.post('/api/approvals/:id/decide', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const sellerId = req.auth!.sellerId;
    const apr = db.approvals.find((a) => a.id === req.params.id && a.sellerId === sellerId);
    if (!apr) {
      res.status(404).json({ error: 'Approval item not found.' });
      return;
    }

    const { decision } = req.body as { decision?: 'Approved' | 'Rejected' };
    apr.status = decision === 'Rejected' ? 'Rejected' : 'Approved';
    apr.decidedAt = new Date().toISOString();

    addActivityLog(db, sellerId, 'seller', `Approval ${apr.status}`, `${apr.title}`);
    saveDbSync(db);
    res.json(await getWorkspaceForSeller(sellerId));
  });

  app.patch('/api/notifications/:id', requireSellerAuth, async (req: AuthenticatedRequest, res) => {
    const db = await getDb();
    const sellerId = req.auth!.sellerId;
    const notif = db.notifications.find((n) => n.id === req.params.id && n.sellerId === sellerId);
    if (!notif) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }

    const { isRead, isResolved } = req.body as { isRead?: boolean; isResolved?: boolean };
    if (typeof isRead === 'boolean') notif.isRead = isRead;
    if (typeof isResolved === 'boolean') {
      notif.isResolved = isResolved;
      if (isResolved) notif.isRead = true;
    }
    saveDbSync(db);
    res.json(await getWorkspaceForSeller(sellerId));
  });

  // 9. Public Buyer Storefront Portal (Strictly sanitized: NO private material costs or seller PII)
  app.get('/api/storefront/:slug', async (req, res) => {
    const db = await getDb();
    const seller = db.sellers.find((s) => s.storeSlug === req.params.slug);
    if (!seller) {
      res.status(404).json({ error: 'Storefront not found.' });
      return;
    }
    const products = db.products
      .filter((p) => p.sellerId === seller.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        description: p.description,
        imageUrl: p.imageUrl,
        sellingPrice: p.sellingPrice,
        inStock: computeAvailableStock(p) > 0,
        availableUnits: computeAvailableStock(p),
      }));

    res.json({
      storeName: seller.storeName,
      storeSlug: seller.storeSlug,
      businessCategory: seller.businessCategory,
      currencySymbol: seller.currencySymbol,
      deliverySla: seller.deliverySla,
      returnPolicy: seller.returnPolicy,
      faqs: seller.faqs,
      products,
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  });

  // Vite dev middleware or static dist
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SELLMATE server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SELLMATE server:', err);
  process.exit(1);
});
