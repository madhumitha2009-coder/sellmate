import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Lock, Plus, Store, Trash2 } from 'lucide-react';
import { api, setAuthToken } from '../api/client';
import type { WorkspaceSnapshot } from '../types';

interface Props {
  onAuthenticated: (workspace: WorkspaceSnapshot) => void;
}

interface MaterialDraft {
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

export const AuthOnboarding: React.FC<Props> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [regStep, setRegStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Registration Step 1: Account & Store
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('Handmade Crafts & Decor');
  const [upiId, setUpiId] = useState('');

  // Registration Step 2: Channels & Policies
  const [selectedChannels, setSelectedChannels] = useState<string[]>([
    'Instagram Business',
    'WhatsApp Business',
  ]);
  const [deliverySla, setDeliverySla] = useState(
    'Dispatched within 2 business days; standard delivery takes 4–6 business days.',
  );
  const [cancellationPolicy, setCancellationPolicy] = useState(
    'Orders can be cancelled within 12 hours of placement before packing begins.',
  );
  const [returnPolicy, setReturnPolicy] = useState(
    'Free replacement or refund within 48 hours for damaged or incorrect products.',
  );

  // Registration Step 3: Initial Product, Materials & Stock
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [materials, setMaterials] = useState<MaterialDraft[]>([
    { name: 'Primary Raw Material', quantity: 1, unit: 'unit', unitCost: 80 },
  ]);
  const [labourCost, setLabourCost] = useState(40);
  const [packagingCost, setPackagingCost] = useState(20);
  const [otherExpenses, setOtherExpenses] = useState(10);
  const [sellingPrice, setSellingPrice] = useState(280);
  const [initialStock, setInitialStock] = useState(25);
  const [minStockThreshold, setMinStockThreshold] = useState(5);

  const toggleChannel = (channel: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
    );
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(identifier, loginPassword);
      setAuthToken(res.token);
      onAuthenticated(res.workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.demoLogin();
      setAuthToken(res.token);
      onAuthenticated(res.workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open sample workspace.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (regStep === 1) {
      if (!username.trim() || !email.trim() || password.length < 6 || !storeName.trim() || !upiId.trim()) {
        setError('Please complete all account, store name, and UPI ID fields (password min 6 characters).');
        return;
      }
      setRegStep(2);
      return;
    }
    if (regStep === 2) {
      setRegStep(3);
      return;
    }

    setLoading(true);
    try {
      const res = await api.register({
        username: username.trim(),
        email: email.trim(),
        password,
        storeName: storeName.trim(),
        businessCategory,
        upiId: upiId.trim(),
        deliverySla,
        cancellationPolicy,
        returnPolicy,
        selectedChannels,
        initialProduct: productName.trim()
          ? {
              name: productName.trim(),
              category: businessCategory,
              description: productDesc.trim(),
              materials: materials.map((m) => ({
                name: m.name.trim(),
                quantity: Number.isFinite(Number(m.quantity)) ? Number(m.quantity) : 1,
                unit: m.unit?.trim() || 'unit',
                unitCost: Number.isFinite(Number(m.unitCost)) ? Number(m.unitCost) : 0,
              })),
              labourCost: Number.isFinite(Number(labourCost)) ? Number(labourCost) : 0,
              packagingCost: Number.isFinite(Number(packagingCost)) ? Number(packagingCost) : 0,
              otherExpenses: Number.isFinite(Number(otherExpenses)) ? Number(otherExpenses) : 0,
              sellingPrice: Number.isFinite(Number(sellingPrice)) && Number(sellingPrice) > 0 ? Number(sellingPrice) : 199,
              initialStock: Number.isFinite(Number(initialStock)) ? Math.max(0, Number(initialStock)) : 0,
              minStockThreshold: Number.isFinite(Number(minStockThreshold)) ? Math.max(1, Number(minStockThreshold)) : 5,
            }
          : undefined,
      });
      if (!res?.token || !res?.workspace?.seller) {
        throw new Error('Workspace creation returned an incomplete response. Please try again.');
      }
      setAuthToken(res.token);
      onAuthenticated(res.workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const totalMatCost = materials.reduce((acc, m) => acc + Number(m.quantity || 0) * Number(m.unitCost || 0), 0);
  const totalUnitCost = totalMatCost + Number(labourCost || 0) + Number(packagingCost || 0) + Number(otherExpenses || 0);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <header className="border-b border-[#E2E8F0] bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <div className="text-lg font-bold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0">
            SELLMATE
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#475569]">
            <span className="whitespace-nowrap shrink-0">Product Catalog</span>
            <span className="whitespace-nowrap shrink-0">Order Automation</span>
            <span className="whitespace-nowrap shrink-0">UPI Verification</span>
            <span className="whitespace-nowrap shrink-0">Inventory & Care</span>
          </nav>
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            Open Sample Studio
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <section className="lg:col-span-5 space-y-6 pt-2">
          <div className="space-y-3">
            <p className="text-xs font-medium text-[#0F766E]">
              Isolated Seller Workspace · Automated Operations
            </p>
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-[#0F172A] text-balance leading-tight">
              Run your entire small business from one clear workspace.
            </h1>
            <p className="text-sm text-[#475569] leading-relaxed">
              Built for home-based makers, Instagram shops, and solo sellers. Automate customer order replies, calculate profitable prices, screen UPI screenshots safely, and stay ahead of restocks and complaints.
            </p>
          </div>

          <div className="border border-[#E2E8F0] bg-white rounded-xl divide-y divide-[#E2E8F0]">
            <div className="p-4 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-[#0F766E] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-[#0F172A]">Product & Stock Control</h2>
                <p className="text-xs text-[#475569] mt-0.5">
                  Manage your catalog, reserve units on confirmed orders, and catch low stock early.
                </p>
              </div>
            </div>
            <div className="p-4 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-[#0F766E] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-[#0F172A]">Automated Order & FAQ Replies</h2>
                <p className="text-xs text-[#475569] mt-0.5">
                  Confirm stock, capture delivery addresses, reserve units, and generate UPI QR codes automatically.
                </p>
              </div>
            </div>
            <div className="p-4 flex items-start gap-3">
              <Lock className="w-4 h-4 text-[#0F766E] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-[#0F172A]">Seller-Approved Control</h2>
                <p className="text-xs text-[#475569] mt-0.5">
                  Payments, ambiguous social updates, and policy exceptions always wait for your approval.
                </p>
              </div>
            </div>
          </div>

          <div className="border border-[#E2E8F0] bg-white rounded-xl p-5 flex items-center gap-4">
            <img
              src="/src/assets/images/seller_avatar_artisan_1795710340594.jpg"
              alt="Sample artisan studio owner"
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-lg object-cover shrink-0 border border-[#E2E8F0]"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#0F172A]">Earthloom Craft Studio</p>
              <p className="text-xs text-[#475569] mt-0.5">
                4 products · Pending UPI verification · Overdue complaint & low-stock alerts ready to test
              </p>
            </div>
            <button
              type="button"
              onClick={handleDemoLogin}
              disabled={loading}
              className="px-3 py-2 text-xs font-medium text-[#0F766E] border border-[#0F766E]/30 rounded-lg hover:bg-[#0F766E]/5 transition-colors whitespace-nowrap shrink-0"
            >
              Launch Demo
            </button>
          </div>
        </section>

        <section className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-6 lg:p-8">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4 mb-6">
            <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'login' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                Seller Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'register' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                Register New Business
              </button>
            </div>

            {mode === 'register' && (
              <span className="text-xs font-mono text-[#475569]">Step {regStep} of 3</span>
            )}
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
              {error}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Email ID or Username
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="seller@yourstore.com"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]"
                />
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] transition-colors flex items-center gap-2 disabled:opacity-60"
                >
                  <span>{loading ? 'Signing in...' : 'Sign In to Workspace'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="px-4 py-2.5 text-sm font-medium text-[#475569] hover:text-[#0F172A]"
                >
                  Create a new store
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-5">
              {regStep === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                      Username *
                    </label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. aarav.crafts"
                      className="w-full px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                      Email ID *
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                      Password (min 6 characters) *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a secure password"
                      className="w-full px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                      Store Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      placeholder="e.g. Loom & Clay Studio"
                      className="w-full px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                      Business Category *
                    </label>
                    <select
                      value={businessCategory}
                      onChange={(e) => setBusinessCategory(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg bg-white focus:outline-none focus:border-[#0F766E]"
                    >
                      <option>Handmade Crafts & Decor</option>
                      <option>Apparel & Thrift Boutique</option>
                      <option>Bakery & Homemade Foods</option>
                      <option>Jewellery & Accessories</option>
                      <option>Skincare & Candles</option>
                      <option>Reselling & Curated Goods</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                      Seller UPI ID (for QR & payment links) *
                    </label>
                    <input
                      type="text"
                      required
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="yourstore@okicici"
                      className="w-full px-3.5 py-2 text-sm font-mono border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                </div>
              )}

              {regStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-2">
                      Customer Communication & Social Channels
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {['Instagram Business', 'WhatsApp Business', 'Email Notifications', 'Storefront Web Chat'].map(
                        (ch) => {
                          const checked = selectedChannels.includes(ch);
                          return (
                            <button
                              key={ch}
                              type="button"
                              onClick={() => toggleChannel(ch)}
                              className={`p-3 rounded-lg border text-left text-xs font-medium transition-colors flex items-center justify-between ${
                                checked
                                  ? 'border-[#0F766E] bg-[#0F766E]/5 text-[#0F172A]'
                                  : 'border-[#E2E8F0] text-[#475569] hover:border-[#CBD5E1]'
                              }`}
                            >
                              <span>{ch}</span>
                              <span className="font-mono text-[11px]">
                                {checked ? 'Selected' : 'Optional'}
                              </span>
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                      Delivery Timeline Policy
                    </label>
                    <input
                      type="text"
                      value={deliverySla}
                      onChange={(e) => setDeliverySla(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        Cancellation Policy
                      </label>
                      <textarea
                        rows={2}
                        value={cancellationPolicy}
                        onChange={(e) => setCancellationPolicy(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        Return / Damage Policy
                      </label>
                      <textarea
                        rows={2}
                        value={returnPolicy}
                        onChange={(e) => setReturnPolicy(e.target.value)}
                        className="w-full px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {regStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-[#0F172A]">
                        First Product, Materials & Stock (Optional)
                      </h3>
                      <p className="text-xs text-[#475569]">
                        Add your first product now or leave the name blank to add products inside your workspace.
                      </p>
                    </div>
                    <Store className="w-4 h-4 text-[#64748B]" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        Product Name
                      </label>
                      <input
                        type="text"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        placeholder="e.g. Handmade Keychains"
                        className="w-full px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                        Selling Price (₹)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={sellingPrice}
                        onChange={(e) => setSellingPrice(Number(e.target.value))}
                        className="w-full px-3.5 py-2 text-sm font-mono border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
                      Product Description
                    </label>
                    <input
                      type="text"
                      value={productDesc}
                      onChange={(e) => setProductDesc(e.target.value)}
                      placeholder="Short description used by SELLMATE to answer buyer questions"
                      className="w-full px-3.5 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#0F172A]">
                        Materials Used & Costs
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setMaterials((prev) => [
                            ...prev,
                            { name: '', quantity: 1, unit: 'unit', unitCost: 0 },
                          ])
                        }
                        className="text-xs font-medium text-[#0F766E] flex items-center gap-1 hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Material
                      </button>
                    </div>
                    {materials.map((m, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <input
                          type="text"
                          value={m.name}
                          onChange={(e) =>
                            setMaterials((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item)),
                            )
                          }
                          placeholder="Material name"
                          className="col-span-5 px-2.5 py-1.5 text-xs border border-[#CBD5E1] rounded-md"
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          value={m.quantity}
                          onChange={(e) =>
                            setMaterials((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, quantity: Number(e.target.value) } : item,
                              ),
                            )
                          }
                          placeholder="Qty"
                          className="col-span-2 px-2.5 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded-md"
                        />
                        <input
                          type="number"
                          min={0}
                          value={m.unitCost}
                          onChange={(e) =>
                            setMaterials((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, unitCost: Number(e.target.value) } : item,
                              ),
                            )
                          }
                          placeholder="₹/unit"
                          className="col-span-3 px-2.5 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setMaterials((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="col-span-2 flex justify-center text-[#64748B] hover:text-red-600"
                          aria-label="Remove material"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">Labour (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={labourCost}
                        onChange={(e) => setLabourCost(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">Packaging (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={packagingCost}
                        onChange={(e) => setPackagingCost(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">Other (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={otherExpenses}
                        onChange={(e) => setOtherExpenses(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">Initial Stock</label>
                      <input
                        type="number"
                        min={0}
                        value={initialStock}
                        onChange={(e) => setInitialStock(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1">Min Alert</label>
                      <input
                        type="number"
                        min={1}
                        value={minStockThreshold}
                        onChange={(e) => setMinStockThreshold(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#CBD5E1] rounded-md"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-[#475569] font-mono">
                    Estimated unit production cost: ₹{totalUnitCost.toFixed(2)}
                  </p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between">
                {regStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setRegStep((s) => (s === 3 ? 2 : 1))}
                    className="px-4 py-2 text-xs font-semibold text-[#475569] border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC]"
                  >
                    Back
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] transition-colors flex items-center gap-2 disabled:opacity-60"
                >
                  <span>
                    {regStep < 3
                      ? 'Continue'
                      : loading
                        ? 'Creating Workspace...'
                        : 'Launch My Business Workspace'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
};
