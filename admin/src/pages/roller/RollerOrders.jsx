import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import ConfirmModal from '../../components/ConfirmModal';
import AlertModal from '../../components/AlertModal';
import Pagination from '../../components/Pagination';
import StatusBadge from '../../components/StatusBadge';
import { Search, RefreshCw, CheckCircle2, ClipboardCheck, Package, X } from 'lucide-react';

const orderQty = (order) =>
  (order.items || []).reduce((total, oi) => total + (oi.quantity || 0), 0);

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// The roller's work queue: orders waiting to be rolled, and nothing else.
// The list endpoint is pinned to "to roll" server-side.
const RollerOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [expandedId, setExpandedId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showRollModal, setShowRollModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/orders/roller/list', {
        params: { search: searchTerm, page: currentPage, limit: pageSize }
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
  }, [searchTerm, currentPage, pageSize]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  // Keep the queue live — someone else rolling an order should remove it here too
  useEffect(() => {
    const socket = getSocket();
    socket.on('orders_updated', fetchOrders);
    return () => socket.off('orders_updated', fetchOrders);
  }, [fetchOrders]);

  const showAlert = (title, message, type = 'error') => {
    setAlertConfig({ title, message, type });
    setShowAlertModal(true);
  };

  const handleMarkRolled = async () => {
    if (!selectedOrder) return;
    try {
      setSubmitting(true);
      const response = await api.put(`/orders/${selectedOrder._id}/status`, { status: 'rolled' });
      if (response.data.success) {
        setShowRollModal(false);
        setSelectedOrder(null);
        fetchOrders();
        showAlert('Order rolled', 'The order has been moved to "rolled".', 'success');
      }
    } catch (error) {
      setShowRollModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="srf-page-title">Orders to roll</h1>
          <p className="srf-page-sub">
            {pagination.total} order{pagination.total === 1 ? '' : 's'} waiting
          </p>
        </div>
        <button onClick={fetchOrders} className="srf-btn srf-btn-secondary shrink-0" title="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="srf-card p-2.5">
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
      </div>

      {/* Queue */}
      {loading ? (
        <div className="srf-card flex items-center justify-center p-12">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
        </div>
      ) : orders.length === 0 ? (
        <div className="srf-card flex flex-col items-center justify-center px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-700">Nothing to roll</p>
          <p className="mt-1 text-xs text-slate-400">
            {searchTerm ? 'No orders match your search.' : 'New orders will show up here automatically.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {orders.map((order) => {
            const isOpen = expandedId === order._id;
            return (
              <div key={order._id} className="srf-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : order._id)}
                  className="w-full px-3.5 py-3 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-slate-900">
                        {order.customerName?.name || '—'}
                      </p>
                      <p className="mt-0.5 text-[11px] capitalize text-slate-400">
                        {formatDate(order.createdAt)} · {order.type} · {orderQty(order)} pcs
                      </p>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>

                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {order.items?.length || 0} item{(order.items?.length || 0) === 1 ? '' : 's'} ·
                    {' '}Tap to {isOpen ? 'hide' : 'view'} details
                  </p>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-3">
                    <p className="srf-mcard-label mb-1.5">Items</p>
                    <div className="space-y-1.5">
                      {(order.items || []).map((oi, idx) => (
                        <div key={oi._id || idx} className="flex items-center justify-between gap-3 text-[13px]">
                          <span className="flex min-w-0 items-center gap-1.5 text-slate-700">
                            <Package className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                            <span className="truncate">{oi.item?.name || 'Deleted item'}</span>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                            × {oi.quantity}
                          </span>
                        </div>
                      ))}
                    </div>

                    {order.cargo?.name && (
                      <p className="mt-2.5 text-[12px] text-slate-500">
                        Cargo: <span className="font-medium text-slate-700">{order.cargo.name}</span>
                      </p>
                    )}
                    {order.notes && (
                      <p className="mt-1 text-[12px] text-slate-500">
                        Notes: <span className="font-medium text-slate-700">{order.notes}</span>
                      </p>
                    )}
                  </div>
                )}

                <div className="border-t border-slate-100 p-2.5">
                  <button
                    onClick={() => { setSelectedOrder(order); setShowRollModal(true); }}
                    className="srf-btn srf-btn-success w-full py-2.5"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark as rolled
                  </button>
                </div>
              </div>
            );
          })}

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

      <ConfirmModal
        isOpen={showRollModal}
        onClose={() => { setShowRollModal(false); setSelectedOrder(null); }}
        onConfirm={handleMarkRolled}
        title="Mark as rolled?"
        message={`The order for ${selectedOrder?.customerName?.name || 'this customer'} will move from "to roll" to "rolled".`}
        type="warning"
        confirmLabel={submitting ? 'Working…' : 'Mark rolled'}
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
