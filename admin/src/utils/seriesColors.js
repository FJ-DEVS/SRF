import { useCallback, useEffect, useMemo, useState } from 'react';

// Categorical line colours, in a fixed order that keeps neighbouring lines
// apart for colour-blind readers too. Eight at most on one chart — past that
// the lines stop being tellable apart, so the pickers cap there.
export const SERIES_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#6250d6', // violet
  '#e34948' // red
];
export const MAX_SERIES = SERIES_COLORS.length;

const readStored = (key) => {
  if (!key) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeStored = (key, value) => {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private window or storage blocked — the choice just isn't remembered
  }
};

// Which series a chart shows, each holding on to the colour slot it was given
// when picked — removing one line never repaints the others.
//   available: [{ id, total }] — what can be picked, once data has loaded
//   storageKey: remember the choice across visits (optional)
// Until something is picked, the busiest series (by total) are shown.
export const useSeriesSelection = (available, storageKey = null) => {
  // [{ id, slot }] or null for "not chosen yet"
  const [chosen, setChosen] = useState(() => readStored(storageKey));

  useEffect(() => {
    setChosen(readStored(storageKey));
  }, [storageKey]);

  const ids = useMemo(() => new Set((available || []).map((s) => s.id)), [available]);

  const selection = useMemo(() => {
    if (!available) return [];
    if (chosen) {
      return chosen.filter((c) => ids.has(c.id) && Number.isInteger(c.slot) && c.slot >= 0 && c.slot < MAX_SERIES);
    }
    const busiest = [...available].sort((a, b) => b.total - a.total);
    const sold = busiest.filter((s) => s.total > 0);
    return (sold.length ? sold : busiest).slice(0, MAX_SERIES).map((s, slot) => ({ id: s.id, slot }));
  }, [available, chosen, ids]);

  const save = useCallback(
    (next) => {
      setChosen(next);
      writeStored(storageKey, next);
    },
    [storageKey]
  );

  const add = useCallback(
    (id) => {
      if (selection.some((s) => s.id === id) || selection.length >= MAX_SERIES) return;
      const used = new Set(selection.map((s) => s.slot));
      const slot = SERIES_COLORS.findIndex((_, i) => !used.has(i));
      save([...selection, { id, slot }]);
    },
    [selection, save]
  );

  const remove = useCallback((id) => save(selection.filter((s) => s.id !== id)), [selection, save]);

  const reset = useCallback(() => save(null), [save]);

  return { selection, add, remove, reset, isFull: selection.length >= MAX_SERIES };
};
