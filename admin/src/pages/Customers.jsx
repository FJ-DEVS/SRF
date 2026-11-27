import React, { useEffect, useRef, useState } from 'react';
import api, { fetchAll } from '../utils/api';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import DetailModal from '../components/DetailModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import SortSelect from '../components/SortSelect';
import FilterPanel from '../components/FilterPanel';
import PermissionsModal from '../components/PermissionsModal';
import { DEFAULT_SORT } from '../utils/sortOptions';
import {
  Search, Plus, Edit2, Trash2, X, Eye, EyeOff, ShieldOff, ShieldCheck, UserCircle, Phone,
  Upload, FileText, MapPin, KeyRound, Smartphone
} from 'lucide-react';

// Marks a customer whose shop can sign into the mobile app, with how many logins
const AppLoginBadge = ({ count }) => (
  <span
    className="srf-badge shrink-0 bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200"
    title={`${count} app login${count === 1 ? '' : 's'}`}
  >
    <Smartphone className="h-3 w-3" />
    App{count > 1 && ` · ${count}`}
  </span>
);

// One app login row in the form. `key` only tells rows apart while editing;
// `_id` marks a login that already exists (its password may be left blank).
let loginKey = 0;
const blankLogin = () => ({ key: `new-${++loginKey}`, name: '', username: '', password: '' });
const loginsOf = (customer) =>
  (customer?.appUsers || []).map((u) => ({ key: u._id, _id: u._id, name: u.name || '', username: u.username, password: '' }));

const emptyForm = () => ({
  name: '',
  phone: '',
  gstin: '',
  isBlocked: false,
  paymentRating: 'good',
  assignedSalesman: '',
  gstCertificate: { url: '', key: '', name: '' },
  locationLink: '',
  appUsers: []
});

const PAYMENT_RATING = {
  good:    { label: 'Good Payer',    bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', dot: 'bg-emerald-500' },
  average: { label: 'Average Payer', bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200',   dot: 'bg-amber-500' },
  bad:     { label: 'Poor Payer',    bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-200',    dot: 'bg-rose-500' },
};

const PaymentBadge = ({ rating }) => {
  const cfg = PAYMENT_RATING[rating] || PAYMENT_RATING.good;
  return (
    <span className={`srf-badge ring-1 ring-inset ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBlocked, setFilterBlocked] = useState('');
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  const [filterPayment, setFilterPayment] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockTarget, setBlockTarget] = useState(null);
  const [detailCustomer, setDetailCustomer] = useState(null);
  const [salesmen, setSalesmen] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  // Keys of the login rows whose password is shown in clear
  const [visiblePasswords, setVisiblePasswords] = useState(() => new Set());
  const certInputRef = useRef(null);
  const [certUploading, setCertUploading] = useState(false);
  // Permission manager: the customer being edited and the categories and cargos to
  // choose from (loaded fresh each time it opens)
  const [permTarget, setPermTarget] = useState(null);
  const [permOptions, setPermOptions] = useState(null);

  useEffect(() => {
    fetchCustomers();
  }, [searchTerm, filterBlocked, filterPayment, sortBy, currentPage, pageSize]);

  useEffect(() => {
    if (showModal) fetchSalesmen();
  }, [showModal]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterBlocked, filterPayment, sortBy, pageSize]);

  const fetchSalesmen = async () => {
    try {
      const response = await api.get('/salesman', { params: { limit: 200 } });
      if (response.data.success) setSalesmen(response.data.data);
    } catch (error) {
      console.error('Error fetching salesmen:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = { search: searchTerm, sort: sortBy, page: currentPage, limit: pageSize };
      if (filterBlocked !== '') params.isBlocked = filterBlocked;
      if (filterPayment !== '') params.paymentRating = filterPayment;
      const response = await api.get('/customers', { params });
      if (response.data.success) {
        setCustomers(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showAlert = (title, message, type = 'error') => {
    setAlertConfig({ title, message, type });
    setShowAlertModal(true);
  };

  const updateLogin = (key, changes) =>
    setFormData((prev) => ({
      ...prev,
      appUsers: prev.appUsers.map((u) => (u.key === key ? { ...u, ...changes } : u))
    }));

  const addLogin = () =>
    setFormData((prev) => ({ ...prev, appUsers: [...prev.appUsers, blankLogin()] }));

  const removeLogin = (key) =>
    setFormData((prev) => ({ ...prev, appUsers: prev.appUsers.filter((u) => u.key !== key) }));

  const togglePasswordVisible = (key) =>
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleSubmit = async (e) => {
    e.preventDefault();

    // The row keys stay in the browser; only the login fields go to the server
    const payload = {
      ...formData,
      appUsers: formData.appUsers.map(({ _id, name, username, password }) => ({ _id, name, username, password }))
    };

    try {
      if (selectedCustomer) {
        const removed = loginsOf(selectedCustomer).filter(
          (u) => !formData.appUsers.some((row) => row._id === u._id)
        );
        const response = await api.put(`/customers/${selectedCustomer._id}`, payload);
        if (response.data.success) {
          fetchCustomers();
          handleCloseModal();
          if (removed.length) {
            showAlert(
              'Logins Removed',
              `${removed.map((u) => u.name || u.username).join(', ')} can no longer sign in to the app.`,
              'success'
            );
          }
        }
      } else {
        const response = await api.post('/customers', payload);
        if (response.data.success) {
          const name = formData.name;
          fetchCustomers();
          handleCloseModal();
          showAlert('Customer Added', `${name} has been added successfully.`, 'success');
        }
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/customers/${selectedCustomer._id}`);
      if (response.data.success) {
        fetchCustomers();
        setSelectedCustomer(null);
      }
    } catch (error) {
      setShowDeleteModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleEdit = (customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      gstin: customer.gstin || '',
      isBlocked: customer.isBlocked,
      paymentRating: customer.paymentRating || 'good',
      assignedSalesman: customer.assignedSalesman?._id || customer.assignedSalesman || '',
      gstCertificate: {
        url: customer.gstCertificate?.url || '',
        key: customer.gstCertificate?.key || '',
        name: customer.gstCertificate?.name || ''
      },
      locationLink: customer.locationLink || '',
      appUsers: loginsOf(customer)
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedCustomer(null);
    setVisiblePasswords(new Set());
    setFormData(emptyForm());
  };

  // The certificate lands on DigitalOcean Spaces first; the customer record
  // only ever stores the returned link
  const handleCertificateUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const payload = new FormData();
    payload.append('file', file);
    payload.append('folder', 'gst-certificates');

    setCertUploading(true);
    try {
      const response = await api.post('/uploads', payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (response.data.success) {
        setFormData((prev) => ({ ...prev, gstCertificate: response.data.data }));
      }
    } catch (error) {
      showAlert('Upload Failed', error.response?.data?.message || 'Could not upload the certificate', 'error');
    } finally {
      setCertUploading(false);
    }
  };

  const handleRemoveCertificate = () =>
    setFormData((prev) => ({ ...prev, gstCertificate: { url: '', key: '', name: '' } }));

  const handleViewDetail = (customer) => {
    setDetailCustomer(customer);
    setShowDetailModal(true);
  };

  const confirmToggleBlock = (customer) => {
    setBlockTarget(customer);
    setShowBlockModal(true);
  };

  const handleToggleBlock = async () => {
    if (!blockTarget) return;
    try {
      const response = await api.put(`/customers/${blockTarget._id}`, {
        isBlocked: !blockTarget.isBlocked,
      });
      if (response.data.success) {
        fetchCustomers();
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    } finally {
      setBlockTarget(null);
    }
  };

  const openPermissions = async (customer) => {
    setPermTarget(customer);
    setPermOptions(null);
    try {
      const [categoriesRes, cargos] = await Promise.all([
        api.get('/categories'),
        fetchAll('/cargo', { sort: 'name_asc' })
      ]);
      setPermOptions({
        categories: (categoriesRes.data.data || []).map((c) => ({ value: c._id, label: c.name })),
        cargos: cargos.map((c) => ({ value: c._id, label: c.name }))
      });
    } catch (error) {
      setPermTarget(null);
      showAlert('Error', error.response?.data?.message || 'Could not load the categories and cargos', 'error');
    }
  };

  const savePermissions = async (values) => {
    try {
      const response = await api.put(`/customers/${permTarget._id}/permissions`, values);
      if (response.data.success) {
        const name = permTarget.name;
        setPermTarget(null);
        fetchCustomers();
        showAlert('Permissions Saved', `${name}'s item categories and cargos have been updated.`, 'success');
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Could not save the permissions', 'error');
    }
  };

  const getDetailFields = (customer) => [
    { label: 'Name', value: customer?.name, type: 'text', key: 'name' },
    { label: 'Phone', value: customer?.phone, type: 'text', key: 'phone' },
    { label: 'GSTIN', value: customer?.gstin || '—', type: 'text', key: 'gstin' },
    {
      label: 'GST Certificate',
      value: customer?.gstCertificate?.url || '',
      type: 'link',
      linkLabel: customer?.gstCertificate?.name || 'View certificate',
      key: 'gstCertificate'
    },
    { label: 'Location', value: customer?.locationLink || '', type: 'link', linkLabel: 'Open in maps', key: 'locationLink' },
    { label: 'Assigned Salesman', value: customer?.assignedSalesman?.name || '—', type: 'text', key: 'assignedSalesman' },
    ...(customer?.appUsers?.length
      ? customer.appUsers.flatMap((u, i) => [
        {
          label: `App Login ${i + 1}`,
          value: u.name ? `${u.name} — ${u.username}` : u.username,
          type: 'text',
          key: `login-${u._id}`
        },
        { label: `Password ${i + 1}`, value: u.plainPassword || '', type: 'password', key: `password-${u._id}` }
      ])
      : [{ label: 'App Login', value: 'No app login', type: 'text', key: 'login' }]),
    { label: 'Status', value: customer?.isBlocked ? 'Blocked' : 'Active', type: 'badge', key: 'status' },
    { label: 'Payment Rating', value: PAYMENT_RATING[customer?.paymentRating]?.label || 'Good Payer', type: 'text', key: 'paymentRating' },
    { label: 'Created At', value: customer?.createdAt, type: 'datetime', key: 'createdAt' },
    { label: 'Updated At', value: customer?.updatedAt, type: 'datetime', key: 'updatedAt' },
  ];

  const rowActions = (customer) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); handleViewDetail(customer); }}
        className="srf-row-action text-indigo-500 hover:bg-indigo-50"
        title="View Details"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); confirmToggleBlock(customer); }}
        className={`srf-row-action ${customer.isBlocked ? 'text-emerald-500 hover:bg-emerald-50' : 'text-amber-500 hover:bg-amber-50'}`}
        title={customer.isBlocked ? 'Unblock Customer' : 'Block Customer'}
      >
        {customer.isBlocked ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); openPermissions(customer); }}
        className="srf-row-action text-emerald-600 hover:bg-emerald-50"
        title="Manage Permissions"
      >
        <KeyRound className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleEdit(customer); }}
        className="srf-row-action text-slate-500 hover:bg-slate-100"
        title="Edit"
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setSelectedCustomer(customer); setShowDeleteModal(true); }}
        className="srf-row-action text-rose-500 hover:bg-rose-50"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <div className="srf-page">
      <PageHeader title="Customers" subtitle="Your buyers and their payment standing">
        <button onClick={() => setShowModal(true)} className="srf-btn srf-btn-primary">
          <Plus className="h-4 w-4" />
          Add Customer
        </button>
      </PageHeader>

      {/* Toolbar */}
      <FilterPanel active={[searchTerm, filterBlocked, filterPayment]}>
        <div className="srf-toolbar sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, phone or GSTIN…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full !pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:ml-auto sm:flex">
            <select value={filterBlocked} onChange={(e) => setFilterBlocked(e.target.value)}>
              <option value="">All statuses</option>
              <option value="false">Active only</option>
              <option value="true">Blocked only</option>
            </select>
            <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}>
              <option value="">All payers</option>
              <option value="good">Good payer</option>
              <option value="average">Average payer</option>
              <option value="bad">Poor payer</option>
            </select>
            <SortSelect value={sortBy} onChange={setSortBy} className="col-span-2 sm:col-span-1" />
          </div>
        </div>
      </FilterPanel>

      {/* List */}
      <div className="srf-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <UserCircle className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No customers found</p>
            <p className="mt-1 text-xs text-slate-400">Adjust the filters, or add a new customer.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Salesman</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer._id} className="cursor-pointer" onClick={() => handleViewDetail(customer)}>
                      <td className="max-w-[260px]">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-semibold text-slate-900">{customer.name}</p>
                          {customer.appUsers?.length > 0 && <AppLoginBadge count={customer.appUsers.length} />}
                        </div>
                        {customer.gstin &&<p className="truncate text-[11px] text-slate-400">GSTIN: {customer.gstin}</p>}
                        <div className="mt-0.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {customer.gstCertificate?.url && (
                            <a
                              href={customer.gstCertificate.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
                            >
                              <FileText className="h-3 w-3" /> Certificate
                            </a>
                          )}
                          {customer.locationLink && (
                            <a
                              href={customer.locationLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
                            >
                              <MapPin className="h-3 w-3" /> Location
                            </a>
                          )}
                        </div>
                      </td>
                      <td>{customer.phone}</td>
                      <td>{customer.assignedSalesman?.name || '—'}</td>
                      <td><PaymentBadge rating={customer.paymentRating || 'good'} /></td>
                      <td>
                        <span className={`srf-badge ring-1 ring-inset ${
                          customer.isBlocked
                            ? 'bg-rose-50 text-rose-700 ring-rose-200'
                            : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        }`}>
                          {customer.isBlocked ? 'Blocked' : 'Active'}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {rowActions(customer)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 lg:hidden">
              {customers.map((customer) => (
                <div key={customer._id} className="p-3.5" onClick={() => handleViewDetail(customer)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{customer.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                        <Phone className="h-3 w-3" /> {customer.phone}
                        {customer.assignedSalesman?.name && <span className="text-slate-300">· {customer.assignedSalesman.name}</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {customer.appUsers?.length > 0 && <AppLoginBadge count={customer.appUsers.length} />}
                      {customer.isBlocked && (
                        <span className="srf-badge shrink-0 bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">Blocked</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <PaymentBadge rating={customer.paymentRating || 'good'} />
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      {rowActions(customer)}
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
          <div className="srf-modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="srf-modal-header">
              <h3 className="srf-modal-title">{selectedCustomer ? 'Edit Customer' : 'Add Customer'}</h3>
              <button onClick={handleCloseModal} className="srf-icon-btn">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="srf-modal-body space-y-4">
              <div>
                <label className="mb-1.5 block">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="mb-1.5 block">Phone</label>
                <input
                  type="text"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="mb-1.5 block">GSTIN <span className="font-normal text-slate-400">(optional)</span></label>
                <input
                  type="text"
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="mb-1.5 block">
                  GST Certificate <span className="font-normal text-slate-400">(optional)</span>
                </label>
                {formData.gstCertificate.url ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                    <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
                    <a
                      href={formData.gstCertificate.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-[13px] font-medium text-indigo-600 hover:underline"
                    >
                      {formData.gstCertificate.name || 'View certificate'}
                    </a>
                    <button
                      type="button"
                      onClick={handleRemoveCertificate}
                      className="srf-row-action shrink-0 text-rose-500 hover:bg-rose-50"
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => certInputRef.current?.click()}
                    disabled={certUploading}
                    className="srf-btn srf-btn-secondary w-full !justify-center"
                  >
                    <Upload className="h-4 w-4 text-slate-400" />
                    {certUploading ? 'Uploading…' : 'Upload certificate'}
                  </button>
                )}
                <input
                  ref={certInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                  onChange={handleCertificateUpload}
                  className="hidden"
                />
                <p className="mt-1 text-[11px] text-slate-400">PDF or image, up to 10 MB.</p>
              </div>

              <div>
                <label className="mb-1.5 block">
                  Location Link <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="url"
                  value={formData.locationLink}
                  onChange={(e) => setFormData({ ...formData, locationLink: e.target.value })}
                  className="w-full"
                  placeholder="https://maps.google.com/…"
                />
              </div>

              <div>
                <label className="mb-1.5 block">Payment Rating</label>
                <select
                  value={formData.paymentRating}
                  onChange={(e) => setFormData({ ...formData, paymentRating: e.target.value })}
                  className="w-full"
                >
                  <option value="good">Good Payer</option>
                  <option value="average">Average Payer</option>
                  <option value="bad">Poor Payer</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block">Assign Salesman <span className="font-normal text-slate-400">(optional)</span></label>
                <select
                  value={formData.assignedSalesman}
                  onChange={(e) => setFormData({ ...formData, assignedSalesman: e.target.value })}
                  className="w-full"
                >
                  <option value="">— No Salesman —</option>
                  {salesmen.map((s) => (
                    <option key={s._id} value={s._id}>{s.name} ({s.username})</option>
                  ))}
                </select>
              </div>

              {/* App logins — one per salesman at the customer's shop, each
                  signing into the mobile app to place the shop's orders */}
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                    <Smartphone className="h-4 w-4 text-sky-600" />
                    App Logins <span className="font-normal text-slate-400">(optional)</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Give each salesman at the customer’s shop their own username and password to order
                    from the mobile app. Their name is shown as “Order by” on the orders they place.
                  </p>
                </div>

                {formData.appUsers.map((login, index) => {
                  const shown = visiblePasswords.has(login.key);
                  return (
                    <div key={login.key} className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                          Login {index + 1}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeLogin(login.key)}
                          className="srf-row-action text-rose-500 hover:bg-rose-50"
                          title={login._id ? 'Remove this login (signs them out of the app)' : 'Remove'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div>
                        <label className="mb-1.5 block">Salesman Name</label>
                        <input
                          type="text"
                          value={login.name}
                          onChange={(e) => updateLogin(login.key, { name: e.target.value })}
                          className="w-full"
                          placeholder="The salesman at the customer's shop"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block">Username</label>
                          <input
                            type="text"
                            autoComplete="off"
                            autoCapitalize="none"
                            value={login.username}
                            onChange={(e) => updateLogin(login.key, { username: e.target.value })}
                            className="w-full"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block">
                            Password {login._id && <span className="font-normal text-slate-400">(blank keeps it)</span>}
                          </label>
                          <div className="relative">
                            <input
                              type={shown ? 'text' : 'password'}
                              autoComplete="new-password"
                              minLength={6}
                              value={login.password}
                              onChange={(e) => updateLogin(login.key, { password: e.target.value })}
                              className="w-full !pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => togglePasswordVisible(login.key)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                              tabIndex={-1}
                              title={shown ? 'Hide password' : 'Show password'}
                            >
                              {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addLogin}
                  className="srf-btn srf-btn-secondary w-full !justify-center"
                >
                  <Plus className="h-4 w-4 text-slate-400" />
                  {formData.appUsers.length ? 'Add another login' : 'Add app login'}
                </button>
              </div>

              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={formData.isBlocked}
                  onChange={(e) => setFormData({ ...formData, isBlocked: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-[13px] font-medium text-slate-700">Block this customer</span>
              </label>
            </form>

            <div className="srf-modal-footer">
              <button type="button" onClick={handleCloseModal} className="srf-btn srf-btn-secondary">Cancel</button>
              <button type="submit" onClick={handleSubmit} className="srf-btn srf-btn-primary">
                {selectedCustomer ? 'Save Changes' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setDetailCustomer(null); }}
        title="Customer Details"
        fields={getDetailFields(detailCustomer)}
        onEdit={() => detailCustomer && handleEdit(detailCustomer)}
      />

      {/* Permission manager */}
      {permTarget && (
        <PermissionsModal
          key={permTarget._id}
          title={`${permTarget.name} — Permissions`}
          subtitle="Which item categories this customer can order, and which cargos they can use when ordering in the app"
          loading={!permOptions}
          sections={[
            {
              key: 'allowedCategories',
              label: 'Item Categories',
              allLabel: 'All categories',
              emptyWarning: 'No categories ticked — this customer cannot order any item in the app.',
              options: permOptions?.categories || [],
              value: permTarget.allowedCategories
            },
            {
              key: 'allowedCargos',
              label: 'Cargos',
              allLabel: 'All cargos',
              emptyWarning: 'No cargos ticked — this customer can only place orders without a cargo.',
              options: permOptions?.cargos || [],
              value: permTarget.allowedCargos
            }
          ]}
          onClose={() => setPermTarget(null)}
          onSave={savePermissions}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedCustomer(null); }}
        onConfirm={handleDelete}
        title="Delete Customer"
        message={`${selectedCustomer?.name} will be permanently removed. This action cannot be undone.`}
        type="danger"
        confirmLabel="Delete"
      />

      {/* Block / Unblock Confirmation Modal */}
      <ConfirmModal
        isOpen={showBlockModal}
        onClose={() => { setShowBlockModal(false); setBlockTarget(null); }}
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

export default Customers;
