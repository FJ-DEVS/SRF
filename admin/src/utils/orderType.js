// Sell, purchase and return orders sit in the same lists — colour tells them
// apart at a glance: money coming in (indigo), stock coming in (emerald),
// goods coming back (rose)
export const TYPE_STYLES = {
  'sell order': {
    label: 'Sell Order',
    row: 'bg-indigo-50/40 hover:!bg-indigo-50/70',
    badge: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200',
    dot: 'bg-indigo-500'
  },
  'purchase order': {
    label: 'Purchase Order',
    row: 'bg-emerald-50/40 hover:!bg-emerald-50/70',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
    dot: 'bg-emerald-500'
  },
  'return order': {
    label: 'Return Order',
    row: 'bg-rose-50/40 hover:!bg-rose-50/70',
    badge: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
    dot: 'bg-rose-500'
  }
};

export const typeStyle = (type) => TYPE_STYLES[type] || TYPE_STYLES['sell order'];
