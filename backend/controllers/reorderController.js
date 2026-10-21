const mongoose = require('mongoose');
const Item = require('../models/Item');
const { getIO } = require('../socket');
const { findItemsPage } = require('./itemController');
const { parseReorderConfig, buildReorderContext, computeReorderRow } = require('../utils/reorder');

// Escape user input before using it inside a regex
const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The item filters shared by every list here — the same search and category
// semantics as the Items page
const itemConditions = ({ search, category }) => {
  const conditions = [];
  if (search) {
    conditions.push({
      $or: [
        { name: { $regex: escapeRegex(search), $options: 'i' } },
        { category: { $regex: escapeRegex(search), $options: 'i' } }
      ]
    });
  }
  if (category) conditions.push({ category });
  return conditions;
};

const toQuery = (conditions) => (conditions.length ? { $and: conditions } : {});

// Items that carry a reorder rule of their own; `{ reorder: null }` also
// matches documents saved before the field existed
const CONFIGURED = { reorder: { $ne: null } };
const NOT_CONFIGURED = { reorder: null };

// Rows for a set of items, computed against live orders
const reorderRows = async (items) => {
  const ctx = await buildReorderContext(items);
  return items.map((item) => computeReorderRow(item, ctx));
};

// One page of items with their reorder rules and what those rules currently
// work out to. ?configured=yes|no narrows to items with / without a rule.
exports.getReorderLevels = async (req, res) => {
  try {
    const { search, category, configured, sort, page = 1, limit = 10 } = req.query;

    const conditions = itemConditions({ search, category });
    if (configured === 'yes') conditions.push(CONFIGURED);
    if (configured === 'no') conditions.push(NOT_CONFIGURED);
    const query = toQuery(conditions);

    const pageNum = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNum - 1) * pageSize;

    const [items, total, configuredTotal] = await Promise.all([
      findItemsPage(query, sort, skip, pageSize),
      Item.countDocuments(query),
      Item.countDocuments(CONFIGURED)
    ]);

    res.status(200).json({
      success: true,
      data: await reorderRows(items),
      summary: { configuredTotal },
      pagination: { total, page: pageNum, pages: Math.ceil(total / pageSize) }
    });
  } catch (error) {
    console.error('Get reorder levels error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Set (or, with both rules blank, clear) one item's reorder rules
exports.setReorderLevel = async (req, res) => {
  try {
    const parsed = parseReorderConfig(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    const update = parsed.config ? { $set: { reorder: parsed.config } } : { $unset: { reorder: 1 } };
    const item = await Item.findByIdAndUpdate(req.params.itemId, update, { new: true, runValidators: true }).lean();
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    getIO().emit('items_updated');

    const [row] = await reorderRows([item]);
    res.status(200).json({
      success: true,
      message: parsed.config ? 'Reorder level saved' : 'Reorder level cleared',
      data: row
    });
  } catch (error) {
    console.error('Set reorder level error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Apply the same rules to many items at once — the ones listed in itemIds,
// or every item matching the search / category / configured filter when
// none are listed
exports.bulkSetReorderLevels = async (req, res) => {
  try {
    const { itemIds, search, category, configured } = req.body;

    const parsed = parseReorderConfig(req.body);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    let query;
    if (Array.isArray(itemIds) && itemIds.length) {
      const ids = itemIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (!ids.length) {
        return res.status(400).json({ success: false, message: 'No valid item IDs given' });
      }
      query = { _id: { $in: ids } };
    } else {
      const conditions = itemConditions({ search, category });
      if (configured === 'yes') conditions.push(CONFIGURED);
      if (configured === 'no') conditions.push(NOT_CONFIGURED);
      query = toQuery(conditions);
    }

    const update = parsed.config ? { $set: { reorder: parsed.config } } : { $unset: { reorder: 1 } };
    const result = await Item.updateMany(query, update, { runValidators: true });

    if (result.modifiedCount) getIO().emit('items_updated');

    res.status(200).json({
      success: true,
      message: `Reorder level ${parsed.config ? 'applied to' : 'cleared on'} ${result.matchedCount} item(s)`,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk set reorder levels error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// "Item A–Z" the way the Items page sorts: by the leading serial number, or by
// the name without it. Keep in step with utils/itemNameSort.js.
const nameKey = (name = '') => {
  const full = String(name).toLowerCase().replace(/\s+/g, ' ').trim();
  const m = full.match(/^(\d+) (.*)$/);
  return m
    ? { hasSerial: true, serial: Number(m[1]), rest: m[2], full }
    : { hasSerial: false, serial: Infinity, rest: full, full };
};

const compareText = (a, b) => a.localeCompare(b, 'en');

const STATUS_SORTS = {
  item_asc: (a, b) => {
    const ka = nameKey(a.name);
    const kb = nameKey(b.name);
    if (ka.hasSerial !== kb.hasSerial) return ka.hasSerial ? -1 : 1;
    return ka.serial - kb.serial || compareText(ka.rest, kb.rest);
  },
  item_noserial_asc: (a, b) => {
    const ka = nameKey(a.name);
    const kb = nameKey(b.name);
    return compareText(ka.rest, kb.rest) || ka.serial - kb.serial;
  },
  name_asc: (a, b) => compareText(a.name, b.name),
  name_desc: (a, b) => compareText(b.name, a.name),
  shortfall_desc: (a, b) => b.shortfall - a.shortfall,
  order_desc: (a, b) => b.orderQty - a.orderQty,
  value_desc: (a, b) => b.orderValue - a.orderValue,
  available_asc: (a, b) => a.nettAvailable - b.nettAvailable,
  prev_sales_desc: (a, b) => b.prevMonthSales - a.prevMonthSales
};

// Which rows a ?state= filter keeps
const STATE_FILTERS = {
  // Items that need a purchase order now
  short: (row) => row.orderQty > 0,
  // Tracked items that are fine
  ok: (row) => row.reorderLevel !== null && row.shortfall === 0,
  // Items without a reorder rule
  untracked: (row) => row.reorderLevel === null
};

// The reorder status report — Tally's "Stock Group Reorder Status". Every
// column is worked out from live stock and orders, and the sort and the
// state filter act on those computed columns, so the whole filtered list is
// built first and the page cut from it. The totals cover the whole list.
exports.getReorderStatus = async (req, res) => {
  try {
    const { search, category, state, sort = 'item_asc', page = 1, limit = 10 } = req.query;

    const items = await Item.find(toQuery(itemConditions({ search, category })))
      .select('name category price quantity checkLevel reorder')
      .lean();

    const ctx = await buildReorderContext(items);
    let rows = items.map((item) => computeReorderRow(item, ctx));

    if (STATE_FILTERS[state]) rows = rows.filter(STATE_FILTERS[state]);

    const summary = rows.reduce(
      (acc, row) => {
        acc.items++;
        if (row.orderQty > 0) acc.itemsShort++;
        if (row.reorderLevel === null) acc.itemsUntracked++;
        acc.closingStock += row.closingStock;
        acc.purchasePending += row.purchasePending;
        acc.prevMonthSales += row.prevMonthSales;
        acc.shortfall += row.shortfall;
        acc.orderQty += row.orderQty;
        acc.orderValue += row.orderValue;
        return acc;
      },
      {
        items: 0, itemsShort: 0, itemsUntracked: 0, closingStock: 0, purchasePending: 0,
        prevMonthSales: 0, shortfall: 0, orderQty: 0, orderValue: 0
      }
    );

    const compare = STATUS_SORTS[sort] || STATUS_SORTS.item_asc;
    // Ties fall back to item order so paging stays stable
    rows.sort((a, b) => compare(a, b) || STATUS_SORTS.item_asc(a, b));

    const pageNum = parseInt(page);
    const pageSize = parseInt(limit);
    const start = (pageNum - 1) * pageSize;

    res.status(200).json({
      success: true,
      data: rows.slice(start, start + pageSize),
      summary,
      asOf: ctx.now,
      prevMonth: ctx.prevMonth,
      pagination: { total: rows.length, page: pageNum, pages: Math.ceil(rows.length / pageSize) }
    });
  } catch (error) {
    console.error('Get reorder status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
