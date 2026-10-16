import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api, { fetchAll } from '../utils/api';
import AlertModal from '../components/AlertModal';
import Pagination from '../components/Pagination';
import PageHeader from '../components/PageHeader';
import SortSelect from '../components/SortSelect';
import { formatDateTime } from '../utils/orderMath';
import { ruleText, periodText } from '../utils/reorderRules';
import {
  Search, ClipboardList, SlidersHorizontal, ArrowRight, AlertTriangle, ShieldCheck, CircleOff,
  Download, FileText, ShoppingCart, PackageSearch, Boxes, TrendingDown, IndianRupee, Clock
} from 'lucide-react';

// Sorts act on the computed columns, so they live here rather than in
// sortOptions.js — values match STATUS_SORTS in the backend controller
const REORDER_SORT_OPTIONS = [
  { value: 'item_asc', label: 'Item A–Z (with serial no.)' },
  { value: 'item_noserial_asc', label: 'Item A–Z (without serial no.)' },
  { value: 'shortfall_desc', label: 'Shortfall: high to low' },
  { value: 'order_desc', label: 'Order qty: high to low' },
  { value: 'value_desc', label: 'Order value: high to low' },
  { value: 'available_asc', label: 'Available: low to high' },
  { value: 'prev_sales_desc', label: 'Last month sales: high to low' }
];

const STATE_CHIPS = [
  { value: 'short', label: 'Needs order', Icon: AlertTriangle, tint: 'text-amber-700' },
  { value: 'ok', label: 'Stock OK', Icon: ShieldCheck, tint: 'text-emerald-700' },
  { value: 'untracked', label: 'Not tracked', Icon: CircleOff, tint: 'text-slate-500' }
];

// "2026-10-14_15-42" in local time, so files downloaded the same day sort apart
const fileStamp = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
};

const num = (n) => Number(n || 0).toLocaleString('en-IN');

// How a row's reorder level came about, for the cell's tooltip
const levelBasis = (row) => {
  if (row.reorderLevel == null) return 'Not tracked — no reorder rule and no check level';
  if (row.levelSource === 'checkLevel') return 'No reorder rule — using the check level';
  const rule = row.reorder?.level;
  const parts = [];
  if (rule?.quantity != null) parts.push(`Fixed ${rule.quantity}`);
  if (rule?.periodValue) parts.push(`Consumed ${row.levelConsumption} in the ${periodText(rule)}`);
  if (parts.length === 2) parts.push(`→ ${rule.criteria} of the two`);
  return parts.join(' · ');
};

const Reorder = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [state, setState] = useState('');
  const [sortBy, setSortBy] = useState('item_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });
  const [summary, setSummary] = useState(null);
  const [asOf, setAsOf] = useState(null);
  const [prevMonth, setPrevMonth] = useState(null);
  const [categories, setCategories] = useState([]);
  // Excel / PDF / purchase order — each fetches the whole filtered list
  const [actionLoading, setActionLoading] = useState('');
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', type: 'error' });

  useEffect(() => {
    api.get('/categories')
      .then((res) => { if (res.data.success) setCategories(res.data.data); })
      .catch((error) => console.error('Error fetching categories:', error));
  }, []);

  useEffect(() => {
    fetchRows();
  }, [searchTerm, categoryFilter, state, sortBy, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, state, sortBy, pageSize]);

  const listFilters = () => ({ search: searchTerm, category: categoryFilter, state, sort: sortBy });

  const fetchRows = async () => {
    try {
      setLoading(true);
      const response = await api.get('/reorder/status', {
        params: { ...listFilters(), page: currentPage, limit: pageSize }
      });
      if (response.data.success) {
        setRows(response.data.data);
        setSummary(response.data.summary);
        setAsOf(response.data.asOf);
        setPrevMonth(response.data.prevMonth);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching reorder status:', error);
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

  const prevMonthLabel = prevMonth
    ? new Date(prevMonth.start).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : 'Last month';
  const prevMonthShort = prevMonth
    ? new Date(prevMonth.start).toLocaleDateString('en-IN', { month: 'short' })
    : 'Last mo.';

  // "0-8mm_needs-order_search-shg" — names an export after the filters behind it
  const filterSuffix = () => {
    const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    return [
      categoryFilter && slug(categoryFilter),
      state && slug(STATE_CHIPS.find((c) => c.value === state)?.label || state),
      searchTerm && `search-${slug(searchTerm)}`
    ].filter(Boolean).join('_');
  };

  const filterLine = () =>
    `Category: ${categoryFilter || 'All categories'}` +
    (state ? `  ·  ${STATE_CHIPS.find((c) => c.value === state)?.label}` : '') +
    (searchTerm ? `  ·  Search: "${searchTerm}"` : '');

  // Every row behind the current view, across all its pages
  const fetchAllRows = async (kind) => {
    setActionLoading(kind);
    try {
      const all = await fetchAll('/reorder/status', listFilters());
      if (all.length === 0) showAlert('No Data', 'No items match the current filters', 'info');
      return all;
    } catch {
      showAlert('Error', 'Failed to load the reorder status', 'error');
      return [];
    } finally {
      setActionLoading('');
    }
  };

  // The same columns as Tally's "Stock Group Reorder Status" export
  const handleExportExcel = async () => {
    const all = await fetchAllRows('excel');
    if (all.length === 0) return;

    const data = all.map((row, i) => ({
      'S.No': i + 1,
      'Name of Item': row.name,
      'Category': row.category || '',
      'Closing Stock': row.closingStock,
      'Purc Orders Pending': row.purchasePending || '',
      'Nett Available': row.nettAvailable,
      [`${prevMonthLabel} Sales`]: row.prevMonthSales,
      'Re-order Level': row.reorderLevel ?? '',
      'Reorder Rule': ruleText(row.reorder?.level) || (row.levelSource === 'checkLevel' ? 'Check level' : ''),
      'Short fall': row.shortfall || '',
      'Min Reorder Qty': row.minOrderQty || '',
      'Order to be Placed': row.orderQty || '',
      'Order Value (Rs.)': row.orderQty ? row.orderValue : ''
    }));
    const totals = all.reduce(
      (acc, r) => ({
        stock: acc.stock + r.closingStock,
        pending: acc.pending + r.purchasePending,
        nett: acc.nett + r.nettAvailable,
        sales: acc.sales + r.prevMonthSales,
        shortfall: acc.shortfall + r.shortfall,
        order: acc.order + r.orderQty,
        value: acc.value + r.orderValue
      }),
      { stock: 0, pending: 0, nett: 0, sales: 0, shortfall: 0, order: 0, value: 0 }
    );
    data.push({
      'S.No': '',
      'Name of Item': 'Grand Total',
      'Category': '',
      'Closing Stock': totals.stock,
      'Purc Orders Pending': totals.pending,
      'Nett Available': totals.nett,
      [`${prevMonthLabel} Sales`]: totals.sales,
      'Re-order Level': '',
      'Reorder Rule': '',
      'Short fall': totals.shortfall,
      'Min Reorder Qty': '',
      'Order to be Placed': totals.order,
      'Order Value (Rs.)': totals.value
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reorder Status');
    const suffix = filterSuffix();
    XLSX.writeFile(workbook, `reorder-status${suffix ? `_${suffix}` : ''}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportPdf = async () => {
    const all = await fetchAllRows('pdf');
    if (all.length === 0) return;

    const now = new Date();
    const downloadedAt = formatDateTime(now);
    const sortLabel = REORDER_SORT_OPTIONS.find((o) => o.value === sortBy)?.label;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 36;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Stock Reorder Status', margin, 44);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(filterLine(), margin, 62);
    doc.text(`${all.length} item${all.length === 1 ? '' : 's'}${sortLabel ? `  ·  Sort: ${sortLabel}` : ''}  ·  Nett available = stock + pending purchase orders`, margin, 75);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30);
    doc.text(`As of: ${downloadedAt}`, pageWidth - margin, 44, { align: 'right' });

    const totals = all.reduce(
      (acc, r) => ({
        stock: acc.stock + r.closingStock,
        pending: acc.pending + r.purchasePending,
        nett: acc.nett + r.nettAvailable,
        sales: acc.sales + r.prevMonthSales,
        shortfall: acc.shortfall + r.shortfall,
        order: acc.order + r.orderQty,
        value: acc.value + r.orderValue
      }),
      { stock: 0, pending: 0, nett: 0, sales: 0, shortfall: 0, order: 0, value: 0 }
    );

    autoTable(doc, {
      head: [['#', 'Name of Item', 'Stock', 'PO Pend.', 'Nett Avail.', `${prevMonthShort} Sales`, 'Level', 'Shortfall', 'Min Qty', 'To Order', 'Value (Rs.)']],
      body: all.map((row, i) => [
        i + 1,
        row.name,
        row.closingStock,
        row.purchasePending || '',
        row.nettAvailable,
        row.prevMonthSales,
        row.reorderLevel ?? '-',
        row.shortfall || '',
        row.minOrderQty || '',
        row.orderQty || '',
        row.orderQty ? num(row.orderValue) : ''
      ]),
      foot: [['', 'Grand Total', num(totals.stock), num(totals.pending), num(totals.nett), num(totals.sales), '', num(totals.shortfall), '', num(totals.order), num(totals.value)]],
      startY: 88,
      margin: { left: margin, right: margin, bottom: 36 },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      footStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 28 },
        2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' },
        9: { halign: 'right', fontStyle: 'bold' }, 10: { halign: 'right' }
      },
      didParseCell: (data) => {
        // Rows that need an order read amber, as they do on screen
        if (data.section === 'body' && all[data.row.index]?.orderQty > 0) data.cell.styles.fillColor = [255, 251, 235];
      },
      didDrawPage: () => {
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Downloaded on ${downloadedAt}`, margin, pageHeight - 18);
        doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 18, { align: 'right' });
      }
    });

    doc.save(`reorder-status_${filterSuffix() || 'all'}_${fileStamp(now)}.pdf`);
  };

  // Opens a new purchase order on the Orders page holding every item in view
  // that is short, each pre-filled with its "order to be placed" quantity
  const handleCreatePurchaseOrder = async () => {
    const all = await fetchAllRows('order');
    const short = all.filter((row) => row.orderQty > 0);
    if (all.length === 0) return;
    if (short.length === 0) {
      showAlert('Nothing to Order', 'No item in view is below its reorder level.', 'info');
      return;
    }
    navigate('/orders', {
      state: {
        purchaseItems: short.map((row) => ({
          itemId: row._id,
          name: row.name,
          price: row.price,
          availableQty: row.quantity,
          quantity: row.orderQty
        }))
      }
    });
  };

  const tiles = summary
    ? [
        { title: 'Items needing order', value: `${num(summary.itemsShort)} / ${num(summary.items)}`, Icon: PackageSearch, tint: 'bg-amber-50 text-amber-600' },
        { title: 'Total shortfall', value: num(summary.shortfall), Icon: TrendingDown, tint: 'bg-rose-50 text-rose-600' },
        { title: 'Pieces to order', value: num(summary.orderQty), Icon: ShoppingCart, tint: 'bg-indigo-50 text-indigo-600' },
        { title: 'Order value', value: `₹${num(summary.orderValue)}`, Icon: IndianRupee, tint: 'bg-emerald-50 text-emerald-600' },
        { title: `${prevMonthLabel} sales`, value: num(summary.prevMonthSales), Icon: Boxes, tint: 'bg-sky-50 text-sky-600' },
        { title: 'On pending purchase orders', value: num(summary.purchasePending), Icon: Clock, tint: 'bg-slate-100 text-slate-600' }
      ]
    : [];

  const levelCell = (row) => {
    if (row.reorderLevel == null) return <span className="text-slate-300" title={levelBasis(row)}>—</span>;
    return (
      <span className="inline-flex items-center gap-1 tabular-nums" title={levelBasis(row)}>
        <span className="font-semibold text-slate-900">{row.reorderLevel}</span>
        {row.levelSource === 'checkLevel' && (
          <span className="text-[10px] uppercase tracking-wide text-slate-400">check</span>
        )}
      </span>
    );
  };

  const orderCell = (row) =>
    row.orderQty > 0 ? (
      <span className="srf-badge bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 !text-[12px] tabular-nums">
        {row.orderQty}
      </span>
    ) : (
      <span className="text-slate-300">—</span>
    );

  const dash = (n) => (n ? <span className="tabular-nums">{num(n)}</span> : <span className="text-slate-300">—</span>);

  return (
    <div className="srf-page">
      <PageHeader
        title="Reorder"
        subtitle={`Stock reorder status${asOf ? ` as of ${formatDateTime(asOf)}` : ''} · nett available = stock + pending purchase orders`}
      >
        <Link to="/reorder-levels" className="srf-btn srf-btn-secondary">
          <SlidersHorizontal className="h-4 w-4 text-slate-400" />
          Reorder levels
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <button onClick={handleExportExcel} disabled={loading || rows.length === 0 || Boolean(actionLoading)} className="srf-btn srf-btn-secondary">
          <Download className="h-4 w-4 text-slate-400" />
          {actionLoading === 'excel' ? 'Exporting…' : 'Export Excel'}
        </button>
        <button onClick={handleExportPdf} disabled={loading || rows.length === 0 || Boolean(actionLoading)} className="srf-btn srf-btn-secondary">
          <FileText className="h-4 w-4 text-rose-500" />
          {actionLoading === 'pdf' ? 'Preparing…' : 'Download PDF'}
        </button>
        <button
          onClick={handleCreatePurchaseOrder}
          disabled={loading || !summary?.itemsShort || Boolean(actionLoading)}
          className="srf-btn srf-btn-primary"
          title={summary ? `Purchase order for the ${summary.itemsShort} item(s) in view that are short` : undefined}
        >
          <ShoppingCart className="h-4 w-4" />
          {actionLoading === 'order' ? 'Loading…' : 'Create Purchase Order'}
        </button>
      </PageHeader>

      {/* Totals over everything the filters keep */}
      {summary && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
          {tiles.map((tile) => (
            <div key={tile.title} className="srf-card p-3.5">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tile.tint}`}>
                <tile.Icon className="h-4 w-4" />
              </span>
              <p className="mt-2.5 font-display text-xl font-bold leading-none text-slate-900 tabular-nums">{tile.value}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">{tile.title}</p>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
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
          <SortSelect value={sortBy} onChange={setSortBy} options={REORDER_SORT_OPTIONS} className="w-full sm:ml-auto sm:w-auto" />
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
          {STATE_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => setState(state === chip.value ? '' : chip.value)}
              className={`srf-chip ${state === chip.value ? 'srf-chip-active' : chip.tint}`}
            >
              <chip.Icon className="h-3 w-3" />
              {chip.label}
            </button>
          ))}
          {summary?.itemsUntracked > 0 && (
            <span className="ml-auto text-[11px] text-slate-400">
              <span className="font-semibold text-slate-700 tabular-nums">{summary.itemsUntracked}</span> not tracked —{' '}
              <Link to="/reorder-levels?configured=no" className="font-semibold text-indigo-600 hover:underline">set a rule</Link>
            </span>
          )}
        </div>
      </div>

      {/* Report */}
      <div className="srf-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <ClipboardList className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No items found</p>
            <p className="mt-1 text-xs text-slate-400">Try a different search or filter.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th>Name of Item</th>
                    <th className="text-right">Closing Stock</th>
                    <th className="text-right">PO Pending</th>
                    <th className="text-right">Nett Available</th>
                    <th className="text-right">{prevMonthShort} Sales</th>
                    <th className="text-right">Reorder Level</th>
                    <th className="text-right">Shortfall</th>
                    <th className="text-right">Min Order</th>
                    <th className="text-right">Order to Place</th>
                    <th className="text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row._id} className={row.orderQty > 0 ? 'bg-amber-50/60' : ''}>
                      <td className="max-w-[320px]">
                        <p className="truncate font-semibold text-slate-900">{row.name}</p>
                        {row.category && <p className="text-[11px] text-slate-400">{row.category}</p>}
                      </td>
                      <td className="text-right tabular-nums font-medium text-slate-800">{num(row.closingStock)}</td>
                      <td className="text-right">{dash(row.purchasePending)}</td>
                      <td className="text-right tabular-nums font-semibold text-slate-900">{num(row.nettAvailable)}</td>
                      <td className="text-right">{dash(row.prevMonthSales)}</td>
                      <td className="text-right">{levelCell(row)}</td>
                      <td className={`text-right ${row.shortfall ? 'font-semibold text-rose-600' : ''}`}>{dash(row.shortfall)}</td>
                      <td className="text-right">{dash(row.minOrderQty)}</td>
                      <td className="text-right">{orderCell(row)}</td>
                      <td className="text-right">{row.orderQty ? <span className="tabular-nums font-medium text-slate-800">₹{num(row.orderValue)}</span> : <span className="text-slate-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
                {summary && (
                  <tfoot>
                    <tr className="bg-slate-50/80 text-[13px] font-bold text-slate-900">
                      <td className="px-4 py-3 uppercase tracking-wider text-[11px] text-slate-500">
                        Grand Total · {num(summary.items)} item{summary.items === 1 ? '' : 's'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(summary.closingStock)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(summary.purchasePending)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(summary.closingStock + summary.purchasePending)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(summary.prevMonthSales)}</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">{num(summary.shortfall)}</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right tabular-nums">{num(summary.orderQty)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">₹{num(summary.orderValue)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {rows.map((row) => (
                <div key={row._id} className={`p-3.5 ${row.orderQty > 0 ? 'bg-amber-50/60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
                      {row.category && <p className="text-[11px] text-slate-400">{row.category}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      {orderCell(row)}
                      {row.orderQty > 0 && <p className="mt-0.5 text-[11px] text-slate-500">₹{num(row.orderValue)}</p>}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-[11px] text-slate-500">
                    <span>Stock <span className="font-semibold text-slate-800 tabular-nums">{num(row.closingStock)}</span></span>
                    <span>PO pending <span className="font-semibold text-slate-800 tabular-nums">{num(row.purchasePending)}</span></span>
                    <span>Available <span className="font-semibold text-slate-800 tabular-nums">{num(row.nettAvailable)}</span></span>
                    <span>{prevMonthShort} sales <span className="font-semibold text-slate-800 tabular-nums">{num(row.prevMonthSales)}</span></span>
                    <span>Level {levelCell(row)}</span>
                    <span>Shortfall <span className={`font-semibold tabular-nums ${row.shortfall ? 'text-rose-600' : 'text-slate-800'}`}>{num(row.shortfall)}</span></span>
                  </div>
                </div>
              ))}
              {summary && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-slate-50/80 px-3.5 py-2.5 text-[12px] text-slate-700">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-slate-500">Grand total</span>
                  <span>Shortfall <span className="font-bold tabular-nums text-rose-600">{num(summary.shortfall)}</span></span>
                  <span>To order <span className="font-bold tabular-nums">{num(summary.orderQty)}</span></span>
                  <span>Value <span className="font-bold tabular-nums">₹{num(summary.orderValue)}</span></span>
                </div>
              )}
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

export default Reorder;
