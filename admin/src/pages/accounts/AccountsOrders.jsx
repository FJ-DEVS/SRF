import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import ConfirmModal from '../../components/ConfirmModal';
import BillNumberModal from '../../components/BillNumberModal';
import AlertModal from '../../components/AlertModal';
import OrderDetailModal from '../../components/OrderDetailModal';
import Pagination from '../../components/Pagination';
import PageHeader from '../../components/PageHeader';
import OrderTable from '../../components/OrderTable';
import OrderCard from '../../components/OrderCard';
import { typeStyle } from '../../utils/orderType';
import { STATUS_COLORS, STATUS_LABELS } from '../../utils/orderStatus';
import {
  Search, X, Eye, RefreshCw, CalendarDays, ShoppingCart,
  Send, Receipt, CheckCircle2, PackageCheck
} from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name_asc', label: 'Customer A–Z' },
  { value: 'name_desc', label: 'Customer Z–A' },
  { value: 'qty_desc', label: 'Quantity: high to low' },
  { value: 'qty_asc', label: 'Quantity: low to high' }
];

// Status tabs across the top; countKey reads the matching /orders/stats figure
const STATUS_TABS = [
  { value: '', countKey: 'total' },
  { value: 'pending', countKey: 'pending' },
  { value: 'to roll', countKey: 'toRoll' },
  { value: 'rolled', countKey: 'rolled' },
  { value: 'billed', countKey: 'billed' },
  { value: 'delivered', countKey: 'delivered' },
  { value: 'completed', countKey: 'completed' },
  { value: 'cancellation_requested', countKey: 'cancellationRequested' },
  { value: 'cancelled', countKey: 'cancelled' }
];

// The only things an accounts manager may do to an order. Anything else is
// view-only here (and refused by the server).
const moveFor = (order) => {
  if (order.status === 'cancellation_requested') {
    return {
      kind: 'approve',
      label: 'Approve cancellation',
      icon: CheckCircle2,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
      title: 'Approve Cancellation',
      message: (name) => `Approve cancellation for ${name}'s order? Stock will be restored automatically.`,
      modalType: 'danger'
    };
  }
  if (order.type === 'purchase order') {
    if (order.status !== 'pending') return null;
    return {
      kind: 'status',
      to: 'completed',
      label: 'Mark completed',
      icon: PackageCheck,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
      title: 'Mark as Completed',
      message: (name) => `Mark ${name}'s purchase order as completed? Stock will be added to inventory.`,
      modalType: 'info'
    };
  }
  if (order.status === 'pending') {
    return {
      kind: 'status',
      to: 'to roll',
      label: 'Send to roll',
      icon: Send,
      className: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
      title: 'Send to Roll',
      message: (name) => `Send ${name}'s order to the rolling queue?`,
      modalType: 'info'
    };
  }
  if (order.status === 'rolled') {
    return {
      kind: 'status',
      to: 'billed',
      label: 'Mark billed',
      icon: Receipt,
      className: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100',
      title: 'Mark as Billed',
      message: (name) => `Enter the bill number to mark ${name}'s order as billed.`,
      modalType: 'info'
    };
  }
  return null;
};

const partyName = (order) => order?.customerName?.name || 'this';

const AccountsOrders = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // The status tab lives in the URL so dashboard links and the back button work
  const statusFilter = searchParams.get('status') || '';
  const setStatusFilter = (value) => setSearchParams(value ? { status: value } : {}, { replace: true });

  const [orders, setOrders] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [todayOnly, setTodayOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  // { order, move } while a confirmation is open
  const [pendingMove, setPendingMove] = useState(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });

  const fetchOrders = useCallback(async () => {
    try {
      const response = await api.get('/orders', {
        params: {
          search: searchTerm,
          status: statusFilter,
          type: typeFilter,
          month: monthFilter,
          year: yearFilter,
          sort: sortBy,
          date: todayOnly ? 'today' : '',
          page: currentPage,
          limit: pageSize
        }
      });
      if (response.data.success) {
        setOrders(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, typeFilter, monthFilter, yearFilter, sortBy, todayOnly, currentPage, pageSize]);

  const fetchCounts = useCallback(async () => {
    try {
      const response = await api.get('/orders/stats');
      if (response.data.success) setCounts(response.data.data.orders);
    } catch (error) {
      console.error('Error fetching order counts:', error);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, typeFilter, monthFilter, yearFilter, sortBy, todayOnly, pageSize]);

  // Rollers and salesmen move orders all day — keep the list and tabs live
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => {
      fetchOrders();
      fetchCounts();
    };
    socket.on('orders_updated', refresh);
    return () => socket.off('orders_updated', refresh);
  }, [fetchOrders, fetchCounts]);

  const showAlert = (title, message, type = 'error') => {
    setAlertConfig({ title, message, type });
    setShowAlertModal(true);
  };

  const handleRefresh = () => {
    fetchOrders();
    fetchCounts();
  };

  const confirmMove = async (billNumber) => {
    const { order, move } = pendingMove;
    try {
      if (move.kind === 'approve') {
        await api.put(`/orders/${order._id}/cancel-approve`);
      } else {
        const payload = { status: move.to };
        if (move.to === 'billed') payload.billNumber = billNumber;
        await api.put(`/orders/${order._id}/status`, payload);
      }
      setShowDetailModal(false);
      setSelectedOrder(null);
      handleRefresh();
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const openDetail = (order) => {
    setSelectedOrder(order);
    setShowDetailModal(true);
  };

  const moveButton = (order, compact = false) => {
    const move = moveFor(order);
    if (!move) return null;
    const Icon = move.icon;
    return (
      <button
        onClick={() => setPendingMove({ order, move })}
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${move.className} ${compact ? '' : 'sm:px-3'}`}
        title={move.label}
      >
        <Icon className="h-3.5 w-3.5" />
        {move.label}
      </button>
    );
  };

  const rowActions = (order) => (
    <>
      {moveButton(order)}
      <button
        onClick={() => openDetail(order)}
        className="srf-row-action text-indigo-500 hover:bg-indigo-50"
        title="View Details"
      >
        <Eye className="h-4 w-4" />
      </button>
    </>
  );

  const hasFilters = Boolean(searchTerm || statusFilter || typeFilter || monthFilter || yearFilter || todayOnly);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setTypeFilter('');
    setMonthFilter('');
    setYearFilter('');
    setTodayOnly(false);
    setSortBy('newest');
  };

  return (
    <div className="srf-page">
      <PageHeader
        title="Orders"
        subtitle="Every order across the team. Queue, bill, complete purchases or approve cancellations — nothing else changes here."
      >
        <button onClick={handleRefresh} className="srf-btn srf-btn-secondary" title="Refresh">
          <RefreshCw className="h-4 w-4 text-slate-400" />
          Refresh
        </button>
      </PageHeader>

      {/* Status tabs */}
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1.5 pb-0.5">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            const count = counts[tab.countKey] ?? 0;
            return (
              <button
                key={tab.value || 'all'}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`srf-chip shrink-0 ${active ? 'srf-chip-active' : ''}`}
              >
                {tab.value && (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[tab.value] }} />
                )}
                {tab.value ? STATUS_LABELS[tab.value] : 'All'}
                <span
                  className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                    active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div className="srf-toolbar">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by customer or order ID…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full !pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:ml-auto lg:flex">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              <option value="sell order">Sell Order</option>
              <option value="purchase order">Purchase Order</option>
            </select>

            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} disabled={todayOnly}>
              <option value="">All months</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>

            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} disabled={todayOnly}>
              <option value="">All years</option>
              {YEARS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>

            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTodayOnly((v) => !v)}
            className={`srf-chip ${todayOnly ? 'srf-chip-active' : ''}`}
          >
            <CalendarDays className="h-3 w-3" />
            Today's orders
          </button>

          {hasFilters && (
            <button type="button" onClick={clearFilters} className="srf-chip text-slate-400">
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}

          <span className="ml-auto text-[11px] text-slate-400">
            {pagination.total} order{pagination.total === 1 ? '' : 's'}
          </span>
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
              {hasFilters ? 'Nothing matches the current filters.' : 'New orders will show up here automatically.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block">
              <OrderTable orders={orders} onRowClick={openDetail} renderActions={rowActions} />
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 lg:hidden">
              {orders.map((order) => (
                <OrderCard
                  key={order._id}
                  order={order}
                  className={typeStyle(order.type).row}
                  onClick={() => openDetail(order)}
                  actions={moveButton(order, true)}
                />
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={pagination.pages}
              totalItems={pagination.total}
              itemsPerPage={pageSize}
              onPageChange={(page) => {
                setCurrentPage(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      <OrderDetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setSelectedOrder(null); }}
        order={selectedOrder}
        actions={selectedOrder ? moveButton(selectedOrder) : null}
      />

      {/* Billing asks for the bill number; every other move is a plain confirm */}
      <ConfirmModal
        isOpen={Boolean(pendingMove) && pendingMove.move.to !== 'billed'}
        onClose={() => setPendingMove(null)}
        onConfirm={confirmMove}
        title={pendingMove?.move.title || ''}
        message={pendingMove ? pendingMove.move.message(partyName(pendingMove.order)) : ''}
        type={pendingMove?.move.modalType || 'info'}
        confirmLabel={pendingMove?.move.label || 'Confirm'}
      />

      <BillNumberModal
        isOpen={pendingMove?.move.to === 'billed'}
        onClose={() => setPendingMove(null)}
        onConfirm={confirmMove}
        title={pendingMove?.move.title || ''}
        message={pendingMove ? pendingMove.move.message(partyName(pendingMove.order)) : ''}
      />

      <AlertModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
      />
    </div>
  );
};

export default AccountsOrders;
