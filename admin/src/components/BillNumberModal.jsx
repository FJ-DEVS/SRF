import React, { useState } from 'react';
import { Receipt } from 'lucide-react';

const BILL_NUMBER = /^\d{1,10}$/;

// Mounted only while the dialog is open, so every billing pass starts with an
// empty field without any reset bookkeeping.
const BillNumberForm = ({ onClose, onConfirm, title, message }) => {
  const [billNumber, setBillNumber] = useState('');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const value = billNumber.trim();
    if (!BILL_NUMBER.test(value)) {
      setError('Enter the bill number to continue.');
      return;
    }
    onConfirm(value);
    onClose();
  };

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <form className="srf-modal-panel max-w-sm" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="px-5 pt-6 pb-5 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-600 ring-8 ring-orange-100">
            <Receipt className="h-5 w-5" />
          </span>
          <h3 className="mt-4 font-display text-base font-bold text-slate-900">{title}</h3>
          {message && <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{message}</p>}

          <div className="mt-4 text-left">
            <label htmlFor="bill-number" className="mb-1.5 block">Bill number</label>
            <input
              id="bill-number"
              type="text"
              inputMode="numeric"
              autoFocus
              autoComplete="off"
              maxLength={10}
              value={billNumber}
              onChange={(e) => {
                setBillNumber(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
              className="w-full font-mono tracking-wider"
              placeholder="e.g. 12345"
            />
            {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
          <button type="button" onClick={onClose} className="srf-btn srf-btn-secondary w-full">
            Cancel
          </button>
          <button type="submit" className="srf-btn w-full bg-orange-600 text-white hover:bg-orange-500">
            Mark Billed
          </button>
        </div>
      </form>
    </div>
  );
};

// Confirmation for the "rolled" → "billed" move. Whoever bills the order types
// the bill number in here; onConfirm receives it and never fires without one.
const BillNumberModal = ({ isOpen, onClose, onConfirm, title = 'Mark as Billed', message }) => {
  if (!isOpen) return null;
  return <BillNumberForm onClose={onClose} onConfirm={onConfirm} title={title} message={message} />;
};

export default BillNumberModal;
