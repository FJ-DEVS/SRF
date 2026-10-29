import React from 'react';
import { AlertTriangle } from 'lucide-react';

// An item's stock count, flagged when it is out, below its check level or low
export const StockBadge = ({ item }) => {
  const qty = item.quantity;
  if (qty === 0) return <span className="srf-badge bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">Out of stock</span>;
  if (item.belowCheckLevel) {
    return (
      <span className="srf-badge bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
        <AlertTriangle className="h-3 w-3" />
        {qty} · below check level
      </span>
    );
  }
  if (item.effectiveCheckLevel == null && qty <= 10) {
    return <span className="srf-badge bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">{qty} left</span>;
  }
  return <span className="text-[13px] text-slate-600">{qty}</span>;
};

// Own check level reads plain; one inherited from the category is marked
export const CheckLevelCell = ({ item }) => {
  if (item.checkLevel != null) {
    return <span className="text-[13px] tabular-nums text-slate-700">{item.checkLevel}</span>;
  }
  if (item.effectiveCheckLevel != null) {
    return (
      <span className="text-[13px] tabular-nums text-slate-400" title="Inherited from the category">
        {item.effectiveCheckLevel}
        <span className="ml-1 text-[10px] uppercase tracking-wide">cat</span>
      </span>
    );
  }
  return <span className="text-slate-300">—</span>;
};
