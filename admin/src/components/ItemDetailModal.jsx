import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import StatusBadge from './StatusBadge';
import {
  X, IndianRupee, Boxes, AlertTriangle, ArrowDownToLine, ArrowUpFromLine,
  History, Undo2, ArrowRight
} from 'lucide-react';

// Recent-activity marker per order type — colours match TYPE_STYLES: stock
// coming in (emerald), going out (indigo), coming back (rose)
const ACTIVITY_MARKS = {
  'purchase order': { Icon: ArrowDownToLine, className: 'bg-emerald-50 text-emerald-600' },
  'sell order': { Icon: ArrowUpFromLine, className: 'bg-indigo-50 text-indigo-600' },
  'return order': { Icon: Undo2, className: 'bg-rose-50 text-rose-600' }
};

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// An item's price and stock with its purchase & sales insight. Footer actions
// come in as children, after Close; onViewOrders adds a link to the item's orders.
const ItemDetailModal = ({ item, onClose, onViewOrders, children }) => {
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get(`/items/${item._id}/stats`)
      .then((response) => {
        if (!cancelled && response.data.success) setStats(response.data.data);
      })
      .catch((error) => console.error('Error fetching item stats:', error))
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => { cancelled = true; };
  }, [item._id]);

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <div className="srf-modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="srf-modal-header">
          <div className="min-w-0">
            <h3 className="srf-modal-title truncate">{item.name}</h3>
            {item.category && (
              <span className="srf-badge mt-1 bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
                {item.category}
              </span>
            )}
          </div>
          <button onClick={onClose} className="srf-icon-btn shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="srf-modal-body space-y-4">
          {/* Price / stock tiles */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <IndianRupee className="h-3 w-3" /> Price
              </p>
              <p className="mt-1 font-display text-lg font-bold text-slate-900">
                ₹{item.price.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Boxes className="h-3 w-3" /> In Stock
              </p>
              <p className={`mt-1 font-display text-lg font-bold ${
                item.quantity === 0 ? 'text-rose-600' : item.belowCheckLevel ? 'text-amber-600' : 'text-slate-900'
              }`}>
                {item.quantity}
              </p>
              {item.effectiveCheckLevel != null && (
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Check level {item.effectiveCheckLevel}
                  {item.checkLevel == null && ' (from category)'}
                </p>
              )}
            </div>
          </div>

          {item.belowCheckLevel && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Stock has reached the check level — time to reorder.
            </div>
          )}

          {/* Purchase / sales stats */}
          {statsLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-slate-500" />
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                    <ArrowDownToLine className="h-3 w-3" /> Total Purchased
                  </p>
                  <p className="mt-1 font-display text-lg font-bold text-emerald-700">{stats.totalPurchased}</p>
                  <p className="text-[11px] text-emerald-600/70">
                    {stats.purchaseOrders} purchase order{stats.purchaseOrders === 1 ? '' : 's'}
                    {stats.pendingPurchase > 0 && ` · ${stats.pendingPurchase} pending`}
                  </p>
                </div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
                    <ArrowUpFromLine className="h-3 w-3" /> Total Sold
                  </p>
                  <p className="mt-1 font-display text-lg font-bold text-indigo-700">{stats.totalSold}</p>
                  <p className="text-[11px] text-indigo-600/70">
                    {stats.sellOrders} sell order{stats.sellOrders === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              {(stats.lastPurchase || stats.lastSold) && (
                <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                  {stats.lastPurchase && (
                    <p>
                      <span className="font-semibold text-slate-800">Last purchase:</span>{' '}
                      {stats.lastPurchase.quantity} unit{stats.lastPurchase.quantity === 1 ? '' : 's'} on{' '}
                      {formatDate(stats.lastPurchase.date)} ({stats.lastPurchase.status})
                    </p>
                  )}
                  {stats.lastSold && (
                    <p className={stats.lastPurchase ? 'mt-1' : ''}>
                      <span className="font-semibold text-slate-800">Last sold:</span>{' '}
                      {stats.lastSold.quantity} unit{stats.lastSold.quantity === 1 ? '' : 's'} on{' '}
                      {formatDate(stats.lastSold.date)}
                    </p>
                  )}
                </div>
              )}

              {/* Recent activity */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <History className="h-3.5 w-3.5" /> Recent activity
                  </p>
                  {onViewOrders && stats.recentActivity.length > 0 && (
                    <button
                      type="button"
                      onClick={onViewOrders}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
                    >
                      View all orders
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {stats.recentActivity.length === 0 ? (
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">
                    No orders yet for this item
                  </p>
                ) : (
                  <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {stats.recentActivity.map((a, i) => {
                      const { Icon, className } = ACTIVITY_MARKS[a.type] || ACTIVITY_MARKS['sell order'];
                      return (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${className}`}>
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-700">{a.partyName || '—'}</p>
                          <p className="text-[11px] text-slate-400">
                            {a.type === 'return order' && 'Return · '}{formatDate(a.date)}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-slate-700">× {a.quantity}</span>
                        <StatusBadge status={a.status} />
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">
              Could not load purchase statistics
            </p>
          )}

          <p className="text-[11px] text-slate-400">
            Added {formatDate(item.createdAt)} · Updated {formatDate(item.updatedAt)}
          </p>
        </div>

        <div className="srf-modal-footer">
          <button onClick={onClose} className="srf-btn srf-btn-secondary">Close</button>
          {children}
        </div>
      </div>
    </div>
  );
};

export default ItemDetailModal;
