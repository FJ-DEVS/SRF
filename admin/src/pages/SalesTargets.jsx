import React, { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';
import { num, targetFor, thisMonthKey } from '../components/investor/salesReport';
import { categoryLabel } from '../utils/categorySales';
import { TrendingUp } from 'lucide-react';

// Each category's monthly sales growth target. A month's target is the month
// before's net sales (billed, less returns) plus this percent — 2,500 sheets
// at 10% makes 2,750 for the next month. The investor dashboard draws it as a
// dotted run from last month's point to this month's target, on every
// category chart (the whole company, a salesman's, a customer's).

const GrowthCell = ({ category, onSaved }) => {
  const current = category.growthTarget;
  const [text, setText] = useState(current == null ? '' : String(current));
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const [error, setError] = useState('');

  useEffect(() => {
    setText(current == null ? '' : String(current));
  }, [current]);

  const save = async () => {
    const trimmed = text.trim().replace(/%$/, '');
    const next = trimmed === '' ? null : Number(trimmed);
    if (next === current) return;
    if (next !== null && (!Number.isFinite(next) || next < -100 || next > 1000)) {
      setState('error');
      setError('A percent between -100 and 1000');
      return;
    }
    setState('saving');
    try {
      const res = await api.put(`/categories/${category._id}`, { growthTarget: next });
      if (!res.data.success) throw new Error(res.data.message);
      onSaved(category._id, res.data.data.growthTarget ?? null);
      setState('saved');
      setError('');
    } catch (e) {
      setState('error');
      setError(e.response?.data?.message || e.message || 'Could not save');
    }
  };

  const ring = state === 'error' ? 'ring-rose-400' : state === 'saved' ? 'ring-emerald-400' : 'ring-slate-200';
  return (
    <div className="flex items-center justify-end gap-1.5" title={error || 'Blank — no target for this category'}>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder="—"
        onChange={(e) => {
          setText(e.target.value);
          if (state !== 'idle') setState('idle');
        }}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        disabled={state === 'saving'}
        aria-label={`${category.name} monthly growth target, percent`}
        className={`!h-8 !w-20 !rounded-md !border-0 !px-2 text-right tabular-nums ring-1 ${ring}`}
      />
      <span className="text-[13px] text-slate-500">%</span>
    </div>
  );
};

const SalesTargets = () => {
  const [categories, setCategories] = useState(null);
  const [sales, setSales] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stale = false;
    Promise.all([api.get('/categories'), api.get('/orders/stats/sales-breakdown', { params: { by: 'category', months: 3 } })])
      .then(([cats, breakdown]) => {
        if (stale) return;
        setCategories(cats.data?.data || []);
        setSales(breakdown.data?.success ? breakdown.data.data : null);
        setError('');
      })
      .catch((e) => {
        if (!stale) setError(e.response?.data?.message || 'Could not load categories');
      });
    return () => {
      stale = true;
    };
  }, [attempt]);

  // Last month's and this month's sales per category, to preview targets
  const months = sales?.months || [];
  const now = thisMonthKey();
  const thisIndex = months.findIndex((m) => m.key === now);
  const salesOf = useMemo(() => new Map((sales?.rows || []).map((r) => [r.name, r])), [sales]);

  const onSaved = (id, growth) =>
    setCategories((list) => list.map((c) => (c._id === id ? { ...c, growthTarget: growth } : c)));

  return (
    <div className="srf-page">
      <PageHeader
        title="Sales Targets"
        subtitle="Monthly growth aimed for in each category — a month's target is last month's sales plus this percent"
      />

      <div className="srf-toolbar !flex-row items-start gap-3 text-[12px] text-slate-500">
        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p>
          Set 10% on a category that sold 2,500 pieces last month and this month&rsquo;s target is 2,750. Next month the
          target moves on from what this month really sells. The investor dashboard draws each target as a dotted line
          from last month&rsquo;s point, on the company&rsquo;s category chart and on every salesman&rsquo;s and
          customer&rsquo;s. Leave a category blank for no target.
        </p>
      </div>

      {error && !categories && (
        <div className="srf-card flex flex-col items-center gap-2 p-10 text-center text-[13px] text-slate-500">
          {error}
          <button type="button" className="srf-btn srf-btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}

      {!categories && !error && (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-500" />
        </div>
      )}

      {categories && (
        <div className="srf-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-left text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2.5 sm:px-5">Category</th>
                  <th className="px-3 py-2.5 text-right">Growth per month</th>
                  {thisIndex > 0 && (
                    <>
                      <th className="px-3 py-2.5 text-right">Sold {months[thisIndex - 1].label}</th>
                      <th className="px-3 py-2.5 text-right">Target {months[thisIndex].label}</th>
                      <th className="px-3 py-2.5 text-right">Sold so far</th>
                      <th className="px-4 py-2.5 text-right sm:px-5">Reached</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((c) => {
                  const row = { growth: c.growthTarget, monthly: salesOf.get(c.name)?.monthly || [] };
                  const target = thisIndex > 0 ? targetFor(row, thisIndex) : null;
                  const sold = row.monthly[thisIndex] || 0;
                  const reached = target ? Math.round((sold / target) * 100) : null;
                  return (
                    <tr key={c._id}>
                      <td className="px-4 py-2 font-medium text-slate-800 sm:px-5">{categoryLabel(c.name)}</td>
                      <td className="px-3 py-1.5">
                        <GrowthCell category={c} onSaved={onSaved} />
                      </td>
                      {thisIndex > 0 && (
                        <>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{num(row.monthly[thisIndex - 1] || 0)}</td>
                          <td className={`px-3 py-2 text-right font-semibold tabular-nums ${target == null ? 'text-slate-300' : 'text-slate-900'}`}>
                            {target == null ? '—' : num(target)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">{num(sold)}</td>
                          <td
                            className={`px-4 py-2 text-right font-semibold tabular-nums sm:px-5 ${
                              reached == null ? 'text-slate-300' : reached >= 100 ? 'text-emerald-700' : 'text-slate-600'
                            }`}
                          >
                            {reached == null ? '—' : `${reached}%`}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {categories.length === 0 && <p className="px-5 py-8 text-center text-[13px] text-slate-400">No categories yet.</p>}
        </div>
      )}
    </div>
  );
};

export default SalesTargets;
