import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import RakAllocationModal from '../../components/RakAllocationModal';
import AlertModal from '../../components/AlertModal';
import ConfirmModal from '../../components/ConfirmModal';
import SortSelect from '../../components/SortSelect';
import {
  Search, CheckCircle2, CircleCheck, ClipboardCheck, X, SlidersHorizontal,
  Phone, MapPin, Calendar, FileText, ArrowLeft, Truck, Undo2, PanelRightClose
} from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name_asc', label: 'Customer A–Z' },
  { value: 'name_desc', label: 'Customer Z–A' },
  { value: 'qty_desc', label: 'Quantity: high to low' },
  { value: 'qty_asc', label: 'Quantity: low to high' }
];

// How many orders a list shows before "Load more" — the API caps a page at 100
const PAGE_STEP = 30;
const MAX_LIMIT = 100;

const initials = (name = '') =>
  name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// Item names read "10205 SSR - 10": the code, then the size/description
const splitItemName = (name = '') => {
  const i = name.indexOf(' - ');
  return i === -1 ? [name, ''] : [name.slice(0, i), name.slice(i + 3)];
};

const itemsLine = (order) => (order.items || []).map((oi) => oi.item?.name || 'Deleted item').join(', ');

const timeOf = (d) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();

// Chat-list style stamp: time today, "Yesterday", then the date
const chatStamp = (value) => {
  const d = new Date(value);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (days === 0) return timeOf(d);
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const fullStamp = (value) => {
  const d = new Date(value);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${timeOf(d)}`;
};

// The roller's order list ("to roll", "rolled" or "all" for both) with its
// own search, sort and filters
const useRollerList = (status) => {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(PAGE_STEP);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [customerFilter, setCustomerFilter] = useState('');
  const [cargoFilter, setCargoFilter] = useState('');
  const [filterOptions, setFilterOptions] = useState({ customers: [], cargos: [] });

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/orders/roller/list', {
        params: { status, search: searchTerm, sort: sortBy, customer: customerFilter, cargo: cargoFilter, page: 1, limit }
      });
      if (response.data.success) {
        setOrders(response.data.data);
        setTotal(response.data.pagination.total);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [status, searchTerm, sortBy, customerFilter, cargoFilter, limit]);

  // Dropdown values come from the orders in this list, so the roller is never
  // offered a customer or cargo that matches nothing
  const fetchFilterOptions = useCallback(async () => {
    try {
      const response = await api.get('/orders/roller/filters', { params: { status } });
      if (response.data.success) setFilterOptions(response.data.data);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  }, [status]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { fetchFilterOptions(); }, [fetchFilterOptions]);
  useEffect(() => { setLimit(PAGE_STEP); }, [searchTerm, sortBy, customerFilter, cargoFilter]);

  const refresh = useCallback(() => {
    fetchOrders();
    fetchFilterOptions();
  }, [fetchOrders, fetchFilterOptions]);

  return {
    orders, setOrders, total, loading, refresh,
    canLoadMore: orders.length < total && limit < MAX_LIMIT,
    loadMore: () => setLimit((l) => Math.min(l + PAGE_STEP, MAX_LIMIT)),
    searchTerm, setSearchTerm, sortBy, setSortBy,
    customerFilter, setCustomerFilter, cargoFilter, setCargoFilter, filterOptions,
    activeFilterCount: (customerFilter ? 1 : 0) + (cargoFilter ? 1 : 0)
  };
};

// Column title with its count, and the search / filter toggles
const ListHeader = ({ title, pillClass, list }) => {
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const iconBtn = (active) =>
    `flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
      active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
    }`;

  return (
    <div className="shrink-0 px-4 pb-3 pt-4">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-[17px] font-bold text-slate-900">{title}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${pillClass}`}>
          {list.total} order{list.total === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={() => setShowSearch((v) => !v)} className={iconBtn(showSearch || list.searchTerm)} aria-label="Search">
            <Search className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setShowFilters((v) => !v)} className={`relative ${iconBtn(showFilters || list.activeFilterCount)}`} aria-label="Filters">
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showSearch && (
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            type="text"
            placeholder="Search by customer or order ID…"
            value={list.searchTerm}
            onChange={(e) => list.setSearchTerm(e.target.value)}
            className="w-full !pl-9"
          />
          {list.searchTerm && (
            <button
              onClick={() => list.setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {showFilters && (
        <div className="mt-3 grid grid-cols-1 gap-2">
          <SortSelect value={list.sortBy} onChange={list.setSortBy} options={SORT_OPTIONS} />
          <select value={list.customerFilter} onChange={(e) => list.setCustomerFilter(e.target.value)} aria-label="Customer">
            <option value="">All customers</option>
            {list.filterOptions.customers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <select value={list.cargoFilter} onChange={(e) => list.setCargoFilter(e.target.value)} aria-label="Cargo">
            <option value="">All cargos</option>
            {list.filterOptions.cargos.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          {list.activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => { list.setCustomerFilter(''); list.setCargoFilter(''); }}
              className="srf-chip self-start text-slate-400"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const ListBody = ({ list, emptyIcon, emptyTitle, emptyText, children }) => {
  const EmptyIcon = emptyIcon;
  if (list.loading && list.orders.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-500" />
      </div>
    );
  }
  if (list.orders.length === 0) {
    const hasQuery = Boolean(list.searchTerm || list.activeFilterCount);
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-emerald-500 ring-1 ring-slate-200">
          <EmptyIcon className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-semibold text-slate-700">{emptyTitle}</p>
        <p className="mt-1 text-xs text-slate-400">{hasQuery ? 'No orders match your search or filters.' : emptyText}</p>
      </div>
    );
  }
  return (
    <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
      {children}
      {list.canLoadMore && (
        <div className="p-3">
          <button type="button" onClick={list.loadMore} className="srf-btn srf-btn-secondary w-full">Load more</button>
        </div>
      )}
    </div>
  );
};

// Row colours say where the order stands — blue "to roll", green "rolled".
// Within each, a not-seen order is tinted, bold and carries a dot.
const STATUS_STYLE = {
  'to roll': {
    label: 'To roll',
    unseenRow: 'bg-blue-50/70 hover:bg-blue-50',
    avatarUnseen: 'bg-blue-100 text-blue-700',
    avatarSeen: 'bg-blue-50 text-blue-400',
    accent: 'text-blue-600',
    dot: 'bg-blue-600',
    chip: 'bg-blue-100 text-blue-700',
    bar: 'bg-blue-600'
  },
  rolled: {
    label: 'Rolled',
    unseenRow: 'bg-emerald-50/80 hover:bg-emerald-50',
    avatarUnseen: 'bg-emerald-100 text-emerald-700',
    avatarSeen: 'bg-emerald-50 text-emerald-500',
    accent: 'text-emerald-600',
    dot: 'bg-emerald-600',
    chip: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-600'
  }
};

// One order as a chat row
const OrderRow = ({ order, selected, onSelect }) => {
  const style = STATUS_STYLE[order.status] || STATUS_STYLE['to roll'];
  const unseen = !order.rollerSeenAt;
  const name = order.customerName?.name || '—';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors ${
        selected ? 'bg-slate-100' : unseen ? style.unseenRow : 'bg-white hover:bg-slate-50'
      }`}
    >
      {selected && <span className={`absolute inset-y-0 left-0 w-1 rounded-r ${style.bar}`} />}
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          unseen ? style.avatarUnseen : style.avatarSeen
        }`}
      >
        {initials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[14px] ${unseen ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>{name}</span>
          <span className={`shrink-0 text-[11px] ${unseen ? `font-semibold ${style.accent}` : 'text-slate-400'}`}>
            {chatStamp(order.createdAt)}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[12.5px] ${unseen ? 'text-slate-600' : 'text-slate-400'}`}>
            <span className={unseen ? 'font-semibold text-slate-900' : ''}>{order.items?.length || 0} items</span>
            {' • '}{itemsLine(order)}
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.chip}`}>{style.label}</span>
          {unseen && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />}
        </span>
      </span>
    </button>
  );
};

const EmptyPane = ({ icon, title, text, iconClass }) => {
  const Icon = icon;
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-white ring-1 ring-slate-200/70 ${iconClass}`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-xs text-slate-400">{text}</p>
    </div>
  );
};

// One order in full — customer, notes and items — with the pane's buttons
// underneath. Used by both the details pane and the rolled pane.
const OrderDetails = ({ order, title, cardRing, onBack, actions }) => {
  const isQueue = order.status === 'to roll';
  const customer = order.customerName || {};

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 px-5 pb-3 pt-4">
        <button type="button" onClick={onBack} className="-ml-2 rounded-lg p-2 text-slate-500 hover:bg-white lg:hidden" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="font-display text-[17px] font-bold text-slate-900">{title}</h2>
        <span
          className={`ml-auto rounded-full px-3 py-1 text-[11px] font-semibold ${
            isQueue ? 'bg-amber-200/70 text-amber-800' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {isQueue ? 'To Roll' : 'Rolled'}
        </span>
      </div>

      <div className="scrollbar-none min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-3">
        {/* Customer */}
        <div className={`flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 ring-1 ${cardRing}`}>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-700">
            {initials(customer.name)}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-[16px] font-bold text-slate-900">{customer.name || '—'}</p>
            {customer.phone && (
              <p className="flex items-center gap-2 text-[13px] text-slate-600">
                <Phone className="h-3.5 w-3.5 text-slate-400" />{customer.phone}
              </p>
            )}
            {customer.locationLink && (
              <a href={customer.locationLink} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] text-slate-600 hover:text-blue-600">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />Open location
              </a>
            )}
          </div>
          <div className="space-y-1.5 border-l border-slate-200 pl-4 text-[13px] text-slate-600">
            <p className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-slate-400" />{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            <p className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-slate-400" />{order.items?.length || 0} Items</p>
            {order.cargo?.name && (
              <p className="flex items-center gap-2"><Truck className="h-3.5 w-3.5 text-slate-400" />{order.cargo.name}</p>
            )}
          </div>
        </div>

        {order.notes && (
          <p className={`rounded-xl bg-white px-4 py-2.5 text-[12.5px] text-amber-700 ring-1 ${cardRing}`}>
            <span className="font-semibold">Note:</span> {order.notes}
          </p>
        )}

        {/* Items */}
        <div className={`rounded-xl bg-white p-4 ring-1 ${cardRing}`}>
          <p className="mb-3 text-[14px] font-semibold text-slate-900">Order Items</p>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-slate-500">
                <th className="rounded-l-lg bg-slate-50 px-3 py-2 font-medium">#</th>
                <th className="bg-slate-50 px-3 py-2 font-medium">Item Code</th>
                <th className="bg-slate-50 px-3 py-2 font-medium">Description</th>
                <th className="rounded-r-lg bg-slate-50 px-3 py-2 text-right font-medium">Qty</th>
              </tr>
            </thead>
            <tbody>
              {(order.items || []).map((oi, idx) => {
                const [code, desc] = splitItemName(oi.item?.name || 'Deleted item');
                return (
                  <tr key={oi._id || idx} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-[11px] text-slate-500">{idx + 1}</span>
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{code}</td>
                    <td className="px-3 py-2 text-slate-600">{desc || '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{oi.quantity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!isQueue && (
          <p className="flex items-center gap-1.5 px-1 text-[12px] text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Rolled on <span className="font-semibold text-slate-700">{fullStamp(order.updatedAt)}</span>
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-3 px-5 pb-5 pt-2">{actions}</div>
    </>
  );
};

// Dismiss only closes the pane — the order itself is left exactly as it is
const DismissButton = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 text-[14px] font-semibold text-rose-600 transition-colors hover:bg-rose-100"
  >
    <PanelRightClose className="h-4 w-4" />
    Dismiss
  </button>
);

// Three panes side by side on wide screens: every roller order as a chat list,
// the order picked from it, and the order just rolled (with an undo). The two
// right panes start empty and Dismiss just empties them again. On a phone the
// list shows until a pane has an order, which then shows over it.
const RollerOrders = () => {
  const list = useRollerList('all');

  // The panes keep the order they were given, but read it from the list while
  // it is there so a live update (seen, rolled elsewhere) shows through
  const [detailOrder, setDetailOrder] = useState(null);
  const [rolledOrder, setRolledOrder] = useState(null);
  const fresh = (order) => (order && list.orders.find((o) => o._id === order._id)) || order;
  const detail = fresh(detailOrder);
  const rolled = fresh(rolledOrder);

  const [showRollModal, setShowRollModal] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });

  // Keep the list live — new orders, and anyone else rolling or opening one
  const { refresh } = list;
  useEffect(() => {
    const socket = getSocket();
    socket.on('orders_updated', refresh);
    return () => socket.off('orders_updated', refresh);
  }, [refresh]);

  const showAlert = (title, message, type = 'error') => {
    setAlertConfig({ title, message, type });
    setShowAlertModal(true);
  };

  const openOrder = (order) => {
    setDetailOrder(order);
    if (!order.rollerSeenAt) {
      list.setOrders((orders) => orders.map((o) => (o._id === order._id ? { ...o, rollerSeenAt: new Date().toISOString() } : o)));
      api.put(`/orders/roller/${order._id}/seen`).catch((error) => console.error('Error marking order seen:', error));
    }
  };

  // rakAllocation is the roller's pick of which raks the stock came off.
  // Marking rolled is the moment the goods have physically left the shelf, so
  // this is where the raks get relieved. The rolled order moves across to the
  // third pane, where it can still be taken back.
  const handleMarkRolled = async (rakAllocation) => {
    if (!detail) return;
    try {
      setSubmitting(true);
      const response = await api.put(`/orders/${detail._id}/status`, { status: 'rolled', rakAllocation });
      if (response.data.success) {
        setShowRollModal(false);
        setRolledOrder({ ...detail, ...response.data.data, customerName: detail.customerName });
        setDetailOrder(null);
        refresh();
      }
    } catch (error) {
      setShowRollModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Undo a roll: the order goes back to "to roll" and its stock back onto the
  // raks it came off
  const handleRevert = async () => {
    if (!rolled) return;
    try {
      setSubmitting(true);
      const response = await api.put(`/orders/${rolled._id}/revert-status`);
      if (response.data.success) {
        setShowRevertModal(false);
        setRolledOrder(null);
        refresh();
        showAlert('Order reverted', 'The order is back in "to roll".', 'success');
      }
    } catch (error) {
      setShowRevertModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const pane = 'flex min-h-0 flex-col overflow-hidden rounded-2xl ring-1';
  // Phone: the most recent step wins the screen
  const mobilePane = rolled ? 'rolled' : detail ? 'detail' : 'list';
  const paneVisibility = (name) => (mobilePane === name ? 'min-h-[75dvh] lg:min-h-0' : 'hidden');

  return (
    <>
      <div className="grid gap-3.5 lg:h-[calc(100dvh-11.75rem)] lg:grid-cols-[minmax(300px,1fr)_minmax(420px,1.45fr)_minmax(380px,1.2fr)]">
        {/* 1 — Every order */}
        <section className={`${pane} bg-white ring-slate-200/80 ${paneVisibility('list')} lg:flex`}>
          <ListHeader title="Orders" pillClass="bg-slate-100 text-slate-700" list={list} />
          <ListBody list={list} emptyIcon={ClipboardCheck} emptyTitle="No orders" emptyText="New orders will show up here automatically.">
            {list.orders.map((order) => (
              <OrderRow key={order._id} order={order} selected={order._id === detail?._id} onSelect={() => openOrder(order)} />
            ))}
          </ListBody>
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" />To roll</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />Rolled</span>
            <span className="ml-auto"><span className="font-bold text-slate-600">Bold</span> = not seen</span>
          </div>
        </section>

        {/* 2 — The picked order */}
        <section className={`${pane} bg-[#fff8ee] ring-amber-100 ${paneVisibility('detail')} lg:flex`}>
          {detail ? (
            <OrderDetails
              order={detail}
              title="Order Details"
              cardRing="ring-amber-100"
              onBack={() => setDetailOrder(null)}
              actions={
                <>
                  <DismissButton onClick={() => setDetailOrder(null)} />
                  {detail.status === 'to roll' && (
                    <button
                      type="button"
                      onClick={() => setShowRollModal(true)}
                      className="flex h-12 flex-[1.45] items-center justify-center gap-2 rounded-xl bg-emerald-700 text-[14px] font-semibold text-white shadow-lg shadow-emerald-700/25 transition-colors hover:bg-emerald-600"
                    >
                      <CircleCheck className="h-5 w-5" />
                      Change to Rolled
                    </button>
                  )}
                </>
              }
            />
          ) : (
            <EmptyPane icon={ClipboardCheck} iconClass="text-amber-500" title="No order selected" text="Pick an order from the list to see its details." />
          )}
        </section>

        {/* 3 — The order just rolled */}
        <section className={`${pane} bg-emerald-50/70 ring-emerald-100 ${paneVisibility('rolled')} lg:flex`}>
          {rolled ? (
            <OrderDetails
              order={rolled}
              title="Rolled Order"
              cardRing="ring-emerald-100"
              onBack={() => setRolledOrder(null)}
              actions={
                <>
                  <DismissButton onClick={() => setRolledOrder(null)} />
                  {rolled.status === 'rolled' && (
                    <button
                      type="button"
                      onClick={() => setShowRevertModal(true)}
                      className="flex h-12 flex-[1.45] items-center justify-center gap-2 rounded-xl bg-slate-900 text-[14px] font-semibold text-white shadow-lg shadow-slate-900/20 transition-colors hover:bg-slate-700"
                    >
                      <Undo2 className="h-5 w-5" />
                      Revert Order
                    </button>
                  )}
                </>
              }
            />
          ) : (
            <EmptyPane icon={CheckCircle2} iconClass="text-emerald-500" title="Nothing rolled yet" text="An order you change to rolled shows up here." />
          )}
        </section>
      </div>

      <RakAllocationModal
        isOpen={showRollModal}
        onClose={() => setShowRollModal(false)}
        order={detail}
        onConfirm={handleMarkRolled}
        submitting={submitting}
        showAlert={showAlert}
      />

      <ConfirmModal
        isOpen={showRevertModal}
        onClose={() => setShowRevertModal(false)}
        onConfirm={handleRevert}
        title="Revert this order?"
        message='It goes back to "to roll" and its stock is put back on the raks it came off.'
        type="warning"
        confirmLabel="Revert"
      />

      <AlertModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
      />
    </>
  );
};

export default RollerOrders;
