import React from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

const TYPES = {
  error: {
    icon: AlertCircle,
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
  },
  success: {
    icon: CheckCircle2,
    iconWrap: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    button: 'srf-btn-success'
  }
};

const AlertModal = ({ isOpen, onClose, title, message, type = 'error' }) => {
  if (!isOpen) return null;

  const cfg = TYPES[type] || TYPES.error;
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

        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
          <button onClick={onClose} className={`srf-btn w-full ${cfg.button}`}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertModal;
