import React, { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import ChartFrame from '../ChartFrame';
import PdfButton from '../PdfButton';
import MonthlyLinesChart, { SeriesPicker } from '../MonthlyLinesChart';
import { useSeriesSelection, SERIES_COLORS } from '../../utils/seriesColors';
import { categoryId, categoryLabel } from '../../utils/categorySales';
import { downloadReportPdf } from '../../utils/reportPdf';
import { num, periodText, useClosingStock } from './salesReport';

// Sale : closing stock, category by category, month by month. A month's
// ratio is 1 : (stock at the month end ÷ the month's net sales) — October
// selling 2,500 sheets with 12,500 left at the end of October is 1:5, five
// months of sales on hand. The aim is to bring every category down to the
// target (1:3 unless the admin sets another), so lower is better.
//
// A month counts once it has closed and has both figures: this month isn't
// over yet, and a month with nothing sold has no ratio.

// "1:5", "1:5.3", "1:12"
const ratioText = (x) => (x == null ? '—' : `1:${x >= 10 ? Math.round(x) : Math.round(x * 10) / 10}`);

const whyBlank = ({ live, stock, sold }) =>
  live ? 'This month isn’t over yet' : stock == null ? 'No closing stock figure for this month' : sold <= 0 ? 'Nothing sold this month' : '';

const StockRatioReport = ({ sales, months, storageKey = null, onOpen = null, rangeControl = null, pdfContext = [] }) => {
  const stock = useClosingStock(months);
  const data = sales.data;
  const target = stock?.target ?? 3;

  // One row per category: ratio, sold and stock for every month of the period
  const rows = useMemo(() => {
    if (!data || !stock) return null;
    const stockAt = new Map(stock.months.map((m, i) => [m.key, i]));
    const stockOf = new Map(stock.rows.map((r) => [r.category, r.values]));
    const salesOf = new Map(data.rows.map((r) => [r.name, r]));
    const names = [...new Set([...data.rows.map((r) => r.name), ...stock.rows.map((r) => r.category)])];
    return names
      .map((name) => {
        const sold = data.months.map((_, i) => salesOf.get(name)?.monthly[i] ?? 0);
        const held = data.months.map((m) => (stockAt.has(m.key) ? stockOf.get(name)?.[stockAt.get(m.key)] ?? null : null));
        const live = data.months.map((m) => m.key === stock.live);
        const monthly = data.months.map((_, i) => (!live[i] && held[i] != null && sold[i] > 0 ? held[i] / sold[i] : null));
        const at = monthly.map((r, i) => (r == null ? -1 : i)).filter((i) => i >= 0);
        const last = at.length ? at[at.length - 1] : -1;
        const before = at.length > 1 ? at[at.length - 2] : -1;
        const latest = last >= 0 ? monthly[last] : null;
        return {
          id: categoryId(name),
          raw: name,
          label: categoryLabel(name),
          monthly,
          sold,
          held,
          live,
          latest,
          latestMonth: last >= 0 ? data.months[last].label : null,
          change: last >= 0 && before >= 0 ? monthly[last] - monthly[before] : null,
          // Pieces more than the target ratio needs at the latest month's sales
          excess: last >= 0 ? Math.max(0, Math.round(held[last] - target * sold[last])) : null,
          // Busiest categories are drawn first
          total: sold.reduce((a, b) => a + Math.max(0, b), 0),
          badge: ratioText(latest)
        };
      })
      .filter((r) => r.monthly.some((x) => x != null));
  }, [data, stock, target]);

  const { selection, add, remove } = useSeriesSelection(rows, storageKey);
  const byId = useMemo(() => new Map((rows || []).map((r) => [r.id, r])), [rows]);
  const slotById = new Map(selection.map((s) => [s.id, s.slot]));
  const series = selection.map((s) => ({ ...byId.get(s.id), slot: s.slot })).filter((s) => s.monthly);
  const open = onOpen ? (id) => byId.get(id) && onOpen(byId.get(id)) : null;

  // Worst first — the categories furthest from the target lead the table
  const ranked = useMemo(
    () => [...(rows || [])].sort((a, b) => (b.latest ?? -1) - (a.latest ?? -1) || a.label.localeCompare(b.label)),
    [rows]
  );
  const onTarget = ranked.filter((r) => r.latest != null && r.latest <= target).length;
  const withLatest = ranked.filter((r) => r.latest != null).length;

  const title = 'Sale : stock ratio';
  const subtitle = `Closing stock against the month's sales — 1:5 is five months of sales on hand. Target 1:${target}; lower is leaner.`;
  const details = [
    `Period: ${periodText(months)}`,
    ...pdfContext,
    `Ratio = 1 : (closing stock ÷ the month's net sales). Target 1:${target}.`,
    'Sales are billed pieces less returns; a month shows once it has closed.'
  ];
  const head = () => [['Category', ...data.months.map((m) => m.label), 'Latest', 'Change', `Above 1:${target}`]];
  const rowOf = (r) => [
    r.label,
    ...r.monthly.map((x) => (x == null ? '-' : ratioText(x))),
    ratioText(r.latest),
    r.change == null ? '-' : `${r.change > 0 ? '+' : ''}${Math.round(r.change * 10) / 10}`,
    r.excess ? `${num(r.excess)} pcs` : '-'
  ];
  const figures = (r) => ({
    head: [['', ...data.months.map((m) => m.label)]],
    body: [
      ['Sold', ...r.sold.map(num)],
      ['Closing stock', ...r.held.map((v, i) => (r.live[i] ? `${num(v)} (today)` : v == null ? '-' : num(v)))],
      ['Ratio', ...r.monthly.map((x) => (x == null ? '-' : ratioText(x)))]
    ]
  });
  const exportTable = () =>
    downloadReportPdf({
      title: 'Sale : stock ratio — every category',
      subtitle,
      details,
      tables: [{ head: head(), body: ranked.map(rowOf) }]
    });

  if (!data || !stock || !rows) {
    return (
      <div className="srf-card flex h-40 items-center justify-center p-4">
        <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-slate-500" />
      </div>
    );
  }

  const empty = rows.length === 0;
  const cell = (r, i) => {
    const x = r.monthly[i];
    if (x == null) {
      const why = whyBlank({ live: r.live[i], stock: r.held[i], sold: r.sold[i] });
      return (
        <td key={data.months[i].key} className="px-3 py-2 text-right text-slate-300" title={why}>
          —
        </td>
      );
    }
    return (
      <td
        key={data.months[i].key}
        className={`px-3 py-2 text-right font-medium tabular-nums ${x <= target ? 'text-emerald-700' : 'text-rose-600'}`}
        title={`Sold ${num(r.sold[i])} · closing stock ${num(r.held[i])}`}
      >
        {ratioText(x)}
      </td>
    );
  };

  return (
    <>
      <ChartFrame
        title={title}
        subtitle={subtitle}
        expandedActions={rangeControl}
        pdfDetails={details}
        pdfTables={
          series.length
            ? () => [
                { title: 'Ratios for the lines drawn', head: head(), body: series.map(rowOf) },
                ...series.map((r) => ({ title: r.label, ...figures(r) }))
              ]
            : null
        }
      >
        {(expanded) =>
          empty ? (
            <div className="py-12 text-center text-[13px] text-slate-400">
              <p>No ratios yet for {periodText(months)}.</p>
              <p className="mx-auto mt-1 max-w-lg text-[12px]">
                A ratio needs a month that has closed, with its closing stock and its sales. The server records closing
                stock at each month end; earlier months can be typed in on the admin panel’s Closing Stock page.
              </p>
            </div>
          ) : (
            <>
              <SeriesPicker options={rows} selection={selection} onAdd={add} onRemove={remove} onOpen={open} noun="category" />
              {series.length === 0 ? (
                <p className="py-16 text-center text-[13px] text-slate-400">Add a category to draw its ratio.</p>
              ) : (
                <div className={expanded ? 'mt-3 min-h-0 flex-1' : 'mt-3'}>
                  <MonthlyLinesChart
                    months={data.months}
                    series={series}
                    onSeriesClick={open}
                    height={expanded ? '100%' : 300}
                    unit="stock per 1 sold"
                    format={ratioText}
                    tickFormat={(v) => (v === 0 ? '0' : ratioText(v))}
                    showTotal={false}
                    gaps
                    target={{ value: target, label: `Target 1:${target}` }}
                    detail={(line, i) => {
                      const r = byId.get(line.id);
                      if (!r) return null;
                      if (r.monthly[i] == null) return whyBlank({ live: r.live[i], stock: r.held[i], sold: r.sold[i] });
                      const over = Math.round(r.held[i] - target * r.sold[i]);
                      return `sold ${num(r.sold[i])} · stock ${num(r.held[i])}${over > 0 ? ` · ${num(over)} over target` : ''}`;
                    }}
                  />
                </div>
              )}
              <p data-pdf-ignore="" className="mt-1 text-[11px] text-slate-400">
                Dashed green line: the target. Each point is a month end{open ? ' — click a line to open its category' : ''}.
              </p>
            </>
          )
        }
      </ChartFrame>

      {!empty && (
        <div className="srf-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">Stock ratio by category</h3>
              <p className="text-[11px] text-slate-400">
                {onTarget} of {withLatest} categories at or under 1:{target} in their latest month · furthest from target first
              </p>
            </div>
            <PdfButton onExport={exportTable} />
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-max text-left text-[12px]">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2 sm:px-5">Category</th>
                  {data.months.map((m) => (
                    <th key={m.key} className="px-3 py-2 text-right">{m.label}</th>
                  ))}
                  <th className="px-3 py-2 text-right">Latest</th>
                  <th className="px-3 py-2 text-right">Change</th>
                  <th className="px-4 py-2 text-right sm:px-5" title="Closing stock beyond what the target ratio needs at that month's sales">
                    Above 1:{target}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ranked.map((r) => {
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
                          <span className={`max-w-[220px] truncate font-medium ${r.raw === '' ? 'italic text-slate-500' : 'text-slate-800'}`}>
                            {r.label}
                          </span>
                          {onOpen && <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500" />}
                        </span>
                      </td>
                      {data.months.map((_, i) => cell(r, i))}
                      <td
                        className={`px-3 py-2 text-right font-semibold tabular-nums ${
                          r.latest == null ? 'text-slate-300' : r.latest <= target ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                        title={r.latestMonth ? `${r.latestMonth}` : ''}
                      >
                        {ratioText(r.latest)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.change == null ? (
                          <span className="text-slate-300">—</span>
                        ) : Math.round(r.change * 10) === 0 ? (
                          <span className="text-slate-400" title="No change from the month before">0</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-0.5 ${r.change <= 0 ? 'text-emerald-700' : 'text-rose-600'}`}
                            title={r.change <= 0 ? 'Ratio came down — leaner' : 'Ratio went up — more stock per sale'}
                          >
                            {r.change <= 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                            {Math.abs(Math.round(r.change * 10) / 10)}
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums sm:px-5 ${r.excess ? 'text-slate-800' : 'text-slate-300'}`}>
                        {r.excess ? `${num(r.excess)} pcs` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

export default StockRatioReport;
