import React from 'react';
import { AlertTriangle, Trash2, Info } from 'lucide-react';

const TYPES = {
  danger: {
    icon: Trash2,
    iconWrap: 'bg-rose-50 text-rose-600 ring-rose-100',
    button: 'srf-btn-danger'
  },
  warning: {
    icon: AlertTriangle,
    iconWrap: 'bg-amber-50 text-amber-600 ring-amber-100',
    button: 'bg-amber-500 text-white hover:bg-amber-400'
  },
  info: {
    icon: Info,
    iconWrap: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
    button: 'bg-indigo-600 text-white hover:bg-indigo-500'
  }
};

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, type = 'danger', confirmLabel = 'Confirm' }) => {
  if (!isOpen) return null;

  const cfg = TYPES[type] || TYPES.danger;
  const Icon = cfg.icon;

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <div className="srf-modal-panel max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-6 pb-5 text-center">
          <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ring-8 ${cfg.iconWrap}`}>
            <Icon className="h-5 w-5" />
          </span>
          <h3 className="mt-4 font-display text-base font-bold text-slate-900">{title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{message}</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
          <button onClick={onClose} className="srf-btn srf-btn-secondary w-full">
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`srf-btn w-full ${cfg.button}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
