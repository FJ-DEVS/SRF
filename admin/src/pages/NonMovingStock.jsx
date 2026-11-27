import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import PdfButton from '../components/PdfButton';
import { downloadReportPdf } from '../utils/reportPdf';
import { categoryLabel } from '../utils/categorySales';
import { Search, FileSpreadsheet, ArrowUpRight, X } from 'lucide-react';

// Items that haven't sold a single piece for 1, 2, 3 … 6+ months, with the
// stock, value and reorder level each one holds — so slow lines can be
// cleared and their reorder levels brought down before more is bought.
// A threshold is "at least": 3+ months includes everything idle for 6.

const THRESHOLDS = [1, 2, 3, 4, 5, 6];
const PAGE = 50;
const SORTS = {
  value: { label: 'Value, highest first', fn: (a, b) => b.value - a.value },
  pieces: { label: 'Stock, most first', fn: (a, b) => b.quantity - a.quantity },
  idle: { label: 'Longest without a sale', fn: (a, b) => b.idleDays - a.idleDays || b.value - a.value },
  reorder: { label: 'Reorder level, highest first', fn: (a, b) => (b.reorderLevel ?? -1) - (a.reorderLevel ?? -1) }
};

const num = (n) => Number(n || 0).toLocaleString('en-IN');
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
// ₹12.3 L, ₹1.2 Cr — for the tiles
const moneyShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)} L`;
  return money(v);
};
const day = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const idleText = (r) => (r.idleMonths >= 6 ? '6+ months' : `${r.idleMonths} month${r.idleMonths === 1 ? '' : 's'}`);

const NonMovingStock = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [withEmpty, setWithEmpty] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [months, setMonths] = useState(3);
  const [category, setCategory] = useState(null); // null: all
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('value');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let stale = false;
    api
      .get('/stock-health/non-moving', { params: withEmpty ? { empty: 1 } : {} })
      .then((res) => {
        if (stale) return;
        if (res.data.success) {
          setData(res.data.data);
          setError('');
        } else setError(res.data.message || 'Could not load');
      })
      .catch((e) => {
        if (!stale) setError(e.response?.data?.message || 'Could not load non-moving stock');
      });
    return () => {
      stale = true;
    };
  }, [withEmpty, attempt]);

  const items = useMemo(() => data?.items || [], [data]);

  // Each threshold's totals, for the tiles
  const tiles = useMemo(
    () =>
      THRESHOLDS.map((m) => {
        const list = items.filter((r) => r.idleMonths >= m);
        return {
          months: m,
          items: list.length,
          pieces: list.reduce((a, r) => a + r.quantity, 0),
          value: list.reduce((a, r) => a + r.value, 0)
        };
      }),
    [items]
  );

  const atThreshold = useMemo(() => items.filter((r) => r.idleMonths >= months), [items, months]);

  // Per category, at the chosen threshold
  const byCategory = useMemo(() => {
    const map = new Map();
    for (const r of atThreshold) {
      if (!map.has(r.category)) map.set(r.category, { category: r.category, items: 0, pieces: 0, value: 0, reorder: 0, withReorder: 0 });
      const c = map.get(r.category);
      c.items += 1;
      c.pieces += r.quantity;
      c.value += r.value;
      if (r.reorderLevel) {
        c.reorder += r.reorderLevel;
        c.withReorder += 1;
      }
    }
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [atThreshold]);

  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return atThreshold
      .filter((r) => category === null || r.category === category)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
      .sort(SORTS[sort].fn);
  }, [atThreshold, category, query, sort]);
  const shown = showAll ? listed : listed.slice(0, PAGE);

  const scope = [
    `Not sold for ${months === 6 ? '6 months or more' : `${months}+ month${months === 1 ? '' : 's'}`}`,
    category !== null ? `Category: ${categoryLabel(category)}` : 'All categories',
    ...(query.trim() ? [`Search: "${query.trim()}"`] : []),
    withEmpty ? 'Items with no stock included' : 'Items holding stock only'
  ];
  const listTotals = {
    pieces: listed.reduce((a, r) => a + r.quantity, 0),
    value: listed.reduce((a, r) => a + r.value, 0),
    reorder: listed.reduce((a, r) => a + (r.reorderLevel || 0), 0)
  };

  const exportPdf = () =>
    downloadReportPdf({
      title: 'Non-moving stock',
      subtitle: `Items that haven't sold a single piece — as of ${day(data.asOf)}`,
      details: scope,
      tables: [
        {
          title: 'By category',
          head: [['Category', 'Items', 'Stock (pcs)', 'Value', 'Reorder level']],
          body: byCategory
            .filter((c) => category === null || c.category === category)
            .map((c) => [categoryLabel(c.category), num(c.items), num(c.pieces), money(c.value), c.withReorder ? num(c.reorder) : '-'])
        },
        {
          title: 'Items',
          head: [['Item', 'Category', 'Stock', 'Price', 'Value', 'Reorder level', 'Last sold', 'Not sold for']],
          body: listed.map((r) => [
            r.name,
            categoryLabel(r.category),
            num(r.quantity),
            money(r.price),
            money(r.value),
            r.reorderLevel == null ? '-' : num(r.reorderLevel),
            r.neverSold ? `Never (added ${day(r.idleSince)})` : day(r.lastSoldAt),
            idleText(r)
          ]),
          foot: [['Total', '', num(listTotals.pieces), '', money(listTotals.value), num(listTotals.reorder), '', '']]
        }
      ]
    });

  const exportExcel = () => {
    const rows = listed.map((r) => ({
      Item: r.name,
      Category: categoryLabel(r.category),
      Stock: r.quantity,
      Price: r.price,
      Value: r.value,
      'Reorder level': r.reorderLevel ?? '',
      'Last sold': r.neverSold ? 'Never' : day(r.lastSoldAt),
      'Counted from': day(r.idleSince),
      'Not sold for (months)': r.idleMonths >= 6 ? '6+' : r.idleMonths,
      'Not sold for (days)': r.idleDays
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Non-moving stock');
    XLSX.writeFile(wb, `non-moving-stock-${months}m_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="srf-page">
      <PageHeader
        title="Non-moving Stock"
        subtitle="Items that haven't sold a single piece for a month or more — the stock, value and reorder level each one holds"
      />

      {error && !data && (
        <div className="srf-card flex flex-col items-center gap-2 p-10 text-center text-[13px] text-slate-500">
          {error}
          <button type="button" className="srf-btn srf-btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}

      {!data && !error && (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-500" />
        </div>
      )}

      {data && (
        <>
          {/* One tile per threshold — the chosen one lists below */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
            {tiles.map((t) => {
              const on = t.months === months;
              return (
                <button
                  key={t.months}
                  type="button"
                  onClick={() => {
                    setMonths(t.months);
                    setShowAll(false);
                  }}
                  aria-pressed={on}
                  className={`srf-card min-w-0 p-3.5 text-left transition ${
                    on ? 'ring-2 ring-indigo-500' : 'hover:ring-1 hover:ring-slate-300'
                  }`}
                >
                  <p className={`text-[11px] font-semibold uppercase tracking-wider ${on ? 'text-indigo-600' : 'text-slate-400'}`}>
                    No sale {t.months === 6 ? '6+ months' : `${t.months}+ month${t.months === 1 ? '' : 's'}`}
                  </p>
                  <p className="mt-1 truncate text-xl font-bold leading-tight text-slate-900">{moneyShort(t.value)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {num(t.items)} items · {num(t.pieces)} pcs
                  </p>
                </button>
              );
            })}
          </div>

          <div className="srf-toolbar !flex-row flex-wrap items-center gap-3">
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search item or category…"
                className="w-60 !pl-8"
                aria-label="Search items"
              />
            </label>
            <select
              value={category === null ? '__all__' : category}
              onChange={(e) => setCategory(e.target.value === '__all__' ? null : e.target.value)}
              aria-label="Category"
              className="max-w-[200px]"
            >
              <option value="__all__">All categories</option>
              {byCategory.map((c) => (
                <option key={c.category} value={c.category}>{categoryLabel(c.category)}</option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" className="max-w-[230px]">
              {Object.entries(SORTS).map(([k, s]) => (
                <option key={k} value={k}>{s.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-[12px] text-slate-600">
              <input type="checkbox" checked={withEmpty} onChange={(e) => setWithEmpty(e.target.checked)} className="!h-4 !w-4" />
              Include items with no stock
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={exportExcel} className="srf-btn srf-btn-secondary" disabled={!listed.length}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
              </button>
              <PdfButton onExport={exportPdf} />
            </div>
          </div>

          {/* By category */}
          <div className="srf-card overflow-hidden">
            <div className="px-4 pt-4 sm:px-5">
              <h3 className="font-display text-sm font-bold text-slate-900">By category</h3>
              <p className="text-[11px] text-slate-400">
                {scope[0]} · highest value first · click a category to list only its items
              </p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-max text-left text-[12px]">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-2 sm:px-5">Category</th>
                    <th className="px-3 py-2 text-right">Items</th>
                    <th className="px-3 py-2 text-right">Stock</th>
                    <th className="px-3 py-2 text-right">Value</th>
                    <th className="px-4 py-2 text-right sm:px-5" title="Sum of the reorder levels of these items">Reorder level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {byCategory.map((c) => (
                    <tr
                      key={c.category}
                      onClick={() => {
                        setCategory(category === c.category ? null : c.category);
                        setShowAll(false);
                      }}
                      className={`cursor-pointer hover:bg-slate-50/80 ${category === c.category ? 'bg-indigo-50/50' : ''}`}
                    >
                      <td className={`px-4 py-2 font-medium sm:px-5 ${c.category ? 'text-slate-800' : 'italic text-slate-500'}`}>
                        {categoryLabel(c.category)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{num(c.items)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{num(c.pieces)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{money(c.value)}</td>
                      <td className="px-4 py-2 text-right tabular-nums sm:px-5">
                        {c.withReorder ? (
                          <span className="font-semibold text-amber-700" title={`${c.withReorder} of these items still have a reorder level`}>
                            {num(c.reorder)}{' '}
                            <span className="font-normal text-slate-400">
                              · {c.withReorder} item{c.withReorder === 1 ? '' : 's'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {byCategory.length === 0 && (
                <p className="px-5 py-8 text-center text-[13px] text-slate-400">Every item has sold within this time. Nothing is sitting idle.</p>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="srf-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Items{category !== null ? ` — ${categoryLabel(category)}` : ''}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {num(listed.length)} items · {num(listTotals.pieces)} pcs · {money(listTotals.value)}
                  {listTotals.reorder ? ` · reorder levels add up to ${num(listTotals.reorder)} pcs` : ''}
                </p>
              </div>
              {category !== null && (
                <button type="button" onClick={() => setCategory(null)} className="srf-btn srf-btn-secondary">
                  <X className="h-3.5 w-3.5" /> All categories
                </button>
              )}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-max text-left text-[12px]">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-2 sm:px-5">Item</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2 text-right">Stock</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Value</th>
                    <th className="px-3 py-2 text-right">Reorder level</th>
                    <th className="px-3 py-2">Last sold</th>
                    <th className="px-4 py-2 text-right sm:px-5">Not sold for</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="max-w-[280px] truncate px-4 py-2 font-medium text-slate-800 sm:px-5" title={r.name}>{r.name}</td>
                      <td className={`px-3 py-2 ${r.category ? 'text-slate-600' : 'italic text-slate-400'}`}>{categoryLabel(r.category)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800">{num(r.quantity)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{money(r.price)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{money(r.value)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.reorderLevel ? (
                          isAdmin ? (
                            <Link
                              to={`/reorder-levels?search=${encodeURIComponent(r.name)}`}
                              className="inline-flex items-center gap-0.5 font-semibold text-amber-700 hover:text-amber-800 hover:underline"
                              title="Still has a reorder level — open it on Reorder Levels"
                            >
                              {num(r.reorderLevel)} <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="font-semibold text-amber-700" title="Still has a reorder level">{num(r.reorderLevel)}</span>
                          )
                        ) : (
                          <span className="text-slate-300">{r.reorderLevel === 0 ? '0' : '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.neverSold ? (
                          <span className="text-slate-400" title={`Added ${day(r.idleSince)}`}>Never · added {day(r.idleSince)}</span>
                        ) : (
                          day(r.lastSoldAt)
                        )}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-semibold tabular-nums sm:px-5 ${
                          r.idleMonths >= 6 ? 'text-rose-700' : r.idleMonths >= 3 ? 'text-rose-600' : 'text-amber-600'
                        }`}
                        title={`${num(r.idleDays)} days`}
                      >
                        {idleText(r)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {listed.length === 0 && (
                <p className="px-5 py-8 text-center text-[13px] text-slate-400">No items match.</p>
              )}
            </div>
            {listed.length > PAGE && (
              <div className="border-t border-slate-100 px-4 py-2.5 text-center sm:px-5">
                <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-500">
                  {showAll ? 'Show fewer' : `Show all ${num(listed.length)}`}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NonMovingStock;
