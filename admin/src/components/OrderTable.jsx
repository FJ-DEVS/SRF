import React from 'react';
import StatusBadge from './StatusBadge';
import TypeBadge from './TypeBadge';
import BillBadge from './BillBadge';
import CargoBadge from './CargoBadge';
import OrderItemsList from './OrderItemsList';
import { typeStyle } from '../utils/orderType';
import { orderTotal, orderQty, formatMoney } from '../utils/orderMath';

// Desktop order list. What is in the order sits in the middle of the row so a
// scan down the table reads: who, what, how it ships, where it stands, how much.
//   onRowClick     opens the order (the whole row is clickable)
//   renderActions  buttons for the last column; clicks there do not open the row
const OrderTable = ({ orders, onRowClick, renderActions }) => (
  <table className="srf-table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Customer</th>
        <th className="w-[32%]">Items</th>
        <th>Cargo</th>
        <th>Status</th>
        <th className="text-right">Amount</th>
        {renderActions && <th className="text-right">Actions</th>}
      </tr>
    </thead>
    <tbody>
      {orders.map((order) => {
        const created = new Date(order.createdAt);
        return (
          <tr
            key={order._id}
            className={`${onRowClick ? 'cursor-pointer' : ''} ${typeStyle(order.type).row}`}
            onClick={onRowClick ? () => onRowClick(order) : undefined}
          >
            <td className="whitespace-nowrap">
              <p className="font-semibold text-slate-800">
                {created.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </p>
              <p className="text-[11px] text-slate-400">
                {created.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </td>
            <td className="max-w-[220px]">
              <p className="truncate text-sm font-semibold text-slate-900" title={order.customerName?.name}>
                {order.customerName?.name || '—'}
              </p>
              <div className="mt-1">
                <TypeBadge type={order.type} />
              </div>
            </td>
            <td className="min-w-[240px]">
              <OrderItemsList items={order.items} max={3} />
            </td>
            <td className="max-w-[170px]">
              <CargoBadge cargo={order.cargo} />
            </td>
            <td>
              <div className="flex flex-col items-start gap-1">
                <StatusBadge status={order.status} />
                <BillBadge number={order.billNumber} />
              </div>
            </td>
            <td className="whitespace-nowrap text-right">
              <p className="font-display text-[15px] font-bold tabular-nums text-slate-900">
                {formatMoney(orderTotal(order))}
              </p>
              <p className="text-[11px] font-medium tabular-nums text-slate-400">{orderQty(order)} pcs</p>
            </td>
            {renderActions && (
              <td>
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  {renderActions(order)}
                </div>
              </td>
            )}
          </tr>
        );
      })}
    </tbody>
  </table>
);

export default OrderTable;
