import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { RANGE_LABELS, categoryId, categoryLabel } from '../../utils/categorySales';

export const UNASSIGNED_ID = 'unassigned';
const RANGE_KEY = 'investor.months';

const storedRange = () => {
  try {
    const n = Number(localStorage.getItem(RANGE_KEY));
    return RANGE_LABELS[n] ? n : 12;
  } catch {
    return 12;
  }
};

// How many months back the investor pages look — kept in the URL (so a link
// or the back button keeps it) and remembered across visits
export const useMonths = () => {
  const [params, setParams] = useSearchParams();
  const fromUrl = Number(params.get('months'));
  const months = RANGE_LABELS[fromUrl] ? fromUrl : storedRange();
  const setMonths = (value) => {
    try {
      localStorage.setItem(RANGE_KEY, String(value));
    } catch {
      // not remembered — fine
    }
    const next = new URLSearchParams(params);
    next.set('months', String(value));
    setParams(next, { replace: true });
  };
  return [months, setMonths];
};

// GET /orders/stats/sales-breakdown — see the backend controller for the
// query. `query` is a plain object; undefined values are left out. Holds the
// previous result while a new one loads, so charts keep their frame.
export const useSalesBreakdown = (query) => {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(query);
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

export const num = (n) => Number(n || 0).toLocaleString('en-IN');

// The rows of a sales breakdown as chart series: categories travel with a
// stand-in id for "no category", everything else by its own id
export const toSeries = (data) =>
  (data?.rows || []).map((r) =>
    data.by === 'category'
      ? { ...r, id: categoryId(r.name), label: categoryLabel(r.name), raw: r.name }
      : { ...r, label: r.name, raw: r.id }
  );
