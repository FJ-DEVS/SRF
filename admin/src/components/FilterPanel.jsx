import React, { useState } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';

// Wraps a page's filter toolbar. Below lg the filters stay folded behind a
// "Filters" button until it is tapped, so the list is what a phone shows
// first; from lg up they are always open. `active` lists the filter values
// that narrow the list — the truthy ones are counted on the button so a
// folded panel still shows that the list is filtered.
const FilterPanel = ({ active = [], children }) => {
  const [open, setOpen] = useState(false);
  const count = active.filter(Boolean).length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="srf-btn srf-btn-secondary w-full justify-between lg:hidden"
      >
        <span className="inline-flex items-center gap-1.5">
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {count > 0 && (
            <span className="rounded-full bg-slate-900 px-1.5 text-[11px] font-semibold leading-[18px] text-white">{count}</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`${open ? 'mt-2.5' : 'hidden'} lg:mt-0 lg:block`}>{children}</div>
    </div>
  );
};

export default FilterPanel;
