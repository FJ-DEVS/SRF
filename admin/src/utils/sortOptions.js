// Sort options for the admin listing pages.
// The values must stay in step with backend/utils/listSort.js.

export const NAME_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' }
];

export const ITEM_SORT_OPTIONS = [
  ...NAME_SORT_OPTIONS,
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'qty_asc', label: 'Stock: low to high' },
  { value: 'qty_desc', label: 'Stock: high to low' }
];

export const DEFAULT_SORT = 'newest';

// Placed raks on the roller screen. Sorted in the browser rather than through
// listSort.js, because that table is built from raks the page already holds in
// full — a placement is a row inside a rak, not a row the API can sort.
export const PLACEMENT_SORT_OPTIONS = [
  { value: 'rak_asc', label: 'Rak A–Z' },
  { value: 'rak_desc', label: 'Rak Z–A' },
  { value: 'item_asc', label: 'Item A–Z' },
  { value: 'item_desc', label: 'Item Z–A' },
  { value: 'qty_desc', label: 'Qty: high to low' },
  { value: 'qty_asc', label: 'Qty: low to high' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' }
];

export const DEFAULT_PLACEMENT_SORT = 'rak_asc';
