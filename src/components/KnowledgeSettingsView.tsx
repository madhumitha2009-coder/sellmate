import React, { useState } from 'react';
import { BookOpen, CheckCircle2, Globe, Lock, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { ChannelIntegration, FAQEntry, WorkspaceSnapshot } from '../types';
import { formatDateTime } from '../utils/inventory';

interface Props {
  workspace: WorkspaceSnapshot;
  onWorkspaceUpdate: (ws: WorkspaceSnapshot) => void;
}

export const KnowledgeSettingsView: React.FC<Props> = ({ workspace, onWorkspaceUpdate }) => {
  const { seller } = workspace;
  const [storeName, setStoreName] = useState(seller.storeName);
  const [businessCategory, setBusinessCategory] = useState(seller.businessCategory);
  const [upiId, setUpiId] = useState(seller.upiId);
  const [deliverySla, setDeliverySla] = useState(seller.deliverySla);
  const [cancellationPolicy, setCancellationPolicy] = useState(seller.cancellationPolicy);
  const [returnPolicy, setReturnPolicy] = useState(seller.returnPolicy);
  const [paymentMethodsText, setPaymentMethodsText] = useState(seller.paymentMethodsText);
  const [faqs, setFaqs] = useState<FAQEntry[]>(seller.faqs);
  const [integrations, setIntegrations] = useState<ChannelIntegration[]>(seller.integrations);

  const [sectionTab, setSectionTab] = useState<'profile' | 'faqs' | 'channels'>('profile');
  const [newFaqQ, setNewFaqQ] = useState('');
  const [newFaqA, setNewFaqA] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      const ws = await api.updateProfile({
        storeName,
        businessCategory,
        upiId,
        deliverySla,
        cancellationPolicy,
        returnPolicy,
        paymentMethodsText,
        faqs,
        integrations,
      });
      onWorkspaceUpdate(ws);
      setSavedNotice(true);
    } finally {
      setSaving(false);
    }
  };

  const handleAddFaq = () => {
    if (!newFaqQ.trim() || !newFaqA.trim()) return;
    setFaqs((prev) => [
      {
        id: `faq_${Date.now()}`,
        question: newFaqQ.trim(),
        answer: newFaqA.trim(),
        source: 'seller_setup',
        updatedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setNewFaqQ('');
    setNewFaqA('');
    setSavedNotice(false);
  };

  const toggleIntegration = (platform: ChannelIntegration['platform']) => {
    setIntegrations((prev) =>
      prev.map((item) =>
        item.platform === platform ? { ...item, connected: !item.connected } : item,
      ),
    );
    setSavedNotice(false);
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Knowledge & Setup
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Store details, policies, FAQs, and channels used by automated replies.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg self-start sm:self-auto">
          {(
            [
              { id: 'profile', label: 'Store & Policies' },
              { id: 'faqs', label: `FAQs (${faqs.length})` },
              { id: 'channels', label: 'Channels & Log' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSectionTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                sectionTab === tab.id
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-5">
        {sectionTab === 'profile' && (
          <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Store Name
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Business Category
                </label>
                <input
                  type="text"
                  value={businessCategory}
                  onChange={(e) => setBusinessCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  UPI ID
                </label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Store Slug
                </label>
                <input
                  type="text"
                  disabled
                  value={seller.storeSlug}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[#64748B]"
                />
              </div>
            </div>

            <div className="space-y-4 pt-3 border-t border-[#F1F5F9]">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Delivery Timeline
                </label>
                <input
                  type="text"
                  value={deliverySla}
                  onChange={(e) => setDeliverySla(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Payment Methods
                </label>
                <input
                  type="text"
                  value={paymentMethodsText}
                  onChange={(e) => setPaymentMethodsText(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Cancellation Policy
                  </label>
                  <textarea
                    rows={2}
                    value={cancellationPolicy}
                    onChange={(e) => setCancellationPolicy(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Return & Replacement Policy
                  </label>
                  <textarea
                    rows={2}
                    value={returnPolicy}
                    onChange={(e) => setReturnPolicy(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {sectionTab === 'faqs' && (
          <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0F766E]" />
              <h2 className="text-sm font-bold text-[#0F172A]">
                Store FAQ Answers ({faqs.length})
              </h2>
            </div>

            <div className="space-y-2 pb-4 border-b border-[#E2E8F0]">
              <input
                type="text"
                value={newFaqQ}
                onChange={(e) => setNewFaqQ(e.target.value)}
                placeholder="Customer question (e.g. Do you offer gift wrapping?)"
                className="w-full px-3 py-2 text-xs bg-white border border-[#CBD5E1] rounded-lg"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newFaqA}
                  onChange={(e) => setNewFaqA(e.target.value)}
                  placeholder="Approved store answer"
                  className="flex-1 px-3 py-2 text-xs bg-white border border-[#CBD5E1] rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleAddFaq}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" /> Add FAQ
                </button>
              </div>
            </div>

            <div className="divide-y divide-[#E2E8F0]">
              {faqs.map((faq) => (
                <div key={faq.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-[#0F172A]">{faq.question}</p>
                    <p className="text-[#475569] mt-0.5">{faq.answer}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFaqs((prev) => prev.filter((f) => f.id !== faq.id))}
                    className="text-[#64748B] hover:text-red-600 shrink-0"
                    aria-label="Delete FAQ"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {sectionTab === 'channels' && (
          <div className="space-y-5">
            <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#0F766E]" />
                <h2 className="text-sm font-bold text-[#0F172A]">Connected Channels</h2>
              </div>
              <div className="divide-y divide-[#E2E8F0]">
                {integrations.map((intg) => (
                  <div key={intg.platform} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-[#0F172A]">{intg.platform}</p>
                      <p className="text-[11px] text-[#64748B]">
                        {intg.handleOrEndpoint} · {intg.mode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleIntegration(intg.platform)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md border ${
                        intg.connected
                          ? 'border-[#0F766E]/30 bg-[#0F766E]/5 text-[#0F766E]'
                          : 'border-[#CBD5E1] text-[#64748B]'
                      }`}
                    >
                      {intg.connected ? 'Enabled' : 'Manual Only'}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#0F766E]" />
                <h2 className="text-sm font-bold text-[#0F172A]">Workspace Isolation</h2>
              </div>
              <p className="text-[#475569]">
                Signed in as <strong className="text-[#0F172A]">{seller.username}</strong> ({seller.email}). All data is isolated to seller ID{' '}
                <span className="font-mono">{seller.id}</span>.
              </p>
            </section>

            <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
                <h2 className="text-sm font-bold text-[#0F172A]">Recent Activity</h2>
              </div>
              <div className="divide-y divide-[#E2E8F0] max-h-64 overflow-y-auto">
                {workspace.activityLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="px-5 py-3 text-xs space-y-0.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[#0F172A]">{log.action}</span>
                      <span className="text-[11px] font-mono text-[#64748B] tabular-nums shrink-0">
                        {formatDateTime(log.timestamp)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#475569]">{log.details}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] flex items-center gap-1.5 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
          {savedNotice && (
            <span className="text-xs font-medium text-[#16A34A] flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Saved and synced
            </span>
          )}
        </div>
      </form>
    </div>
  );
};

