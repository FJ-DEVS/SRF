import React from 'react';
import StatusBadge from './StatusBadge';
import TypeBadge from './TypeBadge';
import { X, Truck } from 'lucide-react';

const orderTotal = (order) =>
  (order.items || []).reduce((total, oi) => total + (oi.item?.price || 0) * oi.quantity, 0);

const orderQty = (order) =>
  (order.items || []).reduce((total, oi) => total + (oi.quantity || 0), 0);

// Read-only view of one order. `actions` is rendered in the footer next to
// Close, so each screen decides what (if anything) can be done from here.
const OrderDetailModal = ({ isOpen, onClose, order, actions = null }) => {
  if (!isOpen || !order) return null;

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <div className="srf-modal-panel max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="srf-modal-header">
          <div className="min-w-0">
            <h3 className="srf-modal-title">Order Details</h3>
            <p className="text-[11px] text-slate-400">
              {new Date(order.createdAt).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
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
            {order.cargo?.name && (
              <span className="srf-badge bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
                <Truck className="h-3 w-3" /> {order.cargo.name}
              </span>
            )}
            <span className="ml-auto text-[11px] text-slate-400">
              ID: <span className="font-mono">{order._id.slice(-8)}</span>
            </span>
          </div>

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

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Order Items ({order.items.length})
            </p>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Item</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Price</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Qty</th>
                    <th className="px-3.5 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map((orderItem, index) => (
                    <tr key={index}>
                      <td className="px-3.5 py-2.5 text-[13px] font-medium text-slate-800">
                        {orderItem.item?.name || 'Unknown Item'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-[13px] text-slate-600">
                        ₹{(orderItem.item?.price || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-[13px] font-semibold text-slate-800">
                        {orderItem.quantity}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right text-[13px] font-semibold text-slate-900">
                        ₹{((orderItem.item?.price || 0) * orderItem.quantity).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50/80">
                    <td className="px-3.5 py-2.5 text-[13px] font-bold text-slate-900">Total</td>
                    <td />
                    <td className="px-3 py-2.5 text-right text-[13px] font-bold text-slate-900">{orderQty(order)}</td>
                    <td className="px-3.5 py-2.5 text-right font-display text-sm font-bold text-indigo-600">
                      ₹{orderTotal(order).toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
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
