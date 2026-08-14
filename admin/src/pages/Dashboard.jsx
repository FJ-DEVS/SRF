import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { STATUS_COLORS } from '../utils/orderStatus';
import {
  ShoppingCart,
  Clock,
  CheckCircle2,
  Package,
  Users,
  UserCircle,
  TrendingUp,
  Receipt,
  ArrowUpRight,
  AlertTriangle,
  Layers
} from 'lucide-react';
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

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, ordersRes] = await Promise.all([
          api.get('/orders/stats'),
          api.get('/orders', { params: { limit: 5 } })
        ]);
        if (statsRes.data.success) setStats(statsRes.data.data);
        if (ordersRes.data.success) setRecentOrders(ordersRes.data.data);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
      </div>
    );
  }

  const kpis = [
    { title: 'Total Orders', value: stats?.orders?.total || 0, icon: ShoppingCart, tint: 'bg-slate-100 text-slate-600', link: '/orders' },
    { title: 'Pending', value: stats?.orders?.pending || 0, icon: Clock, tint: 'bg-amber-50 text-amber-600', link: '/orders?status=pending' },
    { title: 'To Roll', value: stats?.orders?.toRoll || 0, icon: Package, tint: 'bg-sky-50 text-sky-600', link: '/orders?status=to roll' },
    { title: 'Rolled', value: stats?.orders?.rolled || 0, icon: TrendingUp, tint: 'bg-violet-50 text-violet-600', link: '/orders?status=rolled' },
    { title: 'Billed', value: stats?.orders?.billed || 0, icon: Receipt, tint: 'bg-orange-50 text-orange-600', link: '/orders?status=billed' },
    { title: 'Delivered', value: stats?.orders?.delivered || 0, icon: CheckCircle2, tint: 'bg-emerald-50 text-emerald-600', link: '/orders?status=delivered' }
  ];

  const statusData = [
    { name: 'Pending', key: 'pending', value: stats?.orders?.pending || 0 },
    { name: 'To Roll', key: 'to roll', value: stats?.orders?.toRoll || 0 },
    { name: 'Rolled', key: 'rolled', value: stats?.orders?.rolled || 0 },
    { name: 'Billed', key: 'billed', value: stats?.orders?.billed || 0 },
    { name: 'Delivered', key: 'delivered', value: stats?.orders?.delivered || 0 }
  ];
  const statusTotal = statusData.reduce((acc, s) => acc + s.value, 0);
  const activeStatusData = statusData.filter((s) => s.value > 0);

  const trendData = stats?.trends || [];
  const stockAlerts = stats?.stockAlerts || {};
  const lowItems = stockAlerts.items || [];
  const lowCategories = stockAlerts.categories || [];

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const chartTooltipStyle = {
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    boxShadow: '0 8px 24px -6px rgb(15 23 42 / 0.12)',
    fontSize: '12px',
    padding: '8px 12px'
  };

  return (
    <div className="srf-page">
      <PageHeader title="Dashboard" subtitle={today}>
        <Link to="/orders" className="srf-btn srf-btn-secondary">
          View orders
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </PageHeader>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link key={kpi.title} to={kpi.link} className="srf-card srf-card-hover group p-3.5">
              <div className="flex items-center justify-between">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${kpi.tint}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="mt-2.5 font-display text-xl font-bold leading-none text-slate-900">{kpi.value}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">{kpi.title}</p>
            </Link>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-5">
        {/* Status distribution */}
        <div className="srf-card p-4 sm:p-5 lg:col-span-2">
          <h3 className="font-display text-sm font-bold text-slate-900">Order Status</h3>
          <p className="text-[11px] text-slate-400">Active pipeline breakdown</p>

          <div className="mt-2 flex items-center gap-4">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={activeStatusData.length ? activeStatusData : [{ name: 'None', key: 'cancelled', value: 1 }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={80}
                    paddingAngle={activeStatusData.length > 1 ? 2 : 0}
                    dataKey="value"
                    stroke="#ffffff"
                    strokeWidth={2}
                  >
                    {(activeStatusData.length ? activeStatusData : [{ key: 'cancelled' }]).map((entry) => (
                      <Cell key={entry.key} fill={activeStatusData.length ? STATUS_COLORS[entry.key] : '#e2e8f0'} />
                    ))}
                  </Pie>
                  {activeStatusData.length > 0 && <Tooltip contentStyle={chartTooltipStyle} />}
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="font-display text-2xl font-bold leading-none text-slate-900">{statusTotal}</p>
                <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">Orders</p>
              </div>
            </div>

            {/* Legend with counts */}
            <div className="min-w-0 flex-1 space-y-2">
              {statusData.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.key] }} />
                  <span className="flex-1 truncate text-xs text-slate-500">{s.name}</span>
                  <span className="text-xs font-semibold text-slate-800">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trends */}
        <div className="srf-card p-4 sm:p-5 lg:col-span-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">Order Trends</h3>
              <p className="text-[11px] text-slate-400">Last 6 months</p>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#4f46e5' }} /> Orders
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#059669' }} /> Delivered
              </span>
            </div>
          </div>

          <div className="mt-3 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="gradDelivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" tickLine={false} axisLine={false} style={{ fontSize: '11px' }} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} allowDecimals={false} style={{ fontSize: '11px' }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Area type="monotone" dataKey="orders" name="Orders" stroke="#4f46e5" strokeWidth={2} fill="url(#gradOrders)" />
                <Area type="monotone" dataKey="delivered" name="Delivered" stroke="#059669" strokeWidth={2} fill="url(#gradDelivered)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Check level — stock at or below its safety line */}
      <div className="srf-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
          <div>
            <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-slate-900">
              <AlertTriangle className={`h-4 w-4 ${stockAlerts.itemsBelow ? 'text-amber-500' : 'text-slate-300'}`} />
              Check Level Alerts
            </h3>
            <p className="text-[11px] text-slate-400">
              {stockAlerts.itemsBelow || 0} item{stockAlerts.itemsBelow === 1 ? '' : 's'} and{' '}
              {stockAlerts.categoriesBelow || 0} categor{stockAlerts.categoriesBelow === 1 ? 'y' : 'ies'} at or below check level
            </p>
          </div>
          <Link
            to="/items?stockState=below"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-500"
          >
            View items
          </Link>
        </div>

        {lowItems.length === 0 && lowCategories.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-slate-400">
            Everything is above its check level.
          </p>
        ) : (
          <div className="mt-2 grid gap-px bg-slate-100 sm:grid-cols-2">
            {/* Items */}
            <div className="bg-white">
              <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:px-5">
                Items
              </p>
              {lowItems.length === 0 ? (
                <p className="px-4 pb-4 text-[13px] text-slate-400 sm:px-5">None</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {lowItems.map((item) => (
                    <div key={item._id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                        <Package className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-slate-800">{item.name}</p>
                        <p className="text-[11px] text-slate-400">{item.category || 'Uncategorised'}</p>
                      </div>
                      <span className="shrink-0 text-[12px] font-semibold tabular-nums text-amber-700">
                        {item.quantity} / {item.effectiveCheckLevel}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Categories */}
            <div className="bg-white">
              <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:px-5">
                Categories
              </p>
              {lowCategories.length === 0 ? (
                <p className="px-4 pb-4 text-[13px] text-slate-400 sm:px-5">None</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {lowCategories.map((cat) => (
                    <div key={cat.category} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                        <Layers className="h-3.5 w-3.5" />
                      </span>
                      <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">
                        {cat.category || 'Uncategorised'}
                      </p>
                      <span className="shrink-0 text-[12px] font-semibold tabular-nums text-amber-700">
                        {cat.stockQty} / {cat.checkLevel}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Recent orders + team */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="srf-card lg:col-span-2">
          <div className="flex items-center justify-between px-4 pt-4 sm:px-5">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">Recent Orders</h3>
              <p className="text-[11px] text-slate-400">Latest activity across all salesmen</p>
            </div>
            <Link to="/orders" className="text-xs font-semibold text-indigo-600 hover:text-indigo-500">
              View all
            </Link>
          </div>

          <div className="mt-2 divide-y divide-slate-100">
            {recentOrders.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-slate-400">No orders yet</p>
            ) : (
              recentOrders.map((order) => (
                <Link
                  key={order._id}
                  to="/orders"
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/70 sm:px-5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <ShoppingCart className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-800">
                      {order.customerName?.name || 'Unknown party'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {' · '}
                      {order.items?.length || 0} item{(order.items?.length || 0) === 1 ? '' : 's'}
                      {' · '}
                      <span className="capitalize">{order.type}</span>
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Team snapshot */}
        <div className="space-y-3 sm:space-y-4">
          <Link to="/salesmen" className="srf-card srf-card-hover flex items-center gap-3.5 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Users className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="font-display text-lg font-bold leading-none text-slate-900">{stats?.salesmen || 0}</p>
              <p className="mt-1 text-xs text-slate-500">Salesmen on the field</p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-slate-300" />
          </Link>

          <Link to="/customers" className="srf-card srf-card-hover flex items-center gap-3.5 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <UserCircle className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="font-display text-lg font-bold leading-none text-slate-900">{stats?.customers || 0}</p>
              <p className="mt-1 text-xs text-slate-500">Active customers</p>
            </div>
            <ArrowUpRight className="h-4 w-4 text-slate-300" />
          </Link>

          <div className="srf-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quick actions</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link to="/orders" className="srf-btn srf-btn-secondary w-full !justify-start">
                <ShoppingCart className="h-3.5 w-3.5 text-slate-400" /> New order
              </Link>
              <Link to="/items" className="srf-btn srf-btn-secondary w-full !justify-start">
                <Package className="h-3.5 w-3.5 text-slate-400" /> Items
              </Link>
              <Link to="/customers" className="srf-btn srf-btn-secondary w-full !justify-start">
                <UserCircle className="h-3.5 w-3.5 text-slate-400" /> Customers
              </Link>
              <Link to="/cargo" className="srf-btn srf-btn-secondary w-full !justify-start">
                <Package className="h-3.5 w-3.5 text-slate-400" /> Cargo
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
