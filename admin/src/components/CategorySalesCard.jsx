import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import MonthlyLinesChart, { SeriesPicker } from './MonthlyLinesChart';
import { useSeriesSelection } from '../utils/seriesColors';
import { RANGE_LABELS, categoryId, categoryName, categoryLabel } from '../utils/categorySales';
import { CalendarRange, Layers } from 'lucide-react';

const RANGE_KEY = 'dashboard.categorySales.months';

const readRange = () => {
  try {
    const n = Number(localStorage.getItem(RANGE_KEY));
    return RANGE_LABELS[n] ? n : 12;
  } catch {
    return 12;
  }
};

// Dashboard: pieces sold per item category, month by month, one line each.
// Which categories are drawn is picked here and remembered; a line (or its
// name in the legend) opens that category's salesman breakdown.
const CategorySalesCard = () => {
  const navigate = useNavigate();
  const [months, setMonths] = useState(readRange);
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
        const res = await api.get('/orders/stats/category-sales', { params: { months } });
        if (!stale && res.data.success) setData(res.data.data);
      } catch (error) {
        console.error('Error fetching category sales:', error);
        if (!stale) setFailed(true);
      } finally {
        if (!stale) setLoading(false);
      }
    };
    load();
    return () => {
      stale = true;
    };
  }, [months, attempt]);

  const pickRange = (value) => {
    setMonths(value);
    try {
      localStorage.setItem(RANGE_KEY, String(value));
    } catch {
      // not remembered — fine
    }
  };

  const options = useMemo(
    () =>
      data
        ? [...data.categories]
            .sort((a, b) => b.total - a.total)
            .map((c) => ({ id: categoryId(c.name), label: categoryLabel(c.name), total: c.total, monthly: c.monthly }))
        : null,
    [data]
  );
  const { selection, add, remove } = useSeriesSelection(options, 'dashboard.categorySales.selection');

  const byId = useMemo(() => new Map((options || []).map((o) => [o.id, o])), [options]);
  const series = selection.map((s) => ({ ...byId.get(s.id), slot: s.slot })).filter((s) => s.monthly);
  const shownTotal = series.reduce((sum, s) => sum + s.total, 0);

  const open = (id) =>
    navigate(`/category-sales?category=${encodeURIComponent(categoryName(id))}&months=${months}`);

  return (
    <div className={`srf-card p-4 transition-opacity sm:p-5 ${loading && data ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-bold text-slate-900">Category Sales</h3>
          <p className="text-[11px] text-slate-400">
            Billed pieces per category, by the month they were billed, less returns in the month they came
            back. Click a line for the salesman breakdown.
          </p>
        </div>
        <label className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <CalendarRange className="h-3.5 w-3.5" /> Last
          </span>
          <select value={months} onChange={(e) => pickRange(Number(e.target.value))}>
            {Object.entries(RANGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {loading && !data ? (
        <div className="flex h-72 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-500" />
        </div>
      ) : failed && !data ? (
        <div className="flex h-72 flex-col items-center justify-center gap-2 text-center">
          <p className="text-[13px] text-slate-500">Couldn&apos;t load category sales.</p>
          <button type="button" className="srf-btn srf-btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : !options?.length ? (
        <div className="flex h-72 flex-col items-center justify-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Layers className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-700">No categories yet</p>
        </div>
      ) : (
        <>
          <div className="mt-3">
            <SeriesPicker
              options={options}
              selection={selection}
              onAdd={add}
              onRemove={remove}
              onOpen={open}
              noun="category"
            />
          </div>
          {series.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-center text-[13px] text-slate-400">
              Add a category to draw its line.
            </div>
          ) : (
            <>
              <div className="mt-3">
                <MonthlyLinesChart months={data.months} series={series} onSeriesClick={open} height={300} />
              </div>
              {shownTotal === 0 && (
                <p className="mt-1 text-center text-[11px] text-slate-400">
                  Nothing sold in these categories over the last {RANGE_LABELS[months]}.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default CategorySalesCard;
