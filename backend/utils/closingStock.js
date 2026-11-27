const Item = require('../models/Item');
const Order = require('../models/Order');
const Category = require('../models/Category');
const ClosingStock = require('../models/ClosingStock');
const { buildReorderContext, computeReorderRow } = require('./reorder');

// Closing stock: what each category had on hand when a month ended.
//
// Stock can be set straight on an item (an edit, an Excel import) with no
// record of the change, so past stock can't be worked back from orders.
// Instead the server writes down each category's stock on hand against the
// current month every half hour; the last figure taken before a month ends
// is that month's closing stock. Months are counted in Indian time, so
// October closes at midnight IST on 31 October whatever the server's clock.
//
// The same snapshot takes the sum of each category's item reorder levels.
// Reorder levels follow sales (see utils/reorder.js), so that sum floats; a
// month with no snapshot has it worked out as of its last moment instead,
// with the reorder rules the items carry today.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SNAPSHOT_EVERY_MS = 30 * 60 * 1000;
const BILLED_STATUSES = ['billed', 'delivered'];

// "YYYY-MM" of a moment, in Indian time
const istMonthKey = (date = new Date()) => {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`;
};

// The last moment of a "YYYY-MM" month, in Indian time
const istMonthEnd = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS - 1);
};

// Stock on hand per category right now: { [category]: pieces }. Every
// category is listed, even one with no items yet.
const stockByCategory = async () => {
  const [categories, sums] = await Promise.all([
    Category.find().select('name').lean(),
    Item.aggregate([{ $group: { _id: { $ifNull: ['$category', ''] }, qty: { $sum: { $ifNull: ['$quantity', 0] } } } }])
  ]);
  const stock = {};
  for (const c of categories) stock[c.name] = 0;
  for (const s of sums) stock[s._id || ''] = s.qty;
  return stock;
};

// The items that carry a reorder rule — the only ones with a reorder level
const reorderTracked = () =>
  Item.find({ reorder: { $ne: null } }).select('name category price quantity checkLevel reorder').lean();

// The sum of the item reorder levels in each category, as the reorder rules
// work out at `now`: { [category]: pieces }. Categories with no tracked
// items are left out.
const reorderByCategory = async (now = new Date(), tracked = null) => {
  const items = tracked || (await reorderTracked());
  if (!items.length) return {};
  const ctx = await buildReorderContext(items, now);
  const sums = {};
  for (const item of items) {
    const row = computeReorderRow(item, ctx);
    if (row.reorderLevel == null) continue;
    sums[row.category] = (sums[row.category] || 0) + row.reorderLevel;
  }
  return sums;
};

// Per category, today: the items holding stock, and those of them not sold
// (billed) once in the last `days` days — stock that isn't moving.
//   { [category]: { stocked: { items, pieces }, idle: { items, pieces } } }
const idleStockByCategory = async (days = 90, now = new Date()) => {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const [moving, items] = await Promise.all([
    Order.distinct('items.item', {
      type: 'sell order',
      status: { $in: BILLED_STATUSES },
      $or: [{ billedAt: { $gte: since } }, { billedAt: null, createdAt: { $gte: since } }]
    }),
    Item.find({ quantity: { $gt: 0 } }).select('category quantity').lean()
  ]);
  const sold = new Set(moving.map(String));
  const out = {};
  for (const item of items) {
    const key = item.category || '';
    if (!out[key]) out[key] = { stocked: { items: 0, pieces: 0 }, idle: { items: 0, pieces: 0 } };
    out[key].stocked.items += 1;
    out[key].stocked.pieces += item.quantity;
    if (!sold.has(String(item._id))) {
      out[key].idle.items += 1;
      out[key].idle.pieces += item.quantity;
    }
  }
  return out;
};

// Write this month's figures for every category (overwriting the last ones)
const snapshotClosingStock = async (now = new Date()) => {
  const month = istMonthKey(now);
  const [stock, reorder] = await Promise.all([stockByCategory(), reorderByCategory(now)]);
  const ops = Object.entries(stock).map(([category, qty]) => ({
    updateOne: {
      filter: { category, month },
      update: {
        $set: { auto: qty, autoAt: now, reorderAuto: reorder[category] ?? 0 },
        $setOnInsert: { category, month }
      },
      upsert: true
    }
  }));
  if (ops.length) await ClosingStock.bulkWrite(ops, { ordered: false });
  return { month, categories: ops.length };
};

let timer = null;
const startClosingStockSnapshots = () => {
  if (timer) return;
  const run = () =>
    snapshotClosingStock().catch((error) => console.error('Closing stock snapshot error:', error));
  run();
  timer = setInterval(run, SNAPSHOT_EVERY_MS);
  // Never the reason the process stays up
  if (timer.unref) timer.unref();
};

module.exports = {
  istMonthKey,
  istMonthEnd,
  stockByCategory,
  reorderTracked,
  reorderByCategory,
  idleStockByCategory,
  snapshotClosingStock,
  startClosingStockSnapshots
};
