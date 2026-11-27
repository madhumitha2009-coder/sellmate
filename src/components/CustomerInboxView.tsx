import React, { useState } from 'react';
import { Bot, MessageSquarePlus, Send, User } from 'lucide-react';
import { api } from '../api/client';
import type { ChannelType, CustomerConversation, WorkspaceSnapshot } from '../types';
import { formatDateTime } from '../utils/inventory';

interface Props {
  workspace: WorkspaceSnapshot;
  onWorkspaceUpdate: (ws: WorkspaceSnapshot) => void;
}

export const CustomerInboxView: React.FC<Props> = ({ workspace, onWorkspaceUpdate }) => {
  const [selectedConvId, setSelectedConvId] = useState<string>(
    workspace.conversations[0]?.id || '',
  );
  const [messageText, setMessageText] = useState('');
  const [replyMode, setReplyMode] = useState<'buyer' | 'seller'>('buyer');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showPrompts, setShowPrompts] = useState(false);

  // New conversation modal
  const [showNewThread, setShowNewThread] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newHandle, setNewHandle] = useState('');
  const [newChannel, setNewChannel] = useState<ChannelType>('Instagram DM');
  const [newInitialMsg, setNewInitialMsg] = useState(
    'Hi! I would like to order this product. Can you share availability?',
  );

  const selectedConv: CustomerConversation | undefined =
    workspace.conversations.find((c) => c.id === selectedConvId) || workspace.conversations[0];

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConv || !messageText.trim()) return;
    setError(null);
    setSending(true);
    try {
      const ws = await api.sendMessage(selectedConv.id, messageText.trim(), replyMode);
      onWorkspaceUpdate(ws);
      setMessageText('');
      setShowPrompts(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process message.');
    } finally {
      setSending(false);
    }
  };

  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newInitialMsg.trim()) return;
    setError(null);
    setSending(true);
    try {
      const ws = await api.startConversation({
        customerName: newCustomerName,
        customerHandle: newHandle || newCustomerName,
        channel: newChannel,
        initialMessage: newInitialMsg,
      });
      onWorkspaceUpdate(ws);
      setSelectedConvId(ws.conversations[0]?.id || '');
      setShowNewThread(false);
      setNewCustomerName('');
      setNewHandle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start thread.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Customer Inbox
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            AI answers FAQs, confirms stock, places orders, and escalates custom requests.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewThread((v) => !v)}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>New Customer Message</span>
        </button>
      </div>

      {showNewThread && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#0F172A]">
              New Incoming Customer Message
            </h2>
            <button
              type="button"
              onClick={() => setShowNewThread(false)}
              className="text-xs text-[#64748B] hover:text-[#0F172A]"
            >
              Close
            </button>
          </div>
          <form onSubmit={handleCreateThread} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input
              type="text"
              required
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              placeholder="Customer name (e.g. Kabir Shah)"
              className="px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
            />
            <input
              type="text"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              placeholder="Handle or phone (@kabir_ig)"
              className="px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg"
            />
            <select
              value={newChannel}
              onChange={(e) => setNewChannel(e.target.value as ChannelType)}
              className="px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg bg-white"
            >
              <option>Instagram DM</option>
              <option>WhatsApp Business</option>
              <option>Storefront Chat</option>
            </select>
            <div className="sm:col-span-3 flex gap-3">
              <input
                type="text"
                required
                value={newInitialMsg}
                onChange={(e) => setNewInitialMsg(e.target.value)}
                placeholder="Customer's first message..."
                className="flex-1 px-3 py-2 text-sm border border-[#CBD5E1] rounded-lg"
              />
              <button
                type="submit"
                disabled={sending}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] disabled:opacity-60 whitespace-nowrap"
              >
                {sending ? 'Replying...' : 'Start & Auto-Reply'}
              </button>
            </div>
          </form>
        </section>
      )}

      {error && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Conversation List */}
        <aside className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0]">
            <h2 className="text-xs font-bold text-[#0F172A] tabular-nums">
              Conversations ({workspace.conversations.length})
            </h2>
          </div>
          {workspace.conversations.length === 0 ? (
            <div className="p-6 text-xs text-[#64748B]">
              Start a customer message to watch SELLMATE handle orders, FAQs, and complaints.
            </div>
          ) : (
            <div className="divide-y divide-[#E2E8F0]">
              {workspace.conversations.map((conv) => {
                const active = selectedConv?.id === conv.id;
                const lastMsg = conv.messages[conv.messages.length - 1];
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${
                      active ? 'bg-[#0F766E]/5' : 'hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#0F172A]">{conv.customerName}</span>
                      <span className="text-[11px] text-[#64748B]">{conv.channel}</span>
                    </div>
                    <p className="text-[11px] text-[#64748B]">{conv.customerHandle}</p>
                    <p className="text-xs text-[#475569] truncate mt-1">
                      {lastMsg ? lastMsg.text : 'No messages'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Thread Panel */}
        <section className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-xl flex flex-col min-h-[500px]">
          {!selectedConv ? (
            <div className="p-8 text-center text-xs text-[#64748B] m-auto">
              Select a conversation or click "New Customer Message" to start.
            </div>
          ) : (
            <>
              <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">{selectedConv.customerName}</h3>
                  <p className="text-xs text-[#64748B]">
                    {selectedConv.channel} · {selectedConv.customerHandle}
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg">
                  <button
                    type="button"
                    onClick={() => setReplyMode('buyer')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      replyMode === 'buyer'
                        ? 'bg-white text-[#0F172A] shadow-xs'
                        : 'text-[#475569]'
                    }`}
                  >
                    Buyer (AI Replies)
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplyMode('seller')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      replyMode === 'seller'
                        ? 'bg-white text-[#0F172A] shadow-xs'
                        : 'text-[#475569]'
                    }`}
                  >
                    Seller Reply
                  </button>
                </div>
              </div>

              <div className="flex-1 p-5 space-y-3 overflow-y-auto max-h-[380px]">
                {selectedConv.messages.map((m) => {
                  const isBuyer = m.sender === 'buyer';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isBuyer ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-[82%] rounded-xl px-4 py-2.5 text-xs leading-relaxed ${
                          isBuyer
                            ? 'bg-[#F1F5F9] text-[#0F172A]'
                            : m.sender === 'ai'
                              ? 'bg-[#0F766E] text-white'
                              : 'bg-[#0F172A] text-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-[10px] opacity-80 mb-1 tabular-nums">
                          {isBuyer ? (
                            <User className="w-3 h-3" />
                          ) : (
                            <Bot className="w-3 h-3" />
                          )}
                          <span>
                            {isBuyer
                              ? selectedConv.customerName
                              : m.sender === 'ai'
                                ? 'SELLMATE AI'
                                : 'Seller Direct'}
                          </span>
                          <span>·</span>
                          <span>{formatDateTime(m.timestamp)}</span>
                        </div>
                        <p className="whitespace-pre-wrap">{m.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {showPrompts && (
                <div className="px-5 py-2.5 border-t border-[#E2E8F0] bg-[#F8FAFC] flex flex-wrap gap-2 items-center">
                  {[
                    'I want to order 2 Handmade Macrame Keychains.',
                    'My name is Kabir Shah, 14 Park Street, Kolkata 700016. Confirm order.',
                    'How long will delivery take?',
                    'My candle arrived with a cracked lid.',
                    'Can I get a custom wedding bulk discount for 120 pieces?',
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => {
                        setMessageText(prompt);
                        setReplyMode('buyer');
                        setShowPrompts(false);
                      }}
                      className="text-xs text-[#0F766E] bg-white border border-[#E2E8F0] rounded-md px-2.5 py-1 hover:border-[#0F766E]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleSendMessage} className="p-4 border-t border-[#E2E8F0] flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowPrompts((v) => !v)}
                  className="px-3 py-2 text-xs font-medium text-[#475569] border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC] whitespace-nowrap shrink-0"
                >
                  {showPrompts ? 'Hide samples' : 'Samples'}
                </button>
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={
                    replyMode === 'buyer'
                      ? 'Type a buyer message (order, FAQ, or complaint)...'
                      : 'Write a manual seller reply...'
                  }
                  className="flex-1 px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                />
                <button
                  type="submit"
                  disabled={sending || !messageText.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] flex items-center gap-1.5 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sending ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

