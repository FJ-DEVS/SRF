import React, { useCallback, useEffect, useState } from 'react';
import api from '../utils/api';
import { getSocket } from '../utils/socket';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import FilterPanel from '../components/FilterPanel';
import { Search, Trash2, PackageX } from 'lucide-react';

const formatDateTime = (value) =>
  new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const VIEWS = [
  { key: 'attempts', label: 'Attempts' },
  { key: 'items', label: 'By item' },
];

// The lines an attempt could not fill, with what was asked for and on hand
const ShortLines = ({ items }) => {
  const short = (items || []).filter((l) => l.short > 0);
  return (
    <ul className="space-y-0.5">
      {short.map((line) => (
        <li key={`${line.item}-${line.name}`} className="text-[13px] text-slate-800">
          <span className="font-medium">{line.name}</span>
          <span className="ml-1.5 text-xs text-slate-500">
            asked {line.requested}, had {line.available} ·{' '}
            <span className="font-semibold text-rose-600">{line.short} short</span>
          </span>
        </li>
      ))}
    </ul>
  );
};

const EmptyState = ({ search }) => (
  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
      <PackageX className="h-5 w-5" />
    </span>
    <p className="mt-3 text-sm font-semibold text-slate-700">
      {search ? 'Nothing matches that search' : 'No failed orders'}
    </p>
    <p className="mt-1 text-xs text-slate-400">
      {search
        ? 'Try a customer, salesman or item name.'
        : 'Sell orders turned away for want of stock will be listed here.'}
    </p>
  </div>
);

// Sell orders that could not be placed because an item was short — so the
// admin can see what was asked for and restock it
const FailedOrders = () => {
  const [view, setView] = useState('attempts');
  const [failedOrders, setFailedOrders] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [toDelete, setToDelete] = useState(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });

  const showAlert = (title, message, type = 'error') => {
    setAlertConfig({ title, message, type });
    setShowAlertModal(true);
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      if (view === 'attempts') {
        const response = await api.get('/failed-orders', {
          params: { search: searchTerm, page: currentPage, limit: pageSize },
        });
        if (response.data.success) {
          setFailedOrders(response.data.data);
          setPagination(response.data.pagination);
        }
      } else {
        const response = await api.get('/failed-orders/summary', { params: { search: searchTerm } });
        if (response.data.success) setSummary(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching failed orders:', error);
    } finally {
      setLoading(false);
    }
  }, [view, searchTerm, currentPage, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize, view]);

  // New attempts come in whenever someone runs short — keep the list live
  useEffect(() => {
    const socket = getSocket();
    socket.on('failed_orders_updated', fetchData);
    return () => socket.off('failed_orders_updated', fetchData);
  }, [fetchData]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/failed-orders/${toDelete._id}`);
      if (response.data.success) fetchData();
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    } finally {
      setToDelete(null);
    }
  };

  const placedBy = (row) => row.createdByName || (row.createdByType === 'admin' ? 'Admin' : 'Salesman');

  const deleteButton = (row) => (
    <button
      onClick={(e) => { e.stopPropagation(); setToDelete(row); }}
      className="srf-row-action text-rose-500 hover:bg-rose-50"
      title="Remove from list"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );

  const rows = view === 'attempts' ? failedOrders : summary;

  return (
    <div className="srf-page">
      <PageHeader title="Failed Orders" subtitle="Sell orders that could not be placed because items were short" />

      {/* Toolbar */}
      <FilterPanel active={[searchTerm]}>
        <div className="srf-toolbar sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search customer, salesman or item…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full !pl-9"
            />
          </div>
          <div className="flex w-full rounded-lg border border-slate-200 bg-slate-50 p-0.5 sm:ml-auto sm:w-auto">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition sm:flex-none ${
                  view === v.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </FilterPanel>

      {/* List */}
      <div className="srf-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState search={searchTerm} />
        ) : view === 'attempts' ? (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Tried</th>
                    <th>Customer</th>
                    <th>Placed by</th>
                    <th>Short items</th>
                    <th>Cargo</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {failedOrders.map((row) => (
                    <tr key={row._id}>
                      <td className="whitespace-nowrap text-slate-600">{formatDateTime(row.createdAt)}</td>
                      <td className="font-semibold text-slate-900">{row.customerName || '—'}</td>
                      <td className="text-slate-600">{placedBy(row)}</td>
                      <td><ShortLines items={row.items} /></td>
                      <td className="text-slate-600">{row.cargoName || '—'}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1">{deleteButton(row)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {failedOrders.map((row) => (
                <div key={row._id} className="flex items-start justify-between gap-2 p-3.5">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{row.customerName || '—'}</p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(row.createdAt)} · {placedBy(row)}
                      {row.cargoName ? ` · ${row.cargoName}` : ''}
                    </p>
                    <ShortLines items={row.items} />
                  </div>
                  <div className="flex shrink-0 items-center">{deleteButton(row)}</div>
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
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Times short</th>
                    <th className="text-right">Pieces short</th>
                    <th className="text-right">Pieces asked</th>
                    <th className="text-right">In stock now</th>
                    <th>Last tried</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.item || row.name}>
                      <td className="font-semibold text-slate-900">{row.name}</td>
                      <td className="text-right text-slate-600">{row.attempts}</td>
                      <td className="text-right font-semibold text-rose-600">{row.totalShort}</td>
                      <td className="text-right text-slate-600">{row.totalRequested}</td>
                      <td className="text-right text-slate-600">{row.inStock ?? '—'}</td>
                      <td className="whitespace-nowrap text-slate-600">{formatDate(row.lastTried)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {summary.map((row) => (
                <div key={row.item || row.name} className="flex items-center justify-between gap-3 p-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Short {row.attempts}× · last {formatDate(row.lastTried)} · {row.inStock ?? '—'} in stock now
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-rose-600">{row.totalShort} short</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Remove Failed Order"
        message={`This attempt for ${toDelete?.customerName || 'this customer'} will be taken off the list. It also stops counting in the By item totals.`}
        type="danger"
        confirmLabel="Remove"
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

export default FailedOrders;
