import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, QrCode, ShieldCheck, Upload, XCircle } from 'lucide-react';
import { api } from '../api/client';
import type { Order, WorkspaceSnapshot } from '../types';
import { formatDateTime, formatMoney } from '../utils/inventory';

interface Props {
  workspace: WorkspaceSnapshot;
  onWorkspaceUpdate: (ws: WorkspaceSnapshot) => void;
}

export const PaymentsView: React.FC<Props> = ({ workspace, onWorkspaceUpdate }) => {
  const sym = workspace.seller.currencySymbol;
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    workspace.orders.find((o) => o.payment.status === 'Verification Required')?.id ||
      workspace.orders[0]?.id ||
      '',
  );
  const [queueFilter, setQueueFilter] = useState<'pending' | 'all'>('all');
  const [referenceNote, setReferenceNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingOcr, setProcessingOcr] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleOrders =
    queueFilter === 'pending'
      ? workspace.orders.filter((o) => o.payment.status !== 'Payment Confirmed')
      : workspace.orders;

  const selectedOrder: Order | undefined =
    visibleOrders.find((o) => o.id === selectedOrderId) || visibleOrders[0];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOrder) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      setProcessingOcr(true);
      try {
        const ws = await api.submitPaymentOcr(selectedOrder.id, dataUrl, referenceNote);
        onWorkspaceUpdate(ws);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'OCR processing failed.');
      } finally {
        setProcessingOcr(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleTestSampleReceiptOcr = async () => {
    if (!selectedOrder) return;
    setError(null);
    setProcessingOcr(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 480, 600);
      ctx.fillStyle = '#0F766E';
      ctx.fillRect(0, 0, 480, 110);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('UPI Payment Receipt (Sample)', 32, 52);
      ctx.font = '15px sans-serif';
      ctx.fillText('Google Pay · Completed', 32, 82);

      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 42px monospace';
      ctx.fillText(`INR ${selectedOrder.totalAmount.toFixed(2)}`, 32, 185);

      ctx.fillStyle = '#475569';
      ctx.font = '16px sans-serif';
      ctx.fillText(`Paid to: ${workspace.seller.storeName}`, 32, 240);
      ctx.fillText(`UPI ID: ${workspace.seller.upiId}`, 32, 272);
      ctx.fillText(`From: ${selectedOrder.customerName}`, 32, 315);
      ctx.fillText(`UPI Transaction ID: 632098741255`, 32, 355);
      ctx.fillText(`Order Ref: ${selectedOrder.orderNumber}`, 32, 395);
      ctx.fillText(`Date: ${new Date().toLocaleDateString('en-IN')} 11:18 AM`, 32, 435);

      const dataUrl = canvas.toDataURL('image/png');
      const ws = await api.submitPaymentOcr(
        selectedOrder.id,
        dataUrl,
        'Sample uploaded UPI receipt',
      );
      onWorkspaceUpdate(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sample OCR screening failed.');
    } finally {
      setProcessingOcr(false);
    }
  };

  const handleDecision = async (decision: 'confirm' | 'reject' | 'fail') => {
    if (!selectedOrder) return;
    setError(null);
    setDeciding(true);
    try {
      const ws = await api.decidePayment(selectedOrder.id, decision, rejectionReason);
      onWorkspaceUpdate(ws);
      setRejectionReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment decision failed.');
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Payments & UPI
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Screenshots are screened with OCR and wait for your bank check before confirming. No PINs or OTPs stored.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setQueueFilter('pending')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              queueFilter === 'pending'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Needs Action ({workspace.orders.filter((o) => o.payment.status !== 'Payment Confirmed').length})
          </button>
          <button
            type="button"
            onClick={() => setQueueFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              queueFilter === 'all'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            All ({workspace.orders.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Payment Queue */}
        <section className="lg:col-span-5 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
            <h2 className="text-sm font-bold text-[#0F172A]">Order Payments</h2>
          </div>
          {visibleOrders.length === 0 ? (
            <div className="p-6 text-xs text-[#64748B]">No matching payments.</div>
          ) : (
            <div className="divide-y divide-[#E2E8F0]">
              {visibleOrders.map((o) => {
                const active = selectedOrder?.id === o.id;
                const statusColor =
                  o.payment.status === 'Payment Confirmed'
                    ? 'text-[#16A34A]'
                    : o.payment.status === 'Verification Required'
                      ? 'text-[#D97706]'
                      : o.payment.status === 'Payment Rejected' ||
                          o.payment.status === 'Payment Failed'
                        ? 'text-[#DC2626]'
                        : 'text-[#64748B]';
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedOrderId(o.id)}
                    className={`w-full text-left px-5 py-3.5 transition-colors flex items-center justify-between gap-3 ${
                      active ? 'bg-[#0F766E]/5' : 'hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#0F172A] truncate">
                        <span className="font-mono">{o.orderNumber}</span> · {o.customerName}
                      </p>
                      <p className={`text-xs font-medium mt-0.5 ${statusColor}`}>
                        {o.payment.status}
                      </p>
                    </div>
                    <span className="text-sm font-mono font-bold text-[#0F172A] shrink-0 tabular-nums">
                      {formatMoney(o.payment.expectedAmount, sym)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Payment Inspector */}
        <section className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
          {!selectedOrder ? (
            <p className="text-xs text-[#64748B]">Select an order to inspect payment QR and OCR details.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E8F0] pb-4">
                <div>
                  <p className="text-xs font-mono text-[#64748B] tabular-nums">
                    {selectedOrder.orderNumber} · Expected {formatMoney(selectedOrder.payment.expectedAmount, sym)}
                  </p>
                  <h2 className="text-lg font-bold text-[#0F172A] mt-0.5">
                    {selectedOrder.customerName}
                  </h2>
                  <p className="text-xs text-[#475569] mt-0.5">
                    {selectedOrder.payment.status} · Payee UPI:{' '}
                    <span className="font-mono">{selectedOrder.payment.upiId}</span>
                  </p>
                </div>

                {selectedOrder.payment.qrDataUrl && (
                  <div className="border border-[#E2E8F0] rounded-lg p-2 bg-white text-center shrink-0">
                    <img
                      src={selectedOrder.payment.qrDataUrl}
                      alt={`UPI QR for ${selectedOrder.orderNumber}`}
                      className="w-24 h-24 mx-auto"
                    />
                    <p className="text-[10px] font-mono text-[#64748B] mt-1 flex items-center justify-center gap-1">
                      <QrCode className="w-3 h-3" /> UPI QR
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
                  {error}
                </div>
              )}

              {/* OCR Upload Section */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold text-[#0F172A]">
                  Screen Payment Screenshot (OCR)
                </h3>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={referenceNote}
                    onChange={(e) => setReferenceNote(e.target.value)}
                    placeholder="Optional UTR / buyer note"
                    className="flex-1 px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
                  />
                  <label className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{processingOcr ? 'Reading...' : 'Upload Screenshot'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      disabled={processingOcr}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleTestSampleReceiptOcr}
                    disabled={processingOcr}
                    className="px-3 py-2 text-xs font-medium text-[#0F172A] border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] whitespace-nowrap disabled:opacity-60"
                  >
                    Sample Receipt
                  </button>
                </div>
              </div>

              {/* Flat OCR Comparison (No Nested Boxes) */}
              {selectedOrder.payment.ocrResult && (
                <div className="border-t border-[#E2E8F0] pt-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <h4 className="font-semibold text-[#0F172A] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#0F766E]" />
                      <span>OCR Screening Summary</span>
                    </h4>
                    {selectedOrder.payment.submittedAt && (
                      <span className="text-[11px] font-mono text-[#64748B] tabular-nums">
                        {formatDateTime(selectedOrder.payment.submittedAt)}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-2 border-y border-[#F1F5F9] text-xs">
                    <div>
                      <p className="text-[11px] text-[#64748B]">Extracted Amount</p>
                      <p className="font-mono font-bold text-[#0F172A] mt-0.5 tabular-nums">
                        {selectedOrder.payment.ocrResult.extractedAmount !== null
                          ? formatMoney(selectedOrder.payment.ocrResult.extractedAmount, sym)
                          : 'Not legible'}
                      </p>
                      <p
                        className={`text-[11px] font-medium mt-0.5 ${
                          selectedOrder.payment.ocrResult.matchesExpectedAmount
                            ? 'text-[#16A34A]'
                            : 'text-[#DC2626]'
                        }`}
                      >
                        {selectedOrder.payment.ocrResult.matchesExpectedAmount
                          ? 'Matches order total'
                          : 'Amount mismatch'}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] text-[#64748B]">Transaction ID / UTR</p>
                      <p className="font-mono font-semibold text-[#0F172A] truncate mt-0.5">
                        {selectedOrder.payment.ocrResult.transactionId || 'Not detected'}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] text-[#64748B]">Payee UPI</p>
                      <p
                        className={`font-mono text-xs font-medium truncate mt-0.5 ${
                          selectedOrder.payment.ocrResult.matchesSellerUpi
                            ? 'text-[#16A34A]'
                            : 'text-[#D97706]'
                        }`}
                      >
                        {selectedOrder.payment.ocrResult.payeeUpiOrName || 'Not detected'}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-[#475569]">
                    {selectedOrder.payment.ocrResult.confidenceNotes}
                  </p>
                </div>
              )}

              {/* Explicit Seller Decision */}
              {selectedOrder.payment.status !== 'Payment Confirmed' && (
                <div className="pt-3 border-t border-[#E2E8F0] space-y-3">
                  <div className="flex items-center gap-2 text-xs text-[#D97706]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      Confirm only after verifying credit in your bank / UPI app.
                    </span>
                  </div>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Reason if rejecting or marking failed (optional)"
                    className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
                  />
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleDecision('confirm')}
                      disabled={deciding}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#16A34A] rounded-lg hover:bg-[#15803D] flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm Payment</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecision('reject')}
                      disabled={deciding}
                      className="px-4 py-2 text-xs font-semibold text-[#DC2626] border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecision('fail')}
                      disabled={deciding}
                      className="px-4 py-2 text-xs font-medium text-[#475569] border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] disabled:opacity-60"
                    >
                      Mark Failed
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};
