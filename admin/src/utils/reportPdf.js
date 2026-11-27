import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { convertModernColorsToRgb } from './shareUtils';

// Reports and graphs as PDF downloads. A PDF has a header (title, what it
// covers, when it was downloaded), then optionally a picture of a chart, then
// any number of tables as real text — so the figures can be read, searched
// and copied, not just looked at.

const MARGIN = 36;
const INK = [15, 23, 42];
const MUTED = [100, 116, 139];

// Anything marked data-pdf-ignore (buttons, pickers, hints) is left out
const ignored = (el) => el?.dataset?.pdfIgnore !== undefined;

// A cell that holds a figure: 1,234 · -5 · 12.5% · ₹1,34,350
const FIGURE = /^(₹\s?|Rs\.?\s?)?[−-]?[\d,]+(\.\d+)?%?$/;

// A picture of an element. Tailwind's oklch() colours are swapped for rgb in
// the copy html2canvas draws from — it can't read oklch.
export const captureElement = async (element) => {
  if (document.fonts?.ready) await document.fonts.ready;
  return html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    logging: false,
    useCORS: true,
    ignoreElements: ignored,
    onclone: (clonedDoc) => {
      // html2canvas also reads the text-stroke colour, which follows the text
      // colour (oklch) and has no width here anyway — make it plain
      const style = clonedDoc.createElement('style');
      style.textContent =
        '*, *::before, *::after { -webkit-text-stroke-color: transparent !important; text-emphasis-color: transparent !important; }';
      clonedDoc.head.appendChild(style);
      convertModernColorsToRgb(clonedDoc.documentElement);
    }
  });
};

const stamp = () =>
  new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const fileSafe = (text) =>
  String(text || 'report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'report';

const header = (doc, { title, subtitle, details }, downloadedAt) => {
  const width = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('SRF  ·  REPORT', MARGIN, MARGIN);
  doc.text(`Downloaded ${downloadedAt}`, width - MARGIN, MARGIN, { align: 'right' });

  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text(title || 'Report', MARGIN, MARGIN + 22);

  let y = MARGIN + 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  for (const line of [subtitle, ...(details || [])].filter(Boolean)) {
    const wrapped = doc.splitTextToSize(String(line), width - MARGIN * 2);
    doc.text(wrapped, MARGIN, y + 15);
    y += 13 * wrapped.length;
  }
  return y + 18;
};

// A canvas drawn page width. A chart that fits on a page is kept whole —
// shrunk and centred when it would take more than `maxShare` of the page, so
// its tables follow on the same page; anything taller than a page is cut
// across pages.
const addCanvas = (doc, canvas, startY, maxShare = 1) => {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const drawW = pageW - MARGIN * 2;
  const contentH = pageH - MARGIN * 2;
  const fullH = (canvas.height / canvas.width) * drawW;
  if (fullH <= contentH) {
    const h = Math.min(fullH, contentH * maxShare);
    const w = (h / fullH) * drawW;
    let top = startY;
    if (top + h > pageH - MARGIN) {
      doc.addPage();
      top = MARGIN;
    }
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', MARGIN + (drawW - w) / 2, top, w, h);
    return top + h + 14;
  }

  const pxPerPt = canvas.width / drawW;
  let y = startY;
  let srcY = 0;
  while (srcY < canvas.height) {
    let room = pageH - MARGIN - y;
    if (room < 80) {
      doc.addPage();
      y = MARGIN;
      room = pageH - MARGIN * 2;
    }
    const slicePx = Math.min(canvas.height - srcY, Math.floor(room * pxPerPt));
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = slicePx;
    slice.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
    // JPEG on white keeps a full-page chart to a few hundred KB
    doc.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', MARGIN, y, drawW, slicePx / pxPerPt);
    y += slicePx / pxPerPt;
    srcY += slicePx;
  }
  return y + 14;
};

const addTable = (doc, table, startY) => {
  const pageH = doc.internal.pageSize.getHeight();
  let y = startY;
  if (y > pageH - MARGIN - 60) {
    doc.addPage();
    y = MARGIN;
  }
  if (table.title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(table.title, MARGIN, y + 4);
    y += 12;
  }
  const columns = table.head?.[0]?.length || table.html?.rows?.[0]?.cells?.length || 6;

  // Columns whose cells are all figures are right-aligned, heading included
  const bodyCells = table.html
    ? [...(table.html.tBodies?.[0]?.rows || [])].map((r) => [...r.cells].map((c) => c.textContent))
    : (table.body || []).map((r) => r.map((c) => String(c ?? '')));
  const numericCols = new Set();
  for (let i = 1; i < columns; i += 1) {
    const values = bodyCells.map((r) => (r[i] || '').trim()).filter((v) => v && v !== '-' && v !== '—');
    if (values.length && values.every((v) => FIGURE.test(v))) numericCols.add(i);
  }

  autoTable(doc, {
    ...(table.html ? { html: table.html } : { head: table.head, body: table.body, foot: table.foot }),
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + 6 },
    styles: { font: 'helvetica', fontSize: columns > 16 ? 6.5 : columns > 10 ? 7.5 : 9, cellPadding: 3.5, overflow: 'linebreak' },
    headStyles: { fillColor: INK, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: table.columnStyles,
    didParseCell: (data) => {
      if (numericCols.has(data.column.index)) data.cell.styles.halign = 'right';
      // The PDF's built-in font has no rupee sign
      data.cell.text = data.cell.text.map((t) => t.replace(/₹\s?/g, 'Rs. ').replace(/−/g, '-'));
    }
  });
  return doc.lastAutoTable.finalY + 20;
};

// Build and download a report PDF.
//   title, subtitle      the heading
//   details: [string]    extra lines under it — filters, period, totals
//   element              a chart (or any block) to draw as a picture
//   tables: [{ title?, head: [[...]], body: [[...]], foot?: [[...]] }
//            | { title?, html: <table> }]
//   orientation          'landscape' (default) or 'portrait'
export const downloadReportPdf = async ({ title, subtitle, details = [], element = null, tables = [], orientation }) => {
  const widest = Math.max(0, ...tables.map((t) => t.head?.[0]?.length || t.html?.rows?.[0]?.cells?.length || 0));
  const doc = new jsPDF({
    orientation: orientation || 'landscape',
    unit: 'pt',
    // Very wide tables (two years of months) get an A3 page
    format: widest > 18 ? 'a3' : 'a4'
  });
  const downloadedAt = stamp();
  let y = header(doc, { title, subtitle, details }, downloadedAt);

  // With tables to follow, the picture takes at most half the page
  const hasTables = tables.some((t) => t.html || t.body?.length);
  if (element) y = addCanvas(doc, await captureElement(element), y, hasTables ? 0.5 : 1);
  for (const table of tables) {
    if (table.html || table.body?.length) y = addTable(doc, table, y);
  }

  // Footer on every page, so a loose page still says what and when
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${title || 'Report'}  ·  downloaded ${downloadedAt}`, MARGIN, h - 18);
    doc.text(`Page ${i} of ${pages}`, w - MARGIN, h - 18, { align: 'right' });
  }

  doc.save(`${fileSafe(title)}_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// Every <table> inside an element, for downloadReportPdf's `tables`
export const tablesIn = (element) => [...(element?.querySelectorAll('table') || [])].map((html) => ({ html }));
