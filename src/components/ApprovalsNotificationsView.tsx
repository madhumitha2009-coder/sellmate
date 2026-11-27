import React, { useMemo, useState } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
  XCircle,
} from 'lucide-react';
import { api } from '../api/client';
import type { PendingApproval, SellerNotification, WorkspaceSnapshot } from '../types';
import { formatDateTime } from '../utils/inventory';

interface Props {
  workspace: WorkspaceSnapshot;
  onWorkspaceUpdate: (ws: WorkspaceSnapshot) => void;
  onNavigate: (tab: string) => void;
}

type ViewFilter = 'attention' | 'approvals' | 'alerts' | 'history';

const APPROVAL_CATEGORY_LABELS: Record<PendingApproval['category'], string> = {
  payment_verification: 'Payment Verification',
  ambiguous_order_update: 'Order Update Review',
  refund_cancellation: 'Refund or Cancellation',
  serious_complaint: 'Serious Complaint',
  pricing_change: 'Pricing Change',
  stock_adjustment: 'Stock Adjustment',
  query_escalation: 'Query Escalation',
};

function matchesSearch(textParts: Array<string | undefined>, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return textParts.some((part) => part && part.toLowerCase().includes(q));
}

export const ApprovalsNotificationsView: React.FC<Props> = ({
  workspace,
  onWorkspaceUpdate,
  onNavigate,
}) => {
  const [activeView, setActiveView] = useState<ViewFilter>('attention');
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [expandedApprovalIds, setExpandedApprovalIds] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingApprovals = useMemo(
    () => workspace.approvals.filter((a) => a.status === 'Pending'),
    [workspace.approvals],
  );
  const pastApprovals = useMemo(
    () => workspace.approvals.filter((a) => a.status !== 'Pending'),
    [workspace.approvals],
  );
  const activeAlerts = useMemo(
    () => workspace.notifications.filter((n) => !n.isResolved),
    [workspace.notifications],
  );
  const resolvedAlerts = useMemo(
    () => workspace.notifications.filter((n) => n.isResolved),
    [workspace.notifications],
  );
  const unreadAlerts = useMemo(
    () => activeAlerts.filter((n) => !n.isRead),
    [activeAlerts],
  );

  const trimmedQuery = searchQuery.trim();

  const filteredPendingApprovals = useMemo(
    () =>
      pendingApprovals.filter((a) =>
        matchesSearch(
          [a.title, a.description, a.aiAssessment, APPROVAL_CATEGORY_LABELS[a.category]],
          trimmedQuery,
        ),
      ),
    [pendingApprovals, trimmedQuery],
  );

  const filteredActiveAlerts = useMemo(
    () =>
      activeAlerts.filter((n) => {
        if (unreadOnly && n.isRead) return false;
        return matchesSearch(
          [n.title, n.message, n.orderNumber, n.productName, n.customerName],
          trimmedQuery,
        );
      }),
    [activeAlerts, unreadOnly, trimmedQuery],
  );

  const filteredPastApprovals = useMemo(
    () =>
      pastApprovals.filter((a) =>
        matchesSearch(
          [a.title, a.description, APPROVAL_CATEGORY_LABELS[a.category], a.status],
          trimmedQuery,
        ),
      ),
    [pastApprovals, trimmedQuery],
  );

  const filteredResolvedAlerts = useMemo(
    () =>
      resolvedAlerts.filter((n) =>
        matchesSearch(
          [n.title, n.message, n.orderNumber, n.productName, n.customerName],
          trimmedQuery,
        ),
      ),
    [resolvedAlerts, trimmedQuery],
  );

  const toggleDetails = (id: string) => {
    setExpandedApprovalIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDecision = async (id: string, decision: 'Approved' | 'Rejected') => {
    setError(null);
    setBusyId(id);
    try {
      const ws = await api.decideApproval(id, decision);
      onWorkspaceUpdate(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update approval.');
    } finally {
      setBusyId(null);
    }
  };

  const handleNotificationAction = async (
    id: string,
    updates: { isRead?: boolean; isResolved?: boolean },
  ) => {
    setError(null);
    setBusyId(id);
    try {
      const ws = await api.updateNotification(id, updates);
      onWorkspaceUpdate(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update notification.');
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadAlerts.length === 0) return;
    setError(null);
    setMarkingAllRead(true);
    try {
      let latestWorkspace: WorkspaceSnapshot | null = null;
      for (const notif of unreadAlerts) {
        latestWorkspace = await api.updateNotification(notif.id, { isRead: true });
      }
      if (latestWorkspace) {
        onWorkspaceUpdate(latestWorkspace);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark all alerts as read.');
    } finally {
      setMarkingAllRead(false);
    }
  };

  const attentionCount = pendingApprovals.length + activeAlerts.length;
  const historyCount = pastApprovals.length + resolvedAlerts.length;

  const renderApprovalRow = (apr: PendingApproval) => {
    const isExpanded = Boolean(expandedApprovalIds[apr.id]);
    const isBusy = busyId === apr.id;

    return (
      <div key={apr.id} className="px-5 py-4 transition-colors hover:bg-[#F8FAFC]/70">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#64748B] tabular-nums">
              <span className="font-medium text-[#0F766E]">
                {APPROVAL_CATEGORY_LABELS[apr.category] || apr.category.replace(/_/g, ' ')}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatDateTime(apr.createdAt)}</span>
            </div>
            <h3 className="text-sm font-semibold text-[#0F172A]">{apr.title}</h3>
            <p className={`text-xs text-[#475569] ${isExpanded ? '' : 'line-clamp-1'}`}>
              {apr.description}
            </p>
            <button
              type="button"
              onClick={() => toggleDetails(apr.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#64748B] hover:text-[#0F172A] pt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] rounded"
            >
              <span>{isExpanded ? 'Hide AI note' : 'View AI note'}</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {apr.category === 'payment_verification' ? (
              <button
                type="button"
                onClick={() => onNavigate('payments')}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
              >
                Verify in Payments
              </button>
            ) : apr.category === 'query_escalation' ? (
              <button
                type="button"
                onClick={() => onNavigate('queries-complaints')}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
              >
                Reply in Queries
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleDecision(apr.id, 'Approved')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#16A34A] rounded-lg hover:bg-[#15803D] disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A34A]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isBusy ? 'Saving...' : 'Approve'}</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleDecision(apr.id, 'Rejected')}
                  className="px-3.5 py-2 text-xs font-semibold text-[#DC2626] border border-[#FECACA] bg-white rounded-lg hover:bg-[#FEF2F2] disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>
              </>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-[#F1F5F9] text-xs text-[#475569] space-y-1">
            <p>
              <span className="font-semibold text-[#0F172A]">AI Assessment: </span>
              {apr.aiAssessment}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderAlertRow = (n: SellerNotification, archived = false) => {
    const isBusy = busyId === n.id;

    return (
      <div
        key={n.id}
        className={`px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
          archived ? 'bg-[#F8FAFC]/60 text-[#64748B]' : 'hover:bg-[#F8FAFC]/70'
        }`}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#64748B] tabular-nums">
            {!archived && !n.isRead && (
              <>
                <span className="font-semibold text-[#0F766E]">Unread</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{formatDateTime(n.createdAt)}</span>
            {n.orderNumber && (
              <>
                <span aria-hidden="true">·</span>
                <span>Order {n.orderNumber}</span>
              </>
            )}
            {n.productName && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate max-w-[220px]">{n.productName}</span>
              </>
            )}
          </div>
          <p
            className={`text-sm ${
              archived
                ? 'font-medium text-[#475569]'
                : n.isRead
                  ? 'font-medium text-[#0F172A]'
                  : 'font-semibold text-[#0F172A]'
            }`}
          >
            {n.title}
          </p>
          <p className="text-xs text-[#475569]">{n.message}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate(n.targetTab)}
            className="px-3 py-1.5 text-xs font-semibold text-[#0F766E] border border-[#CBD5E1] bg-white rounded-lg hover:bg-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]"
          >
            Open
          </button>
          {!n.isRead && !archived && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleNotificationAction(n.id, { isRead: true })}
              className="px-2.5 py-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              Mark read
            </button>
          )}
          {!n.isResolved && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleNotificationAction(n.id, { isResolved: true })}
              className="px-2.5 py-1.5 text-xs font-semibold text-[#16A34A] hover:underline disabled:opacity-50 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Resolve</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Clean Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Approvals & Alerts
          </h1>
          <p className="text-xs text-[#64748B] mt-1 tabular-nums">
            {pendingApprovals.length} pending approvals · {activeAlerts.length} active alerts
            {unreadAlerts.length > 0 ? ` (${unreadAlerts.length} unread)` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {unreadAlerts.length > 0 && (
            <button
              type="button"
              disabled={markingAllRead}
              onClick={handleMarkAllRead}
              className="px-3.5 py-2 text-xs font-medium text-[#0F172A] bg-white border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <CheckCheck className="w-3.5 h-3.5 text-[#0F766E]" />
              <span>{markingAllRead ? 'Marking read...' : 'Mark all read'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowRules((v) => !v)}
            aria-expanded={showRules}
            className="px-3.5 py-2 text-xs font-medium text-[#475569] bg-white border border-[#E2E8F0] rounded-lg hover:text-[#0F172A] hover:bg-[#F8FAFC] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{showRules ? 'Hide Rules' : 'Automation Rules'}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Automation Rules Drawer (Hidden by default to reduce clutter) */}
      {showRules && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <p className="font-semibold text-[#0F172A]">Handled Automatically by SELLMATE</p>
            <p className="text-[#475569] leading-relaxed">
              FAQ replies from your knowledge base · Stock availability checks · Draft order summaries & UPI QR generation · Clear order status broadcasts · Low-stock & overdue alerts.
            </p>
          </div>
          <div className="space-y-1 md:border-l md:border-[#F1F5F9] md:pl-4">
            <p className="font-semibold text-[#0F172A]">Always Requires Seller Approval</p>
            <p className="text-[#475569] leading-relaxed">
              Final UPI payment confirmation · Ambiguous social posts · Unusual refunds or cancellations · Serious complaints · Unlisted bulk/custom questions · Manual stock/price changes.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 py-2.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] text-xs text-[#991B1B] flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-[#991B1B] hover:opacity-75 p-0.5"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Segmented Queue Switcher & Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg overflow-x-auto max-w-full">
          {(
            [
              { id: 'attention', label: 'Needs Action', count: attentionCount },
              { id: 'approvals', label: 'Approvals', count: pendingApprovals.length },
              { id: 'alerts', label: 'Alerts', count: activeAlerts.length },
              { id: 'history', label: 'History', count: historyCount },
            ] as const
          ).map((tab) => {
            const active = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  active
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {(activeView === 'attention' || activeView === 'alerts') && activeAlerts.length > 0 && (
            <button
              type="button"
              onClick={() => setUnreadOnly((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                unreadOnly
                  ? 'bg-[#0F766E]/10 border-[#0F766E]/30 text-[#0F766E]'
                  : 'bg-white border-[#E2E8F0] text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              Unread only
            </button>
          )}
          <div className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by order, product, text..."
              aria-label="Filter approvals and alerts"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-lg text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0F766E]"
            />
          </div>
        </div>
      </div>

      {/* Needs Action View (Prioritized, Clean Single-Column Stack) */}
      {activeView === 'attention' && (
        <div className="space-y-6">
          {filteredPendingApprovals.length === 0 && filteredActiveAlerts.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-[#0F172A]">
                {trimmedQuery || unreadOnly
                  ? 'No matching approvals or alerts'
                  : 'All caught up'}
              </p>
              <p className="text-xs text-[#64748B]">
                {trimmedQuery || unreadOnly
                  ? 'Try clearing your search or unread filter to see active items.'
                  : 'There are no pending approvals or unresolved alerts right now.'}
              </p>
              {(trimmedQuery || unreadOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setUnreadOnly(false);
                  }}
                  className="mt-2 px-3.5 py-1.5 text-xs font-medium text-[#0F766E] border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC]"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              {filteredPendingApprovals.length > 0 && (
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-[#475569] flex items-center gap-1.5 tabular-nums">
                      <ShieldCheck className="w-4 h-4 text-[#0F766E]" />
                      <span>Pending Approvals ({filteredPendingApprovals.length})</span>
                    </h2>
                  </div>
                  <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0]">
                    {filteredPendingApprovals.map(renderApprovalRow)}
                  </div>
                </section>
              )}

              {filteredActiveAlerts.length > 0 && (
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-[#475569] flex items-center gap-1.5 tabular-nums">
                      <Bell className="w-4 h-4 text-[#0F766E]" />
                      <span>Active Alerts ({filteredActiveAlerts.length})</span>
                    </h2>
                  </div>
                  <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0]">
                    {filteredActiveAlerts.map((n) => renderAlertRow(n, false))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* Approvals Only View */}
      {activeView === 'approvals' && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0]">
          {filteredPendingApprovals.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              {trimmedQuery
                ? 'No pending approvals match your search.'
                : 'No pending approvals right now.'}
            </div>
          ) : (
            filteredPendingApprovals.map(renderApprovalRow)
          )}
        </section>
      )}

      {/* Alerts Only View */}
      {activeView === 'alerts' && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0]">
          {filteredActiveAlerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              {trimmedQuery || unreadOnly
                ? 'No active alerts match your current filters.'
                : 'No active alerts right now.'}
            </div>
          ) : (
            filteredActiveAlerts.map((n) => renderAlertRow(n, false))
          )}
        </section>
      )}

      {/* History View (Past Decisions & Resolved Alerts) */}
      {activeView === 'history' && (
        <div className="space-y-6">
          {filteredPastApprovals.length === 0 && filteredResolvedAlerts.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-xs text-[#64748B]">
              {trimmedQuery
                ? 'No past decisions or resolved alerts match your search.'
                : 'Completed approvals and resolved alerts will appear here.'}
            </div>
          ) : (
            <>
              {filteredPastApprovals.length > 0 && (
                <section className="space-y-2.5">
                  <h2 className="text-xs font-semibold text-[#475569] tabular-nums">
                    Past Approval Decisions ({filteredPastApprovals.length})
                  </h2>
                  <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0]">
                    {filteredPastApprovals.map((apr) => (
                      <div
                        key={apr.id}
                        className="px-5 py-3 flex items-center justify-between gap-4 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-[#0F172A] truncate">{apr.title}</p>
                          <p className="text-[#64748B] tabular-nums mt-0.5">
                            {APPROVAL_CATEGORY_LABELS[apr.category] || apr.category.replace(/_/g, ' ')}
                            {' · '}
                            {formatDateTime(apr.decidedAt || apr.createdAt)}
                          </p>
                        </div>
                        <span
                          className={`font-semibold shrink-0 ${
                            apr.status === 'Approved' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                          }`}
                        >
                          {apr.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {filteredResolvedAlerts.length > 0 && (
                <section className="space-y-2.5">
                  <h2 className="text-xs font-semibold text-[#475569] tabular-nums">
                    Resolved Alerts ({filteredResolvedAlerts.length})
                  </h2>
                  <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0]">
                    {filteredResolvedAlerts.map((n) => renderAlertRow(n, true))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

