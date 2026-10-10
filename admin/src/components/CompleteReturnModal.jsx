import React, { useState } from 'react';
import { X, Package, CheckCircle2, AlertTriangle } from 'lucide-react';

// The split proposed for a line when the return was recorded. Returns recorded
// before the split existed carry one restock choice for the whole order.
const proposedSplit = (order, line) => {
  if (line.restockQuantity != null || line.damagedQuantity != null) {
    return { restock: line.restockQuantity || 0, damaged: line.damagedQuantity || 0 };
  }
  const restock = order.restocked ? line.quantity : 0;
  return { restock, damaged: line.quantity - restock };
};

// Completing a return: reconfirm, line by line, how many pieces go back into
// stock and how many are damaged. Each line starts from the split proposed when
// the return was recorded, and Complete stays off until every line adds up to
// exactly what came back. Render it only while open — it reads the order once.
//   order      the pending return order, items populated
//   onConfirm  called with [{ item, restockQuantity, damagedQuantity }]
const CompleteReturnModal = ({ order, onClose, onConfirm }) => {
  const [lines, setLines] = useState(() => order.items.map((l) => ({
    itemId: l.item?._id || l.item,
    name: l.item?.name || 'Deleted item',
    category: l.item?.category || '',
    quantity: l.quantity,
    ...proposedSplit(order, l)
  })));

  const setField = (itemId, field, raw) => {
    setLines((prev) => prev.map((l) =>
      l.itemId === itemId ? { ...l, [field]: Math.max(0, parseInt(raw, 10) || 0) } : l
    ));
  };

  const allMatch = lines.every((l) => l.restock + l.damaged === l.quantity);
  const restockQty = lines.reduce((sum, l) => sum + l.restock, 0);
  const damagedQty = lines.reduce((sum, l) => sum + l.damaged, 0);

  const handleConfirm = () => {
    if (!allMatch) return;
    onConfirm(lines.map((l) => ({ item: l.itemId, restockQuantity: l.restock, damagedQuantity: l.damaged })));
    onClose();
  };

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <div className="srf-modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="srf-modal-header">
          <div className="min-w-0">
            <h3 className="srf-modal-title">Complete Return</h3>
            <p className="truncate text-[11px] text-slate-400">
              {order.customerName?.name || '—'} · <span className="font-mono">#{order._id.slice(-8)}</span>
            </p>
          </div>
          <button onClick={onClose} className="srf-icon-btn shrink-0" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="srf-modal-body space-y-3">
          <p className="text-xs leading-relaxed text-slate-500">
            Count the pieces once more. Restocked pieces go back into stock, damaged pieces onto the
            Damaged list under Items. Every line must add up to what came back.
          </p>

          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {lines.map((l) => {
              const total = l.restock + l.damaged;
              const diff = total - l.quantity;
              return (
                <div key={l.itemId} className={`px-3.5 py-3 ${diff !== 0 ? 'bg-amber-50/50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Package className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900" title={l.name}>{l.name}</p>
                      {l.category && <p className="truncate text-[11px] text-slate-400">{l.category}</p>}
                    </div>
                    <span className="shrink-0 rounded-md bg-slate-900/[0.06] px-2 py-0.5 text-[12px] font-bold tabular-nums text-slate-900">
                      {l.quantity} returned
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-end gap-3 pl-11">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Restock</span>
                      <input
                        type="number"
                        min="0"
                        value={l.restock}
                        onChange={(e) => setField(l.itemId, 'restock', e.target.value)}
                        className="w-20 !px-2 !py-1.5 text-center"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-rose-600">Damaged</span>
                      <input
                        type="number"
                        min="0"
                        value={l.damaged}
                        onChange={(e) => setField(l.itemId, 'damaged', e.target.value)}
                        className="w-20 !px-2 !py-1.5 text-center"
                      />
                    </label>
                    {diff === 0 ? (
                      <span className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {total} of {l.quantity}
                      </span>
                    ) : (
                      <span className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {total} of {l.quantity} — {diff < 0 ? `${-diff} unaccounted` : `${diff} too many`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-500">
            <span className="font-semibold text-emerald-700">{restockQty} to stock</span>
            {' · '}
            <span className="font-semibold text-rose-700">{damagedQty} damaged</span>
            {' · '}Points earned on all returned pieces come off the leaderboard.
          </p>
        </div>

        <div className="srf-modal-footer">
          <button onClick={onClose} className="srf-btn srf-btn-secondary">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={!allMatch}
            className="srf-btn srf-btn-success"
            title={allMatch ? undefined : 'Every line must add up to what came back'}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete Return
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompleteReturnModal;
