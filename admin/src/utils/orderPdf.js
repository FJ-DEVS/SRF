import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatStatus } from './shareUtils';
import { typeStyle } from './orderType';
import { orderQty } from './orderMath';
import logo1 from '../assets/logo1.png';

const MARGIN = 28;
const HEADER_HEIGHT = 64;
const SLATE_900 = [15, 23, 42];
const SLATE_700 = [51, 65, 85];
const SLATE_500 = [100, 116, 139];
const SLATE_400 = [148, 163, 184];
const SLATE_200 = [226, 232, 240];

// The logo as an <img> jsPDF can embed — a receipt without it still beats none
const loadLogo = () => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = logo1;
});

// The share card's receipt as an A5 PDF. The card is one tall image that a long
// order shrinks past reading; here the items run on over as many pages as they
// need, with the table header repeated and every page numbered.
export const downloadOrderPdf = async (order) => {
  const logo = await loadLogo();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a5', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const orderType = typeStyle(order.type).label;
  const customerLabel = order.type === 'purchase order' ? 'Vendor' : 'Customer';
  const customerName = order.customerName?.name || '-';
  const createdBy = order.createdByType === 'admin'
    ? 'Admin'
    : (order.createdBy?.name || '-');
  const items = order.items || [];
  const generatedOn = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  // Header band: logo, name and the order type pill, as on the card
  doc.setFillColor(...SLATE_900);
  doc.rect(0, 0, pageWidth, HEADER_HEIGHT, 'F');
  if (logo) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(MARGIN, 14, 36, 36, 7, 7, 'F');
    doc.addImage(logo, 'PNG', MARGIN + 4, 18, 28, 28, undefined, 'FAST');
  }
  const titleX = logo ? MARGIN + 46 : MARGIN;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255);
  doc.text('SRF Trades', titleX, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_400);
  doc.text('Order Receipt', titleX, 43);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const pillWidth = doc.getTextWidth(orderType) + 20;
  doc.setDrawColor(71, 85, 105);
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(pageWidth - MARGIN - pillWidth, 22, pillWidth, 20, 10, 10, 'FD');
  doc.setTextColor(255);
  doc.text(orderType, pageWidth - MARGIN - pillWidth / 2, 35, { align: 'center' });

  // Who, when and where it stands — two columns, long values wrap
  const fields = [
    [customerLabel, customerName],
    ['Date', new Date(order.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })],
    ['Order By', createdBy],
    ['Status', formatStatus(order.status)],
    ['Cargo', order.cargo?.name || 'No Cargo Assigned'],
    ...(order.billNumber ? [['Bill No', order.billNumber]] : [])
  ];
  const gap = 16;
  const colWidth = (pageWidth - MARGIN * 2 - gap) / 2;
  let y = HEADER_HEIGHT + 24;
  for (let i = 0; i < fields.length; i += 2) {
    let rowHeight = 0;
    fields.slice(i, i + 2).forEach(([label, value], col) => {
      const x = MARGIN + col * (colWidth + gap);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...SLATE_400);
      doc.text(label.toUpperCase(), x, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...SLATE_700);
      const lines = doc.splitTextToSize(String(value), colWidth);
      doc.text(lines, x, y + 12);
      rowHeight = Math.max(rowHeight, 12 + lines.length * 11);
    });
    y += rowHeight + 10;
  }

  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.75);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_500);
  doc.text(`ITEMS (${items.length})`, MARGIN, y);

  autoTable(doc, {
    startY: y + 8,
    head: [[
      { content: '#', styles: { halign: 'center' } },
      'Item',
      { content: 'Qty', styles: { halign: 'right' } }
    ]],
    body: items.length > 0
      ? items.map((oi, idx) => [idx + 1, oi.item?.name || 'Unknown', oi.quantity])
      : [[{ content: 'No items', colSpan: 3, styles: { fontStyle: 'italic', textColor: SLATE_400 } }]],
    foot: [['', 'Total quantity', { content: orderQty(order), styles: { halign: 'right' } }]],
    showFoot: 'lastPage',
    // top: room for the running header on continuation pages
    margin: { top: 48, left: MARGIN, right: MARGIN, bottom: 40 },
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: 6,
      textColor: SLATE_900,
      lineColor: SLATE_200,
      lineWidth: { bottom: 0.5 }
    },
    headStyles: { fillColor: SLATE_900, textColor: 255, fontSize: 8.5, lineWidth: 0 },
    footStyles: { fillColor: [241, 245, 249], textColor: SLATE_900, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 28, textColor: SLATE_500 },
      1: { fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 56, fontStyle: 'bold' }
    }
  });

  // Every page says whose order it is and where it sits, so a loose page is
  // never a mystery; page 1 already has the full header
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...SLATE_900);
      doc.text('SRF Trades', MARGIN, 28);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...SLATE_500);
      const [line, ...rest] = doc.splitTextToSize(`${orderType}  ·  ${customerName}`, pageWidth - MARGIN * 2 - 80);
      doc.text(rest.length ? `${line}…` : line, pageWidth - MARGIN, 28, { align: 'right' });
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...SLATE_400);
    doc.text(`Order ID: ${order._id}`, MARGIN, pageHeight - 20);
    doc.text(`Generated ${generatedOn}  ·  Page ${page} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 20, { align: 'right' });
  }

  doc.save(`order_${order._id}_${Date.now()}.pdf`);
};
