import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { RANGE_LABELS, categoryId, categoryLabel } from '../../utils/categorySales';
import { QUARTERS, fyLabel, fyRange, quarterRange } from '../../utils/financialYear';

export const UNASSIGNED_ID = 'unassigned';
const PERIOD_KEY = 'investor.period';
const DEFAULT_PERIOD = 'm12';

// A period is one of:
//   m3 | m6 | m12 | m24   the last N months, this one included
//   fy2026                 a whole financial year (April 2026 – March 2027)
//   fy2026q1               one quarter of it (see utils/financialYear.js)
const PERIOD_RE = /^(?:m(3|6|12|24)|fy(\d{4})(?:q([1-4]))?)$/;

export const isPeriod = (p) => typeof p === 'string' && PERIOD_RE.test(p);

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// The query the server takes: { months } or { from, to } (inclusive months)
export const periodQuery = (period) => {
  const [, months, fy, q] = PERIOD_RE.exec(isPeriod(period) ? period : DEFAULT_PERIOD);
  if (months) return { months: Number(months) };
  const { start, end } = q ? quarterRange(Number(fy), Number(q)) : fyRange(Number(fy));
  return { from: monthKey(start), to: monthKey(new Date(end.getFullYear(), end.getMonth() - 1, 1)) };
};

// "the last 12 months", "Q1 FY 2026-27 (Apr – Jun)", "FY 2026-27"
export const periodText = (period) => {
  const [, months, fy, q] = PERIOD_RE.exec(isPeriod(period) ? period : DEFAULT_PERIOD);
  if (months) return `the last ${RANGE_LABELS[months]}`;
  if (q) return `${QUARTERS[q - 1].label} ${fyLabel(Number(fy))} (${QUARTERS[q - 1].span})`;
  return fyLabel(Number(fy));
};

const storedPeriod = () => {
  try {
    const p = localStorage.getItem(PERIOD_KEY);
    return isPeriod(p) ? p : DEFAULT_PERIOD;
  } catch {
    return DEFAULT_PERIOD;
  }
};

// The period the investor pages show — kept in the URL (so a link or the back
// button keeps it) and remembered across visits. Older links carry ?months=12.
export const useMonths = () => {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('period') || (params.get('months') ? `m${params.get('months')}` : null);
  const period = isPeriod(fromUrl) ? fromUrl : storedPeriod();
  const setPeriod = (value) => {
    try {
      localStorage.setItem(PERIOD_KEY, value);
    } catch {
      // not remembered — fine
    }
    const next = new URLSearchParams(params);
    next.delete('months');
    next.set('period', value);
    setParams(next, { replace: true });
  };
  return [period, setPeriod];
};

// GET /orders/stats/sales-breakdown — see the backend controller for the
// query. `query` is a plain object; undefined values are left out. Holds the
// previous result while a new one loads, so charts keep their frame.
export const useSalesBreakdown = (query) => {
  const [attempt, setAttempt] = useState(0);
  // `months` is the page's period (see above), sent as the server reads it
  const { months: period, ...rest } = query;
  const key = JSON.stringify({ ...rest, ...periodQuery(period) });
  const ticket = `${key}#${attempt}`;
  // What the last finished request was for, and what it brought back
  const [result, setResult] = useState({ ticket: null, data: null, error: null });

  useEffect(() => {
    let stale = false;
    api
      .get('/orders/stats/sales-breakdown', { params: JSON.parse(key) })
      .then((res) => {
        if (stale) return;
        setResult((r) =>
          res.data.success
            ? { ticket, data: res.data.data, error: null }
            : { ticket, data: r.data, error: res.data.message || 'Could not load' }
        );
      })
      .catch((error) => {
        if (stale) return;
        console.error('Error fetching sales breakdown:', error);
        setResult((r) => ({ ticket, data: r.data, error: error.response?.data?.message || 'Could not load' }));
      });
    return () => {
      stale = true;
    };
  }, [key, ticket]);

  return {
    data: result.data,
    error: result.ticket === ticket ? result.error : null,
    loading: result.ticket !== ticket,
    retry: () => setAttempt((n) => n + 1)
  };
};

// GET /closing-stock — each category's stock at the end of each month of the
// period (this month: the stock on hand now). Nothing is fetched until
// `enabled`, so charts that never draw stock don't ask for it.
// include: 'inventory' adds reorder level sums and today's idle stock
export const useClosingStock = (period, enabled = true, include = null) => {
  const key = enabled ? JSON.stringify({ ...periodQuery(period), ...(include ? { include } : {}) }) : null;
  const [result, setResult] = useState({ key: null, data: null });

  useEffect(() => {
    if (!key) return undefined;
    let stale = false;
    api
      .get('/closing-stock', { params: JSON.parse(key) })
      .then((res) => {
        if (!stale) setResult({ key, data: res.data.success ? res.data.data : null });
      })
      .catch((error) => {
        if (stale) return;
        console.error('Error fetching closing stock:', error);
        setResult({ key, data: null });
      });
    return () => {
      stale = true;
    };
  }, [key]);

  // Only figures for the period asked for — never last period's
  return result.key === key ? result.data : null;
};

export const num = (n) => Number(n || 0).toLocaleString('en-IN');

// A category's sales target for month i of a breakdown: the month before's
// net sales plus the category's growth percent (2,500 at 10% → 2,750). None
// when the category has no growth set, or nothing was sold the month before.
export const targetFor = (row, i) => {
  if (row?.growth == null || i < 1) return null;
  const before = row.monthly?.[i - 1] ?? 0;
  if (before <= 0) return null;
  return Math.round(before * (1 + row.growth / 100));
};

// "YYYY-MM" of today, as the breakdown's month keys are written
export const thisMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// The rows of a sales breakdown as chart series: categories travel with a
// stand-in id for "no category", everything else by its own id
export const toSeries = (data) =>
  (data?.rows || []).map((r) =>
    data.by === 'category'
      ? { ...r, id: categoryId(r.name), label: categoryLabel(r.name), raw: r.name }
      : { ...r, label: r.name, raw: r.id }
  );
