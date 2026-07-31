import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import DetailModal from '../components/DetailModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import SortSelect from '../components/SortSelect';
import { DEFAULT_SORT } from '../utils/sortOptions';
import { Search, Plus, Edit2, Trash2, X, Eye, Truck } from 'lucide-react';

const Cargo = () => {
  const [cargo, setCargo] = useState([]);
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
  const [selectedCargo, setSelectedCargo] = useState(null);
  const [detailCargo, setDetailCargo] = useState(null);
  const [formData, setFormData] = useState({ name: '' });

  useEffect(() => {
    fetchCargo();
  }, [searchTerm, sortBy, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, pageSize]);

  const fetchCargo = async () => {
    try {
      setLoading(true);
      const response = await api.get('/cargo', {
        params: {
          search: searchTerm,
          sort: sortBy,
          page: currentPage,
          limit: pageSize
        }
      });
      if (response.data.success) {
        setCargo(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching cargo:', error);
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (selectedCargo) {
        const response = await api.put(`/cargo/${selectedCargo._id}`, formData);
        if (response.data.success) {
          fetchCargo();
          handleCloseModal();
        }
      } else {
        const response = await api.post('/cargo', formData);
        if (response.data.success) {
          const name = formData.name;
          fetchCargo();
          handleCloseModal();
          showAlert('Cargo Added', `${name} has been added successfully.`, 'success');
        }
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/cargo/${selectedCargo._id}`);
      if (response.data.success) {
        fetchCargo();
        setSelectedCargo(null);
      }
    } catch (error) {
      setShowDeleteModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleEdit = (cargoItem) => {
    setSelectedCargo(cargoItem);
    setFormData({ name: cargoItem.name });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedCargo(null);
    setFormData({ name: '' });
  };

  const handleViewDetail = (cargoItem) => {
    setDetailCargo(cargoItem);
    setShowDetailModal(true);
  };

  const getDetailFields = (cargoItem) => [
    { label: 'Name', value: cargoItem?.name, type: 'text', key: 'name' },
    { label: 'Created At', value: cargoItem?.createdAt, type: 'datetime', key: 'createdAt' },
    { label: 'Updated At', value: cargoItem?.updatedAt, type: 'datetime', key: 'updatedAt' },
  ];

  const rowActions = (cargoItem) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); handleViewDetail(cargoItem); }}
        className="srf-row-action text-indigo-500 hover:bg-indigo-50"
        title="View Details"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleEdit(cargoItem); }}
        className="srf-row-action text-slate-500 hover:bg-slate-100"
        title="Edit"
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setSelectedCargo(cargoItem); setShowDeleteModal(true); }}
        className="srf-row-action text-rose-500 hover:bg-rose-50"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <div className="srf-page">
      <PageHeader title="Cargo" subtitle="Transport partners for order delivery">
        <button onClick={() => setShowModal(true)} className="srf-btn srf-btn-primary">
          <Plus className="h-4 w-4" />
          Add Cargo
        </button>
      </PageHeader>

      {/* Toolbar */}
      <div className="srf-toolbar sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name…"
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
        ) : cargo.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Truck className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No cargo services found</p>
            <p className="mt-1 text-xs text-slate-400">Try a different search, or add a cargo service.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Created</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cargo.map((cargoItem) => (
                    <tr key={cargoItem._id} className="cursor-pointer" onClick={() => handleViewDetail(cargoItem)}>
                      <td className="font-semibold text-slate-900">{cargoItem.name}</td>
                      <td>{new Date(cargoItem.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {rowActions(cargoItem)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {cargo.map((cargoItem) => (
                <div key={cargoItem._id} className="flex items-center justify-between gap-2 p-3.5" onClick={() => handleViewDetail(cargoItem)}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{cargoItem.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Added {new Date(cargoItem.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {rowActions(cargoItem)}
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
              <h3 className="srf-modal-title">{selectedCargo ? 'Edit Cargo' : 'Add Cargo'}</h3>
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
                  placeholder="e.g. SS Cargo"
                />
              </div>
            </form>

            <div className="srf-modal-footer">
              <button type="button" onClick={handleCloseModal} className="srf-btn srf-btn-secondary">Cancel</button>
              <button type="submit" onClick={handleSubmit} className="srf-btn srf-btn-primary">
                {selectedCargo ? 'Save Changes' : 'Add Cargo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setDetailCargo(null); }}
        title="Cargo Details"
        fields={getDetailFields(detailCargo)}
        onEdit={() => detailCargo && handleEdit(detailCargo)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedCargo(null); }}
        onConfirm={handleDelete}
        title="Delete Cargo"
        message={`${selectedCargo?.name} will be permanently removed. This action cannot be undone.`}
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

export default Cargo;
