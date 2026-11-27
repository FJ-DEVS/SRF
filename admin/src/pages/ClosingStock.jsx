import React, { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';
import { RangeSelect, FilterRow } from '../components/investor/InvestorBits';
import { periodQuery, periodText, num } from '../components/investor/salesReport';
import { categoryLabel } from '../utils/categorySales';
import { Boxes, RotateCcw, Target } from 'lucide-react';

// Each category's stock at the end of each month — set against the month's
// sales for the investor dashboard's sale : stock ratio, and the target ratio
// every category is steered towards (1:3 to start with). The server
// records the figures itself (stock on hand, every half hour, against the
// running month); here the admin types in months from before it did, or
// corrects one. A typed figure wins; clearing it brings the recorded one back.

const cellKey = (category, month) => `${category}\u0000${month}`;

const StockCell = ({ row, index, month, live, onSaved }) => {
  const typed = row.manual[index] ? row.values[index] : null;
  const recorded = row.auto[index];
  const [text, setText] = useState(typed == null ? '' : String(typed));
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const [error, setError] = useState('');

  useEffect(() => {
    setText(typed == null ? '' : String(typed));
  }, [typed]);

  if (month.key === live) {
    return (
      <td className="px-3 py-2 text-right tabular-nums text-slate-500" title="This month hasn't closed — the stock on hand right now">
        {num(row.values[index])}
      </td>
    );
  }

  const save = async () => {
    const trimmed = text.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if (next === typed || (next === null && typed === null)) return;
    if (next !== null && (!Number.isInteger(next) || Math.abs(next) > 100000000)) {
      setState('error');
      setError('A whole number of pieces');
      return;
    }
    setState('saving');
    try {
      const res = await api.put('/closing-stock', { category: row.category, month: month.key, quantity: next });
      if (!res.data.success) throw new Error(res.data.message);
      setState('saved');
      setError('');
      onSaved(row.category, index, next);
    } catch (e) {
      setState('error');
      setError(e.response?.data?.message || e.message || 'Could not save');
    }
  };

  const ring =
    state === 'error'
      ? 'ring-rose-400'
      : state === 'saved'
        ? 'ring-emerald-400'
        : typed != null
          ? 'ring-indigo-300'
          : 'ring-slate-200';

  return (
    <td className="px-1.5 py-1.5">
      <div className="relative flex items-center">
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (state !== 'idle') setState('idle');
          }}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setText(typed == null ? '' : String(typed));
              setState('idle');
            }
          }}
          placeholder={recorded == null ? '—' : num(recorded)}
          disabled={state === 'saving'}
          aria-label={`${categoryLabel(row.category)} closing stock, ${month.label}`}
          title={
            error ||
            (typed != null
              ? `Typed in${recorded != null ? ` — the server recorded ${num(recorded)}` : ''}. Clear it to use the recorded figure.`
              : recorded != null
                ? 'Recorded by the server — type a figure to replace it'
                : 'No figure for this month — type one in')
          }
          className={`!h-8 w-24 !rounded-md !border-0 !px-2 text-right tabular-nums ring-1 ${ring} ${
            typed != null ? 'font-semibold text-indigo-700' : 'text-slate-700 placeholder:text-slate-400'
          }`}
        />
        {typed != null && (
          <button
            type="button"
            onClick={() => {
              setText('');
              // Save straight away — no blur to wait for
              setTimeout(() => document.activeElement?.blur(), 0);
            }}
            onMouseDown={(e) => e.preventDefault()}
            className="ml-0.5 rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
            title="Clear the typed figure"
            aria-label="Clear the typed figure"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
    </td>
  );
};

// The sale : stock ratio every category is steered towards — 3 is 1:3
const TargetEditor = ({ target, onSaved }) => {
  const [text, setText] = useState(String(target));
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const [message, setMessage] = useState('');

  const save = async () => {
    const next = Number(text);
    if (next === target) return;
    if (!Number.isFinite(next) || next < 0.1 || next > 100) {
      setState('error');
      setMessage('Between 0.1 and 100');
      return;
    }
    setState('saving');
    try {
      const res = await api.put('/closing-stock/target', { target: next });
      if (!res.data.success) throw new Error(res.data.message);
      setText(String(res.data.data.target));
      onSaved(res.data.data.target);
      setState('saved');
      setMessage('');
    } catch (e) {
      setState('error');
      setMessage(e.response?.data?.message || e.message || 'Could not save');
    }
  };

  return (
    <label className="flex items-center gap-2" title={message || 'The sale : stock ratio aimed for — lower is leaner'}>
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Target className="h-3.5 w-3.5" /> Target ratio
      </span>
      <span className="text-[13px] font-semibold text-slate-600">1 :</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setState('idle');
        }}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        disabled={state === 'saving'}
        aria-label="Target sale to stock ratio"
        className={`!h-9 !w-16 text-right tabular-nums ring-1 ${
          state === 'error' ? 'ring-rose-400' : state === 'saved' ? 'ring-emerald-400' : 'ring-transparent'
        }`}
      />
      {state === 'error' && <span className="text-[11px] text-rose-600">{message}</span>}
    </label>
  );
};

const ClosingStock = () => {
  const [period, setPeriod] = useState('m12');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(periodQuery(period));

  useEffect(() => {
    let stale = false;
    api
      .get('/closing-stock', { params: JSON.parse(key) })
      .then((res) => {
        if (stale) return;
        if (res.data.success) {
          setData(res.data.data);
          setError('');
        } else {
          setError(res.data.message || 'Could not load');
        }
      })
      .catch((e) => {
        if (!stale) setError(e.response?.data?.message || 'Could not load closing stock');
      });
    return () => {
      stale = true;
    };
  }, [key, attempt]);

  // A saved cell updates the table in place, no reload
  const onSaved = useCallback((category, index, value) => {
    setData((d) => ({
      ...d,
      rows: d.rows.map((r) => {
        if (r.category !== category) return r;
        const values = [...r.values];
        const manual = [...r.manual];
        manual[index] = value !== null;
        values[index] = value ?? r.auto[index];
        return { ...r, values, manual };
      })
    }));
  }, []);

  return (
    <div className="srf-page">
      <PageHeader
        title="Closing Stock"
        subtitle="Each category's stock at the end of each month — set against the month's sales for the sale : stock ratio on the investor dashboard"
      />
      <FilterRow>
        <RangeSelect months={period} onChange={setPeriod} />
        {data && <TargetEditor target={data.target} onSaved={(target) => setData((d) => ({ ...d, target }))} />}
        <p className="text-[12px] text-slate-500">
          The server records every category's stock on hand through the month; what it holds when the month ends is the
          closing stock. Type a figure to fill an earlier month or correct one —{' '}
          <span className="font-semibold text-indigo-700">typed figures</span> replace the{' '}
          <span className="text-slate-400">recorded ones</span> shown faintly. Clear a typed figure to go back.
        </p>
      </FilterRow>

      {error && !data && (
        <div className="srf-card flex flex-col items-center gap-2 p-10 text-center text-[13px] text-slate-500">
          {error}
          <button type="button" className="srf-btn srf-btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}

      {!data && !error && (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-500" />
        </div>
      )}

      {data && (
        <div className="srf-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-4 sm:px-5">
            <Boxes className="h-4 w-4 text-slate-400" />
            <h3 className="font-display text-sm font-bold text-slate-900">Pieces on hand at month end</h3>
            <span className="text-[11px] text-slate-400">· {periodText(period)}</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-max text-left text-[12px]">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2 sm:px-5">Category</th>
                  {data.months.map((m) => (
                    <th key={m.key} className="px-3 py-2 text-right">
                      {m.label}
                      {m.key === data.live && <span className="block font-normal normal-case tracking-normal">today</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row) => (
                  <tr key={row.category || '__none__'}>
                    <td className={`sticky left-0 z-10 bg-white px-4 py-2 font-medium sm:px-5 ${row.category ? 'text-slate-800' : 'italic text-slate-500'}`}>
                      {categoryLabel(row.category)}
                    </td>
                    {data.months.map((m, i) => (
                      <StockCell
                        key={cellKey(row.category, m.key)}
                        row={row}
                        index={i}
                        month={m}
                        live={data.live}
                        onSaved={onSaved}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.rows.length === 0 && (
            <p className="px-5 py-8 text-center text-[13px] text-slate-400">No categories yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ClosingStock;
