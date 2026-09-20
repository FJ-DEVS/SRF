import React from 'react';
import StatusBadge from './StatusBadge';
import TypeBadge from './TypeBadge';
import BillBadge from './BillBadge';
import { X, Package, Truck, Layers, IndianRupee } from 'lucide-react';
import { orderTotal, orderQty, formatMoney, formatDateTime } from '../utils/orderMath';

const Stat = ({ icon, label, value, sub, accent = false, muted = false }) => {
  const Icon = icon;
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p
        className={`mt-0.5 truncate font-display text-base font-bold tabular-nums ${
          accent ? 'text-indigo-600' : muted ? 'text-slate-400' : 'text-slate-900'
        }`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </p>
      {sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
};

// Read-only view of one order. The summary strip answers the first questions
// (how much, how many, which cargo) before the eye reaches the item lines.
// `actions` is rendered in the footer next to Close, so each screen decides
// what (if anything) can be done from here.
const OrderDetailModal = ({ isOpen, onClose, order, actions = null }) => {
  if (!isOpen || !order) return null;

  const items = order.items || [];
  const cargoName = order.cargo?.name;

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <div className="srf-modal-panel max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="srf-modal-header">
          <div className="min-w-0">
            <h3 className="srf-modal-title">Order Details</h3>
            <p className="text-[11px] text-slate-400">
              <span className="font-mono">#{order._id.slice(-8)}</span> · {formatDateTime(order.createdAt)}
            </p>
          </div>
          <button onClick={onClose} className="srf-icon-btn shrink-0" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="srf-modal-body space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            <TypeBadge type={order.type} />
            <BillBadge number={order.billNumber} />
          </div>

          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={IndianRupee} label="Amount" value={formatMoney(orderTotal(order))} accent />
            <Stat
              icon={Layers}
              label="Quantity"
              value={`${orderQty(order)} pcs`}
              sub={`${items.length} item${items.length === 1 ? '' : 's'}`}
            />
            <Stat icon={Truck} label="Cargo" value={cargoName || 'No cargo'} muted={!cargoName} />
          </div>

          {/* Party */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {order.type === 'purchase order' ? 'Vendor' : 'Customer'}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{order.customerName?.name || '—'}</p>
            <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
              {order.customerName?.phone && <span>{order.customerName.phone}</span>}
              {order.customerName?.gstin && <span>GSTIN: {order.customerName.gstin}</span>}
            </div>
          </div>

          {/* Items */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Items ({items.length})
            </p>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="divide-y divide-slate-100">
                {items.map((oi, idx) => {
                  const price = oi.item?.price || 0;
                  return (
                    <div key={oi._id || idx} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <Package className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {oi.item?.name || 'Deleted item'}
                        </p>
                        <p className="truncate text-[11px] text-slate-400">
                          {oi.item?.category ? `${oi.item.category} · ` : ''}
                          {formatMoney(price)} each
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-slate-900/[0.06] px-2 py-0.5 text-[12px] font-bold tabular-nums text-slate-900">
                        × {oi.quantity}
                      </span>
                      <p className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-slate-900">
                        {formatMoney(price * oi.quantity)}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-3.5 py-2.5">
                <p className="text-[13px] font-bold text-slate-900">
                  Total
                  <span className="ml-1.5 text-[11px] font-medium tabular-nums text-slate-400">{orderQty(order)} pcs</span>
                </p>
                <p className="font-display text-base font-bold tabular-nums text-indigo-600">
                  {formatMoney(orderTotal(order))}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            <span>
              Created by{' '}
              <span className="font-semibold text-slate-700">
                {order.createdByType === 'admin' ? 'Admin' : (order.createdBy?.name || '—')}
              </span>
            </span>
          </div>

          {order.notes && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-amber-900">{order.notes}</p>
            </div>
          )}
        </div>

        <div className="srf-modal-footer">
          <button onClick={onClose} className="srf-btn srf-btn-secondary">Close</button>
          {actions}
        </div>
      </div>
    </div>
  );
};

export default OrderDetailModal;
