import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ArrowUpRight, ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import api from '../../utils/api';
import ChartFrame from '../ChartFrame';
import PdfButton from '../PdfButton';
import MonthlyLinesChart from '../MonthlyLinesChart';
import { MAX_SERIES, SERIES_COLORS } from '../../utils/seriesColors';
import { categoryId, categoryLabel } from '../../utils/categorySales';
import { downloadReportPdf } from '../../utils/reportPdf';
import { RangeSelect } from './InvestorBits';
import { periodQuery, periodText, num, UNASSIGNED_ID } from './salesReport';

// One graph per customer: which categories they bought over the period, and
// how many pieces of each — billed, less returns. Ten customers a page,
// busiest first; a search finds any customer by name or phone.

const PAGE_SIZE = 10;
const ENDPOINT = '/orders/stats/customer-categories';
const BAR = '#2a78d6';
const BAR_NEGATIVE = '#e34948';

// GET /orders/stats/customer-categories, holding the last page while the next
// one loads so the cards don't jump
const useCustomerCategories = (query) => {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(query);
  const ticket = `${key}#${attempt}`;
  const [result, setResult] = useState({ ticket: null, data: null, error: null });

  useEffect(() => {
    let stale = false;
    api
      .get(ENDPOINT, { params: JSON.parse(key) })
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
        console.error('Error fetching customer categories:', error);
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

const shortName = (name, max = 18) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);

const BarTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="font-semibold text-slate-800">{row.label}</p>
      <p className="mt-0.5 tabular-nums text-slate-700">
        <span className="font-semibold text-slate-900">{num(row.total)}</span> pcs net
      </p>
      {row.returned > 0 && <p className="tabular-nums text-rose-600">{num(row.returned)} returned</p>}
    </div>
  );
};

// Categories as horizontal bars, biggest first. `colored` paints each bar in
// its line's colour (rows carry `color`), so the bars are the legend of the
// month-by-month chart beside them.
const CategoryBars = ({ rows, height, onOpenCategory, colored = false }) => (
  <div style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 44, left: 4, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid stroke="#eef0f3" horizontal={false} />
        <XAxis
          type="number"
          stroke="#94a3b8"
          tickLine={false}
          axisLine={{ stroke: '#cbd5e1' }}
          allowDecimals={false}
          tickFormatter={num}
          style={{ fontSize: '11px' }}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={118}
          stroke="#64748b"
          tickLine={false}
          axisLine={false}
          interval={0}
          tickFormatter={(v) => shortName(v)}
          style={{ fontSize: '11px' }}
        />
        <Tooltip cursor={{ fill: '#f1f5f9' }} content={<BarTooltip />} isAnimationActive={false} />
        <Bar
          dataKey="total"
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
          cursor={onOpenCategory ? 'pointer' : undefined}
          onClick={onOpenCategory ? (bar) => onOpenCategory(bar.payload?.raw ?? bar.raw) : undefined}
          label={{ position: 'right', formatter: num, fontSize: 11, fill: '#334155' }}
        >
          {rows.map((r) => (
            <Cell key={r.id} fill={colored ? r.color : r.total < 0 ? BAR_NEGATIVE : BAR} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

const CustomerCard = ({ customer, months, period, onOpenCustomer, onOpenCategory }) => {
  const rows = useMemo(
    () => customer.categories.map((c) => ({ ...c, id: categoryId(c.name), label: categoryLabel(c.name), raw: c.name })),
    [customer.categories]
  );
  // Maximised, the same categories also run month by month
  const series = useMemo(() => rows.slice(0, MAX_SERIES).map((r, slot) => ({ ...r, slot })), [rows]);
  // Categories past the eighth have no line of their own — grey bars
  const legendRows = useMemo(
    () => rows.map((r, i) => ({ ...r, color: i < MAX_SERIES ? SERIES_COLORS[i] : '#cbd5e1' })),
    [rows]
  );
  const barHeight = (n) => Math.max(120, n * 30 + 28);
  const subtitle = [
    customer.salesman ? `Salesman ${customer.salesman}` : 'No salesman',
    `${num(customer.total)} pcs net`,
    customer.returned > 0 ? `${num(customer.returned)} returned` : null,
    `${rows.length} ${rows.length === 1 ? 'category' : 'categories'}`
  ].filter(Boolean).join(' · ');

  return (
    <ChartFrame
      title={customer.name}
      subtitle={subtitle}
      className="min-w-0"
      pdfTitle={`${customer.name} — category-wise purchases`}
      pdfDetails={[`Period: ${periodText(period)}`]}
      pdfTables={() => [{
        head: [['#', 'Category', 'Net pieces', 'Returned']],
        body: rows.map((r, i) => [i + 1, r.label, num(r.total), num(r.returned)]),
        foot: [['', 'Total', num(customer.total), num(customer.returned)]]
      }]}
      actions={
        <button
          type="button"
          data-pdf-ignore=""
          onClick={() => onOpenCustomer(customer.id)}
          className="srf-btn srf-btn-secondary !px-2.5 !py-1.5 !text-[12px]"
          title={`Open ${customer.name} — month by month`}
        >
          Open <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      }
    >
      {(expanded) =>
        rows.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-slate-400">Nothing billed in this period.</p>
        ) : expanded ? (
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pieces per category</p>
              <CategoryBars rows={legendRows} height={barHeight(rows.length)} onOpenCategory={onOpenCategory} colored />
            </div>
            <div className="flex min-h-[320px] min-w-0 flex-col">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Month by month{rows.length > MAX_SERIES ? ` — top ${MAX_SERIES} categories` : ''}
              </p>
              <div className="min-h-0 flex-1">
                <MonthlyLinesChart months={months} series={series} height="100%" />
              </div>
            </div>
          </div>
        ) : (
          <CategoryBars rows={rows} height={barHeight(rows.length)} onOpenCategory={onOpenCategory} />
        )
      }
    </ChartFrame>
  );
};

// The section under the Customer Sales graph
const CustomerCategoryCards = ({ period, onPeriodChange, onOpenCustomer, onOpenCategory }) => {
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [salesman, setSalesman] = useState('');
  const [salesmen, setSalesmen] = useState([]);

  // A new search, salesman or period starts again at page 1
  const filterKey = JSON.stringify({ period, search, salesman });
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const page = paging.key === filterKey ? paging.page : 1;
  const goTo = (n) => setPaging({ key: filterKey, page: n });

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  useEffect(() => {
    api
      .get('/salesman/names')
      .then((res) => setSalesmen(res.data?.data || []))
      .catch(() => setSalesmen([]));
  }, []);

  const filters = {
    ...periodQuery(period),
    ...(search ? { search } : {}),
    ...(salesman ? { salesman } : {})
  };
  const { data, error, loading, retry } = useCustomerCategories({ ...filters, page, limit: PAGE_SIZE });
  const salesmanName = salesman === UNASSIGNED_ID
    ? 'No assigned salesman'
    : salesmen.find((s) => s._id === salesman)?.name;

  // Every customer the filters match, one row each, a column per category
  const exportAll = async () => {
    const res = await api.get(ENDPOINT, { params: { ...filters, all: 1 } });
    if (!res.data.success) throw new Error(res.data.message || 'Could not load');
    const { customers } = res.data.data;
    const totals = new Map();
    for (const c of customers) {
      for (const cat of c.categories) totals.set(cat.name, (totals.get(cat.name) || 0) + cat.total);
    }
    const cats = [...totals.keys()].sort((a, b) => totals.get(b) - totals.get(a));
    const body = customers.map((c, i) => {
      const of = new Map(c.categories.map((cat) => [cat.name, cat.total]));
      return [i + 1, c.name, c.salesman || '—', ...cats.map((name) => (of.has(name) ? num(of.get(name)) : '-')), num(c.total)];
    });
    await downloadReportPdf({
      title: 'Customer-wise category purchases',
      subtitle: 'Net pieces each customer bought, per category — billed, less returns',
      details: [
        `Period: ${periodText(period)}`,
        ...(salesmanName ? [`Salesman: ${salesmanName}`] : []),
        ...(search ? [`Search: “${search}”`] : []),
        `${customers.length} customer${customers.length === 1 ? '' : 's'}`
      ],
      tables: [{
        head: [['#', 'Customer', 'Salesman', ...cats.map(categoryLabel), 'Total']],
        body,
        foot: [['', 'Total', '', ...cats.map((name) => num(totals.get(name))), num(customers.reduce((s, c) => s + c.total, 0))]]
      }]
    });
  };

  const count = data?.count || 0;
  const first = count ? (data.page - 1) * data.limit + 1 : 0;
  const last = data ? Math.min(count, data.page * data.limit) : 0;

  const pager = data && data.pages > 1 && (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => goTo(data.page - 1)}
        disabled={data.page <= 1 || loading}
        className="srf-btn srf-btn-secondary disabled:opacity-40"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Previous
      </button>
      <span className="text-[12px] tabular-nums text-slate-500">
        Page {data.page} of {data.pages}
      </span>
      <button
        type="button"
        onClick={() => goTo(data.page + 1)}
        disabled={data.page >= data.pages || loading}
        className="srf-btn srf-btn-secondary disabled:opacity-40"
      >
        Next <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <section className="space-y-3 sm:space-y-4" aria-labelledby="customer-category-cards">
      <div className="srf-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="customer-category-cards" className="font-display text-sm font-bold text-slate-900">
              Customer-wise category purchases
            </h2>
            <p className="text-[11px] text-slate-400">
              One graph per customer — the categories they bought over {periodText(period)} and how many pieces of each.
              Busiest customers first.
            </p>
          </div>
          <PdfButton label="PDF — all customers" title="Download every matching customer's categories as PDF" onExport={exportAll} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Search name or phone…"
              className="w-64 !pl-8"
              aria-label="Search customer"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <Users className="h-3.5 w-3.5" /> Salesman
            </span>
            <select value={salesman} onChange={(e) => setSalesman(e.target.value)} className="max-w-[200px]">
              <option value="">All salesmen</option>
              {salesmen.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
              <option value={UNASSIGNED_ID}>No assigned salesman</option>
            </select>
          </label>
          <RangeSelect months={period} onChange={onPeriodChange} />
          {data && (
            <span className="ml-auto text-[12px] tabular-nums text-slate-500">
              {count ? `${first}–${last} of ${count} customer${count === 1 ? '' : 's'}` : 'No customers'}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="srf-card flex flex-wrap items-center justify-between gap-3 p-4 text-[13px] text-rose-600">
          {error}
          <button type="button" onClick={retry} className="srf-btn srf-btn-secondary">Try again</button>
        </div>
      )}

      {!data && !error && (
        <div className="grid gap-3 sm:gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="srf-card h-56 animate-pulse bg-slate-50" />
          ))}
        </div>
      )}

      {data && data.customers.length === 0 && (
        <div className="srf-card p-10 text-center text-[13px] text-slate-400">
          {search ? `No customer matches “${search}”.` : 'No customer bought anything in this period.'}
        </div>
      )}

      {data && data.customers.length > 0 && (
        <>
          <div className={`grid items-start gap-3 transition-opacity sm:gap-4 xl:grid-cols-2 ${loading ? 'opacity-60' : ''}`}>
            {data.customers.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                months={data.months}
                period={period}
                onOpenCustomer={onOpenCustomer}
                onOpenCategory={onOpenCategory}
              />
            ))}
          </div>
          {pager}
        </>
      )}
    </section>
  );
};

export default CustomerCategoryCards;
