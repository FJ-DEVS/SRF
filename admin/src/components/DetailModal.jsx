import React, { useState } from 'react';
import { X, Eye, EyeOff, Edit2 } from 'lucide-react';

const DetailModal = ({ isOpen, onClose, title, fields = [], onEdit }) => {
  const [visiblePasswords, setVisiblePasswords] = useState({});

  if (!isOpen) return null;

  const togglePasswordVisibility = (key) => {
    setVisiblePasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleClose = () => {
    setVisiblePasswords({});
    onClose();
  };

  const renderValue = (field) => {
    const { label, value, type, key } = field;

    if (value === null || value === undefined || value === '') {
      return <span className="text-slate-400 italic text-sm">—</span>;
    }

    switch (type) {
      case 'password': {
        const isVisible = visiblePasswords[key || label];
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-800 font-mono tracking-wider">
              {isVisible ? value : '••••••••'}
            </span>
            <button
              type="button"
              onClick={() => togglePasswordVisibility(key || label)}
              className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
            >
              {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        );
      }

      case 'badge': {
        const badgeColor = field.badgeColor || (value === true || value === 'Active' || value === 'active'
          ? 'bg-emerald-100 text-emerald-800'
          : value === false || value === 'Blocked' || value === 'blocked'
          ? 'bg-rose-100 text-rose-800'
          : value === 'pending'
          ? 'bg-amber-100 text-amber-800'
          : value === 'delivered'
          ? 'bg-blue-100 text-blue-800'
          : 'bg-slate-100 text-slate-700');
        return (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${badgeColor}`}>
            {typeof value === 'boolean' ? (value ? 'Active' : 'Blocked') : value}
          </span>
        );
      }

      case 'date':
        return (
          <span className="text-sm text-slate-800">
            {value ? new Date(value).toLocaleDateString('en-IN', {
              year: 'numeric', month: 'long', day: 'numeric'
            }) : '—'}
          </span>
        );

      case 'datetime':
        return (
          <span className="text-sm text-slate-800">
            {value ? new Date(value).toLocaleString('en-IN', {
              year: 'numeric', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit'
            }) : '—'}
          </span>
        );

      case 'currency':
        return (
          <span className="text-sm text-slate-800 font-medium">
            ₹{Number(value).toLocaleString('en-IN')}
          </span>
        );

      case 'boolean':
        return (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
            value ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {value ? 'Yes' : 'No'}
          </span>
        );

      case 'list':
        if (!Array.isArray(value) || value.length === 0) {
          return <span className="text-slate-400 italic text-sm">—</span>;
        }
        return (
          <div className="space-y-1">
            {value.map((item, idx) => (
              <div key={idx} className="text-sm text-slate-800">{item}</div>
            ))}
          </div>
        );

      default:
        return <span className="text-sm text-slate-800 break-words">{String(value)}</span>;
    }
  };

  return (
    <div className="srf-modal-backdrop" onClick={handleClose}>
      <div
        className="srf-modal-panel max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="srf-modal-header">
          <h3 className="srf-modal-title">{title}</h3>
          <button
            onClick={handleClose}
            className="srf-icon-btn"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fields */}
        <div className="srf-modal-body">
          <div className="divide-y divide-slate-100">
            {fields.map((field, idx) => (
              <div key={idx} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider w-32 flex-shrink-0 pt-0.5">
                  {field.label}
                </span>
                <div className="flex-1 min-w-0">
                  {renderValue(field)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="srf-modal-footer">
          <button onClick={handleClose} className="srf-btn srf-btn-secondary">
            Close
          </button>
          {onEdit && (
            <button
              onClick={() => {
                handleClose();
                onEdit();
              }}
              className="srf-btn srf-btn-primary"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DetailModal;
