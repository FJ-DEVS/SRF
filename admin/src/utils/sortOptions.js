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
