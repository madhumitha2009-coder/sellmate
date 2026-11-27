import React, { useState } from 'react';
import {
  Bell,
  BookOpen,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  ShieldAlert,
  X,
} from 'lucide-react';
import { setAuthToken } from './api/client';
import { ApprovalsNotificationsView } from './components/ApprovalsNotificationsView';
import { AuthOnboarding } from './components/AuthOnboarding';
import { CustomerInboxView } from './components/CustomerInboxView';
import { DashboardView } from './components/DashboardView';
import { KnowledgeSettingsView } from './components/KnowledgeSettingsView';
import { OrdersSocialView } from './components/OrdersSocialView';
import { PaymentsView } from './components/PaymentsView';
import { ProductsPricingView } from './components/ProductsPricingView';
import { QueriesComplaintsView } from './components/QueriesComplaintsView';
import type { WorkspaceSnapshot } from './types';
import { getRemainingStock } from './utils/inventory';

type NavTab =
  | 'dashboard'
  | 'products'
  | 'orders'
  | 'payments'
  | 'inbox'
  | 'queries-complaints'
  | 'approvals'
  | 'knowledge';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'products', label: 'Products & Catalog', icon: Package },
  { id: 'orders', label: 'Orders & Updates', icon: ClipboardList },
  { id: 'payments', label: 'Payments & UPI', icon: CreditCard },
  { id: 'inbox', label: 'Customer Inbox', icon: MessageSquare },
  { id: 'queries-complaints', label: 'Queries & Care', icon: ShieldAlert },
  { id: 'approvals', label: 'Approvals & Alerts', icon: Bell },
  { id: 'knowledge', label: 'Knowledge & Setup', icon: BookOpen },
];

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    setAuthToken(null);
    setWorkspace(null);
    setActiveTab('dashboard');
  };

  if (!workspace) {
    return <AuthOnboarding onAuthenticated={(ws) => setWorkspace(ws)} />;
  }

  const pendingApprovalsCount = workspace.approvals.filter((a) => a.status === 'Pending').length;
  const unreadNotificationsCount = workspace.notifications.filter((n) => !n.isResolved).length;
  const pendingVerifications = workspace.orders.filter(
    (o) => o.payment.status === 'Verification Required',
  ).length;
  const openCareCount =
    workspace.queries.filter((q) => q.status === 'Unanswered').length +
    workspace.complaints.filter((c) => c.status !== 'Resolved').length +
    workspace.products.filter((p) => getRemainingStock(p) <= p.minStockThreshold).length;

  const badgeCountForTab = (id: NavTab): number => {
    if (id === 'payments') return pendingVerifications;
    if (id === 'queries-complaints') return openCareCount;
    if (id === 'approvals') return pendingApprovalsCount + unreadNotificationsCount;
    return 0;
  };

  const activeNavLabel = NAV_ITEMS.find((i) => i.id === activeTab)?.label || 'Dashboard';

  const navigate = (tab: string) => {
    const valid = NAV_ITEMS.some((i) => i.id === tab);
    setActiveTab(valid ? (tab as NavTab) : 'dashboard');
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-[#E2E8F0]">
        <div className="px-6 py-5 border-b border-[#E2E8F0]">
          <span className="text-lg font-bold tracking-tight text-[#0F172A] block">SELLMATE</span>
          <span className="text-xs text-[#64748B] truncate block mt-0.5">
            {workspace.seller.storeName}
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const count = badgeCountForTab(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={`w-full px-3.5 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 transition-colors ${
                  active
                    ? 'bg-[#0F766E] text-white'
                    : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {count > 0 && (
                  <span
                    className={`font-mono text-[11px] shrink-0 ${
                      active ? 'text-white/90' : 'text-[#0F766E]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#E2E8F0] space-y-3">
          <div className="flex items-center gap-3">
            {workspace.seller.avatarUrl ? (
              <img
                src={workspace.seller.avatarUrl}
                alt={workspace.seller.username}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-lg object-cover border border-[#E2E8F0] shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-[#0F766E]/10 text-[#0F766E] font-bold text-xs flex items-center justify-center shrink-0">
                {workspace.seller.storeName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[#0F172A] truncate">
                {workspace.seller.username}
              </p>
              <p className="text-[11px] text-[#64748B] truncate">{workspace.seller.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full px-3 py-2 text-xs font-medium text-[#475569] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary action on right */}
        <header className="sticky top-0 z-20 bg-white border-b border-[#E2E8F0] px-4 sm:px-6 py-3.5 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg border border-[#E2E8F0] text-[#0F172A]"
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <div className="text-xs sm:text-sm font-medium text-[#64748B] truncate">
              <span className="text-[#0F172A] font-semibold whitespace-nowrap">
                {workspace.seller.storeName}
              </span>
              <span className="mx-2">/</span>
              <span className="whitespace-nowrap">{activeNavLabel}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(activeTab === 'inbox' ? 'orders' : 'inbox')}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] transition-colors whitespace-nowrap shrink-0"
          >
            {activeTab === 'inbox' ? 'View Orders' : 'Customer Inbox'}
          </button>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-[#E2E8F0] p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  className={`w-full px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between ${
                    active ? 'bg-[#0F766E] text-white' : 'text-[#475569]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </span>
                  {badgeCountForTab(item.id) > 0 && (
                    <span className="font-mono text-[11px]">{badgeCountForTab(item.id)}</span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full px-3 py-2 text-xs font-medium text-[#DC2626] text-left"
            >
              Sign Out ({workspace.seller.username})
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView workspace={workspace} onNavigate={navigate} />
          )}
          {activeTab === 'products' && (
            <ProductsPricingView workspace={workspace} onWorkspaceUpdate={setWorkspace} />
          )}
          {activeTab === 'orders' && (
            <OrdersSocialView workspace={workspace} onWorkspaceUpdate={setWorkspace} />
          )}
          {activeTab === 'payments' && (
            <PaymentsView workspace={workspace} onWorkspaceUpdate={setWorkspace} />
          )}
          {activeTab === 'inbox' && (
            <CustomerInboxView workspace={workspace} onWorkspaceUpdate={setWorkspace} />
          )}
          {activeTab === 'queries-complaints' && (
            <QueriesComplaintsView workspace={workspace} onWorkspaceUpdate={setWorkspace} />
          )}
          {activeTab === 'approvals' && (
            <ApprovalsNotificationsView
              workspace={workspace}
              onWorkspaceUpdate={setWorkspace}
              onNavigate={navigate}
            />
          )}
          {activeTab === 'knowledge' && (
            <KnowledgeSettingsView workspace={workspace} onWorkspaceUpdate={setWorkspace} />
          )}
        </main>
      </div>
    </div>
  );
}
