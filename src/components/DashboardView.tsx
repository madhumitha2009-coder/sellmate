import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  MessageSquare,
  Package,
  ShieldAlert,
} from 'lucide-react';
import type { WorkspaceSnapshot } from '../types';
import { daysSince, formatDateTime, formatMoney, getRemainingStock } from '../utils/inventory';

interface Props {
  workspace: WorkspaceSnapshot;
  onNavigate: (tab: string) => void;
}

type SnapshotTab = 'orders' | 'stock' | 'messages';

export const DashboardView: React.FC<Props> = ({ workspace, onNavigate }) => {
  const [snapshotTab, setSnapshotTab] = useState<SnapshotTab>('orders');
  const { seller, products, orders, conversations, queries, complaints, notifications, approvals } =
    workspace;
  const sym = seller.currencySymbol;

  const newOrders = orders.filter((o) => o.status === 'Order Placed').length;
  const activeOrders = orders.filter(
    (o) => o.status !== 'Order Delivered' && o.status !== 'Order Cancelled',
  ).length;
  const pendingVerifications = orders.filter(
    (o) => o.payment.status === 'Verification Required',
  ).length;
  const pendingPayments = orders.filter(
    (o) => o.payment.status === 'Payment Pending' || o.payment.status === 'Verification Required',
  ).length;

  const lowStockProducts = products.filter((p) => getRemainingStock(p) <= p.minStockThreshold);
  const unansweredQueries = queries.filter((q) => q.status === 'Unanswered').length;
  const unresolvedComplaints = complaints.filter((c) => c.status !== 'Resolved');
  const pendingApprovals = approvals.filter((a) => a.status === 'Pending');
  const activeNotifications = notifications.filter((n) => !n.isResolved);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Clean Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            {seller.storeName}
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            {seller.businessCategory} · UPI <span className="font-mono">{seller.upiId}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('inbox')}
            className="px-4 py-2 text-xs font-semibold text-[#0F172A] bg-white border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] transition-colors whitespace-nowrap shrink-0"
          >
            Customer Inbox
          </button>
          <button
            type="button"
            onClick={() => onNavigate('approvals')}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] transition-colors whitespace-nowrap shrink-0 tabular-nums"
          >
            Approvals ({pendingApprovals.length})
          </button>
        </div>
      </div>

      {/* 4 Focused KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onNavigate('orders')}
          className="bg-white border border-[#E2E8F0] rounded-xl p-4 text-left hover:border-[#0F766E]/40 transition-colors"
        >
          <p className="text-xs font-medium text-[#64748B]">Active Orders</p>
          <p className="text-2xl font-bold font-mono text-[#0F172A] mt-1 tabular-nums">
            {activeOrders}
          </p>
          <p className="text-[11px] text-[#64748B] mt-1 tabular-nums">
            {newOrders} new · {orders.length} total
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('payments')}
          className="bg-white border border-[#E2E8F0] rounded-xl p-4 text-left hover:border-[#0F766E]/40 transition-colors"
        >
          <p className="text-xs font-medium text-[#64748B]">Payments to Verify</p>
          <p className="text-2xl font-bold font-mono text-[#0F172A] mt-1 tabular-nums">
            {pendingPayments}
          </p>
          <p className="text-[11px] text-[#D97706] mt-1 tabular-nums">
            {pendingVerifications} screenshot(s) ready
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('queries-complaints')}
          className="bg-white border border-[#E2E8F0] rounded-xl p-4 text-left hover:border-[#0F766E]/40 transition-colors"
        >
          <p className="text-xs font-medium text-[#64748B]">Low Stock SKUs</p>
          <p
            className={`text-2xl font-bold font-mono mt-1 tabular-nums ${
              lowStockProducts.length > 0 ? 'text-[#D97706]' : 'text-[#16A34A]'
            }`}
          >
            {lowStockProducts.length}
          </p>
          <p className="text-[11px] text-[#64748B] mt-1 tabular-nums">
            Out of {products.length} products
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('queries-complaints')}
          className="bg-white border border-[#E2E8F0] rounded-xl p-4 text-left hover:border-[#0F766E]/40 transition-colors"
        >
          <p className="text-xs font-medium text-[#64748B]">Queries & Complaints</p>
          <p className="text-2xl font-bold font-mono text-[#0F172A] mt-1 tabular-nums">
            {unansweredQueries + unresolvedComplaints.length}
          </p>
          <p
            className={`text-[11px] mt-1 tabular-nums ${
              unresolvedComplaints.length > 0 ? 'text-[#DC2626]' : 'text-[#64748B]'
            }`}
          >
            {unansweredQueries} queries · {unresolvedComplaints.length} open issues
          </p>
        </button>
      </div>

      {/* Main 2-Column Workspace: Needs Action + Switchable Activity Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Next Actions */}
        <section className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#0F766E]" />
              <h2 className="text-sm font-semibold text-[#0F172A]">
                Needs Attention ({activeNotifications.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('approvals')}
              className="text-xs font-medium text-[#0F766E] hover:underline flex items-center gap-1 whitespace-nowrap"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeNotifications.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              <CheckCircle2 className="w-6 h-6 text-[#16A34A] mx-auto mb-2" />
              All caught up. SELLMATE is monitoring orders and stock.
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0]">
              {activeNotifications.slice(0, 4).map((notif) => {
                const isAlert =
                  notif.type === 'complaint_overdue' || notif.type === 'new_complaint';
                const isWarn =
                  notif.type === 'low_stock' || notif.type === 'payment_verification';
                return (
                  <div
                    key={notif.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAFC] transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs">
                        {isAlert ? (
                          <ShieldAlert className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />
                        ) : isWarn ? (
                          <AlertCircle className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                        )}
                        <span className="font-semibold text-[#0F172A] truncate">
                          {notif.title}
                        </span>
                      </div>
                      <p className="text-xs text-[#475569] truncate">{notif.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate(notif.targetTab)}
                      className="px-3 py-1.5 text-xs font-medium text-[#0F766E] border border-[#CBD5E1] rounded-lg hover:bg-white whitespace-nowrap shrink-0"
                    >
                      Open
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: Single Switchable Store Snapshot */}
        <section className="lg:col-span-6 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg">
              {(
                [
                  { id: 'orders', label: 'Recent Orders' },
                  { id: 'stock', label: `Stock & Care (${lowStockProducts.length + unresolvedComplaints.length})` },
                  { id: 'messages', label: 'Inbox' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSnapshotTab(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    snapshotTab === tab.id
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                onNavigate(
                  snapshotTab === 'orders'
                    ? 'orders'
                    : snapshotTab === 'stock'
                      ? 'queries-complaints'
                      : 'inbox',
                )
              }
              className="text-xs font-medium text-[#0F766E] hover:underline whitespace-nowrap"
            >
              Open module
            </button>
          </div>

          {snapshotTab === 'orders' && (
            <div className="divide-y divide-[#E2E8F0]">
              {orders.length === 0 ? (
                <div className="p-6 text-xs text-[#64748B]">No orders yet.</div>
              ) : (
                orders.slice(0, 4).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onNavigate('orders')}
                    className="w-full text-left px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#F8FAFC] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#0F172A] truncate">
                        <span className="font-mono">{o.orderNumber}</span> · {o.customerName}
                      </p>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        {o.status} · {o.payment.status}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-semibold text-[#0F172A] shrink-0 tabular-nums">
                      {formatMoney(o.totalAmount, sym)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {snapshotTab === 'stock' && (
            <div className="divide-y divide-[#E2E8F0]">
              {lowStockProducts.length === 0 && unresolvedComplaints.length === 0 ? (
                <div className="p-6 text-xs text-[#64748B]">
                  All inventory levels healthy and no unresolved complaints.
                </div>
              ) : (
                <>
                  {lowStockProducts.map((p) => (
                    <div key={p.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#0F172A] truncate">{p.name}</p>
                          <p className="text-[11px] text-[#64748B]">Low stock alert</p>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-semibold text-[#D97706] shrink-0 tabular-nums">
                        {getRemainingStock(p)} left
                      </span>
                    </div>
                  ))}
                  {unresolvedComplaints.slice(0, 3).map((c) => (
                    <div key={c.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#0F172A] truncate">
                          {c.orderNumber} · {c.customerName}
                        </p>
                        <p className="text-[11px] text-[#475569] truncate">{c.description}</p>
                      </div>
                      <span
                        className={`text-xs font-medium shrink-0 tabular-nums ${
                          c.status === 'Overdue' ? 'text-[#DC2626]' : 'text-[#D97706]'
                        }`}
                      >
                        {c.status} ({daysSince(c.createdAt)}d)
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {snapshotTab === 'messages' && (
            <div className="divide-y divide-[#E2E8F0]">
              {conversations.length === 0 ? (
                <div className="p-6 text-xs text-[#64748B]">No customer conversations yet.</div>
              ) : (
                conversations.slice(0, 4).map((conv) => {
                  const last = conv.messages[conv.messages.length - 1];
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => onNavigate('inbox')}
                      className="w-full text-left px-5 py-3.5 hover:bg-[#F8FAFC] transition-colors block"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#0F172A] flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-[#0F766E]" />
                          {conv.customerName}
                        </span>
                        <span className="text-[11px] text-[#64748B] tabular-nums">
                          {conv.channel} · {formatDateTime(conv.lastUpdated)}
                        </span>
                      </div>
                      <p className="text-xs text-[#475569] mt-1 truncate">
                        {last ? `${last.sender === 'ai' ? 'AI: ' : ''}${last.text}` : 'No messages'}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

