const mongoose = require('mongoose');
const Category = require('../models/Category');
const Item = require('../models/Item');
const Salesman = require('../models/Salesman');
const Customer = require('../models/Customer');
const { RANGE_CHOICES, monthWindow, soldLines, seriesFrom } = require('../utils/categorySales');

// What counts — billed sales, less completed returns in the month they came
// back — is set out in utils/categorySales.js

const monthsOut = (months) => months.map(({ key, label }) => ({ key, label }));
const active = (row) => row.total !== 0 || row.returned > 0;

// Per category, in the order categories were created; a category name items
// still carry after its record was deleted, and '' (no category), are added
// while they have anything in the window
const byCategory = (categories, lines, months, { keepAll }) => {
  const { blank, add } = seriesFrom(months);
  const rows = new Map(categories.map((c) => [c.name, blank({ name: c.name, known: true })]));
  for (const line of lines) {
    if (!rows.has(line.category)) rows.set(line.category, blank({ name: line.category, known: false }));
    add(rows.get(line.category), line);
  }
  return [...rows.values()].filter((r) => (keepAll && r.known) || active(r));
};

// GET /orders/stats/category-sales?months=12 — admin
// Pieces sold per item category per month. Every category is listed, sold or
// not, so the dashboard can offer any of them.
exports.getCategorySales = async (req, res) => {
  try {
    const { months, start, end } = monthWindow(req.query.months);
    const [categories, lines] = await Promise.all([
      Category.find().select('name').sort({ createdAt: 1, _id: 1 }).lean(),
      soldLines({ start, end })
    ]);

    res.status(200).json({
      success: true,
      data: {
        months: monthsOut(months),
        ranges: RANGE_CHOICES,
        categories: byCategory(categories, lines, months, { keepAll: true })
      }
    });
  } catch (error) {
    console.error('Get category sales error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /orders/stats/category-sales/salesmen?category=Name&months=12 — admin
// One category's pieces sold per month, split by the salesman each customer
// is assigned to — not by whoever placed the order, so a customer's own app
// orders and orders the office keyed in count for their salesman too. Uses
// today's assignment for every month. Customers with nobody assigned (or
// assigned to a salesman since deleted) are summed in one "unassigned" row.
// `category=` (empty) means items with no category.
exports.getCategorySalesBySalesman = async (req, res) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const { months, start, end } = monthWindow(req.query.months);

    const itemFilter = category ? { category } : { category: { $in: ['', null] } };
    const [items, salesmen] = await Promise.all([
      Item.find(itemFilter).select('_id').lean(),
      Salesman.find().select('name').sort({ name: 1 }).collation({ locale: 'en', strength: 2 }).lean()
    ]);

    const { blank, add } = seriesFrom(months);
    const rows = new Map(salesmen.map((s) => [String(s._id), blank({ salesmanId: s._id, name: s.name })]));
    const unassigned = blank({ salesmanId: null, name: 'No assigned salesman' });

    // No category also takes in lines whose item has since been deleted, as
    // the dashboard chart does — so for it every order is read
    if (items.length || !category) {
      const lines = await soldLines({
        start,
        end,
        itemIds: category ? items.map((it) => it._id) : null,
        customerFields: 'name assignedSalesman'
      });
      for (const line of lines) {
        if (line.category !== category) continue;
        const salesmanId = line.customer?.assignedSalesman ? String(line.customer.assignedSalesman) : null;
        add((salesmanId && rows.get(salesmanId)) || unassigned, line);
      }
    }

    const all = [...rows.values()];
    res.status(200).json({
      success: true,
      data: {
        category,
        months: monthsOut(months),
        ranges: RANGE_CHOICES,
        salesmen: all,
        unassigned: active(unassigned) ? unassigned : null,
        total: all.reduce((sum, r) => sum + r.total, unassigned.total),
        returned: all.reduce((sum, r) => sum + r.returned, unassigned.returned)
      }
    });
  } catch (error) {
    console.error('Get category sales by salesman error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /orders/stats/category-sales/customer/:id?months=12 — admin
// What one customer has bought, per category per month — the categories they
// have bought or returned in the window, busiest first.
exports.getCustomerCategorySales = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid customer id' });
    }
    const customer = await Customer.findById(req.params.id).select('name').lean();
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const { months, start, end } = monthWindow(req.query.months);
    const [categories, lines] = await Promise.all([
      Category.find().select('name').sort({ createdAt: 1, _id: 1 }).lean(),
      soldLines({ start, end, customerId: customer._id })
    ]);
    const rows = byCategory(categories, lines, months, { keepAll: false }).sort((a, b) => b.total - a.total);

    res.status(200).json({
      success: true,
      data: {
        customer: { _id: customer._id, name: customer.name },
        months: monthsOut(months),
        ranges: RANGE_CHOICES,
        categories: rows,
        total: rows.reduce((sum, r) => sum + r.total, 0),
        returned: rows.reduce((sum, r) => sum + r.returned, 0)
      }
    });
  } catch (error) {
    console.error('Get customer category sales error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
