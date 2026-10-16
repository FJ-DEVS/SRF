// Reorder levels, the Tally way. Every item may carry two rules — one for its
// reorder level, one for its minimum order quantity. A rule is a fixed
// quantity, the consumption over a trailing period ("the last 2 months"), or,
// when both are given, the higher or lower of the two.
//
//   nett available  = closing stock + pending purchase orders
//                     (stock is already net of committed sell orders)
//   shortfall       = reorder level − nett available, when positive
//   order to place  = max(shortfall, minimum order quantity), when short
//
// Consumption in a window = pieces sold on live sell orders less pieces that
// came back on completed returns, both by order date.
const Order = require('../models/Order');
const { effectiveCheckLevel } = require('./checkLevel');

const PERIOD_UNITS = ['days', 'weeks', 'months', 'years'];
const CRITERIA = ['higher', 'lower'];

// Sell orders that no longer count as sales
const DEAD_SALE_STATUSES = ['cancelled', 'cancellation_requested'];

// Blank → null; otherwise a whole number no smaller than `min`, or undefined
// when it is not one
const parseWhole = (value, min) => {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isInteger(num) && num >= min ? num : undefined;
};

// One rule from a request body. Returns { rule } — null when the rule is
// blank on both sides — or { error }.
const parseRule = (raw, label) => {
  if (!raw || typeof raw !== 'object') return { rule: null };

  const quantity = parseWhole(raw.quantity, 0);
  if (quantity === undefined) return { error: `${label}: quantity must be a whole number of 0 or more` };

  const periodValue = parseWhole(raw.periodValue, 1);
  if (periodValue === undefined) return { error: `${label}: period must be a whole number of 1 or more` };

  if (quantity === null && periodValue === null) return { rule: null };

  const periodUnit = raw.periodUnit || 'months';
  if (!PERIOD_UNITS.includes(periodUnit)) return { error: `${label}: period unit must be one of ${PERIOD_UNITS.join(', ')}` };

  const criteria = raw.criteria || 'higher';
  if (!CRITERIA.includes(criteria)) return { error: `${label}: criteria must be "higher" or "lower"` };

  return { rule: { quantity, periodValue, periodUnit, criteria } };
};

// The whole reorder setup from a request body: { config } (null when nothing
// is set, meaning "clear it") or { error }
const parseReorderConfig = (body = {}) => {
  const level = parseRule(body.level, 'Reorder level');
  if (level.error) return { error: level.error };
  const minOrder = parseRule(body.minOrder, 'Minimum order quantity');
  if (minOrder.error) return { error: minOrder.error };
  if (!level.rule && !minOrder.rule) return { config: null };
  return { config: { level: level.rule, minOrder: minOrder.rule } };
};

// Where a trailing window of `value` units ending at `now` begins
const windowStart = (now, value, unit) => {
  const d = new Date(now);
  if (unit === 'days') d.setDate(d.getDate() - value);
  else if (unit === 'weeks') d.setDate(d.getDate() - 7 * value);
  else if (unit === 'months') d.setMonth(d.getMonth() - value);
  else if (unit === 'years') d.setFullYear(d.getFullYear() - value);
  return d;
};

// The previous calendar month, as [start, end)
const previousMonthRange = (now) => ({
  start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
  end: new Date(now.getFullYear(), now.getMonth(), 1)
});

// Rules with the same period share one consumption lookup
const windowKey = (rule) => (rule && rule.periodValue ? `${rule.periodValue}-${rule.periodUnit}` : null);

// { itemId -> pieces consumed } for orders dated in [since, until)
const consumptionByItem = async (since, until, itemIds) => {
  const rows = await Order.aggregate([
    {
      $match: {
        createdAt: { $gte: since, $lt: until },
        $or: [
          { type: 'sell order', status: { $nin: DEAD_SALE_STATUSES } },
          { type: 'return order', status: 'completed' }
        ]
      }
    },
    { $unwind: '$items' },
    { $match: { 'items.item': { $in: itemIds } } },
    {
      $group: {
        _id: '$items.item',
        qty: {
          $sum: {
            $cond: [
              { $eq: ['$type', 'sell order'] },
              '$items.quantity',
              { $multiply: [-1, '$items.quantity'] }
            ]
          }
        }
      }
    }
  ]);
  return new Map(rows.map((r) => [String(r._id), Math.max(0, r.qty)]));
};

// { itemId -> pieces on purchase orders not yet received }
const pendingPurchaseByItem = async (itemIds) => {
  const rows = await Order.aggregate([
    { $match: { type: 'purchase order', status: 'pending' } },
    { $unwind: '$items' },
    { $match: { 'items.item': { $in: itemIds } } },
    { $group: { _id: '$items.item', qty: { $sum: '$items.quantity' } } }
  ]);
  return new Map(rows.map((r) => [String(r._id), r.qty]));
};

// Everything computeReorderRow needs for a set of items: consumption over
// every distinct window their rules use, last month's sales, pending
// purchases and the category check levels the fallback reads.
const buildReorderContext = async (items, levelsByCategory, now = new Date()) => {
  const itemIds = items.map((i) => i._id);

  const windows = new Map();
  for (const item of items) {
    for (const rule of [item.reorder?.level, item.reorder?.minOrder]) {
      const key = windowKey(rule);
      if (!key) continue;
      if (!windows.has(key)) {
        windows.set(key, { since: windowStart(now, rule.periodValue, rule.periodUnit), itemIds: [] });
      }
      windows.get(key).itemIds.push(item._id);
    }
  }

  const prevMonth = previousMonthRange(now);
  const byWindow = new Map();
  const [prevMonthSales, pendingPurchase] = await Promise.all([
    itemIds.length ? consumptionByItem(prevMonth.start, prevMonth.end, itemIds) : new Map(),
    itemIds.length ? pendingPurchaseByItem(itemIds) : new Map(),
    ...[...windows].map(async ([key, w]) => {
      byWindow.set(key, await consumptionByItem(w.since, now, w.itemIds));
    })
  ]);

  return { now, byWindow, prevMonthSales, prevMonth, pendingPurchase, levelsByCategory };
};

// What one rule works out to for an item, given the consumption in its window
const resolveRule = (rule, consumption) => {
  if (!rule) return { value: null, fixed: null, consumption: null };
  const fixed = rule.quantity ?? null;
  const consumed = rule.periodValue ? consumption || 0 : null;
  let value;
  if (fixed !== null && consumed !== null) {
    value = rule.criteria === 'lower' ? Math.min(fixed, consumed) : Math.max(fixed, consumed);
  } else {
    value = fixed ?? consumed;
  }
  return { value, fixed, consumption: consumed };
};

// The reorder status of one item — the columns of Tally's "Stock Group
// Reorder Status" report
const computeReorderRow = (item, ctx) => {
  const id = String(item._id);
  const config = item.reorder || null;
  const consumptionFor = (rule) => {
    const key = windowKey(rule);
    return key ? ctx.byWindow.get(key)?.get(id) ?? 0 : null;
  };

  const level = resolveRule(config?.level, consumptionFor(config?.level));
  let reorderLevel = level.value;
  // 'rule' when the item's own reorder rule set it, 'checkLevel' when it fell
  // back to the check level, null when the item is not tracked at all
  let levelSource = reorderLevel === null ? null : 'rule';
  if (reorderLevel === null) {
    const fallback = effectiveCheckLevel(item, ctx.levelsByCategory);
    if (fallback !== null) {
      reorderLevel = fallback;
      levelSource = 'checkLevel';
    }
  }

  const minOrder = resolveRule(config?.minOrder, consumptionFor(config?.minOrder));
  const minOrderQty = minOrder.value ?? 0;

  const closingStock = item.quantity || 0;
  const purchasePending = ctx.pendingPurchase.get(id) || 0;
  const nettAvailable = closingStock + purchasePending;
  const shortfall = reorderLevel === null ? 0 : Math.max(0, reorderLevel - nettAvailable);
  const orderQty = shortfall > 0 ? Math.max(shortfall, minOrderQty) : 0;

  return {
    _id: item._id,
    name: item.name,
    category: item.category || '',
    price: item.price || 0,
    quantity: item.quantity || 0,
    checkLevel: item.checkLevel ?? null,
    reorder: config,
    closingStock,
    purchasePending,
    nettAvailable,
    prevMonthSales: ctx.prevMonthSales.get(id) || 0,
    levelConsumption: level.consumption,
    reorderLevel,
    levelSource,
    minOrderConsumption: minOrder.consumption,
    minOrderQty,
    shortfall,
    orderQty,
    orderValue: orderQty * (item.price || 0)
  };
};

module.exports = {
  PERIOD_UNITS,
  CRITERIA,
  parseReorderConfig,
  buildReorderContext,
  computeReorderRow
};
