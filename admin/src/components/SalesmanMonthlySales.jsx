import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { CalendarRange, Award, Users } from 'lucide-react';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const fromKey = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1);
};
const monthLabel = (key) => MONTH_SHORT[fromKey(key).getMonth()];

// "Aug – Sep 2026", or "Dec 2025 – Jan 2026" across a new year
const pairLabel = (laterKey) => {
  const later = fromKey(laterKey);
  const earlier = new Date(later.getFullYear(), later.getMonth() - 1, 1);
  return earlier.getFullYear() === later.getFullYear()
    ? `${MONTH_SHORT[earlier.getMonth()]} – ${MONTH_SHORT[later.getMonth()]} ${later.getFullYear()}`
    : `${MONTH_SHORT[earlier.getMonth()]} ${earlier.getFullYear()} – ${MONTH_SHORT[later.getMonth()]} ${later.getFullYear()}`;
};

// The later month of the pair: last month by default, back a year
const MONTH_CHOICES = Array.from({ length: 12 }, (_, i) => {
  const now = new Date();
  return toKey(new Date(now.getFullYear(), now.getMonth() - 1 - i, 1));
});

const num = (n) => Number(Math.round((n || 0) * 100) / 100).toLocaleString('en-IN');
const categoryLabel = (name) => name || 'Uncategorised';

// Salesman × item category sales for two consecutive months, with the points
// those sales earn — the monthly sheet the office used to keep by hand.
// Independent of the page filters.
const SalesmanMonthlySales = () => {
  const [month, setMonth] = useState(MONTH_CHOICES[0]);
  // '' lets the server pick the schema running today
  const [schemaId, setSchemaId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSales = async () => {
      try {
        setLoading(true);
        const response = await api.get('/orders/consolidation/salesmen', { params: { month, schema: schemaId || undefined } });
        if (response.data.success) setData(response.data.data);
      } catch (error) {
        console.error('Error fetching salesman monthly sales:', error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchSales();
  }, [month, schemaId]);

  const months = data?.months.map((m) => m.key) || [];
  const categories = data?.categories || [];
  const salesmen = data?.rows || [];
  const rows = data?.others ? [...salesmen, data.others] : salesmen;

  const sales = (row, category, key) => row.sales[category]?.[key] || 0;
  const total = (pick) => rows.reduce((sum, row) => sum + pick(row), 0);

  return (
    <div className={`srf-card overflow-hidden transition-opacity ${loading && data ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">Salesman Sales by Month</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Pieces each salesman sold per category, by the month the order was placed — cancelled orders and
            completed returns left out. Points are pieces × the category&apos;s rate in the chosen schema, for
            both months. Not affected by the filters above.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <CalendarRange className="h-3.5 w-3.5" /> Months
            </span>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-[190px]">
              {MONTH_CHOICES.map((key) => (
                <option key={key} value={key}>{pairLabel(key)}</option>
              ))}
            </select>
          </label>
          {data?.schemas?.length > 0 && (
            <label className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <Award className="h-3.5 w-3.5" /> Points
              </span>
              <select
                value={schemaId || data.schema?._id || ''}
                onChange={(e) => setSchemaId(e.target.value)}
                className="max-w-[220px]"
                title="Schema whose points rates are used"
              >
                {data.schemas.map((sc) => (
                  <option key={sc._id} value={sc._id}>{sc.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-500" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Users className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-700">No salesmen yet</p>
        </div>
      ) : (
        <>
          {/* Mobile: one card per salesman, no horizontal scroll */}
          <div className="divide-y divide-slate-100 md:hidden">
            {rows.map((row) => (
              <div key={row.salesmanId || 'others'} className="p-3.5">
                <p className={`text-sm font-semibold ${row.salesmanId ? 'text-slate-900' : 'italic text-slate-500'}`}>{row.name}</p>
                <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-[12px]">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Category</span>
                  {months.map((key) => (
                    <span key={key} className="text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {monthLabel(key)}
                    </span>
                  ))}
                  {categories.map((category) => (
                    <React.Fragment key={category}>
                      <span className="truncate text-slate-600">{categoryLabel(category)}</span>
                      {months.map((key) => (
                        <span key={key} className="text-right tabular-nums text-slate-800">{num(sales(row, category, key))}</span>
                      ))}
                    </React.Fragment>
                  ))}
                  <span className="border-t border-slate-100 pt-1 font-semibold text-indigo-700">Points</span>
                  {months.map((key) => (
                    <span key={key} className="border-t border-slate-100 pt-1 text-right font-semibold tabular-nums text-indigo-700">
                      {num(row.points[key])}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: the full sheet */}
          <div className="hidden overflow-x-auto md:block">
            <table className="srf-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="sticky left-0 z-10 !bg-slate-50 align-bottom">Salesman</th>
                  {categories.map((category) => (
                    <th key={category} colSpan={months.length} className="border-l !text-center">
                      {categoryLabel(category)}
                    </th>
                  ))}
                  <th colSpan={months.length} className="border-l !text-center !text-indigo-700">Points</th>
                </tr>
                <tr>
                  {[...categories, null].map((category) =>
                    months.map((key, i) => (
                      <th
                        key={`${category}-${key}`}
                        className={`!py-1.5 text-right !text-[10px] ${i === 0 ? 'border-l' : ''} ${category === null ? '!text-indigo-700' : ''}`}
                      >
                        {monthLabel(key)}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.salesmanId || 'others'}>
                    <td className={`sticky left-0 z-10 bg-white font-semibold ${row.salesmanId ? 'text-slate-900' : 'italic text-slate-500'}`}>
                      {row.name}
                    </td>
                    {categories.map((category) =>
                      months.map((key, i) => (
                        <td key={`${category}-${key}`} className={`text-right tabular-nums ${i === 0 ? 'border-l' : ''}`}>
                          {num(sales(row, category, key))}
                        </td>
                      ))
                    )}
                    {months.map((key, i) => (
                      <td key={key} className={`text-right font-semibold tabular-nums text-indigo-700 ${i === 0 ? 'border-l' : ''}`}>
                        {num(row.points[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50/80 text-[13px] font-semibold text-slate-900">
                  <td className="sticky left-0 z-10 border-t border-slate-200 bg-slate-50 px-4 py-3">Total</td>
                  {categories.map((category) =>
                    months.map((key, i) => (
                      <td
                        key={`${category}-${key}`}
                        className={`border-t border-slate-200 px-4 py-3 text-right tabular-nums ${i === 0 ? 'border-l' : ''}`}
                      >
                        {num(total((row) => sales(row, category, key)))}
                      </td>
                    ))
                  )}
                  {months.map((key, i) => (
                    <td
                      key={key}
                      className={`border-t border-slate-200 px-4 py-3 text-right tabular-nums text-indigo-700 ${i === 0 ? 'border-l' : ''}`}
                    >
                      {num(total((row) => row.points[key]))}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default SalesmanMonthlySales;
