import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { startOfDay, formatDay } from '../utils/reorderRules';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const monthOf = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const sameDay = (a, b) => Boolean(a && b) && a.getTime() === b.getTime();

// Two months side by side with a period's days highlighted, so "the last 2
// months" is never in doubt. Clicking a first and then a last day hands a
// custom period back through onPick.
// range: inclusive { from, to } local dates, or null
const PeriodCalendar = ({ range, onPick }) => {
  const today = startOfDay(new Date());
  const anchor = range?.to || today;
  // The right-hand month on show
  const [view, setView] = useState(() => monthOf(anchor));
  const [pendingStart, setPendingStart] = useState(null);

  // A new period (mode or length changed) scrolls the view to its end and
  // drops a half-made pick — state reset during render, keyed on the anchor
  const anchorKey = anchor.getTime();
  const [seenAnchor, setSeenAnchor] = useState(anchorKey);
  if (seenAnchor !== anchorKey) {
    setSeenAnchor(anchorKey);
    setView(monthOf(anchor));
    setPendingStart(null);
  }

  const pick = (day) => {
    if (day > today) return;
    if (!pendingStart) {
      setPendingStart(day);
      return;
    }
    const [from, to] = day < pendingStart ? [day, pendingStart] : [pendingStart, day];
    setPendingStart(null);
    onPick(from, to);
  };

  const dayClass = (day) => {
    const base = 'mx-auto flex h-7 w-7 items-center justify-center rounded-md text-[11px] tabular-nums transition-colors';
    if (day > today) return `${base} cursor-not-allowed text-slate-300`;
    if (sameDay(day, pendingStart)) return `${base} bg-indigo-600 font-semibold text-white ring-2 ring-indigo-300`;
    if (range && (sameDay(day, range.from) || sameDay(day, range.to))) return `${base} bg-indigo-600 font-semibold text-white`;
    if (range && day >= range.from && day <= range.to) return `${base} bg-indigo-100 text-indigo-900 hover:bg-indigo-200`;
    if (sameDay(day, today)) return `${base} font-bold text-slate-900 ring-1 ring-slate-400 hover:bg-slate-100`;
    return `${base} text-slate-700 hover:bg-slate-100`;
  };

  const renderMonth = (month) => {
    const lead = (month.getDay() + 6) % 7; // weeks start on Monday
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1));

    return (
      <div key={month.getTime()}>
        <p className="mb-1.5 text-center text-[12px] font-semibold text-slate-700">
          {month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </p>
        <div className="grid grid-cols-7 gap-y-0.5 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} className="text-[10px] font-semibold uppercase text-slate-400">{w}</span>
          ))}
          {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
          {days.map((day) => (
            <button
              key={day.getTime()}
              type="button"
              onClick={() => pick(day)}
              disabled={day > today}
              className={dayClass(day)}
              title={sameDay(day, today) ? 'Today' : undefined}
            >
              {day.getDate()}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setView((v) => addMonths(v, -1))} className="srf-icon-btn" aria-label="Earlier months">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-[11px] text-slate-500">
          {pendingStart
            ? <>First day <span className="font-semibold text-slate-800">{formatDay(pendingStart)}</span> — now pick the last day</>
            : 'Click a first and a last day to set a custom period'}
        </p>
        <button
          type="button"
          onClick={() => setView((v) => addMonths(v, 1))}
          disabled={view >= monthOf(today)}
          className="srf-icon-btn disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Later months"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[addMonths(view, -1), view].map(renderMonth)}
      </div>
    </div>
  );
};

export default PeriodCalendar;
