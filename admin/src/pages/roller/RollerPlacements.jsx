import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import ConfirmModal from '../../components/ConfirmModal';
import AlertModal from '../../components/AlertModal';
import Pagination from '../../components/Pagination';
import {
  Search, X, Package, LayoutGrid, Table2, Trash2, MapPin,
  MousePointerClick, Check, RefreshCw, Boxes
} from 'lucide-react';

const ITEM_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 350;

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// Item placement: pick an item, then drop or tap it into raks that have space.
// A rak is shared by however many items fit inside its space, and one item can
// spill across as many raks as it needs. Anything that does not fit stays in
// the item list as "still to place".
const RollerPlacements = () => {
  // ---- items still waiting for a rak ----------------------------------
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [searchDraft, setSearchDraft] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(ITEM_PAGE_SIZE);
  const [itemPagination, setItemPagination] = useState({ total: 0, pages: 0 });

  // ---- raks (one fetch feeds both the available and placed tables) -----
  const [raks, setRaks] = useState([]);
  const [raksLoading, setRaksLoading] = useState(true);
  const [rakSearch, setRakSearch] = useState('');
  const [placedSearch, setPlacedSearch] = useState('');
  const [rakView, setRakView] = useState('map');

  // ---- interaction state ----------------------------------------------
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedRakIds, setSelectedRakIds] = useState([]);
  const [qtyDraft, setQtyDraft] = useState('');
  const [draggingItem, setDraggingItem] = useState(null);
  const [dragOverRakId, setDragOverRakId] = useState(null);
  const [placing, setPlacing] = useState(false);

  const [removeTarget, setRemoveTarget] = useState(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });

  const showAlert = (title, message, type = 'error') => {
    setAlertConfig({ title, message, type });
    setShowAlertModal(true);
  };

  // Debounce the search box so 800+ items aren't re-queried per keystroke
  useEffect(() => {
    const t = setTimeout(() => setItemSearch(searchDraft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    setItemPage(1);
  }, [itemSearch, categoryFilter, itemPageSize]);

  const fetchItems = useCallback(async () => {
    try {
      setItemsLoading(true);
      const response = await api.get('/placements/items-to-place', {
        params: {
          search: itemSearch,
          category: categoryFilter,
          sort: 'name_asc',
          page: itemPage,
          limit: itemPageSize
        }
      });
      if (response.data.success) {
        setItems(response.data.data);
        setItemPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setItemsLoading(false);
    }
  }, [itemSearch, categoryFilter, itemPage, itemPageSize]);

  const fetchRaks = useCallback(async () => {
    try {
      setRaksLoading(true);
      const response = await api.get('/raks/roller/list', {
        params: { sort: 'name_asc', limit: 1000 }
      });
      if (response.data.success) setRaks(response.data.data);
    } catch (error) {
      console.error('Error fetching raks:', error);
    } finally {
      setRaksLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { fetchRaks(); }, [fetchRaks]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await api.get('/categories');
        if (response.data.success) setCategories(response.data.data);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };
    fetchCategories();
  }, []);

  // Another roller placing stock should update this screen too
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => { fetchRaks(); fetchItems(); };
    socket.on('placements_updated', refresh);
    socket.on('raks_updated', fetchRaks);
    return () => {
      socket.off('placements_updated', refresh);
      socket.off('raks_updated', fetchRaks);
    };
  }, [fetchRaks, fetchItems]);

  // ---- derived ---------------------------------------------------------
  const availableRaks = useMemo(() => raks.filter((r) => (r.freeQty ?? 0) > 0), [raks]);

  // One row per item-in-rak, since a rak can hold several different items
  const placedRows = useMemo(
    () => raks.flatMap((rak) => (rak.placements || []).map((p) => ({ rak, placement: p }))),
    [raks]
  );

  // How many raks each item is spread across — shown on the item cards
  const rakCountByItem = useMemo(() => {
    const counts = new Map();
    placedRows.forEach(({ placement }) => {
      const id = String(placement.item?._id || placement.item || '');
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    });
    return counts;
  }, [placedRows]);

  const matchesRak = (rak, term) => {
    const q = term.trim().toLowerCase();
    if (!q) return true;
    return `${rak.code} ${rak.name}`.toLowerCase().includes(q);
  };

  const visibleAvailable = useMemo(
    () => availableRaks.filter((r) => matchesRak(r, rakSearch)),
    [availableRaks, rakSearch]
  );

  // The seat map shows full slots too (greyed out) so the layout still reads
  // like the physical floor
  const visibleMapRaks = useMemo(
    () => raks.filter((r) => matchesRak(r, rakSearch)),
    [raks, rakSearch]
  );

  const visiblePlaced = useMemo(
    () =>
      placedRows.filter(({ rak, placement }) => {
        const q = placedSearch.trim().toLowerCase();
        if (!q) return true;
        const itemName = placement.item?.name || '';
        return `${rak.code} ${rak.name} ${itemName}`.toLowerCase().includes(q);
      }),
    [placedRows, placedSearch]
  );

  const totalSpace = raks.reduce((sum, r) => sum + (r.capacity || 0), 0);
  const totalUsed = raks.reduce((sum, r) => sum + (r.usedQty || 0), 0);

  // Space across the raks currently ticked — tells the roller up front how much
  // of the item will actually fit
  const selectedSpace = useMemo(
    () => raks
      .filter((r) => selectedRakIds.includes(r._id))
      .reduce((sum, r) => sum + (r.freeQty || 0), 0),
    [raks, selectedRakIds]
  );

  // ---- actions ---------------------------------------------------------
  const placeInRaks = async (item, rakIds, quantity) => {
    if (!item || rakIds.length === 0) return;
    try {
      setPlacing(true);
      const payload = { item: item._id, raks: rakIds };
      const asked = parseInt(quantity, 10);
      if (!Number.isNaN(asked) && asked > 0) payload.quantity = asked;

      const response = await api.post('/placements', payload);
      if (response.data.success) {
        setSelectedRakIds([]);
        setQtyDraft('');
        // Fully placed items drop out of the list, so clear the selection
        if ((response.data.data?.remaining ?? 0) <= 0) setSelectedItem(null);
        await Promise.all([fetchRaks(), fetchItems()]);
        showAlert('Placed', response.data.message, 'success');
      }
    } catch (error) {
      showAlert('Could not place', error.response?.data?.message || 'An error occurred', 'error');
      fetchRaks();
      fetchItems();
    } finally {
      setPlacing(false);
    }
  };

  const handleRemovePlacement = async () => {
    if (!removeTarget) return;
    try {
      const response = await api.delete(`/placements/${removeTarget.placement._id}`);
      if (response.data.success) {
        setRemoveTarget(null);
        fetchRaks();
        fetchItems();
      }
    } catch (error) {
      setRemoveTarget(null);
      showAlert('Error', error.response?.data?.message || 'An error occurred', 'error');
    }
  };

  const toggleRakSelection = (rak) => {
    if ((rak.freeQty ?? 0) <= 0) return;
    setSelectedRakIds((prev) =>
      prev.includes(rak._id) ? prev.filter((id) => id !== rak._id) : [...prev, rak._id]
    );
  };

  const selectItem = (item) => {
    const isSelected = selectedItem?._id === item._id;
    setSelectedItem(isSelected ? null : item);
    setQtyDraft('');
    if (isSelected) setSelectedRakIds([]);
  };

  // ---- drag and drop ---------------------------------------------------
  const onItemDragStart = (e, item) => {
    e.dataTransfer.setData('text/plain', item._id);
    e.dataTransfer.effectAllowed = 'copy';

    // Drag a compact pill instead of a snapshot of the full-width row, so the
    // cursor stays readable over the seat map. Inline styles keep the ghost
    // independent of the stylesheet, since it lives outside React's tree.
    const ghost = document.createElement('div');
    ghost.textContent = `${item.name} · ${item.remainingQty}`;
    Object.assign(ghost.style, {
      position: 'fixed',
      top: '-1000px',
      left: '-1000px',
      maxWidth: '190px',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
      padding: '7px 12px',
      borderRadius: '9999px',
      background: '#4f46e5',
      color: '#ffffff',
      fontSize: '12px',
      fontWeight: '600',
      lineHeight: '16px',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      boxShadow: '0 6px 16px rgba(15, 23, 42, 0.28)',
      pointerEvents: 'none'
    });
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 16, 16);
    // The browser snapshots the node during setDragImage, so it can go straight away
    setTimeout(() => ghost.remove(), 0);

    setDraggingItem(item);
    setSelectedItem(item);
  };

  const onRakDragOver = (e, rak) => {
    if ((rak.freeQty ?? 0) <= 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverRakId(rak._id);
  };

  const onRakDrop = (e, rak) => {
    e.preventDefault();
    setDragOverRakId(null);
    if ((rak.freeQty ?? 0) <= 0) return;

    const droppedId = e.dataTransfer.getData('text/plain');
    const item = items.find((i) => i._id === droppedId) || draggingItem;
    setDraggingItem(null);
    if (!item) return;
    // A drop fills the rak with as much of the item as it will take
    placeInRaks(item, [rak._id], qtyDraft);
  };

  const dropHandlers = (rak) => ({
    onDragOver: (e) => onRakDragOver(e, rak),
    onDragLeave: () => setDragOverRakId((id) => (id === rak._id ? null : id)),
    onDrop: (e) => onRakDrop(e, rak)
  });

  const seatClass = (rak) => {
    const free = rak.freeQty ?? 0;
    const used = rak.usedQty ?? 0;
    if (free <= 0) return 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400';
    if (dragOverRakId === rak._id) return 'border-indigo-500 bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300';
    if (selectedRakIds.includes(rak._id)) return 'border-indigo-500 bg-indigo-600 text-white';
    if (used > 0) return 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100';
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100';
  };

  const willPlace = selectedItem
    ? Math.min(
        parseInt(qtyDraft, 10) > 0 ? parseInt(qtyDraft, 10) : selectedItem.remainingQty,
        selectedItem.remainingQty,
        selectedSpace || Infinity
      )
    : 0;

  return (
    <div className="space-y-3.5 pb-16">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="srf-page-title">Item placement</h1>
          <p className="srf-page-sub">
            {totalUsed} of {totalSpace} space used · {availableRaks.length} of {raks.length} raks have room
          </p>
        </div>
        <button
          onClick={() => { fetchRaks(); fetchItems(); }}
          className="srf-btn srf-btn-secondary shrink-0"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${raksLoading || itemsLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* How-to */}
      <div className="flex items-start gap-2 rounded-xl bg-indigo-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-indigo-800 ring-1 ring-indigo-100">
        <MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Tap an item to pick it up, then tap raks with room and press <b>Place</b>.
          On a computer you can also drag an item straight onto a rak. Whatever does not fit
          stays in the item list.
        </p>
      </div>

      {/* The two panels that drag-and-drop connects sit side by side from lg up,
          so an item and its target rak are visible at the same time */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 lg:items-start">
        {/* ---------------- 1. Items still to place ---------------- */}
        <section className="srf-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
            <Package className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Items to place</h2>
            <span className="ml-auto text-[11px] font-medium text-slate-400">
              {itemPagination.total} pending
            </span>
          </div>

          {/* Search + category filter */}
          <div className="space-y-2.5 border-b border-slate-100 p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search items by name…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="w-full !pl-9"
              />
              {searchDraft && (
                <button
                  onClick={() => setSearchDraft('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none">
              <button
                type="button"
                onClick={() => setCategoryFilter('')}
                className={`srf-chip ${categoryFilter === '' ? 'srf-chip-active' : ''}`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat._id}
                  type="button"
                  onClick={() => setCategoryFilter(categoryFilter === cat.name ? '' : cat.name)}
                  className={`srf-chip ${categoryFilter === cat.name ? 'srf-chip-active' : ''}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {itemsLoading ? (
            <div className="flex items-center justify-center p-10">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-600" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {itemSearch || categoryFilter
                ? 'No pending items match your search'
                : 'Everything in stock has been placed'}
            </p>
          ) : (
            <>
              <div className="divide-y divide-slate-100 lg:max-h-[27rem] lg:overflow-y-auto">
                {items.map((item) => {
                  const isSelected = selectedItem?._id === item._id;
                  const rakCount = rakCountByItem.get(String(item._id)) || 0;

                  return (
                    <div
                      key={item._id}
                      draggable
                      onDragStart={(e) => onItemDragStart(e, item)}
                      onDragEnd={() => setDraggingItem(null)}
                      onClick={() => selectItem(item)}
                      className={`flex cursor-grab items-center gap-3 px-3.5 py-3 transition-colors active:cursor-grabbing ${
                        isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {isSelected ? <Check className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-slate-900">{item.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {item.category || 'Uncategorised'} · Stock {item.quantity ?? 0}
                          {item.effectiveCheckLevel != null && ` · Check ${item.effectiveCheckLevel}`}
                          {item.placedQty > 0 && ` · ${item.placedQty} placed`}
                        </p>
                        {item.belowCheckLevel && (
                          <p className="mt-0.5 text-[10px] font-semibold text-amber-600">Below check level</p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[15px] font-bold tabular-nums text-slate-900">
                          {item.remainingQty}
                        </p>
                        <p className="text-[10px] font-medium text-slate-400">to place</p>
                        {rakCount > 0 && (
                          <p className="mt-0.5 flex items-center justify-end gap-0.5 text-[10px] text-amber-600">
                            <MapPin className="h-2.5 w-2.5" />
                            {rakCount} rak{rakCount > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <Pagination
                currentPage={itemPage}
                totalPages={itemPagination.pages}
                totalItems={itemPagination.total}
                itemsPerPage={itemPageSize}
                onPageChange={setItemPage}
                onPageSizeChange={setItemPageSize}
              />
            </>
          )}
        </section>

        {/* ---------------- 2. Raks with space ---------------- */}
        <section className="srf-card overflow-hidden lg:sticky lg:top-3">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
            <LayoutGrid className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Available raks</h2>
            <span className="ml-auto text-[11px] font-medium text-slate-400">
              {visibleAvailable.reduce((sum, r) => sum + (r.freeQty || 0), 0)} space free
            </span>
          </div>

          <div className="space-y-2.5 border-b border-slate-100 p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search raks by code or name…"
                value={rakSearch}
                onChange={(e) => setRakSearch(e.target.value)}
                className="w-full !pl-9"
              />
              {rakSearch && (
                <button
                  onClick={() => setRakSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                  aria-label="Clear rak search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRakView('map')}
                className={`srf-chip ${rakView === 'map' ? 'srf-chip-active' : ''}`}
              >
                <LayoutGrid className="h-3 w-3" />
                Seat map
              </button>
              <button
                type="button"
                onClick={() => setRakView('table')}
                className={`srf-chip ${rakView === 'table' ? 'srf-chip-active' : ''}`}
              >
                <Table2 className="h-3 w-3" />
                Table
              </button>
            </div>
          </div>

          {raksLoading ? (
            <div className="flex items-center justify-center p-10">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-600" />
            </div>
          ) : rakView === 'map' ? (
            <div className="p-3 lg:max-h-[27rem] lg:overflow-y-auto">
              {/* Legend */}
              <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded border border-emerald-200 bg-emerald-50" /> Empty
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded border border-amber-200 bg-amber-50" /> Part full
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded border border-indigo-500 bg-indigo-600" /> Selected
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded border border-slate-200 bg-slate-100" /> Full
                </span>
              </div>

              {visibleMapRaks.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No raks match your search</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {visibleMapRaks.map((rak) => {
                    const free = rak.freeQty ?? 0;
                    const holding = (rak.placements || [])
                      .map((p) => `${p.item?.name || 'item'} ×${p.quantity}`)
                      .join(', ');

                    return (
                      <button
                        key={rak._id}
                        type="button"
                        disabled={free <= 0 || placing}
                        onClick={() => toggleRakSelection(rak)}
                        {...dropHandlers(rak)}
                        title={
                          free <= 0
                            ? `${rak.code} — full (${holding})`
                            : `${rak.code} — ${free} of ${rak.capacity} free${holding ? ` · holding ${holding}` : ''}`
                        }
                        className={`min-h-12 min-w-16 rounded-lg border px-2 py-1.5 text-[11px] font-semibold leading-tight transition-colors ${seatClass(rak)}`}
                      >
                        {rak.code}
                        <span className="mt-0.5 block text-[10px] font-medium opacity-80 tabular-nums">
                          {free > 0 ? `${free} free` : 'full'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : visibleAvailable.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No raks with space match your search</p>
          ) : (
            <div className="overflow-x-auto lg:max-h-[27rem] lg:overflow-y-auto">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th className="w-10"></th>
                    <th>Code</th>
                    <th>Name</th>
                    <th className="text-right">Free</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAvailable.map((rak) => {
                    const isSelected = selectedRakIds.includes(rak._id);
                    return (
                      <tr
                        key={rak._id}
                        {...dropHandlers(rak)}
                        className={dragOverRakId === rak._id ? 'bg-indigo-50' : ''}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRakSelection(rak)}
                            aria-label={`Select rak ${rak.code}`}
                            className="h-4 w-4 accent-indigo-600"
                          />
                        </td>
                        <td className="font-semibold text-slate-900">{rak.code}</td>
                        <td>
                          {rak.name}
                          <span className="block text-[11px] text-slate-400 tabular-nums">
                            {rak.usedQty}/{rak.capacity} used
                          </span>
                        </td>
                        <td className="text-right font-medium tabular-nums text-slate-800">{rak.freeQty}</td>
                        <td className="text-right">
                          <button
                            onClick={() => selectedItem && placeInRaks(selectedItem, [rak._id], qtyDraft)}
                            disabled={!selectedItem || placing}
                            className="srf-btn srf-btn-secondary !px-2.5 !py-1.5 !text-[12px] disabled:opacity-40"
                            title={selectedItem ? `Place ${selectedItem.name} here` : 'Pick an item first'}
                          >
                            Place here
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* ---------------- 3. Placed raks ---------------- */}
      <section className="srf-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
          <MapPin className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Placed raks</h2>
          <span className="ml-auto text-[11px] font-medium text-slate-400">
            {visiblePlaced.length} placement{visiblePlaced.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="border-b border-slate-100 p-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by rak or item…"
              value={placedSearch}
              onChange={(e) => setPlacedSearch(e.target.value)}
              className="w-full !pl-9"
            />
            {placedSearch && (
              <button
                onClick={() => setPlacedSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="Clear placed search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {raksLoading ? (
          <div className="flex items-center justify-center p-10">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : visiblePlaced.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Nothing placed yet — drop an item onto a rak above
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="srf-table">
              <thead>
                <tr>
                  <th>Rak</th>
                  <th>Item</th>
                  <th className="text-right">Qty</th>
                  <th className="hidden sm:table-cell">Placed by</th>
                  <th className="hidden sm:table-cell">On</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visiblePlaced.map(({ rak, placement }) => (
                  <tr key={placement._id}>
                    <td className="font-semibold text-slate-900">
                      {rak.code}
                      <span className="block text-[11px] font-normal tabular-nums text-slate-400">
                        {rak.usedQty}/{rak.capacity} used
                      </span>
                    </td>
                    <td>
                      {placement.item?.name || 'Deleted item'}
                      <span className="block text-[11px] text-slate-400">
                        {placement.item?.category || '—'}
                      </span>
                    </td>
                    <td className="text-right font-semibold tabular-nums text-slate-900">
                      {placement.quantity}
                    </td>
                    <td className="hidden sm:table-cell">{placement.placedByName || '—'}</td>
                    <td className="hidden sm:table-cell">
                      {placement.createdAt ? formatDate(placement.createdAt) : '—'}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => setRemoveTarget({ rak, placement })}
                        className="srf-row-action text-rose-500 hover:bg-rose-50"
                        title="Remove placement"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Sticky action bar — the "enter" half of enter-or-drag */}
      {selectedItem && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+56px)] z-40 px-3">
          <div className="mx-auto flex max-w-6xl items-center gap-2.5 rounded-xl bg-slate-900 px-3 py-2.5 shadow-xl">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-white">{selectedItem.name}</p>
              <p className="text-[11px] text-slate-400 tabular-nums">
                {selectedRakIds.length === 0
                  ? `${selectedItem.remainingQty} to place — pick raks above`
                  : `${selectedRakIds.length} rak${selectedRakIds.length > 1 ? 's' : ''} · ${selectedSpace} space → will place ${willPlace}`}
              </p>
            </div>

            <input
              type="number"
              min={1}
              max={selectedItem.remainingQty}
              value={qtyDraft}
              onChange={(e) => setQtyDraft(e.target.value)}
              placeholder="All"
              aria-label="Quantity to place"
              title={`Leave blank to place all ${selectedItem.remainingQty}`}
              className="w-20 shrink-0 !border-white/15 !bg-white/10 !text-white placeholder:!text-slate-400"
            />

            <button
              onClick={() => { setSelectedItem(null); setSelectedRakIds([]); setQtyDraft(''); }}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Cancel selection"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={() => placeInRaks(selectedItem, selectedRakIds, qtyDraft)}
              disabled={selectedRakIds.length === 0 || placing}
              className="srf-btn bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              {placing ? 'Placing…' : 'Place'}
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemovePlacement}
        title="Remove placement?"
        message={`${removeTarget?.placement?.quantity || ''} × "${removeTarget?.placement?.item?.name || 'the item'}" will be taken out of rak ${removeTarget?.rak?.code || ''} and returned to the list of items to place.`}
        type="danger"
        confirmLabel="Remove"
      />

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

export default RollerPlacements;
