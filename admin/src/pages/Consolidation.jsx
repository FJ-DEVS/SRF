import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';
import {
  ShoppingCart,
  Package,
  UserCircle,
  Building2,
  Users,
  Truck,
  Layers,
  Boxes,
  IndianRupee,
  Hash,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  Filter,
  AlertTriangle,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList
} from 'recharts';

// Chart palette (validated for colorblind safety on white surface)
const BLUE = '#2a78d6';
const AQUA = '#1baf7a';

const STATUS_ORDER = [
  'pending',
  'to roll',
  'rolled',
  'billed',
  'delivered',
  'completed',
  'cancellation_requested',
  'cancelled'
];

const STATUS_META = {
  'pending': { label: 'Pending', color: '#eda100' },
  'to roll': { label: 'To Roll', color: '#2a78d6' },
  'rolled': { label: 'Rolled', color: '#4a3aa7' },
  'billed': { label: 'Billed', color: '#eb6834' },
  'delivered': { label: 'Delivered', color: '#008300' },
  'completed': { label: 'Completed', color: '#1baf7a' },
  'cancellation_requested': { label: 'Cancel Requested', color: '#e34948' },
  'cancelled': { label: 'Cancelled', color: '#e87ba4' }
};

const PRESETS = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom range' }
];

const toYMD = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const rangeForPreset = (preset) => {
  const now = new Date();
  const today = toYMD(now);
  const daysAgo = (n) => toYMD(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));

  switch (preset) {
    case 'today': return { start: today, end: today };
    case '7d': return { start: daysAgo(6), end: today };
    case '30d': return { start: daysAgo(29), end: today };
    case '90d': return { start: daysAgo(89), end: today };
    case 'month': return { start: toYMD(new Date(now.getFullYear(), now.getMonth(), 1)), end: today };
    case 'year': return { start: toYMD(new Date(now.getFullYear(), 0, 1)), end: today };
    default: return null;
  }
};

// The report opens on the current month — "all time" is a deliberate choice,
// not a default
const DEFAULT_FILTERS = {
  preset: 'month',
  startDate: '',
  endDate: '',
  type: '',
  status: '',
  item: ''
};

const formatPeriod = (period, granularity) => {
  if (granularity === 'day') {
    const d = new Date(period);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }
  const [y, m] = period.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

const formatNumber = (n) => (n || 0).toLocaleString('en-IN');
const formatCurrency = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const formatCurrencyCompact = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);

const truncate = (s, len = 18) => (s && s.length > len ? `${s.slice(0, len - 1)}…` : s);

// Shared tooltip card — value leads, label follows
const TooltipCard = ({ title, rows }) => (
  <div className="rounded-lg bg-white px-3 py-2 shadow-md ring-1 ring-slate-200 text-[12px]">
    <p className="mb-1 font-semibold text-slate-800">{title}</p>
    {rows.map((row, i) => (
      <p key={i} className="text-slate-500">
        <span className="font-semibold text-slate-900">{row.value}</span> {row.label}
      </p>
    ))}
  </div>
);

const TrendTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <TooltipCard
      title={row.label}
      rows={[
        { value: formatNumber(row.orders), label: 'orders' },
        { value: formatNumber(row.qty), label: 'quantity' }
      ]}
    />
  );
};

const BarRowTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const rows = [
    { value: formatNumber(row.orders), label: 'orders' },
    { value: formatNumber(row.qty), label: 'quantity' }
  ];
  if (row.value != null) rows.push({ value: formatCurrency(row.value), label: 'est. value' });
  return <TooltipCard title={row.name} rows={rows} />;
};

const barCursor = { fill: 'rgba(148, 163, 184, 0.08)' };
const axisTick = { fontSize: 12, fill: '#64748b' };

const ChartCard = ({ title, subtitle, children }) => (
  <div className="srf-card p-4 sm:p-5">
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const EmptyChart = () => (
  <div className="flex h-48 items-center justify-center text-sm text-slate-400">
    No orders match the current filters
  </div>
);

const Consolidation = () => {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [qtyDraft, setQtyDraft] = useState({ minQty: '', maxQty: '' });
  const [qtyFilter, setQtyFilter] = useState({ minQty: '', maxQty: '' });
  const [items, setItems] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Category consolidation has its own two controls: whose orders to count,
  // and whether to show only stock above / below the check level
  const [categorySalesman, setCategorySalesman] = useState('');
  const [salesmanData, setSalesmanData] = useState(null);
  const [salesmanLoading, setSalesmanLoading] = useState(false);
  const [checkFilter, setCheckFilter] = useState('');

  // Item + salesman lists for the filter dropdowns
  useEffect(() => {
    const fetchLists = async () => {
      try {
        const [itemsRes, salesmenRes] = await Promise.all([
          api.get('/items', { params: { limit: 1000 } }),
          api.get('/salesman', { params: { limit: 500 } })
        ]);
        if (itemsRes.data.success) {
          setItems([...itemsRes.data.data].sort((a, b) => a.name.localeCompare(b.name)));
        }
        if (salesmenRes.data.success) {
          setSalesmen([...salesmenRes.data.data].sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch (error) {
        console.error('Error fetching filter lists:', error);
      }
    };
    fetchLists();
  }, []);

  // Debounce quantity inputs so we don't refetch on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setQtyFilter(qtyDraft), 500);
    return () => clearTimeout(t);
  }, [qtyDraft]);

  // The filter row translated into query params — the salesman-scoped fetch
  // reuses it so both views cover the same period
  const reportParams = () => {
    const params = {};
    const range = filters.preset === 'custom'
      ? { start: filters.startDate, end: filters.endDate }
      : rangeForPreset(filters.preset);
    if (range?.start) params.startDate = range.start;
    if (range?.end) params.endDate = range.end;
    if (filters.type) params.type = filters.type;
    if (filters.status) params.status = filters.status;
    if (filters.item) params.item = filters.item;
    if (qtyFilter.minQty !== '') params.minQty = qtyFilter.minQty;
    if (qtyFilter.maxQty !== '') params.maxQty = qtyFilter.maxQty;
    return params;
  };

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setRefreshing(true);
        const response = await api.get('/orders/consolidation', { params: reportParams() });
        if (response.data.success) {
          setData(response.data.data);
        }
      } catch (error) {
        console.error('Error fetching consolidation report:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };
    fetchReport();
  }, [filters, qtyFilter]);

  // Second pass, scoped to one salesman's own orders. Only the category
  // consolidation reads it, so the rest of the page stays on the full picture.
  useEffect(() => {
    if (!categorySalesman) {
      setSalesmanData(null);
      return;
    }
    const fetchForSalesman = async () => {
      try {
        setSalesmanLoading(true);
        const response = await api.get('/orders/consolidation', {
          params: { ...reportParams(), salesman: categorySalesman }
        });
        if (response.data.success) setSalesmanData(response.data.data);
      } catch (error) {
        console.error('Error fetching salesman consolidation:', error);
        setSalesmanData(null);
      } finally {
        setSalesmanLoading(false);
      }
    };
    fetchForSalesman();
  }, [categorySalesman, filters, qtyFilter]);

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setQtyDraft({ minQty: '', maxQty: '' });
    setQtyFilter({ minQty: '', maxQty: '' });
    setCategorySalesman('');
    setCheckFilter('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div>
      </div>
    );
  }

  const structure = data?.structure || {};
  const summary = data?.summary || {};
  const granularity = data?.granularity || 'month';

  const trendData = (data?.trend || []).map((t) => ({
    ...t,
    label: formatPeriod(t.period, granularity)
  }));

  const statusByKey = Object.fromEntries((data?.statusBreakdown || []).map((s) => [s.status, s]));
  const statusData = STATUS_ORDER
    .filter((s) => statusByKey[s]?.orders > 0)
    .map((s) => ({
      name: STATUS_META[s].label,
      color: STATUS_META[s].color,
      orders: statusByKey[s].orders,
      qty: statusByKey[s].qty
    }));

  // Order columns follow the salesman picker; catalog columns never do — stock
  // on hand belongs to the shop, not to a salesman
  const categorySource = categorySalesman ? salesmanData : data;

  // Category summary — the 800+ item catalog rolled up into its handful of
  // categories. Catalog counts come from the item master (unfiltered); order
  // counts come from the filtered slice, so both are always in view.
  const allCategoryRows = (() => {
    const byName = new Map();
    const row = (name) => {
      if (!byName.has(name)) {
        byName.set(name, {
          category: name,
          items: 0, stockQty: 0, stockValue: 0,
          checkLevel: null, belowCheckLevel: false, itemsBelowCheck: 0,
          orders: 0, qty: 0, sellQty: 0, purchaseQty: 0, value: 0, orderedItems: 0
        });
      }
      return byName.get(name);
    };
    (data?.categoryCatalog || []).forEach((c) => Object.assign(row(c.category), {
      items: c.items, stockQty: c.stockQty, stockValue: c.stockValue,
      checkLevel: c.checkLevel, belowCheckLevel: c.belowCheckLevel, itemsBelowCheck: c.itemsBelowCheck
    }));
    (categorySource?.categoryBreakdown || []).forEach((c) => Object.assign(row(c.category), {
      orders: c.orders, qty: c.qty, sellQty: c.sellQty,
      purchaseQty: c.purchaseQty, value: c.value, orderedItems: c.items
    }));
    return [...byName.values()].sort((a, b) => b.qty - a.qty || b.items - a.items);
  })();

  // Check-level view: "below" is a breached line, "above" a healthy one.
  // Categories and items with no check level fall out of both.
  const matchesCheckFilter = (row) => {
    if (checkFilter === 'below') return row.belowCheckLevel;
    if (checkFilter === 'above') return row.checkLevel != null && !row.belowCheckLevel;
    return true;
  };

  const categoryRows = allCategoryRows.filter(matchesCheckFilter);

  const categoryTotals = categoryRows.reduce((acc, r) => ({
    items: acc.items + r.items,
    stockQty: acc.stockQty + r.stockQty,
    // Column sum — only used once a check-level filter drops rows, where the
    // distinct order count from the API no longer describes what's on screen
    orders: acc.orders + r.orders,
    qty: acc.qty + r.qty,
    sellQty: acc.sellQty + r.sellQty,
    purchaseQty: acc.purchaseQty + r.purchaseQty,
    value: acc.value + r.value
  }), { items: 0, stockQty: 0, orders: 0, qty: 0, sellQty: 0, purchaseQty: 0, value: 0 });

  const categoryChart = categoryRows
    .filter((r) => r.qty > 0)
    .map((r) => ({ name: r.category, qty: r.qty, orders: r.orders, value: r.value }));

  const itemBreakdown = (data?.itemBreakdown || []).filter(matchesCheckFilter);
  const topItems = itemBreakdown.slice(0, 10).map((row) => ({ ...row, name: row.name }));
  const stockHealth = data?.stockHealth || {};
  const selectedSalesman = salesmen.find((s) => s._id === categorySalesman);
  const topParties = (data?.topParties || []).map((p) => ({
    ...p,
    name: p.partyType === 'Vendor' ? `${p.name} (V)` : p.name
  }));

  const structureCards = [
    { label: 'Total Orders', value: structure.orders, icon: ShoppingCart, link: '/orders' },
    { label: 'Items', value: structure.items, icon: Package, link: '/items' },
    { label: 'Customers', value: structure.customers, icon: UserCircle, link: '/customers' },
    { label: 'Vendors', value: structure.vendors, icon: Building2, link: '/vendors' },
    { label: 'Salesmen', value: structure.salesmen, icon: Users, link: '/salesmen' },
    { label: 'Cargo', value: structure.cargo, icon: Truck, link: '/cargo' }
  ];

  const summaryCards = [
    { label: 'Matched Orders', value: formatNumber(summary.orders), icon: Layers },
    { label: 'Total Quantity', value: formatNumber(summary.totalQty), icon: Boxes },
    { label: 'Estimated Value', value: formatCurrencyCompact(summary.totalValue), icon: IndianRupee },
    { label: 'Avg Qty / Order', value: formatNumber(Math.round(summary.avgQty || 0)), icon: Hash },
    { label: 'Sell Orders', value: formatNumber(summary.sellOrders), icon: ArrowUpRight },
    { label: 'Purchase Orders', value: formatNumber(summary.purchaseOrders), icon: ArrowDownLeft }
  ];

  const selectClass =
    'px-3 py-2 bg-white border border-slate-200 rounded-lg text-[13px] text-slate-700 focus:border-slate-400 focus:ring-4 focus:ring-slate-400/10 transition-all';

  return (
    <div className="srf-page space-y-5">
      <PageHeader
        title="Consolidation Report"
        subtitle="Complete picture of orders, items and quantities across the system"
      />

      {/* Filters — one row, scopes everything below */}
      <div className="srf-card p-3 sm:p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-slate-400 mr-1">
            <Filter className="h-3.5 w-3.5" /> Filters
          </span>

          <select
            value={filters.preset}
            onChange={(e) => setFilters({ ...filters, preset: e.target.value })}
            className={selectClass}
          >
            {PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>

          {filters.preset === 'custom' && (
            <>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className={selectClass}
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className={selectClass}
              />
            </>
          )}

          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className={selectClass}
          >
            <option value="">All Types</option>
            <option value="sell order">Sell Order</option>
            <option value="purchase order">Purchase Order</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className={selectClass}
          >
            <option value="">All Status</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>

          <select
            value={filters.item}
            onChange={(e) => setFilters({ ...filters, item: e.target.value })}
            className={`${selectClass} max-w-[180px]`}
          >
            <option value="">All Items</option>
            {items.map((item) => (
              <option key={item._id} value={item._id}>{item.name}</option>
            ))}
          </select>

          <input
            type="number"
            min="0"
            placeholder="Min qty"
            value={qtyDraft.minQty}
            onChange={(e) => setQtyDraft({ ...qtyDraft, minQty: e.target.value })}
            className={`${selectClass} w-24`}
          />
          <input
            type="number"
            min="0"
            placeholder="Max qty"
            value={qtyDraft.maxQty}
            onChange={(e) => setQtyDraft({ ...qtyDraft, maxQty: e.target.value })}
            className={`${selectClass} w-24`}
          />

          <button onClick={resetFilters} className="srf-btn srf-btn-secondary" title="Reset filters">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Project structure — unfiltered entity counts */}
      <div>
        <h2 className="mb-2.5 text-sm font-semibold text-slate-700">Project Structure</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {structureCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.label} to={card.link} className="srf-card srf-card-hover p-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Icon className="h-4 w-4 text-slate-600" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-900">{formatNumber(card.value)}</p>
                    <p className="text-[10px] leading-tight font-medium text-slate-500">{card.label}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Everything below re-renders against the filter slice */}
      <div className={`space-y-5 transition-opacity ${refreshing ? 'opacity-60 pointer-events-none' : ''}`}>
        {/* Filtered summary */}
        <div>
          <h2 className="mb-2.5 text-sm font-semibold text-slate-700">Filtered Summary</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="srf-card p-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                      <Icon className="h-4 w-4 text-indigo-600" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-slate-900">{card.value}</p>
                      <p className="text-[10px] leading-tight font-medium text-slate-500">{card.label}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Orders over time */}
        <ChartCard
          title="Orders Over Time"
          subtitle={granularity === 'day' ? 'Daily order count' : 'Monthly order count'}
        >
          {trendData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip content={<TrendTooltip />} />
                <Area
                  type="monotone"
                  dataKey="orders"
                  stroke={BLUE}
                  strokeWidth={2}
                  fill={BLUE}
                  fillOpacity={0.1}
                  dot={trendData.length <= 15 ? { r: 3.5, fill: BLUE, fillOpacity: 1, strokeWidth: 2, stroke: '#ffffff' } : false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Status distribution */}
          <ChartCard title="Orders by Status" subtitle="Order count per workflow status">
            {statusData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={statusData.length * 40 + 40}>
                <BarChart data={statusData} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                  <YAxis type="category" dataKey="name" width={120} tick={axisTick} tickLine={false} axisLine={false} />
                  <Tooltip content={<BarRowTooltip />} cursor={barCursor} />
                  <Bar dataKey="orders" barSize={18} radius={[0, 4, 4, 0]}>
                    {statusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                    <LabelList dataKey="orders" position="right" style={{ fontSize: 12, fill: '#475569' }} formatter={formatNumber} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Top parties */}
          <ChartCard title="Top Customers & Vendors" subtitle="By number of orders — (V) marks vendors">
            {topParties.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={topParties.length * 40 + 40}>
                <BarChart data={topParties} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => truncate(v, 16)}
                  />
                  <Tooltip content={<BarRowTooltip />} cursor={barCursor} />
                  <Bar dataKey="orders" fill={AQUA} barSize={18} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="orders" position="right" style={{ fontSize: 12, fill: '#475569' }} formatter={formatNumber} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Top items by quantity */}
        <ChartCard title="Top Items by Quantity" subtitle="Total quantity ordered per item (top 10)">
          {topItems.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={topItems.length * 40 + 40}>
              <BarChart data={topItems} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={160}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => truncate(v, 20)}
                />
                <Tooltip content={<BarRowTooltip />} cursor={barCursor} />
                <Bar dataKey="qty" fill={BLUE} barSize={18} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="qty" position="right" style={{ fontSize: 12, fill: '#475569' }} formatter={formatNumber} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Check level (safety stock) — scopes the category and item tables below */}
        <div className="srf-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Check Level</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Safety stock line per item and category. Anything at or below it needs reordering.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {[
                { value: '', label: 'All', icon: null },
                { value: 'below', label: 'Below check level', icon: AlertTriangle },
                { value: 'above', label: 'Above check level', icon: ShieldCheck }
              ].map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCheckFilter(opt.value)}
                    className={`srf-chip ${checkFilter === opt.value ? 'srf-chip-active' : ''}`}
                  >
                    {Icon && <Icon className="h-3 w-3" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Items below check level', value: stockHealth.itemsBelow, tone: 'amber' },
              { label: 'Items tracked', value: stockHealth.itemsTracked, tone: 'slate' },
              { label: 'Categories below check level', value: stockHealth.categoriesBelow, tone: 'amber' },
              { label: 'Categories tracked', value: stockHealth.categoriesTracked, tone: 'slate' }
            ].map((tile) => (
              <div
                key={tile.label}
                className={`rounded-xl border p-3 ${
                  tile.tone === 'amber' && tile.value > 0
                    ? 'border-amber-200 bg-amber-50/70'
                    : 'border-slate-200 bg-slate-50/60'
                }`}
              >
                <p className={`font-display text-lg font-bold ${
                  tile.tone === 'amber' && tile.value > 0 ? 'text-amber-700' : 'text-slate-900'
                }`}>
                  {formatNumber(tile.value)}
                </p>
                <p className="mt-0.5 text-[10.5px] font-medium leading-tight text-slate-500">{tile.label}</p>
              </div>
            ))}
          </div>

          {checkFilter && (
            <p className="mt-3 text-[11px] text-slate-400">
              Showing only {checkFilter === 'below' ? 'items and categories at or below' : 'items and categories above'}{' '}
              their check level — anything without a check level is hidden.
            </p>
          )}
        </div>

        {/* Category summary — detailed quantities rolled up per item category */}
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Detailed Item Summary by Category</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Every item category with its catalog size, stock on hand and ordered quantities
            </p>
          </div>

          {/* Category cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categoryRows.length === 0 ? (
              <p className="col-span-full py-6 text-center text-sm text-slate-400">
                No item categories found
              </p>
            ) : (
              categoryRows.map((row) => (
                <div
                  key={row.category}
                  className={`srf-card p-3.5 ${row.belowCheckLevel ? '!border-amber-200 !bg-amber-50/60' : ''}`}
                >
                  <div className="flex items-center gap-1.5">
                    {row.belowCheckLevel
                      ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      : <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                    <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {row.category}
                    </p>
                  </div>
                  <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">
                    {formatNumber(row.qty)}
                  </p>
                  <p className="text-[10px] font-medium leading-tight text-slate-500">Qty ordered</p>
                  <div className="mt-2 border-t border-slate-100 pt-2 text-[10.5px] leading-relaxed text-slate-500">
                    <p className="tabular-nums">
                      <span className="font-semibold text-slate-700">{formatNumber(row.items)}</span> items
                      {' · '}
                      <span className="font-semibold text-slate-700">{formatNumber(row.orders)}</span> orders
                    </p>
                    <p className="tabular-nums">
                      Stock <span className="font-semibold text-slate-700">{formatNumber(row.stockQty)}</span>
                      {row.checkLevel != null && (
                        <> · Check <span className="font-semibold text-slate-700">{formatNumber(row.checkLevel)}</span></>
                      )}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <ChartCard title="Quantity by Category" subtitle="Total quantity ordered per item category">
            {categoryChart.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={categoryChart.length * 40 + 40}>
                <BarChart data={categoryChart} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tick={axisTick}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => truncate(v, 16)}
                  />
                  <Tooltip content={<BarRowTooltip />} cursor={barCursor} />
                  <Bar dataKey="qty" fill={BLUE} barSize={18} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="qty" position="right" style={{ fontSize: 12, fill: '#475569' }} formatter={formatNumber} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Table view of the same numbers */}
          <div className={`srf-card overflow-hidden transition-opacity ${salesmanLoading ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-800">Category Consolidation</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Catalog columns cover every item; order columns follow the filters above.
                  An order spanning two categories is counted in both, so the order total is
                  the distinct matched count.
                  {selectedSalesman && (
                    <>
                      {' '}Order columns count only orders booked by{' '}
                      <span className="font-semibold text-slate-700">{selectedSalesman.name}</span>;
                      stock stays shop-wide.
                    </>
                  )}
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <UserRound className="h-3.5 w-3.5" /> Salesman
                </span>
                <select
                  value={categorySalesman}
                  onChange={(e) => setCategorySalesman(e.target.value)}
                  className={`${selectClass} max-w-[190px]`}
                >
                  <option value="">All salesmen</option>
                  {salesmen.map((s) => (
                    <option key={s._id} value={s._id}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Mobile: stacked rows, no horizontal scroll */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {categoryRows.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">No item categories found</p>
              ) : (
                categoryRows.map((row) => (
                  <div key={row.category} className={`px-4 py-3 ${row.belowCheckLevel ? 'bg-amber-50/60' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">
                        {row.category}
                        {row.belowCheckLevel && (
                          <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-500" />
                        )}
                      </p>
                      <p className="shrink-0 text-sm font-medium tabular-nums text-slate-800">
                        {formatCurrency(row.value)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-slate-500">
                      {formatNumber(row.items)} items · Stock {formatNumber(row.stockQty)}
                      {row.checkLevel != null && ` · Check ${formatNumber(row.checkLevel)}`}
                      {row.itemsBelowCheck > 0 && ` · ${formatNumber(row.itemsBelowCheck)} item(s) low`}
                    </p>
                    <p className="text-xs tabular-nums text-slate-500">
                      {formatNumber(row.orders)} {row.orders === 1 ? 'order' : 'orders'} · Qty{' '}
                      {formatNumber(row.qty)} (sell {formatNumber(row.sellQty)} / purchase{' '}
                      {formatNumber(row.purchaseQty)})
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Desktop: full table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-right">Items</th>
                    <th className="text-right">Stock Qty</th>
                    <th className="text-right">Check Level</th>
                    <th className="text-right">Orders</th>
                    <th className="text-right">Ordered Qty</th>
                    <th className="text-right">Sell Qty</th>
                    <th className="text-right">Purchase Qty</th>
                    <th className="text-right">Est. Value</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400">
                        No item categories found
                      </td>
                    </tr>
                  ) : (
                    <>
                      {categoryRows.map((row) => (
                        <tr key={row.category} className={row.belowCheckLevel ? 'bg-amber-50/60' : ''}>
                          <td className="font-medium text-slate-800">
                            <span className="inline-flex items-center gap-1.5">
                              {row.category}
                              {row.belowCheckLevel && (
                                <span className="srf-badge bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200">
                                  <AlertTriangle className="h-3 w-3" /> low
                                </span>
                              )}
                            </span>
                            {row.itemsBelowCheck > 0 && (
                              <p className="text-[11px] font-normal text-amber-600">
                                {formatNumber(row.itemsBelowCheck)} item(s) below check level
                              </p>
                            )}
                          </td>
                          <td className="text-right tabular-nums">{formatNumber(row.items)}</td>
                          <td className="text-right tabular-nums">{formatNumber(row.stockQty)}</td>
                          <td className="text-right tabular-nums">
                            {row.checkLevel != null
                              ? <span className={row.belowCheckLevel ? 'font-semibold text-amber-700' : ''}>{formatNumber(row.checkLevel)}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="text-right tabular-nums">{formatNumber(row.orders)}</td>
                          <td className="text-right tabular-nums font-medium text-slate-800">{formatNumber(row.qty)}</td>
                          <td className="text-right tabular-nums">{formatNumber(row.sellQty)}</td>
                          <td className="text-right tabular-nums">{formatNumber(row.purchaseQty)}</td>
                          <td className="text-right tabular-nums font-medium text-slate-800">{formatCurrency(row.value)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50/80">
                        <td className="font-semibold text-slate-800">Total</td>
                        <td className="text-right font-semibold tabular-nums text-slate-800">{formatNumber(categoryTotals.items)}</td>
                        <td className="text-right font-semibold tabular-nums text-slate-800">{formatNumber(categoryTotals.stockQty)}</td>
                        <td className="text-right text-slate-300">—</td>
                        <td
                          className="text-right font-semibold tabular-nums text-slate-800"
                          title="Distinct matched orders — one order can span several categories, so this is not the column sum"
                        >
                          {formatNumber(checkFilter ? categoryTotals.orders : (categorySource?.summary?.orders ?? 0))}
                        </td>
                        <td className="text-right font-semibold tabular-nums text-slate-800">{formatNumber(categoryTotals.qty)}</td>
                        <td className="text-right font-semibold tabular-nums text-slate-800">{formatNumber(categoryTotals.sellQty)}</td>
                        <td className="text-right font-semibold tabular-nums text-slate-800">{formatNumber(categoryTotals.purchaseQty)}</td>
                        <td className="text-right font-semibold tabular-nums text-slate-800">{formatCurrency(categoryTotals.value)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Item consolidation table — the readable twin of the charts above */}
        <div className="srf-card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
            <h3 className="text-sm font-semibold text-slate-800">Item Consolidation</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Every item in the filtered orders, with order count, total quantity and estimated value
            </p>
          </div>
          {/* Mobile: stacked rows, no horizontal scroll */}
          <div className="sm:hidden divide-y divide-slate-100">
            {itemBreakdown.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">
                No orders match the current filters
              </p>
            ) : (
              itemBreakdown.map((row) => (
                <div
                  key={row.itemId || row.name}
                  className={`px-4 py-3 ${row.belowCheckLevel ? 'bg-amber-50/60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {row.name}
                        {row.belowCheckLevel && (
                          <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-500" />
                        )}
                      </p>
                      <p className="text-xs text-slate-500">{row.category || '—'}</p>
                    </div>
                    <p className="shrink-0 text-sm font-medium text-slate-800 tabular-nums">
                      {formatCurrency(row.value)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {formatNumber(row.orders)} {row.orders === 1 ? 'order' : 'orders'} · Qty{' '}
                    {formatNumber(row.qty)} · {formatCurrency(row.price)}/unit
                  </p>
                  <p className="text-xs text-slate-500 tabular-nums">
                    Stock {formatNumber(row.stockQty)}
                    {row.checkLevel != null && ` · Check ${formatNumber(row.checkLevel)}`}
                  </p>
                </div>
              ))
            )}
          </div>
          {/* Desktop: full table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="srf-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th className="text-right">Orders</th>
                  <th className="text-right">Total Qty</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">Check Level</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Est. Value</th>
                </tr>
              </thead>
              <tbody>
                {itemBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      No orders match the current filters
                    </td>
                  </tr>
                ) : (
                  itemBreakdown.map((row) => (
                    <tr key={row.itemId || row.name} className={row.belowCheckLevel ? 'bg-amber-50/60' : ''}>
                      <td className="font-medium text-slate-800">
                        <span className="inline-flex items-center gap-1.5">
                          {row.name}
                          {row.belowCheckLevel && (
                            <span className="srf-badge bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200">
                              <AlertTriangle className="h-3 w-3" /> low
                            </span>
                          )}
                        </span>
                      </td>
                      <td>{row.category || '—'}</td>
                      <td className="text-right tabular-nums">{formatNumber(row.orders)}</td>
                      <td className="text-right tabular-nums">{formatNumber(row.qty)}</td>
                      <td className="text-right tabular-nums">{formatNumber(row.stockQty)}</td>
                      <td className="text-right tabular-nums">
                        {row.checkLevel != null
                          ? <span className={row.belowCheckLevel ? 'font-semibold text-amber-700' : ''}>{formatNumber(row.checkLevel)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="text-right tabular-nums">{formatCurrency(row.price)}</td>
                      <td className="text-right tabular-nums font-medium text-slate-800">{formatCurrency(row.value)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Consolidation;
