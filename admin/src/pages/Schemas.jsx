import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import { Search, Plus, Edit2, Trash2, X, Award, Trophy, Gift } from 'lucide-react';

const emptyForm = {
  name: '',
  runBy: '',
  fromDate: '',
  toDate: '',
  // Points are earned per unit sold of any item in the category
  pointsAllocations: [{ category: '', points: '' }],
  tiers: [{ pointsRequired: '', reward: '' }],
};

// yyyy-mm-dd for <input type="date">
const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const Schemas = () => {
  const [schemas, setSchemas] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });
  const [selectedSchema, setSelectedSchema] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSchemas();
  }, [searchTerm, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchSchemas = async () => {
    try {
      setLoading(true);
      const response = await api.get('/schemas', {
        params: { search: searchTerm, page: currentPage, limit: pageSize },
      });
      if (response.data.success) {
        setSchemas(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching schemas:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      if (response.data.success) setCategories(response.data.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
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

  // --- Dynamic allocation rows ---
  const updateAllocation = (index, field, value) => {
    setFormData((prev) => {
      const rows = [...prev.pointsAllocations];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, pointsAllocations: rows };
    });
  };
  const addAllocation = () =>
    setFormData((prev) => ({
      ...prev,
      pointsAllocations: [...prev.pointsAllocations, { category: '', points: '' }],
    }));
  const removeAllocation = (index) =>
    setFormData((prev) => ({
      ...prev,
      pointsAllocations: prev.pointsAllocations.filter((_, i) => i !== index),
    }));

  // --- Dynamic tier rows ---
  const updateTier = (index, field, value) => {
    setFormData((prev) => {
      const rows = [...prev.tiers];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, tiers: rows };
    });
  };
  const addTier = () =>
    setFormData((prev) => ({ ...prev, tiers: [...prev.tiers, { pointsRequired: '', reward: '' }] }));
  const removeTier = (index) =>
    setFormData((prev) => ({ ...prev, tiers: prev.tiers.filter((_, i) => i !== index) }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    const allocations = formData.pointsAllocations
      .filter((a) => a.category)
      .map((a) => {
        const matched = categories.find((c) => c._id === a.category);
        return { category: a.category, categoryName: matched ? matched.name : '', points: Number(a.points) || 0 };
      });
    const tiers = formData.tiers
      .filter((t) => (t.reward || '').trim())
      .map((t) => ({ pointsRequired: Number(t.pointsRequired) || 0, reward: t.reward.trim() }));

    if (allocations.length === 0) {
      showAlert('Missing categories', 'Add at least one category to the points table.', 'error');
      return;
    }
    if (tiers.length === 0) {
      showAlert('Missing tiers', 'Add at least one achievement tier.', 'error');
      return;
    }

    const payload = {
      name: formData.name,
      runBy: formData.runBy,
      fromDate: formData.fromDate,
      toDate: formData.toDate,
      pointsAllocations: allocations,
      tiers,
    };

    try {
      setSaving(true);
      if (selectedSchema) {
        const response = await api.put(`/schemas/${selectedSchema._id}`, payload);
        if (response.data.success) {
          fetchSchemas();
          handleCloseModal();
        }
      } else {
        const response = await api.post('/schemas', payload);
        if (response.data.success) {
          fetchSchemas();
          handleCloseModal();
          showAlert('Schema Created', `${payload.name} has been created successfully.`, 'success');
        }
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/schemas/${selectedSchema._id}`);
      if (response.data.success) {
        fetchSchemas();
        setSelectedSchema(null);
        setShowDeleteModal(false);
      }
    } catch (error) {
      setShowDeleteModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleEdit = (schema) => {
    setSelectedSchema(schema);
    setFormData({
      name: schema.name,
      runBy: schema.runBy || '',
      fromDate: toDateInput(schema.fromDate),
      toDate: toDateInput(schema.toDate),
      pointsAllocations:
        schema.pointsAllocations?.length > 0
          ? schema.pointsAllocations.map((a) => ({
              category: a.category?._id || a.category || '',
              points: a.points,
            }))
          : [{ category: '', points: '' }],
      tiers:
        schema.tiers?.length > 0
          ? schema.tiers.map((t) => ({ pointsRequired: t.pointsRequired, reward: t.reward }))
          : [{ pointsRequired: '', reward: '' }],
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedSchema(null);
    setFormData(emptyForm);
  };

  const rowActions = (schema) => (
    <>
      <Link
        to={`/schema-leaderboard?schema=${schema._id}`}
        onClick={(e) => e.stopPropagation()}
        className="srf-row-action text-amber-500 hover:bg-amber-50"
        title="Leaderboard"
      >
        <Trophy className="h-4 w-4" />
      </Link>
      <button
        onClick={(e) => { e.stopPropagation(); handleEdit(schema); }}
        className="srf-row-action text-slate-500 hover:bg-slate-100"
        title="Edit"
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setSelectedSchema(schema); setShowDeleteModal(true); }}
        className="srf-row-action text-rose-500 hover:bg-rose-50"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <div className="srf-page">
      <PageHeader title="Schema" subtitle="Salesman incentive programs">
        <button onClick={() => setShowModal(true)} className="srf-btn srf-btn-primary">
          <Plus className="h-4 w-4" />
          Add Schema
        </button>
      </PageHeader>

      {/* Toolbar */}
      <div className="srf-toolbar">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or run by…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full !pl-9"
          />
        </div>
      </div>

      {/* List */}
      <div className="srf-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : schemas.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Award className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No schemas found</p>
            <p className="mt-1 text-xs text-slate-400">Create an incentive schema to get started.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Period</th>
                    <th>Run By</th>
                    <th>Categories</th>
                    <th>Tiers</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schemas.map((schema) => (
                    <tr key={schema._id} className="cursor-pointer" onClick={() => handleEdit(schema)}>
                      <td className="font-semibold text-slate-900">{schema.name}</td>
                      <td>{formatDate(schema.fromDate)} – {formatDate(schema.toDate)}</td>
                      <td>{schema.runBy || '—'}</td>
                      <td>{schema.pointsAllocations?.length || 0}</td>
                      <td>{schema.tiers?.length || 0}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {rowActions(schema)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {schemas.map((schema) => (
                <div key={schema._id} className="flex items-center justify-between gap-2 p-3.5" onClick={() => handleEdit(schema)}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{schema.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatDate(schema.fromDate)} – {formatDate(schema.toDate)} · {schema.pointsAllocations?.length || 0} categories · {schema.tiers?.length || 0} tiers
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {rowActions(schema)}
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
          <div className="srf-modal-panel max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="srf-modal-header">
              <h3 className="srf-modal-title">{selectedSchema ? 'Edit Schema' : 'Add Schema'}</h3>
              <button onClick={handleCloseModal} className="srf-icon-btn">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="srf-modal-body space-y-5">
              {/* Basics */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block">Schema Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full"
                    placeholder="e.g. Monsoon Sales Drive"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block">Run By</label>
                  <input
                    type="text"
                    value={formData.runBy}
                    onChange={(e) => setFormData({ ...formData, runBy: e.target.value })}
                    className="w-full"
                    placeholder="e.g. Regional Manager"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block">From Date</label>
                  <input
                    type="date"
                    required
                    value={formData.fromDate}
                    onChange={(e) => setFormData({ ...formData, fromDate: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block">To Date</label>
                  <input
                    type="date"
                    required
                    value={formData.toDate}
                    onChange={(e) => setFormData({ ...formData, toDate: e.target.value })}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Points Allocation */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="flex items-center gap-1.5 !mb-0">
                    <Gift className="h-4 w-4 text-indigo-500" />
                    Points Allocation
                  </label>
                  <button type="button" onClick={addAllocation} className="srf-btn srf-btn-secondary !py-1 !px-2.5 text-xs">
                    <Plus className="h-3.5 w-3.5" /> Add Category
                  </button>
                </div>
                <p className="mb-2 text-[11px] text-slate-400">
                  Points are earned per unit sold of any item in the category.
                </p>
                <div className="space-y-2">
                  {formData.pointsAllocations.map((row, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        value={row.category}
                        onChange={(e) => updateAllocation(index, 'category', e.target.value)}
                        className="w-full flex-1"
                      >
                        <option value="">Select category…</option>
                        {categories.map((cat) => (
                          <option key={cat._id} value={cat._id}>{cat.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        value={row.points}
                        onChange={(e) => updateAllocation(index, 'points', e.target.value)}
                        className="w-28"
                        placeholder="Points"
                      />
                      <button
                        type="button"
                        onClick={() => removeAllocation(index)}
                        className="srf-row-action shrink-0 text-rose-500 hover:bg-rose-50"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Achievement Tiers */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="flex items-center gap-1.5 !mb-0">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    Achievement Tiers
                  </label>
                  <button type="button" onClick={addTier} className="srf-btn srf-btn-secondary !py-1 !px-2.5 text-xs">
                    <Plus className="h-3.5 w-3.5" /> Add Tier
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.tiers.map((row, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={row.pointsRequired}
                        onChange={(e) => updateTier(index, 'pointsRequired', e.target.value)}
                        className="w-32"
                        placeholder="Points"
                      />
                      <input
                        type="text"
                        value={row.reward}
                        onChange={(e) => updateTier(index, 'reward', e.target.value)}
                        className="w-full flex-1"
                        placeholder="Tier / Gift"
                      />
                      <button
                        type="button"
                        onClick={() => removeTier(index)}
                        className="srf-row-action shrink-0 text-rose-500 hover:bg-rose-50"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </form>

            <div className="srf-modal-footer">
              <button type="button" onClick={handleCloseModal} className="srf-btn srf-btn-secondary">Cancel</button>
              <button type="submit" onClick={handleSubmit} disabled={saving} className="srf-btn srf-btn-primary">
                {saving ? 'Saving…' : selectedSchema ? 'Save Changes' : 'Add Schema'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedSchema(null); }}
        onConfirm={handleDelete}
        title="Delete Schema"
        message={`${selectedSchema?.name} will be permanently removed. This action cannot be undone.`}
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

export default Schemas;
