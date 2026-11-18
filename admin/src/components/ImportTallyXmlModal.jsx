import React, { useRef, useState } from 'react';
import { FileUp, FileCode2, AlertTriangle, X } from 'lucide-react';
import api from '../utils/api';
import { readTallyBillsXml, toImportPayload } from '../utils/tallyXml';

const NEW_COMPANY = '__new__';

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const day = (iso) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }) : '—';

// Mounted only while open, so every import starts from an empty form
const ImportForm = ({ onClose, onImported, companies }) => {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [readError, setReadError] = useState('');
  const [reading, setReading] = useState(false);
  const [company, setCompany] = useState(companies[0]?.name || NEW_COMPANY);
  const [newCompany, setNewCompany] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [dragging, setDragging] = useState(false);

  const companyName = (company === NEW_COMPANY ? newCompany : company).trim();
  const canImport = parsed && parsed.bills.length > 0 && parsed.problems.length === 0 && companyName && !importing;

  const pick = async (picked) => {
    if (!picked) return;
    setFile(picked);
    setParsed(null);
    setReadError('');
    setImportError('');
    setReading(true);
    try {
      setParsed(await readTallyBillsXml(picked));
    } catch (error) {
      setReadError(error.message || 'Could not read this file');
    } finally {
      setReading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canImport) return;
    try {
      setImporting(true);
      setImportError('');
      const response = await api.post('/tally/outstandings/import', toImportPayload(companyName, parsed.bills));
      onImported(response.data);
    } catch (error) {
      const data = error.response?.data;
      const first = data?.errors?.[0];
      setImportError(
        (data?.message || 'Import failed') +
        (first ? ` — e.g. ${first.field}${first.index !== undefined ? ` in row ${first.index + 1}` : ''}: ${first.message}` : '')
      );
      setImporting(false);
    }
  };

  const summary = parsed?.summary;

  return (
    <div className="srf-modal-backdrop" onClick={importing ? undefined : onClose}>
      <form className="srf-modal-panel max-w-2xl" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">Import Tally XML</h3>
            <p className="mt-0.5 text-[13px] text-slate-500">
              A Bills Receivable export from Tally. It replaces every outstanding currently held for the company.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={importing} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* File */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-4 transition-colors ${
              dragging ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              {file ? <FileCode2 className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{file ? file.name : 'Choose an XML file'}</p>
              <p className="text-xs text-slate-400">
                {reading ? 'Reading…' : file ? `${(file.size / 1024).toFixed(0)} KB · click to choose another` : 'or drop it here'}
              </p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              className="hidden"
              onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
            />
          </div>

          {readError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700 ring-1 ring-inset ring-rose-200">{readError}</p>
          )}

          {summary && (
            <>
              {/* What the file holds */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {[
                  ['Bills', summary.bills.toLocaleString('en-IN')],
                  ['Parties', summary.parties.toLocaleString('en-IN')],
                  ['Total pending', money(summary.pending)],
                  ['Bill dates', summary.from ? `${day(summary.from)} – ${day(summary.to)}` : '—']
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-200 p-2.5">
                    <p className="srf-mcard-label">{label}</p>
                    <p className="mt-1 truncate text-sm font-bold tabular-nums text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              {summary.pending < 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800 ring-1 ring-inset ring-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  The total is a credit balance. Check this is a Bills <b>Receivable</b> export, not Bills Payable.
                </p>
              )}
              {summary.settledBills > 0 && (
                <p className="text-xs text-slate-500">{summary.settledBills} bill(s) with nothing pending will be skipped.</p>
              )}

              {parsed.problems.length > 0 ? (
                <div className="rounded-lg ring-1 ring-inset ring-rose-200">
                  <p className="bg-rose-50 px-3 py-2.5 text-[13px] font-semibold text-rose-700">
                    {parsed.problems.length} bill(s) can't be read — fix them in Tally and export again. Nothing is imported until every bill reads cleanly.
                  </p>
                  <ul className="max-h-48 divide-y divide-rose-100 overflow-y-auto text-xs">
                    {parsed.problems.slice(0, 100).map((p) => (
                      <li key={p.row} className="px-3 py-2">
                        <span className="font-semibold text-slate-700">Row {p.row}</span>
                        <span className="text-slate-500"> · {p.party} · {p.ref}</span>
                        <span className="block text-rose-600">{p.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    First {Math.min(parsed.bills.length, 6)} of {parsed.bills.length}
                  </p>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {parsed.bills.slice(0, 6).map((b) => (
                        <tr key={`${b.party}|${b.ref}`}>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500">{day(b.billDate)}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">{b.ref}</td>
                          <td className="max-w-[220px] truncate px-3 py-2 text-slate-600">{b.party}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{money(b.pending)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Which company it replaces */}
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="srf-mcard-label">Company</span>
                  <select value={company} onChange={(e) => setCompany(e.target.value)}>
                    {companies.map((c) => <option key={c.guid} value={c.name}>{c.name}</option>)}
                    <option value={NEW_COMPANY}>New company…</option>
                  </select>
                </label>
                {company === NEW_COMPANY && (
                  <label className="flex flex-col gap-1">
                    <span className="srf-mcard-label">Company name</span>
                    <input
                      type="text"
                      value={newCompany}
                      onChange={(e) => setNewCompany(e.target.value)}
                      placeholder="As named in Tally"
                      autoFocus
                    />
                  </label>
                )}
              </div>
              {company === NEW_COMPANY && companies.length > 0 && (
                <p className="text-xs text-amber-700">
                  A new company is shown alongside {companies.map((c) => c.name).join(', ')} — pick the existing one to replace its figures instead.
                </p>
              )}
            </>
          )}

          {importError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700 ring-1 ring-inset ring-rose-200">{importError}</p>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
          <button type="button" onClick={onClose} disabled={importing} className="srf-btn srf-btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={!canImport} className="srf-btn srf-btn-primary">
            {importing ? 'Importing…' : summary ? `Import ${summary.bills.toLocaleString('en-IN')} bill(s)` : 'Import'}
          </button>
        </div>
      </form>
    </div>
  );
};

const ImportTallyXmlModal = ({ isOpen, onClose, onImported, companies = [] }) => {
  if (!isOpen) return null;
  return <ImportForm onClose={onClose} onImported={onImported} companies={companies} />;
};

export default ImportTallyXmlModal;
