// Reorder rules as the admin pages print and draw them. A rule mirrors
// Tally's reorder setup: a fixed quantity, the consumption over a period, or
// the higher / lower of the two. Shape and period arithmetic match
// backend/utils/reorder.js — the calendar here must highlight exactly the
// days the server counts.

// Tally's period units for "consumption for the last …"
export const PERIOD_UNITS = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' }
];

// "month" for 1, "months" otherwise
export const unitLabel = (unit, value) => {
  const label = PERIOD_UNITS.find((u) => u.value === unit)?.label || unit;
  return value === 1 ? label.replace(/s$/, '') : label;
};

/* ---------- Days ---------- */

const pad = (n) => String(n).padStart(2, '0');

// Local "YYYY-MM-DD" — the form the server stores custom dates in
export const toDayString = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "YYYY-MM-DD" → local midnight, or null
export const fromDayString = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

// The same day `value` units before `day`, a 31st clamped to a shorter month
const sameDayBack = (day, value, unit) => {
  const d = new Date(day);
  if (unit === 'days') d.setDate(d.getDate() - value);
  else if (unit === 'weeks') d.setDate(d.getDate() - 7 * value);
  else {
    const dom = d.getDate();
    d.setDate(1);
    if (unit === 'months') d.setMonth(d.getMonth() - value);
    else d.setFullYear(d.getFullYear() - value);
    d.setDate(Math.min(dom, daysInMonth(d.getFullYear(), d.getMonth())));
  }
  return d;
};

/* ---------- Periods ---------- */

// Whether a rule (saved, or as form values) has a consumption side
export const hasPeriod = (rule) =>
  Boolean(rule) &&
  (rule.periodMode === 'custom' ? Boolean(rule.periodFrom && rule.periodTo) : Number(rule.periodValue) >= 1);

// The days a rule's period covers, as inclusive { from, to } local dates —
// null when it has no period
export const periodWindow = (rule, now = new Date()) => {
  if (!hasPeriod(rule)) return null;

  if (rule.periodMode === 'custom') {
    return { from: fromDayString(rule.periodFrom), to: fromDayString(rule.periodTo) };
  }

  const today = startOfDay(now);
  const n = Number(rule.periodValue);
  const unit = rule.periodUnit || 'months';

  if (rule.periodMode === 'calendar') {
    if (unit === 'months') {
      const until = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: new Date(until.getFullYear(), until.getMonth() - n, 1), to: addDays(until, -1) };
    }
    if (unit === 'years') {
      const until = new Date(today.getFullYear(), 0, 1);
      return { from: new Date(until.getFullYear() - n, 0, 1), to: addDays(until, -1) };
    }
    if (unit === 'weeks') {
      const until = addDays(today, -((today.getDay() + 6) % 7));
      return { from: addDays(until, -7 * n), to: addDays(until, -1) };
    }
    return { from: addDays(today, -n), to: addDays(today, -1) };
  }

  return { from: sameDayBack(today, n, unit), to: today };
};

export const dayCount = ({ from, to }) => Math.round((startOfDay(to) - startOfDay(from)) / 86400000) + 1;

export const formatDay = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// "19 Aug 2026 – 19 Oct 2026"
export const formatRange = (w) => (w ? `${formatDay(w.from)} – ${formatDay(w.to)}` : '');

// The consumption side of a rule in words: "last 2 months", "last 2 whole
// months", or the dates of a custom period — null when it has none
export const periodText = (rule) => {
  if (!hasPeriod(rule)) return null;
  if (rule.periodMode === 'custom') return formatRange(periodWindow(rule));
  const n = Number(rule.periodValue);
  const unit = unitLabel(rule.periodUnit, n).toLowerCase();
  return rule.periodMode === 'calendar' ? `last ${n} whole ${unit}` : `last ${n} ${unit}`;
};

// "100 or last 2 months (higher)" — one rule, the way Tally's grid reads it
export const ruleText = (rule) => {
  if (!rule) return null;
  const fixed = rule.quantity != null && rule.quantity !== '' ? String(rule.quantity) : null;
  const period = periodText(rule);
  if (fixed && period) return `${fixed} or ${period} (${rule.criteria})`;
  return fixed || period;
};
