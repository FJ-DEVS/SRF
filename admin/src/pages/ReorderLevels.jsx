import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import SortSelect from '../components/SortSelect';
import { ITEM_SORT_OPTIONS } from '../utils/sortOptions';
import {
  PERIOD_UNITS, ruleText, unitLabel, hasPeriod, periodWindow, dayCount, formatDay, formatRange, toDayString
} from '../utils/reorderRules';
import PeriodCalendar from '../components/PeriodCalendar';
import FilterPanel from '../components/FilterPanel';
import {
  Search, X, Edit2, SlidersHorizontal, Layers, ClipboardList, ArrowRight, Eraser, Gauge, CalendarDays
} from 'lucide-react';

const blankRule = () => ({
  quantity: '', periodValue: '', periodUnit: 'months', periodMode: 'rolling', periodFrom: '', periodTo: '', criteria: 'higher'
});

const ruleToForm = (rule) =>
  rule
    ? {
        quantity: rule.quantity ?? '',
        periodValue: rule.periodValue ?? '',
        periodUnit: rule.periodUnit || 'months',
        periodMode: rule.periodMode || 'rolling',
        periodFrom: rule.periodFrom || '',
        periodTo: rule.periodTo || '',
        criteria: rule.criteria || 'higher'
      }
    : blankRule();

const ruleIsBlank = (form) => form.quantity === '' && !hasPeriod(form);

// One rule's inputs, laid out like Tally's "setreorderitem" row:
// Quantity | or consumption for the last N Units | Criteria
// — with a calendar underneath showing exactly which days the period counts
const RuleFields = ({ title, hint, quantityLabel, value, onChange }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  // Opened by hand when there is no period yet, to pick custom dates
  const [calendarOpen, setCalendarOpen] = useState(false);

  const periodOn = hasPeriod(value);
  const custom = value.periodMode === 'custom';
  const both = value.quantity !== '' && periodOn;
  const window = periodOn ? periodWindow(value) : null;
  const n = Number(value.periodValue) || 0;
  const unitWord = unitLabel(value.periodUnit, n || 2).toLowerCase();
  const oneUnit = unitLabel(value.periodUnit, 1).toLowerCase();

  const pickCustom = (from, to) =>
    set({ periodMode: 'custom', periodFrom: toDayString(from), periodTo: toDayString(to) });
  const leaveCustom = () => set({ periodMode: 'rolling', periodFrom: '', periodTo: '' });

  const modeHint = custom
    ? 'Fixed dates — this period does not move forward with time.'
    : value.periodMode === 'calendar'
    ? `The ${n} whole ${unitWord} before this ${oneUnit}; nothing from the current ${oneUnit}.`
    : `From the same day ${n} ${unitWord} back, including this ${oneUnit} so far.`;

  return (
    <fieldset className="rounded-xl border border-slate-200 p-3.5">
      <legend className="px-1.5 font-display text-[13px] font-bold text-slate-900">{title}</legend>
      <p className="-mt-1 mb-3 text-[11px] text-slate-400">{hint}</p>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div>
          <label className="mb-1.5 block">{quantityLabel}</label>
          <input
            type="number"
            min="0"
            step="1"
            value={value.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
            className="w-full"
            placeholder="e.g. 100"
          />
        </div>
        <span className="pb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">or</span>
        <div>
          <label className="mb-1.5 block">Consumption for the last</label>
          <div className="flex gap-1.5">
            <input
              type="number"
              min="1"
              step="1"
              value={value.periodValue}
              onChange={(e) => set({ periodValue: e.target.value })}
              disabled={custom}
              className="w-full min-w-0 disabled:bg-slate-50 disabled:text-slate-400"
              placeholder="e.g. 2"
            />
            <select
              value={value.periodUnit}
              onChange={(e) => set({ periodUnit: e.target.value })}
              disabled={custom}
              className="shrink-0 disabled:bg-slate-50 disabled:text-slate-400"
            >
              {PERIOD_UNITS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* The period, spelled out and drawn */}
      {periodOn || calendarOpen ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {custom ? (
              <>
                <span className="srf-badge bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  <CalendarDays className="h-3 w-3" />
                  Custom period
                </span>
                <button type="button" onClick={leaveCustom} className="ml-1 text-[11px] font-semibold text-indigo-600 hover:underline">
                  {n ? `Use the last ${n} ${unitWord} instead` : 'Remove custom period'}
                </button>
              </>
            ) : (
              <>
                <span className="mr-1 text-[11px] font-semibold text-slate-500">Count</span>
                <button
                  type="button"
                  onClick={() => set({ periodMode: 'rolling' })}
                  className={`srf-chip !py-1 ${value.periodMode !== 'calendar' ? 'srf-chip-active' : ''}`}
                >
                  Up to today
                </button>
                <button
                  type="button"
                  onClick={() => set({ periodMode: 'calendar' })}
                  className={`srf-chip !py-1 ${value.periodMode === 'calendar' ? 'srf-chip-active' : ''}`}
                >
                  Whole {unitWord}
                </button>
              </>
            )}
          </div>

          {window ? (
            <p className="mt-2 text-[12px] text-slate-700">
              Counts sales from <span className="font-semibold text-slate-900">{formatDay(window.from)}</span> to{' '}
              <span className="font-semibold text-slate-900">{formatDay(window.to)}</span>
              <span className="text-slate-400"> · {dayCount(window)} days · {modeHint}</span>
            </p>
          ) : (
            <p className="mt-2 text-[12px] text-slate-500">Enter a period above, or pick the first and last day below.</p>
          )}

          <div className="mt-3">
            <PeriodCalendar range={window} onPick={pickCustom} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCalendarOpen(true)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Pick the period on a calendar
        </button>
      )}

      <div className={`mt-3 flex items-center gap-2 transition-opacity ${both ? '' : 'opacity-50'}`}>
        <span className="text-xs font-semibold text-slate-600">Criteria</span>
        <div className="flex gap-1">
          {['higher', 'lower'].map((c) => (
            <button
              key={c}
              type="button"
              disabled={!both}
              onClick={() => set({ criteria: c })}
              className={`srf-chip capitalize ${value.criteria === c ? 'srf-chip-active' : ''} disabled:cursor-not-allowed`}
            >
              {c}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-400">
          {both ? `Use the ${value.criteria} of the two` : 'Applies when both are given'}
        </span>
      </div>
    </fieldset>
  );
};

// Edits the reorder rules of one item, or of every item behind a filter
const RuleModal = ({ title, subtitle, initial, bulkCount, onClose, onSave }) => {
  const [level, setLevel] = useState(ruleToForm(initial?.level));
  const [minOrder, setMinOrder] = useState(ruleToForm(initial?.minOrder));
  const [saving, setSaving] = useState(false);

  const blank = ruleIsBlank(level) && ruleIsBlank(minOrder);

  const submit = async (e) => {
    e?.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave({ level, minOrder });
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({ level: blankRule(), minOrder: blankRule() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <div className="srf-modal-panel max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="srf-modal-header">
          <div className="min-w-0">
            <h3 className="srf-modal-title">{title}</h3>
            {subtitle && <p className="truncate text-[11px] text-slate-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="srf-icon-btn shrink-0" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="srf-modal-body space-y-4">
          <RuleFields
            title="Reorder Level"
            hint="Stock is brought back up to this level. The shortfall is the level less what is available."
            quantityLabel="Reorder quantity"
            value={level}
            onChange={setLevel}
          />
          <RuleFields
            title="Minimum Order Quantity"
            hint="A purchase order never holds less than this once the item is short."
            quantityLabel="Minimum quantity"
            value={minOrder}
            onChange={setMinOrder}
          />
          <p className="text-[11px] leading-relaxed text-slate-400">
            Consumption counts pieces sold less pieces returned in the period, up to today.
            Leave both sides blank to drop the rule — the item is then no longer reordered.
          </p>
        </form>

        <div className="srf-modal-footer">
          {initial && (
            <button type="button" onClick={clear} disabled={saving} className="srf-btn srf-btn-secondary mr-auto !text-rose-600">
              <Eraser className="h-4 w-4" />
              Clear
            </button>
          )}
          <button type="button" onClick={onClose} className="srf-btn srf-btn-secondary">Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="srf-btn srf-btn-primary">
            {saving ? 'Saving…' : bulkCount != null ? `Apply to ${bulkCount} item${bulkCount === 1 ? '' : 's'}` : blank ? 'Clear rule' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ReorderLevels = () => {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  // The Reorder page links here with ?configured=no for its untracked items
  const [configured, setConfigured] = useState(searchParams.get('configured') || '');
  const [sortBy, setSortBy] = useState('item_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [summary, setSummary] = useState({ configuredTotal: 0 });
  const [categories, setCategories] = useState([]);

  // The row being edited, or 'bulk' for every item behind the current filter
  const [editTarget, setEditTarget] = useState(null);
  const [pendingBulk, setPendingBulk] = useState(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });

  useEffect(() => {
    api.get('/categories')
      .then((res) => { if (res.data.success) setCategories(res.data.data); })
      .catch((error) => console.error('Error fetching categories:', error));
  }, []);

  useEffect(() => {
    fetchRows();
  }, [searchTerm, categoryFilter, configured, sortBy, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, configured, sortBy, pageSize]);

  const listFilters = () => ({ search: searchTerm, category: categoryFilter, configured, sort: sortBy });

  const fetchRows = async () => {
    try {
      setLoading(true);
      const response = await api.get('/reorder/levels', {
        params: { ...listFilters(), page: currentPage, limit: pageSize }
      });
      if (response.data.success) {
        setRows(response.data.data);
        setSummary(response.data.summary);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching reorder levels:', error);
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (title, message, type = 'error') => {
    setAlertConfig({ title, message, type });
    setShowAlertModal(true);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveOne = async (config) => {
    try {
      const response = await api.put(`/reorder/levels/${editTarget._id}`, config);
      if (response.data.success) {
        setRows((prev) => prev.map((r) => (r._id === editTarget._id ? response.data.data : r)));
        setSummary((s) => ({
          ...s,
          configuredTotal: s.configuredTotal + (response.data.data.reorder ? 1 : 0) - (editTarget.reorder ? 1 : 0)
        }));
        setEditTarget(null);
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Could not save the reorder level', 'error');
    }
  };

  // Bulk: the modal hands over the rules, a confirm step then applies them
  const stageBulk = async (config) => {
    setPendingBulk(config);
    setEditTarget(null);
  };

  const applyBulk = async () => {
    if (!pendingBulk) return;
    const config = pendingBulk;
    setPendingBulk(null);
    try {
      const response = await api.put('/reorder/levels/bulk', {
        search: searchTerm,
        category: categoryFilter,
        configured,
        ...config
      });
      if (response.data.success) {
        fetchRows();
        showAlert('Reorder Levels Updated', response.data.message, 'success');
      }
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Could not apply the reorder levels', 'error');
    }
  };

  const filterLabel = () =>
    [categoryFilter || 'all categories', searchTerm && `search "${searchTerm}"`].filter(Boolean).join(', ');

  // Bulk apply covers every item behind the current filters, not just the page
  const bulkCount = pagination.total;

  const levelCell = (row) => {
    if (row.reorderLevel == null) return <span className="text-slate-300">—</span>;
    return (
      <span className="inline-flex items-center gap-1 tabular-nums">
        <span className="font-semibold text-slate-900">{row.reorderLevel}</span>
        {row.levelConsumption != null && (
          <span className="text-[11px] text-slate-400" title={`Consumed ${formatRange(row.levelWindow)}`}>· used {row.levelConsumption}</span>
        )}
      </span>
    );
  };

  const ruleCell = (rule) =>
    rule
      ? <span className="text-[13px] text-slate-700">{ruleText(rule)}</span>
      : <span className="text-slate-300">—</span>;

  return (
    <div className="srf-page">
      <PageHeader title="Reorder Levels" subtitle="How each item's reorder level and minimum order quantity are worked out">
        <Link to="/reorder" className="srf-btn srf-btn-secondary">
          <ClipboardList className="h-4 w-4 text-slate-400" />
          Reorder status
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <button
          onClick={() => setEditTarget('bulk')}
          disabled={loading || bulkCount === 0}
          className="srf-btn srf-btn-primary"
          title={`Set the same rules on all ${bulkCount} item(s) in view`}
        >
          <Layers className="h-4 w-4" />
          Apply to {bulkCount} in view
        </button>
      </PageHeader>

      {/* Toolbar */}
      <FilterPanel active={[searchTerm, categoryFilter, configured]}>
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
            <SortSelect value={sortBy} onChange={setSortBy} options={ITEM_SORT_OPTIONS} className="w-full sm:ml-auto sm:w-auto" />
          </div>

          <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none">
            <button type="button" onClick={() => setCategoryFilter('')} className={`srf-chip ${categoryFilter === '' ? 'srf-chip-active' : ''}`}>
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

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setConfigured(configured === 'yes' ? '' : 'yes')}
              className={`srf-chip ${configured === 'yes' ? 'srf-chip-active' : 'text-indigo-700'}`}
            >
              <SlidersHorizontal className="h-3 w-3" />
              With a rule
            </button>
            <button
              type="button"
              onClick={() => setConfigured(configured === 'no' ? '' : 'no')}
              className={`srf-chip ${configured === 'no' ? 'srf-chip-active' : 'text-amber-700'}`}
            >
              <Gauge className="h-3 w-3" />
              Without a rule
            </button>
            <span className="ml-auto text-[11px] text-slate-400">
              <span className="font-semibold text-slate-700 tabular-nums">{summary.configuredTotal}</span> item{summary.configuredTotal === 1 ? '' : 's'} with a rule
            </span>
          </div>
        </div>
      </FilterPanel>

      {/* List */}
      <div className="srf-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <SlidersHorizontal className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No items found</p>
            <p className="mt-1 text-xs text-slate-400">Try a different search or filter.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Name of Item</th>
                    <th>Category</th>
                    <th className="text-right">Stock</th>
                    <th>Reorder Level Rule</th>
                    <th className="text-right">Current Level</th>
                    <th>Min Order Rule</th>
                    <th className="text-right">Current Min</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row._id} className="cursor-pointer" onClick={() => setEditTarget(row)}>
                      <td className="max-w-[300px] truncate font-semibold text-slate-900">{row.name}</td>
                      <td>
                        {row.category
                          ? <span className="srf-badge bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200">{row.category}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="text-right tabular-nums">{row.quantity}</td>
                      <td>{ruleCell(row.reorder?.level)}</td>
                      <td className="text-right">{levelCell(row)}</td>
                      <td>{ruleCell(row.reorder?.minOrder)}</td>
                      <td className="text-right tabular-nums">
                        {row.reorder?.minOrder ? <span className="font-semibold text-slate-900">{row.minOrderQty}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td>
                        <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => setEditTarget(row)} className="srf-row-action text-slate-500 hover:bg-slate-100" title="Set reorder level">
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {rows.map((row) => (
                <div key={row._id} className="p-3.5" onClick={() => setEditTarget(row)}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{row.name}</p>
                    <button onClick={(e) => { e.stopPropagation(); setEditTarget(row); }} className="srf-row-action shrink-0 text-slate-500 hover:bg-slate-100" title="Set reorder level">
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>Stock <span className="font-semibold text-slate-800">{row.quantity}</span></span>
                    <span>Level {levelCell(row)}</span>
                    <span className="col-span-2">Rule: {row.reorder?.level ? ruleText(row.reorder.level) : '—'}</span>
                    <span className="col-span-2">Min order: {row.reorder?.minOrder ? `${ruleText(row.reorder.minOrder)} → ${row.minOrderQty}` : '—'}</span>
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

      {editTarget && editTarget !== 'bulk' && (
        <RuleModal
          title="Set Reorder Level"
          subtitle={editTarget.name}
          initial={editTarget.reorder}
          onClose={() => setEditTarget(null)}
          onSave={saveOne}
        />
      )}

      {editTarget === 'bulk' && (
        <RuleModal
          title="Apply to Items in View"
          subtitle={`${bulkCount} item${bulkCount === 1 ? '' : 's'} · ${filterLabel()}`}
          initial={null}
          bulkCount={bulkCount}
          onClose={() => setEditTarget(null)}
          onSave={stageBulk}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(pendingBulk)}
        onClose={() => setPendingBulk(null)}
        onConfirm={applyBulk}
        title="Apply to every item in view?"
        message={`The same reorder rules will replace whatever ${bulkCount} item${bulkCount === 1 ? ' has' : 's have'} now (${filterLabel()}).`}
        type="warning"
        confirmLabel="Apply"
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

export default ReorderLevels;
