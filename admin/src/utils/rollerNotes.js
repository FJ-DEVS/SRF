// Helpers for the rollers' dated notes on an order. A note's day is stored as
// that day's UTC midnight, so it is always read back in UTC.

const pad = (n) => String(n).padStart(2, '0');

// Today as yyyy-mm-dd for <input type="date"> — the roller's own day, not UTC's
export const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// A stored note day as yyyy-mm-dd
export const noteDayInput = (value) => new Date(value).toISOString().slice(0, 10);

export const noteDayFull = (value) =>
  new Date(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// "Today", "Tomorrow", "Yesterday", or the date — the year only when it is not this one
export const noteDayLabel = (value) => {
  const day = noteDayInput(value);
  const today = todayInput();
  const diff = Math.round((Date.parse(day) - Date.parse(today)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
    timeZone: 'UTC'
  });
};

// In date order, and in the order they were written within a day
export const sortNotes = (notes = []) =>
  [...notes].sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));
