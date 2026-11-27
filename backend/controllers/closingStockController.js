const Category = require('../models/Category');
const ClosingStock = require('../models/ClosingStock');
const Settings = require('../models/Settings');
const { monthWindow } = require('../utils/categorySales');
const {
  istMonthKey,
  istMonthEnd,
  stockByCategory,
  reorderTracked,
  reorderByCategory,
  idleStockByCategory
} = require('../utils/closingStock');

// "Not moving": in stock, and not sold once in this many days
const IDLE_DAYS = 90;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_QTY = 100000000;

// GET /api/closing-stock — admin, investor
//   months=… | from=…&to=…   the same window as the sales charts
// rows: [{ category, values, manual, auto }] — one figure per month, oldest
// first: the admin's figure if one was typed in, else the one the server
// took, else null. This month hasn't closed, so its figure is the stock on
// hand right now (`live` says which month that is).
//   include=inventory   also, per row: `reorder` — the sum of the category's
//                       item reorder levels at each month end (the snapshot
//                       taken then, else worked out with today's rules; this
//                       month: now) — and `stocked` / `idle` — today's items
//                       holding stock, and those not sold in IDLE_DAYS days
exports.getClosingStock = async (req, res) => {
  try {
    const { months } = monthWindow(req.query.months, req.query.from, req.query.to);
    const keys = months.map((m) => m.key);
    const current = istMonthKey();

    const [categories, docs, live, settings] = await Promise.all([
      Category.find().select('name').sort({ createdAt: 1, _id: 1 }).lean(),
      ClosingStock.find({ month: { $in: keys } }).lean(),
      keys.includes(current) ? stockByCategory() : Promise.resolve(null),
      Settings.getSingleton()
    ]);

    const byCategory = new Map(categories.map((c) => [c.name, new Map()]));
    for (const doc of docs) {
      if (!byCategory.has(doc.category)) byCategory.set(doc.category, new Map());
      byCategory.get(doc.category).set(doc.month, doc);
    }
    if (live && live[''] !== undefined && !byCategory.has('')) byCategory.set('', new Map());

    const rows = [...byCategory.entries()].map(([category, byMonth]) => {
      const values = [];
      const manual = [];
      const auto = [];
      for (const key of keys) {
        const doc = byMonth.get(key);
        const taken = doc?.auto ?? null;
        const typed = doc?.manual ?? null;
        let value = typed ?? taken;
        if (key === current && typed === null && live) value = live[category] ?? 0;
        if (key > current) value = null;
        values.push(value);
        manual.push(typed !== null);
        auto.push(key === current && live ? live[category] ?? 0 : taken);
      }
      return { category, values, manual, auto };
    });

    let idleDays = null;
    if (req.query.include === 'inventory') {
      // Reorder level sums: a month's snapshot if one was taken, else worked
      // out as of the month's end (this month: now)
      const needed = keys.filter(
        (key) => key <= current && (key === current || [...byCategory.values()].every((m) => m.get(key)?.reorderAuto == null))
      );
      const tracked = needed.length ? await reorderTracked() : [];
      const [idle, ...computed] = await Promise.all([
        idleStockByCategory(IDLE_DAYS),
        ...needed.map((key) => reorderByCategory(key === current ? new Date() : istMonthEnd(key), tracked))
      ]);
      const worked = new Map(needed.map((key, i) => [key, computed[i]]));
      for (const row of rows) {
        const byMonth = byCategory.get(row.category);
        row.reorder = keys.map((key) => {
          if (key > current) return null;
          if (worked.has(key)) return worked.get(key)[row.category] ?? 0;
          return byMonth.get(key)?.reorderAuto ?? 0;
        });
        row.stocked = idle[row.category]?.stocked || { items: 0, pieces: 0 };
        row.idle = idle[row.category]?.idle || { items: 0, pieces: 0 };
      }
      idleDays = IDLE_DAYS;
    }

    res.status(200).json({
      success: true,
      data: {
        months: months.map(({ key, label }) => ({ key, label })),
        live: keys.includes(current) ? current : null,
        // The sale : closing stock ratio aimed for — 3 is 1:3
        target: settings.stockRatioTarget ?? 3,
        ...(idleDays ? { idleDays } : {}),
        rows
      }
    });
  } catch (error) {
    console.error('Get closing stock error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/closing-stock/target — admin
//   { target }   the stock ratio aimed for: 3 means sale : stock of 1:3
exports.setRatioTarget = async (req, res) => {
  try {
    const target = Number(req.body.target);
    if (!Number.isFinite(target) || target < 0.1 || target > 100) {
      return res.status(400).json({ success: false, message: 'Target must be between 0.1 and 100' });
    }
    const rounded = Math.round(target * 10) / 10;
    await Settings.getSingleton();
    await Settings.updateOne({ key: 'app' }, { $set: { stockRatioTarget: rounded } });
    res.status(200).json({ success: true, message: `Target set to 1:${rounded}`, data: { target: rounded } });
  } catch (error) {
    console.error('Set stock ratio target error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/closing-stock — admin
//   { category, month: "YYYY-MM", quantity }   quantity null clears the
//   admin's figure, so the one the server took shows again
exports.setClosingStock = async (req, res) => {
  try {
    const category = typeof req.body.category === 'string' ? req.body.category.trim() : null;
    const month = typeof req.body.month === 'string' ? req.body.month : '';
    const raw = req.body.quantity;

    if (category === null) return res.status(400).json({ success: false, message: 'Category is required' });
    if (!MONTH_RE.test(month)) return res.status(400).json({ success: false, message: 'Month must be YYYY-MM' });
    if (month > istMonthKey()) {
      return res.status(400).json({ success: false, message: 'That month has not started yet' });
    }
    let quantity = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      quantity = Number(raw);
      if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || Math.abs(quantity) > MAX_QTY) {
        return res.status(400).json({ success: false, message: 'Quantity must be a whole number' });
      }
    }
    if (category !== '' && !(await Category.exists({ name: category }))) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const doc = await ClosingStock.findOneAndUpdate(
      { category, month },
      { $set: { manual: quantity, manualAt: quantity === null ? null : new Date() }, $setOnInsert: { category, month } },
      { upsert: true, new: true }
    ).lean();

    res.status(200).json({
      success: true,
      message: quantity === null ? 'Closing stock reset' : 'Closing stock saved',
      data: { category: doc.category, month: doc.month, manual: doc.manual, auto: doc.auto }
    });
  } catch (error) {
    console.error('Set closing stock error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
