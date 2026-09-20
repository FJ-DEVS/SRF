import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import DetailModal from '../components/DetailModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import SortSelect from '../components/SortSelect';
import { DEFAULT_SORT } from '../utils/sortOptions';
import { Search, Plus, Edit2, Trash2, X, Eye, EyeOff, Calculator, Phone } from 'lucide-react';

// Admin screen for the accounts-manager accounts — same workflow as Rollers
const AccountsUsers = () => {
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });
  const [selectedManager, setSelectedManager] = useState(null);
  const [detailManager, setDetailManager] = useState(null);
  const [formData, setFormData] = useState({ name: '', username: '', password: '', phone: '' });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchManagers();
  }, [searchTerm, sortBy, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, pageSize]);

  const fetchManagers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/accounts', {
        params: { search: searchTerm, sort: sortBy, page: currentPage, limit: pageSize }
      });
      if (response.data.success) {
        setManagers(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching accounts managers:', error);
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

  const handleViewDetail = (manager) => {
    setDetailManager(manager);
    setShowDetailModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedManager && !formData.password) {
      showAlert('Validation Error', 'A password is required for a new accounts manager.', 'warning');
      return;
    }

    try {
      if (selectedManager) {
        // An empty password field means "leave the current password alone"
        const payload = { ...formData };
        if (!payload.password) delete payload.password;

        const response = await api.put(`/accounts/${selectedManager._id}`, payload);
        if (response.data.success) {
          fetchManagers();
          handleCloseModal();
        }
      } else {
        const response = await api.post('/accounts', formData);
        if (response.data.success) {
          const username = formData.username;
          fetchManagers();
          handleCloseModal();
          showAlert('Accounts Manager Added', `${username} can now sign in at /accounts/login.`, 'success');
        }
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/accounts/${selectedManager._id}`);
      if (response.data.success) {
        setShowDeleteModal(false);
        setSelectedManager(null);
        fetchManagers();
      }
    } catch (error) {
      setShowDeleteModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleEdit = (manager) => {
    setSelectedManager(manager);
    setFormData({
      name: manager.name || '',
      username: manager.username,
      password: '',
      phone: manager.phone || ''
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedManager(null);
    setFormData({ name: '', username: '', password: '', phone: '' });
    setShowPassword(false);
  };

  const getDetailFields = (manager) => [
    { label: 'Name', value: manager?.name, type: 'text', key: 'name' },
    { label: 'Username', value: manager?.username, type: 'text', key: 'username' },
    { label: 'Password', value: manager?.plainPassword || '', type: 'password', key: 'password' },
    { label: 'Phone', value: manager?.phone, type: 'text', key: 'phone' },
    { label: 'Created At', value: manager?.createdAt, type: 'datetime', key: 'createdAt' },
    { label: 'Updated At', value: manager?.updatedAt, type: 'datetime', key: 'updatedAt' },
  ];

  const rowActions = (manager) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); handleViewDetail(manager); }}
        className="srf-row-action text-indigo-500 hover:bg-indigo-50"
        title="View Details"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleEdit(manager); }}
        className="srf-row-action text-slate-500 hover:bg-slate-100"
        title="Edit"
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setSelectedManager(manager); setShowDeleteModal(true); }}
        className="srf-row-action text-rose-500 hover:bg-rose-50"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <div className="srf-page">
      <PageHeader title="Accounts Users" subtitle="Accounts managers who queue orders for rolling, bill them and approve cancellations">
        <button onClick={() => setShowModal(true)} className="srf-btn srf-btn-primary">
          <Plus className="h-4 w-4" />
          Add Accounts Manager
        </button>
      </PageHeader>

      {/* Toolbar */}
      <div className="srf-toolbar sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, username or phone…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full !pl-9"
          />
        </div>
        <SortSelect value={sortBy} onChange={setSortBy} className="w-full sm:ml-auto sm:w-auto" />
      </div>

      {/* List */}
      <div className="srf-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : managers.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Calculator className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No accounts managers found</p>
            <p className="mt-1 text-xs text-slate-400">Try a different search, or add your first accounts manager.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Phone</th>
                    <th>Created</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {managers.map((manager) => (
                    <tr key={manager._id} className="cursor-pointer" onClick={() => handleViewDetail(manager)}>
                      <td className="font-semibold text-slate-900">{manager.name || '—'}</td>
                      <td>{manager.username}</td>
                      <td>{manager.phone || '—'}</td>
                      <td>{new Date(manager.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {rowActions(manager)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {managers.map((manager) => (
                <div key={manager._id} className="flex items-center justify-between gap-2 p-3.5" onClick={() => handleViewDetail(manager)}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{manager.name || manager.username}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">@{manager.username}</p>
                    {manager.phone && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                        <Phone className="h-3 w-3" />
                        {manager.phone}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {rowActions(manager)}
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
              <h3 className="srf-modal-title">{selectedManager ? 'Edit Accounts Manager' : 'Add Accounts Manager'}</h3>
              <button onClick={handleCloseModal} className="srf-icon-btn">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="srf-modal-body space-y-4">
              <div>
                <label className="mb-1.5 block">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full"
                  placeholder="Optional display name"
                />
              </div>
              <div>
                <label className="mb-1.5 block">Username</label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full"
                  placeholder="e.g. accounts1"
                />
              </div>
              <div>
                <label className="mb-1.5 block">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!selectedManager}
                    autoComplete="new-password"
                    minLength={6}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full !pr-11"
                    placeholder={selectedManager ? 'Leave blank to keep current' : 'Minimum 6 characters'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full"
                  placeholder="Optional"
                />
              </div>
            </form>

            <div className="srf-modal-footer">
              <button type="button" onClick={handleCloseModal} className="srf-btn srf-btn-secondary">Cancel</button>
              <button type="submit" onClick={handleSubmit} className="srf-btn srf-btn-primary">
                {selectedManager ? 'Save Changes' : 'Add Accounts Manager'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setDetailManager(null); }}
        title="Accounts Manager Details"
        fields={getDetailFields(detailManager)}
        onEdit={() => detailManager && handleEdit(detailManager)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedManager(null); }}
        onConfirm={handleDelete}
        title="Delete Accounts Manager"
        message={`${selectedManager?.name || selectedManager?.username || 'This accounts manager'} will be removed and signed out immediately. This action cannot be undone.`}
        type="danger"
        confirmLabel="Delete"
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

export default AccountsUsers;
