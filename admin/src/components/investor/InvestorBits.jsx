import React from 'react';
import { CalendarRange } from 'lucide-react';
import { RANGE_LABELS } from '../../utils/categorySales';
import { fyChoices } from '../../utils/financialYear';

// The period select every investor report shares: the last few months, or a
// financial year or one of its quarters (Q1 Apr – Jun … Q4 Jan – Mar)
export const RangeSelect = ({ months, onChange }) => (
  <label className="flex items-center gap-2">
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      <CalendarRange className="h-3.5 w-3.5" /> Period
    </span>
    <select value={months} onChange={(e) => onChange(e.target.value)} aria-label="Period to show" className="max-w-[260px]">
      <optgroup label="Recent">
        {Object.entries(RANGE_LABELS).map(([value, label]) => (
          <option key={value} value={`m${value}`}>Last {label}</option>
        ))}
      </optgroup>
      {fyChoices().map((fy) => (
        <optgroup key={fy.fy} label={fy.label}>
          <option value={`fy${fy.fy}`}>{fy.label} — full year</option>
          {fy.quarters.map((qt) => (
            <option key={qt.q} value={`fy${fy.fy}q${qt.q}`}>
              {qt.label} {fy.label} ({qt.span})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  </label>
);

// A row of headline figures: [{ label, value, hint? }]
export const StatTiles = ({ tiles }) => (
  <div className={`grid grid-cols-2 gap-2.5 sm:gap-3 ${tiles.length >= 4 ? 'lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
    {tiles.map((t) => (
      <div key={t.label} className="srf-card min-w-0 p-3.5">
        <p className="truncate text-xl font-bold leading-none text-slate-900">{t.value}</p>
        <p className="mt-1 truncate text-[11px] font-medium text-slate-500">
          {t.label}
          {t.hint && <span className="text-slate-400"> · {t.hint}</span>}
        </p>
      </div>
    ))}
  </div>
);

// The filter row above a report's charts
export const FilterRow = ({ children }) => (
  <div className="srf-toolbar !flex-row flex-wrap items-center gap-3">{children}</div>
);
