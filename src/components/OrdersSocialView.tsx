import React, { useState } from 'react';
import { CheckCircle2, Clock, Megaphone, Plus, Search, Truck } from 'lucide-react';
import { api } from '../api/client';
import type { ChannelType, Order, OrderStatus, WorkspaceSnapshot } from '../types';
import { formatDateTime, formatMoney, getRemainingStock } from '../utils/inventory';

interface Props {
  workspace: WorkspaceSnapshot;
  onWorkspaceUpdate: (ws: WorkspaceSnapshot) => void;
}

const ALL_STATUSES: OrderStatus[] = [
  'Order Placed',
  'Payment Confirmed',
  'Order Processing',
  'Order Packed',
  'Ready to Deliver',
  'Order Dispatched',
  'Out for Delivery',
  'Order Delivered',
  'Order Cancelled',
];

export const OrdersSocialView: React.FC<Props> = ({ workspace, onWorkspaceUpdate }) => {
  const sym = workspace.seller.currencySymbol;
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    workspace.orders[0]?.id || null,
  );
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);

  // Manual order form
  const [newProductId, setNewProductId] = useState(workspace.products[0]?.id || '');
  const [newQty, setNewQty] = useState(1);
  const [newCustomer, setNewCustomer] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newChannel, setNewChannel] = useState<ChannelType>('Manual Entry');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Social post automation
  const [socialPlatform, setSocialPlatform] = useState<
    'Instagram Post' | 'WhatsApp Broadcast' | 'Store Update'
  >('Instagram Post');
  const [postText, setPostText] = useState('');
  const [parsingPost, setParsingPost] = useState(false);
  const [socialPreview, setSocialPreview] = useState<{
    batchId: string;
    matchedOrderIds: string[];
    proposedStatus: OrderStatus;
    ambiguityStatus: 'Clear' | 'Ambiguous';
    rationale: string;
    customerMessageTemplate: string;
  } | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);

  const selectedOrder: Order | undefined =
    workspace.orders.find((o) => o.id === selectedOrderId) || workspace.orders[0];

  const filteredOrders = workspace.orders.filter((o) => {
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.items.some((i) => i.productName.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  const handleStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    try {
      const ws = await api.updateOrderStatus(orderId, nextStatus);
      onWorkspaceUpdate(ws);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Status update failed.');
    }
  };

  const handleCreateManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError(null);
    setSubmittingOrder(true);
    try {
      const ws = await api.createOrder({
        productId: newProductId,
        quantity: newQty,
        customerName: newCustomer,
        customerContact: newContact,
        deliveryAddress: newAddress,
        channel: newChannel,
      });
      onWorkspaceUpdate(ws);
      setShowNewOrder(false);
      setNewCustomer('');
      setNewContact('');
      setNewAddress('');
      setNewQty(1);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Failed to create order.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleParseSocialPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postText.trim()) return;
    setSocialError(null);
    setParsingPost(true);
    try {
      const res = await api.parseSocialUpdate(postText, socialPlatform);
      onWorkspaceUpdate(res.workspace);
      setSocialPreview({
        batchId: res.batch.id,
        matchedOrderIds: res.batch.matchedOrderIds,
        proposedStatus: res.batch.proposedStatus,
        ambiguityStatus: res.batch.ambiguityStatus,
        rationale: res.batch.rationale,
        customerMessageTemplate: res.customerMessageTemplate,
      });
    } catch (err) {
      setSocialError(err instanceof Error ? err.message : 'Could not analyze update post.');
    } finally {
      setParsingPost(false);
    }
  };

  const handleApplySocialBatch = async () => {
    if (!socialPreview) return;
    try {
      const ws = await api.applySocialUpdate(
        socialPreview.batchId,
        socialPreview.matchedOrderIds,
        socialPreview.proposedStatus,
      );
      onWorkspaceUpdate(ws);
      setSocialPreview(null);
      setPostText('');
      setShowBroadcast(false);
    } catch (err) {
      setSocialError(err instanceof Error ? err.message : 'Failed to apply status update.');
    }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Orders & Updates
          </h1>
          <p className="text-xs text-[#64748B] mt-1 tabular-nums">
            {workspace.orders.length} total orders · Select an order to update stage or view history
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowBroadcast((v) => !v);
              setShowNewOrder(false);
            }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              showBroadcast
                ? 'bg-[#0F172A] text-white border-[#0F172A]'
                : 'bg-white text-[#0F172A] border-[#CBD5E1] hover:bg-[#F8FAFC]'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5" />
            <span>Post Status Update</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNewOrder((v) => !v);
              setShowBroadcast(false);
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Order</span>
          </button>
        </div>
      </div>

      {/* Collapsible Social Media / Business Broadcast Order Updater */}
      {showBroadcast && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#0F172A]">
                Match a Seller Post to Orders
              </h2>
              <p className="text-xs text-[#64748B]">
                Paste an Instagram or WhatsApp update. Ambiguous posts are held in Approvals instead of changing unrelated orders.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {[
                { label: 'Sample: Clear SM-1041', text: 'Order SM-1041 has been packed and is ready to deliver.' },
                { label: 'Sample: Ambiguous', text: 'Some pending orders are ready.' },
              ].map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => setPostText(sample.text)}
                  className="text-xs font-medium text-[#0F766E] hover:underline whitespace-nowrap"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleParseSocialPost} className="flex flex-col sm:flex-row gap-3">
            <select
              value={socialPlatform}
              onChange={(e) =>
                setSocialPlatform(
                  e.target.value as 'Instagram Post' | 'WhatsApp Broadcast' | 'Store Update',
                )
              }
              className="px-3 py-2 text-xs font-medium bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg shrink-0"
            >
              <option>Instagram Post</option>
              <option>WhatsApp Broadcast</option>
              <option>Store Update</option>
            </select>
            <input
              type="text"
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder='e.g. "Order SM-1041 has been packed" or "Today’s orders have been dispatched."'
              className="flex-1 px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
            />
            <button
              type="submit"
              disabled={parsingPost || !postText.trim()}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] rounded-lg hover:bg-[#1E293B] whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {parsingPost ? 'Matching...' : 'Analyze Post'}
            </button>
          </form>

          {socialError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {socialError}
            </div>
          )}

          {socialPreview && (
            <div className="pt-3 border-t border-[#E2E8F0] space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span
                    className={`font-semibold ${
                      socialPreview.ambiguityStatus === 'Clear'
                        ? 'text-[#16A34A]'
                        : 'text-[#D97706]'
                    }`}
                  >
                    {socialPreview.ambiguityStatus === 'Clear'
                      ? 'Clear Match Identified'
                      : 'Ambiguous Post — Held for Seller Confirmation'}
                  </span>
                  <span className="text-[#475569]"> · Target Stage: {socialPreview.proposedStatus}</span>
                </div>
                {socialPreview.matchedOrderIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleApplySocialBatch}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E]"
                  >
                    Confirm & Notify {socialPreview.matchedOrderIds.length} Customer(s)
                  </button>
                )}
              </div>
              <p className="text-[#475569]">{socialPreview.rationale}</p>
              {socialPreview.matchedOrderIds.length > 0 ? (
                <p className="text-[#0F172A]">
                  Matched Orders:{' '}
                  <span className="font-mono font-semibold">
                    {socialPreview.matchedOrderIds
                      .map((id) => workspace.orders.find((o) => o.id === id)?.orderNumber || id)
                      .join(', ')}
                  </span>
                </p>
              ) : (
                <p className="text-[#D97706]">
                  No specific orders were clearly identified. SELLMATE queued this in Approvals & Alerts.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {showNewOrder && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0F172A]">Create Order & Reserve Stock</h2>
            <button
              type="button"
              onClick={() => setShowNewOrder(false)}
              className="text-xs text-[#64748B] hover:text-[#0F172A]"
            >
              Cancel
            </button>
          </div>
          {orderError && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {orderError}
            </div>
          )}
          <form onSubmit={handleCreateManualOrder} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">Product</label>
              <select
                value={newProductId}
                onChange={(e) => setNewProductId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg bg-white"
              >
                {workspace.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatMoney(p.sellingPrice, sym)} · {getRemainingStock(p)} left)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">Quantity</label>
              <input
                type="number"
                min={1}
                required
                value={newQty}
                onChange={(e) => setNewQty(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono border border-[#CBD5E1] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">Channel</label>
              <select
                value={newChannel}
                onChange={(e) => setNewChannel(e.target.value as ChannelType)}
                className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg bg-white"
              >
                <option>Manual Entry</option>
                <option>Instagram DM</option>
                <option>WhatsApp Business</option>
                <option>Storefront Chat</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                Customer Name *
              </label>
              <input
                type="text"
                required
                value={newCustomer}
                onChange={(e) => setNewCustomer(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                Phone / IG Handle
              </label>
              <input
                type="text"
                value={newContact}
                onChange={(e) => setNewContact(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                Delivery Address *
              </label>
              <input
                type="text"
                required
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={submittingOrder}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] disabled:opacity-60"
              >
                {submittingOrder ? 'Creating...' : 'Create Order & Generate UPI QR'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order, customer, product..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#0F766E]"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs font-medium bg-white border border-[#E2E8F0] rounded-lg"
        >
          <option value="all">All Stages ({workspace.orders.length})</option>
          {ALL_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st} ({workspace.orders.filter((o) => o.status === st).length})
            </option>
          ))}
        </select>
      </div>

      {/* Orders List + Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              No orders match this filter yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[11px] font-semibold text-[#64748B]">
                    <th className="py-2.5 px-4">Order</th>
                    <th className="py-2.5 px-4">Customer</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {filteredOrders.map((o) => {
                    const isSelected = selectedOrder?.id === o.id;
                    return (
                      <tr
                        key={o.id}
                        onClick={() => setSelectedOrderId(o.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#0F766E]/5' : 'hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-[#0F172A] tabular-nums">
                          {o.orderNumber}
                          <span className="block text-[11px] font-sans font-normal text-[#64748B]">
                            {formatDateTime(o.createdAt)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-[#0F172A]">{o.customerName}</span>
                          <span className="block text-[11px] text-[#64748B] truncate max-w-[200px]">
                            {o.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-[#0F172A]">{o.status}</span>
                          <span className="block text-[11px] text-[#64748B]">{o.payment.status}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-[#0F172A] tabular-nums">
                          {formatMoney(o.totalAmount, sym)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl p-5">
          {!selectedOrder ? (
            <p className="text-xs text-[#64748B]">Select an order to view details.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-4">
                <div className="min-w-0 pr-3">
                  <p className="text-xs font-mono text-[#64748B]">
                    {selectedOrder.orderNumber} · {selectedOrder.channel}
                  </p>
                  <h3 className="text-base font-bold text-[#0F172A] mt-0.5">
                    {selectedOrder.customerName}
                  </h3>
                  <p className="text-xs text-[#475569] mt-0.5">{selectedOrder.deliveryAddress}</p>
                </div>
                <span className="text-base font-bold font-mono text-[#0F172A] shrink-0 tabular-nums">
                  {formatMoney(selectedOrder.totalAmount, sym)}
                </span>
              </div>

              <div className="space-y-1 text-xs">
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-[#475569]">
                    <span>
                      {item.quantity} × {item.productName}
                    </span>
                    <span className="font-mono tabular-nums">{formatMoney(item.lineTotal, sym)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 pt-3 border-t border-[#E2E8F0]">
                <label className="block text-xs font-semibold text-[#0F172A]">
                  Order Stage
                </label>
                <select
                  value={selectedOrder.status}
                  onChange={(e) =>
                    handleStatusChange(selectedOrder.id, e.target.value as OrderStatus)
                  }
                  className="w-full px-3 py-2 text-xs font-medium border border-[#CBD5E1] rounded-lg bg-white"
                >
                  {ALL_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#64748B]">
                  Changing stage notifies the customer automatically.
                </p>
              </div>

              <div className="space-y-2 pt-3 border-t border-[#E2E8F0]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#0F766E]" />
                    <span>Timeline ({selectedOrder.statusHistory.length})</span>
                  </p>
                  {(selectedOrder.statusHistory.length > 2 ||
                    selectedOrder.customerNotificationsSent.length > 0) && (
                    <button
                      type="button"
                      onClick={() => setShowFullHistory((v) => !v)}
                      className="text-xs font-medium text-[#0F766E] hover:underline"
                    >
                      {showFullHistory ? 'Show less' : 'Show full log'}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {(showFullHistory
                    ? selectedOrder.statusHistory
                    : selectedOrder.statusHistory.slice(-2)
                  ).map((h, i) => (
                    <div key={i} className="text-xs space-y-0.5 border-b border-[#F1F5F9] pb-2 last:border-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#0F172A] flex items-center gap-1.5">
                          {h.status === 'Order Delivered' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />
                          ) : (
                            <Truck className="w-3.5 h-3.5 text-[#0F766E]" />
                          )}
                          {h.status}
                        </span>
                        <span className="text-[11px] font-mono text-[#64748B] tabular-nums">
                          {formatDateTime(h.timestamp)}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#64748B]">{h.note}</p>
                    </div>
                  ))}
                </div>

                {showFullHistory && selectedOrder.customerNotificationsSent.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-[#F1F5F9]">
                    <p className="text-[11px] font-semibold text-[#64748B]">
                      Customer Updates Sent
                    </p>
                    {selectedOrder.customerNotificationsSent.slice(-3).map((msg, i) => (
                      <p key={i} className="text-[11px] text-[#475569]">
                        · {msg.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

