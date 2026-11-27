const Item = require('../models/Item');
const Order = require('../models/Order');
const { buildReorderContext, computeReorderRow } = require('../utils/reorder');

// Non-moving stock: items that haven't sold a single piece for a month or
// more, with what they hold — pieces, value and reorder level — so slow lines
// can be cleared and their reorder levels brought down before more is bought.
//
// "Sold" is a billed sale (a sell order now billed or delivered), dated by
// its bill date (orders billed before that was kept: the order date). An
// item that has never sold counts from the day it was added, so a new line
// isn't called non-moving before it has had the chance to sell.

const BILLED_STATUSES = ['billed', 'delivered'];
const MAX_MONTHS = 6;

// Whole calendar months from `since` to `now`: 15 Aug → 14 Nov is 2, → 15 Nov is 3
const monthsBetween = (since, now) => {
  let n = (now.getFullYear() - since.getFullYear()) * 12 + now.getMonth() - since.getMonth();
  if (now.getDate() < since.getDate()) n -= 1;
  return Math.max(0, n);
};

// GET /api/stock-health/non-moving — admin, investor
//   empty=1   also items with no stock (their reorder level may still buy more)
// items: every item not sold for a month or more, longest idle first:
//   { id, name, category, quantity, price, value, reorderLevel,
//     lastSoldAt, neverSold, idleSince, idleMonths (capped at 6, "6+") }
exports.getNonMoving = async (req, res) => {
  try {
    const now = new Date();
    const withEmpty = req.query.empty === '1' || req.query.empty === 'true';

    const [lastSales, items] = await Promise.all([
      Order.aggregate([
        { $match: { type: 'sell order', status: { $in: BILLED_STATUSES } } },
        { $project: { items: 1, at: { $ifNull: ['$billedAt', '$createdAt'] } } },
        { $unwind: '$items' },
        { $match: { 'items.quantity': { $gt: 0 } } },
        { $group: { _id: '$items.item', last: { $max: '$at' } } }
      ]),
      Item.find(withEmpty ? {} : { quantity: { $gt: 0 } })
        .select('name category price quantity reorder checkLevel createdAt')
        .lean()
    ]);
    const lastSold = new Map(lastSales.map((s) => [String(s._id), s.last]));

    const idle = [];
    for (const item of items) {
      const last = lastSold.get(String(item._id)) || null;
      const since = last || item.createdAt || null;
      if (!since) continue;
      const months = monthsBetween(new Date(since), now);
      if (months < 1) continue;
      idle.push({ item, last, since, months });
    }

    // Reorder levels, as the reorder report works them out today
    const tracked = idle.filter((r) => r.item.reorder).map((r) => r.item);
    const ctx = tracked.length ? await buildReorderContext(tracked, now) : null;
    const levelOf = new Map(
      tracked.map((item) => [String(item._id), computeReorderRow(item, ctx).reorderLevel])
    );

    const out = idle
      .map(({ item, last, since, months }) => ({
        id: String(item._id),
        name: item.name,
        category: item.category || '',
        quantity: item.quantity || 0,
        price: item.price || 0,
        value: Math.round((item.quantity || 0) * (item.price || 0) * 100) / 100,
        reorderLevel: levelOf.get(String(item._id)) ?? null,
        lastSoldAt: last,
        neverSold: !last,
        idleSince: since,
        idleMonths: Math.min(months, MAX_MONTHS),
        idleDays: Math.floor((now - new Date(since)) / 86400000)
      }))
      .sort((a, b) => b.idleDays - a.idleDays || b.value - a.value);

    res.status(200).json({
      success: true,
      data: { asOf: now, maxMonths: MAX_MONTHS, withEmpty, items: out }
    });
  } catch (error) {
    console.error('Get non-moving stock error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
