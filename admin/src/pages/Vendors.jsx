import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import DetailModal from '../components/DetailModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import SortSelect from '../components/SortSelect';
import { DEFAULT_SORT } from '../utils/sortOptions';
import { Search, Plus, Edit2, Trash2, X, Eye, Building2, Phone } from 'lucide-react';

const Vendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBlocked, setFilterBlocked] = useState('');
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [detailVendor, setDetailVendor] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    gstin: '',
    isBlocked: false
  });

  useEffect(() => {
    fetchVendors();
  }, [searchTerm, filterBlocked, sortBy, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterBlocked, sortBy, pageSize]);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const response = await api.get('/vendors', {
        params: {
          search: searchTerm,
          isBlocked: filterBlocked,
          sort: sortBy,
          page: currentPage,
          limit: pageSize
        }
      });
      if (response.data.success) {
        setVendors(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching vendors:', error);
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
      if (selectedVendor) {
        const response = await api.put(`/vendors/${selectedVendor._id}`, formData);
        if (response.data.success) {
          fetchVendors();
          handleCloseModal();
        }
      } else {
        const response = await api.post('/vendors', formData);
        if (response.data.success) {
          const name = formData.name;
          fetchVendors();
          handleCloseModal();
          showAlert('Vendor Added', `${name} has been added successfully.`, 'success');
        }
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/vendors/${selectedVendor._id}`);
      if (response.data.success) {
        fetchVendors();
        setSelectedVendor(null);
      }
    } catch (error) {
      setShowDeleteModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleEdit = (vendor) => {
    setSelectedVendor(vendor);
    setFormData({
      name: vendor.name,
      phone: vendor.phone,
      gstin: vendor.gstin || '',
      isBlocked: vendor.isBlocked
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedVendor(null);
    setFormData({ name: '', phone: '', gstin: '', isBlocked: false });
  };

  const handleViewDetail = (vendor) => {
    setDetailVendor(vendor);
    setShowDetailModal(true);
  };

  const getDetailFields = (vendor) => [
    { label: 'Name', value: vendor?.name, type: 'text', key: 'name' },
    { label: 'Phone', value: vendor?.phone, type: 'text', key: 'phone' },
    { label: 'GSTIN', value: vendor?.gstin || '—', type: 'text', key: 'gstin' },
    { label: 'Status', value: vendor?.isBlocked ? 'Blocked' : 'Active', type: 'badge', key: 'status' },
    { label: 'Created At', value: vendor?.createdAt, type: 'datetime', key: 'createdAt' },
    { label: 'Updated At', value: vendor?.updatedAt, type: 'datetime', key: 'updatedAt' },
  ];

  const rowActions = (vendor) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); handleViewDetail(vendor); }}
        className="srf-row-action text-indigo-500 hover:bg-indigo-50"
        title="View Details"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleEdit(vendor); }}
        className="srf-row-action text-slate-500 hover:bg-slate-100"
        title="Edit"
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setSelectedVendor(vendor); setShowDeleteModal(true); }}
        className="srf-row-action text-rose-500 hover:bg-rose-50"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <div className="srf-page">
      <PageHeader title="Vendors" subtitle="Suppliers you purchase stock from">
        <button onClick={() => setShowModal(true)} className="srf-btn srf-btn-primary">
          <Plus className="h-4 w-4" />
          Add Vendor
        </button>
      </PageHeader>

      {/* Toolbar */}
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
            <option value="">All vendors</option>
            <option value="false">Active only</option>
            <option value="true">Blocked only</option>
          </select>
          <SortSelect value={sortBy} onChange={setSortBy} />
        </div>
      </div>

      {/* List */}
      <div className="srf-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : vendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Building2 className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No vendors found</p>
            <p className="mt-1 text-xs text-slate-400">Adjust the filters, or add a new vendor.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>GSTIN</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((vendor) => (
                    <tr key={vendor._id} className="cursor-pointer" onClick={() => handleViewDetail(vendor)}>
                      <td className="max-w-[280px] truncate font-semibold text-slate-900">{vendor.name}</td>
                      <td>{vendor.phone}</td>
                      <td>{vendor.gstin || '—'}</td>
                      <td>
                        <span className={`srf-badge ring-1 ring-inset ${
                          vendor.isBlocked
                            ? 'bg-rose-50 text-rose-700 ring-rose-200'
                            : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        }`}>
                          {vendor.isBlocked ? 'Blocked' : 'Active'}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {rowActions(vendor)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {vendors.map((vendor) => (
                <div key={vendor._id} className="p-3.5" onClick={() => handleViewDetail(vendor)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{vendor.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                        <Phone className="h-3 w-3" /> {vendor.phone}
                      </p>
                      {vendor.gstin && <p className="mt-0.5 text-[11px] text-slate-400">GSTIN: {vendor.gstin}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {vendor.isBlocked && (
                        <span className="srf-badge bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">Blocked</span>
                      )}
                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        {rowActions(vendor)}
                      </div>
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
              <h3 className="srf-modal-title">{selectedVendor ? 'Edit Vendor' : 'Add Vendor'}</h3>
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

              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={formData.isBlocked}
                  onChange={(e) => setFormData({ ...formData, isBlocked: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-[13px] font-medium text-slate-700">Block this vendor</span>
              </label>
            </form>

            <div className="srf-modal-footer">
              <button type="button" onClick={handleCloseModal} className="srf-btn srf-btn-secondary">Cancel</button>
              <button type="submit" onClick={handleSubmit} className="srf-btn srf-btn-primary">
                {selectedVendor ? 'Save Changes' : 'Add Vendor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setDetailVendor(null); }}
        title="Vendor Details"
        fields={getDetailFields(detailVendor)}
        onEdit={() => detailVendor && handleEdit(detailVendor)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedVendor(null); }}
        onConfirm={handleDelete}
        title="Delete Vendor"
        message={`${selectedVendor?.name} will be permanently removed. This action cannot be undone.`}
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

export default Vendors;
