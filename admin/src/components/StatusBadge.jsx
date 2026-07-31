import React from 'react';
import { STATUS_COLORS } from '../utils/orderStatus';

const BADGE_STYLES = {
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  'to roll': 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200',
  rolled: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200',
  billed: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200',
  delivered: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  cancellation_requested: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200'
};

const LABELS = {
  cancellation_requested: 'cancel requested'
};

const StatusBadge = ({ status }) => (
  <span className={`srf-badge ${BADGE_STYLES[status] || BADGE_STYLES.cancelled}`}>
    <span
      className="h-1.5 w-1.5 rounded-full"
      style={{ backgroundColor: STATUS_COLORS[status] || STATUS_COLORS.cancelled }}
    />
    {LABELS[status] || status}
  </span>
);

export default StatusBadge;
