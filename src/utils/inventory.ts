import type { Product } from '../types';

export function getRemainingStock(p: Product): number {
  const physical =
    p.initialStock + p.manufacturedAddedStock - p.unitsSold + p.returnedCancelledUnits;
  return Math.max(0, physical - p.allocatedUnits);
}

export function getPhysicalAvailable(p: Product): number {
  return Math.max(
    0,
    p.initialStock + p.manufacturedAddedStock - p.unitsSold + p.returnedCancelledUnits,
  );
}

export function formatMoney(amount: number, symbol = '₹'): string {
  return `${symbol}${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}
