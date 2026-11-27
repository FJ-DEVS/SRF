import React, { useMemo, useState } from 'react';
import ChartFrame from '../ChartFrame';
import MonthlyLinesChart, { SeriesPicker } from '../MonthlyLinesChart';
import { useSeriesSelection, SERIES_COLORS } from '../../utils/seriesColors';
import { RANGE_LABELS } from '../../utils/categorySales';
import { num, toSeries } from './salesReport';
import { Search, ChevronRight } from 'lucide-react';

const TABLE_PAGE = 25;

const Spinner = () => (
  <div className="flex h-64 items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-500" />
  </div>
);

// One sales breakdown (see salesReport.js) drawn as month-by-month lines, with
// its own pick of which lines to draw, plus — optionally — every row in a
// table. Clicking a line, a legend name or a table row calls onOpen with the
// row (`raw` is the category name, salesman id or customer id).
//   report: useSalesBreakdown(...) result
//   rangeControl: the page's month-range select, repeated in full screen
//   chart / table: leave either out
const BreakdownReport = ({
  report,
  months,
  title,
  subtitle,
  noun,
  storageKey = null,
  onOpen = null,
  chart = true,
  table = true,
  tableTitle,
  tableSubtitle,
  rangeControl = null,
  emptyText = 'Nothing billed in this period.'
}) => {
  const { data, loading, error, retry } = report;
  const options = useMemo(() => (data ? toSeries(data) : null), [data]);
  const { selection, add, remove } = useSeriesSelection(options, storageKey);
  const byId = useMemo(() => new Map((options || []).map((o) => [o.id, o])), [options]);
  const slotById = new Map(selection.map((s) => [s.id, s.slot]));
  const series = selection.map((s) => ({ ...byId.get(s.id), slot: s.slot })).filter((s) => s.monthly);
  const open = onOpen ? (id) => byId.get(id) && onOpen(byId.get(id)) : null;

  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!options) return [];
    return q
      ? options.filter((o) => o.label.toLowerCase().includes(q) || (o.salesman || '').toLowerCase().includes(q))
      : options;
  }, [options, query]);
  const shown = showAll ? filtered : filtered.slice(0, TABLE_PAGE);
  const hasSalesmanColumn = data?.by === 'customer';
  const fade = loading && data ? 'opacity-60' : '';

  if (!data) {
    return (
      <div className="srf-card p-4 sm:p-5">
        {error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <p className="text-[13px] text-slate-500">{error}</p>
            <button type="button" className="srf-btn srf-btn-secondary" onClick={retry}>Try again</button>
          </div>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }

  return (
    <>
      {chart && (
      <ChartFrame
        title={title}
        subtitle={subtitle}
        expandedActions={rangeControl}
        className={`transition-opacity ${fade}`}
      >
        {(expanded) =>
          options.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-slate-400">{emptyText}</p>
          ) : (
            <>
              <SeriesPicker
                options={options}
                selection={selection}
                onAdd={add}
                onRemove={remove}
                onOpen={open}
                noun={noun}
              />
              {series.length === 0 ? (
                <p className="py-16 text-center text-[13px] text-slate-400">Add a {noun} to draw its line.</p>
              ) : (
                <div className={expanded ? 'mt-3 min-h-0 flex-1' : 'mt-3'}>
                  <MonthlyLinesChart
                    months={data.months}
                    series={series}
                    onSeriesClick={open}
                    height={expanded ? '100%' : 300}
                  />
                </div>
              )}
              {open && (
                <p className="mt-1 text-[11px] text-slate-400">Click a line or a name to open it.</p>
              )}
            </>
          )
        }
      </ChartFrame>
      )}

      {table && options.length > 0 && (
        <div className={`srf-card overflow-hidden transition-opacity ${fade}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">{tableTitle}</h3>
              <p className="text-[11px] text-slate-400">
                {tableSubtitle || `Net pieces per month over the last ${RANGE_LABELS[months]} — billed, less returns`}
              </p>
            </div>
            {options.length > 10 && (
              <label className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${noun}…`}
                  className="w-56 !pl-8"
                  aria-label={`Search ${noun}`}
                />
              </label>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-max text-left text-[12px]">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2 capitalize sm:px-5">{noun}</th>
                  {hasSalesmanColumn && <th className="px-3 py-2">Salesman</th>}
                  {data.months.map((m) => (
                    <th key={m.key} className="px-3 py-2 text-right">{m.label}</th>
                  ))}
                  <th className="px-3 py-2 text-right">Returned</th>
                  <th className="px-4 py-2 text-right sm:px-5">Net total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => {
                  const slot = slotById.get(r.id);
                  return (
                    <tr
                      key={r.id}
                      onClick={onOpen ? () => onOpen(r) : undefined}
                      className={onOpen ? 'group cursor-pointer hover:bg-slate-50/80' : ''}
                    >
                      <td className="sticky left-0 z-10 bg-white px-4 py-2 group-hover:bg-slate-50 sm:px-5">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-0.5 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: slot !== undefined ? SERIES_COLORS[slot] : 'transparent' }}
                          />
                          <span className={`max-w-[220px] truncate font-medium ${r.unassigned || r.raw === '' ? 'italic text-slate-500' : 'text-slate-800'}`}>
                            {r.label}
                          </span>
                          {onOpen && <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500" />}
                        </span>
                      </td>
                      {hasSalesmanColumn && <td className="px-3 py-2 text-slate-500">{r.salesman || '—'}</td>}
                      {r.monthly.map((n, i) => (
                        <td
                          key={data.months[i].key}
                          className={`px-3 py-2 text-right tabular-nums ${n < 0 ? 'text-rose-600' : n ? 'text-slate-700' : 'text-slate-300'}`}
                        >
                          {num(n)}
                        </td>
                      ))}
                      <td className={`px-3 py-2 text-right tabular-nums ${r.returned ? 'text-rose-600' : 'text-slate-300'}`}>
                        {num(r.returned)}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900 sm:px-5">{num(r.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {!query && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50/70 font-semibold">
                    <td className="sticky left-0 z-10 bg-slate-50 px-4 py-2 text-slate-600 sm:px-5">Total</td>
                    {hasSalesmanColumn && <td />}
                    {data.months.map((m, i) => (
                      <td key={m.key} className="px-3 py-2 text-right tabular-nums text-slate-800">
                        {num(options.reduce((sum, r) => sum + (r.monthly[i] || 0), 0))}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums text-rose-600">{num(data.returned)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-900 sm:px-5">{num(data.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {filtered.length > TABLE_PAGE && (
            <div className="border-t border-slate-100 px-4 py-2.5 text-center sm:px-5">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
              >
                {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
              </button>
            </div>
          )}
          {filtered.length === 0 && (
            <p className="px-5 py-8 text-center text-[13px] text-slate-400">No {noun} matches “{query}”.</p>
          )}
        </div>
      )}
    </>
  );
};

export default BreakdownReport;
