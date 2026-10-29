import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import api, { fetchAll } from '../../utils/api';
import AlertModal from '../../components/AlertModal';
import Pagination from '../../components/Pagination';
import PageHeader from '../../components/PageHeader';
import SortSelect from '../../components/SortSelect';
import FilterPanel from '../../components/FilterPanel';
import PiecesModal from '../../components/PiecesModal';
import ItemDetailModal from '../../components/ItemDetailModal';
import { StockBadge, CheckLevelCell } from '../../components/ItemStockCells';
import { ITEM_SORT_OPTIONS, DEFAULT_SORT } from '../../utils/sortOptions';
import {
  Search, Eye, Package, Boxes, Download, AlertTriangle, ShieldCheck, PackageX, ArchiveRestore
} from 'lucide-react';

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// The admin's item list, view-only. The one thing an accounts manager may
// change is the damaged count: mark stock pieces damaged, or restore damaged
// pieces to stock. Adding, editing, deleting and pricing items stays with the
// admin (and is refused by the server).
const AccountsItems = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [stockState, setStockState] = useState('');
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [categories, setCategories] = useState([]);

  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });
  const [detailItem, setDetailItem] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  // 'stock' lists every item; 'damaged' only the pieces marked damaged
  const [view, setView] = useState('stock');
  const [damagedRows, setDamagedRows] = useState([]);
  const [damagedSummary, setDamagedSummary] = useState({ items: 0, pieces: 0, value: 0 });
  // The item whose stock is being marked damaged / the damaged row being restored
  const [damageTarget, setDamageTarget] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (view === 'damaged') fetchDamaged();
    else fetchItems();
  }, [view, searchTerm, sizeFilter, stockState, sortBy, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [view, searchTerm, sizeFilter, stockState, sortBy, pageSize]);

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

  // Everything the stock list is currently filtered by — shared with the export
  const listFilters = () => ({
    search: searchTerm,
    category: sizeFilter,
    stockState,
    sort: sortBy
  });

  // Search and the category chips carry over; check level and sort are stock-only
  const damagedFilters = () => ({ search: searchTerm, category: sizeFilter });

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await api.get('/items', {
        params: { ...listFilters(), page: currentPage, limit: pageSize }
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

  const fetchDamaged = async () => {
    try {
      setLoading(true);
      const response = await api.get('/damaged-items', {
        params: { ...damagedFilters(), page: currentPage, limit: pageSize }
      });
      if (response.data.success) {
        setDamagedRows(response.data.data);
        setDamagedSummary(response.data.summary);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching damaged items:', error);
    } finally {
      setLoading(false);
    }
  };

  const switchView = (next) => {
    if (next === view) return;
    setLoading(true);
    setView(next);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showAlert = (title, message, type = 'error') => {
    setAlertConfig({ title, message, type });
    setShowAlertModal(true);
  };

  /* ---------- Excel export ---------- */

  // "1mm_below-check-level_search-ash" — names an export after the filters behind it
  const filterSuffix = () => {
    const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    return [
      sizeFilter && slug(sizeFilter),
      view === 'stock' && stockState && `${stockState}-check-level`,
      searchTerm && `search-${slug(searchTerm)}`
    ].filter(Boolean).join('_');
  };

  // Exports exactly what the active view is showing, across all its pages
  const handleExportExcel = async () => {
    setExportLoading(true);
    try {
      const damaged = view === 'damaged';
      const rows = damaged
        ? await fetchAll('/damaged-items', damagedFilters())
        : await fetchAll('/items', listFilters());
      if (rows.length === 0) {
        showAlert('No Data', `No ${damaged ? 'damaged ' : ''}items match the current filters`, 'info');
        return;
      }

      const exportData = damaged
        ? rows.map((row, index) => ({
            'S.No': index + 1,
            'Name': row.item.name,
            'Category': row.item.category || '',
            'Price': row.item.price,
            'Damaged': row.quantity,
            'Value': row.quantity * row.item.price,
            'In Stock': row.item.quantity,
            'Updated': formatDate(row.updatedAt)
          }))
        : rows.map((item, index) => ({
            'S.No': index + 1,
            'Name': item.name,
            'Category': item.category || '',
            'Price': item.price,
            'Quantity': item.quantity,
            'Check Level': item.effectiveCheckLevel ?? '',
            'Stock Status': item.belowCheckLevel ? 'Below check level' : 'OK'
          }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, damaged ? 'Damaged Items' : 'Items');

      const suffix = filterSuffix();

      XLSX.writeFile(
        workbook,
        `${damaged ? 'damaged-items' : 'items'}${suffix ? `_${suffix}` : ''}_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch {
      showAlert('Error', 'Failed to export items', 'error');
    } finally {
      setExportLoading(false);
    }
  };

  /* ---------- Damaged stock ---------- */

  const handleMarkDamaged = async (quantity) => {
    try {
      const response = await api.post('/damaged-items', { item: damageTarget._id, quantity });
      if (response.data.success) {
        setDamageTarget(null);
        fetchItems();
        showAlert('Marked Damaged', `${response.data.message}. Find them under Damaged.`, 'success');
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Could not mark the pieces damaged', 'error');
    }
  };

  const handleRestoreDamaged = async (quantity) => {
    try {
      const response = await api.post(`/damaged-items/${restoreTarget._id}/restore`, { quantity });
      if (response.data.success) {
        setRestoreTarget(null);
        fetchDamaged();
        showAlert('Restored', response.data.message, 'success');
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Could not restore the pieces', 'error');
    }
  };

  const rowActions = (item) => (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}
        className="srf-row-action text-indigo-500 hover:bg-indigo-50"
        title="View Details"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setDamageTarget(item); }}
        disabled={item.quantity === 0}
        className="srf-row-action text-orange-600 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
        title="Mark damaged"
        aria-label="Mark damaged"
      >
        <PackageX className="h-4 w-4" />
      </button>
    </>
  );

  const restoreButton = (row, className = '') => (
    <button
      onClick={() => setRestoreTarget(row)}
      className={`srf-row-action text-emerald-600 hover:bg-emerald-50 ${className}`}
      title="Restore to stock"
      aria-label="Restore to stock"
    >
      <ArchiveRestore className="h-4 w-4" />
    </button>
  );

  return (
    <div className="srf-page">
      <PageHeader title="Items" subtitle="Inventory and damaged stock — managed by the admin">
        <button onClick={handleExportExcel} disabled={exportLoading} className="srf-btn srf-btn-secondary">
          <Download className="h-4 w-4 text-slate-400" />
          {exportLoading ? 'Exporting…' : 'Export Excel'}
        </button>
      </PageHeader>

      {/* Stock / damaged views */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => switchView('stock')}
          className={`srf-chip ${view === 'stock' ? 'srf-chip-active' : ''}`}
        >
          <Boxes className="h-3 w-3" />
          Stock
        </button>
        <button
          type="button"
          onClick={() => switchView('damaged')}
          className={`srf-chip ${view === 'damaged' ? 'srf-chip-active' : 'text-orange-700'}`}
        >
          <PackageX className="h-3 w-3" />
          Damaged
        </button>
      </div>

      {/* Toolbar */}
      <FilterPanel active={[searchTerm, sizeFilter, view === 'stock' && stockState]}>
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
            {view === 'stock' && (
              <SortSelect
                value={sortBy}
                onChange={setSortBy}
                options={ITEM_SORT_OPTIONS}
                className="w-full sm:ml-auto sm:w-auto"
              />
            )}
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
          {view === 'stock' && (
            <div className="flex flex-wrap items-center gap-1.5">
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
          )}
        </div>
      </FilterPanel>

      {/* Stock list */}
      {view === 'stock' && (
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
                        onClick={() => setDetailItem(item)}
                      >
                        <td className="max-w-[300px] truncate font-semibold text-slate-900">{item.name}</td>
                        <td>
                          {item.category
                            ? <span className="srf-badge bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">{item.category}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="font-medium text-slate-800">₹{item.price.toLocaleString('en-IN')}</td>
                        <td><StockBadge item={item} /></td>
                        <td><CheckLevelCell item={item} /></td>
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
                    onClick={() => setDetailItem(item)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{item.name}</p>
                      <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        {rowActions(item)}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
                      <span className="font-semibold text-slate-800">₹{item.price.toLocaleString('en-IN')}</span>
                      <StockBadge item={item} />
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
      )}

      {/* Damaged list */}
      {view === 'damaged' && (
        <div className="srf-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
            </div>
          ) : damagedRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <PackageX className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-700">No damaged items</p>
              <p className="mt-1 text-xs text-slate-400">Mark damaged pieces from an item's row under Stock.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 bg-orange-50/50 px-4 py-2.5 text-[12px] text-orange-900">
                <span><span className="font-bold tabular-nums">{damagedSummary.items}</span> item{damagedSummary.items === 1 ? '' : 's'}</span>
                <span><span className="font-bold tabular-nums">{damagedSummary.pieces}</span> damaged piece{damagedSummary.pieces === 1 ? '' : 's'}</span>
                <span>Worth <span className="font-bold tabular-nums">₹{damagedSummary.value.toLocaleString('en-IN')}</span></span>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="srf-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Damaged</th>
                      <th>Value</th>
                      <th>In Stock</th>
                      <th>Updated</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {damagedRows.map((row) => (
                      <tr key={row._id}>
                        <td className="max-w-[300px] truncate font-semibold text-slate-900">{row.item.name}</td>
                        <td>
                          {row.item.category
                            ? <span className="srf-badge bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">{row.item.category}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="font-medium text-slate-800">₹{row.item.price.toLocaleString('en-IN')}</td>
                        <td>
                          <span className="srf-badge bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200">{row.quantity}</span>
                        </td>
                        <td className="font-medium text-slate-800">₹{(row.quantity * row.item.price).toLocaleString('en-IN')}</td>
                        <td className="tabular-nums">{row.item.quantity}</td>
                        <td className="text-[12px] text-slate-500">{formatDate(row.updatedAt)}</td>
                        <td>
                          <div className="flex items-center justify-end">{restoreButton(row)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile list */}
              <div className="divide-y divide-slate-100 md:hidden">
                {damagedRows.map((row) => (
                  <div key={row._id} className="p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{row.item.name}</p>
                      {restoreButton(row, 'shrink-0')}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500">
                      <span className="srf-badge bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200">{row.quantity} damaged</span>
                      <span className="font-semibold text-slate-800">₹{(row.quantity * row.item.price).toLocaleString('en-IN')}</span>
                      {row.item.category && (
                        <span className="srf-badge bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">{row.item.category}</span>
                      )}
                      <span className="text-[11px] text-slate-400">{row.item.quantity} in stock</span>
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
      )}

      {/* Item detail — view only, plus marking stock damaged */}
      {detailItem && (
        <ItemDetailModal item={detailItem} onClose={() => setDetailItem(null)}>
          <button
            onClick={() => { const it = detailItem; setDetailItem(null); setDamageTarget(it); }}
            disabled={detailItem.quantity === 0}
            className="srf-btn border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
          >
            <PackageX className="h-3.5 w-3.5" />
            Mark Damaged
          </button>
        </ItemDetailModal>
      )}

      {/* Mark stock damaged */}
      {damageTarget && (
        <PiecesModal
          title="Mark Damaged"
          itemName={damageTarget.name}
          available={damageTarget.quantity}
          availableLabel="In stock"
          hint="These pieces come off the stock count and are listed under Damaged."
          confirmLabel="Mark Damaged"
          confirmClass="srf-btn-danger"
          onClose={() => setDamageTarget(null)}
          onConfirm={handleMarkDamaged}
        />
      )}

      {/* Restore damaged pieces to stock */}
      {restoreTarget && (
        <PiecesModal
          title="Restore to Stock"
          itemName={restoreTarget.item.name}
          available={restoreTarget.quantity}
          availableLabel="Damaged"
          hint="For pieces marked damaged by mistake or repaired since — they go back into stock."
          confirmLabel="Restore"
          confirmClass="srf-btn-success"
          onClose={() => setRestoreTarget(null)}
          onConfirm={handleRestoreDamaged}
        />
      )}

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

export default AccountsItems;
