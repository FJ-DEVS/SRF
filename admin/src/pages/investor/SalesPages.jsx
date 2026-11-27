import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import ChartFrame from '../../components/ChartFrame';
import BreakdownReport from '../../components/investor/BreakdownReport';
import { RangeSelect, StatTiles, FilterRow } from '../../components/investor/InvestorBits';
import { useMonths, useSalesBreakdown, num, toSeries, UNASSIGNED_ID } from '../../components/investor/salesReport';
import { RANGE_LABELS, categoryLabel } from '../../utils/categorySales';
import { ArrowLeft, Layers, Users, UserCircle } from 'lucide-react';

// The investor's sales reports. Every figure is billed pieces, by the month
// they were billed, less completed returns in the month they came back.
// Salesmen are the salesman each customer is assigned to today.

const BASIS = 'Billed pieces by month, less returns in the month they came back';

// Opening a category, salesman or customer keeps the month range
const useOpeners = (months) => {
  const navigate = useNavigate();
  const go = (path, key, value) => navigate(`${path}?${key}=${encodeURIComponent(value)}&months=${months}`);
  return {
    category: (name) => go('/investor/categories/view', 'category', name),
    salesman: (id) => go('/investor/salesmen/view', 'salesman', id),
    customer: (id) => (id && id !== 'deleted' ? go('/investor/customers/view', 'customer', id) : undefined)
  };
};

const BackButton = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)} className="srf-btn srf-btn-secondary">
      <ArrowLeft className="h-3.5 w-3.5" /> Back
    </button>
  );
};

const activeCount = (data, skip = () => false) =>
  (data?.rows || []).filter((r) => !skip(r) && (r.total !== 0 || r.returned > 0)).length;
const busiest = (data, skip = () => false) =>
  [...(data?.rows || [])].filter((r) => !skip(r) && r.total > 0).sort((a, b) => b.total - a.total)[0] || null;

// ── Categories ─────────────────────────────────────────────────────────────

export const InvestorCategories = () => {
  const [months, setMonths] = useMonths();
  const open = useOpeners(months);
  const report = useSalesBreakdown({ by: 'category', months });
  const { data } = report;
  const top = busiest(data);
  const range = <RangeSelect months={months} onChange={setMonths} />;

  return (
    <div className="srf-page">
      <PageHeader title="Category Sales" subtitle={BASIS} />
      <FilterRow>{range}</FilterRow>
      {data && (
        <StatTiles
          tiles={[
            { label: 'Pieces sold (net)', value: num(data.total) },
            { label: 'Pieces returned', value: num(data.returned) },
            { label: 'Categories with sales', value: activeCount(data) },
            { label: 'Top category', value: top ? categoryLabel(top.name) : '—', hint: top && `${num(top.total)} pcs` }
          ]}
        />
      )}
      <BreakdownReport
        report={report}
        months={months}
        title="Category sales by month"
        subtitle="One line per category — pick which to draw. Click one for its salesmen and customers."
        noun="category"
        storageKey="investor.categories.selection"
        onOpen={(row) => open.category(row.raw)}
        tableTitle="Every category"
        rangeControl={range}
      />
    </div>
  );
};

export const InvestorCategoryView = () => {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const [months, setMonths] = useMonths();
  const open = useOpeners(months);
  const bySalesman = useSalesBreakdown({ by: 'salesman', category, months });
  const byCustomer = useSalesBreakdown({ by: 'customer', category, months });
  const [names, setNames] = useState([]);
  const title = categoryLabel(category);
  const range = <RangeSelect months={months} onChange={setMonths} />;

  useEffect(() => {
    api
      .get('/categories')
      .then((res) => setNames((res.data?.data || []).map((c) => c.name).filter(Boolean)))
      .catch(() => setNames([]));
  }, []);

  const pick = (value) => {
    const next = new URLSearchParams(params);
    next.set('category', value);
    setParams(next, { replace: true });
  };
  const top = busiest(bySalesman.data, (r) => r.id === UNASSIGNED_ID);

  return (
    <div className="srf-page">
      <PageHeader title={title} subtitle={`Category · ${BASIS.toLowerCase()}`}>
        <BackButton />
      </PageHeader>
      <FilterRow>
        <label className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Layers className="h-3.5 w-3.5" /> Category
          </span>
          <select value={category} onChange={(e) => pick(e.target.value)} className="max-w-[220px]">
            {!names.includes(category) && category !== '' && <option value={category}>{title}</option>}
            {names.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
            <option value="">Uncategorised</option>
          </select>
        </label>
        {range}
      </FilterRow>
      {bySalesman.data && (
        <StatTiles
          tiles={[
            { label: 'Pieces sold (net)', value: num(bySalesman.data.total) },
            { label: 'Pieces returned', value: num(bySalesman.data.returned) },
            { label: 'Customers buying', value: activeCount(byCustomer.data) },
            { label: 'Top salesman', value: top ? top.name : '—', hint: top && `${num(top.total)} pcs` }
          ]}
        />
      )}
      <BreakdownReport
        report={bySalesman}
        months={months}
        title="Salesman-wise sales"
        subtitle={`${title}, by the salesman each customer is assigned to — whoever placed the order`}
        noun="salesman"
        onOpen={(row) => open.salesman(row.raw)}
        tableTitle="Sales per salesman"
        rangeControl={range}
      />
      <BreakdownReport
        report={byCustomer}
        months={months}
        title="Customer-wise sales"
        subtitle={`Who buys ${title} — the busiest customers are drawn first`}
        noun="customer"
        onOpen={(row) => open.customer(row.raw)}
        tableTitle={`Customers buying ${title}`}
        rangeControl={range}
      />
    </div>
  );
};

// ── Salesmen ───────────────────────────────────────────────────────────────

export const InvestorSalesmen = () => {
  const [months, setMonths] = useMonths();
  const open = useOpeners(months);
  const report = useSalesBreakdown({ by: 'salesman', months });
  const { data } = report;
  const top = busiest(data, (r) => r.id === UNASSIGNED_ID);
  const range = <RangeSelect months={months} onChange={setMonths} />;

  return (
    <div className="srf-page">
      <PageHeader title="Salesman Sales" subtitle={`${BASIS}. Each customer counts for the salesman assigned to them.`} />
      <FilterRow>{range}</FilterRow>
      {data && (
        <StatTiles
          tiles={[
            { label: 'Pieces sold (net)', value: num(data.total) },
            { label: 'Pieces returned', value: num(data.returned) },
            { label: 'Salesmen with sales', value: activeCount(data, (r) => r.id === UNASSIGNED_ID) },
            { label: 'Top salesman', value: top ? top.name : '—', hint: top && `${num(top.total)} pcs` }
          ]}
        />
      )}
      <BreakdownReport
        report={report}
        months={months}
        title="Salesman sales by month"
        subtitle="One line per salesman, all categories together. Click one for their categories and customers."
        noun="salesman"
        storageKey="investor.salesmen.selection"
        onOpen={(row) => open.salesman(row.raw)}
        tableTitle="Every salesman"
        rangeControl={range}
      />
    </div>
  );
};

export const InvestorSalesmanView = () => {
  const [params, setParams] = useSearchParams();
  const salesman = params.get('salesman') || '';
  const [months, setMonths] = useMonths();
  const open = useOpeners(months);
  const byCategory = useSalesBreakdown({ by: 'category', salesman, months });
  const byCustomer = useSalesBreakdown({ by: 'customer', salesman, months });
  const [salesmen, setSalesmen] = useState([]);
  const range = <RangeSelect months={months} onChange={setMonths} />;

  useEffect(() => {
    api
      .get('/salesman/names')
      .then((res) => setSalesmen(res.data?.data || []))
      .catch(() => setSalesmen([]));
  }, []);

  const name = byCategory.data?.filters?.salesman?.name
    || salesmen.find((s) => s._id === salesman)?.name
    || (salesman === UNASSIGNED_ID ? 'No assigned salesman' : 'Salesman');
  const pick = (value) => {
    const next = new URLSearchParams(params);
    next.set('salesman', value);
    setParams(next, { replace: true });
  };
  const top = busiest(byCategory.data);

  return (
    <div className="srf-page">
      <PageHeader title={name} subtitle={`Salesman · ${BASIS.toLowerCase()} · their assigned customers`}>
        <BackButton />
      </PageHeader>
      <FilterRow>
        <label className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Users className="h-3.5 w-3.5" /> Salesman
          </span>
          <select value={salesman} onChange={(e) => pick(e.target.value)} className="max-w-[220px]">
            {salesmen.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
            <option value={UNASSIGNED_ID}>No assigned salesman</option>
          </select>
        </label>
        {range}
      </FilterRow>
      {byCategory.error && !byCategory.data ? (
        <div className="srf-card p-10 text-center text-[13px] text-slate-500">{byCategory.error}</div>
      ) : (
        <>
          {byCategory.data && (
            <StatTiles
              tiles={[
                { label: 'Pieces sold (net)', value: num(byCategory.data.total) },
                { label: 'Pieces returned', value: num(byCategory.data.returned) },
                { label: 'Customers buying', value: activeCount(byCustomer.data) },
                { label: 'Top category', value: top ? categoryLabel(top.name) : '—', hint: top && `${num(top.total)} pcs` }
              ]}
            />
          )}
          <BreakdownReport
            report={byCategory}
            months={months}
            title="Category-wise sales"
            subtitle={`What ${name}'s customers buy, category by category`}
            noun="category"
            onOpen={(row) => open.category(row.raw)}
            tableTitle="Sales per category"
            rangeControl={range}
          />
          <BreakdownReport
            report={byCustomer}
            months={months}
            title="Customer-wise sales"
            subtitle={`${name}'s customers — the busiest are drawn first`}
            noun="customer"
            onOpen={(row) => open.customer(row.raw)}
            tableTitle="Sales per customer"
            rangeControl={range}
          />
        </>
      )}
    </div>
  );
};

// ── Customers ──────────────────────────────────────────────────────────────

export const InvestorCustomers = () => {
  const [months, setMonths] = useMonths();
  const open = useOpeners(months);
  const report = useSalesBreakdown({ by: 'customer', months });
  const { data } = report;
  const top = busiest(data);
  const range = <RangeSelect months={months} onChange={setMonths} />;

  return (
    <div className="srf-page">
      <PageHeader title="Customer Sales" subtitle={BASIS} />
      <FilterRow>{range}</FilterRow>
      {data && (
        <StatTiles
          tiles={[
            { label: 'Pieces sold (net)', value: num(data.total) },
            { label: 'Pieces returned', value: num(data.returned) },
            { label: 'Customers buying', value: activeCount(data) },
            { label: 'Top customer', value: top ? top.name : '—', hint: top && `${num(top.total)} pcs` }
          ]}
        />
      )}
      <BreakdownReport
        report={report}
        months={months}
        title="Customer sales by month"
        subtitle="The busiest customers are drawn first — add or remove any. Click one for what they buy."
        noun="customer"
        onOpen={(row) => open.customer(row.raw)}
        tableTitle="Every customer with sales"
        rangeControl={range}
      />
    </div>
  );
};

// Which categories a customer buys most, as bars
const TopCategories = ({ data, months }) => {
  const rows = useMemo(() => toSeries(data).filter((r) => r.total !== 0 || r.returned > 0), [data]);
  const most = Math.max(1, ...rows.map((r) => r.total));
  return (
    <ChartFrame title="Top categories" subtitle={`Net pieces over the last ${RANGE_LABELS[months]}`}>
      {(expanded) =>
        rows.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-slate-400">Nothing billed in this period.</p>
        ) : (
          <ol className={`space-y-3 ${expanded ? 'mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto' : ''}`}>
            {rows.map((r, i) => (
              <li key={r.id}>
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="w-5 shrink-0 text-right tabular-nums text-slate-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{r.label}</span>
                  {r.returned > 0 && <span className="text-[11px] tabular-nums text-rose-600">−{num(r.returned)} returned</span>}
                  <span className="w-16 text-right font-semibold tabular-nums text-slate-900">{num(r.total)}</span>
                </div>
                <div className="ml-7 mt-1 h-2 overflow-hidden rounded-full bg-slate-100" title={`${r.label}: ${num(r.total)} pcs`}>
                  <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(0, (r.total / most) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ol>
        )
      }
    </ChartFrame>
  );
};

export const InvestorCustomerView = () => {
  const [params] = useSearchParams();
  const customer = params.get('customer') || '';
  const [months, setMonths] = useMonths();
  const open = useOpeners(months);
  const byCategory = useSalesBreakdown({ by: 'category', customer, months });
  const info = byCategory.data?.filters?.customer;
  const top = busiest(byCategory.data);
  const range = <RangeSelect months={months} onChange={setMonths} />;

  return (
    <div className="srf-page">
      <PageHeader
        title={info?.name || 'Customer'}
        subtitle={`Customer · salesman ${info?.salesman || 'not assigned'} · ${BASIS.toLowerCase()}`}
      >
        <BackButton />
      </PageHeader>
      <FilterRow>{range}</FilterRow>
      {byCategory.error && !byCategory.data ? (
        <div className="srf-card flex flex-col items-center p-10 text-center">
          <UserCircle className="h-6 w-6 text-slate-300" />
          <p className="mt-2 text-[13px] text-slate-500">{byCategory.error}</p>
        </div>
      ) : (
        <>
          {byCategory.data && (
            <StatTiles
              tiles={[
                { label: 'Pieces bought (net)', value: num(byCategory.data.total) },
                { label: 'Pieces returned', value: num(byCategory.data.returned) },
                { label: 'Categories bought', value: activeCount(byCategory.data) },
                { label: 'Top category', value: top ? categoryLabel(top.name) : '—', hint: top && `${num(top.total)} pcs` }
              ]}
            />
          )}
          <div className="grid gap-3 sm:gap-4 xl:grid-cols-3">
            <div className="min-w-0 space-y-3 sm:space-y-4 xl:col-span-2">
              <BreakdownReport
                report={byCategory}
                months={months}
                title="Category-wise purchases"
                subtitle="What this customer buys, month by month"
                noun="category"
                onOpen={(row) => open.category(row.raw)}
                table={false}
                rangeControl={range}
              />
            </div>
            {byCategory.data && <TopCategories data={byCategory.data} months={months} />}
          </div>
          <BreakdownReport
            report={byCategory}
            months={months}
            title=""
            noun="category"
            onOpen={(row) => open.category(row.raw)}
            tableTitle="Purchases per category"
            chart={false}
          />
        </>
      )}
    </div>
  );
};
