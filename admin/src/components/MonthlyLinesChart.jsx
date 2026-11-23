import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, X, ArrowUpRight } from 'lucide-react';
import { SERIES_COLORS, MAX_SERIES } from '../utils/seriesColors';

const num = (n) => Number(n || 0).toLocaleString('en-IN');

// Every line at the hovered month, biggest first — the one under the pointer
// stands out
const ChartTooltip = ({ active, payload, label, series, hoveredId, clickable }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const lines = series
    .map((s) => ({ ...s, value: row[s.key] || 0 }))
    .sort((a, b) => b.value - a.value);
  const total = lines.reduce((sum, l) => sum + l.value, 0);
  return (
    <div className="min-w-[180px] max-w-[260px] rounded-lg bg-white px-3 py-2.5 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="mb-1.5 font-semibold text-slate-800">{row.fullLabel || label}</p>
      <div className="space-y-1">
        {lines.map((l) => (
          <div
            key={l.id}
            className={`flex items-center gap-2 ${hoveredId && hoveredId !== l.id ? 'opacity-50' : ''}`}
          >
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
            <span className={`min-w-0 flex-1 truncate ${hoveredId === l.id ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
              {l.label}
            </span>
            <span className="font-semibold tabular-nums text-slate-900">{num(l.value)}</span>
          </div>
        ))}
      </div>
      {lines.length > 1 && (
        <div className="mt-1.5 flex items-center justify-between border-t border-slate-100 pt-1.5">
          <span className="text-slate-400">Total</span>
          <span className="font-semibold tabular-nums text-slate-900">{num(total)}</span>
        </div>
      )}
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
const MonthlyLinesChart = ({ months, series, onSeriesClick, height = 280, unit = 'pcs' }) => {
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
        const row = { label: m.label, fullLabel: m.key ? fullMonth(m.key) : m.label };
        for (const l of lines) row[l.key] = l.monthly[i] || 0;
        return row;
      }),
    [months, lines]
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
            allowDecimals={false}
            width={52}
            tickFormatter={num}
            style={{ fontSize: '11px' }}
            label={{ value: unit, angle: -90, position: 'insideLeft', offset: 16, style: { fontSize: '10px', fill: '#94a3b8' } }}
          />
          <Tooltip
            cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
            content={<ChartTooltip series={lines} hoveredId={hoveredId} clickable={clickable} />}
            isAnimationActive={false}
          />
          {lines.map((l) => {
            const dim = hoveredId && hoveredId !== l.id;
            return (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.label}
                stroke={l.color}
                strokeWidth={hoveredId === l.id ? 3 : 2}
                strokeOpacity={dim ? 0.2 : 1}
                dot={false}
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
          {/* Wide invisible copies on top — the hover and click target, so a
              2px line doesn't have to be hit dead on */}
          {lines.map((l) => (
            <Line
              key={`hit-${l.key}`}
              type="monotone"
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
//   options: [{ id, label, total }] — everything that can be shown
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
              <span className="tabular-nums text-slate-400">{num(option.total)}</span>
              {onOpen && <ArrowUpRight className="h-3 w-3 text-slate-300" />}
            </button>
            <button
              type="button"
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
                {o.label} ({num(o.total)})
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
};

export default MonthlyLinesChart;
