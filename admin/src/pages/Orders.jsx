import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import ShareOrderModal from '../components/ShareOrderModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import {
  Search, Plus, Edit2, Trash2, X, Download, RefreshCw, RotateCcw, Share2,
  ShoppingCart, CalendarDays, Truck
} from 'lucide-react';
import * as XLSX from 'xlsx';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name_asc', label: 'Customer A–Z' },
  { value: 'name_desc', label: 'Customer Z–A' },
  { value: 'qty_desc', label: 'Quantity: high to low' },
  { value: 'qty_asc', label: 'Quantity: low to high' }
];

const orderTotal = (order) =>
  order.items.reduce((total, oi) => total + (oi.item?.price || 0) * oi.quantity, 0);

const orderQty = (order) =>
  order.items.reduce((total, oi) => total + (oi.quantity || 0), 0);

// Sell and purchase orders sit in the same list — colour tells them apart at a
// glance: money coming in (indigo) vs. stock coming in (emerald)
const TYPE_STYLES = {
  'sell order': {
    label: 'Sell Order',
    row: 'bg-indigo-50/40 hover:!bg-indigo-50/70',
    badge: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200',
    dot: 'bg-indigo-500'
  },
  'purchase order': {
    label: 'Purchase Order',
    row: 'bg-emerald-50/40 hover:!bg-emerald-50/70',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
    dot: 'bg-emerald-500'
  }
};

const typeStyle = (type) => TYPE_STYLES[type] || TYPE_STYLES['sell order'];

const TypeBadge = ({ type }) => {
  const style = typeStyle(type);
  return (
    <span className={`srf-badge ${style.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
};

const Orders = () => {
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [cargo, setCargo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [typeFilter, setTypeFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());
  const [sortBy, setSortBy] = useState('newest');
  const [todayOnly, setTodayOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [showCancelApproveModal, setShowCancelApproveModal] = useState(false);
  const [showCancelRejectModal, setShowCancelRejectModal] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [formData, setFormData] = useState({
    type: 'sell order',
    customerName: '',
    cargo: '',
    notes: ''
  });
  const [selectedItems, setSelectedItems] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const itemDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (itemDropdownRef.current && !itemDropdownRef.current.contains(e.target)) {
        setShowItemDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchRelatedData();
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [searchTerm, statusFilter, typeFilter, monthFilter, yearFilter, sortBy, todayOnly, currentPage, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, typeFilter, monthFilter, yearFilter, sortBy, todayOnly, pageSize]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
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
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchRelatedData = async () => {
    try {
      const [customersRes, vendorsRes, itemsRes, cargoRes] = await Promise.all([
        api.get('/customers', { params: { limit: 1000 } }),
        api.get('/vendors', { params: { limit: 1000 } }),
        api.get('/items', { params: { limit: 1000 } }),
        api.get('/cargo', { params: { limit: 500 } })
      ]);

      if (customersRes.data.success) setCustomers(customersRes.data.data);
      if (vendorsRes.data.success) setVendors(vendorsRes.data.data);
      if (itemsRes.data.success) setItems(itemsRes.data.data);
      if (cargoRes.data.success) setCargo(cargoRes.data.data);
    } catch (error) {
      console.error('Error fetching related data:', error);
    }
  };

  const showAlert = (title, message, type = 'error') => {
    setAlertConfig({ title, message, type });
    setShowAlertModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedItems.length === 0) {
      showAlert('Validation Error', 'Please select at least one item', 'warning');
      return;
    }

    const hasInvalidQuantity = selectedItems.some(item => !item.quantity || item.quantity < 1);
    if (hasInvalidQuantity) {
      showAlert('Validation Error', 'All items must have a quantity of at least 1', 'warning');
      return;
    }

    const orderData = {
      ...formData,
      items: selectedItems.map(item => ({
        item: item.itemId,
        quantity: parseInt(item.quantity)
      }))
    };

    try {
      if (selectedOrder) {
        const response = await api.put(`/orders/${selectedOrder._id}`, orderData);
        if (response.data.success) {
          fetchOrders();
          handleCloseModal();
        }
      } else {
        const response = await api.post('/orders', orderData);
        if (response.data.success) {
          fetchOrders();
          handleCloseModal();
          showAlert('Order Created', 'The order has been created successfully.', 'success');
        }
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleStatusUpdate = async () => {
    try {
      const response = await api.put(`/orders/${selectedOrder._id}/status`, { status: newStatus });
      if (response.data.success) {
        fetchOrders();
        setShowStatusModal(false);
        setSelectedOrder(null);
        setNewStatus('');
      }
    } catch (error) {
      setShowStatusModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/orders/${selectedOrder._id}`);
      if (response.data.success) {
        fetchOrders();
        setSelectedOrder(null);
      }
    } catch (error) {
      setShowDeleteModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleApproveCancellation = async () => {
    try {
      const response = await api.put(`/orders/${selectedOrder._id}/cancel-approve`);
      if (response.data.success) {
        fetchOrders();
        setShowCancelApproveModal(false);
        setSelectedOrder(null);
      }
    } catch (error) {
      setShowCancelApproveModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleRejectCancellation = async () => {
    try {
      const response = await api.put(`/orders/${selectedOrder._id}/cancel-reject`);
      if (response.data.success) {
        fetchOrders();
        setShowCancelRejectModal(false);
        setSelectedOrder(null);
      }
    } catch (error) {
      setShowCancelRejectModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleRevertStatus = async () => {
    try {
      const response = await api.put(`/orders/${selectedOrder._id}/revert-status`);
      if (response.data.success) {
        fetchOrders();
        setShowRevertModal(false);
        setSelectedOrder(null);
      }
    } catch (error) {
      setShowRevertModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleEdit = (order) => {
    setSelectedOrder(order);
    setFormData({
      type: order.type,
      customerName: order.customerName?._id || order.customerName || '',
      cargo: order.cargo?._id || '',
      notes: order.notes || ''
    });

    const itemsWithQty = order.items.map(orderItem => ({
      itemId: orderItem.item?._id || orderItem.item,
      quantity: orderItem.quantity,
      name: orderItem.item?.name || 'Unknown Item',
      price: orderItem.item?.price || 0,
      availableQty: orderItem.item?.quantity || 0
    }));

    setSelectedItems(itemsWithQty);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedOrder(null);
    setFormData({ type: 'sell order', customerName: '', cargo: '', notes: '' });
    setSelectedItems([]);
    setItemSearch('');
    setShowItemDropdown(false);
  };

  const handleAddItem = (itemId) => {
    const item = items.find(i => i._id === itemId);
    if (!item) return;

    if (selectedItems.some(si => si.itemId === itemId)) {
      showAlert('Item Already Added', 'This item is already added to the order', 'info');
      return;
    }

    setSelectedItems([...selectedItems, {
      itemId: item._id,
      name: item.name,
      price: item.price,
      availableQty: item.quantity,
      quantity: 1
    }]);
  };

  const handleRemoveItem = (itemId) => {
    setSelectedItems(selectedItems.filter(item => item.itemId !== itemId));
  };

  const handleUpdateItemQuantity = (itemId, quantity) => {
    setSelectedItems(selectedItems.map(item =>
      item.itemId === itemId ? { ...item, quantity: parseInt(quantity) || 0 } : item
    ));
  };

  const getNextStatus = (currentStatus, orderType) => {
    if (orderType === 'purchase order') {
      return currentStatus === 'pending' ? 'completed' : null;
    }
    const statusMap = {
      'pending': 'to roll',
      'to roll': 'rolled',
      'rolled': 'billed',
      'billed': 'delivered'
    };
    return statusMap[currentStatus];
  };

  const getPrevStatus = (currentStatus, orderType) => {
    if (orderType === 'purchase order') {
      return currentStatus === 'completed' ? 'pending' : null;
    }
    const revertMap = {
      'to roll': 'pending',
      'rolled': 'to roll',
      'billed': 'rolled',
      'delivered': 'billed'
    };
    return revertMap[currentStatus] || null;
  };

  const handleExportToExcel = () => {
    if (orders.length === 0) {
      showAlert('No Data', 'No data to export', 'info');
      return;
    }

    const exportData = orders.map((order, index) => ({
      'S.No': index + 1,
      'Order ID': order._id,
      'Date': new Date(order.createdAt).toLocaleDateString(),
      'Type': order.type,
      'Customer': order.customerName?.name || '-',
      'Items': order.items.map(orderItem =>
        `${orderItem.item?.name || 'Unknown'} (Qty: ${orderItem.quantity})`
      ).join(', '),
      'Total Qty': orderQty(order),
      'Total Amount': orderTotal(order),
      'Status': order.status,
      'Cargo': order.cargo?.name || '-',
      'Created By': order.createdByType === 'admin' ? 'Admin' : (order.createdBy?.name || '-')
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');

    const fileName = todayOnly
      ? `orders_today_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `orders_${yearFilter}_${monthFilter || 'all'}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  /* ---------- Row actions ---------- */

  const rowActions = (order) => (
    <>
      <button
        onClick={() => { setSelectedOrder(order); setShowShareModal(true); }}
        className="srf-row-action text-sky-600 hover:bg-sky-50"
        title="Share Order"
      >
        <Share2 className="h-4 w-4" />
      </button>

      {order.status === 'cancellation_requested' ? (
        <>
          <button
            onClick={() => { setSelectedOrder(order); setShowCancelApproveModal(true); }}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
            title="Approve Cancellation"
          >
            Approve
          </button>
          <button
            onClick={() => { setSelectedOrder(order); setShowCancelRejectModal(true); }}
            className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
            title="Reject Cancellation"
          >
            Reject
          </button>
        </>
      ) : (
        order.status !== 'cancelled' &&
        (order.type === 'purchase order' ? order.status === 'pending' : order.status !== 'delivered') && (
          <button
            onClick={() => {
              setSelectedOrder(order);
              setNewStatus(getNextStatus(order.status, order.type));
              setShowStatusModal(true);
            }}
            className="srf-row-action text-emerald-600 hover:bg-emerald-50"
            title={`Advance to "${getNextStatus(order.status, order.type)}"`}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )
      )}

      {getPrevStatus(order.status, order.type) && (
        <button
          onClick={() => { setSelectedOrder(order); setShowRevertModal(true); }}
          className="srf-row-action text-amber-600 hover:bg-amber-50"
          title={`Revert to "${getPrevStatus(order.status, order.type)}"`}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}

      <button
        onClick={() => handleEdit(order)}
        className="srf-row-action text-slate-500 hover:bg-slate-100"
        title="Edit"
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        onClick={() => { setSelectedOrder(order); setShowDeleteModal(true); }}
        className="srf-row-action text-rose-500 hover:bg-rose-50"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <div className="srf-page">
      <PageHeader title="Orders" subtitle="Sell and purchase orders across your team">
        <button onClick={handleExportToExcel} className="srf-btn srf-btn-secondary" title="Export to Excel">
          <Download className="h-4 w-4 text-slate-400" />
          Export
        </button>
        <button onClick={() => setShowModal(true)} className="srf-btn srf-btn-primary">
          <Plus className="h-4 w-4" />
          New Order
        </button>
      </PageHeader>

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

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:ml-auto lg:flex">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="to roll">To Roll</option>
              <option value="rolled">Rolled</option>
              <option value="billed">Billed</option>
              <option value="delivered">Delivered</option>
              <option value="completed">Completed</option>
              <option value="cancellation_requested">Cancel Requested</option>
              <option value="cancelled">Cancelled</option>
            </select>

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
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>

            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="col-span-2 sm:col-span-1">
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTodayOnly((v) => !v)}
            className={`srf-chip ${todayOnly ? 'srf-chip-active' : ''}`}
          >
            <CalendarDays className="h-3 w-3" />
            Today's orders
          </button>

          {(searchTerm || statusFilter || typeFilter || monthFilter || todayOnly) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
                setTypeFilter('');
                setMonthFilter('');
                setTodayOnly(false);
                setSortBy('newest');
              }}
              className="srf-chip text-slate-400"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}

          {/* Row colour legend — doubles as a type filter */}
          <div className="ml-auto flex items-center gap-3">
            {Object.entries(TYPE_STYLES).map(([type, style]) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
                className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                  typeFilter === type ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'
                }`}
                title={`Show only ${style.label.toLowerCase()}s`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                {style.label}
              </button>
            ))}
          </div>
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
            <p className="mt-1 text-xs text-slate-400">Adjust the filters, or create a new order.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Cargo</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order._id}
                      className={`cursor-pointer ${typeStyle(order.type).row}`}
                      onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }}
                    >
                      <td className="whitespace-nowrap">
                        {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </td>
                      <td className="max-w-[240px]">
                        <p className="truncate font-semibold text-slate-900">{order.customerName?.name || '—'}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <TypeBadge type={order.type} />
                          <span className="text-[11px] text-slate-400">{orderQty(order)} pcs</span>
                        </div>
                      </td>
                      <td><StatusBadge status={order.status} /></td>
                      <td className="max-w-[140px] truncate">{order.cargo?.name || '—'}</td>
                      <td className="whitespace-nowrap text-right font-semibold text-slate-800">
                        ₹{orderTotal(order).toLocaleString('en-IN')}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {rowActions(order)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 lg:hidden">
              {orders.map((order) => (
                <div
                  key={order._id}
                  className={`p-3.5 ${typeStyle(order.type).row}`}
                  onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{order.customerName?.name || '—'}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        {' · '}{orderQty(order)} pcs
                      </p>
                      <div className="mt-1">
                        <TypeBadge type={order.type} />
                      </div>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-800">₹{orderTotal(order).toLocaleString('en-IN')}</span>
                      {order.cargo?.name && (
                        <span className="flex min-w-0 items-center gap-1 truncate">
                          <Truck className="h-3 w-3 shrink-0 text-slate-300" />
                          <span className="truncate">{order.cargo.name}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      {rowActions(order)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={pagination.pages}
              totalItems={pagination.total}
              itemsPerPage={pageSize}
              onPageChange={handlePageChange}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="srf-modal-backdrop" onClick={handleCloseModal}>
          <div className="srf-modal-panel max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="srf-modal-header">
              <h3 className="srf-modal-title">{selectedOrder ? 'Edit Order' : 'New Order'}</h3>
              <button onClick={handleCloseModal} className="srf-icon-btn">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="srf-modal-body space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block">Order Type</label>
                  <select
                    required
                    value={formData.type}
                    disabled={!!selectedOrder}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value, customerName: '' })}
                    className="w-full disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="sell order">Sell Order</option>
                    <option value="purchase order">Purchase Order</option>
                  </select>
                  {selectedOrder && (
                    <p className="mt-1 text-[11px] text-slate-400">Order type cannot be changed after creation.</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block">
                    {formData.type === 'purchase order' ? 'Vendor' : 'Customer'}
                  </label>
                  <select
                    required
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    className="w-full"
                  >
                    <option value="">
                      {formData.type === 'purchase order' ? 'Select vendor' : 'Select customer'}
                    </option>
                    {formData.type === 'purchase order'
                      ? vendors.map(vendor => (
                          <option key={vendor._id} value={vendor._id}>{vendor.name}</option>
                        ))
                      : customers.filter(c => !c.isBlocked).map(customer => (
                          <option key={customer._id} value={customer._id}>{customer.name}</option>
                        ))
                    }
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block">Items</label>
                <div className="space-y-2">
                  {/* Searchable Add Item Dropdown */}
                  <div className="relative" ref={itemDropdownRef}>
                    <div className="flex items-center rounded-lg border border-slate-200 bg-white transition-all focus-within:border-indigo-400 focus-within:ring-[3px] focus-within:ring-indigo-500/10">
                      <Search className="ml-3 h-4 w-4 shrink-0 text-slate-400" />
                      <input
                        type="text"
                        value={itemSearch}
                        onChange={(e) => { setItemSearch(e.target.value); setShowItemDropdown(true); }}
                        onFocus={() => setShowItemDropdown(true)}
                        placeholder="Search and add items…"
                        className="w-full !border-0 !bg-transparent !px-2 !shadow-none !ring-0 focus:!ring-0"
                      />
                      {itemSearch && (
                        <button
                          type="button"
                          onClick={() => { setItemSearch(''); setShowItemDropdown(false); }}
                          className="mr-2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {showItemDropdown && (
                      <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg scrollbar-thin">
                        {items
                          .filter(item =>
                            !selectedItems.some(si => si.itemId === item._id) &&
                            (itemSearch === '' || item.name.toLowerCase().includes(itemSearch.toLowerCase()))
                          )
                          .slice(0, 60)
                          .map(item => (
                            <button
                              key={item._id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleAddItem(item._id);
                                setItemSearch('');
                                setShowItemDropdown(false);
                              }}
                              className="flex w-full items-center justify-between border-b border-slate-50 px-3.5 py-2.5 text-left text-[13px] last:border-0 hover:bg-indigo-50/50"
                            >
                              <span className="min-w-0 truncate font-medium text-slate-800">{item.name}</span>
                              <span className="ml-2 shrink-0 text-xs text-slate-400">₹{item.price} · {item.quantity} in stock</span>
                            </button>
                          ))
                        }
                        {items.filter(item =>
                          !selectedItems.some(si => si.itemId === item._id) &&
                          (itemSearch === '' || item.name.toLowerCase().includes(itemSearch.toLowerCase()))
                        ).length === 0 && (
                          <p className="px-4 py-3 text-center text-sm text-slate-400">No items found</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Selected Items List */}
                  {selectedItems.length > 0 ? (
                    <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2 scrollbar-thin">
                      {selectedItems.map((item) => (
                        <div key={item.itemId} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-slate-900">{item.name}</p>
                            <p className="text-[11px] text-slate-400">₹{item.price} · {item.availableQty} in stock</p>
                          </div>
                          <input
                            type="number"
                            min="1"
                            max={formData.type === 'sell order' ? item.availableQty : undefined}
                            value={item.quantity}
                            onChange={(e) => handleUpdateItemQuantity(item.itemId, e.target.value)}
                            className="w-18 shrink-0 !px-2 !py-1.5 text-center"
                            placeholder="Qty"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.itemId)}
                            className="srf-row-action shrink-0 text-rose-500 hover:bg-rose-50"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center text-xs text-slate-400">
                      No items yet — search above to add items to this order.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block">Cargo <span className="font-normal text-slate-400">(optional)</span></label>
                  <select
                    value={formData.cargo}
                    onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                    className="w-full"
                  >
                    <option value="">Select cargo</option>
                    {cargo.map(c => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block">Notes <span className="font-normal text-slate-400">(optional)</span></label>
                  <textarea
                    rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full resize-none"
                    placeholder="Delivery notes, billing instructions…"
                  />
                </div>
              </div>
            </form>

            <div className="srf-modal-footer">
              <button type="button" onClick={handleCloseModal} className="srf-btn srf-btn-secondary">
                Cancel
              </button>
              <button type="submit" onClick={handleSubmit} className="srf-btn srf-btn-primary">
                {selectedOrder ? 'Save Changes' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      <ConfirmModal
        isOpen={showStatusModal}
        onClose={() => {
          setShowStatusModal(false);
          setSelectedOrder(null);
          setNewStatus('');
        }}
        onConfirm={handleStatusUpdate}
        title="Update Order Status"
        message={`Move this order from "${selectedOrder?.status}" to "${newStatus}"?`}
        type="info"
        confirmLabel="Update"
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedOrder(null); }}
        onConfirm={handleDelete}
        title="Delete Order"
        message="This order will be permanently deleted. This action cannot be undone."
        type="danger"
        confirmLabel="Delete"
      />

      {/* Approve Cancellation Modal */}
      <ConfirmModal
        isOpen={showCancelApproveModal}
        onClose={() => { setShowCancelApproveModal(false); setSelectedOrder(null); }}
        onConfirm={handleApproveCancellation}
        title="Approve Cancellation"
        message="Approve cancellation for this order? Stock will be restored automatically."
        type="danger"
        confirmLabel="Approve"
      />

      {/* Reject Cancellation Modal */}
      <ConfirmModal
        isOpen={showCancelRejectModal}
        onClose={() => { setShowCancelRejectModal(false); setSelectedOrder(null); }}
        onConfirm={handleRejectCancellation}
        title="Reject Cancellation"
        message="Reject the cancellation request? The order will revert to its previous status."
        type="info"
        confirmLabel="Reject Request"
      />

      {/* Revert Status Modal */}
      <ConfirmModal
        isOpen={showRevertModal}
        onClose={() => { setShowRevertModal(false); setSelectedOrder(null); }}
        onConfirm={handleRevertStatus}
        title="Revert Order Status"
        message={`Revert "${selectedOrder?.status}" back to "${getPrevStatus(selectedOrder?.status, selectedOrder?.type)}"?${selectedOrder?.type === 'purchase order' && selectedOrder?.status === 'completed' ? ' Stock added on completion will be deducted.' : ''}`}
        type="warning"
        confirmLabel="Revert"
      />

      {/* Order Detail Modal */}
      {showDetailModal && selectedOrder && (
        <div className="srf-modal-backdrop" onClick={() => setShowDetailModal(false)}>
          <div className="srf-modal-panel max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="srf-modal-header">
              <div className="min-w-0">
                <h3 className="srf-modal-title">Order Details</h3>
                <p className="text-[11px] text-slate-400">
                  {new Date(selectedOrder.createdAt).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="srf-icon-btn shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="srf-modal-body space-y-4">
              {/* Summary row */}
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={selectedOrder.status} />
                <TypeBadge type={selectedOrder.type} />
                {selectedOrder.cargo?.name && (
                  <span className="srf-badge bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
                    <Truck className="h-3 w-3" /> {selectedOrder.cargo.name}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-slate-400">
                  ID: <span className="font-mono">{selectedOrder._id.slice(-8)}</span>
                </span>
              </div>

              {/* Party info */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {selectedOrder.type === 'purchase order' ? 'Vendor' : 'Customer'}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{selectedOrder.customerName?.name || '—'}</p>
                <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
                  {selectedOrder.customerName?.phone && <span>{selectedOrder.customerName.phone}</span>}
                  {selectedOrder.customerName?.gstin && <span>GSTIN: {selectedOrder.customerName.gstin}</span>}
                </div>
              </div>

              {/* Items table */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Order Items ({selectedOrder.items.length})
                </p>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        <th className="px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Item</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Price</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Qty</th>
                        <th className="px-3.5 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedOrder.items.map((orderItem, index) => (
                        <tr key={index}>
                          <td className="px-3.5 py-2.5 text-[13px] font-medium text-slate-800">
                            {orderItem.item?.name || 'Unknown Item'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right text-[13px] text-slate-600">
                            ₹{(orderItem.item?.price || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right text-[13px] font-semibold text-slate-800">
                            {orderItem.quantity}
                          </td>
                          <td className="whitespace-nowrap px-3.5 py-2.5 text-right text-[13px] font-semibold text-slate-900">
                            ₹{((orderItem.item?.price || 0) * orderItem.quantity).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50/80">
                        <td className="px-3.5 py-2.5 text-[13px] font-bold text-slate-900">Total</td>
                        <td />
                        <td className="px-3 py-2.5 text-right text-[13px] font-bold text-slate-900">
                          {orderQty(selectedOrder)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-display text-sm font-bold text-indigo-600">
                          ₹{orderTotal(selectedOrder).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Created by + notes */}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                <span>
                  Created by{' '}
                  <span className="font-semibold text-slate-700">
                    {selectedOrder.createdByType === 'admin' ? 'Admin' : (selectedOrder.createdBy?.name || '—')}
                  </span>
                </span>
              </div>

              {selectedOrder.notes && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-amber-900">{selectedOrder.notes}</p>
                </div>
              )}
            </div>

            <div className="srf-modal-footer">
              <button onClick={() => setShowDetailModal(false)} className="srf-btn srf-btn-secondary">
                Close
              </button>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  handleEdit(selectedOrder);
                }}
                className="srf-btn srf-btn-primary"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edit Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Order Modal */}
      <ShareOrderModal
        isOpen={showShareModal}
        onClose={() => {
          setShowShareModal(false);
          setSelectedOrder(null);
        }}
        order={selectedOrder}
        showAlert={showAlert}
      />

      {/* Alert Modal */}
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

export default Orders;
