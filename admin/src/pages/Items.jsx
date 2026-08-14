import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../utils/api';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import SortSelect from '../components/SortSelect';
import { ITEM_SORT_OPTIONS, DEFAULT_SORT } from '../utils/sortOptions';
import {
  Search, Plus, Edit2, Trash2, X, Eye, Tag, TrendingUp, Package,
  ArrowDownToLine, ArrowUpFromLine, IndianRupee, Boxes, Check, History,
  Download, Upload, AlertTriangle, ShieldCheck
} from 'lucide-react';

const Items = () => {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [stockState, setStockState] = useState(searchParams.get('stockState') || '');
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [detailStats, setDetailStats] = useState(null);
  const [detailStatsLoading, setDetailStatsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    quantity: '',
    category: '',
    checkLevel: ''
  });

  const [categories, setCategories] = useState([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryCheckLevel, setNewCategoryCheckLevel] = useState('');
  const [editingCategoryCheckLevel, setEditingCategoryCheckLevel] = useState('');
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // Bulk price update
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);
  const [bulkPriceAmounts, setBulkPriceAmounts] = useState({});
  const [bulkPriceLoading, setBulkPriceLoading] = useState(false);

  // Excel export/import
  const fileInputRef = useRef(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchItems();
  }, [searchTerm, sizeFilter, stockState, sortBy, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sizeFilter, stockState, sortBy, pageSize]);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      if (response.data.success) {
        setCategories(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  // Everything the list is currently filtered by — shared with the Excel export
  const listFilters = () => ({
    search: searchTerm,
    category: sizeFilter,
    stockState,
    sort: sortBy
  });

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await api.get('/items', {
        params: {
          ...listFilters(),
          page: currentPage,
          limit: pageSize
        }
      });
      if (response.data.success) {
        setItems(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
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

  /* ---------- Categories ---------- */

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const response = await api.post('/categories', {
        name: newCategoryName.trim(),
        checkLevel: newCategoryCheckLevel
      });
      if (response.data.success) {
        setNewCategoryName('');
        setNewCategoryCheckLevel('');
        fetchCategories();
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to add category', 'error');
    }
  };

  const handleStartEditCategory = (cat) => {
    setEditingCategory(cat);
    setEditingCategoryName(cat.name);
    setEditingCategoryCheckLevel(cat.checkLevel ?? '');
  };

  const handleSaveCategory = async () => {
    if (!editingCategory || !editingCategoryName.trim()) return;
    try {
      const response = await api.put(`/categories/${editingCategory._id}`, {
        name: editingCategoryName.trim(),
        checkLevel: editingCategoryCheckLevel
      });
      if (response.data.success) {
        if (sizeFilter === editingCategory.name) setSizeFilter(editingCategoryName.trim());
        setEditingCategory(null);
        setEditingCategoryName('');
        setEditingCategoryCheckLevel('');
        fetchCategories();
        fetchItems();
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to rename category', 'error');
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
      const response = await api.delete(`/categories/${categoryToDelete._id}`);
      if (response.data.success) {
        setCategoryToDelete(null);
        setShowDeleteCategoryModal(false);
        fetchCategories();
        if (sizeFilter === categoryToDelete.name) setSizeFilter('');
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to delete category', 'error');
    }
  };

  /* ---------- Bulk price ---------- */

  const handleOpenBulkPrice = () => {
    setBulkPriceAmounts({});
    setShowBulkPriceModal(true);
  };

  const handleBulkPriceUpdate = async () => {
    const entries = Object.entries(bulkPriceAmounts).filter(
      ([, v]) => v !== '' && !isNaN(parseFloat(v)) && parseFloat(v) !== 0
    );
    if (entries.length === 0) {
      showAlert('No changes', 'Enter an amount for at least one category.', 'warning');
      return;
    }
    setBulkPriceLoading(true);
    try {
      let totalModified = 0;
      for (const [category, amount] of entries) {
        const res = await api.put('/items/bulk-price-update', {
          category,
          amount: parseFloat(amount)
        });
        if (res.data.success) totalModified += res.data.modifiedCount ?? 0;
      }
      setShowBulkPriceModal(false);
      setBulkPriceAmounts({});
      fetchItems();
      showAlert('Prices Updated', `Price updated for ${totalModified} item(s).`, 'success');
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Bulk update failed', 'error');
    } finally {
      setBulkPriceLoading(false);
    }
  };

  /* ---------- Excel export/import ---------- */

  // Exports exactly what the list is showing — the active category, search,
  // stock filter and sort all carry over
  const handleExportExcel = async () => {
    setExportLoading(true);
    try {
      const response = await api.get('/items', { params: { ...listFilters(), limit: 100000 } });
      const allItems = response.data?.data || [];
      if (allItems.length === 0) {
        showAlert('No Data', 'No items match the current filters', 'info');
        return;
      }

      const exportData = allItems.map((item, index) => ({
        'S.No': index + 1,
        'ID': item._id,
        'Name': item.name,
        'Category': item.category || '',
        'Price': item.price,
        'Quantity': item.quantity,
        'Check Level': item.checkLevel ?? '',
        'Stock Status': item.belowCheckLevel ? 'Below check level' : 'OK'
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Items');

      const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const suffix = [
        sizeFilter && slug(sizeFilter),
        stockState && `${stockState}-check-level`,
        searchTerm && `search-${slug(searchTerm)}`
      ].filter(Boolean).join('_');

      XLSX.writeFile(
        workbook,
        `items${suffix ? `_${suffix}` : ''}_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch {
      showAlert('Error', 'Failed to export items', 'error');
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const items = rows
        .map((row) => ({
          _id: row['ID'] || row['Id'] || row['id'] || undefined,
          name: row['Name'] ?? row['name'],
          category: row['Category'] ?? row['category'] ?? '',
          price: row['Price'] ?? row['price'],
          quantity: row['Quantity'] ?? row['quantity'],
          checkLevel: row['Check Level'] ?? row['checkLevel']
        }))
        .filter((r) => r._id || (r.name && String(r.name).trim()));

      if (items.length === 0) {
        showAlert('No Data', 'No valid rows found in the file', 'warning');
        return;
      }

      const response = await api.post('/items/bulk-import', { items });
      if (response.data.success) {
        fetchItems();
        const errs = response.data.errors || [];
        const errSummary = errs.length
          ? ` ${errs.length} row(s) failed: ${errs.slice(0, 5).join('; ')}${errs.length > 5 ? '…' : ''}`
          : '';
        showAlert(
          'Import Complete',
          `${response.data.created} created, ${response.data.updated} updated.${errSummary}`,
          errs.length ? 'warning' : 'success'
        );
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Failed to import items', 'error');
    } finally {
      setImportLoading(false);
    }
  };

  /* ---------- Item CRUD ---------- */

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (selectedItem) {
        const response = await api.put(`/items/${selectedItem._id}`, formData);
        if (response.data.success) {
          fetchItems();
          handleCloseModal();
        }
      } else {
        const response = await api.post('/items', formData);
        if (response.data.success) {
          const name = formData.name;
          fetchItems();
          handleCloseModal();
          showAlert('Item Added', `${name} has been added to inventory.`, 'success');
        }
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await api.delete(`/items/${selectedItem._id}`);
      if (response.data.success) {
        fetchItems();
        setSelectedItem(null);
      }
    } catch (error) {
      setShowDeleteModal(false);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const handleEdit = (item) => {
    setSelectedItem(item);
    setFormData({
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      category: item.category || '',
      checkLevel: item.checkLevel ?? ''
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedItem(null);
    setFormData({ name: '', price: '', quantity: '', category: '', checkLevel: '' });
  };

  const handleViewDetail = async (item) => {
    setDetailItem(item);
    setShowDetailModal(true);
    setDetailStats(null);
    setDetailStatsLoading(true);
    try {
      const response = await api.get(`/items/${item._id}/stats`);
      if (response.data.success) setDetailStats(response.data.data);
    } catch (error) {
      console.error('Error fetching item stats:', error);
    } finally {
      setDetailStatsLoading(false);
    }
  };

  const closeDetail = () => {
    setShowDetailModal(false);
    setDetailItem(null);
    setDetailStats(null);
  };

  const stockBadge = (item) => {
    const qty = item.quantity;
    if (qty === 0) return <span className="srf-badge bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">Out of stock</span>;
    if (item.belowCheckLevel) {
      return (
        <span className="srf-badge bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="h-3 w-3" />
          {qty} · below check level
        </span>
      );
    }
    if (item.effectiveCheckLevel == null && qty <= 10) {
      return <span className="srf-badge bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">{qty} left</span>;
    }
    return <span className="text-[13px] text-slate-600">{qty}</span>;
  };

  // Own check level reads plain; one inherited from the category is marked
  const checkLevelCell = (item) => {
    if (item.checkLevel != null) {
      return <span className="text-[13px] tabular-nums text-slate-700">{item.checkLevel}</span>;
    }
    if (item.effectiveCheckLevel != null) {
      return (
        <span className="text-[13px] tabular-nums text-slate-400" title="Inherited from the category">
          {item.effectiveCheckLevel}
          <span className="ml-1 text-[10px] uppercase tracking-wide">cat</span>
        </span>
      );
    }
    return <span className="text-slate-300">—</span>;
  };

  const rowActions = (item) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); handleViewDetail(item); }}
        className="srf-row-action text-indigo-500 hover:bg-indigo-50"
        title="View Details"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
        className="srf-row-action text-slate-500 hover:bg-slate-100"
        title="Edit"
      >
        <Edit2 className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setSelectedItem(item); setShowDeleteModal(true); }}
        className="srf-row-action text-rose-500 hover:bg-rose-50"
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </>
  );

  const formatDate = (d) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="srf-page">
      <PageHeader title="Items" subtitle="Inventory of laminates and materials">
        <button onClick={() => setShowCategoryModal(true)} className="srf-btn srf-btn-secondary">
          <Tag className="h-4 w-4 text-slate-400" />
          Categories
        </button>
        <button onClick={handleOpenBulkPrice} className="srf-btn srf-btn-secondary !text-emerald-700">
          <TrendingUp className="h-4 w-4" />
          Bulk Price
        </button>
        <button onClick={handleExportExcel} disabled={exportLoading} className="srf-btn srf-btn-secondary">
          <Download className="h-4 w-4 text-slate-400" />
          {exportLoading ? 'Exporting…' : 'Export Excel'}
        </button>
        <button onClick={handleImportClick} disabled={importLoading} className="srf-btn srf-btn-secondary">
          <Upload className="h-4 w-4 text-slate-400" />
          {importLoading ? 'Importing…' : 'Import Excel'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleImportFile}
          className="hidden"
        />
        <button onClick={() => setShowModal(true)} className="srf-btn srf-btn-primary">
          <Plus className="h-4 w-4" />
          Add Item
        </button>
      </PageHeader>

      {/* Toolbar */}
      <div className="srf-toolbar">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by item name…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full !pl-9"
            />
          </div>
          <SortSelect
            value={sortBy}
            onChange={setSortBy}
            options={ITEM_SORT_OPTIONS}
            className="w-full sm:ml-auto sm:w-auto"
          />
        </div>

        {/* Category chips */}
        <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none">
          <button
            type="button"
            onClick={() => setSizeFilter('')}
            className={`srf-chip ${sizeFilter === '' ? 'srf-chip-active' : ''}`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat._id}
              type="button"
              onClick={() => setSizeFilter(sizeFilter === cat.name ? '' : cat.name)}
              className={`srf-chip ${sizeFilter === cat.name ? 'srf-chip-active' : ''}`}
              title={cat.checkLevel != null ? `Check level ${cat.checkLevel}` : undefined}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Check level chips */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStockState(stockState === 'below' ? '' : 'below')}
            className={`srf-chip ${stockState === 'below' ? 'srf-chip-active' : 'text-amber-700'}`}
          >
            <AlertTriangle className="h-3 w-3" />
            Below check level
          </button>
          <button
            type="button"
            onClick={() => setStockState(stockState === 'above' ? '' : 'above')}
            className={`srf-chip ${stockState === 'above' ? 'srf-chip-active' : 'text-emerald-700'}`}
          >
            <ShieldCheck className="h-3 w-3" />
            Above check level
          </button>
        </div>
      </div>

      {/* List */}
      <div className="srf-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Package className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No items found</p>
            <p className="mt-1 text-xs text-slate-400">Try a different search or category filter.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Check Level</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item._id}
                      className={`cursor-pointer ${item.belowCheckLevel ? 'bg-amber-50/60' : ''}`}
                      onClick={() => handleViewDetail(item)}
                    >
                      <td className="max-w-[300px] truncate font-semibold text-slate-900">{item.name}</td>
                      <td>
                        {item.category
                          ? <span className="srf-badge bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">{item.category}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="font-medium text-slate-800">₹{item.price.toLocaleString('en-IN')}</td>
                      <td>{stockBadge(item)}</td>
                      <td>{checkLevelCell(item)}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {rowActions(item)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {items.map((item) => (
                <div
                  key={item._id}
                  className={`p-3.5 ${item.belowCheckLevel ? 'bg-amber-50/60' : ''}`}
                  onClick={() => handleViewDetail(item)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{item.name}</p>
                    <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      {rowActions(item)}
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
                    <span className="font-semibold text-slate-800">₹{item.price.toLocaleString('en-IN')}</span>
                    {stockBadge(item)}
                    {item.category && (
                      <span className="srf-badge bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">{item.category}</span>
                    )}
                    {item.effectiveCheckLevel != null && (
                      <span className="text-[11px] text-slate-400">Check level {item.effectiveCheckLevel}</span>
                    )}
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
              <h3 className="srf-modal-title">{selectedItem ? 'Edit Item' : 'Add Item'}</h3>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block">Price (₹)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block">Quantity</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full"
                >
                  <option value="">— None —</option>
                  {categories.map((cat) => (
                    <option key={cat._id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block">
                  Check Level <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.checkLevel}
                  onChange={(e) => setFormData({ ...formData, checkLevel: e.target.value })}
                  className="w-full"
                  placeholder={
                    categories.find((c) => c.name === formData.category)?.checkLevel != null
                      ? `Category default: ${categories.find((c) => c.name === formData.category).checkLevel}`
                      : 'e.g. 50'
                  }
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Stock at or below this is flagged for reordering. Leave blank to use the category's check level.
                </p>
              </div>
            </form>

            <div className="srf-modal-footer">
              <button type="button" onClick={handleCloseModal} className="srf-btn srf-btn-secondary">Cancel</button>
              <button type="submit" onClick={handleSubmit} className="srf-btn srf-btn-primary">
                {selectedItem ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Detail Modal — with purchase & sales insight */}
      {showDetailModal && detailItem && (
        <div className="srf-modal-backdrop" onClick={closeDetail}>
          <div className="srf-modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="srf-modal-header">
              <div className="min-w-0">
                <h3 className="srf-modal-title truncate">{detailItem.name}</h3>
                {detailItem.category && (
                  <span className="srf-badge mt-1 bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">
                    {detailItem.category}
                  </span>
                )}
              </div>
              <button onClick={closeDetail} className="srf-icon-btn shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="srf-modal-body space-y-4">
              {/* Price / stock tiles */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <IndianRupee className="h-3 w-3" /> Price
                  </p>
                  <p className="mt-1 font-display text-lg font-bold text-slate-900">
                    ₹{detailItem.price.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <Boxes className="h-3 w-3" /> In Stock
                  </p>
                  <p className={`mt-1 font-display text-lg font-bold ${
                    detailItem.quantity === 0 ? 'text-rose-600' : detailItem.belowCheckLevel ? 'text-amber-600' : 'text-slate-900'
                  }`}>
                    {detailItem.quantity}
                  </p>
                  {detailItem.effectiveCheckLevel != null && (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Check level {detailItem.effectiveCheckLevel}
                      {detailItem.checkLevel == null && ' (from category)'}
                    </p>
                  )}
                </div>
              </div>

              {detailItem.belowCheckLevel && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Stock has reached the check level — time to reorder.
                </div>
              )}

              {/* Purchase / sales stats */}
              {detailStatsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-slate-500" />
                </div>
              ) : detailStats ? (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                        <ArrowDownToLine className="h-3 w-3" /> Total Purchased
                      </p>
                      <p className="mt-1 font-display text-lg font-bold text-emerald-700">{detailStats.totalPurchased}</p>
                      <p className="text-[11px] text-emerald-600/70">
                        {detailStats.purchaseOrders} purchase order{detailStats.purchaseOrders === 1 ? '' : 's'}
                        {detailStats.pendingPurchase > 0 && ` · ${detailStats.pendingPurchase} pending`}
                      </p>
                    </div>
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
                        <ArrowUpFromLine className="h-3 w-3" /> Total Sold
                      </p>
                      <p className="mt-1 font-display text-lg font-bold text-indigo-700">{detailStats.totalSold}</p>
                      <p className="text-[11px] text-indigo-600/70">
                        {detailStats.sellOrders} sell order{detailStats.sellOrders === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>

                  {(detailStats.lastPurchase || detailStats.lastSold) && (
                    <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
                      {detailStats.lastPurchase && (
                        <p>
                          <span className="font-semibold text-slate-800">Last purchase:</span>{' '}
                          {detailStats.lastPurchase.quantity} unit{detailStats.lastPurchase.quantity === 1 ? '' : 's'} on{' '}
                          {formatDate(detailStats.lastPurchase.date)} ({detailStats.lastPurchase.status})
                        </p>
                      )}
                      {detailStats.lastSold && (
                        <p className={detailStats.lastPurchase ? 'mt-1' : ''}>
                          <span className="font-semibold text-slate-800">Last sold:</span>{' '}
                          {detailStats.lastSold.quantity} unit{detailStats.lastSold.quantity === 1 ? '' : 's'} on{' '}
                          {formatDate(detailStats.lastSold.date)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Recent activity */}
                  <div>
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <History className="h-3.5 w-3.5" /> Recent activity
                    </p>
                    {detailStats.recentActivity.length === 0 ? (
                      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">
                        No orders yet for this item
                      </p>
                    ) : (
                      <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                        {detailStats.recentActivity.map((a, i) => (
                          <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                              a.type === 'purchase order' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
                            }`}>
                              {a.type === 'purchase order'
                                ? <ArrowDownToLine className="h-3 w-3" />
                                : <ArrowUpFromLine className="h-3 w-3" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium capitalize text-slate-700">{a.type}</p>
                              <p className="text-[11px] text-slate-400">{formatDate(a.date)}</p>
                            </div>
                            <span className="text-xs font-semibold text-slate-700">× {a.quantity}</span>
                            <StatusBadge status={a.status} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">
                  Could not load purchase statistics
                </p>
              )}

              <p className="text-[11px] text-slate-400">
                Added {formatDate(detailItem.createdAt)} · Updated {formatDate(detailItem.updatedAt)}
              </p>
            </div>

            <div className="srf-modal-footer">
              <button onClick={closeDetail} className="srf-btn srf-btn-secondary">Close</button>
              <button
                onClick={() => { const it = detailItem; closeDetail(); handleEdit(it); }}
                className="srf-btn srf-btn-primary"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edit Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedItem(null); }}
        onConfirm={handleDelete}
        title="Delete Item"
        message={`${selectedItem?.name} will be permanently removed from inventory. This action cannot be undone.`}
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

      {/* Manage Categories Modal */}
      {showCategoryModal && (
        <div className="srf-modal-backdrop" onClick={() => { setShowCategoryModal(false); setNewCategoryName(''); setEditingCategory(null); }}>
          <div className="srf-modal-panel max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="srf-modal-header">
              <h3 className="srf-modal-title">Manage Categories</h3>
              <button
                onClick={() => { setShowCategoryModal(false); setNewCategoryName(''); setEditingCategory(null); }}
                className="srf-icon-btn"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="srf-modal-body space-y-4">
              {/* Add new category */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New category (e.g. 0.72mm)"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  className="flex-1 min-w-0"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="Check lvl"
                  value={newCategoryCheckLevel}
                  onChange={(e) => setNewCategoryCheckLevel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  className="w-24 shrink-0"
                />
                <button onClick={handleAddCategory} className="srf-btn srf-btn-primary shrink-0">
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>

              {/* Existing categories */}
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-0.5 scrollbar-thin">
                {categories.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">No categories yet</p>
                ) : (
                  categories.map((cat) => (
                    <div key={cat._id} className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-2">
                      {editingCategory?._id === cat._id ? (
                        <>
                          <input
                            type="text"
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveCategory();
                              if (e.key === 'Escape') setEditingCategory(null);
                            }}
                            autoFocus
                            className="min-w-0 flex-1 !px-2 !py-1 !text-[13px]"
                          />
                          <input
                            type="number"
                            min="0"
                            placeholder="Check lvl"
                            value={editingCategoryCheckLevel}
                            onChange={(e) => setEditingCategoryCheckLevel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveCategory();
                              if (e.key === 'Escape') setEditingCategory(null);
                            }}
                            className="w-20 shrink-0 !px-2 !py-1 !text-[13px]"
                          />
                          <button
                            onClick={handleSaveCategory}
                            className="srf-row-action text-emerald-600 hover:bg-emerald-50"
                            title="Save"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setEditingCategory(null)}
                            className="srf-row-action text-slate-400 hover:bg-slate-100"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 truncate text-[13px] font-medium text-slate-800">{cat.name}</span>
                          <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                            {cat.checkLevel != null ? `Check ${cat.checkLevel}` : 'No check level'}
                          </span>
                          <button
                            onClick={() => handleStartEditCategory(cat)}
                            className="srf-row-action text-slate-500 hover:bg-slate-100"
                            title="Rename"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { setCategoryToDelete(cat); setShowDeleteCategoryModal(true); }}
                            className="srf-row-action text-rose-500 hover:bg-rose-50"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Renaming a category also updates every item assigned to it.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Price Update Modal */}
      {showBulkPriceModal && (
        <div className="srf-modal-backdrop" onClick={() => { setShowBulkPriceModal(false); setBulkPriceAmounts({}); }}>
          <div className="srf-modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="srf-modal-header">
              <h3 className="srf-modal-title">Bulk Price Update</h3>
              <button
                onClick={() => { setShowBulkPriceModal(false); setBulkPriceAmounts({}); }}
                className="srf-icon-btn"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="srf-modal-body">
              <p className="mb-4 text-xs leading-relaxed text-slate-500">
                Enter the amount to <span className="font-semibold text-emerald-600">increase (positive)</span> or{' '}
                <span className="font-semibold text-rose-600">decrease (negative)</span> prices per category. Leave blank to skip.
              </p>
              <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1 scrollbar-thin">
                {categories.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">No categories found</p>
                ) : (
                  categories.map((cat) => (
                    <div key={cat._id} className="flex items-center gap-3">
                      <span className="flex-1 truncate text-[13px] font-medium text-slate-800">{cat.name}</span>
                      <div className="relative w-32">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={bulkPriceAmounts[cat.name] ?? ''}
                          onChange={(e) =>
                            setBulkPriceAmounts((prev) => ({ ...prev, [cat.name]: e.target.value }))
                          }
                          className="w-full !pl-7"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="srf-modal-footer">
              <button
                type="button"
                onClick={() => { setShowBulkPriceModal(false); setBulkPriceAmounts({}); }}
                className="srf-btn srf-btn-secondary"
                disabled={bulkPriceLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkPriceUpdate}
                disabled={bulkPriceLoading}
                className="srf-btn srf-btn-success"
              >
                {bulkPriceLoading ? 'Updating…' : 'Apply Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Category Confirmation */}
      <ConfirmModal
        isOpen={showDeleteCategoryModal}
        onClose={() => { setShowDeleteCategoryModal(false); setCategoryToDelete(null); }}
        onConfirm={handleDeleteCategory}
        title="Delete Category"
        message={`The category "${categoryToDelete?.name}" will be removed. Items keep their current category text.`}
        type="danger"
        confirmLabel="Delete"
      />
    </div>
  );
};

export default Items;
