// Indian financial year, April to March, in four quarters:
//   Q1 April – June, Q2 July – September, Q3 October – December,
//   Q4 January – March (of the next calendar year)
// A financial year is named by the calendar year it starts in: FY 2026 is
// April 2026 – March 2027, shown as "FY 2026-27".

export const QUARTERS = [
  { q: 1, label: 'Q1', span: 'Apr – Jun', startMonth: 3 },
  { q: 2, label: 'Q2', span: 'Jul – Sep', startMonth: 6 },
  { q: 3, label: 'Q3', span: 'Oct – Dec', startMonth: 9 },
  { q: 4, label: 'Q4', span: 'Jan – Mar', startMonth: 12 } // month 12 = January of fy + 1
];

// The financial year a date falls in
export const fyOf = (date = new Date()) => (date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1);

// Which quarter (1–4) a date falls in
export const quarterOf = (date = new Date()) => {
  const m = date.getMonth();
  return m >= 3 && m <= 5 ? 1 : m >= 6 && m <= 8 ? 2 : m >= 9 ? 3 : 4;
};

export const fyLabel = (fy) => `FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;

// First day of the period and first day after it
export const quarterRange = (fy, q) => {
  const start = new Date(fy, QUARTERS[q - 1].startMonth, 1);
  return { start, end: new Date(start.getFullYear(), start.getMonth() + 3, 1) };
};
export const fyRange = (fy) => ({ start: new Date(fy, 3, 1), end: new Date(fy + 1, 3, 1) });

// The quarter before a given one
export const previousQuarter = (fy, q) => (q === 1 ? { fy: fy - 1, q: 4 } : { fy, q: q - 1 });

// Financial years to offer, newest first: this one and `back` before it, each
// with the quarters that have begun
export const fyChoices = (back = 2, now = new Date()) => {
  const current = fyOf(now);
  return Array.from({ length: back + 1 }, (_, i) => {
    const fy = current - i;
    const quarters = QUARTERS.filter((qt) => quarterRange(fy, qt.q).start <= now);
    return { fy, label: fyLabel(fy), quarters };
  });
};
