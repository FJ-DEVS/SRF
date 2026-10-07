import React, { useEffect, useState } from 'react';
import { Search, X, ChevronLeft, ChevronRight, Undo2, PackageSearch } from 'lucide-react';
import api from '../utils/api';
import StatusBadge from './StatusBadge';
import { formatMoney, formatDate, orderQty, itemsSummary } from '../utils/orderMath';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Sell orders whose goods have left the shelf — the only ones a return can
// come back from (mirrors RETURNABLE_STATUSES on the server)
const RETURNABLE = 'rolled,billed,delivered';
const PAGE_SIZE = 8;

// The body of the "return order" form, in two steps: find the sell order the
// goods came back from, then say how many of each of its lines is coming back.
//   value     { order, lines } — order is the chosen sell order (null while
//             searching); lines carry sold / returned / remaining per item and
//             the quantity being returned now
//   onChange  called with the next { order, lines }
//   showAlert the page's alert dialog, for load failures
const ReturnOrderPicker = ({ value, onChange, showAlert }) => {
  const { order, lines } = value;

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState(RETURNABLE);
  const [month, setMonth] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, status, month, year]);

  useEffect(() => {
    if (order) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/orders', {
          params: {
            type: 'sell order', status, search: debounced, month, year,
            sort: 'newest', page, limit: PAGE_SIZE
          }
        });
        if (cancelled) return;
        setResults(res.data.data || []);
        setTotal(res.data.pagination?.total || 0);
        setPages(res.data.pagination?.pages || 0);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order, debounced, status, month, year, page]);

  const pick = async (candidate) => {
    setPicking(true);
    try {
      const res = await api.get(`/orders/${candidate._id}/returnable`);
      const { order: source, items } = res.data.data;
      onChange({
        order: source,
        lines: items.map((l) => ({
          itemId: l.item?._id || l.item,
          name: l.item?.name || 'Deleted item',
          price: l.item?.price || 0,
          category: l.item?.category || '',
          ordered: l.ordered,
          returned: l.returned,
          remaining: l.remaining,
          quantity: 0
        }))
      });
    } catch (error) {
      showAlert?.('Error', error.response?.data?.message || 'Could not load that order', 'error');
    } finally {
      setPicking(false);
    }
  };

  const setQty = (itemId, raw) => {
    onChange({
      order,
      lines: lines.map((l) =>
        l.itemId === itemId
          ? { ...l, quantity: Math.max(0, Math.min(l.remaining, parseInt(raw, 10) || 0)) }
          : l
      )
    });
  };

  /* ---------- Step 2: quantities coming back ---------- */

  if (order) {
    const returningQty = lines.reduce((sum, l) => sum + l.quantity, 0);
    const returningValue = lines.reduce((sum, l) => sum + l.quantity * l.price, 0);
    const nothingLeft = lines.every((l) => l.remaining === 0);

    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-rose-600 ring-1 ring-rose-200">
            <Undo2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-600">Returning from</p>
            <p className="truncate text-sm font-semibold text-slate-900">{order.customerName?.name || '—'}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
              <span className="font-mono">#{order._id.slice(-8)}</span>
              <span>· {formatDate(order.createdAt)}</span>
              {order.billNumber && <span>· Bill #{order.billNumber}</span>}
              <StatusBadge status={order.status} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange({ order: null, lines: [] })}
            className="srf-btn srf-btn-secondary shrink-0 !px-2.5 !py-1.5 text-xs"
          >
            Change
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-2 py-2 text-right">Sold</th>
                <th className="px-2 py-2 text-right">Returned</th>
                <th className="px-2 py-2 text-right">Left</th>
                <th className="px-3 py-2 text-right">Return now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.itemId} className={l.remaining === 0 ? 'opacity-50' : ''}>
                  <td className="max-w-[220px] px-3 py-2">
                    <p className="truncate font-semibold text-slate-900" title={l.name}>{l.name}</p>
                    <p className="truncate text-[11px] text-slate-400">
                      {l.category ? `${l.category} · ` : ''}{formatMoney(l.price)} each
                    </p>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-700">{l.ordered}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-500">{l.returned}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-900">{l.remaining}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max={l.remaining}
                        value={l.quantity}
                        disabled={l.remaining === 0}
                        onChange={(e) => setQty(l.itemId, e.target.value)}
                        className="w-18 !px-2 !py-1.5 text-center disabled:cursor-not-allowed disabled:bg-slate-50"
                        aria-label={`Quantity of ${l.name} to return`}
                      />
                      <button
                        type="button"
                        disabled={l.remaining === 0}
                        onClick={() => setQty(l.itemId, l.remaining)}
                        className="srf-chip disabled:cursor-not-allowed disabled:opacity-40"
                        title="Return everything left on this line"
                      >
                        All
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-3.5 py-2.5">
            <p className="text-[13px] font-bold text-slate-900">
              Returning
              <span className="ml-1.5 text-[11px] font-medium tabular-nums text-slate-400">{returningQty} pcs</span>
            </p>
            <p className="font-display text-base font-bold tabular-nums text-rose-600">−{formatMoney(returningValue)}</p>
          </div>
        </div>

        {nothingLeft && (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-center text-xs text-slate-400">
            Everything on this order has already been returned.
          </p>
        )}
      </div>
    );
  }

  /* ---------- Step 1: find the sell order ---------- */

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, bill number or order ID…"
            className="w-full !pl-9 !pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value={RETURNABLE}>Any returnable status</option>
          <option value="delivered">Delivered</option>
          <option value="billed">Billed</option>
          <option value="rolled">Rolled</option>
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          <option value="">All months</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <PackageSearch className="h-6 w-6 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">No sell orders match</p>
            <p className="mt-0.5 text-xs text-slate-400">
              Only rolled, billed or delivered sell orders can take a return. Try another search or period.
            </p>
          </div>
        ) : (
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto scrollbar-thin">
            {results.map((o) => {
              const created = new Date(o.createdAt);
              return (
                <li key={o._id}>
                  <button
                    type="button"
                    onClick={() => pick(o)}
                    disabled={picking}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-rose-50/50 disabled:cursor-wait"
                  >
                    <div className="w-12 shrink-0">
                      <p className="text-[12px] font-semibold text-slate-800">
                        {created.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </p>
                      <p className="text-[10px] text-slate-400">{created.getFullYear()}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-900">{o.customerName?.name || '—'}</p>
                      <p className="truncate text-[11px] text-slate-400">{itemsSummary(o)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={o.status} />
                      <span className="text-[11px] tabular-nums text-slate-500">
                        {o.billNumber ? `Bill #${o.billNumber} · ` : ''}{orderQty(o)} pcs
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-3.5 py-2 text-[11px] text-slate-500">
            <span className="tabular-nums">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="srf-icon-btn disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="srf-icon-btn disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReturnOrderPicker;
