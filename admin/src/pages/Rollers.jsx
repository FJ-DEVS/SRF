import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import DetailModal from '../components/DetailModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import SortSelect from '../components/SortSelect';
import { DEFAULT_SORT } from '../utils/sortOptions';
import { Search, Plus, Edit2, Trash2, X, Eye, EyeOff, Disc3, Phone } from 'lucide-react';

const Rollers = () => {
  const [rollers, setRollers] = useState([]);
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
  const [selectedRoller, setSelectedRoller] = useState(null);
  const [detailRoller, setDetailRoller] = useState(null);
  const [formData, setFormData] = useState({ name: '', username: '', password: '', phone: '' });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchRollers();
  }, [searchTerm, sortBy, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, pageSize]);

  const fetchRollers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/rollers', {
        params: { search: searchTerm, sort: sortBy, page: currentPage, limit: pageSize }
      });
      if (response.data.success) {
        setRollers(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching rollers:', error);
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

  const handleViewDetail = (roller) => {
    setDetailRoller(roller);
    setShowDetailModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedRoller && !formData.password) {
      showAlert('Validation Error', 'A password is required for a new roller.', 'warning');
      return;
    }

    try {
      if (selectedRoller) {
        // An empty password field means "leave the current password alone"
        const payload = { ...formData };
        if (!payload.password) delete payload.password;

        const response = await api.put(`/rollers/${selectedRoller._id}`, payload);
        if (response.data.success) {
          fetchRollers();
          handleCloseModal();
        }
      } else {
        const response = await api.post('/rollers', formData);
        if (response.data.success) {
          const username = formData.username;
          fetchRollers();
          handleCloseModal();
          showAlert('Roller Added', `${username} can now sign in at /roller/login.`, 'success');
        }
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/rollers/${selectedRoller._id}`);
      if (response.data.success) {
        setShowDeleteModal(false);
        setSelectedRoller(null);
        fetchRollers();
      }
    } catch (error) {
      setShowDeleteModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleEdit = (roller) => {
    setSelectedRoller(roller);
    setFormData({
      name: roller.name || '',
      username: roller.username,
      password: '',
      phone: roller.phone || ''
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedRoller(null);
    setFormData({ name: '', username: '', password: '', phone: '' });
    setShowPassword(false);
  };

  const getDetailFields = (roller) => [
    { label: 'Name', value: roller?.name, type: 'text', key: 'name' },
    { label: 'Username', value: roller?.username, type: 'text', key: 'username' },
    { label: 'Password', value: roller?.plainPassword || '', type: 'password', key: 'password' },
    { label: 'Phone', value: roller?.phone, type: 'text', key: 'phone' },
    { label: 'Created At', value: roller?.createdAt, type: 'datetime', key: 'createdAt' },
    { label: 'Updated At', value: roller?.updatedAt, type: 'datetime', key: 'updatedAt' },
  ];

  const rowActions = (roller) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); handleViewDetail(roller); }}
        className="srf-row-action text-indigo-500 hover:bg-indigo-50"
        title="View Details"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleEdit(roller); }}
        className="srf-row-action text-slate-500 hover:bg-slate-100"
        title="Edit"
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setSelectedRoller(roller); setShowDeleteModal(true); }}
        className="srf-row-action text-rose-500 hover:bg-rose-50"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <div className="srf-page">
      <PageHeader title="Rollers" subtitle="Floor staff who roll orders and place items into raks">
        <button onClick={() => setShowModal(true)} className="srf-btn srf-btn-primary">
          <Plus className="h-4 w-4" />
          Add Roller
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
        ) : rollers.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Disc3 className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No rollers found</p>
            <p className="mt-1 text-xs text-slate-400">Try a different search, or add your first roller.</p>
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
                  {rollers.map((roller) => (
                    <tr key={roller._id} className="cursor-pointer" onClick={() => handleViewDetail(roller)}>
                      <td className="font-semibold text-slate-900">{roller.name || '—'}</td>
                      <td>{roller.username}</td>
                      <td>{roller.phone || '—'}</td>
                      <td>{new Date(roller.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {rowActions(roller)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {rollers.map((roller) => (
                <div key={roller._id} className="flex items-center justify-between gap-2 p-3.5" onClick={() => handleViewDetail(roller)}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{roller.name || roller.username}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">@{roller.username}</p>
                    {roller.phone && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                        <Phone className="h-3 w-3" />
                        {roller.phone}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {rowActions(roller)}
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
              <h3 className="srf-modal-title">{selectedRoller ? 'Edit Roller' : 'Add Roller'}</h3>
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
                  placeholder="e.g. roller1"
                />
              </div>
              <div>
                <label className="mb-1.5 block">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!selectedRoller}
                    autoComplete="new-password"
                    minLength={6}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full !pr-11"
                    placeholder={selectedRoller ? 'Leave blank to keep current' : 'Minimum 6 characters'}
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
                {selectedRoller ? 'Save Changes' : 'Add Roller'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setDetailRoller(null); }}
        title="Roller Details"
        fields={getDetailFields(detailRoller)}
        onEdit={() => detailRoller && handleEdit(detailRoller)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedRoller(null); }}
        onConfirm={handleDelete}
        title="Delete Roller"
        message={`${selectedRoller?.name || selectedRoller?.username || 'This roller'} will be removed and signed out of the app immediately. This action cannot be undone.`}
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

export default Rollers;
