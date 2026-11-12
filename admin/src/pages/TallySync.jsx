import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { getSocket } from '../utils/socket';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import FilterPanel from '../components/FilterPanel';
import { Search, KeyRound, Copy, Check, RefreshCw, Trash2, Link2, Link2Off, X, ArrowRight, History } from 'lucide-react';

// The Tally API sits beside the admin API: …/api → …/api/v1/tally
const TALLY_API_BASE = `${(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '')}/v1/tally`;

const ENDPOINTS = [
  { method: 'POST', path: '/outstandings/sync', purpose: 'Push outstanding bills' },
  { method: 'GET', path: '/outstandings/sync-status', purpose: 'Check a sync' },
  { method: 'GET', path: '/outstandings/customers', purpose: 'Read back ledger balances' },
  { method: 'GET', path: '/ping', purpose: 'Test the URL and key' }
];

const TABS = [
  { key: 'ledgers', label: 'Ledger mapping' },
  { key: 'syncs', label: 'Sync history' }
];

const MAPPED_CHIPS = [
  { value: '', label: 'All' },
  { value: 'no', label: 'Not mapped' },
  { value: 'yes', label: 'Mapped' }
];

const SYNC_STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  receiving: 'bg-amber-50 text-amber-700 ring-amber-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200'
};

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateTime = (value) =>
  value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const day = (value) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

const CopyButton = ({ text, label = 'Copy' }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" onClick={copy} className="srf-btn srf-btn-secondary !px-2.5 !py-1.5 !text-xs">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
      {copied ? 'Copied' : label}
    </button>
  );
};

// Pick the customer a Tally ledger stands for
const MapLedgerModal = ({ ledger, onClose, onSaved, onError }) => {
  // Start from the ledger's first real word: the full name already failed to
  // match a customer, or the ledger would not need mapping by hand
  const [search, setSearch] = useState(() => ledger.name.split(/\s+/).find((word) => word.length >= 3) || ledger.name);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/customers', { params: { search, limit: 8 } })
      .then((res) => { if (!cancelled) setCustomers(res.data.data || []); })
      .catch(() => { if (!cancelled) setCustomers([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search]);

  const save = async (customerId) => {
    try {
      setSaving(true);
      await api.put(`/tally/ledgers/${ledger._id}/customer`, { customer: customerId });
      onSaved();
    } catch (error) {
      onError(error.response?.data?.message || 'Could not save the mapping');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="srf-modal-backdrop" onClick={onClose}>
      <div className="srf-modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="srf-modal-header">
          <div className="min-w-0">
            <h3 className="srf-modal-title">Map Tally ledger</h3>
            <p className="truncate text-xs text-slate-500">{ledger.name}{ledger.gstin ? ` · ${ledger.gstin}` : ''}</p>
          </div>
          <button onClick={onClose} className="srf-icon-btn" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="srf-modal-body space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers by name, phone or GSTIN…"
              className="w-full !pl-9"
            />
          </div>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {loading ? (
              <p className="p-4 text-center text-xs text-slate-400">Searching…</p>
            ) : customers.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">No customer matches. Try fewer words.</p>
            ) : (
              customers.map((customer) => (
                <button
                  key={customer._id}
                  type="button"
                  disabled={saving}
                  onClick={() => save(customer._id)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                    ledger.customer?._id === customer._id ? 'bg-indigo-50/60' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-slate-900">{customer.name}</p>
                    <p className="truncate text-[11px] text-slate-400">{[customer.phone, customer.gstin].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-indigo-600">
                    {ledger.customer?._id === customer._id ? 'Current' : 'Select'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="srf-modal-footer">
          {ledger.customer && (
            <button onClick={() => save(null)} disabled={saving} className="srf-btn srf-btn-secondary mr-auto text-rose-600">
              <Link2Off className="h-4 w-4" />
              Clear mapping
            </button>
          )}
          <button onClick={onClose} className="srf-btn srf-btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
};

// Everything around the Tally integration: the API key handed to the Tally
// team, which Tally ledger is which customer, and the history of syncs
const TallySync = () => {
  const [status, setStatus] = useState(null);
  const [tab, setTab] = useState('ledgers');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [mapped, setMapped] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const [newKey, setNewKey] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [alert, setAlert] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await api.get('/tally/status');
      if (response.data.success) setStatus(response.data.data);
    } catch (error) {
      console.error('Error fetching tally status:', error);
    }
  }, []);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(tab === 'ledgers' ? '/tally/ledgers' : '/tally/syncs', {
        params: tab === 'ledgers'
          ? { search: searchTerm, mapped, page: currentPage, limit: pageSize }
          : { page: currentPage, limit: pageSize }
      });
      if (response.data.success) {
        setRows(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching tally data:', error);
    } finally {
      setLoading(false);
    }
  }, [tab, searchTerm, mapped, currentPage, pageSize]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => { fetchRows(); }, [fetchRows]);
  useEffect(() => { setCurrentPage(1); }, [tab, searchTerm, mapped, pageSize]);

  // Rows belong to the tab they were fetched for — don't draw one tab's rows as the other's
  const switchTab = (key) => {
    if (key === tab) return;
    setRows([]);
    setLoading(true);
    setTab(key);
  };

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => { fetchStatus(); fetchRows(); };
    socket.on('tally_updated', refresh);
    return () => socket.off('tally_updated', refresh);
  }, [fetchStatus, fetchRows]);

  const generateKey = async () => {
    try {
      const response = await api.post('/tally/api-key');
      setNewKey(response.data.data.apiKey);
      fetchStatus();
    } catch (error) {
      setAlert({ title: 'Error', message: error.response?.data?.message || 'Could not generate the API key' });
    } finally {
      setConfirm(null);
    }
  };

  const revokeKey = async () => {
    try {
      await api.delete('/tally/api-key');
      setNewKey('');
      fetchStatus();
    } catch (error) {
      setAlert({ title: 'Error', message: error.response?.data?.message || 'Could not revoke the API key' });
    } finally {
      setConfirm(null);
    }
  };

  const apiKey = status?.apiKey;
  const lastSync = status?.lastSync;

  return (
    <div className="srf-page">
      <PageHeader title="Tally Sync" subtitle="The API the Tally team pushes outstandings to, and how its ledgers map to customers">
        <Link to="/outstandings" className="srf-btn srf-btn-secondary">
          Outstandings
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </PageHeader>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* API access */}
        <div className="srf-card p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
              <KeyRound className="h-4 w-4 text-slate-400" />
              API access for the Tally team
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => (apiKey?.exists ? setConfirm('regenerate') : generateKey())}
                className="srf-btn srf-btn-primary !px-3 !py-1.5 !text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {apiKey?.exists ? 'Regenerate key' : 'Generate API key'}
              </button>
              {apiKey?.exists && (
                <button onClick={() => setConfirm('revoke')} className="srf-btn srf-btn-secondary !px-2.5 !py-1.5 !text-xs text-rose-600">
                  <Trash2 className="h-3.5 w-3.5" />
                  Revoke
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 space-y-2.5">
            <div>
              <p className="srf-mcard-label">Base URL</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700">{TALLY_API_BASE}</code>
                <CopyButton text={TALLY_API_BASE} />
              </div>
            </div>

            <div>
              <p className="srf-mcard-label">API key</p>
              {newKey ? (
                <div className="mt-1 rounded-lg bg-emerald-50 p-2.5 ring-1 ring-inset ring-emerald-200">
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all text-xs font-semibold text-emerald-900">{newKey}</code>
                    <CopyButton text={newKey} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-emerald-800">
                    Copy it now and send it to the Tally team — it is not stored and cannot be shown again.
                  </p>
                </div>
              ) : apiKey?.exists ? (
                <p className="mt-1 text-[13px] text-slate-600">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">srf_tally_…{apiKey.hint}</code>
                  <span className="ml-2 text-xs text-slate-400">
                    created {dateTime(apiKey.createdAt)} · {apiKey.lastUsedAt ? `last used ${dateTime(apiKey.lastUsedAt)}` : 'never used'}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-[13px] text-slate-500">No key yet — Tally cannot connect until one is generated.</p>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <tbody className="divide-y divide-slate-100">
                  {ENDPOINTS.map((e) => (
                    <tr key={e.path}>
                      <td className="whitespace-nowrap px-2.5 py-1.5 font-semibold text-slate-500">{e.method}</td>
                      <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-slate-800">{e.path}</td>
                      <td className="px-2.5 py-1.5 text-slate-500">{e.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400">
              Every request carries <code>Authorization: Bearer &lt;API key&gt;</code>. The full contract for the Tally team is in <code>backend/TALLY_API.md</code>.
            </p>
          </div>
        </div>

        {/* Last sync */}
        <div className="srf-card p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
            <History className="h-4 w-4 text-slate-400" />
            Last sync
          </p>
          {lastSync ? (
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Status</dt>
                <dd><span className={`srf-badge ring-1 ring-inset ${SYNC_STATUS_STYLES[lastSync.status]}`}>{lastSync.status}</span></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Received</dt>
                <dd className="text-right font-medium text-slate-800">{dateTime(lastSync.createdAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">As of</dt>
                <dd className="font-medium text-slate-800">{day(lastSync.asOfDate)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Company</dt>
                <dd className="truncate font-medium text-slate-800">{lastSync.companyName || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Records</dt>
                <dd className="font-medium tabular-nums text-slate-800">{lastSync.receivedRecords}</dd>
              </div>
              {status.unmappedLedgers > 0 && (
                <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
                  {status.unmappedLedgers} ledger(s) with pending bills still need a customer.
                </p>
              )}
              {lastSync.error && <p className="rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">{lastSync.error}</p>}
            </dl>
          ) : (
            <p className="mt-3 text-[13px] text-slate-500">Nothing received yet. The first sync shows up here as soon as Tally sends it.</p>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <FilterPanel active={[searchTerm, mapped]}>
        <div className="srf-toolbar sm:flex-row sm:items-center">
          <div className="flex w-full rounded-lg border border-slate-200 bg-slate-50 p-0.5 sm:w-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => switchTab(t.key)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition sm:flex-none ${
                  tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'ledgers' && (
            <>
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search ledger, GSTIN or code…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full !pl-9"
                />
              </div>
              <div className="flex items-center gap-1.5 sm:ml-auto">
                {MAPPED_CHIPS.map((chip) => (
                  <button key={chip.value} type="button" onClick={() => setMapped(chip.value)} className={`srf-chip ${mapped === chip.value ? 'srf-chip-active' : ''}`}>
                    {chip.label}
                  </button>
                ))}
              </div>
            </>
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
          <p className="px-6 py-14 text-center text-sm text-slate-500">
            {tab === 'ledgers' ? 'No Tally ledgers here yet — they appear with the first sync.' : 'No syncs received yet.'}
          </p>
        ) : tab === 'ledgers' ? (
          <div className="overflow-x-auto">
            <table className="srf-table">
              <thead>
                <tr>
                  <th>Tally ledger</th>
                  <th className="text-right">Pending</th>
                  <th className="text-right">Bills</th>
                  <th>Customer here</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ledger) => (
                  <tr key={ledger._id}>
                    <td className="max-w-[280px]">
                      <p className="truncate font-semibold text-slate-900">{ledger.name}</p>
                      <p className="truncate text-[11px] text-slate-400">{[ledger.ledgerCode, ledger.gstin, ledger.phone].filter(Boolean).join(' · ') || 'No GSTIN or code sent'}</p>
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{ledger.pendingAmount ? money(ledger.pendingAmount) : <span className="text-slate-300">—</span>}</td>
                    <td className="text-right tabular-nums">{ledger.bills || <span className="text-slate-300">—</span>}</td>
                    <td className="max-w-[260px]">
                      {ledger.customer ? (
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-slate-800">{ledger.customer.name}</span>
                          <span className="srf-badge bg-slate-100 text-slate-500">{ledger.mappingSource === 'manual' ? 'manual' : 'auto'}</span>
                        </div>
                      ) : (
                        <span className="srf-badge bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 !normal-case">Not mapped</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end">
                        <button onClick={() => setMapping(ledger)} className="srf-btn srf-btn-secondary !px-2.5 !py-1.5 !text-xs">
                          <Link2 className="h-3.5 w-3.5 text-slate-400" />
                          {ledger.customer ? 'Change' : 'Map'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="srf-table">
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Sync ID</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="text-right">Records</th>
                  <th className="text-right">Live bills</th>
                  <th className="text-right">Outstanding</th>
                  <th>As of</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((sync) => (
                  <tr key={sync._id}>
                    <td className="whitespace-nowrap">{dateTime(sync.createdAt)}</td>
                    <td className="max-w-[220px]">
                      <p className="truncate font-medium text-slate-800">{sync.syncId}</p>
                      {sync.error && <p className="text-[11px] text-rose-600">{sync.error}</p>}
                    </td>
                    <td className="text-xs">{sync.syncType}</td>
                    <td><span className={`srf-badge ring-1 ring-inset ${SYNC_STATUS_STYLES[sync.status]}`}>{sync.status}</span></td>
                    <td className="text-right tabular-nums">
                      {sync.receivedRecords}
                      {sync.batches?.length > 1 && <span className="ml-1 text-[11px] text-slate-400">in {sync.batches.length} batches</span>}
                    </td>
                    <td className="text-right tabular-nums">{sync.status === 'completed' ? sync.totals.bills : '—'}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{sync.status === 'completed' ? money(sync.totals.pendingAmount) : '—'}</td>
                    <td className="whitespace-nowrap">{day(sync.asOfDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={pagination.pages}
            totalItems={pagination.total}
            itemsPerPage={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      {mapping && (
        <MapLedgerModal
          ledger={mapping}
          onClose={() => setMapping(null)}
          onSaved={() => { setMapping(null); fetchRows(); fetchStatus(); }}
          onError={(message) => setAlert({ title: 'Error', message })}
        />
      )}

      <ConfirmModal
        isOpen={confirm === 'regenerate'}
        onClose={() => setConfirm(null)}
        onConfirm={generateKey}
        title="Regenerate API key?"
        message="The current key stops working immediately. Tally syncs will fail until the Tally team switches to the new key."
        type="warning"
        confirmLabel="Regenerate"
      />
      <ConfirmModal
        isOpen={confirm === 'revoke'}
        onClose={() => setConfirm(null)}
        onConfirm={revokeKey}
        title="Revoke API key?"
        message="Tally will no longer be able to push outstandings until a new key is generated and shared."
        type="danger"
        confirmLabel="Revoke"
      />

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

export default TallySync;
