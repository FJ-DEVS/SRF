import React from 'react';
import { Receipt } from 'lucide-react';

// The bill number an order was billed under. Renders nothing until there is one.
const BillBadge = ({ number, className = '' }) => {
  if (!number) return null;
  return (
    <span className={`srf-badge bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200 ${className}`}>
      <Receipt className="h-3 w-3" /> Bill #{number}
    </span>
  );
};

export default BillBadge;
