// One source of truth for order-status colors across the app.
// Chart hexes are CVD-validated; badge tints stay in the same hue family.
export const STATUS_COLORS = {
  pending: '#d97706',
  'to roll': '#0284c7',
  rolled: '#7c3aed',
  billed: '#ea580c',
  delivered: '#059669',
  completed: '#059669',
  cancellation_requested: '#e11d48',
  cancelled: '#64748b'
};
