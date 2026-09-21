import React from 'react';
import StatusBadge from './StatusBadge';
import TypeBadge from './TypeBadge';
import BillBadge from './BillBadge';
import CargoBadge from './CargoBadge';
import OrderItemsList from './OrderItemsList';
import { orderTotal, orderQty, formatMoney, formatDate } from '../utils/orderMath';

// One order as a card: who it is for, what is in it, how it ships and what it
// comes to — all readable without opening it. Used for the phone-width lists
// and the roller's queue.
//   onClick    opens the order (the card body is clickable)
//   actions    buttons for the bottom-right corner; clicks there do not open it
//   footer     full-width strip under the body (e.g. a "Mark as rolled" button)
//   maxItems   lines shown before collapsing the rest into "+N more"
//   showAmount shows the order total; off for rollers, who only need the work
//   className  wrapper classes — the caller decides on tint, ring, dividers
const OrderCard = ({ order, onClick, actions = null, footer = null, maxItems = 3, showAmount = true, className = '' }) => (
  <div className={className}>
    <div className={`p-3.5 ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-slate-900" title={order.customerName?.name}>
            {order.customerName?.name || '—'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">{formatDate(order.createdAt)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={order.status} />
          <BillBadge number={order.billNumber} />
        </div>
      </div>

      <div className="mt-2.5 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200/80">
        <OrderItemsList items={order.items} max={maxItems} />
      </div>

      {order.notes && (
        <p className="mt-2 truncate text-[11.5px] text-amber-700">
          <span className="font-semibold">Note:</span> {order.notes}
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <TypeBadge type={order.type} />
          <CargoBadge cargo={order.cargo} className="min-w-0" />
        </div>
        <p className="shrink-0 whitespace-nowrap text-right">
          {showAmount && (
            <span className="font-display text-[15px] font-bold tabular-nums text-slate-900">
              {formatMoney(orderTotal(order))}
            </span>
          )}
          <span className={`text-[11px] font-medium tabular-nums text-slate-400 ${showAmount ? 'ml-1.5' : ''}`}>
            {orderQty(order)} pcs
          </span>
        </p>
      </div>

      {actions && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
    {footer}
  </div>
);

export default OrderCard;
