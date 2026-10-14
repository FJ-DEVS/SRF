import React from 'react';
import { formatStatus } from '../utils/shareUtils';
import { typeStyle } from '../utils/orderType';
import logo1 from '../assets/logo1.png';

// The order receipt card that gets turned into the shared image — shown in
// the share modal, and rendered off-screen for the CRM's WhatsApp button
const OrderShareCard = ({ order }) => {
  // Format order data for display
  const orderType = typeStyle(order.type).label;
  const customerLabel = order.type === 'purchase order' ? 'Vendor' : 'Customer';
  const customerName = order.customerName?.name || '-';
  const date = new Date(order.createdAt).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const createdBy = order.createdByType === 'admin'
    ? 'Admin'
    : (order.createdBy?.name || '-');
  const cargoName = order.cargo?.name || 'No Cargo Assigned';
  const isCargoAssigned = !!order.cargo?.name;
  // const statusColor = STATUS_COLORS[order.status] || STATUS_COLORS.cancelled;
  const generatedOn = new Date().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const secondaryFields = [
    { label: 'Order Type', value: orderType },
    { label: customerLabel, value: customerName },
    { label: 'Date', value: date },
    { label: 'Order By', value: createdBy },
  ];

  return (
    <div className="share-modal-content bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 px-6 py-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-white p-1.5 shrink-0">
            <img src={logo1} alt="SRF" className="h-full w-full object-contain" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white leading-tight">SRF Trades</h2>
            <p className="text-[11px] font-medium text-slate-400 tracking-wide">Order Receipt</p>
          </div>
        </div>
        <span className="shrink-0 inline-flex h-7 items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 text-[11px] leading-none font-semibold text-white whitespace-nowrap">
          {orderType}
        </span>
      </div>

      <div className="p-6">
        {/* Items - primary focus */}
        <div className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
            Items
          </h3>
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 overflow-hidden">
            {order.items && order.items.length > 0 ? (
              order.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-4 px-4 py-3.5 border-b border-blue-100/70 last:border-0"
                >
                  <span className="text-[15px] font-bold text-slate-900">
                    {item.item?.name || 'Unknown'}
                  </span>
                  <span className="shrink-0 inline-flex h-6 items-center justify-center rounded-full  px-3 text-xs leading-none font-bold text-black whitespace-nowrap">
                    Qty {item.quantity}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-4 py-3.5 text-sm text-slate-400 italic">No items</div>
            )}
          </div>
        </div>

        {/* Secondary details - de-emphasized */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3.5 pt-4 border-t border-slate-100">
          {secondaryFields.map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-600">{value}</p>
            </div>
          ))}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Status</p>
            <span
              className="mt-1 inline-flex h-5 items-center justify-center rounded-full px-2 text-[11px] leading-none font-semibold"
              style={{  color: "black" }}
            >
              {formatStatus(order.status)}
            </span>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cargo</p>
            <p className={`mt-0.5 text-xs font-medium ${isCargoAssigned ? 'text-slate-600' : 'text-slate-400 italic'}`}>
              {cargoName}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-4">
          <span className="text-[10px] text-slate-400">Order ID: {order._id}</span>
          <span className="text-[10px] text-slate-400">Generated {generatedOn}</span>
        </div>
      </div>
    </div>
  );
};

export default OrderShareCard;
