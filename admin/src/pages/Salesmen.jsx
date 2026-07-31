import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import DetailModal from '../components/DetailModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import SortSelect from '../components/SortSelect';
import { DEFAULT_SORT } from '../utils/sortOptions';
import { Search, Plus, Edit2, Trash2, X, Eye, EyeOff, Users, Phone } from 'lucide-react';

const Salesmen = () => {
  const [salesmen, setSalesmen] = useState([]);
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
  const [selectedSalesman, setSelectedSalesman] = useState(null);
  const [detailSalesman, setDetailSalesman] = useState(null);
  const [formData, setFormData] = useState({ name: '', username: '', password: '', phone: '' });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchSalesmen();
  }, [searchTerm, sortBy, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, pageSize]);

  const fetchSalesmen = async () => {
    try {
      setLoading(true);
      const response = await api.get('/salesman', {
        params: { search: searchTerm, sort: sortBy, page: currentPage, limit: pageSize }
      });
      if (response.data.success) {
        setSalesmen(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching salesmen:', error);
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

  const handleViewDetail = (salesman) => {
    setDetailSalesman(salesman);
    setShowDetailModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedSalesman) {
        const response = await api.put(`/salesman/${selectedSalesman._id}`, formData);
        if (response.data.success) {
          fetchSalesmen();
          handleCloseModal();
        }
      } else {
        const response = await api.post('/salesman', formData);
        if (response.data.success) {
          const name = formData.name;
          fetchSalesmen();
          handleCloseModal();
          showAlert('Salesman Added', `${name} has been added to your team.`, 'success');
        }
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/salesman/${selectedSalesman._id}`);
      if (response.data.success) {
        fetchSalesmen();
        setSelectedSalesman(null);
      }
    } catch (error) {
      setShowDeleteModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleEdit = (salesman) => {
    setSelectedSalesman(salesman);
    setFormData({ name: salesman.name, username: salesman.username, password: '', phone: salesman.phone });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedSalesman(null);
    setFormData({ name: '', username: '', password: '', phone: '' });
    setShowPassword(false);
  };

  const getDetailFields = (salesman) => [
    { label: 'Name', value: salesman?.name, type: 'text', key: 'name' },
    { label: 'Username', value: salesman?.username, type: 'text', key: 'username' },
    { label: 'Password', value: salesman?.plainPassword || '', type: 'password', key: 'password' },
    { label: 'Phone', value: salesman?.phone, type: 'text', key: 'phone' },
    { label: 'Created At', value: salesman?.createdAt, type: 'datetime', key: 'createdAt' },
    { label: 'Updated At', value: salesman?.updatedAt, type: 'datetime', key: 'updatedAt' },
  ];

  const rowActions = (salesman) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); handleViewDetail(salesman); }}
        className="srf-row-action text-indigo-500 hover:bg-indigo-50"
        title="View Details"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleEdit(salesman); }}
        className="srf-row-action text-slate-500 hover:bg-slate-100"
        title="Edit"
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setSelectedSalesman(salesman); setShowDeleteModal(true); }}
        className="srf-row-action text-rose-500 hover:bg-rose-50"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <div className="srf-page">
      <PageHeader title="Salesmen" subtitle="Manage your field sales team">
        <button onClick={() => setShowModal(true)} className="srf-btn srf-btn-primary">
          <Plus className="h-4 w-4" />
          Add Salesman
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
        ) : salesmen.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Users className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No salesmen found</p>
            <p className="mt-1 text-xs text-slate-400">Try a different search, or add your first salesman.</p>
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
                  {salesmen.map((salesman) => (
                    <tr key={salesman._id} className="cursor-pointer" onClick={() => handleViewDetail(salesman)}>
                      <td className="font-semibold text-slate-900">{salesman.name}</td>
                      <td>{salesman.username}</td>
                      <td>{salesman.phone}</td>
                      <td>{new Date(salesman.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {rowActions(salesman)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {salesmen.map((salesman) => (
                <div key={salesman._id} className="p-3.5" onClick={() => handleViewDetail(salesman)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{salesman.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">@{salesman.username}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                        <Phone className="h-3 w-3" /> {salesman.phone}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      {rowActions(salesman)}
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

      {/* Detail Modal */}
      <DetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setDetailSalesman(null); }}
        title="Salesman Details"
        fields={getDetailFields(detailSalesman)}
        onEdit={() => detailSalesman && handleEdit(detailSalesman)}
      />

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="srf-modal-backdrop" onClick={handleCloseModal}>
          <div className="srf-modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="srf-modal-header">
              <h3 className="srf-modal-title">{selectedSalesman ? 'Edit Salesman' : 'Add Salesman'}</h3>
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
                <label className="mb-1.5 block">Username</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1.5 block">
                  Password {selectedSalesman && <span className="font-normal text-slate-400">(leave blank to keep current)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!selectedSalesman}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full !pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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
            </form>
            <div className="srf-modal-footer">
              <button type="button" onClick={handleCloseModal} className="srf-btn srf-btn-secondary">Cancel</button>
              <button type="submit" onClick={handleSubmit} className="srf-btn srf-btn-primary">
                {selectedSalesman ? 'Save Changes' : 'Add Salesman'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedSalesman(null); }}
        onConfirm={handleDelete}
        title="Delete Salesman"
        message={`${selectedSalesman?.name} will be permanently removed. This action cannot be undone.`}
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

export default Salesmen;
