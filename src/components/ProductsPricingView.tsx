import React, { useState } from 'react';
import { Package, Plus, Search } from 'lucide-react';
import { api } from '../api/client';
import type { Product, WorkspaceSnapshot } from '../types';
import { formatMoney, getRemainingStock } from '../utils/inventory';

interface Props {
  workspace: WorkspaceSnapshot;
  onWorkspaceUpdate: (ws: WorkspaceSnapshot) => void;
}

export const ProductsPricingView: React.FC<Props> = ({ workspace, onWorkspaceUpdate }) => {
  const sym = workspace.seller.currencySymbol;
  const [search, setSearch] = useState('');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState(workspace.seller.businessCategory);
  const [description, setDescription] = useState('');
  const [sellingPrice, setSellingPrice] = useState<number>(280);
  const [initialStock, setInitialStock] = useState<number>(25);
  const [minStockThreshold, setMinStockThreshold] = useState<number>(6);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startNewProduct = () => {
    setEditingProductId(null);
    setName('');
    setCategory(workspace.seller.businessCategory);
    setDescription('');
    setSellingPrice(250);
    setInitialStock(25);
    setMinStockThreshold(6);
    setError(null);
    setShowBuilder(true);
  };

  const loadForEdit = (p: Product) => {
    setEditingProductId(p.id);
    setName(p.name);
    setCategory(p.category);
    setDescription(p.description);
    setSellingPrice(p.sellingPrice);
    setInitialStock(p.initialStock);
    setMinStockThreshold(p.minStockThreshold);
    setError(null);
    setShowBuilder(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Product name is required.');
      return;
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
      setError('Enter a valid selling price greater than zero.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (editingProductId) {
        const ws = await api.updateProduct(editingProductId, {
          name,
          category,
          description,
          sellingPrice,
          minStockThreshold,
        });
        onWorkspaceUpdate(ws);
      } else {
        const ws = await api.createProduct({
          name,
          category,
          description,
          sellingPrice,
          initialStock,
          minStockThreshold,
        });
        onWorkspaceUpdate(ws);
      }
      setShowBuilder(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = workspace.products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">
            Products & Catalog
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            Manage your product listings, selling prices, and live stock thresholds.
          </p>
        </div>
        <button
          type="button"
          onClick={startNewProduct}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {showBuilder && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 space-y-5 max-w-3xl">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
            <h2 className="text-base font-bold text-[#0F172A]">
              {editingProductId ? `Edit Product: ${name}` : 'Add New Product'}
            </h2>
            <button
              type="button"
              onClick={() => setShowBuilder(false)}
              className="text-xs font-medium text-[#64748B] hover:text-[#0F172A]"
            >
              Close
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSaveProduct} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Lavender Beeswax Pillar Candle"
                  className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                Product Description
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe size, materials, and details customers ask about"
                className="w-full px-3 py-2 text-sm border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Selling Price ({sym}) *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                />
              </div>

              {!editingProductId && (
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Initial Stock Quantity
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={initialStock}
                    onChange={(e) => setInitialStock(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                  Minimum Stock Alert
                </label>
                <input
                  type="number"
                  min={1}
                  value={minStockThreshold}
                  onChange={(e) => setMinStockThreshold(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#0F766E]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBuilder(false)}
                className="px-4 py-2 text-xs font-medium text-[#475569] border border-[#CBD5E1] rounded-lg hover:bg-[#F8FAFC]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg hover:bg-[#0D655E] transition-colors disabled:opacity-60"
              >
                {saving
                  ? 'Saving...'
                  : editingProductId
                    ? 'Save Changes'
                    : 'Save Product'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name, SKU, or category..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#0F766E]"
          />
        </div>
      </div>

      {/* Product List */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 text-center space-y-3">
          <Package className="w-8 h-8 text-[#64748B] mx-auto" />
          <p className="text-sm font-semibold text-[#0F172A]">No matching products found</p>
          <p className="text-xs text-[#64748B]">
            Add a product to manage listings, prices, and inventory levels.
          </p>
          <button
            type="button"
            onClick={startNewProduct}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] rounded-lg"
          >
            Add First Product
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProducts.map((p) => {
            const remaining = getRemainingStock(p);
            const isLow = remaining <= p.minStockThreshold;

            return (
              <div
                key={p.id}
                className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex gap-4 items-start"
              >
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    referrerPolicy="no-referrer"
                    className="w-24 h-24 rounded-lg object-cover border border-[#E2E8F0] shrink-0"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-lg bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center shrink-0">
                    <Package className="w-6 h-6 text-[#64748B]" />
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#0F172A] truncate">{p.name}</h3>
                      <p className="text-xs text-[#64748B]">
                        {p.sku} · {p.category}
                      </p>
                    </div>
                    <p className="text-base font-bold font-mono text-[#0F172A] shrink-0 tabular-nums">
                      {formatMoney(p.sellingPrice, sym)}
                    </p>
                  </div>

                  <p className="text-xs text-[#475569] line-clamp-2">{p.description}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0] text-xs">
                    <span className="font-mono text-[#475569] tabular-nums">
                      <span className={isLow ? 'text-[#D97706] font-semibold' : 'text-[#0F172A]'}>
                        {remaining} in stock
                      </span>{' '}
                      ({p.allocatedUnits} reserved)
                    </span>
                    <button
                      type="button"
                      onClick={() => loadForEdit(p)}
                      className="text-xs font-semibold text-[#0F766E] hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
