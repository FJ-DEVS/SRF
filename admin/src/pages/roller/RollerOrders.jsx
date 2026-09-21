import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import RakAllocationModal from '../../components/RakAllocationModal';
import AlertModal from '../../components/AlertModal';
import Pagination from '../../components/Pagination';
import OrderCard from '../../components/OrderCard';
import SortSelect from '../../components/SortSelect';
import { formatDate } from '../../utils/orderMath';
import {
  Search, RefreshCw, CheckCircle2, ClipboardCheck, X,
  SlidersHorizontal, History
} from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name_asc', label: 'Customer A–Z' },
  { value: 'name_desc', label: 'Customer Z–A' },
  { value: 'qty_desc', label: 'Quantity: high to low' },
  { value: 'qty_asc', label: 'Quantity: low to high' }
];

// The two lists a roller can look at. "to roll" is the work queue, "rolled"
// is the history of what has already been taken off the raks.
const VIEWS = [
  { value: 'to roll', label: 'To roll', icon: ClipboardCheck },
  { value: 'rolled', label: 'Rolled', icon: History }
];

const RollerOrders = () => {
  const [view, setView] = useState('to roll');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [customerFilter, setCustomerFilter] = useState('');
  const [cargoFilter, setCargoFilter] = useState('');
  const [filterOptions, setFilterOptions] = useState({ customers: [], cargos: [] });
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showRollModal, setShowRollModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });

  const isQueue = view === 'to roll';
  const activeFilterCount = (customerFilter ? 1 : 0) + (cargoFilter ? 1 : 0);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/orders/roller/list', {
        params: {
          status: view,
          search: searchTerm,
          sort: sortBy,
          customer: customerFilter,
          cargo: cargoFilter,
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
  }, [view, searchTerm, sortBy, customerFilter, cargoFilter, currentPage, pageSize]);

  // Dropdown values come from the orders in the current list, so the roller
  // is never offered a customer or cargo that matches nothing
  const fetchFilterOptions = useCallback(async () => {
    try {
      const response = await api.get('/orders/roller/filters', { params: { status: view } });
      if (response.data.success) setFilterOptions(response.data.data);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  }, [view]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [view, searchTerm, sortBy, customerFilter, cargoFilter, pageSize]);

  // The lists hold different customers, so a filter picked on one is
  // meaningless on the other
  useEffect(() => {
    setCustomerFilter('');
    setCargoFilter('');
  }, [view]);

  // Keep the lists live — someone else rolling an order moves it here too
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => {
      fetchOrders();
      fetchFilterOptions();
    };
    socket.on('orders_updated', refresh);
    return () => socket.off('orders_updated', refresh);
  }, [fetchOrders, fetchFilterOptions]);

  const showAlert = (title, message, type = 'error') => {
    setAlertConfig({ title, message, type });
    setShowAlertModal(true);
  };

  const clearFilters = () => {
    setCustomerFilter('');
    setCargoFilter('');
  };

  const handleRefresh = () => {
    fetchOrders();
    fetchFilterOptions();
  };

  // rakAllocation is the roller's pick of which raks the stock came off.
  // Marking rolled is the moment the goods have physically left the shelf, so
  // this is where the raks get relieved.
  const handleMarkRolled = async (rakAllocation) => {
    if (!selectedOrder) return;
    try {
      setSubmitting(true);
      const response = await api.put(`/orders/${selectedOrder._id}/status`, {
        status: 'rolled',
        rakAllocation
      });
      if (response.data.success) {
        setShowRollModal(false);
        setSelectedOrder(null);
        handleRefresh();
        showAlert('Order rolled', 'The order has been moved to "rolled".', 'success');
      }
    } catch (error) {
      setShowRollModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const hasQuery = Boolean(searchTerm || activeFilterCount);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="srf-page-title">{isQueue ? 'Orders to roll' : 'Rolled orders'}</h1>
          <p className="srf-page-sub">
            {pagination.total} order{pagination.total === 1 ? '' : 's'} {isQueue ? 'waiting' : 'rolled'}
          </p>
        </div>
        <button onClick={handleRefresh} className="srf-btn srf-btn-secondary shrink-0" title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* View switch */}
      <div className="srf-card grid grid-cols-2 gap-1 p-1">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const isActive = view === v.value;
          return (
            <button
              key={v.value}
              type="button"
              onClick={() => setView(v.value)}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition-colors ${
                isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {v.label}
            </button>
          );
        })}
      </div>

      {/* Search, sort, filters */}
      <div className="srf-card space-y-2.5 p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer or order ID…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full !pl-9"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <SortSelect value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`srf-btn shrink-0 ${showFilters || activeFilterCount ? 'srf-btn-primary' : 'srf-btn-secondary'}`}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-slate-900">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-2.5 sm:grid-cols-2">
            <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} aria-label="Customer">
              <option value="">All customers</option>
              {filterOptions.customers.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
            <select value={cargoFilter} onChange={(e) => setCargoFilter(e.target.value)} aria-label="Cargo">
              <option value="">All cargos</option>
              {filterOptions.cargos.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
            {activeFilterCount > 0 && (
              <button type="button" onClick={clearFilters} className="srf-chip self-start text-slate-400">
                <X className="h-3 w-3" />
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="srf-card flex items-center justify-center p-12">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
        </div>
      ) : orders.length === 0 ? (
        <div className="srf-card flex flex-col items-center justify-center px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            {isQueue ? <ClipboardCheck className="h-5 w-5" /> : <History className="h-5 w-5" />}
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {isQueue ? 'Nothing to roll' : 'No rolled orders'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {hasQuery
              ? 'No orders match your search or filters.'
              : isQueue
                ? 'New orders will show up here automatically.'
                : 'Orders you mark as rolled will show up here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {orders.map((order) => (
            <OrderCard
              key={order._id}
              order={order}
              maxItems={Infinity}
              showAmount={false}
              className="srf-card overflow-hidden"
              footer={
                isQueue ? (
                  <div className="border-t border-slate-100 p-2.5">
                    <button
                      onClick={() => { setSelectedOrder(order); setShowRollModal(true); }}
                      className="srf-btn srf-btn-success w-full py-2.5"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark as rolled
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 border-t border-slate-100 px-3.5 py-2 text-[11px] text-slate-500">
                    <CheckCircle2 className="h-3.5 w-3.5 text-violet-500" />
                    Rolled on <span className="font-semibold text-slate-700">{formatDate(order.updatedAt)}</span>
                  </div>
                )
              }
            />
          ))}

          <div className="srf-card overflow-hidden">
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
          </div>
        </div>
      )}

      <RakAllocationModal
        isOpen={showRollModal}
        onClose={() => { setShowRollModal(false); setSelectedOrder(null); }}
        order={selectedOrder}
        onConfirm={handleMarkRolled}
        submitting={submitting}
        showAlert={showAlert}
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

export default RollerOrders;
