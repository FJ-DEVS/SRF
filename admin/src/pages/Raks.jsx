import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import DetailModal from '../components/DetailModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import SortSelect from '../components/SortSelect';
import { DEFAULT_SORT } from '../utils/sortOptions';
import { Search, Plus, Edit2, Trash2, X, Eye, LayoutGrid } from 'lucide-react';

const Raks = () => {
  const [raks, setRaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });
  const [selectedRak, setSelectedRak] = useState(null);
  const [detailRak, setDetailRak] = useState(null);
  const [formData, setFormData] = useState({ name: '', code: '', capacity: '' });

  useEffect(() => {
    fetchRaks();
  }, [searchTerm, statusFilter, sortBy, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortBy, pageSize]);

  const fetchRaks = async () => {
    try {
      setLoading(true);
      const response = await api.get('/raks', {
        params: {
          search: searchTerm,
          status: statusFilter,
          sort: sortBy,
          page: currentPage,
          limit: pageSize
        }
      });
      if (response.data.success) {
        setRaks(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching raks:', error);
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

    if (!formData.name.trim() || !formData.code.trim()) {
      showAlert('Validation Error', 'Both name and code are required.', 'warning');
      return;
    }

    if (!formData.capacity || Number(formData.capacity) < 1) {
      showAlert('Validation Error', 'Rak space must be at least 1.', 'warning');
      return;
    }

    try {
      if (selectedRak) {
        const response = await api.put(`/raks/${selectedRak._id}`, formData);
        if (response.data.success) {
          fetchRaks();
          handleCloseModal();
        }
      } else {
        const response = await api.post('/raks', formData);
        if (response.data.success) {
          const name = formData.name;
          fetchRaks();
          handleCloseModal();
          showAlert('Rak Added', `${name} has been added successfully.`, 'success');
        }
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/raks/${selectedRak._id}`);
      if (response.data.success) {
        setShowDeleteModal(false);
        setSelectedRak(null);
        fetchRaks();
      }
    } catch (error) {
      setShowDeleteModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleEdit = (rak) => {
    setSelectedRak(rak);
    setFormData({ name: rak.name, code: rak.code, capacity: String(rak.capacity ?? '') });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedRak(null);
    setFormData({ name: '', code: '', capacity: '' });
  };

  const handleViewDetail = (rak) => {
    setDetailRak(rak);
    setShowDetailModal(true);
  };

  const getDetailFields = (rak) => [
    { label: 'Name', value: rak?.name, type: 'text', key: 'name' },
    { label: 'Code', value: rak?.code, type: 'text', key: 'code' },
    { label: 'Rak Space', value: rak ? `${rak.capacity} units` : '', type: 'text', key: 'capacity' },
    {
      label: 'Used / Free',
      value: rak ? `${rak.usedQty ?? 0} used · ${rak.freeQty ?? 0} free` : '',
      type: 'text',
      key: 'usage'
    },
    {
      label: 'Holding',
      value: rak?.placements?.length
        ? rak.placements.map((p) => `${p.item?.name || 'Deleted item'} × ${p.quantity}`)
        : 'Empty — nothing placed yet',
      type: rak?.placements?.length ? 'list' : 'text',
      key: 'placements'
    },
    { label: 'Created At', value: rak?.createdAt, type: 'datetime', key: 'createdAt' },
    { label: 'Updated At', value: rak?.updatedAt, type: 'datetime', key: 'updatedAt' },
  ];

  // Empty · partly filled · full — read off the usage the API returns
  const OccupancyBadge = ({ rak }) => {
    const used = rak.usedQty ?? 0;
    const capacity = rak.capacity ?? 0;
    const style = used === 0
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : (rak.freeQty ?? 0) === 0
        ? 'bg-rose-50 text-rose-700 ring-rose-200'
        : 'bg-amber-50 text-amber-700 ring-amber-200';
    const label = used === 0 ? 'Empty' : (rak.freeQty ?? 0) === 0 ? 'Full' : 'Partly filled';

    return (
      <span className={`srf-badge ring-1 ${style}`}>
        {label} · {used}/{capacity}
      </span>
    );
  };

  const rowActions = (rak) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); handleViewDetail(rak); }}
        className="srf-row-action text-indigo-500 hover:bg-indigo-50"
        title="View Details"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleEdit(rak); }}
        className="srf-row-action text-slate-500 hover:bg-slate-100"
        title="Edit"
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setSelectedRak(rak); setShowDeleteModal(true); }}
        className="srf-row-action text-rose-500 hover:bg-rose-50"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <div className="srf-page">
      <PageHeader title="Raks" subtitle="Storage slots where items are placed on the floor">
        <button onClick={() => setShowModal(true)} className="srf-btn srf-btn-primary">
          <Plus className="h-4 w-4" />
          Add Rak
        </button>
      </PageHeader>

      {/* Toolbar */}
      <div className="srf-toolbar sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or code…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full !pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:ml-auto sm:flex">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All raks</option>
            <option value="space">Has free space</option>
            <option value="full">Full</option>
            <option value="empty">Empty</option>
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
        ) : raks.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <LayoutGrid className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No raks found</p>
            <p className="mt-1 text-xs text-slate-400">Try a different search, or add a rak.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th className="text-right">Space</th>
                    <th className="text-right">Used</th>
                    <th className="text-right">Free</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {raks.map((rak) => (
                    <tr key={rak._id} className="cursor-pointer" onClick={() => handleViewDetail(rak)}>
                      <td className="font-semibold text-slate-900">{rak.code}</td>
                      <td>{rak.name}</td>
                      <td className="text-right tabular-nums">{rak.capacity ?? '—'}</td>
                      <td className="text-right tabular-nums">{rak.usedQty ?? 0}</td>
                      <td className="text-right tabular-nums font-medium text-slate-800">{rak.freeQty ?? 0}</td>
                      <td><OccupancyBadge rak={rak} /></td>
                      <td>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {rowActions(rak)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {raks.map((rak) => (
                <div key={rak._id} className="flex items-center justify-between gap-2 p-3.5" onClick={() => handleViewDetail(rak)}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {rak.code} · {rak.name}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-slate-400">
                      Space {rak.capacity ?? '—'} · {rak.freeQty ?? 0} free
                    </p>
                    <div className="mt-1">
                      <OccupancyBadge rak={rak} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {rowActions(rak)}
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
              <h3 className="srf-modal-title">{selectedRak ? 'Edit Rak' : 'Add Rak'}</h3>
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
                  placeholder="e.g. Ground Floor Row A"
                />
              </div>
              <div>
                <label className="mb-1.5 block">Code</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full uppercase"
                  placeholder="e.g. A-01"
                />
                <p className="mt-1 text-[11px] text-slate-400">Codes are unique and stored in uppercase.</p>
              </div>
              <div>
                <label className="mb-1.5 block">Rak Space</label>
                <input
                  type="number"
                  required
                  min={1}
                  step={1}
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  className="w-full"
                  placeholder="e.g. 500"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Total quantity this rak can hold. It can be shared by several items.
                </p>
              </div>
            </form>

            <div className="srf-modal-footer">
              <button type="button" onClick={handleCloseModal} className="srf-btn srf-btn-secondary">Cancel</button>
              <button type="submit" onClick={handleSubmit} className="srf-btn srf-btn-primary">
                {selectedRak ? 'Save Changes' : 'Add Rak'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setDetailRak(null); }}
        title="Rak Details"
        fields={getDetailFields(detailRak)}
        onEdit={() => detailRak && handleEdit(detailRak)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedRak(null); }}
        onConfirm={handleDelete}
        title="Delete Rak"
        message={`${selectedRak?.code || 'This rak'} will be permanently removed. This action cannot be undone.`}
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

export default Raks;
