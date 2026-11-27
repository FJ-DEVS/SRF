import React, { useState } from 'react';
import { FileDown } from 'lucide-react';

// "Download as PDF" for a report or graph. onExport builds and saves the PDF
// (see utils/reportPdf.js); the button shows it is working meanwhile and
// says so if it fails. Left out of the PDF's own picture of the page.
const PdfButton = ({ onExport, label = 'PDF', title = 'Download as PDF', className = '' }) => {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onExport();
    } catch (error) {
      console.error('PDF export failed:', error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      data-pdf-ignore=""
      title={failed ? 'Could not make the PDF — try again' : title}
      aria-label={title}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ring-1 transition-colors disabled:opacity-60 ${
        failed ? 'text-rose-600 ring-rose-200 hover:bg-rose-50' : 'text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900'
      } ${className}`}
    >
      {busy ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      ) : (
        <FileDown className={`h-3.5 w-3.5 ${failed ? 'text-rose-500' : 'text-rose-500'}`} />
      )}
      {busy ? 'Preparing…' : failed ? 'Retry PDF' : label}
    </button>
  );
};

export default PdfButton;
