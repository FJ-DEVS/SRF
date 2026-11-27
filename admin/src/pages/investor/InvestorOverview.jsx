import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import PageHeader from '../../components/PageHeader';
import ChartFrame from '../../components/ChartFrame';
import BreakdownReport from '../../components/investor/BreakdownReport';
import StockRatioReport from '../../components/investor/StockRatioReport';
import InventoryReport from '../../components/investor/InventoryReport';
import { RangeSelect, FilterRow } from '../../components/investor/InvestorBits';
import { useMonths, useSalesBreakdown, num } from '../../components/investor/salesReport';
import PdfButton from '../../components/PdfButton';
import { downloadReportPdf } from '../../utils/reportPdf';
import { STATUS_COLORS } from '../../utils/orderStatus';
import { AlertTriangle, Package, Layers } from 'lucide-react';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const tooltipStyle = {
  backgroundColor: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  boxShadow: '0 8px 24px -6px rgb(15 23 42 / 0.12)',
  fontSize: '12px',
  padding: '8px 12px'
};

// The investor's landing page: the order pipeline, order trends, sales by
// category and by salesman, and stock at its check level. Read only.
const InvestorOverview = () => {
  const navigate = useNavigate();
  const [months, setMonths] = useMonths();
  const [stats, setStats] = useState(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const byCategory = useSalesBreakdown({ by: 'category', months });
  const bySalesman = useSalesBreakdown({ by: 'salesman', months });
  const range = <RangeSelect months={months} onChange={setMonths} />;

  useEffect(() => {
    api
      .get('/orders/stats')
      .then((res) => {
        if (res.data.success) setStats(res.data.data);
        else setStatsFailed(true);
      })
      .catch(() => setStatsFailed(true));
  }, []);

  const sell = stats?.orders?.sell || {};
  const kpis = [
    { title: 'Sell orders', value: sell.total },
    { title: 'Pending', value: sell.pending },
    { title: 'To roll', value: sell.toRoll },
    { title: 'Rolled', value: sell.rolled },
    { title: 'Billed', value: sell.billed },
    { title: 'Delivered', value: sell.delivered }
  ];
  const statusData = [
    { name: 'Pending', key: 'pending', value: stats?.orders?.pending || 0 },
    { name: 'To Roll', key: 'to roll', value: stats?.orders?.toRoll || 0 },
    { name: 'Rolled', key: 'rolled', value: stats?.orders?.rolled || 0 },
    { name: 'Billed', key: 'billed', value: stats?.orders?.billed || 0 },
    { name: 'Delivered', key: 'delivered', value: stats?.orders?.delivered || 0 }
  ];
  const statusTotal = statusData.reduce((sum, s) => sum + s.value, 0);
  const activeStatus = statusData.filter((s) => s.value > 0);
  const alerts = stats?.stockAlerts || {};

  const openWith = (path, key) => (row) =>
    navigate(`${path}?${key}=${encodeURIComponent(row.raw)}&period=${months}`);

  return (
    <div className="srf-page">
      <PageHeader
        title="Investor Dashboard"
        subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      />

      {/* Order pipeline */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.title} className="srf-card p-3.5">
            <p className="font-display text-xl font-bold leading-none text-slate-900">{stats ? num(k.value) : '—'}</p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">{k.title}</p>
          </div>
        ))}
      </div>
      {statsFailed && <p className="text-[12px] text-rose-600">Couldn&apos;t load the order figures.</p>}

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-2">
          <ChartFrame
            title="Order Status"
            subtitle="Every order, by where it is now"
            pdfTables={() => [{
              head: [['Status', 'Orders', 'Share']],
              body: statusData.map((s) => [s.name, num(s.value), statusTotal ? `${Math.round((s.value / statusTotal) * 100)}%` : '-']),
              foot: [['Total', num(statusTotal), '']]
            }]}
          >
            {(expanded) => (
              <div className={`flex items-center gap-6 ${expanded ? 'min-h-0 flex-1 justify-center' : ''}`}>
                <div className={`relative shrink-0 ${expanded ? 'h-[60vh] w-[60vh] max-w-[60vw]' : 'h-44 w-44'}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={activeStatus.length ? activeStatus : [{ name: 'None', key: 'none', value: 1 }]}
                        innerRadius="64%"
                        outerRadius="92%"
                        paddingAngle={activeStatus.length > 1 ? 2 : 0}
                        dataKey="value"
                        stroke="#ffffff"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {(activeStatus.length ? activeStatus : [{ key: 'none' }]).map((s) => (
                          <Cell key={s.key} fill={activeStatus.length ? STATUS_COLORS[s.key] : '#e2e8f0'} />
                        ))}
                      </Pie>
                      {activeStatus.length > 0 && <Tooltip contentStyle={tooltipStyle} />}
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className={`font-display font-bold leading-none text-slate-900 ${expanded ? 'text-4xl' : 'text-2xl'}`}>{num(statusTotal)}</p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">Orders</p>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-2" style={expanded ? { maxWidth: 280 } : undefined}>
                  {statusData.map((s) => (
                    <div key={s.key} className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.key] }} />
                      <span className="flex-1 truncate text-xs text-slate-500">{s.name}</span>
                      <span className="text-xs font-semibold tabular-nums text-slate-800">{num(s.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ChartFrame>
        </div>

        <div className="min-w-0 lg:col-span-3">
          <ChartFrame
            title="Order Trends"
            subtitle="Orders placed and delivered — last 6 months"
            pdfTables={() => [{
              head: [['Month', 'Orders placed', 'Delivered']],
              body: (stats?.trends || []).map((t) => [t.month, num(t.orders), num(t.delivered)])
            }]}
            actions={
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                  <span className="h-0.5 w-3 rounded-full bg-[#2a78d6]" /> Orders
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                  <span className="h-0.5 w-3 rounded-full bg-[#1baf7a]" /> Delivered
                </span>
              </div>
            }
          >
            {(expanded) => (
              <div className={expanded ? 'min-h-0 flex-1' : 'h-52'}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats?.trends || []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="invOrders" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2a78d6" stopOpacity={0.16} />
                        <stop offset="100%" stopColor="#2a78d6" stopOpacity={0.01} />
                      </linearGradient>
                      <linearGradient id="invDelivered" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1baf7a" stopOpacity={0.16} />
                        <stop offset="100%" stopColor="#1baf7a" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="month" stroke="#94a3b8" tickLine={false} axisLine={{ stroke: '#cbd5e1' }} style={{ fontSize: '11px' }} />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} style={{ fontSize: '11px' }} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: '#cbd5e1' }} />
                    <Area type="monotone" dataKey="orders" name="Orders" stroke="#2a78d6" strokeWidth={2} fill="url(#invOrders)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="delivered" name="Delivered" stroke="#1baf7a" strokeWidth={2} fill="url(#invDelivered)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartFrame>
        </div>
      </div>

      {/* Sales */}
      <FilterRow>{range}</FilterRow>
      <BreakdownReport
        report={byCategory}
        months={months}
        title="Category Sales"
        subtitle="Billed pieces per category by month, less returns in the month they came back. Click a line for its salesmen and customers."
        noun="category"
        storageKey="investor.overview.categories"
        onOpen={openWith('/investor/categories/view', 'category')}
        table={false}
        rangeControl={range}
      />
      <StockRatioReport
        sales={byCategory}
        months={months}
        storageKey="investor.overview.stockRatio"
        onOpen={openWith('/investor/categories/view', 'category')}
        rangeControl={range}
      />
      <InventoryReport
        sales={byCategory}
        months={months}
        onOpen={openWith('/investor/categories/view', 'category')}
        rangeControl={range}
      />
      <BreakdownReport
        report={bySalesman}
        months={months}
        title="Salesman Sales"
        subtitle="Billed pieces for each salesman's assigned customers, all categories. Click a line for their categories."
        noun="salesman"
        storageKey="investor.overview.salesmen"
        onOpen={openWith('/investor/salesmen/view', 'salesman')}
        table={false}
        rangeControl={range}
      />

      {/* Stock at its check level */}
      <div className="srf-card">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
          <div>
          <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-slate-900">
            <AlertTriangle className={`h-4 w-4 ${alerts.itemsBelow ? 'text-amber-500' : 'text-slate-300'}`} />
            Check Level Alerts
          </h3>
          <p className="text-[11px] text-slate-400">
            {num(alerts.itemsBelow)} item{alerts.itemsBelow === 1 ? '' : 's'} and {num(alerts.categoriesBelow)}{' '}
            categor{alerts.categoriesBelow === 1 ? 'y' : 'ies'} at or below their safety stock
          </p>
          </div>
          <PdfButton
            onExport={() =>
              downloadReportPdf({
                title: 'Check Level Alerts',
                subtitle: 'Stock at or below its safety level (check level)',
                details: [`${num(alerts.itemsBelow)} items and ${num(alerts.categoriesBelow)} categories at or below their check level`],
                orientation: 'portrait',
                tables: [
                  {
                    title: 'Items',
                    head: [['Item', 'Category', 'Stock', 'Check level']],
                    body: (alerts.items || []).map((it) => [it.name, it.category || 'Uncategorised', num(it.quantity), num(it.effectiveCheckLevel)])
                  },
                  {
                    title: 'Categories',
                    head: [['Category', 'Stock', 'Check level']],
                    body: (alerts.categories || []).map((c) => [c.category || 'Uncategorised', num(c.stockQty), num(c.checkLevel)])
                  }
                ]
              })
            }
          />
        </div>
        {!(alerts.items?.length || alerts.categories?.length) ? (
          <p className="px-5 py-8 text-center text-[13px] text-slate-400">Everything is above its check level.</p>
        ) : (
          <div className="mt-2 grid gap-px bg-slate-100 sm:grid-cols-2">
            {[
              { label: 'Items', icon: Package, rows: (alerts.items || []).map((it) => ({ key: it._id, name: it.name, sub: it.category || 'Uncategorised', value: `${num(it.quantity)} / ${num(it.effectiveCheckLevel)}` })) },
              { label: 'Categories', icon: Layers, rows: (alerts.categories || []).map((c) => ({ key: c.category, name: c.category || 'Uncategorised', value: `${num(c.stockQty)} / ${num(c.checkLevel)}` })) }
            ].map((col) => {
              const Icon = col.icon;
              return (
                <div key={col.label} className="bg-white">
                  <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:px-5">{col.label}</p>
                  {col.rows.length === 0 ? (
                    <p className="px-4 pb-4 text-[13px] text-slate-400 sm:px-5">None</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {col.rows.map((r) => (
                        <div key={r.key} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-slate-800">{r.name}</p>
                            {r.sub && <p className="text-[11px] text-slate-400">{r.sub}</p>}
                          </div>
                          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-amber-700" title="Stock / check level">
                            {r.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default InvestorOverview;
