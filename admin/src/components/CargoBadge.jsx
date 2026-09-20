import React from 'react';
import { Truck } from 'lucide-react';

// Which transport carries the order. Rendered muted when none is set so the
// gap is visible at a glance rather than silently blank.
const CargoBadge = ({ cargo, className = '' }) => {
  const name = cargo?.name;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        name
          ? 'bg-teal-50 text-teal-700 ring-teal-200'
          : 'bg-slate-100 text-slate-400 ring-slate-200/70'
      } ${className}`}
      title={name ? `Cargo: ${name}` : 'No cargo assigned'}
    >
      <Truck className="h-3 w-3 shrink-0" />
      <span className="truncate">{name || 'No cargo'}</span>
    </span>
  );
};

export default CargoBadge;
