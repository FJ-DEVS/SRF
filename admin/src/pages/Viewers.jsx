import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import DetailModal from '../components/DetailModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import SortSelect from '../components/SortSelect';
import FilterPanel from '../components/FilterPanel';
import PermissionsModal from '../components/PermissionsModal';
import { DEFAULT_SORT } from '../utils/sortOptions';
import { Search, Plus, Edit2, Trash2, X, Eye, EyeOff, ScanEye, Phone, KeyRound } from 'lucide-react';

const EMPTY_FORM = { name: '', phone: '', password: '' };

// What a viewer is shown of each item, as small badges
const StockAccess = ({ viewer }) => {
  const badges = [
    viewer.canViewQuantity !== false && { label: 'Stock', cls: 'bg-indigo-50 text-indigo-700' },
    viewer.canViewPrice !== false && { label: 'Rate', cls: 'bg-emerald-50 text-emerald-700' }
  ].filter(Boolean);
  if (badges.length === 0) return <span className="text-xs text-slate-400">Item names only</span>;
  return (
    <span className="inline-flex gap-1">
      {badges.map((b) => (
        <span key={b.label} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>
      ))}
    </span>
  );
};

// Viewers sign in to the mobile app with their mobile number and only look at
// the stock list — what they see is set from Manage Permissions
const Viewers = () => {
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });
  const [selectedViewer, setSelectedViewer] = useState(null);
  const [detailViewer, setDetailViewer] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  // Permission manager: the viewer being edited, and the categories to choose
  // from (loaded fresh each time it opens)
  const [permTarget, setPermTarget] = useState(null);
  const [permOptions, setPermOptions] = useState(null);

  useEffect(() => {
    fetchViewers();
  }, [searchTerm, sortBy, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, pageSize]);

  const fetchViewers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/viewers', {
        params: { search: searchTerm, sort: sortBy, page: currentPage, limit: pageSize }
      });
      if (response.data.success) {
        setViewers(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching viewers:', error);
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

  const displayName = (viewer) => viewer?.name || viewer?.phone || 'Viewer';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.phone.trim()) return showAlert('Error', 'Enter the mobile number');
    if (!selectedViewer && formData.password.length < 6) {
      return showAlert('Error', 'Password must be at least 6 characters');
    }
    try {
      if (selectedViewer) {
        const response = await api.put(`/viewers/${selectedViewer._id}`, formData);
        if (response.data.success) {
          fetchViewers();
          handleCloseModal();
        }
      } else {
        const response = await api.post('/viewers', formData);
        if (response.data.success) {
          const name = displayName(response.data.data);
          fetchViewers();
          handleCloseModal();
          showAlert(
            'Viewer Added',
            `${name} can now sign in to the app with their mobile number. Use Manage Permissions to choose what they see.`,
            'success'
          );
        }
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/viewers/${selectedViewer._id}`);
      if (response.data.success) {
        fetchViewers();
        setSelectedViewer(null);
      }
    } catch (error) {
      setShowDeleteModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleEdit = (viewer) => {
    setSelectedViewer(viewer);
    setFormData({ name: viewer.name || '', phone: viewer.phone, password: '' });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedViewer(null);
    setFormData(EMPTY_FORM);
    setShowPassword(false);
  };

  const openPermissions = async (viewer) => {
    setPermTarget(viewer);
    setPermOptions(null);
    try {
      const categoriesRes = await api.get('/categories');
      setPermOptions({
        categories: (categoriesRes.data.data || []).map((c) => ({ value: c._id, label: c.name }))
      });
    } catch (error) {
      setPermTarget(null);
      showAlert('Error', error.response?.data?.message || 'Could not load the categories', 'error');
    }
  };

  const savePermissions = async (values) => {
    try {
      const response = await api.put(`/viewers/${permTarget._id}/permissions`, values);
      if (response.data.success) {
        const name = displayName(permTarget);
        setPermTarget(null);
        fetchViewers();
        showAlert('Permissions Saved', `${name}'s access has been updated.`, 'success');
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Could not save the permissions', 'error');
    }
  };

  const getDetailFields = (viewer) => [
    { label: 'Name', value: viewer?.name || '—', type: 'text', key: 'name' },
    { label: 'Mobile Number', value: viewer?.phone, type: 'text', key: 'phone' },
    { label: 'Password', value: viewer?.plainPassword || '', type: 'password', key: 'password' },
    { label: 'Can See Stock Count', value: viewer?.canViewQuantity !== false ? 'Yes' : 'No', type: 'text', key: 'canViewQuantity' },
    { label: 'Can See Rate', value: viewer?.canViewPrice !== false ? 'Yes' : 'No', type: 'text', key: 'canViewPrice' },
    { label: 'Created At', value: viewer?.createdAt, type: 'datetime', key: 'createdAt' },
    { label: 'Updated At', value: viewer?.updatedAt, type: 'datetime', key: 'updatedAt' },
  ];

  const rowActions = (viewer) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setDetailViewer(viewer); }}
        className="srf-row-action text-indigo-500 hover:bg-indigo-50"
        title="View Details"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); openPermissions(viewer); }}
        className="srf-row-action text-emerald-600 hover:bg-emerald-50"
        title="Manage Permissions"
      >
        <KeyRound className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleEdit(viewer); }}
        className="srf-row-action text-slate-500 hover:bg-slate-100"
        title="Edit"
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setSelectedViewer(viewer); setShowDeleteModal(true); }}
        className="srf-row-action text-rose-500 hover:bg-rose-50"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <div className="srf-page">
      <PageHeader title="Viewers" subtitle="View-only app users who sign in with their mobile number">
        <button onClick={() => setShowModal(true)} className="srf-btn srf-btn-primary">
          <Plus className="h-4 w-4" />
          Add Viewer
        </button>
      </PageHeader>

      {/* Toolbar */}
      <FilterPanel active={[searchTerm]}>
        <div className="srf-toolbar sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or mobile number…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full !pl-9"
            />
          </div>
          <SortSelect value={sortBy} onChange={setSortBy} className="w-full sm:ml-auto sm:w-auto" />
        </div>
      </FilterPanel>

      {/* List */}
      <div className="srf-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : viewers.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <ScanEye className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No viewers found</p>
            <p className="mt-1 text-xs text-slate-400">Try a different search, or add your first viewer.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Mobile Number</th>
                    <th>Can See</th>
                    <th>Created</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {viewers.map((viewer) => (
                    <tr key={viewer._id} className="cursor-pointer" onClick={() => setDetailViewer(viewer)}>
                      <td className="font-semibold text-slate-900">{viewer.name || <span className="font-normal text-slate-400">—</span>}</td>
                      <td>{viewer.phone}</td>
                      <td><StockAccess viewer={viewer} /></td>
                      <td>{new Date(viewer.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {rowActions(viewer)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {viewers.map((viewer) => (
                <div key={viewer._id} className="p-3.5" onClick={() => setDetailViewer(viewer)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{displayName(viewer)}</p>
                      {viewer.name && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <Phone className="h-3 w-3" /> {viewer.phone}
                        </p>
                      )}
                      <div className="mt-1.5"><StockAccess viewer={viewer} /></div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      {rowActions(viewer)}
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
        isOpen={Boolean(detailViewer)}
        onClose={() => setDetailViewer(null)}
        title="Viewer Details"
        fields={getDetailFields(detailViewer)}
        onEdit={() => detailViewer && handleEdit(detailViewer)}
      />

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="srf-modal-backdrop" onClick={handleCloseModal}>
          <div className="srf-modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="srf-modal-header">
              <h3 className="srf-modal-title">{selectedViewer ? 'Edit Viewer' : 'Add Viewer'}</h3>
              <button onClick={handleCloseModal} className="srf-icon-btn">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="srf-modal-body space-y-4">
              <div>
                <label className="mb-1.5 block">Mobile Number</label>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  autoFocus
                  placeholder="10-digit mobile number"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full"
                />
                <p className="mt-1 text-[11px] text-slate-400">They sign in to the app with this number.</p>
              </div>
              <div>
                <label className="mb-1.5 block">
                  Password {selectedViewer && <span className="font-normal text-slate-400">(leave blank to keep current)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!selectedViewer}
                    minLength={selectedViewer && !formData.password ? undefined : 6}
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
                <label className="mb-1.5 block">
                  Name <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full"
                />
              </div>
            </form>
            <div className="srf-modal-footer">
              <button type="button" onClick={handleCloseModal} className="srf-btn srf-btn-secondary">Cancel</button>
              <button type="submit" onClick={handleSubmit} className="srf-btn srf-btn-primary">
                {selectedViewer ? 'Save Changes' : 'Add Viewer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permission manager */}
      {permTarget && (
        <PermissionsModal
          key={permTarget._id}
          title={`${displayName(permTarget)} — Permissions`}
          subtitle="Which item categories this viewer sees, and whether the stock count and rate are shown"
          loading={!permOptions}
          sections={[
            {
              key: 'allowedCategories',
              label: 'Item Categories',
              allLabel: 'All categories',
              emptyWarning: 'No categories ticked — this viewer will not see any item.',
              options: permOptions?.categories || [],
              value: permTarget.allowedCategories
            }
          ]}
          toggleGroup={{
            label: 'Stock Details',
            hint: 'What is shown for each item',
            emptyWarning: 'Neither ticked — this viewer will see item names only.',
            toggles: [
              {
                key: 'canViewQuantity',
                label: 'Stock count',
                description: 'How many are in stock',
                value: permTarget.canViewQuantity !== false
              },
              {
                key: 'canViewPrice',
                label: 'Rate',
                description: 'The price of each item',
                value: permTarget.canViewPrice !== false
              }
            ]
          }}
          onClose={() => setPermTarget(null)}
          onSave={savePermissions}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedViewer(null); }}
        onConfirm={handleDelete}
        title="Delete Viewer"
        message={`${displayName(selectedViewer)} will be permanently removed and signed out of the app. This action cannot be undone.`}
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

export default Viewers;
