// Who placed an order, for display: the office, a salesman, or the customer
// themselves from the app — marked so it is never taken for a salesman
export const orderCreatorName = (order, fallback = '-') => {
  if (order.createdByType === 'admin') return 'Admin';
  const name = order.createdBy?.name || fallback;
  return order.createdByType === 'customer' ? `${name} (Customer)` : name;
};
