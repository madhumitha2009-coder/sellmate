import React, { useState } from 'react';
import { AlertCircle, BellRing, CheckCircle2, HelpCircle, PackagePlus, Plus } from 'lucide-react';
import { api } from '../api/client';
import type { ComplaintCategory, WorkspaceSnapshot } from '../types';
import {
  daysSince,
  formatDateShort,
  formatDateTime,
  getPhysicalAvailable,
  getRemainingStock,
} from '../utils/inventory';

interface Props {
  workspace: WorkspaceSnapshot;
  onWorkspaceUpdate: (ws: WorkspaceSnapshot) => void;
}

type Division = 'queries' | 'complaints' | 'unresolved' | 'restock';

export const QueriesComplaintsView: React.FC<Props> = ({ workspace, onWorkspaceUpdate }) => {
  const [division, setDivision] = useState<Division>('queries');
  const [error, setError] = useState<string | null>(null);

  // Division A: Queries
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [addToFaqFlags, setAddToFaqFlags] = useState<Record<string, boolean>>({});
  const [submittingQueryId, setSubmittingQueryId] = useState<string | null>(null);

  // Division B: Register Complaint
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [cmpOrderNum, setCmpOrderNum] = useState('');
  const [cmpCustomer, setCmpCustomer] = useState('');
  const [cmpProduct, setCmpProduct] = useState('');
  const [cmpCategory, setCmpCategory] = useState<ComplaintCategory>('Damaged product');
  const [cmpDescription, setCmpDescription] = useState('');

  // Division C: Resolution details
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, string>>({});

  // Division D: Restock
  const [restockQty, setRestockQty] = useState<Record<string, number>>({});
  const [restockNote, setRestockNote] = useState<Record<string, string>>({});

  const unresolvedComplaints = workspace.complaints.filter((c) => c.status !== 'Resolved');
  const lowStockProducts = workspace.products.filter(
    (p) => getRemainingStock(p) <= p.minStockThreshold,
  );

  const handleAnswerQuery = async (queryId: string) => {
    const answer = answerDrafts[queryId];
    if (!answer?.trim()) return;
    setError(null);
    setSubmittingQueryId(queryId);
    try {
      const ws = await api.answerQuery(queryId, answer, Boolean(addToFaqFlags[queryId]));
      onWorkspaceUpdate(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save query reply.');
    } finally {
      setSubmittingQueryId(null);
    }
  };

  const handleCreateComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const ws = await api.createComplaint({
        orderNumber: cmpOrderNum,
        customerName: cmpCustomer,
        productDetails: cmpProduct,
        category: cmpCategory,
        description: cmpDescription,
      });
      onWorkspaceUpdate(ws);
      setShowComplaintForm(false);
      setCmpOrderNum('');
      setCmpCustomer('');
      setCmpProduct('');
      setCmpDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register complaint.');
    }
  };

  const handleRemind = async (id: string) => {
    try {
      const ws = await api.remindComplaint(id);
      onWorkspaceUpdate(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reminder.');
    }
  };

  const handleResolveComplaint = async (id: string) => {
    const details = resolutionDrafts[id];
    if (!details?.trim()) {
      setError('Enter resolution details before marking a complaint resolved.');
      return;
    }
    setError(null);
    try {
      const ws = await api.resolveComplaint(id, details);
      onWorkspaceUpdate(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve complaint.');
    }
  };

  const handleRestock = async (productId: string) => {
    const qty = Number(restockQty[productId] || 0);
    if (qty <= 0) {
      setError('Enter a restock quantity greater than zero.');
      return;
    }
    setError(null);
    try {
      const ws = await api.restockProduct(productId, qty, restockNote[productId]);
      onWorkspaceUpdate(ws);
      setRestockQty((prev) => ({ ...prev, [productId]: 0 }));
      setRestockNote((prev) => ({ ...prev, [productId]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restock update failed.');
    }
  };

  const [showFullLedger, setShowFullLedger] = useState(false);

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Queries & Care
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Handle escalated queries, customer complaints, and product restocking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg">
          {(
            [
              ['queries', `Queries (${workspace.queries.filter((q) => q.status === 'Unanswered').length})`],
              ['complaints', `Complaints (${workspace.complaints.length})`],
              ['unresolved', `Unresolved (${unresolvedComplaints.length})`],
              ['restock', `Restock (${lowStockProducts.length} low)`],
            ] as Array<[Division, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDivision(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                division === key
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
          {error}
        </div>
      )}

      {/* QUERIES */}
      {division === 'queries' && (
        <section className="space-y-4">
          {workspace.queries.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-xs text-[#64748B]">
              <HelpCircle className="w-7 h-7 mx-auto mb-2 text-[#0F766E]" />
              No escalated customer queries right now.
            </div>
          ) : (
            workspace.queries.map((q) => (
              <div key={q.id} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-bold text-[#0F172A]">{q.customerName}</span>
                    <span className="text-[#64748B]">
                      {' '}
                      · {q.channel} · {q.relatedProductName || 'General Store'} ·{' '}
                      {formatDateTime(q.createdAt)}
                    </span>
                  </div>
                  <span
                    className={`font-semibold ${
                      q.status === 'Unanswered' ? 'text-[#D97706]' : 'text-[#16A34A]'
                    }`}
                  >
                    {q.status}
                  </span>
                </div>

                <p className="text-sm font-medium text-[#0F172A]">"{q.customerMessage}"</p>
                <p className="text-xs text-[#475569]">
                  {q.escalationReason}
                </p>

                {q.sellerAnswer ? (
                  <div className="pt-2 border-t border-[#F1F5F9] text-xs text-[#0F172A]">
                    <span className="font-semibold">Reply sent: </span>
                    {q.sellerAnswer}
                  </div>
                ) : (
                  <div className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                    <textarea
                      rows={2}
                      value={answerDrafts[q.id] || ''}
                      onChange={(e) =>
                        setAnswerDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      placeholder="Write your official reply to this customer..."
                      className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs text-[#475569] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(addToFaqFlags[q.id])}
                          onChange={(e) =>
                            setAddToFaqFlags((prev) => ({ ...prev, [q.id]: e.target.checked }))
                          }
                        />
                        <span>Save answer to store FAQs</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleAnswerQuery(q.id)}
                        disabled={submittingQueryId === q.id}
                        className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] disabled:opacity-60"
                      >
                        {submittingQueryId === q.id ? 'Sending...' : 'Send Reply'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      )}

      {/* COMPLAINTS */}
      {division === 'complaints' && (
        <section className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowComplaintForm((v) => !v)}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#0F172A] rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Register Complaint</span>
            </button>
          </div>

          {showComplaintForm && (
            <form
              onSubmit={handleCreateComplaint}
              className="bg-white border border-[#E2E8F0] rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <input
                type="text"
                required
                value={cmpCustomer}
                onChange={(e) => setCmpCustomer(e.target.value)}
                placeholder="Customer name *"
                className="px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
              />
              <input
                type="text"
                value={cmpOrderNum}
                onChange={(e) => setCmpOrderNum(e.target.value)}
                placeholder="Order number (e.g. SM-1042)"
                className="px-3 py-2 text-xs font-mono border border-[#CBD5E1] rounded-lg"
              />
              <input
                type="text"
                value={cmpProduct}
                onChange={(e) => setCmpProduct(e.target.value)}
                placeholder="Product details"
                className="px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
              />
              <select
                value={cmpCategory}
                onChange={(e) => setCmpCategory(e.target.value as ComplaintCategory)}
                className="px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg bg-white"
              >
                <option>Damaged product</option>
                <option>Parcel not received</option>
                <option>Delayed delivery</option>
                <option>Incorrect product</option>
                <option>Missing items</option>
                <option>Other</option>
              </select>
              <textarea
                rows={2}
                required
                value={cmpDescription}
                onChange={(e) => setCmpDescription(e.target.value)}
                placeholder="Describe the customer-reported issue *"
                className="sm:col-span-2 px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
              />
              <div className="sm:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowComplaintForm(false)}
                  className="px-3 py-1.5 text-xs text-[#64748B]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0F766E] rounded-lg"
                >
                  Create Complaint
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0]">
            {workspace.complaints.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B]">No complaints registered.</div>
            ) : (
              workspace.complaints.map((c) => (
                <div key={c.id} className="p-5 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[#0F172A]">
                      {c.category} · {c.orderNumber} · {c.customerName}
                    </span>
                    <span
                      className={`font-semibold tabular-nums ${
                        c.status === 'Resolved'
                          ? 'text-[#16A34A]'
                          : c.status === 'Overdue'
                            ? 'text-[#DC2626]'
                            : 'text-[#D97706]'
                      }`}
                    >
                      {c.status} · {formatDateShort(c.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-[#64748B]">{c.productDetails}</p>
                  <p className="text-xs text-[#0F172A]">{c.description}</p>
                  {c.resolutionDetails && (
                    <p className="text-xs text-[#16A34A] pt-1">
                      Resolution: {c.resolutionDetails}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* UNRESOLVED COMPLAINTS */}
      {division === 'unresolved' && (
        <section className="space-y-4">
          {unresolvedComplaints.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-xs text-[#64748B]">
              <CheckCircle2 className="w-7 h-7 text-[#16A34A] mx-auto mb-2" />
              All complaints have verified resolution details.
            </div>
          ) : (
            unresolvedComplaints.map((c) => {
              const age = daysSince(c.createdAt);
              const isOverdue = c.status === 'Overdue' || age >= 3;
              return (
                <div key={c.id} className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <AlertCircle
                        className={`w-4 h-4 ${isOverdue ? 'text-[#DC2626]' : 'text-[#D97706]'}`}
                      />
                      <span className="font-bold text-[#0F172A]">
                        {c.category} · {c.customerName} ({c.orderNumber})
                      </span>
                    </div>
                    <span
                      className={`text-xs font-mono font-semibold tabular-nums ${
                        isOverdue ? 'text-[#DC2626]' : 'text-[#D97706]'
                      }`}
                    >
                      {age}d open · {c.reminderCount} reminder(s)
                    </span>
                  </div>

                  <p className="text-xs text-[#64748B]">
                    {c.productDetails} · Reported {formatDateShort(c.createdAt)}
                  </p>
                  <p className="text-xs text-[#0F172A]">{c.description}</p>

                  <div className="pt-2 border-t border-[#E2E8F0] space-y-2">
                    <input
                      type="text"
                      value={resolutionDrafts[c.id] || ''}
                      onChange={(e) =>
                        setResolutionDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      placeholder="Enter resolution details (e.g. Dispatched replacement AWB...) *"
                      className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
                    />
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => handleRemind(c.id)}
                        className="px-3 py-1.5 text-xs font-medium text-[#0F172A] border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] flex items-center gap-1"
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        <span>Send Reminder</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolveComplaint(c.id)}
                        className="px-4 py-1.5 text-xs font-semibold text-white bg-[#16A34A] rounded-lg hover:bg-[#15803D]"
                      >
                        Mark Resolved
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}

      {/* RESTOCK MANAGEMENT */}
      {division === 'restock' && (
        <section className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A]">
                  Restock Management
                </h2>
                <p className="text-[11px] text-[#64748B]">
                  Remaining = Available Stock − Allocated Orders
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFullLedger((v) => !v)}
                className="text-xs font-medium text-[#0F766E] hover:underline"
              >
                {showFullLedger ? 'Simple view' : 'Full stock breakdown'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[11px] font-semibold text-[#64748B]">
                    <th className="py-2.5 px-4">Product</th>
                    {showFullLedger && (
                      <>
                        <th className="py-2.5 px-3 text-right">Initial</th>
                        <th className="py-2.5 px-3 text-right">Added</th>
                        <th className="py-2.5 px-3 text-right">Sold</th>
                        <th className="py-2.5 px-3 text-right">Returned</th>
                      </>
                    )}
                    <th className="py-2.5 px-3 text-right">Available</th>
                    <th className="py-2.5 px-3 text-right">Allocated</th>
                    <th className="py-2.5 px-3 text-right">Remaining</th>
                    <th className="py-2.5 px-4">Restock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {workspace.products.map((p) => {
                    const phys = getPhysicalAvailable(p);
                    const rem = getRemainingStock(p);
                    const low = rem <= p.minStockThreshold;
                    return (
                      <tr key={p.id} className={low ? 'bg-amber-50/40' : ''}>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-[#0F172A]">{p.name}</span>
                          <span className="block text-[11px] text-[#64748B] tabular-nums">
                            Min threshold: {p.minStockThreshold}
                          </span>
                        </td>
                        {showFullLedger && (
                          <>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">{p.initialStock}</td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">{p.manufacturedAddedStock}</td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">{p.unitsSold}</td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">{p.returnedCancelledUnits}</td>
                          </>
                        )}
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{phys}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{p.allocatedUnits}</td>
                        <td
                          className={`py-3 px-3 text-right font-mono font-bold tabular-nums ${
                            low ? 'text-[#D97706]' : 'text-[#16A34A]'
                          }`}
                        >
                          {rem} {low ? '(Low)' : ''}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              value={restockQty[p.id] || ''}
                              onChange={(e) =>
                                setRestockQty((prev) => ({
                                  ...prev,
                                  [p.id]: Number(e.target.value),
                                }))
                              }
                              placeholder="+Qty"
                              className="w-16 px-2 py-1 text-xs font-mono border border-[#CBD5E1] rounded-md"
                            />
                            <button
                              type="button"
                              onClick={() => handleRestock(p.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0F766E] rounded-md hover:bg-[#0D655E] flex items-center gap-1 whitespace-nowrap"
                            >
                              <PackagePlus className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

