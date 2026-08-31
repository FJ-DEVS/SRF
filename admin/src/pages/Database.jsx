import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';
import AlertModal from '../components/AlertModal';
import {
  Database as DatabaseIcon,
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
  FileJson,
  RefreshCw,
  X,
  CheckCircle2,
  Layers,
  HardDrive
} from 'lucide-react';

// Matches the cap the backend's multer instance enforces
const MAX_RESTORE_MB = 64;

// The word the admin has to type out before a restore will run
const CONFIRM_WORD = 'RESTORE';

const RESTORE_MODES = [
  {
    value: 'merge',
    label: 'Add back what is missing',
    detail: 'Only documents that are no longer in the database are put back. Anything added since the backup is left alone. Safe to run.'
  },
  {
    value: 'replace',
    label: 'Replace everything',
    detail: 'Every collection in the backup is emptied and refilled. The database is rewound to the moment the backup was taken — anything created since is lost.'
  }
];

const formatBytes = (bytes) => {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
};

const formatNumber = (value) => (value ?? 0).toLocaleString('en-IN');

// A blob download comes back as a Blob even when the server answered with an
// error, so the JSON message has to be dug back out of it
const readBlobError = async (error) => {
  const data = error.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text())?.message;
    } catch {
      return null;
    }
  }
  return data?.message;
};

const Database = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(0);
  const [lastBackupAt, setLastBackupAt] = useState(null);

  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState('merge');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [report, setReport] = useState(null);
  const fileInputRef = useRef(null);

  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });
  const [showAlertModal, setShowAlertModal] = useState(false);

  const showAlert = (title, message, type = 'error') => {
    setAlertConfig({ title, message, type });
    setShowAlertModal(true);
  };

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/database/stats');
      if (response.data.success) setStats(response.data.data);
    } catch (error) {
      showAlert('Error', error.response?.data?.message || 'Could not read the database overview.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloaded(0);

    try {
      const response = await api.get('/database/backup', {
        responseType: 'blob',
        onDownloadProgress: (event) => setDownloaded(event.loaded)
      });

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = response.headers['x-backup-filename'] || `srf-backup-${stamp}.json`;

      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setLastBackupAt(new Date());
      showAlert('Backup Downloaded', `${filename} has been saved to your downloads folder.`, 'success');
    } catch (error) {
      showAlert('Backup Failed', (await readBlobError(error)) || 'The backup could not be downloaded.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const pickFile = (chosen) => {
    if (!chosen) return;

    if (!chosen.name.toLowerCase().endsWith('.json')) {
      showAlert('Wrong File', 'A backup file is a .json file downloaded from this page.', 'error');
      return;
    }
    if (chosen.size > MAX_RESTORE_MB * 1024 * 1024) {
      showAlert('File Too Large', `Backup files up to ${MAX_RESTORE_MB} MB can be restored from here.`, 'error');
      return;
    }

    setFile(chosen);
    setReport(null);
  };

  // Only drops the chosen file. The report of the last restore deliberately
  // stays on screen — it is what the admin checks the restore against.
  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    pickFile(event.dataTransfer.files?.[0]);
  };

  const openConfirm = () => {
    setConfirmText('');
    setConfirmOpen(true);
  };

  const handleRestore = async () => {
    setConfirmOpen(false);
    setRestoring(true);
    setUploaded(0);
    setReport(null);

    const payload = new FormData();
    payload.append('backup', file);
    payload.append('mode', mode);

    try {
      const response = await api.post('/database/restore', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => setUploaded(event.loaded)
      });

      if (response.data.success) {
        setReport(response.data.data);
        clearFile();
        fetchStats();
        showAlert('Restore Complete', response.data.message, 'success');
      }
    } catch (error) {
      showAlert('Restore Failed', error.response?.data?.message || 'The restore could not be completed.', 'error');
    } finally {
      setRestoring(false);
    }
  };

  const selectedMode = RESTORE_MODES.find((m) => m.value === mode);

  const summary = [
    { label: 'Database', value: stats?.database || '—', icon: DatabaseIcon, tint: 'bg-slate-100 text-slate-600' },
    { label: 'Collections', value: formatNumber(stats?.totalCollections), icon: Layers, tint: 'bg-indigo-50 text-indigo-600' },
    { label: 'Documents', value: formatNumber(stats?.totalDocuments), icon: FileJson, tint: 'bg-sky-50 text-sky-600' },
    { label: 'Stored Size', value: formatBytes(stats?.totalSize), icon: HardDrive, tint: 'bg-emerald-50 text-emerald-600' }
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
      </div>
    );
  }

  return (
    <div className="srf-page">
      <PageHeader
        title="Database"
        subtitle="Download a complete backup, or put one back if data goes missing"
      >
        <button onClick={fetchStats} className="srf-btn srf-btn-secondary" disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </PageHeader>

      {/* Overview */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {summary.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="srf-card p-3.5">
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${card.tint}`}>
                <Icon className="h-4 w-4" />
              </span>
              <p className="mt-2.5 truncate font-display text-lg font-bold text-slate-900">{card.value}</p>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-5 sm:gap-5">
        {/* Backup */}
        <div className="srf-card p-4 sm:p-5 lg:col-span-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[15px] font-bold text-slate-900">Backup</h2>
              <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">
                Downloads every collection to a single file on this computer. Nothing is kept on the
                server, so store the file somewhere safe.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-slate-500">
            The file is MongoDB Canonical Extended JSON — IDs, dates and number types come back exactly
            as they are stored, so a restore is an exact rewind rather than an approximation.
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={handleDownload} disabled={downloading} className="srf-btn srf-btn-primary">
              {downloading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Building backup…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download Full Backup
                </>
              )}
            </button>

            {downloading && downloaded > 0 && (
              <span className="text-[12.5px] text-slate-500">{formatBytes(downloaded)} received</span>
            )}

            {!downloading && lastBackupAt && (
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Backed up at {lastBackupAt.toLocaleTimeString('en-IN')}
              </span>
            )}
          </div>
        </div>

        {/* Collection breakdown */}
        <div className="srf-card lg:col-span-2">
          <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
            <h2 className="font-display text-[15px] font-bold text-slate-900">What gets backed up</h2>
            <p className="mt-0.5 text-xs text-slate-500">Every collection in the database</p>
          </div>
          <div className="max-h-72 overflow-y-auto scrollbar-thin">
            <table className="srf-table">
              <thead>
                <tr>
                  <th>Collection</th>
                  <th className="text-right">Documents</th>
                  <th className="text-right">Size</th>
                </tr>
              </thead>
              <tbody>
                {stats?.collections?.map((collection) => (
                  <tr key={collection.name}>
                    <td className="font-medium text-slate-700">{collection.name}</td>
                    <td className="text-right tabular-nums">{formatNumber(collection.count)}</td>
                    <td className="text-right tabular-nums text-slate-400">{formatBytes(collection.size)}</td>
                  </tr>
                ))}
                {!stats?.collections?.length && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400">No collections found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Restore */}
      <div className="srf-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Upload className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-bold text-slate-900">Restore</h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">
              Upload a backup file taken from this page to put its data back.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* File picker */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />

            {file ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600 ring-1 ring-slate-200">
                  <FileJson className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[13px] font-semibold text-slate-800">{file.name}</p>
                  <p className="text-[11.5px] text-slate-500">{formatBytes(file.size)}</p>
                </div>
                <button onClick={clearFile} className="srf-icon-btn" disabled={restoring} aria-label="Remove file">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 transition-colors ${
                  dragging
                    ? 'border-indigo-400 bg-indigo-50/60'
                    : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Upload className="h-6 w-6 text-slate-400" />
                <span className="text-[13px] font-semibold text-slate-700">
                  Drop a backup file here, or click to choose
                </span>
                <span className="text-[11.5px] text-slate-400">.json up to {MAX_RESTORE_MB} MB</span>
              </button>
            )}
          </div>

          {/* Mode */}
          <div className="space-y-2">
            {RESTORE_MODES.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                  mode === option.value
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 hover:bg-slate-50/60'
                }`}
              >
                <input
                  type="radio"
                  name="restore-mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                  disabled={restoring}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-800">{option.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-500">{option.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {mode === 'replace' && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-rose-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-rose-700">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            <span>
              Replacing cannot be undone. Download a fresh backup first — that file is the only way
              back to the data you have right now.
            </span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={openConfirm}
            disabled={!file || restoring}
            className={`srf-btn ${mode === 'replace' ? 'srf-btn-danger' : 'srf-btn-primary'}`}
          >
            {restoring ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Restoring…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                {mode === 'replace' ? 'Replace Database' : 'Restore Missing Data'}
              </>
            )}
          </button>

          {restoring && uploaded > 0 && (
            <span className="text-[12.5px] text-slate-500">{formatBytes(uploaded)} uploaded</span>
          )}
        </div>

        {/* What the restore did */}
        {report && (
          <div className="mt-5 rounded-xl border border-slate-200 overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
              <p className="text-[13px] font-semibold text-slate-800">
                Restored from a backup of {report.sourceDatabase} taken{' '}
                {new Date(report.takenAt).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Collection</th>
                    <th className="text-right">Before</th>
                    <th className="text-right">Inserted</th>
                    <th className="text-right">Skipped</th>
                    <th className="text-right">After</th>
                  </tr>
                </thead>
                <tbody>
                  {report.collections.map((row) => (
                    <tr key={row.name}>
                      <td className="font-medium text-slate-700">{row.name}</td>
                      <td className="text-right tabular-nums">{formatNumber(row.before)}</td>
                      <td className="text-right tabular-nums text-emerald-600">+{formatNumber(row.inserted)}</td>
                      <td className={`text-right tabular-nums ${row.skipped ? 'text-amber-600' : 'text-slate-300'}`}>
                        {formatNumber(row.skipped)}
                      </td>
                      <td className="text-right tabular-nums font-semibold text-slate-800">{formatNumber(row.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.collections.some((row) => row.skipped > 0) && (
              <p className="border-t border-slate-100 px-4 py-2.5 text-[12px] leading-relaxed text-slate-500">
                Skipped documents were left out because the same record already exists under a
                different ID — putting them back would have created a duplicate.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Typed confirmation */}
      {confirmOpen && (
        <div className="srf-modal-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="srf-modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="srf-modal-header">
              <h3 className="srf-modal-title">
                {mode === 'replace' ? 'Replace the whole database?' : 'Restore missing data?'}
              </h3>
              <button onClick={() => setConfirmOpen(false)} className="srf-icon-btn">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="srf-modal-body space-y-4">
              <p className="text-[13px] leading-relaxed text-slate-600">{selectedMode.detail}</p>

              <div className="rounded-lg bg-slate-50 px-3.5 py-3">
                <p className="srf-mcard-label">File</p>
                <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-800">{file?.name}</p>
              </div>

              {mode === 'replace' && (
                <div className="flex items-start gap-2.5 rounded-lg bg-rose-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-rose-700">
                  <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
                  <span>
                    Everything currently in {formatNumber(stats?.totalDocuments)} document(s) across{' '}
                    {formatNumber(stats?.totalCollections)} collection(s) will be thrown away and rewritten
                    from this file.
                  </span>
                </div>
              )}

              <div>
                <label className="mb-1.5 block">
                  Type <span className="font-mono font-bold text-slate-900">{CONFIRM_WORD}</span> to continue
                </label>
                <input
                  type="text"
                  autoFocus
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full"
                  placeholder={CONFIRM_WORD}
                />
              </div>
            </div>

            <div className="srf-modal-footer">
              <button onClick={() => setConfirmOpen(false)} className="srf-btn srf-btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleRestore}
                disabled={confirmText !== CONFIRM_WORD}
                className={`srf-btn ${mode === 'replace' ? 'srf-btn-danger' : 'srf-btn-primary'}`}
              >
                {mode === 'replace' ? 'Replace Database' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
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

export default Database;
