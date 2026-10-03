import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import ConfirmModal from '../../components/ConfirmModal';
import AlertModal from '../../components/AlertModal';
import DetailModal from '../../components/DetailModal';
import Pagination from '../../components/Pagination';
import SortSelect from '../../components/SortSelect';
import { NAME_SORT_OPTIONS } from '../../utils/sortOptions';
import { initials, callHref } from '../../utils/contact';
import { Search, X, Phone, ShieldOff, ShieldCheck, Users, ChevronRight } from 'lucide-react';

// Rows per page: 10 by default, adjustable from the pager
const PAGE_SIZES = [10, 20, 30];

// Which customers to list; value is what the API takes as isBlocked
const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'false', label: 'Active' },
  { value: 'true', label: 'Blocked' }
];

const PAYMENT_LABELS = { good: 'Good Payer', average: 'Average Payer', bad: 'Poor Payer' };

const Avatar = ({ name, blocked, className = 'h-11 w-11 text-sm' }) => (
  <span
    className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
      blocked ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-700'
    } ${className}`}
  >
    {initials(name)}
  </span>
);

const StatusChip = ({ blocked }) => (
  <span
    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
      blocked ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
    }`}
  >
    {blocked ? 'Blocked' : 'Active'}
  </span>
);

const CallButton = ({ phone, className = '' }) => {
  const href = callHref(phone);
  const base = `flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold transition-colors ${className}`;
  if (!href) {
    return (
      <span className={`${base} cursor-not-allowed bg-slate-100 text-slate-400`} title="No phone number">
        <Phone className="h-4 w-4" />
        Call
      </span>
    );
  }
  return (
    <a href={href} className={`${base} bg-emerald-600 text-white hover:bg-emerald-500`}>
      <Phone className="h-4 w-4" />
      Call
    </a>
  );
};

const BlockButton = ({ customer, onClick, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex h-10 items-center justify-center gap-1.5 rounded-xl border px-4 text-[13px] font-semibold transition-colors ${
      customer.isBlocked
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
        : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
    } ${className}`}
  >
    {customer.isBlocked ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
    {customer.isBlocked ? 'Unblock' : 'Block'}
  </button>
);

// Just the basics — name, phone, status — with the two things a manager does
// most. Everything else is one tap away in the detail view.
const CustomerRow = ({ customer, onOpen, onToggleBlock }) => (
  <div className={`p-3.5 ${customer.isBlocked ? 'bg-rose-50/30' : ''}`}>
    <div className="flex cursor-pointer items-center gap-3" onClick={() => onOpen(customer)}>
      <Avatar name={customer.name} blocked={customer.isBlocked} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-semibold text-slate-900">{customer.name}</p>
          <StatusChip blocked={customer.isBlocked} />
        </div>
        <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{customer.phone || 'No phone'}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <CallButton phone={customer.phone} />
      <BlockButton customer={customer} onClick={() => onToggleBlock(customer)} />
    </div>
  </div>
);

const CrmCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // The term actually sent to the server, a beat behind the input so typing
  // does not fire a request per keystroke
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [detailCustomer, setDetailCustomer] = useState(null);
  const [blockTarget, setBlockTarget] = useState(null);
  const [alertConfig, setAlertConfig] = useState(null);

  // Refreshes can overlap — only the latest request may write, so a slow older
  // response never overwrites newer data
  const requestId = useRef(0);

  const fetchCustomers = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const params = { search: query, sort: sortBy, page: currentPage, limit: pageSize };
      if (statusFilter !== '') params.isBlocked = statusFilter;
      const response = await api.get('/customers/crm/list', { params });
      if (id === requestId.current && response.data.success) {
        setCustomers(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [query, statusFilter, sortBy, currentPage, pageSize]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [query, statusFilter, sortBy, pageSize]);

  // The admin edits customers too — keep the list live
  useEffect(() => {
    const socket = getSocket();
    socket.on('customers_updated', fetchCustomers);
    return () => socket.off('customers_updated', fetchCustomers);
  }, [fetchCustomers]);

  const showAlert = (title, message, type = 'error') => setAlertConfig({ title, message, type });

  const handleToggleBlock = async () => {
    const target = blockTarget;
    if (!target) return;
    try {
      const response = await api.put(`/customers/crm/${target._id}/block`, { isBlocked: !target.isBlocked });
      if (response.data.success) {
        // Keep an open detail view in step with the change
        setDetailCustomer((current) => (current?._id === target._id ? response.data.data : current));
        fetchCustomers();
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const detailFields = (customer) => [
    { label: 'Name', value: customer?.name, type: 'text', key: 'name' },
    { label: 'Phone', value: customer?.phone, type: 'text', key: 'phone' },
    { label: 'GSTIN', value: customer?.gstin, type: 'text', key: 'gstin' },
    {
      label: 'GST Certificate',
      value: customer?.gstCertificate?.url || '',
      type: 'link',
      linkLabel: customer?.gstCertificate?.name || 'View certificate',
      key: 'gstCertificate'
    },
    { label: 'Location', value: customer?.locationLink || '', type: 'link', linkLabel: 'Open in maps', key: 'locationLink' },
    {
      label: 'Salesman',
      value: customer?.assignedSalesman
        ? [customer.assignedSalesman.name, customer.assignedSalesman.phone].filter(Boolean).join(' · ')
        : '',
      type: 'text',
      key: 'assignedSalesman'
    },
    { label: 'Status', value: customer?.isBlocked ? 'Blocked' : 'Active', type: 'badge', key: 'status' },
    { label: 'Payment Rating', value: PAYMENT_LABELS[customer?.paymentRating] || PAYMENT_LABELS.good, type: 'text', key: 'paymentRating' },
    { label: 'Created At', value: customer?.createdAt, type: 'datetime', key: 'createdAt' },
    { label: 'Updated At', value: customer?.updatedAt, type: 'datetime', key: 'updatedAt' }
  ];

  const hasFilters = Boolean(searchTerm || statusFilter);

  const clearFilters = () => {
    setSearchTerm('');
    setQuery('');
    setStatusFilter('');
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="srf-toolbar">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, phone or GSTIN…"
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

        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value || 'all'}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
                className={`srf-chip ${statusFilter === filter.value ? 'srf-chip-active' : ''}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <SortSelect value={sortBy} onChange={setSortBy} options={NAME_SORT_OPTIONS} className="ml-auto min-w-0 flex-1 sm:max-w-[11rem] sm:flex-none" />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{pagination.total} customer{pagination.total === 1 ? '' : 's'}</span>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="flex items-center gap-1 font-medium hover:text-slate-600">
              <X className="h-3 w-3" />
              Clear filters
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
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Users className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No customers found</p>
            <p className="mt-1 text-xs text-slate-400">
              {hasFilters ? 'Nothing matches the current filters.' : 'Customers will show up here.'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {customers.map((customer) => (
                <CustomerRow key={customer._id} customer={customer} onOpen={setDetailCustomer} onToggleBlock={setBlockTarget} />
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

      {/* Full details, only once a customer is opened */}
      <DetailModal
        isOpen={Boolean(detailCustomer)}
        onClose={() => setDetailCustomer(null)}
        title={detailCustomer?.name || 'Customer'}
        fields={detailFields(detailCustomer)}
        actions={detailCustomer && (
          <>
            <CallButton phone={detailCustomer.phone} className="!h-9 !rounded-lg !px-3.5" />
            <BlockButton customer={detailCustomer} onClick={() => setBlockTarget(detailCustomer)} className="!h-9 !rounded-lg !px-3.5" />
          </>
        )}
      />

      <ConfirmModal
        isOpen={Boolean(blockTarget)}
        onClose={() => setBlockTarget(null)}
        onConfirm={handleToggleBlock}
        title={blockTarget?.isBlocked ? 'Unblock Customer' : 'Block Customer'}
        message={
          blockTarget?.isBlocked
            ? `${blockTarget?.name} will become selectable in the mobile app again.`
            : `${blockTarget?.name} will no longer be selectable in the mobile app.`
        }
        type={blockTarget?.isBlocked ? 'info' : 'warning'}
        confirmLabel={blockTarget?.isBlocked ? 'Unblock' : 'Block'}
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

export default CrmCustomers;
