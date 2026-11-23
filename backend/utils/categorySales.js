const Order = require('../models/Order');

// Monthly pieces sold, for the dashboard's category sales chart, the
// per-category salesman breakdown behind it and a customer's own chart.
//
// Only billed sales count: sell orders now "billed" or "delivered", in the
// month they were billed (orders billed before the bill date was kept fall
// back to the month they were placed). A completed return takes its pieces
// off in the month it was recorded — so a return shows on the chart when it
// comes in — provided the order it came back from is itself counted. An item
// counts under the category it is in today.

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RANGE_CHOICES = [3, 6, 12, 24];
const DEFAULT_RANGE = 12;
const BILLED_STATUSES = ['billed', 'delivered'];

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// The last `count` calendar months, this one included, oldest first
const monthWindow = (rawCount) => {
  const count = RANGE_CHOICES.includes(Number(rawCount)) ? Number(rawCount) : DEFAULT_RANGE;
  const now = new Date();
  const months = Array.from({ length: count }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    const label = start.getMonth() === 0 || i === 0
      ? `${MONTH_SHORT[start.getMonth()]} ${start.getFullYear()}`
      : MONTH_SHORT[start.getMonth()];
    return { key: monthKey(start), label, start };
  });
  const last = months[months.length - 1].start;
  return {
    months,
    start: months[0].start,
    end: new Date(last.getFullYear(), last.getMonth() + 1, 1)
  };
};

const customerOf = (order) =>
  order.customerModel === 'Customer' && order.customerName && typeof order.customerName === 'object'
    ? order.customerName
    : null;

// Every billed line and every returned line in the window:
//   [{ month, category, customer, qty, returned }]
// A returned line carries a negative qty and returned: true.
//   itemIds     — only orders holding any of these items are read (the lines
//                 of other items still come back, so filter by category)
//   customerId  — only this customer's orders
//   customerFields — populate the customer with these fields; otherwise
//                 `customer` is null
const soldLines = async ({ start, end, itemIds = null, customerId = null, customerFields = null }) => {
  const scope = {};
  if (itemIds) scope['items.item'] = { $in: itemIds };
  if (customerId) scope.customerName = customerId;

  const sellQuery = Order.find({
    ...scope,
    type: 'sell order',
    status: { $in: BILLED_STATUSES },
    $or: [
      { billedAt: { $gte: start, $lt: end } },
      { billedAt: null, createdAt: { $gte: start, $lt: end } }
    ]
  })
    .select('createdAt billedAt items customerName customerModel')
    .populate('items.item', 'category');
  const returnQuery = Order.find({
    ...scope,
    type: 'return order',
    status: 'completed',
    createdAt: { $gte: start, $lt: end }
  })
    .select('createdAt items customerName customerModel returnOf')
    .populate('items.item', 'category')
    .populate('returnOf', 'type status');
  if (customerFields) {
    sellQuery.populate('customerName', customerFields);
    returnQuery.populate('customerName', customerFields);
  }
  const [sells, returns] = await Promise.all([sellQuery.lean(), returnQuery.lean()]);

  const lines = [];
  for (const order of sells) {
    const month = monthKey(order.billedAt || order.createdAt);
    const customer = customerOf(order);
    for (const line of order.items) {
      const qty = line.quantity || 0;
      if (qty <= 0) continue;
      lines.push({ month, category: line.item?.category || '', customer, qty, returned: false });
    }
  }
  for (const ret of returns) {
    // Only returns of a sale that is counted
    if (ret.returnOf?.type !== 'sell order' || !BILLED_STATUSES.includes(ret.returnOf.status)) continue;
    const month = monthKey(ret.createdAt);
    const customer = customerOf(ret);
    for (const line of ret.items) {
      const qty = line.quantity || 0;
      if (qty <= 0) continue;
      lines.push({ month, category: line.item?.category || '', customer, qty: -qty, returned: true });
    }
  }
  return lines;
};

// Rows of { ...extra, total, returned, monthly: [net pieces per month] }:
// total and monthly are net of returns, returned counts the pieces that
// came back
const seriesFrom = (months) => {
  const index = new Map(months.map((m, i) => [m.key, i]));
  return {
    blank: (extra) => ({ ...extra, total: 0, returned: 0, monthly: months.map(() => 0) }),
    add: (row, line) => {
      const i = index.get(line.month);
      if (i === undefined) return;
      row.monthly[i] += line.qty;
      row.total += line.qty;
      if (line.returned) row.returned -= line.qty;
    }
  };
};

module.exports = { RANGE_CHOICES, DEFAULT_RANGE, monthWindow, soldLines, seriesFrom };
