import React from 'react';
import { NAME_SORT_OPTIONS } from '../utils/sortOptions';

// Sort dropdown used across the listing pages
const SortSelect = ({ value, onChange, options = NAME_SORT_OPTIONS, className = '' }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    aria-label="Sort by"
    title="Sort by"
    className={className}
  >
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
);

export default SortSelect;
