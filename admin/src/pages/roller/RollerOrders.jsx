import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import RakAllocationModal from '../../components/RakAllocationModal';
import AlertModal from '../../components/AlertModal';
import ConfirmModal from '../../components/ConfirmModal';
import {
  Search, CircleCheck, ClipboardCheck, X, ArrowLeft, Truck, Undo2, UserCheck, MessageSquare, Package, Receipt
} from 'lucide-react';

// How many customers the chat list shows before "Load more", and how many
// orders a chat pulls in per page as the roller scrolls up
const CUSTOMER_STEP = 30;
const ORDER_STEP = 20;
// The API caps a page at 100 — the most a live refresh can re-read at once
const MAX_LIMIT = 100;

const initials = (name = '') =>
  name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

const totalQty = (order) => (order.items || []).reduce((sum, oi) => sum + (oi.quantity || 0), 0);

const timeOf = (d) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();

const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
const daysAgo = (d) => Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);

// Chat-list style stamp: time today, "Yesterday", then the date
const chatStamp = (value) => {
  const d = new Date(value);
  const days = daysAgo(d);
  if (days === 0) return timeOf(d);
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

// The divider between days in a chat
const dayLabel = (value) => {
  const d = new Date(value);
  const days = daysAgo(d);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const fullStamp = (value) => {
  const d = new Date(value);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${timeOf(d)}`;
};

// Every status a roller can see. Only "to roll" and "rolled" are theirs to
// change — the rest are shown as where the order has got to.
const STATUS_STYLE = {
  'to roll': { label: 'To roll', chip: 'bg-blue-100 text-blue-700', dot: 'bg-blue-600' },
  rolled: { label: 'Rolled', chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-600' },
  billed: { label: 'Billed', chip: 'bg-violet-100 text-violet-700', dot: 'bg-violet-600' },
  delivered: { label: 'Delivered', chip: 'bg-teal-100 text-teal-700', dot: 'bg-teal-600' },
  completed: { label: 'Completed', chip: 'bg-slate-200 text-slate-700', dot: 'bg-slate-500' },
  cancellation_requested: { label: 'Cancel requested', chip: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  cancelled: { label: 'Cancelled', chip: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' }
};
const statusStyle = (status) => STATUS_STYLE[status] || { label: status, chip: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };

const StatusChip = ({ status, className = '' }) => {
  const style = statusStyle(status);
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.chip} ${className}`}>{style.label}</span>;
};

// The left pane: one row per customer, the one with the latest order on top
const useCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(CUSTOMER_STEP);
  const [searchTerm, setSearchTerm] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await api.get('/orders/roller/customers', { params: { search: searchTerm, limit } });
      if (response.data.success) {
        setCustomers(response.data.data);
        setTotal(response.data.total);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, limit]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setLimit(CUSTOMER_STEP); }, [searchTerm]);

  return {
    customers, setCustomers, total, loading, refresh, searchTerm, setSearchTerm,
    canLoadMore: customers.length < total,
    loadMore: () => setLimit((l) => l + CUSTOMER_STEP)
  };
};

// One customer's orders, oldest first like a chat. It opens on the newest
// page and pages back in time as the roller scrolls up.
const useChat = (customerId) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);

  const fetchPage = (params) =>
    api.get('/orders/roller/list', { params: { customer: customerId, sort: 'newest', page: 1, ...params } });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetchPage({ limit: ORDER_STEP });
        if (cancelled || !response.data.success) return;
        setOrders([...response.data.data].reverse());
        setHasOlder(response.data.pagination.total > response.data.data.length);
      } catch (error) {
        console.error('Error fetching orders:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const loadOlder = async () => {
    if (loadingOlder || !hasOlder || orders.length === 0) return false;
    try {
      setLoadingOlder(true);
      const response = await fetchPage({ limit: ORDER_STEP, before: orders[0].createdAt });
      if (!response.data.success) return false;
      const older = [...response.data.data].reverse();
      setOrders((current) => {
        const ids = new Set(current.map((o) => o._id));
        return [...older.filter((o) => !ids.has(o._id)), ...current];
      });
      setHasOlder(response.data.pagination.total > older.length);
      return true;
    } catch (error) {
      console.error('Error fetching older orders:', error);
      return false;
    } finally {
      setLoadingOlder(false);
    }
  };

  // Re-read everything from the oldest loaded order on, so new orders land at
  // the bottom and status changes made anywhere show through
  const refresh = async () => {
    try {
      const since = orders[0]?.createdAt;
      const response = await fetchPage({ limit: since ? MAX_LIMIT : ORDER_STEP, since });
      if (!response.data.success) return;
      const fresh = [...response.data.data].reverse();
      setOrders((current) => {
        // A full page may not reach back to the oldest loaded order — keep
        // whatever is older than it
        if (fresh.length < MAX_LIMIT || !fresh.length) return fresh;
        return [...current.filter((o) => new Date(o.createdAt) < new Date(fresh[0].createdAt)), ...fresh];
      });
    } catch (error) {
      console.error('Error refreshing orders:', error);
    }
  };

  const patchOrder = (id, patch) => setOrders((current) => current.map((o) => (o._id === id ? { ...o, ...patch } : o)));

  return { orders, loading, loadingOlder, hasOlder, loadOlder, refresh, patchOrder };
};

const Avatar = ({ name, className = 'h-11 w-11 text-sm' }) => (
  <span className={`flex shrink-0 items-center justify-center rounded-full bg-emerald-50 font-semibold text-emerald-700 ${className}`}>
    {initials(name)}
  </span>
);

// One customer as a chat row: their latest order is the preview, and the
// green count is how many of their "to roll" orders nobody has opened yet
const CustomerRow = ({ customer, selected, onSelect }) => {
  const unseen = customer.unseenCount > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors ${
        selected ? 'bg-slate-100' : 'bg-white hover:bg-slate-50'
      }`}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-emerald-600" />}
      <Avatar name={customer.name} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[14px] ${unseen ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{customer.name}</span>
          <span className={`shrink-0 text-[11px] ${unseen ? 'font-semibold text-emerald-600' : 'text-slate-400'}`}>
            {chatStamp(customer.lastOrderAt)}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className={`flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] ${unseen ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${statusStyle(customer.lastStatus).dot}`} />
            <span className="truncate">
              {statusStyle(customer.lastStatus).label} · Qty {customer.lastQty} · {customer.lastCargoName || 'No cargo'}
            </span>
          </span>
          {unseen ? (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white">
              {customer.unseenCount}
            </span>
          ) : customer.toRollCount > 0 ? (
            <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              {customer.toRollCount} to roll
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
};

const CustomerList = ({ list, selectedId, onSelect }) => {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <>
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[17px] font-bold text-slate-900">Customers</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">{list.total}</span>
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            className={`ml-auto flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
              showSearch || list.searchTerm ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
        {showSearch && (
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              type="text"
              placeholder="Search customers…"
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
      </div>

      {list.loading && list.customers.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-500" />
        </div>
      ) : list.customers.length === 0 ? (
        <EmptyPane
          icon={ClipboardCheck}
          iconClass="text-emerald-500"
          title="No orders"
          text={list.searchTerm ? 'No customers match your search.' : 'New orders will show up here automatically.'}
        />
      ) : (
        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
          {list.customers.map((customer) => (
            <CustomerRow key={customer._id} customer={customer} selected={customer._id === selectedId} onSelect={() => onSelect(customer)} />
          ))}
          {list.canLoadMore && (
            <div className="p-3">
              <button type="button" onClick={list.loadMore} className="srf-btn srf-btn-secondary w-full">Load more</button>
            </div>
          )}
        </div>
      )}
    </>
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

// One order as a chat message, with the button for whatever the roller can
// do next — roll it, or take a roll back. Anything past "rolled" is out of
// the roller's hands, so it only shows its status.
const OrderBubble = ({ order, onRoll, onRevert }) => {
  const isNew = order.status === 'to roll' && !order.rollerSeenAt;
  return (
    <div className="flex">
      <div className="w-full max-w-[560px] rounded-2xl rounded-tl-sm bg-white p-3.5 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-slate-500">
            <Truck className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{order.cargo?.name || 'No cargo'}</span>
          </p>
          {isNew && <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">New</span>}
          <StatusChip status={order.status} className="ml-auto" />
        </div>

        {order.notes && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-700">
            <span className="font-semibold">Note:</span> {order.notes}
          </p>
        )}

        <div className="mt-2 divide-y divide-slate-100 rounded-lg bg-slate-50/70 px-3">
          {(order.items || []).map((oi, idx) => (
            <div key={oi._id || idx} className="flex items-center gap-3 py-1.5 text-[13px]">
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{oi.item?.name || 'Deleted item'}</span>
              <span className="font-semibold tabular-nums text-slate-900">{oi.quantity}</span>
            </div>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500">
          <span className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-slate-400" />Total qty <span className="font-semibold tabular-nums text-slate-900">{totalQty(order)}</span></span>
          {order.rolledBy && (
            <span className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-emerald-600" />Rolled by <span className="font-semibold text-slate-700">{order.rolledBy.name || order.rolledBy.username}</span></span>
          )}
          {order.billNumber && (
            <span className="flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5 text-violet-500" />Bill <span className="font-semibold text-slate-700">{order.billNumber}</span></span>
          )}
        </div>

        <div className="mt-3 flex items-end gap-3">
          {order.status === 'to roll' && (
            <button
              type="button"
              onClick={() => onRoll(order)}
              className="flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-[13px] font-semibold text-white shadow-md shadow-emerald-700/20 transition-colors hover:bg-emerald-600"
            >
              <CircleCheck className="h-4 w-4" />
              Change to Rolled
            </button>
          )}
          {order.status === 'rolled' && (
            <button
              type="button"
              onClick={() => onRevert(order)}
              className="flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-slate-700"
            >
              <Undo2 className="h-4 w-4" />
              Revert
            </button>
          )}
          <span className="ml-auto text-[11px] text-slate-400" title={fullStamp(order.createdAt)}>{timeOf(new Date(order.createdAt))}</span>
        </div>
      </div>
    </div>
  );
};

// The right pane: one customer's orders as a chat, newest at the bottom
const ChatPane = ({ customer, onBack }) => {
  const chat = useChat(customer._id);
  const scrollRef = useRef(null);
  // What to do with the scroll once the next render lands: jump to the
  // bottom, or hold still while older orders are added above
  const pendingScroll = useRef('bottom');

  const [rollOrder, setRollOrder] = useState(null);
  const [revertOrder, setRevertOrder] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const showAlert = (title, message, type = 'error') => setAlertConfig({ title, message, type });

  // Keep the chat live — new orders, and anyone else rolling or billing one
  const refreshRef = useRef(chat.refresh);
  refreshRef.current = chat.refresh;
  useEffect(() => {
    const socket = getSocket();
    const onUpdate = () => {
      const el = scrollRef.current;
      // Follow new orders only if the roller is already at the bottom
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) pendingScroll.current = 'bottom';
      refreshRef.current();
    };
    socket.on('orders_updated', onUpdate);
    return () => socket.off('orders_updated', onUpdate);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const pending = pendingScroll.current;
    if (!el || !pending) return;
    if (pending === 'bottom') el.scrollTop = el.scrollHeight;
    else el.scrollTop = el.scrollHeight - pending.fromBottom;
    pendingScroll.current = null;
  }, [chat.orders, chat.loading]);

  const loadOlder = async () => {
    const el = scrollRef.current;
    if (!el || chat.loadingOlder || !chat.hasOlder) return;
    pendingScroll.current = { fromBottom: el.scrollHeight - el.scrollTop };
    const loaded = await chat.loadOlder();
    if (!loaded) pendingScroll.current = null;
  };

  const handleScroll = (e) => {
    if (e.currentTarget.scrollTop < 60) loadOlder();
  };

  // rakAllocation is the roller's pick of which raks the stock came off.
  // Marking rolled is the moment the goods have physically left the shelf, so
  // this is where the raks get relieved.
  const handleMarkRolled = async (rakAllocation) => {
    if (!rollOrder) return;
    try {
      setSubmitting(true);
      const response = await api.put(`/orders/${rollOrder._id}/status`, { status: 'rolled', rakAllocation });
      if (response.data.success) {
        chat.patchOrder(rollOrder._id, { status: 'rolled' });
        setRollOrder(null);
        chat.refresh();
      }
    } catch (error) {
      setRollOrder(null);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Undo a roll: the order goes back to "to roll" and its stock back onto the
  // raks it came off
  const handleRevert = async () => {
    if (!revertOrder) return;
    try {
      setSubmitting(true);
      const response = await api.put(`/orders/${revertOrder._id}/revert-status`);
      if (response.data.success) {
        chat.patchOrder(revertOrder._id, { status: 'to roll', rolledBy: null });
        setRevertOrder(null);
        chat.refresh();
      }
    } catch (error) {
      setRevertOrder(null);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toRoll = chat.orders.filter((o) => o.status === 'to roll').length;

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-black/5 bg-white px-4 py-3">
        <button type="button" onClick={onBack} className="-ml-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={customer.name} className="h-10 w-10 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-slate-900">{customer.name}</p>
          <p className="text-[12px] text-slate-500">
            {customer.orderCount} order{customer.orderCount === 1 ? '' : 's'}
            {toRoll > 0 && <> · <span className="font-semibold text-blue-600">{toRoll} to roll</span></>}
          </p>
        </div>
      </div>

      {chat.loading ? (
        <div className="flex flex-1 items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-500" />
        </div>
      ) : (
        <div ref={scrollRef} onScroll={handleScroll} className="scrollbar-none min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-4 sm:px-5">
          {chat.hasOlder ? (
            <div className="flex justify-center">
              <button type="button" onClick={loadOlder} disabled={chat.loadingOlder} className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-black/5">
                {chat.loadingOlder ? 'Loading…' : 'Load older orders'}
              </button>
            </div>
          ) : (
            <p className="text-center text-[11px] text-slate-400">Start of this customer's orders</p>
          )}
          {chat.orders.map((order, idx) => {
            const prev = chat.orders[idx - 1];
            const newDay = !prev || startOfDay(new Date(prev.createdAt)) !== startOfDay(new Date(order.createdAt));
            return (
              <React.Fragment key={order._id}>
                {newDay && (
                  <div className="flex justify-center py-1">
                    <span className="rounded-lg bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-500 shadow-sm ring-1 ring-black/5">
                      {dayLabel(order.createdAt)}
                    </span>
                  </div>
                )}
                <OrderBubble order={order} onRoll={setRollOrder} onRevert={setRevertOrder} />
              </React.Fragment>
            );
          })}
        </div>
      )}

      <RakAllocationModal
        isOpen={Boolean(rollOrder)}
        onClose={() => setRollOrder(null)}
        order={rollOrder}
        onConfirm={handleMarkRolled}
        submitting={submitting}
        showAlert={showAlert}
      />

      <ConfirmModal
        isOpen={Boolean(revertOrder)}
        onClose={() => setRevertOrder(null)}
        onConfirm={handleRevert}
        title="Revert this order?"
        message='It goes back to "to roll" and its stock is put back on the raks it came off.'
        type="warning"
        confirmLabel="Revert"
      />

      <AlertModal
        isOpen={Boolean(alertConfig)}
        onClose={() => setAlertConfig(null)}
        title={alertConfig?.title || ''}
        message={alertConfig?.message || ''}
        type={alertConfig?.type || 'error'}
      />
    </>
  );
};

// Two panes, WhatsApp style: customers on the left with the latest order on
// top, and the picked customer's orders as a chat on the right. On a phone
// the list shows until a customer is picked, whose chat then takes the screen.
const RollerOrders = () => {
  const list = useCustomers();
  const [selected, setSelected] = useState(null);
  // Read the picked customer from the list while it is there, so live counts show through
  const current = (selected && list.customers.find((c) => c._id === selected._id)) || selected;

  const { refresh } = list;
  useEffect(() => {
    const socket = getSocket();
    socket.on('orders_updated', refresh);
    return () => socket.off('orders_updated', refresh);
  }, [refresh]);

  // An open chat has been seen — including orders that arrive while it is open
  const currentId = current?._id;
  const currentUnseen = current?.unseenCount || 0;
  const { setCustomers } = list;
  useEffect(() => {
    if (!currentId || currentUnseen === 0) return;
    setCustomers((customers) => customers.map((c) => (c._id === currentId ? { ...c, unseenCount: 0 } : c)));
    api.put(`/orders/roller/customers/${currentId}/seen`).catch((error) => console.error('Error marking orders seen:', error));
  }, [currentId, currentUnseen, setCustomers]);

  const pane = 'flex min-h-0 flex-col overflow-hidden rounded-2xl ring-1';

  return (
    <div className="grid h-[calc(100dvh-11.25rem)] gap-3.5 sm:h-[calc(100dvh-11.75rem)] lg:grid-cols-[minmax(320px,1fr)_minmax(480px,2fr)]">
      <section className={`${pane} bg-white ring-slate-200/80 ${current ? 'hidden' : 'flex'} lg:flex`}>
        <CustomerList list={list} selectedId={current?._id} onSelect={setSelected} />
      </section>

      <section className={`${pane} bg-[#efeae2] ring-slate-200/80 ${current ? 'flex' : 'hidden'} lg:flex`}>
        {current ? (
          <ChatPane key={current._id} customer={current} onBack={() => setSelected(null)} />
        ) : (
          <EmptyPane icon={MessageSquare} iconClass="text-emerald-500" title="No customer selected" text="Pick a customer to see their orders." />
        )}
      </section>
    </div>
  );
};

export default RollerOrders;
