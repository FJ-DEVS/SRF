import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ChartFrame from '../ChartFrame';
import PdfButton from '../PdfButton';
import { categoryId, categoryLabel } from '../../utils/categorySales';
import { downloadReportPdf } from '../../utils/reportPdf';
import { num, periodText, useClosingStock } from './salesReport';

// Sales, reorder level and stock, side by side for each month — one stock
// group (category) at a time, or all of them together. The reorder level is
// the sum of the group's item reorder levels; those follow sales, so it
// floats month to month. Stock far above the reorder level, or stock that
// hasn't sold in months, is where inventory can be trimmed.

const ALL = '__all__';
const COLORS = { sold: '#2a78d6', reorder: '#eda100', stock: '#64748b' };
const LABELS = { sold: 'Sales', reorder: 'Reorder level', stock: 'Stock' };

const times = (a, b) => (b > 0 ? `${Math.round((a / b) * 10) / 10}×` : '—');
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

const BarsTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="min-w-[200px] rounded-lg bg-white px-3 py-2.5 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="mb-1.5 font-semibold text-slate-800">
        {row.label}
        {row.live && <span className="font-normal text-slate-400"> · sales so far, stock today</span>}
      </p>
      {['sold', 'reorder', 'stock'].map((k) => (
        <div key={k} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[k] }} />
          <span className="flex-1 text-slate-500">{LABELS[k]}</span>
          <span className="font-semibold tabular-nums text-slate-900">{row[k] == null ? '—' : num(row[k])}</span>
        </div>
      ))}
      {row.stock != null && row.reorder > 0 && (
        <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[11px] text-slate-500">
          Stock is <span className="font-semibold text-slate-800">{times(row.stock, row.reorder)}</span> the reorder level
          {row.stock > row.reorder ? ` · ${num(row.stock - row.reorder)} above it` : ` · ${num(row.reorder - row.stock)} short`}
        </p>
      )}
    </div>
  );
};

const InventoryReport = ({ sales, months, rangeControl = null, onOpen = null }) => {
  const inv = useClosingStock(months, true, 'inventory');
  const data = sales.data;
  const [picked, setPicked] = useState(null);

  // Per category: sold, reorder level and stock for every month of the period
  const rows = useMemo(() => {
    if (!data || !inv) return null;
    const at = new Map(inv.months.map((m, i) => [m.key, i]));
    const invOf = new Map(inv.rows.map((r) => [r.category, r]));
    const salesOf = new Map(data.rows.map((r) => [r.name, r]));
    const names = [...new Set([...data.rows.map((r) => r.name), ...inv.rows.map((r) => r.category)])];
    const pick = (r, field, m) => (r && at.has(m.key) ? r[field]?.[at.get(m.key)] ?? null : null);
    return names
      .map((name) => {
        const r = invOf.get(name);
        return {
          id: categoryId(name),
          raw: name,
          label: categoryLabel(name),
          sold: data.months.map((_, i) => salesOf.get(name)?.monthly[i] ?? 0),
          reorder: data.months.map((m) => pick(r, 'reorder', m)),
          stock: data.months.map((m) => pick(r, 'values', m)),
          stocked: r?.stocked || { items: 0, pieces: 0 },
          idle: r?.idle || { items: 0, pieces: 0 }
        };
      })
      .filter((r) => r.sold.some(Boolean) || r.reorder.some(Boolean) || r.stock.some(Boolean));
  }, [data, inv]);

  // All categories together
  const total = useMemo(() => {
    if (!rows || !data) return null;
    const sum = (field) =>
      data.months.map((_, i) => {
        const vals = rows.map((r) => r[field][i]).filter((v) => v != null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
      });
    return { id: ALL, label: 'All categories', sold: sum('sold'), reorder: sum('reorder'), stock: sum('stock') };
  }, [rows, data]);

  if (!data || !inv || !rows) {
    return (
      <div className="srf-card flex h-40 items-center justify-center p-4">
        <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-slate-500" />
      </div>
    );
  }

  // The busiest category first until another is picked
  const bySales = [...rows].sort((a, b) => b.sold.reduce((x, y) => x + y, 0) - a.sold.reduce((x, y) => x + y, 0));
  const chosenId = picked && (picked === ALL || rows.some((r) => r.id === picked)) ? picked : bySales[0]?.id || ALL;
  const chosen = chosenId === ALL ? total : rows.find((r) => r.id === chosenId);
  const order = [ALL, ...bySales.map((r) => r.id)];
  const step = (d) => setPicked(order[(order.indexOf(chosenId) + d + order.length) % order.length]);

  const chartData = data.months.map((m, i) => ({
    label: m.label,
    live: m.key === inv.live,
    sold: chosen.sold[i],
    reorder: chosen.reorder[i],
    stock: chosen.stock[i]
  }));

  // The table: today (the period's last month), worst surplus first
  const last = data.months.length - 1;
  const closed = data.months.map((m, i) => i).filter((i) => data.months[i].key !== inv.live).slice(-3);
  const avgSold = (r) => (closed.length ? Math.round(closed.reduce((a, i) => a + r.sold[i], 0) / closed.length) : 0);
  const table = rows
    .map((r) => {
      const stock = r.stock[last];
      const reorder = r.reorder[last];
      return { ...r, now: { stock, reorder, surplus: stock != null && reorder != null ? stock - reorder : null, avg: avgSold(r) } };
    })
    .sort((a, b) => (b.now.surplus ?? -Infinity) - (a.now.surplus ?? -Infinity));
  const nowLabel = inv.live === data.months[last].key ? 'today' : `end of ${data.months[last].label}`;
  const idleTotal = rows.reduce((a, r) => a + r.idle.pieces, 0);
  const stockedTotal = rows.reduce((a, r) => a + r.stocked.pieces, 0);

  const title = 'Sales · reorder level · stock';
  const subtitle = 'Each month: what sold, the sum of the item reorder levels, and the stock at the month end';
  const details = [
    `Period: ${periodText(months)}`,
    'Sales: billed pieces less returns. Reorder level: the sum of the items’ reorder levels, which follow sales. Stock: at each month end; this month, today.'
  ];
  const head = [['Category', `Stock ${nowLabel}`, `Reorder level ${nowLabel}`, 'Above reorder level', 'Stock ÷ reorder', 'Avg monthly sale', `Not sold in ${inv.idleDays} days`]];
  const bodyRow = (r) => [
    r.label,
    r.now.stock == null ? '-' : num(r.now.stock),
    r.now.reorder == null ? '-' : num(r.now.reorder),
    r.now.surplus == null ? '-' : num(r.now.surplus),
    r.now.stock == null || !r.now.reorder ? '-' : times(r.now.stock, r.now.reorder),
    num(r.now.avg),
    r.idle.items ? `${num(r.idle.pieces)} pcs in ${r.idle.items} items (${pct(r.idle.pieces, r.stocked.pieces)})` : '-'
  ];

  return (
    <>
      <ChartFrame
        title={title}
        subtitle={subtitle}
        actions={
          <div data-pdf-ignore="" className="flex items-center gap-1">
            <button type="button" onClick={() => step(-1)} className="srf-icon-btn ring-1 ring-slate-200" aria-label="Previous category">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select
              value={chosenId}
              onChange={(e) => setPicked(e.target.value)}
              aria-label="Stock group"
              className="max-w-[200px] !py-1.5 text-[13px]"
            >
              <option value={ALL}>All categories</option>
              {bySales.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
            <button type="button" onClick={() => step(1)} className="srf-icon-btn ring-1 ring-slate-200" aria-label="Next category">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
        expandedActions={rangeControl}
        pdfTitle={`${title} — ${chosen.label}`}
        pdfDetails={[...details, `Stock group: ${chosen.label}`]}
        pdfTables={() => [{
          title: chosen.label,
          head: [['', ...data.months.map((m) => m.label)]],
          body: ['sold', 'reorder', 'stock'].map((k) => [LABELS[k], ...chosen[k].map((v) => (v == null ? '-' : num(v)))])
        }]}
      >
        {(expanded) => (
          <>
            <p className="text-[12px] text-slate-500">
              <span className="font-semibold text-slate-800">{chosen.label}</span>
              {chosen.stock[last] != null && chosen.reorder[last] > 0 && (
                <> — stock {nowLabel} is {times(chosen.stock[last], chosen.reorder[last])} the reorder level</>
              )}
            </p>
            <div className={expanded ? 'mt-2 min-h-0 flex-1' : 'mt-2'} style={expanded ? undefined : { height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }} barGap={2} barCategoryGap="22%">
                  <CartesianGrid stroke="#eef0f3" vertical={false} />
                  <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={{ stroke: '#cbd5e1' }} style={{ fontSize: '11px' }} />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} width={56} tickFormatter={num} style={{ fontSize: '11px' }} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} content={<BarsTooltip />} isAnimationActive={false} />
                  <Legend
                    iconType="square"
                    iconSize={10}
                    itemSorter={(item) => ['sold', 'reorder', 'stock'].indexOf(item.dataKey)}
                    wrapperStyle={{ fontSize: '12px', paddingTop: 4 }}
                    formatter={(value) => <span className="text-slate-600">{value}</span>}
                  />
                  {['sold', 'reorder', 'stock'].map((k) => (
                    <Bar key={k} dataKey={k} name={LABELS[k]} fill={COLORS[k]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </ChartFrame>

      <div className="srf-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900">Where the stock sits — {nowLabel}</h3>
            <p className="text-[11px] text-slate-400">
              Furthest above the reorder level first · {num(idleTotal)} of {num(stockedTotal)} pieces in stock (
              {pct(idleTotal, stockedTotal)}) haven&rsquo;t sold once in {inv.idleDays} days
            </p>
          </div>
          <PdfButton
            onExport={() =>
              downloadReportPdf({
                title: `Where the stock sits — ${nowLabel}`,
                subtitle: 'Stock against the reorder level and sales, per stock group',
                details,
                tables: [{ head, body: table.map(bodyRow) }]
              })
            }
          />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-max text-left text-[12px]">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2 sm:px-5">Category</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2 text-right">Reorder level</th>
                <th className="px-3 py-2 text-right" title="Stock minus the reorder level — positive is more than the reorder rules call for">
                  Above reorder
                </th>
                <th className="px-3 py-2 text-right">Stock ÷ reorder</th>
                <th className="px-3 py-2 text-right" title={`Average over the last ${closed.length} closed month(s) of the period`}>
                  Avg monthly sale
                </th>
                <th className="px-4 py-2 text-right sm:px-5">Not sold in {inv.idleDays} days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setPicked(r.id)}
                  className={`group cursor-pointer hover:bg-slate-50/80 ${r.id === chosenId ? 'bg-indigo-50/40' : ''}`}
                  title="Show this group in the chart above"
                >
                  <td className="sticky left-0 z-10 bg-white px-4 py-2 group-hover:bg-slate-50 sm:px-5">
                    <span className="flex items-center gap-2">
                      <span className={`max-w-[220px] truncate font-medium ${r.raw === '' ? 'italic text-slate-500' : 'text-slate-800'}`}>
                        {r.label}
                      </span>
                      {onOpen && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(r);
                          }}
                          className="text-slate-300 hover:text-slate-600"
                          aria-label={`Open ${r.label}`}
                          title={`Open ${r.label}`}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">{r.now.stock == null ? '—' : num(r.now.stock)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.now.reorder == null ? '—' : num(r.now.reorder)}</td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${
                      r.now.surplus == null ? 'text-slate-300' : r.now.surplus > 0 ? 'text-rose-600' : 'text-amber-600'
                    }`}
                    title={r.now.surplus == null ? '' : r.now.surplus > 0 ? 'More stock than the reorder level' : 'Below the reorder level'}
                  >
                    {r.now.surplus == null ? '—' : `${r.now.surplus > 0 ? '+' : ''}${num(r.now.surplus)}`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {r.now.stock == null || !r.now.reorder ? '—' : times(r.now.stock, r.now.reorder)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{num(r.now.avg)}</td>
                  <td className="px-4 py-2 text-right tabular-nums sm:px-5">
                    {r.idle.items ? (
                      <span className={r.idle.pieces / Math.max(1, r.stocked.pieces) >= 0.25 ? 'font-semibold text-rose-600' : 'text-slate-700'}>
                        {num(r.idle.pieces)} pcs · {r.idle.items} item{r.idle.items === 1 ? '' : 's'}
                        <span className="font-normal text-slate-400"> ({pct(r.idle.pieces, r.stocked.pieces)})</span>
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default InventoryReport;
