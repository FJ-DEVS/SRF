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
import TypeBadge from '../../components/TypeBadge';
import FilterPanel from '../../components/FilterPanel';
import { orderQty, formatDate } from '../../utils/orderMath';
import { callHref, whatsappHref } from '../../utils/contact';
import { renderOrderImage } from '../../utils/orderImage';
import useCargoOptions from '../../utils/useCargoOptions';
import { ITEM_NAME_SORT_OPTIONS } from '../../utils/sortOptions';
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

// Sell orders are the day-to-day work, so they open first; purchase and return
// orders are there to look up. The status tabs only apply to sell orders.
const TYPE_OPTIONS = [
  { value: 'sell order', label: 'Sell orders' },
  { value: 'purchase order', label: 'Purchase orders' },
  { value: 'return order', label: 'Return orders' },
  { value: '', label: 'All types' }
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'bill_desc', label: 'Bill no.: high to low' },
  { value: 'bill_asc', label: 'Bill no.: low to high' },
  { value: 'name_asc', label: 'Customer A–Z' },
  { value: 'name_desc', label: 'Customer Z–A' },
  ...ITEM_NAME_SORT_OPTIONS,
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

// The delivery-confirmation message the WhatsApp button types in for the customer
const deliveryMessage = (order) => {
  const salesman = order.createdByType === 'admin' ? 'Admin' : (order.createdBy?.name || 'our salesman');
  const customer = order.customerName?.name || 'you';
  const cargo = order.cargo?.name ? ` through ${order.cargo.name}` : '';
  // Bills entered before billedAt was recorded fall back to the last update
  const billedOn = formatDate(order.billedAt || order.updatedAt);
  return `Thank you for choosing Skydecor Laminates. Kindly confirm the delivery of order placed by ${salesman} for ${customer}. The order was dispatched${cargo} on ${billedOn}. We expect a confirmation from your side.`;
};

const WhatsAppIcon = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

// One tap: the order image goes onto the clipboard, then WhatsApp opens on the
// customer's chat with the confirmation message typed in. WhatsApp links can
// carry text but not files, so the image is pasted into the chat from there.
const WhatsAppButton = ({ order, onAlert, className = '', children }) => {
  const [busy, setBusy] = useState(false);
  const href = whatsappHref(order.customerName?.phone, deliveryMessage(order));
  const base = `flex items-center justify-center gap-1.5 font-semibold transition-colors ${className}`;
  if (!href) {
    return (
      <span className={`${base} cursor-not-allowed bg-slate-100 text-slate-400`} title="No phone number">
        {children}
      </span>
    );
  }

  const handleClick = async (e) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    let copied = false;
    try {
      // The write starts inside the tap (Safari insists) and takes the image as
      // a promise, so it can finish rendering while the clipboard waits
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': renderOrderImage(order) })]);
        copied = true;
      }
    } catch (error) {
      console.error('WhatsApp image copy error:', error);
    } finally {
      setBusy(false);
    }

    const win = window.open(href, '_blank');
    if (win) win.opener = null;
    else window.location.href = href;

    onAlert(
      copied ? 'Paste the Order Image' : 'Image Not Attached',
      copied
        ? 'WhatsApp is open with the message. The order image is copied — paste it into the chat (long-press › Paste, or Ctrl/Cmd+V) and send.'
        : 'WhatsApp is open with the message, but this browser could not copy the order image. Use Share to send the image.',
      copied ? 'success' : 'info'
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`${base} bg-[#25D366] text-white hover:bg-[#1ebe5b] disabled:opacity-60`}
      title="WhatsApp delivery confirmation"
      aria-label="Send delivery confirmation on WhatsApp"
    >
      {children}
    </button>
  );
};

// Just the basics — who, which bill, where it stands, how big. The items and
// the full customer are one tap away in the detail view.
const OrderRow = ({ order, onOpen, onShare, onAlert }) => {
  const items = order.items || [];
  return (
    <div className="flex cursor-pointer items-center gap-3 p-3.5" onClick={() => onOpen(order)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[15px] font-semibold text-slate-900">{order.customerName?.name || '—'}</p>
          <StatusBadge status={order.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {order.type !== 'sell order' && <TypeBadge type={order.type} />}
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
        {/* The message asks to confirm a delivery — only a sell order has one */}
        {order.type === 'sell order' && (
          <WhatsAppButton order={order} onAlert={onAlert} className="h-10 w-10 rounded-xl">
            <WhatsAppIcon className="h-4 w-4" />
          </WhatsAppButton>
        )}
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
  const [typeFilter, setTypeFilter] = useState('sell order');
  const isSell = typeFilter === 'sell order';
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
      const params = { search: query, type: typeFilter, status: isSell ? statusFilter : '', cargo: cargoFilter, sort: sortBy, page: currentPage, limit: pageSize };
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
  }, [query, typeFilter, isSell, statusFilter, cargoFilter, sortBy, fromDate, toDate, currentPage, pageSize]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [query, typeFilter, statusFilter, cargoFilter, sortBy, fromDate, toDate, pageSize]);

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
  const hasFilters = Boolean(searchTerm || hasRange || cargoFilter || !isSell || statusFilter !== 'billed' || sortBy !== 'newest');

  const clearFilters = () => {
    setSearchTerm('');
    setQuery('');
    setStatusFilter('billed');
    setTypeFilter('sell order');
    setCargoFilter('');
    setSortBy('newest');
    setFromDate('');
    setToDate('');
  };

  const rangeLabel = hasRange
    ? `${fromDate ? shortDate(fromDate) : 'Start'} – ${toDate ? shortDate(toDate) : 'Now'}`
    : 'Dates';

  const tabLabel = STATUS_TABS.find((t) => t.value === statusFilter)?.label.toLowerCase();
  // "12 billed orders", "5 purchase orders", "40 orders"
  const countLabel = isSell ? (tabLabel === 'all' ? '' : tabLabel) : typeFilter.replace(' order', '');

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <FilterPanel active={[searchTerm, hasRange, cargoFilter, !isSell, statusFilter !== 'billed']}>
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
            {isSell && STATUS_TABS.map((tab) => (
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
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Order type"
              title="Order type"
              className="col-span-2 min-w-0 sm:w-[11rem]"
            >
              {TYPE_OPTIONS.map((t) => <option key={t.value || 'all'} value={t.value}>{t.label}</option>)}
            </select>
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
            <span>{pagination.total} {countLabel ? `${countLabel} ` : ''}order{pagination.total === 1 ? '' : 's'}</span>
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="flex items-center gap-1 font-medium hover:text-slate-600">
                <X className="h-3 w-3" />
                Reset filters
              </button>
            )}
          </div>
        </div>
      </FilterPanel>

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
                <OrderRow key={order._id} order={order} onOpen={setSelectedOrder} onShare={setShareOrder} onAlert={showAlert} />
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
            {selectedOrder.type === 'sell order' && (
              <WhatsAppButton order={selectedOrder} onAlert={showAlert} className="h-9 rounded-lg px-3.5 text-[13px]">
                <WhatsAppIcon className="h-4 w-4" />
                WhatsApp
              </WhatsAppButton>
            )}
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
