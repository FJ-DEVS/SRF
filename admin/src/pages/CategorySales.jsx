import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';
import MonthlyLinesChart, { SeriesPicker } from '../components/MonthlyLinesChart';
import { RANGE_LABELS, categoryLabel } from '../utils/categorySales';
import { useSeriesSelection, SERIES_COLORS } from '../utils/seriesColors';
import { ArrowLeft, CalendarRange, Users, Layers } from 'lucide-react';

const UNASSIGNED_ID = 'unassigned';
const num = (n) => Number(n || 0).toLocaleString('en-IN');

// One category's sales month by month, split by the salesman each customer is
// assigned to (not who keyed the order in). Opened from a line of the
// dashboard's Category Sales chart.
const CategorySales = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const months = RANGE_LABELS[Number(params.get('months'))] ? Number(params.get('months')) : 12;

  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stale = false;
    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await api.get('/orders/stats/category-sales/salesmen', { params: { category, months } });
        if (!stale && res.data.success) setData(res.data.data);
      } catch (error) {
        console.error('Error fetching category salesman sales:', error);
        if (!stale) setFailed(true);
      } finally {
        if (!stale) setLoading(false);
      }
    };
    load();
    return () => {
      stale = true;
    };
  }, [category, months, attempt]);

  // For the category switcher
  useEffect(() => {
    api
      .get('/categories')
      .then((res) => {
        const list = res.data?.data;
        if (Array.isArray(list)) setCategories(list.map((c) => c.name).filter(Boolean));
      })
      .catch(() => setCategories([]));
  }, []);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  // Salesmen busiest first, then the customers nobody is assigned to
  const rows = useMemo(() => {
    if (!data) return null;
    const salesmen = [...data.salesmen]
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      .map((s) => ({ id: String(s.salesmanId), label: s.name, total: s.total, returned: s.returned, monthly: s.monthly }));
    if (data.unassigned) {
      salesmen.push({ id: UNASSIGNED_ID, label: data.unassigned.name, total: data.unassigned.total, returned: data.unassigned.returned, monthly: data.unassigned.monthly, muted: true });
    }
    return salesmen;
  }, [data]);

  // The busiest salesmen until some are picked; picks carry over when
  // switching category, as the salesmen are the same people
  const { selection, add, remove } = useSeriesSelection(rows, null);
  const slotById = new Map(selection.map((s) => [s.id, s.slot]));
  const byId = useMemo(() => new Map((rows || []).map((r) => [r.id, r])), [rows]);
  const series = selection.map((s) => ({ ...byId.get(s.id), slot: s.slot })).filter((s) => s.monthly);

  const monthTotals = data ? data.months.map((_, i) => (rows || []).reduce((sum, r) => sum + (r.monthly[i] || 0), 0)) : [];
  const best = rows?.find((r) => r.id !== UNASSIGNED_ID && r.total > 0);
  const title = categoryLabel(category);

  return (
    <div className="srf-page">
      <PageHeader title={title} subtitle={`Sales by assigned salesman · last ${RANGE_LABELS[months]}`}>
        <button type="button" onClick={() => navigate(-1)} className="srf-btn srf-btn-secondary">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      </PageHeader>

      {/* Filters */}
      <div className="srf-toolbar !flex-row flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Layers className="h-3.5 w-3.5" /> Category
          </span>
          <select value={category} onChange={(e) => setParam('category', e.target.value)} className="max-w-[220px]">
            {!categories.includes(category) && <option value={category}>{title}</option>}
            {categories.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
            {category !== '' && <option value="">Uncategorised</option>}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <CalendarRange className="h-3.5 w-3.5" /> Last
          </span>
          <select value={months} onChange={(e) => setParam('months', e.target.value)}>
            {Object.entries(RANGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && !data ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
        </div>
      ) : failed && !data ? (
        <div className="srf-card flex flex-col items-center justify-center gap-2 p-10 text-center">
          <p className="text-[13px] text-slate-500">Couldn&apos;t load this category&apos;s sales.</p>
          <button type="button" className="srf-btn srf-btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : (
        <div className={`space-y-4 transition-opacity sm:space-y-5 ${loading ? 'opacity-60' : ''}`}>
          {/* Headline figures */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            <div className="srf-card p-3.5">
              <p className="text-xl font-bold leading-none text-slate-900">{num(data.total)}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">Pieces sold (net of returns)</p>
            </div>
            <div className="srf-card p-3.5">
              <p className="text-xl font-bold leading-none text-slate-900">{num(data.returned)}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">Pieces returned</p>
            </div>
            <div className="srf-card p-3.5">
              <p className="text-xl font-bold leading-none text-slate-900">
                {rows.filter((r) => r.id !== UNASSIGNED_ID && (r.total !== 0 || r.returned > 0)).length}
              </p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">Salesmen with sales</p>
            </div>
            <div className="srf-card p-3.5">
              <p className="truncate text-xl font-bold leading-none text-slate-900">{best ? best.label : '—'}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">
                Top salesman{best ? ` · ${num(best.total)} pcs` : ''}
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="srf-card p-4 sm:p-5">
            <h3 className="font-display text-sm font-bold text-slate-900">Salesman-wise sales</h3>
            <p className="text-[11px] text-slate-400">
              Billed pieces of {title} each month to each salesman&apos;s assigned customers, whoever placed the
              order, less returns in the month they came back. Uses today&apos;s assignments.
            </p>
            {rows.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-slate-400">No salesmen yet.</p>
            ) : (
              <>
                <div className="mt-3">
                  <SeriesPicker options={rows} selection={selection} onAdd={add} onRemove={remove} noun="salesman" />
                </div>
                {series.length === 0 ? (
                  <p className="py-12 text-center text-[13px] text-slate-400">Add a salesman to draw their line.</p>
                ) : (
                  <div className="mt-3">
                    <MonthlyLinesChart months={data.months} series={series} height={320} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Table — every salesman, every month */}
          <div className="srf-card overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 sm:px-5">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">Sales per salesman</h3>
                <p className="text-[11px] text-slate-400">Net pieces per month — billed, less returns</p>
              </div>
            </div>
            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Users className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-700">No salesmen yet</p>
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-max text-left text-[12px]">
                  <thead>
                    <tr className="border-y border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2 sm:px-5">Salesman</th>
                      {data.months.map((m) => (
                        <th key={m.key} className="px-3 py-2 text-right">{m.label}</th>
                      ))}
                      <th className="px-3 py-2 text-right">Returned</th>
                      <th className="px-4 py-2 text-right sm:px-5">Net total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => {
                      const slot = slotById.get(r.id);
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/60">
                          <td className="sticky left-0 z-10 bg-white px-4 py-2 sm:px-5">
                            <span className="flex items-center gap-2">
                              <span
                                className="h-0.5 w-3 shrink-0 rounded-full"
                                style={{ backgroundColor: slot !== undefined ? SERIES_COLORS[slot] : 'transparent' }}
                              />
                              <span className={`font-medium ${r.muted ? 'italic text-slate-500' : 'text-slate-800'}`}>{r.label}</span>
                            </span>
                          </td>
                          {r.monthly.map((n, i) => (
                            <td key={data.months[i].key} className={`px-3 py-2 text-right tabular-nums ${n ? 'text-slate-700' : 'text-slate-300'}`}>
                              {num(n)}
                            </td>
                          ))}
                          <td className={`px-3 py-2 text-right tabular-nums ${r.returned ? 'text-rose-600' : 'text-slate-300'}`}>{num(r.returned)}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900 sm:px-5">{num(r.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50/70 font-semibold">
                      <td className="sticky left-0 z-10 bg-slate-50 px-4 py-2 text-slate-600 sm:px-5">Total</td>
                      {monthTotals.map((n, i) => (
                        <td key={data.months[i].key} className="px-3 py-2 text-right tabular-nums text-slate-800">{num(n)}</td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums text-rose-600">{num(data.returned)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-900 sm:px-5">{num(data.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <p className="text-center text-[11px] text-slate-400">
            <Link to="/dashboard" className="font-semibold text-indigo-600 hover:text-indigo-500">Dashboard</Link>
            {' · '}only billed orders count; completed returns come off in the month they were recorded
          </p>
        </div>
      )}
    </div>
  );
};

export default CategorySales;
