import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';

// A chart card with a maximise / minimise switch. Maximised, the card fills
// the whole screen, so the chart gets the room to be read and hovered
// closely; Esc or the switch brings it back.
//   children: a node, or (expanded) => node — so the chart can take the full
//             height when maximised (see MonthlyLinesChart's height="100%")
//   actions:  controls shown beside the title (always)
//   expandedActions: controls shown only when maximised — the page's own
//             filter row is hidden behind the full-screen view
const ChartFrame = ({ title, subtitle, actions = null, expandedActions = null, className = '', children }) => {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  const body = typeof children === 'function' ? children(expanded) : children;

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className={`font-display font-bold text-slate-900 ${expanded ? 'text-base' : 'text-sm'}`}>{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {expanded && expandedActions}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="srf-icon-btn ring-1 ring-slate-200"
          title={expanded ? 'Minimise (Esc)' : 'Maximise'}
          aria-label={expanded ? 'Minimise chart' : 'Maximise chart'}
          aria-pressed={expanded}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  if (expanded) {
    return (
      <>
        {/* Keeps the page from jumping while the chart is out */}
        <div className={`srf-card p-4 sm:p-5 ${className}`}>
          <p className="py-10 text-center text-[12px] text-slate-400">{title} is open full screen</p>
        </div>
        {createPortal(
          <div
            className="fixed inset-0 z-[80] flex flex-col bg-white p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            {header}
            <div className="mt-3 flex min-h-0 flex-1 flex-col">{body}</div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <div className={`srf-card p-4 sm:p-5 ${className}`}>
      {header}
      <div className="mt-3">{body}</div>
    </div>
  );
};

export default ChartFrame;
