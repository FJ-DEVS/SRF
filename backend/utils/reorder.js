// Reorder levels, the Tally way. Every item may carry two rules — one for its
// reorder level, one for its minimum order quantity. A rule is a fixed
// quantity, the consumption over a period, or, when both are given, the
// higher or lower of the two.
//
//   nett available  = closing stock + pending purchase orders
//                     (stock is already net of committed sell orders)
//   shortfall       = reorder level − nett available, when positive
//   order to place  = max(shortfall, minimum order quantity), when short
//
// A period is "the last N units" read one of two ways, or a fixed pair of
// dates:
//   rolling   from the same day N units back, up to and including today
//   calendar  the N whole units (months, weeks, …) before the current one
//   custom    every day from periodFrom to periodTo inclusive
//
// Consumption in a period = pieces sold on live sell orders less pieces that
// came back on completed returns, both by order date.
// Keep the period arithmetic in step with admin/src/utils/reorderRules.js,
// which draws the same days on the calendar.
const Order = require('../models/Order');
const { effectiveCheckLevel } = require('./checkLevel');

const PERIOD_UNITS = ['days', 'weeks', 'months', 'years'];
const PERIOD_MODES = ['rolling', 'calendar', 'custom'];
const CRITERIA = ['higher', 'lower'];

// Sell orders that no longer count as sales
const DEAD_SALE_STATUSES = ['cancelled', 'cancellation_requested'];

/* ---------- Dates ---------- */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// "2026-08-19" → local midnight of that day, or undefined when it is not a day
const parseDay = (value) => {
  if (typeof value !== 'string' || !DAY_RE.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : undefined;
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

// The same day `value` units before `day` — a 31st lands on the last day of
// a shorter month rather than spilling into the next one
const sameDayBack = (day, value, unit) => {
  const d = new Date(day);
  if (unit === 'days') d.setDate(d.getDate() - value);
  else if (unit === 'weeks') d.setDate(d.getDate() - 7 * value);
  else {
    const dom = d.getDate();
    d.setDate(1);
    if (unit === 'months') d.setMonth(d.getMonth() - value);
    else d.setFullYear(d.getFullYear() - value);
    d.setDate(Math.min(dom, daysInMonth(d.getFullYear(), d.getMonth())));
  }
  return d;
};

// Whether a rule has a consumption side at all
const hasPeriod = (rule) =>
  Boolean(rule) && (rule.periodMode === 'custom' ? Boolean(rule.periodFrom && rule.periodTo) : Boolean(rule.periodValue));

// The days a rule's period covers, as [since, until) — null when it has none
const periodWindow = (now, rule) => {
  if (!hasPeriod(rule)) return null;

  if (rule.periodMode === 'custom') {
    return { since: parseDay(rule.periodFrom), until: addDays(parseDay(rule.periodTo), 1) };
  }

  const today = startOfDay(now);
  const { periodValue: n, periodUnit: unit } = rule;

  if (rule.periodMode === 'calendar') {
    if (unit === 'months') {
      const until = new Date(today.getFullYear(), today.getMonth(), 1);
      return { since: new Date(until.getFullYear(), until.getMonth() - n, 1), until };
    }
    if (unit === 'years') {
      const until = new Date(today.getFullYear(), 0, 1);
      return { since: new Date(until.getFullYear() - n, 0, 1), until };
    }
    if (unit === 'weeks') {
      // Weeks run Monday to Sunday
      const until = addDays(today, -((today.getDay() + 6) % 7));
      return { since: addDays(until, -7 * n), until };
    }
    return { since: addDays(today, -n), until: today };
  }

  // rolling: the same day N units back, through the end of today
  return { since: sameDayBack(today, n, unit), until: addDays(today, 1) };
};

/* ---------- Parsing ---------- */

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

  const periodUnit = raw.periodUnit || 'months';
  if (!PERIOD_UNITS.includes(periodUnit)) return { error: `${label}: period unit must be one of ${PERIOD_UNITS.join(', ')}` };

  let periodMode = raw.periodMode || 'rolling';
  if (!PERIOD_MODES.includes(periodMode)) return { error: `${label}: period mode must be one of ${PERIOD_MODES.join(', ')}` };

  let periodFrom = null;
  let periodTo = null;
  if (periodMode === 'custom') {
    if (!parseDay(raw.periodFrom) || !parseDay(raw.periodTo)) {
      return { error: `${label}: pick both the first and the last day of the custom period` };
    }
    if (raw.periodFrom > raw.periodTo) return { error: `${label}: the custom period ends before it starts` };
    periodFrom = raw.periodFrom;
    periodTo = raw.periodTo;
  } else if (periodValue === null) {
    // No period at all — the mode is meaningless, keep the default
    periodMode = 'rolling';
  }

  if (quantity === null && periodMode !== 'custom' && periodValue === null) return { rule: null };

  const criteria = raw.criteria || 'higher';
  if (!CRITERIA.includes(criteria)) return { error: `${label}: criteria must be "higher" or "lower"` };

  return { rule: { quantity, periodValue, periodUnit, periodMode, periodFrom, periodTo, criteria } };
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

/* ---------- Consumption ---------- */

// The previous calendar month, as [start, end)
const previousMonthRange = (now) => ({
  start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
  end: new Date(now.getFullYear(), now.getMonth(), 1)
});

// Rules covering the same days share one consumption lookup
const windowKey = (rule) => {
  if (!hasPeriod(rule)) return null;
  if (rule.periodMode === 'custom') return `custom:${rule.periodFrom}:${rule.periodTo}`;
  return `${rule.periodMode || 'rolling'}:${rule.periodValue}:${rule.periodUnit}`;
};

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
// every distinct period their rules use, last month's sales, pending
// purchases and the category check levels the fallback reads.
const buildReorderContext = async (items, levelsByCategory, now = new Date()) => {
  const itemIds = items.map((i) => i._id);

  // key -> { since, until, itemIds, consumption }
  const windows = new Map();
  for (const item of items) {
    for (const rule of [item.reorder?.level, item.reorder?.minOrder]) {
      const key = windowKey(rule);
      if (!key) continue;
      if (!windows.has(key)) windows.set(key, { ...periodWindow(now, rule), itemIds: [], consumption: new Map() });
      windows.get(key).itemIds.push(item._id);
    }
  }

  const prevMonth = previousMonthRange(now);
  const [prevMonthSales, pendingPurchase] = await Promise.all([
    itemIds.length ? consumptionByItem(prevMonth.start, prevMonth.end, itemIds) : new Map(),
    itemIds.length ? pendingPurchaseByItem(itemIds) : new Map(),
    ...[...windows.values()].map(async (w) => {
      w.consumption = await consumptionByItem(w.since, w.until, w.itemIds);
    })
  ]);

  return { now, windows, prevMonthSales, prevMonth, pendingPurchase, levelsByCategory };
};

/* ---------- Rows ---------- */

// What one rule works out to for an item: the value, and the days and
// consumption behind it
const resolveRule = (rule, ctx, id) => {
  if (!rule) return { value: null, fixed: null, consumption: null, window: null };
  const fixed = rule.quantity ?? null;
  const w = ctx.windows.get(windowKey(rule));
  const consumed = w ? w.consumption.get(id) ?? 0 : null;
  // Inclusive last day, for display
  const window = w ? { from: w.since, to: new Date(w.until.getTime() - 1) } : null;
  let value;
  if (fixed !== null && consumed !== null) {
    value = rule.criteria === 'lower' ? Math.min(fixed, consumed) : Math.max(fixed, consumed);
  } else {
    value = fixed ?? consumed;
  }
  return { value, fixed, consumption: consumed, window };
};

// The reorder status of one item — the columns of Tally's "Stock Group
// Reorder Status" report
const computeReorderRow = (item, ctx) => {
  const id = String(item._id);
  const config = item.reorder || null;

  const level = resolveRule(config?.level, ctx, id);
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

  const minOrder = resolveRule(config?.minOrder, ctx, id);
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
    levelWindow: level.window,
    reorderLevel,
    levelSource,
    minOrderConsumption: minOrder.consumption,
    minOrderWindow: minOrder.window,
    minOrderQty,
    shortfall,
    orderQty,
    orderValue: orderQty * (item.price || 0)
  };
};

module.exports = {
  PERIOD_UNITS,
  PERIOD_MODES,
  CRITERIA,
  parseReorderConfig,
  periodWindow,
  buildReorderContext,
  computeReorderRow
};
