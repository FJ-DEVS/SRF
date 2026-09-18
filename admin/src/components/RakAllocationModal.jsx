import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { X, Boxes, MapPin, RotateCcw, AlertTriangle, Check } from 'lucide-react';

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '';

const sumValues = (row = {}) => Object.values(row).reduce((total, n) => total + (n || 0), 0);

// Oldest rak first, exactly as the server would do it if nothing is changed
const suggestionFor = (items) => {
  const next = {};
  for (const row of items) {
    next[row.item._id] = {};
    for (const r of row.raks) next[row.item._id][r.rak._id] = r.suggested;
  }
  return next;
};

// Shown when the roller marks an order "rolled" — the moment its stock has
// physically left the shelves. The oldest rak is pre-filled so the common case
// is a single tap, but the roller can move the numbers around if the goods
// were actually pulled from somewhere else.
const RakAllocationModal = ({ isOpen, onClose, order, onConfirm, submitting, showAlert }) => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  // { [itemId]: { [rakId]: quantity } }
  const [alloc, setAlloc] = useState({});

  // Keyed on the order id alone: showAlert and onClose come from the parent as
  // fresh closures every render, so depending on them would refetch forever
  useEffect(() => {
    if (!isOpen || !order?._id) return undefined;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const response = await api.get(`/orders/${order._id}/rak-allocation`);
        if (cancelled) return;
        if (response.data.success) {
          const items = response.data.data.items.filter((row) => row.item);
          setRows(items);
          setAlloc(suggestionFor(items));
        }
      } catch (error) {
        if (cancelled) return;
        showAlert('Error', error.response?.data?.message || 'Could not load the raks for this order', 'error');
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, order?._id]);

  if (!isOpen || !order) return null;

  const takenFor = (itemId) => sumValues(alloc[itemId]);

  // Never let a box go past what the rak holds, nor past what is still
  // outstanding on the order once the other raks have had their share
  const setQuantity = (row, rakId, available, raw) => {
    const itemId = row.item._id;
    const current = alloc[itemId]?.[rakId] || 0;
    const others = takenFor(itemId) - current;
    const ceiling = Math.min(available, Math.max(row.quantity - others, 0));
    const value = Math.max(0, Math.min(parseInt(raw, 10) || 0, ceiling));

    setAlloc((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [rakId]: value } }));
  };

  const handleConfirm = () => {
    const allocation = [];
    for (const row of rows) {
      for (const [rak, quantity] of Object.entries(alloc[row.item._id] || {})) {
        if (quantity > 0) allocation.push({ item: row.item._id, rak, quantity });
      }
    }
    onConfirm(allocation);
  };

  const totalTaken = rows.reduce((sum, row) => sum + takenFor(row.item._id), 0);
  const totalOrdered = rows.reduce((sum, row) => sum + row.quantity, 0);

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <div className="srf-modal-panel max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="srf-modal-header">
          <div className="min-w-0">
            <h3 className="srf-modal-title">Which raks is this coming off?</h3>
            <p className="mt-0.5 truncate text-[12px] text-slate-500">
              {order.customerName?.name || 'This order'} · marking as rolled
            </p>
          </div>
          <button onClick={onClose} className="srf-icon-btn shrink-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="srf-modal-body space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-600" />
            </div>
          ) : (
            <>
              <p className="rounded-xl bg-indigo-50/70 px-3 py-2.5 text-[12px] leading-relaxed text-indigo-900">
                The rak each item has sat in longest is filled in already. Change the
                numbers if you pulled the stock from somewhere else.
              </p>

              {rows.map((row) => {
                const taken = takenFor(row.item._id);
                const left = row.quantity - taken;

                return (
                  <div key={row.item._id} className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
                          <Boxes className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                          <span className="truncate">{row.item.name}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {row.placedQty} on raks · {row.quantity} ordered
                        </p>
                      </div>
                      <span
                        className={`srf-badge shrink-0 ${
                          left === 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {left === 0 ? <Check className="h-3 w-3" /> : null}
                        {taken} of {row.quantity}
                      </span>
                    </div>

                    {row.raks.length === 0 ? (
                      <p className="px-3.5 py-3 text-[12px] text-slate-400">
                        Not on any rak — there is nothing to take off a shelf for this item.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {row.raks.map((r, idx) => (
                          <div key={r.rak._id} className="flex items-center gap-3 px-3.5 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                                {r.rak.code}
                                {idx === 0 && (
                                  <span className="srf-badge bg-slate-100 text-slate-500">oldest</span>
                                )}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                {r.available} in rak · placed {formatDate(r.placedAt)}
                              </p>
                            </div>
                            <input
                              type="number"
                              min="0"
                              max={r.available}
                              value={alloc[row.item._id]?.[r.rak._id] ?? 0}
                              onChange={(e) => setQuantity(row, r.rak._id, r.available, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              className="w-20 shrink-0 text-right tabular-nums"
                              aria-label={`Take from rak ${r.rak.code}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {left > 0 && (
                      <p className="flex items-start gap-1.5 border-t border-slate-100 bg-amber-50/60 px-3.5 py-2 text-[11px] text-amber-800">
                        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                        {left} of this item will not come off any rak
                        {row.placedQty < row.quantity ? ' — that much was never placed.' : '.'}
                      </p>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2.5 border-t border-slate-100 bg-slate-50/60 px-4 py-3.5 sm:px-5">
          <button
            type="button"
            onClick={() => setAlloc(suggestionFor(rows))}
            disabled={loading || submitting}
            className="srf-btn srf-btn-secondary"
            title="Put the oldest-first suggestion back"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>

          <div className="flex items-center gap-2.5">
            <span className="hidden text-[12px] tabular-nums text-slate-500 sm:inline">
              {totalTaken} of {totalOrdered}
            </span>
            <button onClick={onClose} disabled={submitting} className="srf-btn srf-btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || submitting}
              className="srf-btn srf-btn-primary"
            >
              {submitting ? 'Working…' : 'Mark rolled'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RakAllocationModal;
