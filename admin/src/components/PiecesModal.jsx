import React, { useState } from 'react';
import { X } from 'lucide-react';

// Asks how many pieces to move between an item's stock and its damaged count
const PiecesModal = ({ title, itemName, available, availableLabel, hint, confirmLabel, confirmClass, onClose, onConfirm }) => {
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);
  const pieces = Number(qty);
  const valid = Number.isInteger(pieces) && pieces >= 1 && pieces <= available;

  const submit = async (e) => {
    e?.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onConfirm(pieces);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <div className="srf-modal-panel max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="srf-modal-header">
          <div className="min-w-0">
            <h3 className="srf-modal-title">{title}</h3>
            <p className="truncate text-[11px] text-slate-400">{itemName}</p>
          </div>
          <button onClick={onClose} className="srf-icon-btn shrink-0" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="srf-modal-body space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-[13px]">
            <span className="text-slate-500">{availableLabel}</span>
            <span className="font-display text-base font-bold tabular-nums text-slate-900">{available}</span>
          </div>
          <div>
            <label className="mb-1.5 block">Pieces</label>
            <input
              type="number"
              min="1"
              max={available}
              required
              autoFocus
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full"
              placeholder={`1 – ${available}`}
            />
            <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
          </div>
        </form>

        <div className="srf-modal-footer">
          <button type="button" onClick={onClose} className="srf-btn srf-btn-secondary">Cancel</button>
          <button type="button" onClick={submit} disabled={!valid || saving} className={`srf-btn ${confirmClass}`}>
            {saving ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PiecesModal;
