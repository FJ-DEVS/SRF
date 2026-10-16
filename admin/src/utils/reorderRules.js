// Reorder rules as the admin pages print them. A rule mirrors Tally's
// reorder setup: a fixed quantity, the consumption over a trailing period, or
// the higher / lower of the two. Shape matches backend/utils/reorder.js.

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

// "last 2 months" — the consumption side of a rule, or null when it has none
export const periodText = (rule) =>
  rule?.periodValue ? `last ${rule.periodValue} ${unitLabel(rule.periodUnit, rule.periodValue).toLowerCase()}` : null;

// "100 or last 2 months (higher)" — one rule, the way Tally's grid reads it
export const ruleText = (rule) => {
  if (!rule) return null;
  const fixed = rule.quantity != null ? String(rule.quantity) : null;
  const period = periodText(rule);
  if (fixed && period) return `${fixed} or ${period} (${rule.criteria})`;
  return fixed || period;
};
