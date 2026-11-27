import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Plus, X, ArrowUpRight } from 'lucide-react';
import { SERIES_COLORS, MAX_SERIES } from '../utils/seriesColors';

const num = (n) => Number(n || 0).toLocaleString('en-IN');

// Every line at the hovered month, biggest first — the one under the pointer
// stands out
const ChartTooltip = ({ active, payload, label, series, hoveredId, clickable, format, showTotal, detail, note }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  // Months a line has no figure for (null) go last, as "—"
  const lines = series
    .map((s) => ({ ...s, value: row[s.key] }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const total = lines.reduce((sum, l) => sum + (l.value || 0), 0);
  const extra = note?.(row.index);
  return (
    <div className="min-w-[180px] max-w-[280px] rounded-lg bg-white px-3 py-2.5 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="mb-1.5 font-semibold text-slate-800">{row.fullLabel || label}</p>
      <div className="space-y-1">
        {lines.map((l) => {
          const sub = detail?.(l, row.index);
          return (
            <div key={l.id} className={hoveredId && hoveredId !== l.id ? 'opacity-50' : ''}>
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                <span className={`min-w-0 flex-1 truncate ${hoveredId === l.id ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
                  {l.label}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">{l.value == null ? '—' : format(l.value)}</span>
              </div>
              {sub && <p className="pl-5 text-[10px] text-slate-400">{sub}</p>}
            </div>
          );
        })}
      </div>
      {showTotal && lines.length > 1 && (
        <div className="mt-1.5 flex items-center justify-between border-t border-slate-100 pt-1.5">
          <span className="text-slate-400">Total</span>
          <span className="font-semibold tabular-nums text-slate-900">{format(total)}</span>
        </div>
      )}
      {extra && <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-[10px] text-slate-400">{extra}</p>}
      {clickable && hoveredId && (
        <p className="mt-1.5 text-[10px] text-slate-400">Click the line to open</p>
      )}
    </div>
  );
};

// One line per series across months.
//   months: [{ key, label }]
//   series: [{ id, label, monthly: [n per month], slot }] — slot picks the colour
//   onSeriesClick(id): optional; makes each line clickable
// For figures other than pieces (a ratio, say):
//   format(n):       how a figure reads, on the axis and in the tooltip
//   tickFormat(n):   the axis alone, when it should read differently
//   decimals:        allow fractional axis ticks
//   showTotal:       the tooltip's "Total" row (pieces add up; ratios don't)
//   gaps:            a null in `monthly` is "no figure" — the line breaks
//                    there and each month gets a dot, so a lone month shows
//   target:          { value, label } — a dashed level line, e.g. a goal
//   detail(line, i): a small line under a figure in the tooltip
//   note(i):         a footnote for the hovered month
// A series may carry target: { index, value } — drawn as a dotted run in its
// colour from its own figure the month before up to `value` at `index`, with
// a ring at the target, so the real line can be seen beating or missing it.
const MonthlyLinesChart = ({
  months,
  series,
  onSeriesClick,
  height = 280,
  unit = 'pcs',
  format = num,
  tickFormat = format,
  decimals = false,
  showTotal = true,
  gaps = false,
  target = null,
  detail = null,
  note = null
}) => {
  const [hoveredId, setHoveredId] = useState(null);

  // Lines are keyed by colour slot, never by name — a name with a dot in it
  // would read as a path
  const lines = useMemo(
    () => series.map((s) => ({ ...s, key: `s${s.slot}`, color: SERIES_COLORS[s.slot] })),
    [series]
  );
  const data = useMemo(
    () =>
      months.map((m, i) => {
        const row = { index: i, label: m.label, fullLabel: m.key ? fullMonth(m.key) : m.label };
        for (const l of lines) {
          row[l.key] = gaps ? (l.monthly[i] ?? null) : l.monthly[i] || 0;
          if (l.target) {
            const t = l.target;
            row[`t${l.slot}`] = i === t.index - 1 ? l.monthly[i] || 0 : i === t.index ? t.value : null;
          }
        }
        return row;
      }),
    [months, lines, gaps]
  );

  const clickable = typeof onSeriesClick === 'function';
  const open = (id) => clickable && onSeriesClick(id);

  return (
    <div style={{ height }} onMouseLeave={() => setHoveredId(null)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#eef0f3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
            interval="preserveStartEnd"
            minTickGap={12}
            style={{ fontSize: '11px' }}
          />
          <YAxis
            stroke="#94a3b8"
            tickLine={false}
            axisLine={false}
            allowDecimals={decimals}
            width={52}
            tickFormatter={tickFormat}
            domain={target ? [0, (max) => Math.max(max, target.value * 1.15)] : undefined}
            style={{ fontSize: '11px' }}
            label={{ value: unit, angle: -90, position: 'insideLeft', offset: 16, style: { fontSize: '10px', fill: '#94a3b8' } }}
          />
          <Tooltip
            cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
            content={
              <ChartTooltip
                series={lines}
                hoveredId={hoveredId}
                clickable={clickable}
                format={format}
                showTotal={showTotal}
                detail={detail}
                note={note}
              />
            }
            isAnimationActive={false}
          />
          {target && (
            <ReferenceLine
              y={target.value}
              stroke="#15803d"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              ifOverflow="extendDomain"
              label={{ value: target.label, position: 'insideTopRight', fill: '#15803d', fontSize: 11, fontWeight: 600 }}
            />
          )}
          {lines.map((l) => {
            const dim = hoveredId && hoveredId !== l.id;
            return (
              <Line
                key={l.key}
                type={gaps ? 'linear' : 'monotone'}
                dataKey={l.key}
                name={l.label}
                stroke={l.color}
                strokeWidth={hoveredId === l.id ? 3 : 2}
                strokeOpacity={dim ? 0.2 : 1}
                dot={gaps ? { r: 3, fill: l.color, strokeWidth: 0, fillOpacity: dim ? 0.2 : 1 } : false}
                connectNulls={false}
                activeDot={
                  dim
                    ? false
                    : {
                        r: 4,
                        stroke: '#ffffff',
                        strokeWidth: 2,
                        cursor: clickable ? 'pointer' : undefined,
                        onClick: () => open(l.id),
                        onMouseEnter: () => setHoveredId(l.id)
                      }
                }
                isAnimationActive={false}
              />
            );
          })}
          {/* Targets: a dotted run from last month's figure to this month's
              target, ringed at the target */}
          {lines
            .filter((l) => l.target)
            .map((l) => {
              const dim = hoveredId && hoveredId !== l.id;
              return (
                <Line
                  key={`t${l.slot}`}
                  type="linear"
                  dataKey={`t${l.slot}`}
                  name={`${l.label} target`}
                  stroke={l.color}
                  strokeWidth={2.5}
                  strokeDasharray="0.5 6"
                  strokeLinecap="round"
                  strokeOpacity={dim ? 0.2 : 0.9}
                  connectNulls={false}
                  tooltipType="none"
                  legendType="none"
                  activeDot={false}
                  dot={(p) =>
                    p.index === l.target.index ? (
                      <circle
                        key={`td${l.slot}`}
                        cx={p.cx}
                        cy={p.cy}
                        r={5}
                        fill="#ffffff"
                        stroke={l.color}
                        strokeWidth={2}
                        strokeOpacity={dim ? 0.2 : 1}
                      />
                    ) : (
                      <g key={`td${l.slot}-${p.index}`} />
                    )
                  }
                  isAnimationActive={false}
                />
              );
            })}
          {/* Wide invisible copies on top — the hover and click target, so a
              2px line doesn't have to be hit dead on */}
          {lines.map((l) => (
            <Line
              key={`hit-${l.key}`}
              type={gaps ? 'linear' : 'monotone'}
              dataKey={l.key}
              stroke="transparent"
              strokeWidth={14}
              dot={false}
              activeDot={false}
              tooltipType="none"
              legendType="none"
              isAnimationActive={false}
              style={{ cursor: clickable ? 'pointer' : 'default' }}
              onMouseEnter={() => setHoveredId(l.id)}
              onMouseLeave={() => setHoveredId((h) => (h === l.id ? null : h))}
              onClick={() => open(l.id)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fullMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_LONG[m - 1]} ${y}`;
};

// The chart's legend, which is also where lines are added and removed.
//   options: [{ id, label, total, badge? }] — everything that can be shown;
//            badge (text) replaces the total shown beside the name
//   selection: [{ id, slot }] from useSeriesSelection
//   onOpen(id): optional — the name opens that series' own page
export const SeriesPicker = ({ options, selection, onAdd, onRemove, onOpen, noun = 'line' }) => {
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const chosenIds = new Set(selection.map((s) => s.id));
  const rest = options.filter((o) => !chosenIds.has(o.id));
  const full = selection.length >= MAX_SERIES;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selection.map((s) => {
        const option = byId.get(s.id);
        if (!option) return null;
        return (
          <span
            key={s.id}
            className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-white text-xs text-slate-700"
          >
            <button
              type="button"
              onClick={onOpen ? () => onOpen(s.id) : undefined}
              disabled={!onOpen}
              className={`flex min-w-0 items-center gap-1.5 py-1 pl-2.5 pr-1 ${onOpen ? 'rounded-l-full hover:text-slate-900' : 'cursor-default'}`}
              title={onOpen ? `Open ${option.label}` : option.label}
            >
              <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: SERIES_COLORS[s.slot] }} />
              <span className="max-w-[160px] truncate font-medium">{option.label}</span>
              <span className="tabular-nums text-slate-400">{option.badge ?? num(option.total)}</span>
              {onOpen && <ArrowUpRight data-pdf-ignore="" className="h-3 w-3 text-slate-300" />}
            </button>
            <button
              type="button"
              data-pdf-ignore=""
              onClick={() => onRemove(s.id)}
              className="mr-1 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label={`Remove ${option.label} from the chart`}
              title="Remove from chart"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}

      {rest.length > 0 && (
        <label
          data-pdf-ignore=""
          className={`relative inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium ${
            full ? 'border-slate-200 text-slate-300' : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700'
          }`}
          title={full ? `Up to ${MAX_SERIES} ${noun}s at a time — remove one first` : `Add a ${noun}`}
        >
          <Plus className="h-3 w-3" />
          Add {noun}
          <select
            value=""
            disabled={full}
            onChange={(e) => e.target.value && onAdd(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            aria-label={`Add a ${noun} to the chart`}
          >
            <option value="">Add {noun}…</option>
            {rest.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} ({o.badge ?? num(o.total)})
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
};

export default MonthlyLinesChart;
