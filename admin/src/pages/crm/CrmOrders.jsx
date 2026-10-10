import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import ConfirmModal from '../../components/ConfirmModal';
import AlertModal from '../../components/AlertModal';
import OrderDetailModal from '../../components/OrderDetailModal';
import ShareOrderModal from '../../components/ShareOrderModal';
import Pagination from '../../components/Pagination';
import SortSelect from '../../components/SortSelect';
import StatusBadge from '../../components/StatusBadge';
import BillBadge from '../../components/BillBadge';
import CargoBadge from '../../components/CargoBadge';
import { orderQty, formatDate } from '../../utils/orderMath';
import { callHref } from '../../utils/contact';
import useCargoOptions from '../../utils/useCargoOptions';
import { Search, X, Phone, CalendarDays, PackageCheck, ShoppingCart, ChevronRight, Share2 } from 'lucide-react';

// Rows per page: 10 by default, adjustable from the pager
const PAGE_SIZES = [10, 20, 30];

// Only billed orders and what follows them are ever shown. Billed is where the
// work is — a manager confirms delivery from there — so it opens first.
const STATUS_TABS = [
  { value: 'billed', label: 'Billed' },
  { value: 'delivered', label: 'Delivered' },
  { value: '', label: 'All' }
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'bill_desc', label: 'Bill no.: high to low' },
  { value: 'bill_asc', label: 'Bill no.: low to high' },
  { value: 'name_asc', label: 'Customer A–Z' },
  { value: 'name_desc', label: 'Customer Z–A' },
  { value: 'qty_desc', label: 'Quantity: high to low' },
  { value: 'qty_asc', label: 'Quantity: low to high' }
];

// "YYYY-MM-DD" as the browser's date input writes it, in local time
const toInputDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysAgoInput = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toInputDate(d);
};

// Midnight at the start of a picked day (or the days after it), in the
// browser's time zone, as an ISO instant the server can compare createdAt to
const dayInstant = (value, offsetDays = 0) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d + offsetDays).toISOString();
};

const DATE_PRESETS = [
  { label: 'Today', from: () => daysAgoInput(0), to: () => daysAgoInput(0) },
  { label: '7 days', from: () => daysAgoInput(6), to: () => daysAgoInput(0) },
  { label: '30 days', from: () => daysAgoInput(29), to: () => daysAgoInput(0) }
];

const shortDate = (value) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const partyName = (order) => order?.customerName?.name || 'this customer';

const CallLink = ({ phone, className = '', children }) => {
  const href = callHref(phone);
  const base = `flex items-center justify-center gap-1.5 font-semibold transition-colors ${className}`;
  if (!href) {
    return (
      <span className={`${base} cursor-not-allowed bg-slate-100 text-slate-400`} title="No phone number">
        {children}
      </span>
    );
  }
  return (
    <a href={href} onClick={(e) => e.stopPropagation()} className={`${base} bg-emerald-600 text-white hover:bg-emerald-500`}>
      {children}
    </a>
  );
};

// Just the basics — who, which bill, where it stands, how big. The items and
// the full customer are one tap away in the detail view.
const OrderRow = ({ order, onOpen, onShare }) => {
  const items = order.items || [];
  return (
    <div className="flex cursor-pointer items-center gap-3 p-3.5" onClick={() => onOpen(order)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[15px] font-semibold text-slate-900">{order.customerName?.name || '—'}</p>
          <StatusBadge status={order.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <BillBadge number={order.billNumber} />
          <span className="text-[11.5px] text-slate-400">{formatDate(order.createdAt)}</span>
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[12px] font-medium text-slate-500">
            {items.length} item{items.length === 1 ? '' : 's'} · {orderQty(order)} pcs
          </span>
          <CargoBadge cargo={order.cargo} className="min-w-0" />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onShare(order); }}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 transition-colors hover:bg-sky-100"
          title="Share Order"
          aria-label="Share order"
        >
          <Share2 className="h-4 w-4" />
        </button>
        <CallLink phone={order.customerName?.phone} className="h-10 w-10 rounded-xl">
          <Phone className="h-4 w-4" />
        </CallLink>
        <ChevronRight className="h-4 w-4 text-slate-300" />
      </div>
    </div>
  );
};

const CrmOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // The term actually sent to the server, a beat behind the input so typing
  // does not fire a request per keystroke
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('billed');
  const [cargoFilter, setCargoFilter] = useState('');
  const cargos = useCargoOptions();
  const [sortBy, setSortBy] = useState('newest');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showDates, setShowDates] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [shareOrder, setShareOrder] = useState(null);
  const [deliverTarget, setDeliverTarget] = useState(null);
  const [alertConfig, setAlertConfig] = useState(null);

  // Refreshes can overlap — only the latest request may write, so a slow older
  // response never overwrites newer data
  const requestId = useRef(0);

  const fetchOrders = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const params = { search: query, status: statusFilter, cargo: cargoFilter, sort: sortBy, page: currentPage, limit: pageSize };
      // The date period is a range on the order date: from the start of the
      // first day up to (not including) the day after the last
      if (fromDate) params.since = dayInstant(fromDate);
      if (toDate) params.before = dayInstant(toDate, 1);
      const response = await api.get('/orders/crm/list', { params });
      if (id === requestId.current && response.data.success) {
        setOrders(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [query, statusFilter, cargoFilter, sortBy, fromDate, toDate, currentPage, pageSize]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [query, statusFilter, cargoFilter, sortBy, fromDate, toDate, pageSize]);

  // Orders get billed and delivered all day — keep the list live
  useEffect(() => {
    const socket = getSocket();
    socket.on('orders_updated', fetchOrders);
    return () => socket.off('orders_updated', fetchOrders);
  }, [fetchOrders]);

  // An open detail view follows its order through a refresh
  useEffect(() => {
    setSelectedOrder((current) => (current && orders.find((o) => o._id === current._id)) || current);
  }, [orders]);

  const showAlert = (title, message, type = 'error') => setAlertConfig({ title, message, type });

  const handleDeliver = async () => {
    const target = deliverTarget;
    if (!target) return;
    try {
      const response = await api.put(`/orders/${target._id}/status`, { status: 'delivered' });
      if (response.data.success) {
        setSelectedOrder(null);
        fetchOrders();
        showAlert('Delivery Confirmed', `${partyName(target)}'s order is now marked as delivered.`, 'success');
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const hasRange = Boolean(fromDate || toDate);
  const hasFilters = Boolean(searchTerm || hasRange || cargoFilter || statusFilter !== 'billed' || sortBy !== 'newest');

  const clearFilters = () => {
    setSearchTerm('');
    setQuery('');
    setStatusFilter('billed');
    setCargoFilter('');
    setSortBy('newest');
    setFromDate('');
    setToDate('');
  };

  const rangeLabel = hasRange
    ? `${fromDate ? shortDate(fromDate) : 'Start'} – ${toDate ? shortDate(toDate) : 'Now'}`
    : 'Dates';

  const tabLabel = STATUS_TABS.find((t) => t.value === statusFilter)?.label.toLowerCase();

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="srf-toolbar">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search customer, bill no. or order ID…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full !pl-9 !pr-9"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value || 'all'}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`srf-chip ${statusFilter === tab.value ? 'srf-chip-active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowDates((v) => !v)}
            className={`srf-chip ml-auto ${showDates || hasRange ? 'srf-chip-active' : ''}`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {rangeLabel}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <SortSelect value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} className="min-w-0 sm:w-[13rem]" />
          <select
            value={cargoFilter}
            onChange={(e) => setCargoFilter(e.target.value)}
            aria-label="Cargo"
            title="Cargo"
            className="min-w-0 sm:w-[13rem]"
          >
            <option value="">All cargos</option>
            {cargos.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>

        {/* Date period */}
        {showDates && (
          <div className="space-y-2.5 rounded-lg bg-slate-50 p-3">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                From
                <input
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="mt-1 w-full"
                />
              </label>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                To
                <input
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => setToDate(e.target.value)}
                  className="mt-1 w-full"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {DATE_PRESETS.map((preset) => {
                const from = preset.from();
                const to = preset.to();
                const active = fromDate === from && toDate === to;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => { setFromDate(from); setToDate(to); }}
                    className={`srf-chip ${active ? 'srf-chip-active' : ''}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              {hasRange && (
                <button type="button" onClick={() => { setFromDate(''); setToDate(''); }} className="srf-chip text-slate-400">
                  <X className="h-3 w-3" />
                  Clear dates
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{pagination.total} {tabLabel === 'all' ? '' : `${tabLabel} `}order{pagination.total === 1 ? '' : 's'}</span>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="flex items-center gap-1 font-medium hover:text-slate-600">
              <X className="h-3 w-3" />
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="srf-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <ShoppingCart className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No orders found</p>
            <p className="mt-1 text-xs text-slate-400">
              {hasFilters ? 'Nothing matches the current filters.' : 'Billed orders will show up here automatically.'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {orders.map((order) => (
                <OrderRow key={order._id} order={order} onOpen={setSelectedOrder} onShare={setShareOrder} />
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={pagination.pages}
              totalItems={pagination.total}
              itemsPerPage={pageSize}
              pageSizes={PAGE_SIZES}
              onPageChange={(page) => {
                setCurrentPage(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      {/* Items, customer and everything else, only once an order is opened */}
      <OrderDetailModal
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
        actions={selectedOrder && (
          <>
            <button
              type="button"
              onClick={() => { setShareOrder(selectedOrder); setSelectedOrder(null); }}
              className="srf-btn srf-btn-secondary"
            >
              <Share2 className="h-4 w-4 text-sky-600" />
              Share
            </button>
            <CallLink phone={selectedOrder.customerName?.phone} className="h-9 rounded-lg px-3.5 text-[13px]">
              <Phone className="h-4 w-4" />
              Call
            </CallLink>
            {selectedOrder.status === 'billed' && (
              <button
                type="button"
                onClick={() => setDeliverTarget(selectedOrder)}
                className="srf-btn srf-btn-success"
              >
                <PackageCheck className="h-4 w-4" />
                Confirm delivery
              </button>
            )}
          </>
        )}
      />

      {/* Same order image as the admin console: copy, download or share */}
      <ShareOrderModal
        isOpen={Boolean(shareOrder)}
        onClose={() => setShareOrder(null)}
        order={shareOrder}
        showAlert={showAlert}
      />

      <ConfirmModal
        isOpen={Boolean(deliverTarget)}
        onClose={() => setDeliverTarget(null)}
        onConfirm={handleDeliver}
        title="Confirm Delivery"
        message={`Mark ${partyName(deliverTarget)}'s order${deliverTarget?.billNumber ? ` (Bill #${deliverTarget.billNumber})` : ''} as delivered? Only an admin can undo this.`}
        type="info"
        confirmLabel="Confirm delivery"
      />

      <AlertModal
        isOpen={Boolean(alertConfig)}
        onClose={() => setAlertConfig(null)}
        title={alertConfig?.title || ''}
        message={alertConfig?.message || ''}
        type={alertConfig?.type || 'error'}
      />
    </div>
  );
};

export default CrmOrders;
