import React, { useMemo, useState } from 'react';
import ChartFrame from '../ChartFrame';
import MonthlyLinesChart, { SeriesPicker } from '../MonthlyLinesChart';
import { useSeriesSelection, SERIES_COLORS } from '../../utils/seriesColors';
import { num, toSeries, periodText, targetFor, thisMonthKey } from './salesReport';
import PdfButton from '../PdfButton';
import { downloadReportPdf } from '../../utils/reportPdf';
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
//   pdfContext: lines naming what this report is scoped to ("Category: Doors"),
//               printed under the title of its PDFs
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
  pdfContext = [],
  pdfTitle,
  emptyText = 'Nothing billed in this period.'
}) => {
  const { data, loading, error, retry } = report;
  const options = useMemo(() => (data ? toSeries(data) : null), [data]);
  const { selection, add, remove } = useSeriesSelection(options, storageKey);
  const byId = useMemo(() => new Map((options || []).map((o) => [o.id, o])), [options]);
  const slotById = new Map(selection.map((s) => [s.id, s.slot]));
  const series = selection.map((s) => ({ ...byId.get(s.id), slot: s.slot })).filter((s) => s.monthly);
  const open = onOpen ? (id) => byId.get(id) && onOpen(byId.get(id)) : null;

  // Sales targets, on category reports: the last month of the period aims at
  // the month before's sales plus the category's growth percent
  const lastIndex = data ? data.months.length - 1 : -1;
  const lastMonth = data?.months[lastIndex];
  const running = lastMonth?.key === thisMonthKey();
  const hasTargets = data?.by === 'category' && lastIndex > 0 && (options || []).some((o) => o.growth != null);
  const targetOf = (r) => (hasTargets ? targetFor(r, lastIndex) : null);
  const reachedOf = (r) => {
    const t = targetOf(r);
    return t ? Math.round(((r.monthly[lastIndex] || 0) / t) * 100) : null;
  };
  const drawn = series.map((s) => {
    const value = targetOf(s);
    return value == null ? s : { ...s, target: { index: lastIndex, value } };
  });
  const targetDetail = hasTargets
    ? (line, i) =>
        i === lastIndex && line.target
          ? `target ${num(line.target.value)} (${line.growth > 0 ? '+' : ''}${line.growth}%) · ${reachedOf(line)}% ${running ? 'so far' : 'reached'}`
          : null
    : null;

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

  // The figures as PDF tables: one row per line, a column per month
  const details = [`Period: ${periodText(months)}`, ...pdfContext, 'Billed pieces, less returns in the month they came back'];
  const head = () => [[
    noun.charAt(0).toUpperCase() + noun.slice(1),
    ...(hasSalesmanColumn ? ['Salesman'] : []),
    ...data.months.map((m) => m.label),
    'Returned',
    'Net total',
    ...(hasTargets ? ['Growth', `Target ${lastMonth.label}`, running ? 'Reached so far' : 'Reached'] : [])
  ]];
  const rowOf = (r) => [
    r.label,
    ...(hasSalesmanColumn ? [r.salesman || '-'] : []),
    ...r.monthly.map(num),
    num(r.returned),
    num(r.total),
    ...(hasTargets
      ? [
          r.growth == null ? '-' : `${r.growth}%`,
          targetOf(r) == null ? '-' : num(targetOf(r)),
          reachedOf(r) == null ? '-' : `${reachedOf(r)}%`
        ]
      : [])
  ];
  const chartPdfTables = () => [{ title: 'Figures for the lines drawn', head: head(), body: series.map(rowOf) }];
  const exportTable = () =>
    downloadReportPdf({
      title: tableTitle || title,
      subtitle: tableSubtitle || `Net pieces per month over ${periodText(months)} — billed, less returns`,
      details: [`Period: ${periodText(months)}`, ...pdfContext, ...(query.trim() ? [`Search: "${query.trim()}"`] : [])],
      tables: [{
        head: head(),
        body: filtered.map(rowOf),
        foot: query.trim()
          ? undefined
          : [[
              'Total',
              ...(hasSalesmanColumn ? [''] : []),
              ...data.months.map((_, i) => num(options.reduce((sum, r) => sum + (r.monthly[i] || 0), 0))),
              num(data.returned),
              num(data.total),
              ...(hasTargets ? ['', '', ''] : [])
            ]]
      }]
    });

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
        pdfTitle={pdfTitle}
        pdfDetails={details}
        pdfTables={series.length ? chartPdfTables : null}
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
                    series={drawn}
                    onSeriesClick={open}
                    detail={targetDetail}
                    height={expanded ? '100%' : 300}
                  />
                </div>
              )}
              {drawn.some((s) => s.target) && (
                <p className="mt-1 text-[11px] text-slate-500">
                  <span className="mr-1 font-bold tracking-[0.2em] text-slate-400">····○</span>
                  {lastMonth.label} target — {data.months[lastIndex - 1].label}&rsquo;s sales plus each category&rsquo;s growth %
                  {running ? '. This month is still running.' : '.'}
                </p>
              )}
              {open && (
                <p data-pdf-ignore="" className="mt-1 text-[11px] text-slate-400">Click a line or a name to open it.</p>
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
                {tableSubtitle || `Net pieces per month over ${periodText(months)} — billed, less returns`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
            <PdfButton onExport={exportTable} />
            </div>
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
                  {hasTargets && (
                    <>
                      <th className="px-3 py-2 text-right" title="Monthly sales growth aimed for">Growth</th>
                      <th className="px-3 py-2 text-right" title={`${data.months[lastIndex - 1].label}'s sales plus the growth %`}>
                        Target {lastMonth.label}
                      </th>
                      <th className="px-4 py-2 text-right sm:px-5">{running ? 'Reached so far' : 'Reached'}</th>
                    </>
                  )}
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
                      {hasTargets && (() => {
                        const target = targetOf(r);
                        const reached = reachedOf(r);
                        return (
                          <>
                            <td className={`px-3 py-2 text-right tabular-nums ${r.growth == null ? 'text-slate-300' : 'text-slate-600'}`}>
                              {r.growth == null ? '—' : `${r.growth > 0 ? '+' : ''}${r.growth}%`}
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums ${target == null ? 'text-slate-300' : 'text-slate-800'}`}>
                              {target == null ? '—' : num(target)}
                            </td>
                            <td
                              className={`px-4 py-2 text-right font-semibold tabular-nums sm:px-5 ${
                                reached == null
                                  ? 'text-slate-300'
                                  : reached >= 100
                                    ? 'text-emerald-700'
                                    : running
                                      ? 'text-slate-600'
                                      : 'text-rose-600'
                              }`}
                            >
                              {reached == null ? '—' : `${reached}%`}
                            </td>
                          </>
                        );
                      })()}
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
                    {hasTargets && <td colSpan={3} />}
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
