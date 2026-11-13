import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api, { fetchAll } from '../utils/api';
import { getSocket } from '../utils/socket';
import AlertModal from '../components/AlertModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import SortSelect from '../components/SortSelect';
import FilterPanel from '../components/FilterPanel';
import {
  Search, Download, IndianRupee, AlertTriangle, Users, ReceiptText, Link2Off, X, ArrowRight,
  RefreshCw, SlidersHorizontal, WalletCards
} from 'lucide-react';

// Values match PARTY_SORTS / BILL_SORTS in backend/controllers/tallyController.js
const PARTY_SORT_OPTIONS = [
  { value: 'name_asc', label: 'Party A–Z' },
  { value: 'name_desc', label: 'Party Z–A' },
  { value: 'amount_desc', label: 'Pending: high to low' },
  { value: 'amount_asc', label: 'Pending: low to high' },
  { value: 'overdue_desc', label: 'Overdue: high to low' },
  { value: 'age_desc', label: 'Oldest bill first' },
  { value: 'bills_desc', label: 'Most bills first' }
];

const BILL_SORT_OPTIONS = [
  { value: 'party_asc', label: 'Party A–Z' },
  { value: 'party_desc', label: 'Party Z–A' },
  { value: 'date_desc', label: 'Bill date: newest' },
  { value: 'date_asc', label: 'Bill date: oldest' },
  { value: 'due_asc', label: 'Due date: earliest' },
  { value: 'due_desc', label: 'Due date: latest' },
  { value: 'amount_desc', label: 'Pending: high to low' },
  { value: 'amount_asc', label: 'Pending: low to high' },
  { value: 'age_desc', label: 'Age: oldest first' },
  { value: 'age_asc', label: 'Age: newest first' }
];

const VIEWS = [
  { key: 'parties', label: 'Party-wise' },
  { key: 'bills', label: 'Bill-wise' }
];

const DUE_CHIPS = [
  { value: '', label: 'All' },
  { value: 'yes', label: 'Overdue' },
  { value: 'no', label: 'Not due' }
];

const DEFAULT_BUCKETS = '30,60,90,180';

// Everything under "More filters". Blank means "don't filter on this".
const EMPTY_FILTERS = {
  salesman: '', rating: '', mapped: '', blocked: '', entryType: '', voucherType: '', side: '',
  dateFrom: '', dateTo: '', dueFrom: '', dueTo: '', amountMin: '', amountMax: '', ageMin: '', ageMax: ''
};

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Bill dates are stored as a day at UTC midnight — read them back in UTC so
// the day never shifts
const day = (value) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }) : '—';

const dateTime = (value) =>
  value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

const amountCell = (value, strong = false) =>
  value ? (
    <span className={`tabular-nums ${value < 0 ? 'text-emerald-700' : strong ? 'font-semibold text-slate-900' : ''}`}>{money(value)}</span>
  ) : (
    <span className="text-slate-300">—</span>
  );

// Who the ledger is here: the mapped customer and their salesman, or a nudge to map it
const PartyCell = ({ ledger }) => (
  <div className="min-w-0">
    <p className="truncate font-semibold text-slate-900">{ledger?.name || '—'}</p>
    {ledger?.customer ? (
      <p className="truncate text-[11px] text-slate-400">
        {ledger.customer.name !== ledger.name ? `${ledger.customer.name} · ` : ''}
        {ledger.customer.salesman || 'No salesman'}
        {ledger.customer.isBlocked ? ' · Blocked' : ''}
      </p>
    ) : (
      <p className="text-[11px] font-medium text-amber-600">Not mapped to a customer</p>
    )}
  </div>
);

const OverdueBadge = ({ days }) =>
  days > 0 ? (
    <span className="srf-badge bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 !normal-case">{days}d overdue</span>
  ) : (
    <span className="srf-badge bg-slate-100 text-slate-500 !normal-case">{days === 0 ? 'Due today' : `Due in ${-days}d`}</span>
  );

const Field = ({ label, children }) => (
  <label className="flex flex-col gap-1">
    <span className="srf-mcard-label">{label}</span>
    {children}
  </label>
);

// Customer outstandings as pushed by Tally: party-wise with ageing, or
// bill-wise like Tally's Bills Receivable, with the filters Tally offers
const Outstandings = () => {
  const [view, setView] = useState('parties');
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [slabs, setSlabs] = useState([]);
  const [status, setStatus] = useState(null);
  const [salesmen, setSalesmen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [partySort, setPartySort] = useState('amount_desc');
  const [billSort, setBillSort] = useState('party_asc');
  const [basis, setBasis] = useState('bill');
  const [buckets, setBuckets] = useState(DEFAULT_BUCKETS);
  const [bucketsDraft, setBucketsDraft] = useState(DEFAULT_BUCKETS);
  const [overdue, setOverdue] = useState('');
  const [slab, setSlab] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showMore, setShowMore] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [alert, setAlert] = useState(null);

  const sort = view === 'parties' ? partySort : billSort;
  const moreCount = Object.values(filters).filter(Boolean).length;

  // The query both the list and the export send
  const params = useMemo(() => ({
    search: searchTerm,
    sort,
    basis,
    buckets,
    overdue,
    ...(slab !== null ? { bucket: slab } : {}),
    ...(ledger ? { ledger: ledger._id } : {}),
    ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
  }), [searchTerm, sort, basis, buckets, overdue, slab, ledger, filters]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/tally/outstandings/${view}`, {
        params: { ...params, page: currentPage, limit: pageSize }
      });
      if (response.data.success) {
        setRows(response.data.data);
        setTotals(response.data.totals);
        setSlabs(response.data.buckets || []);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching outstandings:', error);
    } finally {
      setLoading(false);
    }
  }, [view, params, currentPage, pageSize]);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await api.get('/tally/status');
      if (response.data.success) setStatus(response.data.data);
    } catch (error) {
      console.error('Error fetching tally status:', error);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setCurrentPage(1); }, [view, params, pageSize]);

  useEffect(() => {
    fetchStatus();
    fetchAll('/salesman').then(setSalesmen).catch(() => setSalesmen([]));
  }, [fetchStatus]);

  // A sync just landed, or a ledger was mapped — the figures have moved
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => { fetchData(); fetchStatus(); };
    socket.on('tally_updated', refresh);
    return () => socket.off('tally_updated', refresh);
  }, [fetchData, fetchStatus]);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  const applyBuckets = () => {
    const days = bucketsDraft.split(',').map((n) => parseInt(n, 10)).filter((n) => n > 0);
    const clean = [...new Set(days)].sort((a, b) => a - b).join(',') || DEFAULT_BUCKETS;
    setBucketsDraft(clean);
    setSlab(null);
    setBuckets(clean);
  };

  const clearAll = () => {
    setSearchTerm('');
    setOverdue('');
    setSlab(null);
    setLedger(null);
    setFilters(EMPTY_FILTERS);
  };

  // Rows belong to the view they were fetched for — don't draw parties as bills
  const switchView = (key) => {
    if (key === view) return;
    setRows([]);
    setLoading(true);
    setView(key);
  };

  const openParty = (row) => {
    setLedger({ _id: row.ledger._id, name: row.ledger.name });
    switchView('bills');
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const all = await fetchAll(`/tally/outstandings/${view}`, params);
      const data = view === 'parties'
        ? all.map((row) => ({
            Party: row.ledger?.name || '',
            Customer: row.ledger?.customer?.name || '',
            Salesman: row.ledger?.customer?.salesman || '',
            Bills: row.bills,
            ...Object.fromEntries(row.buckets.map((b) => [b.label, b.amount])),
            Overdue: row.overdueAmount,
            'On account': row.onAccountAmount,
            'Total pending': row.pendingAmount,
            'Closing balance': row.closingAmount ?? ''
          }))
        : all.map((row) => ({
            Date: row.voucherDate ? row.voucherDate.slice(0, 10) : '',
            'Ref. No.': row.billReference || row.voucherNumber || (row.entryType === 'ON_ACCOUNT' ? 'On account' : ''),
            Party: row.ledger?.name || '',
            Customer: row.ledger?.customer?.name || '',
            Salesman: row.ledger?.customer?.salesman || '',
            'Voucher type': row.voucherType,
            'Due on': row.dueDate ? row.dueDate.slice(0, 10) : '',
            'Age (days)': row.ageDays,
            'Overdue (days)': Math.max(row.overdueDays, 0),
            'Bill amount': row.originalAmount ?? '',
            Paid: row.paidAmount ?? '',
            Pending: row.pendingAmount
          }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), view === 'parties' ? 'Party-wise' : 'Bills Receivable');
      XLSX.writeFile(workbook, `outstandings-${view}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      setAlert({ title: 'Export failed', message: error.response?.data?.message || 'Could not export the outstandings' });
    } finally {
      setExporting(false);
    }
  };

  const company = status?.companies?.[0];
  const neverSynced = status && status.companies.length === 0;
  const slabTotal = slabs.reduce((sum, s) => sum + Math.max(s.amount, 0), 0);

  const tiles = totals ? [
    { title: 'Total outstanding', value: money(totals.pendingAmount), Icon: IndianRupee, tint: 'bg-indigo-50 text-indigo-600' },
    { title: `Overdue · ${totals.overdueBills} bill(s)`, value: money(totals.overdueAmount), Icon: AlertTriangle, tint: 'bg-rose-50 text-rose-600' },
    { title: 'Parties', value: totals.parties.toLocaleString('en-IN'), Icon: Users, tint: 'bg-sky-50 text-sky-600' },
    { title: 'Pending bills', value: totals.bills.toLocaleString('en-IN'), Icon: ReceiptText, tint: 'bg-amber-50 text-amber-600' }
  ] : [];

  return (
    <div className="srf-page">
      <PageHeader
        title="Outstandings"
        subtitle={company
          ? `${company.name} · Tally figures as of ${day(company.asOfDate)} · last synced ${dateTime(company.lastSyncedAt)}`
          : 'Customer pending bills, as pushed by Tally'}
      >
        <Link to="/tally-sync" className="srf-btn srf-btn-secondary">
          <RefreshCw className="h-4 w-4 text-slate-400" />
          Tally sync
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <button onClick={handleExport} disabled={loading || exporting || rows.length === 0} className="srf-btn srf-btn-secondary">
          <Download className="h-4 w-4 text-slate-400" />
          {exporting ? 'Exporting…' : 'Export Excel'}
        </button>
      </PageHeader>

      {neverSynced ? (
        <div className="srf-card flex flex-col items-center px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <WalletCards className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-700">No outstandings received from Tally yet</p>
          <p className="mt-1 max-w-sm text-xs text-slate-400">
            Generate an API key and share the endpoint with the Tally team. Pending bills show up here after their first sync.
          </p>
          <Link to="/tally-sync" className="srf-btn srf-btn-primary mt-4">Set up Tally sync</Link>
        </div>
      ) : (
        <>
          {status?.unmappedLedgers > 0 && (
            <Link
              to="/tally-sync"
              className="flex items-center gap-2.5 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800 ring-1 ring-inset ring-amber-200 transition-colors hover:bg-amber-100/70"
            >
              <Link2Off className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{status.unmappedLedgers} Tally ledger(s)</span> with pending bills are not mapped to a customer yet.
              </span>
              <span className="shrink-0 font-semibold">Map them</span>
            </Link>
          )}

          {/* Totals over everything the filters keep */}
          {totals && (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
              {tiles.map((tile) => (
                <div key={tile.title} className="srf-card p-3.5">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tile.tint}`}>
                    <tile.Icon className="h-4 w-4" />
                  </span>
                  <p className="mt-2.5 truncate font-display text-lg font-bold leading-none text-slate-900 tabular-nums sm:text-xl">{tile.value}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">{tile.title}</p>
                </div>
              ))}
            </div>
          )}

          {/* Ageing slabs — tap one to see only its bills */}
          {slabs.length > 0 && (
            <div className="srf-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-slate-800">
                  Ageing <span className="font-normal text-slate-400">· by {basis === 'due' ? 'due date' : 'bill date'}</span>
                </p>
                {slab !== null && (
                  <button type="button" onClick={() => setSlab(null)} className="text-xs font-semibold text-indigo-600 hover:underline">
                    Show all slabs
                  </button>
                )}
              </div>
              <div className="mt-2.5 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                {slabs.map((s) => (
                  <button
                    key={s.index}
                    type="button"
                    onClick={() => setSlab(slab === s.index ? null : s.index)}
                    className={`rounded-lg border p-2.5 text-left transition-colors ${
                      slab === s.index ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <p className={`text-[11px] font-medium ${slab === s.index ? 'text-slate-300' : 'text-slate-500'}`}>{s.label}</p>
                    <p className="mt-0.5 truncate text-sm font-bold tabular-nums">{money(s.amount)}</p>
                    <div className={`mt-1.5 h-1 rounded-full ${slab === s.index ? 'bg-white/20' : 'bg-slate-100'}`}>
                      <div
                        className={`h-1 rounded-full ${s.index === -1 ? 'bg-emerald-500' : s.index >= slabs.length - 2 ? 'bg-rose-500' : 'bg-amber-500'}`}
                        style={{ width: `${slabTotal ? Math.round((Math.max(s.amount, 0) / slabTotal) * 100) : 0}%` }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Toolbar */}
          <FilterPanel active={[searchTerm, overdue, slab !== null, ledger, ...Object.values(filters)]}>
            <div className="srf-toolbar">
              <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
                <div className="flex w-full shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 lg:w-auto">
                  {VIEWS.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => switchView(v.key)}
                      className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition lg:flex-none ${
                        view === v.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                <div className="relative w-full lg:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search party or bill ref…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full !pl-9"
                  />
                </div>
                <SortSelect
                  value={sort}
                  onChange={view === 'parties' ? setPartySort : setBillSort}
                  options={view === 'parties' ? PARTY_SORT_OPTIONS : BILL_SORT_OPTIONS}
                  className="w-full lg:ml-auto lg:w-auto"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {DUE_CHIPS.map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setOverdue(chip.value)}
                    className={`srf-chip ${overdue === chip.value ? 'srf-chip-active' : ''}`}
                  >
                    {chip.label}
                  </button>
                ))}
                {ledger && (
                  <span className="srf-chip srf-chip-active !cursor-default">
                    {ledger.name}
                    <button type="button" onClick={() => setLedger(null)} aria-label="Show all parties">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
                <button type="button" onClick={() => setShowMore((v) => !v)} className={`srf-chip sm:ml-auto ${moreCount ? 'border-indigo-300 text-indigo-700' : ''}`}>
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  More filters{moreCount ? ` · ${moreCount}` : ''}
                </button>
                {(moreCount > 0 || searchTerm || overdue || slab !== null || ledger) && (
                  <button type="button" onClick={clearAll} className="px-1.5 text-xs font-semibold text-rose-600 hover:underline">
                    Clear all
                  </button>
                )}
              </div>

              {showMore && (
                <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-3 md:grid-cols-4">
                  <Field label="Ageing by">
                    <select value={basis} onChange={(e) => { setSlab(null); setBasis(e.target.value); }}>
                      <option value="bill">Bill date</option>
                      <option value="due">Due date</option>
                    </select>
                  </Field>
                  <Field label="Ageing periods (days)">
                    <input
                      type="text"
                      value={bucketsDraft}
                      onChange={(e) => setBucketsDraft(e.target.value)}
                      onBlur={applyBuckets}
                      onKeyDown={(e) => e.key === 'Enter' && applyBuckets()}
                      placeholder={DEFAULT_BUCKETS}
                    />
                  </Field>
                  <Field label="Salesman">
                    <select value={filters.salesman} onChange={setFilter('salesman')}>
                      <option value="">All salesmen</option>
                      {salesmen.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Payment rating">
                    <select value={filters.rating} onChange={setFilter('rating')}>
                      <option value="">Any rating</option>
                      <option value="good">Good</option>
                      <option value="average">Average</option>
                      <option value="bad">Bad</option>
                    </select>
                  </Field>
                  <Field label="Customer mapping">
                    <select value={filters.mapped} onChange={setFilter('mapped')}>
                      <option value="">Mapped or not</option>
                      <option value="yes">Mapped to a customer</option>
                      <option value="no">Not mapped</option>
                    </select>
                  </Field>
                  <Field label="Customer status">
                    <select value={filters.blocked} onChange={setFilter('blocked')}>
                      <option value="">Active or blocked</option>
                      <option value="no">Active only</option>
                      <option value="yes">Blocked only</option>
                    </select>
                  </Field>
                  <Field label="Entry type">
                    <select value={filters.entryType} onChange={setFilter('entryType')}>
                      <option value="">Bills and on-account</option>
                      <option value="BILL">Bills only</option>
                      <option value="ON_ACCOUNT">On-account only</option>
                    </select>
                  </Field>
                  <Field label="Balance">
                    <select value={filters.side} onChange={setFilter('side')}>
                      <option value="">Debit and credit</option>
                      <option value="debit">Receivable (Dr)</option>
                      <option value="credit">Credit balance (Cr)</option>
                    </select>
                  </Field>
                  {status?.voucherTypes?.length > 0 && (
                    <Field label="Voucher type">
                      <select value={filters.voucherType} onChange={setFilter('voucherType')}>
                        <option value="">All voucher types</option>
                        {status.voucherTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                  )}
                  <Field label="Bill date from">
                    <input type="date" value={filters.dateFrom} onChange={setFilter('dateFrom')} />
                  </Field>
                  <Field label="Bill date to">
                    <input type="date" value={filters.dateTo} onChange={setFilter('dateTo')} />
                  </Field>
                  <Field label="Due date from">
                    <input type="date" value={filters.dueFrom} onChange={setFilter('dueFrom')} />
                  </Field>
                  <Field label="Due date to">
                    <input type="date" value={filters.dueTo} onChange={setFilter('dueTo')} />
                  </Field>
                  <Field label={view === 'parties' ? 'Party total from (₹)' : 'Pending from (₹)'}>
                    <input type="number" value={filters.amountMin} onChange={setFilter('amountMin')} placeholder="0" />
                  </Field>
                  <Field label={view === 'parties' ? 'Party total up to (₹)' : 'Pending up to (₹)'}>
                    <input type="number" value={filters.amountMax} onChange={setFilter('amountMax')} placeholder="Any" />
                  </Field>
                  <Field label={`${basis === 'due' ? 'Overdue' : 'Age'} from (days)`}>
                    <input type="number" value={filters.ageMin} onChange={setFilter('ageMin')} placeholder="0" />
                  </Field>
                  <Field label={`${basis === 'due' ? 'Overdue' : 'Age'} up to (days)`}>
                    <input type="number" value={filters.ageMax} onChange={setFilter('ageMax')} placeholder="Any" />
                  </Field>
                </div>
              )}
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
                  <WalletCards className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-semibold text-slate-700">Nothing pending matches these filters</p>
                <p className="mt-1 text-xs text-slate-400">Loosen a filter, or clear them all.</p>
              </div>
            ) : view === 'parties' ? (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="srf-table">
                    <thead>
                      <tr>
                        <th>Party</th>
                        <th className="text-right">Bills</th>
                        {slabs.map((s) => <th key={s.index} className="text-right">{s.label}</th>)}
                        <th className="text-right">Overdue</th>
                        <th className="text-right">Total pending</th>
                        <th className="text-right" title="The customer's closing balance in Tally">Closing balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.ledger._id} onClick={() => openParty(row)} className="cursor-pointer" title="Show this party's bills">
                          <td className="max-w-[260px]"><PartyCell ledger={row.ledger} /></td>
                          <td className="text-right tabular-nums">{row.bills}</td>
                          {row.buckets.map((b) => <td key={b.index} className="whitespace-nowrap text-right">{amountCell(b.amount)}</td>)}
                          <td className="whitespace-nowrap text-right">
                            {row.overdueAmount > 0 ? <span className="font-semibold tabular-nums text-rose-600">{money(row.overdueAmount)}</span> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="whitespace-nowrap text-right">{amountCell(row.pendingAmount, true)}</td>
                          <td className="whitespace-nowrap text-right">
                            {row.closingAmount === null || row.closingAmount === undefined ? <span className="text-slate-300">—</span> : amountCell(row.closingAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50/80 text-[13px] font-bold text-slate-900">
                        <td className="px-4 py-3">Total · {totals.parties} parties</td>
                        <td className="px-4 py-3 text-right tabular-nums">{totals.bills}</td>
                        {slabs.map((s) => <td key={s.index} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{money(s.amount)}</td>)}
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-rose-600">{money(totals.overdueAmount)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{money(totals.pendingAmount)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{totals.closingAmount === null || totals.closingAmount === undefined ? '—' : money(totals.closingAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile list */}
                <div className="divide-y divide-slate-100 md:hidden">
                  {rows.map((row) => (
                    <button key={row.ledger._id} type="button" onClick={() => openParty(row)} className="flex w-full items-center justify-between gap-3 p-3.5 text-left">
                      <div className="min-w-0">
                        <PartyCell ledger={row.ledger} />
                        <p className="mt-0.5 text-xs text-slate-400">
                          {row.bills} bill(s)
                          {row.overdueAmount > 0 && <span className="font-semibold text-rose-600"> · {money(row.overdueAmount)} overdue</span>}
                          {row.closingAmount !== null && row.closingAmount !== undefined && <span> · closing {money(row.closingAmount)}</span>}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm">{amountCell(row.pendingAmount, true)}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="srf-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Ref. No.</th>
                        <th>Party</th>
                        <th>Due on</th>
                        <th className="text-right">Age</th>
                        <th>Status</th>
                        <th className="text-right">Pending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row._id} title={row.narration || undefined}>
                          <td className="whitespace-nowrap">{day(row.voucherDate)}</td>
                          <td className="whitespace-nowrap">
                            <span className="font-medium text-slate-800">
                              {row.billReference || row.voucherNumber || (row.entryType === 'ON_ACCOUNT' ? 'On account' : '—')}
                            </span>
                            {row.voucherType && <span className="ml-1.5 text-[11px] text-slate-400">{row.voucherType}</span>}
                          </td>
                          <td className="max-w-[240px]"><PartyCell ledger={row.ledger} /></td>
                          <td className="whitespace-nowrap">{day(row.dueDate)}</td>
                          <td className="whitespace-nowrap text-right tabular-nums">{row.voucherDate ? `${row.ageDays}d` : '—'}</td>
                          <td>{row.dueDate ? <OverdueBadge days={row.overdueDays} /> : <span className="text-slate-300">—</span>}</td>
                          <td className="whitespace-nowrap text-right">
                            {amountCell(row.pendingAmount, true)}
                            {row.originalAmount !== null && row.originalAmount !== row.pendingAmount && (
                              <p className="text-[11px] text-slate-400">of {money(row.originalAmount)}</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50/80 text-[13px] font-bold text-slate-900">
                        <td colSpan={6} className="px-4 py-3">Total · {totals.bills} bill(s) across {totals.parties} parties</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{money(totals.pendingAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile list */}
                <div className="divide-y divide-slate-100 md:hidden">
                  {rows.map((row) => (
                    <div key={row._id} className="flex items-start justify-between gap-3 p-3.5">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{row.ledger?.name}</p>
                        <p className="text-xs text-slate-500">
                          {row.billReference || row.voucherNumber || 'On account'} · {day(row.voucherDate)}
                        </p>
                        {row.dueDate && <OverdueBadge days={row.overdueDays} />}
                      </div>
                      <span className="shrink-0 text-sm">{amountCell(row.pendingAmount, true)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {!loading && rows.length > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={pagination.pages}
                totalItems={pagination.total}
                itemsPerPage={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={setPageSize}
              />
            )}
          </div>
        </>
      )}

      <AlertModal
        isOpen={!!alert}
        onClose={() => setAlert(null)}
        title={alert?.title}
        message={alert?.message}
        type="error"
      />
    </div>
  );
};

export default Outstandings;
