import api from './api';

// Sell-order statuses a return can come back from — the goods have left the
// shelf (mirrors RETURNABLE_STATUSES on the server)
export const RETURNABLE_STATUSES = ['rolled', 'billed', 'delivered'];

export const canReturn = (order) =>
  order?.type === 'sell order' && RETURNABLE_STATUSES.includes(order.status);

// What can still come back from one sell order, shaped for the return form:
// { order, lines } with sold / returned / pending / remaining per item and how
// many pieces are coming back now — restock (saleable) and damaged, 0 to
// start. Throws on a request error.
export const loadReturnDraft = async (orderId) => {
  const res = await api.get(`/orders/${orderId}/returnable`);
  const { order, items } = res.data.data;
  return {
    order,
    lines: items.map((l) => ({
      itemId: l.item?._id || l.item,
      name: l.item?.name || 'Deleted item',
      price: l.item?.price || 0,
      category: l.item?.category || '',
      ordered: l.ordered,
      returned: l.returned,
      pending: l.pending || 0,
      remaining: l.remaining,
      restock: 0,
      damaged: 0
    }))
  };
};

// Pieces a return-form line is bringing back
export const lineQty = (l) => l.restock + l.damaged;
