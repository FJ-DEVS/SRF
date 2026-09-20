// Totals and formatting shared by every order list, card and detail view.

export const orderTotal = (order) =>
  (order?.items || []).reduce((total, oi) => total + (oi.item?.price || 0) * (oi.quantity || 0), 0);

export const orderQty = (order) =>
  (order?.items || []).reduce((total, oi) => total + (oi.quantity || 0), 0);

export const formatMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

export const formatDate = (value) =>
  new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const formatDateTime = (value) =>
  new Date(value).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

// "3054 GMR - 0.8mm × 2, +1 more" — what an order holds, in one line
export const itemsSummary = (order) => {
  const items = order?.items || [];
  if (items.length === 0) return 'No items';
  const first = `${items[0].item?.name || 'Deleted item'} × ${items[0].quantity}`;
  return items.length > 1 ? `${first}, +${items.length - 1} more` : first;
};
