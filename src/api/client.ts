import type {
  ChannelType,
  ComplaintCategory,
  OrderStatus,
  Product,
  SellerProfile,
  WorkspaceSnapshot,
} from '../types';

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const maxAttempts = 4;
  const retryDelaysMs = [700, 1400, 2200];
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch(url, {
        ...options,
        headers,
        credentials: 'same-origin',
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      const isGatewayOrWarmup =
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504 ||
        contentType.includes('text/html') ||
        text.trimStart().startsWith('<');

      if (isGatewayOrWarmup) {
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, retryDelaysMs[attempt] ?? 1500));
          continue;
        }
        throw new Error(
          'The SELLMATE backend server is starting up. Please wait a moment and try again.',
        );
      }

      let data: { error?: string } & Partial<T> = {};
      if (text) {
        try {
          data = JSON.parse(text) as { error?: string } & Partial<T>;
        } catch {
          throw new Error(
            res.ok
              ? 'Received an unexpected non-JSON response from the server.'
              : `Server returned status ${res.status}. Please try again.`,
          );
        }
      }
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data as T;
    } catch (err) {
      window.clearTimeout(timeoutId);
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const isNetworkTypeError = err instanceof TypeError;
      if (isAbort) {
        throw new Error('The request timed out while waiting for the server. Please try again.');
      }
      if (isNetworkTypeError && attempt < maxAttempts - 1) {
        lastNetworkError = err;
        await new Promise((r) => setTimeout(r, retryDelaysMs[attempt] ?? 1500));
        continue;
      }
      if (isNetworkTypeError) {
        throw new Error(
          'Unable to reach the SELLMATE server right now. Please ensure the app preview has finished starting and try again.',
        );
      }
      throw err;
    }
  }

  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error('Unable to reach the server. Please try again.');
}

export interface AuthResponse {
  token: string;
  workspace: WorkspaceSnapshot;
}

export const api = {
  register(payload: Record<string, unknown>): Promise<AuthResponse> {
    return apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
  },
  login(identifier: string, password: string): Promise<AuthResponse> {
    return apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
  },
  demoLogin(): Promise<AuthResponse> {
    return apiRequest('/api/auth/demo', { method: 'POST', body: '{}' });
  },
  getWorkspace(): Promise<WorkspaceSnapshot> {
    return apiRequest('/api/workspace');
  },
  updateProfile(updates: Partial<SellerProfile>): Promise<WorkspaceSnapshot> {
    return apiRequest('/api/seller/profile', { method: 'PUT', body: JSON.stringify(updates) });
  },
  createProduct(product: Partial<Product>): Promise<WorkspaceSnapshot> {
    return apiRequest('/api/products', { method: 'POST', body: JSON.stringify(product) });
  },
  updateProduct(id: string, product: Partial<Product>): Promise<WorkspaceSnapshot> {
    return apiRequest(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(product) });
  },
  restockProduct(id: string, addedQuantity: number, note?: string): Promise<WorkspaceSnapshot> {
    return apiRequest(`/api/products/${id}/restock`, {
      method: 'POST',
      body: JSON.stringify({ addedQuantity, note }),
    });
  },
  createOrder(payload: {
    productId: string;
    quantity: number;
    customerName: string;
    customerContact: string;
    deliveryAddress: string;
    channel: ChannelType;
  }): Promise<WorkspaceSnapshot> {
    return apiRequest('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateOrderStatus(id: string, status: OrderStatus, note?: string): Promise<WorkspaceSnapshot> {
    return apiRequest(`/api/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    });
  },
  submitPaymentOcr(
    orderId: string,
    screenshotDataUrl: string,
    buyerReferenceNote?: string,
  ): Promise<WorkspaceSnapshot> {
    return apiRequest(`/api/orders/${orderId}/payment-ocr`, {
      method: 'POST',
      body: JSON.stringify({ screenshotDataUrl, buyerReferenceNote }),
    });
  },
  decidePayment(
    orderId: string,
    decision: 'confirm' | 'reject' | 'fail',
    reason?: string,
  ): Promise<WorkspaceSnapshot> {
    return apiRequest(`/api/orders/${orderId}/payment-decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    });
  },
  startConversation(payload: {
    customerName: string;
    customerHandle: string;
    channel: ChannelType;
    initialMessage: string;
  }): Promise<WorkspaceSnapshot> {
    return apiRequest('/api/conversations/new', { method: 'POST', body: JSON.stringify(payload) });
  },
  sendMessage(
    conversationId: string,
    text: string,
    sender: 'buyer' | 'seller',
  ): Promise<WorkspaceSnapshot> {
    return apiRequest(`/api/conversations/${conversationId}/message`, {
      method: 'POST',
      body: JSON.stringify({ text, sender }),
    });
  },
  answerQuery(queryId: string, answer: string, addToFaq: boolean): Promise<WorkspaceSnapshot> {
    return apiRequest(`/api/queries/${queryId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer, addToFaq }),
    });
  },
  createComplaint(payload: {
    orderNumber: string;
    customerName: string;
    productDetails: string;
    category: ComplaintCategory;
    description: string;
  }): Promise<WorkspaceSnapshot> {
    return apiRequest('/api/complaints', { method: 'POST', body: JSON.stringify(payload) });
  },
  remindComplaint(id: string): Promise<WorkspaceSnapshot> {
    return apiRequest(`/api/complaints/${id}/remind`, { method: 'POST', body: '{}' });
  },
  resolveComplaint(id: string, resolutionDetails: string): Promise<WorkspaceSnapshot> {
    return apiRequest(`/api/complaints/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolutionDetails }),
    });
  },
  parseSocialUpdate(
    postText: string,
    platform: 'Instagram Post' | 'WhatsApp Broadcast' | 'Store Update',
  ): Promise<{
    batch: {
      id: string;
      matchedOrderIds: string[];
      proposedStatus: OrderStatus;
      ambiguityStatus: 'Clear' | 'Ambiguous';
      rationale: string;
    };
    customerMessageTemplate: string;
    workspace: WorkspaceSnapshot;
  }> {
    return apiRequest('/api/ai/social-update', {
      method: 'POST',
      body: JSON.stringify({ postText, platform }),
    });
  },
  applySocialUpdate(
    batchId: string,
    orderIds?: string[],
    status?: OrderStatus,
  ): Promise<WorkspaceSnapshot> {
    return apiRequest(`/api/social-update/${batchId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ orderIds, status }),
    });
  },
  decideApproval(id: string, decision: 'Approved' | 'Rejected'): Promise<WorkspaceSnapshot> {
    return apiRequest(`/api/approvals/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
  },
  updateNotification(
    id: string,
    updates: { isRead?: boolean; isResolved?: boolean },
  ): Promise<WorkspaceSnapshot> {
    return apiRequest(`/api/notifications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },
};
