import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';
import { STATUS_COLORS, STATUS_LABELS } from '../../utils/orderStatus';
import { ShoppingCart, ArrowUpRight, ArrowRight, Send, Receipt, CheckCircle2, ShieldCheck } from 'lucide-react';

const ordersLink = (status) =>
  `/accounts/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`;

// Left-to-right life of a sell order, as the accounts desk sees it
const PIPELINE = [
  { status: 'pending', countKey: 'pending' },
  { status: 'to roll', countKey: 'toRoll' },
  { status: 'rolled', countKey: 'rolled' },
  { status: 'billed', countKey: 'billed' },
  { status: 'delivered', countKey: 'delivered' }
];

// Statuses outside that flow
const OTHER = [
  { status: 'completed', countKey: 'completed', hint: 'Purchase orders received' },
  { status: 'cancellation_requested', countKey: 'cancellationRequested', hint: 'Waiting for a decision' },
  { status: 'cancelled', countKey: 'cancelled', hint: 'Approved cancellations' }
];

const AccountsDashboard = () => {
  const [counts, setCounts] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, ordersRes] = await Promise.all([
        api.get('/orders/stats'),
        api.get('/orders', { params: { limit: 8 } })
      ]);
      if (statsRes.data.success) setCounts(statsRes.data.data.orders);
      if (ordersRes.data.success) setRecentOrders(ordersRes.data.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Rollers and salesmen move orders all day — keep the numbers live
  useEffect(() => {
    const socket = getSocket();
    socket.on('orders_updated', fetchData);
    return () => socket.off('orders_updated', fetchData);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
      </div>
    );
  }

  const c = counts || {};
  const total = c.total || 0;

  const queue = [
    {
      title: 'Send to roll',
      count: c.pending || 0,
      text: 'Pending orders waiting to join the rolling queue.',
      status: 'pending',
      icon: Send,
      tint: 'bg-amber-50 text-amber-600 ring-amber-100',
      cta: 'Review pending'
    },
    {
      title: 'Mark billed',
      count: c.rolled || 0,
      text: 'Rolled orders waiting for their bill.',
      status: 'rolled',
      icon: Receipt,
      tint: 'bg-violet-50 text-violet-600 ring-violet-100',
      cta: 'Review rolled'
    },
    {
      title: 'Approve cancellations',
      count: c.cancellationRequested || 0,
      text: 'Cancellation requests waiting for your approval.',
      status: 'cancellation_requested',
      icon: CheckCircle2,
      tint: 'bg-rose-50 text-rose-600 ring-rose-100',
      cta: 'Review requests'
    }
  ];

  const segments = [...PIPELINE, ...OTHER]
    .map((s) => ({ ...s, value: c[s.countKey] || 0 }))
    .filter((s) => s.value > 0);

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="srf-page">
      <PageHeader title="Dashboard" subtitle={today}>
        <Link to="/accounts/orders" className="srf-btn srf-btn-secondary">
          All orders
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </PageHeader>

      {/* What needs the accounts desk right now */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Needs your action</p>
        <div className="grid gap-2.5 sm:gap-3 md:grid-cols-3">
          {queue.map((q) => {
            const Icon = q.icon;
            const empty = q.count === 0;
            return (
              <Link
                key={q.status}
                to={ordersLink(q.status)}
                className={`srf-card srf-card-hover group flex flex-col p-4 ${empty ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-4 ${q.tint}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <p className="font-display text-3xl font-bold leading-none tabular-nums text-slate-900">{q.count}</p>
                </div>
                <p className="mt-3 font-display text-sm font-bold text-slate-900">{q.title}</p>
                <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{q.text}</p>
                <span className="mt-3 flex items-center gap-1 text-[12px] font-semibold text-indigo-600 group-hover:text-indigo-500">
                  {empty ? 'Nothing waiting' : q.cta}
                  {!empty && <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Orders by status */}
      <div className="srf-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900">Orders by status</h3>
            <p className="text-[11px] text-slate-400">Tap a status to open that list</p>
          </div>
          <p className="text-[12px] text-slate-500">
            <span className="font-display text-lg font-bold text-slate-900">{total}</span> orders in total
          </p>
        </div>

        {/* Share of every order, by status */}
        <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          {segments.map((s) => (
            <div
              key={s.status}
              className="h-full"
              style={{ width: `${(s.value / total) * 100}%`, backgroundColor: STATUS_COLORS[s.status] }}
              title={`${STATUS_LABELS[s.status]}: ${s.value}`}
            />
          ))}
        </div>

        {/* Sell-order flow */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-2.5">
          {PIPELINE.map((s, idx) => (
            <Link
              key={s.status}
              to={ordersLink(s.status)}
              className="group relative rounded-xl border border-slate-200/80 bg-white p-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <span
                className="absolute inset-x-3 top-0 h-[3px] rounded-b-full"
                style={{ backgroundColor: STATUS_COLORS[s.status] }}
              />
              <p className="mt-1 font-display text-xl font-bold leading-none tabular-nums text-slate-900">
                {c[s.countKey] || 0}
              </p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">{STATUS_LABELS[s.status]}</p>
              {idx < PIPELINE.length - 1 && (
                <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-3.5 w-3.5 -translate-y-1/2 text-slate-300 sm:block" />
              )}
            </Link>
          ))}
        </div>

        {/* Everything outside the flow */}
        <div className="mt-2.5 grid grid-cols-3 gap-2 sm:gap-2.5">
          {OTHER.map((s) => (
            <Link
              key={s.status}
              to={ordersLink(s.status)}
              className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 transition-colors hover:bg-slate-50"
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-slate-800">{STATUS_LABELS[s.status]}</p>
                <p className="hidden truncate text-[10.5px] text-slate-400 sm:block">{s.hint}</p>
              </div>
              <span className="font-display text-sm font-bold tabular-nums text-slate-900">{c[s.countKey] || 0}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent orders + what this desk can do */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="srf-card lg:col-span-2">
          <div className="flex items-center justify-between px-4 pt-4 sm:px-5">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">Recent Orders</h3>
              <p className="text-[11px] text-slate-400">Latest activity across the team</p>
            </div>
            <Link to="/accounts/orders" className="text-xs font-semibold text-indigo-600 hover:text-indigo-500">
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
                  to={ordersLink(order.status)}
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

        <div className="srf-card p-4 sm:p-5">
          <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-slate-400" />
            What you can do here
          </h3>
          <ul className="mt-3 space-y-2.5 text-[12.5px] leading-snug text-slate-600">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS['to roll'] }} />
              Move a <span className="font-semibold text-slate-800">pending</span> sell order to <span className="font-semibold text-slate-800">to roll</span>.
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS.billed }} />
              Mark a <span className="font-semibold text-slate-800">rolled</span> order as <span className="font-semibold text-slate-800">billed</span>.
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS.cancelled }} />
              Approve a customer's <span className="font-semibold text-slate-800">cancellation request</span>.
            </li>
          </ul>
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-snug text-slate-400">
            Creating, editing, deleting or reverting orders is handled by the admin.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AccountsDashboard;
