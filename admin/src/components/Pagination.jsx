import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

const PAGE_SIZES = [10, 25, 50, 100];

const Pagination = ({ currentPage, totalPages, totalItems, itemsPerPage, onPageChange, onPageSizeChange }) => {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);

      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) endPage = 4;
      if (currentPage >= totalPages - 2) startPage = totalPages - 3;

      if (startPage > 2) pages.push('...');
      for (let i = startPage; i <= endPage; i++) pages.push(i);
      if (endPage < totalPages - 1) pages.push('...');

      pages.push(totalPages);
    }

    return pages;
  };

  if (totalItems === 0) return null;

  const navBtn =
    'inline-flex items-center justify-center h-8 w-8 rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Range + page size */}
      <div className="flex items-center justify-between gap-3 sm:justify-start">
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-800">{startItem}</span>–
          <span className="font-semibold text-slate-800">{endItem}</span> of{' '}
          <span className="font-semibold text-slate-800">{totalItems}</span>
        </p>
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={itemsPerPage}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="!rounded-lg !px-2 !py-1 !text-xs !font-medium"
              style={{ fontSize: '12px' }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Page controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          <button onClick={() => onPageChange(1)} disabled={currentPage === 1} className={`${navBtn} hidden sm:inline-flex`} title="First page">
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className={navBtn} title="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1">
            {getPageNumbers().map((page, index) =>
              page === '...' ? (
                <span key={`ellipsis-${index}`} className="px-1.5 text-xs text-slate-400">…</span>
              ) : (
                <button
                  key={page}
                  onClick={() => onPageChange(page)}
                  className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition-colors ${
                    currentPage === page
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {page}
                </button>
              )
            )}
          </div>

          <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className={navBtn} title="Next page">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} className={`${navBtn} hidden sm:inline-flex`} title="Last page">
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default Pagination;
