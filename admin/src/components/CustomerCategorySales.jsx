import React, { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import MonthlyLinesChart, { SeriesPicker } from './MonthlyLinesChart';
import { useSeriesSelection, SERIES_COLORS } from '../utils/seriesColors';
import { RANGE_LABELS, categoryId, categoryLabel } from '../utils/categorySales';
import { CalendarRange, Layers } from 'lucide-react';

const num = (n) => Number(n || 0).toLocaleString('en-IN');

// Inside a customer's details: which categories they buy most, and the
// category lines month by month — the dashboard's Category Sales chart for
// this one customer. Billed orders only, less returns in the month they came
// back.
const CustomerCategorySales = ({ customerId }) => {
  const [months, setMonths] = useState(12);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stale = false;
    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await api.get(`/orders/stats/category-sales/customer/${customerId}`, { params: { months } });
        if (!stale && res.data.success) setData(res.data.data);
      } catch (error) {
        console.error('Error fetching customer category sales:', error);
        if (!stale) setFailed(true);
      } finally {
        if (!stale) setLoading(false);
      }
    };
    load();
    return () => {
      stale = true;
    };
  }, [customerId, months, attempt]);

  // Busiest first (the server sends them that way)
  const options = useMemo(
    () =>
      data
        ? data.categories.map((c) => ({
            id: categoryId(c.name),
            label: categoryLabel(c.name),
            total: c.total,
            returned: c.returned,
            monthly: c.monthly
          }))
        : null,
    [data]
  );
  const { selection, add, remove } = useSeriesSelection(options, null);
  const slotById = new Map(selection.map((s) => [s.id, s.slot]));
  const byId = useMemo(() => new Map((options || []).map((o) => [o.id, o])), [options]);
  const series = selection.map((s) => ({ ...byId.get(s.id), slot: s.slot })).filter((s) => s.monthly);
  const top = Math.max(1, ...(options || []).map((o) => o.total));

  return (
    <div className={`rounded-xl ring-1 ring-slate-200/70 transition-opacity ${loading && data ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-900">Purchases by category</h4>
          <p className="text-[11px] text-slate-400">
            Billed pieces, by the month they were billed, less returns in the month they came back
          </p>
        </div>
        <label className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <CalendarRange className="h-3.5 w-3.5" /> Last
          </span>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {Object.entries(RANGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && !data ? (
        <div className="flex h-56 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-500" />
        </div>
      ) : failed && !data ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 text-center">
          <p className="text-[13px] text-slate-500">Couldn&apos;t load this customer&apos;s purchases.</p>
          <button type="button" className="srf-btn srf-btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : !options?.length ? (
        <div className="flex h-56 flex-col items-center justify-center text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Layers className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-700">Nothing billed</p>
          <p className="text-[12px] text-slate-400">No billed orders in the last {RANGE_LABELS[months]}.</p>
        </div>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          {/* Lines */}
          <div className="min-w-0">
            <SeriesPicker options={options} selection={selection} onAdd={add} onRemove={remove} noun="category" />
            {series.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-slate-400">Add a category to draw its line.</p>
            ) : (
              <div className="mt-3">
                <MonthlyLinesChart months={data.months} series={series} height={260} />
              </div>
            )}
          </div>

          {/* Ranking */}
          <div className="min-w-0">
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Top categories</p>
              <p className="text-[11px] text-slate-400">
                <span className="font-semibold text-slate-700">{num(data.total)}</span> pcs
                {data.returned > 0 && <> · <span className="text-rose-600">{num(data.returned)} returned</span></>}
              </p>
            </div>
            <ol className="mt-2 space-y-2.5">
              {options.map((o) => {
                const slot = slotById.get(o.id);
                return (
                  <li key={o.id}>
                    <div className="flex items-center gap-2 text-[12px]">
                      <span
                        className="h-0.5 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: slot !== undefined ? SERIES_COLORS[slot] : '#cbd5e1' }}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{o.label}</span>
                      <span className="font-semibold tabular-nums text-slate-900">{num(o.total)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 pl-5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-slate-400"
                          style={{ width: `${Math.max(0, (o.total / top) * 100)}%` }}
                        />
                      </div>
                      {o.returned > 0 && (
                        <span className="shrink-0 text-[10px] tabular-nums text-rose-600">−{num(o.returned)}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerCategorySales;
