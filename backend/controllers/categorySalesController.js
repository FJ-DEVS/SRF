const mongoose = require('mongoose');
const Category = require('../models/Category');
const Item = require('../models/Item');
const Salesman = require('../models/Salesman');
const Customer = require('../models/Customer');
const { RANGE_CHOICES, monthWindow, soldLines, seriesFrom } = require('../utils/categorySales');

// What counts — billed sales, less completed returns in the month they came
// back — is set out in utils/categorySales.js.
//
// Salesmen here are always the salesman a customer is assigned to today, not
// whoever keyed the order in: a customer's own app orders and orders the
// office placed count for their salesman too. Customers with nobody assigned
// (or assigned to a salesman since deleted) make up the "unassigned" row.

const BY = ['category', 'salesman', 'customer'];
const UNASSIGNED = 'unassigned';
const DELETED_CUSTOMER = 'deleted';

const monthsOut = (months) => months.map(({ key, label }) => ({ key, label }));
const active = (row) => row.total !== 0 || row.returned > 0;
const byTotal = (a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name));
const isId = (v) => typeof v === 'string' && mongoose.Types.ObjectId.isValid(v);

// GET /orders/stats/sales-breakdown — admin, investor
//   by=category|salesman|customer   what each row (chart line) is
//   months=3|6|12|24                how far back, this month included
//   from=YYYY-MM&to=YYYY-MM         or an exact span, both months included —
//                                   a financial-year quarter, say
//   category=Name                   only that category ('' = no category)
//   salesman=<id>|unassigned        only that salesman's assigned customers
//   customer=<id>                   only that customer
// Rows: { id, name, total, returned, monthly } — monthly is net pieces per
// month in window order. Category rows list every category when nothing
// narrows them, so a picker can offer any; salesman rows list every
// salesman; customer rows only customers with something in the window.
exports.getSalesBreakdown = async (req, res) => {
  try {
    const by = BY.includes(req.query.by) ? req.query.by : 'category';
    const { months, start, end } = monthWindow(req.query.months, req.query.from, req.query.to);
    const hasCategory = typeof req.query.category === 'string';
    const category = hasCategory ? req.query.category.trim() : null;
    const salesmanParam = typeof req.query.salesman === 'string' ? req.query.salesman : '';
    const customerParam = typeof req.query.customer === 'string' ? req.query.customer : '';

    if (salesmanParam && salesmanParam !== UNASSIGNED && !isId(salesmanParam)) {
      return res.status(400).json({ success: false, message: 'Invalid salesman' });
    }
    if (customerParam && !isId(customerParam)) {
      return res.status(400).json({ success: false, message: 'Invalid customer' });
    }

    const [categories, salesmen] = await Promise.all([
      Category.find().select('name growthTarget').sort({ createdAt: 1, _id: 1 }).lean(),
      Salesman.find().select('name').sort({ name: 1 }).collation({ locale: 'en', strength: 2 }).lean()
    ]);
    const salesmanById = new Map(salesmen.map((s) => [String(s._id), s]));

    // The filters, resolved
    let customer = null;
    if (customerParam) {
      customer = await Customer.findById(customerParam).select('name assignedSalesman').lean();
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    let salesman = null;
    if (salesmanParam === UNASSIGNED) {
      salesman = { id: UNASSIGNED, name: 'No assigned salesman' };
    } else if (salesmanParam) {
      const found = salesmanById.get(salesmanParam);
      if (!found) return res.status(404).json({ success: false, message: 'Salesman not found' });
      salesman = { id: salesmanParam, name: found.name };
    }

    // Narrow what is read where the database can
    let customerIds = customer ? [customer._id] : null;
    if (salesman && salesman.id !== UNASSIGNED) {
      const assigned = await Customer.find({ assignedSalesman: salesman.id }).select('_id').lean();
      const ids = assigned.map((c) => String(c._id));
      customerIds = customerIds ? customerIds.filter((id) => ids.includes(String(id))) : assigned.map((c) => c._id);
    }
    let itemIds = null;
    if (hasCategory && category) {
      itemIds = (await Item.find({ category }).select('_id').lean()).map((it) => it._id);
    }

    // The salesman a line's customer is assigned to, if that salesman exists
    const salesmanOf = (line) => {
      const id = line.customer?.assignedSalesman ? String(line.customer.assignedSalesman) : null;
      return id && salesmanById.has(id) ? id : UNASSIGNED;
    };

    let lines = [];
    const nothingToRead = (customerIds && customerIds.length === 0) || (itemIds && itemIds.length === 0);
    if (!nothingToRead) {
      lines = await soldLines({ start, end, itemIds, customerIds, customerFields: 'name assignedSalesman' });
      lines = lines.filter(
        (line) =>
          (!hasCategory || line.category === category) &&
          (!salesman || salesman.id !== UNASSIGNED || salesmanOf(line) === UNASSIGNED)
      );
    }

    const { blank, add } = seriesFrom(months);
    let rows;
    if (by === 'category') {
      const narrowed = Boolean(customer || salesman);
      // growth: the category's monthly sales growth target in percent, or null
      const map = new Map(categories.map((c) => [c.name, blank({ id: c.name, name: c.name, known: true, growth: c.growthTarget ?? null })]));
      for (const line of lines) {
        if (!map.has(line.category)) map.set(line.category, blank({ id: line.category, name: line.category, known: false, growth: null }));
        add(map.get(line.category), line);
      }
      rows = [...map.values()].filter((r) => (!narrowed && r.known) || active(r));
    } else if (by === 'salesman') {
      const map = new Map(salesmen.map((s) => [String(s._id), blank({ id: String(s._id), name: s.name })]));
      const unassigned = blank({ id: UNASSIGNED, name: 'No assigned salesman', unassigned: true });
      for (const line of lines) {
        const id = salesmanOf(line);
        add(id === UNASSIGNED ? unassigned : map.get(id), line);
      }
      rows = [...map.values()];
      if (active(unassigned)) rows.push(unassigned);
    } else {
      const map = new Map();
      for (const line of lines) {
        const id = line.customer?._id ? String(line.customer._id) : DELETED_CUSTOMER;
        if (!map.has(id)) {
          const assignedTo = id === DELETED_CUSTOMER ? UNASSIGNED : salesmanOf(line);
          map.set(id, blank({
            id,
            name: id === DELETED_CUSTOMER ? 'Deleted customers' : line.customer.name,
            salesman: assignedTo === UNASSIGNED ? null : salesmanById.get(assignedTo).name
          }));
        }
        add(map.get(id), line);
      }
      rows = [...map.values()];
    }
    rows.sort(byTotal);

    const index = new Map(months.map((m) => [m.key, true]));
    const inWindow = lines.filter((l) => index.has(l.month));
    res.status(200).json({
      success: true,
      data: {
        by,
        months: monthsOut(months),
        ranges: RANGE_CHOICES,
        rows,
        total: inWindow.reduce((sum, l) => sum + l.qty, 0),
        returned: inWindow.reduce((sum, l) => sum + (l.returned ? -l.qty : 0), 0),
        filters: {
          category: hasCategory ? category : null,
          salesman,
          customer: customer && {
            id: String(customer._id),
            name: customer.name,
            salesman: customer.assignedSalesman && salesmanById.get(String(customer.assignedSalesman))?.name || null
          }
        }
      }
    });
  } catch (error) {
    console.error('Get sales breakdown error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
// A whole list at once, for a PDF of every customer
const MAX_EXPORT = 5000;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /orders/stats/customer-categories — admin, investor
// GET /orders/salesman/customer-categories — a salesman, in the mobile app:
//   always their own assigned customers, whatever `salesman` says
// What each customer buys, category by category — one graph per customer.
//   months=… | from=…&to=…    the period, as for sales-breakdown
//   page=1&limit=10           a page of customers, busiest first
//   search=text               customers whose name or phone matches — these
//                             come back even with nothing bought, so a search
//                             always finds the customer
//   salesman=<id>|unassigned  only that salesman's assigned customers
//   all=1                     every matching customer (no monthly figures)
// customers: [{ id, name, salesman, total, returned,
//               categories: [{ name, total, returned, monthly }] }]
exports.getCustomerCategories = async (req, res) => {
  try {
    const { months, start, end } = monthWindow(req.query.months, req.query.from, req.query.to);
    const all = req.query.all === '1' || req.query.all === 'true';
    const limit = all ? MAX_EXPORT : Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE));
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '';
    const ownCustomers = req.user?.role === 'salesman';
    const salesmanParam = ownCustomers
      ? String(req.user.id)
      : typeof req.query.salesman === 'string' ? req.query.salesman : '';

    if (salesmanParam && salesmanParam !== UNASSIGNED && !isId(salesmanParam)) {
      return res.status(400).json({ success: false, message: 'Invalid salesman' });
    }

    const salesmen = await Salesman.find().select('name').lean();
    const salesmanById = new Map(salesmen.map((s) => [String(s._id), s]));
    let salesman = null;
    if (salesmanParam === UNASSIGNED) {
      salesman = { id: UNASSIGNED, name: 'No assigned salesman' };
    } else if (salesmanParam) {
      const found = salesmanById.get(salesmanParam);
      if (!found) return res.status(404).json({ success: false, message: 'Salesman not found' });
      salesman = { id: salesmanParam, name: found.name };
    }
    const assignedTo = (customer) => {
      const id = customer?.assignedSalesman ? String(customer.assignedSalesman) : null;
      return id && salesmanById.has(id) ? id : UNASSIGNED;
    };

    // The customers in question, where something narrows them
    const where = {};
    if (salesman && salesman.id !== UNASSIGNED) where.assignedSalesman = salesman.id;
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      where.$or = [{ name: pattern }, { phone: pattern }];
    }
    const narrowed = Object.keys(where).length > 0;
    let matching = null;
    if (narrowed) {
      matching = (await Customer.find(where).select('name assignedSalesman').lean())
        .filter((c) => !salesman || salesman.id !== UNASSIGNED || assignedTo(c) === UNASSIGNED);
    }

    let lines = [];
    if (!matching || matching.length) {
      lines = await soldLines({
        start,
        end,
        customerIds: matching ? matching.map((c) => c._id) : null,
        customerFields: 'name assignedSalesman'
      });
    }

    const { blank, add } = seriesFrom(months);
    const byCustomer = new Map();
    const entry = (customer) => {
      const id = String(customer._id);
      if (!byCustomer.has(id)) {
        const sid = assignedTo(customer);
        byCustomer.set(id, {
          ...blank({ id, name: customer.name, salesman: sid === UNASSIGNED ? null : salesmanById.get(sid).name }),
          cats: new Map()
        });
      }
      return byCustomer.get(id);
    };
    // A search shows a matching customer even with nothing bought
    if (search) for (const c of matching) entry(c);
    for (const line of lines) {
      // Orders of deleted customers have no one to show them under
      if (!line.customer?._id) continue;
      if (salesman?.id === UNASSIGNED && assignedTo(line.customer) !== UNASSIGNED) continue;
      const row = entry(line.customer);
      add(row, line);
      if (!row.cats.has(line.category)) row.cats.set(line.category, blank({ name: line.category }));
      add(row.cats.get(line.category), line);
    }

    const rows = [...byCustomer.values()]
      .filter((r) => search || active(r))
      .sort(byTotal);
    const pages = Math.max(1, Math.ceil(rows.length / limit));
    const page = all ? 1 : Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
    const customers = rows.slice((page - 1) * limit, page * limit).map(({ cats, monthly, ...row }) => ({
      ...row,
      ...(all ? {} : { monthly }),
      categories: [...cats.values()]
        .filter(active)
        .sort(byTotal)
        .map((c) => (all ? { name: c.name, total: c.total, returned: c.returned } : c))
    }));

    res.status(200).json({
      success: true,
      data: {
        months: monthsOut(months),
        page,
        pages,
        limit,
        count: rows.length,
        customers,
        filters: { search, salesman }
      }
    });
  } catch (error) {
    console.error('Get customer categories error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
