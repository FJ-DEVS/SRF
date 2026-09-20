import React from 'react';
import { Package } from 'lucide-react';
import { formatMoney } from '../utils/orderMath';

// The items on an order, name and quantity first. Every list and card shows
// this so nobody has to open an order to learn what is in it.
//   max         lines shown before collapsing the rest into "+N more"
//   showAmount  adds the line amount (price × qty) on the right
const OrderItemsList = ({ items = [], max = 3, showAmount = false, className = '' }) => {
  if (items.length === 0) {
    return <p className={`text-[12px] italic text-slate-400 ${className}`}>No items</p>;
  }

  const visible = items.slice(0, max);
  const hidden = items.length - visible.length;

  return (
    <ul className={`space-y-1 ${className}`}>
      {visible.map((oi, idx) => (
        <li key={oi._id || idx} className="flex min-w-0 items-center gap-2">
          <Package className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-900">
            {oi.item?.name || 'Deleted item'}
          </span>
          <span className="shrink-0 rounded-md bg-slate-900/[0.06] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-900">
            × {oi.quantity}
          </span>
          {showAmount && (
            <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums text-slate-600">
              {formatMoney((oi.item?.price || 0) * oi.quantity)}
            </span>
          )}
        </li>
      ))}
      {hidden > 0 && (
        <li className="pl-5.5 text-[11px] font-semibold text-indigo-600">
          +{hidden} more item{hidden === 1 ? '' : 's'}
        </li>
      )}
    </ul>
  );
};

export default OrderItemsList;
