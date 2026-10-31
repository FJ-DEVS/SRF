import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../utils/api';
import PageHeader from '../components/PageHeader';
import FilterPanel from '../components/FilterPanel';
import { formatDateTime } from '../utils/orderMath';
import { Trophy, Medal, Award, Crown, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

// "2026-10-14_15-42" in local time, so files downloaded the same day sort apart
const fileStamp = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
};

const rankBadge = (rank) => {
  if (rank === 1) return <Crown className="h-4 w-4 text-amber-500" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-amber-700" />;
  return <span className="text-xs font-semibold text-slate-400">#{rank}</span>;
};

const SchemaLeaderboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [schemas, setSchemas] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('schema') || '');
  const [selectedSalesman, setSelectedSalesman] = useState(searchParams.get('salesman') || '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSchemas();
    fetchSalesmen();
  }, []);

  useEffect(() => {
    if (selectedId) fetchLeaderboard(selectedId, selectedSalesman);
    else setResult(null);
  }, [selectedId, selectedSalesman]);

  const fetchSchemas = async () => {
    try {
      const response = await api.get('/schemas', { params: { limit: 1000 } });
      if (response.data.success) {
        const list = response.data.data;
        setSchemas(list);
        // Default to the query-param schema, else the first one.
        if (!selectedId && list.length > 0) setSelectedId(list[0]._id);
      }
    } catch (error) {
      console.error('Error fetching schemas:', error);
    }
  };

  const fetchSalesmen = async () => {
    try {
      const response = await api.get('/salesman', { params: { limit: 200 } });
      if (response.data.success) setSalesmen(response.data.data);
    } catch (error) {
      console.error('Error fetching salesmen:', error);
    }
  };

  const fetchLeaderboard = async (id, salesman) => {
    try {
      setLoading(true);
      const response = await api.get(`/schemas/${id}/leaderboard`, {
        params: salesman ? { salesman } : {}
      });
      if (response.data.success) setResult(response.data.data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const syncParams = (schema, salesman) => {
    const params = {};
    if (schema) params.schema = schema;
    if (salesman) params.salesman = salesman;
    setSearchParams(params);
  };

  const handleSelect = (id) => {
    setSelectedId(id);
    syncParams(id, selectedSalesman);
  };

  const handleSalesmanSelect = (id) => {
    setSelectedSalesman(id);
    syncParams(selectedId, id);
  };

  const leaderboard = result?.leaderboard || [];
  const topTierPoints =
    result?.schema?.tiers?.length > 0
      ? Math.max(...result.schema.tiers.map((t) => t.pointsRequired))
      : null;

  /* ---------- Export ---------- */

  // Both exports carry exactly what is on screen — the chosen schema, the
  // salesman filter and every standing — stamped with when it was downloaded
  const exportContext = () => {
    const schema = result.schema;
    const salesmanName = salesmen.find((s) => s._id === selectedSalesman)?.name;
    const now = new Date();
    return {
      schema,
      period: `${formatDate(schema.fromDate)} to ${formatDate(schema.toDate)}`,
      salesmanLabel: salesmanName || 'All salesmen',
      downloadedAt: formatDateTime(now),
      fileBase: `leaderboard_${slug(schema.name)}${salesmanName ? `_${slug(salesmanName)}` : ''}_${fileStamp(now)}`,
      rows: leaderboard.map((row) => [
        row.rank,
        row.name,
        row.phone || '',
        row.salesmen?.length ? row.salesmen.map((s) => s.name).join(', ') : '-',
        row.points,
        row.tier || '-'
      ])
    };
  };

  const EXPORT_HEAD = ['Rank', 'Customer', 'Phone', 'Salesman', 'Points', 'Tier / Gift'];

  const handleExportExcel = () => {
    const ctx = exportContext();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Leaderboard'],
      ['Schema', ctx.schema.name],
      ['Period', ctx.period],
      ...(ctx.schema.runBy ? [['Run by', ctx.schema.runBy]] : []),
      ['Salesman', ctx.salesmanLabel],
      ['Downloaded on', ctx.downloadedAt],
      [],
      EXPORT_HEAD,
      ...ctx.rows
    ]);
    sheet['!cols'] = [{ wch: 14 }, { wch: 42 }, { wch: 14 }, { wch: 24 }, { wch: 8 }, { wch: 24 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Leaderboard');
    XLSX.writeFile(workbook, `${ctx.fileBase}.xlsx`);
  };

  const handleExportPdf = () => {
    const ctx = exportContext();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Leaderboard', margin, 48);
    doc.setFontSize(11);
    doc.text(ctx.schema.name, margin, 68);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`Period: ${ctx.period}${ctx.schema.runBy ? `  ·  Run by ${ctx.schema.runBy}` : ''}`, margin, 84);
    doc.text(`Salesman: ${ctx.salesmanLabel}  ·  ${ctx.rows.length} customer${ctx.rows.length === 1 ? '' : 's'} with points`, margin, 97);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30);
    doc.text(`Downloaded on: ${ctx.downloadedAt}`, pageWidth - margin, 48, { align: 'right' });

    autoTable(doc, {
      head: [EXPORT_HEAD],
      body: ctx.rows,
      startY: 110,
      margin: { left: margin, right: margin, bottom: 40 },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 40 },
        4: { halign: 'right', fontStyle: 'bold' }
      },
      // Every page repeats the download stamp so a loose page still says when it was taken
      didDrawPage: () => {
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Downloaded on ${ctx.downloadedAt}`, margin, pageHeight - 20);
        doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 20, { align: 'right' });
      }
    });

    doc.save(`${ctx.fileBase}.pdf`);
  };

  const canExport = !loading && Boolean(result?.schema) && leaderboard.length > 0;

  return (
    <div className="srf-page">
      <PageHeader title="Leaderboard" subtitle="Customer standings for a schema period">
        <button onClick={handleExportExcel} disabled={!canExport} className="srf-btn srf-btn-secondary">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          Export Excel
        </button>
        <button onClick={handleExportPdf} disabled={!canExport} className="srf-btn srf-btn-secondary">
          <FileText className="h-4 w-4 text-rose-500" />
          Export PDF
        </button>
      </PageHeader>

      {/* Schema + salesman filters */}
      <FilterPanel active={[selectedSalesman]}>
        <div className="srf-toolbar">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="w-full sm:max-w-sm">
              <select value={selectedId} onChange={(e) => handleSelect(e.target.value)} className="w-full">
                <option value="">Select a schema…</option>
                {schemas.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:max-w-xs">
              <select
                value={selectedSalesman}
                onChange={(e) => handleSalesmanSelect(e.target.value)}
                className="w-full"
                disabled={!selectedId}
              >
                <option value="">All salesmen</option>
                {salesmen.map((s) => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </FilterPanel>

      {result?.schema && (
        <div className="srf-card mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">{result.schema.name}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {formatDate(result.schema.fromDate)} – {formatDate(result.schema.toDate)}
              {result.schema.runBy ? ` · Run by ${result.schema.runBy}` : ''}
            </p>
          </div>
          <p className="text-xs text-slate-400">
            {leaderboard.length} customer{leaderboard.length === 1 ? '' : 's'} with points
          </p>
        </div>
      )}

      {/* Leaderboard */}
      <div className="srf-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-slate-600" />
          </div>
        ) : !selectedId ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Trophy className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">Select a schema</p>
            <p className="mt-1 text-xs text-slate-400">Choose a schema to view its leaderboard.</p>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Award className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-700">No customers yet</p>
            <p className="mt-1 text-xs text-slate-400">
              {selectedSalesman
                ? "None of this salesman's customers have earned points in this period."
                : 'No qualifying sales in this period.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="srf-table">
                <thead>
                  <tr>
                    <th className="w-16">Rank</th>
                    <th>Customer</th>
                    <th>Salesman</th>
                    <th className="text-right">Points</th>
                    <th>Tier / Gift</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((row) => {
                    const atTop = topTierPoints !== null && row.points >= topTierPoints;
                    return (
                      <tr key={row.customerId} className={atTop ? 'bg-amber-50/60' : ''}>
                        <td>
                          <span className="flex h-6 w-6 items-center justify-center">{rankBadge(row.rank)}</span>
                        </td>
                        <td className="font-semibold text-slate-900">
                          {row.name}
                          {row.phone && (
                            <span className="ml-1.5 text-xs font-normal text-slate-400">{row.phone}</span>
                          )}
                        </td>
                        <td className="text-slate-600">
                          {row.salesmen?.length ? row.salesmen.map((s) => s.name).join(', ') : '—'}
                        </td>
                        <td className="text-right font-semibold text-slate-900">{row.points}</td>
                        <td>
                          {row.tier ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600"
                              style={row.tierColor ? { backgroundColor: `${row.tierColor}1a`, color: row.tierColor } : undefined}
                            >
                              <Award className="h-3 w-3" />
                              {row.tier}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="divide-y divide-slate-100 md:hidden">
              {leaderboard.map((row) => {
                const atTop = topTierPoints !== null && row.points >= topTierPoints;
                return (
                  <div key={row.customerId} className={`flex items-center gap-3 p-3.5 ${atTop ? 'bg-amber-50/60' : ''}`}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">{rankBadge(row.rank)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{row.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        <span style={row.tierColor ? { color: row.tierColor } : undefined}>{row.tier || 'No tier yet'}</span>
                        {row.salesmen?.length > 0 && (
                          <span className="text-slate-300"> · {row.salesmen.map((s) => s.name).join(', ')}</span>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-900">{row.points} pts</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SchemaLeaderboard;
