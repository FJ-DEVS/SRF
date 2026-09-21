const Schema = require('../models/Schema');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Salesman = require('../models/Salesman');
const Category = require('../models/Category');
const Item = require('../models/Item');
const { exact, findDuplicate } = require('../utils/duplicateCheck');

const duplicateNameMessage = (name) => `A schema named "${String(name).trim()}" already exists`;

// Sell-order statuses that count as a completed sale for incentive points.
// Widen this list if partially-completed orders should also earn points.
const COUNTED_STATUSES = ['delivered'];

// --- Helpers -------------------------------------------------------------

// Normalise + validate the arrays coming from the admin form.
// Points are allocated per category — every item inside it earns the same rate.
const buildAllocations = (allocations) =>
  (Array.isArray(allocations) ? allocations : [])
    .filter((a) => a && a.category)
    .map((a) => ({
      category: a.category,
      categoryName: (a.categoryName || '').trim(),
      points: Number(a.points) || 0
    }));

const buildTiers = (tiers) =>
  (Array.isArray(tiers) ? tiers : [])
    .filter((t) => t && (t.reward || '').trim())
    .map((t) => ({
      pointsRequired: Number(t.pointsRequired) || 0,
      reward: t.reward.trim()
    }));

// Highest tier whose threshold the customer has reached (null if none).
const resolveTier = (points, tiers) => {
  const sorted = [...(tiers || [])].sort((a, b) => a.pointsRequired - b.pointsRequired);
  let current = null;
  for (const tier of sorted) {
    if (points >= tier.pointsRequired) current = tier;
    else break;
  }
  return current;
};

// Next tier the customer has NOT yet reached (null if already at the top).
const nextTier = (points, tiers) => {
  const sorted = [...(tiers || [])].sort((a, b) => a.pointsRequired - b.pointsRequired);
  return sorted.find((tier) => points < tier.pointsRequired) || null;
};

// { itemId(string) -> points } for a schema: an item earns the rate of the
// category it belongs to. Categories are looked up live so a renamed category
// keeps scoring.
const pointsByItemFor = async (schema) => {
  const allocations = schema.pointsAllocations || [];
  if (allocations.length === 0) return new Map();

  const categories = await Category.find({
    _id: { $in: allocations.map((a) => a.category) }
  })
    .select('name')
    .lean();
  const nameById = new Map(categories.map((c) => [String(c._id), c.name]));

  const pointsByCategoryName = new Map();
  for (const alloc of allocations) {
    // Fall back to the stored name when the category has since been deleted
    const name = nameById.get(String(alloc.category)) || alloc.categoryName;
    if (name) pointsByCategoryName.set(name, alloc.points);
  }

  const items = await Item.find({ category: { $in: [...pointsByCategoryName.keys()] } })
    .select('category')
    .lean();

  return new Map(items.map((i) => [String(i._id), pointsByCategoryName.get(i.category)]));
};

// Compute, from qualifying orders in the schema period:
//   totals  { customerId(string) -> points }
//   sellers { customerId(string) -> Set(salesmanId) } — salesmen who placed
//           those orders, so a customer can be filtered by who sold to them
// Points belong to the customer who bought the items, whoever placed the order.
const computePointsForSchema = async (schema) => {
  const pointsByItem = await pointsByItemFor(schema);

  const orders = await Order.find({
    type: 'sell order',
    customerName: { $ne: null },
    status: { $in: COUNTED_STATUSES },
    createdAt: { $gte: schema.fromDate, $lte: schema.toDate }
  }).select('customerName items createdBy createdByType');

  const totals = new Map();
  const sellers = new Map();
  for (const order of orders) {
    const customerId = String(order.customerName);
    for (const line of order.items) {
      const perUnit = pointsByItem.get(String(line.item));
      if (perUnit === undefined) continue;
      const earned = perUnit * (line.quantity || 0);
      totals.set(customerId, (totals.get(customerId) || 0) + earned);
    }
    if (order.createdByType === 'salesman' && order.createdBy) {
      if (!sellers.has(customerId)) sellers.set(customerId, new Set());
      sellers.get(customerId).add(String(order.createdBy));
    }
  }
  return { totals, sellers };
};

// Ranked rows for every customer who earned points in the schema period.
// Ranks are global (across all customers) so a filtered view keeps the
// customer's true standing. Each row lists the salesmen linked to the
// customer: the assigned one first, then anyone who sold to them in the period.
const buildLeaderboard = async (schema) => {
  const { totals, sellers } = await computePointsForSchema(schema);
  const scoredIds = [...totals.keys()].filter((id) => totals.get(id) > 0);
  if (scoredIds.length === 0) return [];

  const customers = await Customer.find({ _id: { $in: scoredIds } })
    .select('name phone assignedSalesman')
    .lean();

  const salesmanIdsFor = (c) => {
    const ids = [];
    if (c.assignedSalesman) ids.push(String(c.assignedSalesman));
    for (const id of sellers.get(String(c._id)) || []) {
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };

  const allSalesmanIds = new Set(customers.flatMap(salesmanIdsFor));
  const salesmen = await Salesman.find({ _id: { $in: [...allSalesmanIds] } })
    .select('name username')
    .lean();
  const salesmanById = new Map(salesmen.map((s) => [String(s._id), s]));

  return customers
    .map((c) => {
      const points = totals.get(String(c._id)) || 0;
      const tier = resolveTier(points, schema.tiers);
      const upcoming = nextTier(points, schema.tiers);
      return {
        customerId: c._id,
        name: c.name,
        phone: c.phone,
        salesmen: salesmanIdsFor(c)
          .map((id) => salesmanById.get(id))
          .filter(Boolean)
          .map((s) => ({ _id: s._id, name: s.name, username: s.username })),
        points,
        tier: tier ? tier.reward : null,
        tierPointsRequired: tier ? tier.pointsRequired : null,
        nextTier: upcoming ? upcoming.reward : null,
        pointsToNextTier: upcoming ? Math.max(upcoming.pointsRequired - points, 0) : 0
      };
    })
    .sort((a, b) => b.points - a.points)
    .map((row, index) => ({ ...row, rank: index + 1 }));
};

// --- Admin CRUD ----------------------------------------------------------

exports.createSchema = async (req, res) => {
  try {
    const { name, runBy, fromDate, toDate, pointsAllocations, tiers } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Schema name is required' });
    }
    if (!fromDate || !toDate) {
      return res.status(400).json({ success: false, message: 'From and To dates are required' });
    }
    if (new Date(toDate) < new Date(fromDate)) {
      return res.status(400).json({ success: false, message: 'To date must be on or after From date' });
    }

    const clash = await findDuplicate(Schema, { name: exact(name) });
    if (clash) {
      return res.status(400).json({ success: false, message: duplicateNameMessage(name) });
    }

    const allocations = buildAllocations(pointsAllocations);
    const tierList = buildTiers(tiers);

    if (allocations.length === 0) {
      return res.status(400).json({ success: false, message: 'Add at least one category to the points table' });
    }
    if (tierList.length === 0) {
      return res.status(400).json({ success: false, message: 'Add at least one achievement tier' });
    }

    const schema = new Schema({
      name: name.trim(),
      runBy: (runBy || '').trim(),
      fromDate,
      toDate,
      pointsAllocations: allocations,
      tiers: tierList
    });
    await schema.save();

    res.status(201).json({ success: true, message: 'Schema created successfully', data: schema });
  } catch (error) {
    console.error('Create schema error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.getAllSchemas = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { runBy: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const schemas = await Schema.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Schema.countDocuments(query);

    res.status(200).json({
      success: true,
      data: schemas,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get schemas error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getSchema = async (req, res) => {
  try {
    const schema = await Schema.findById(req.params.id);
    if (!schema) {
      return res.status(404).json({ success: false, message: 'Schema not found' });
    }
    res.status(200).json({ success: true, data: schema });
  } catch (error) {
    console.error('Get schema error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateSchema = async (req, res) => {
  try {
    const { name, runBy, fromDate, toDate, pointsAllocations, tiers } = req.body;

    const schema = await Schema.findById(req.params.id);
    if (!schema) {
      return res.status(404).json({ success: false, message: 'Schema not found' });
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ success: false, message: 'Schema name is required' });
      }
      const clash = await findDuplicate(Schema, { name: exact(name) }, schema._id);
      if (clash) {
        return res.status(400).json({ success: false, message: duplicateNameMessage(name) });
      }
      schema.name = name.trim();
    }
    if (runBy !== undefined) schema.runBy = (runBy || '').trim();
    if (fromDate !== undefined) schema.fromDate = fromDate;
    if (toDate !== undefined) schema.toDate = toDate;

    if (new Date(schema.toDate) < new Date(schema.fromDate)) {
      return res.status(400).json({ success: false, message: 'To date must be on or after From date' });
    }

    if (pointsAllocations !== undefined) {
      const allocations = buildAllocations(pointsAllocations);
      if (allocations.length === 0) {
        return res.status(400).json({ success: false, message: 'Add at least one category to the points table' });
      }
      schema.pointsAllocations = allocations;
    }
    if (tiers !== undefined) {
      const tierList = buildTiers(tiers);
      if (tierList.length === 0) {
        return res.status(400).json({ success: false, message: 'Add at least one achievement tier' });
      }
      schema.tiers = tierList;
    }

    await schema.save();

    res.status(200).json({ success: true, message: 'Schema updated successfully', data: schema });
  } catch (error) {
    console.error('Update schema error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

exports.deleteSchema = async (req, res) => {
  try {
    const schema = await Schema.findByIdAndDelete(req.params.id);
    if (!schema) {
      return res.status(404).json({ success: false, message: 'Schema not found' });
    }
    res.status(200).json({ success: true, message: 'Schema deleted successfully' });
  } catch (error) {
    console.error('Delete schema error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// --- Leaderboard (admin) -------------------------------------------------

const linkedToSalesman = (row, salesmanId) =>
  row.salesmen.some((s) => String(s._id) === String(salesmanId));

// Customer standings. Optional ?salesman=<id> narrows the list to the
// customers linked to that salesman (ranks stay global).
exports.getSchemaLeaderboard = async (req, res) => {
  try {
    const schema = await Schema.findById(req.params.id);
    if (!schema) {
      return res.status(404).json({ success: false, message: 'Schema not found' });
    }

    let rows = await buildLeaderboard(schema);

    const { salesman } = req.query;
    if (salesman) {
      rows = rows.filter((row) => linkedToSalesman(row, salesman));
    }

    res.status(200).json({
      success: true,
      data: {
        schema: {
          _id: schema._id,
          name: schema.name,
          runBy: schema.runBy,
          fromDate: schema.fromDate,
          toDate: schema.toDate,
          tiers: schema.tiers
        },
        leaderboard: rows
      }
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// --- Salesman self view (consumed by the separate salesman app) ----------

// For each running schema: the standings of the customers linked to the
// logged-in salesman (assigned to them, or sold to by them in the period).
// Points belong to customers, so the salesman sees how their customers are
// doing rather than a score of their own.
exports.getMyStatus = async (req, res) => {
  try {
    const salesmanId = String(req.user.id);
    const now = new Date();

    const schemas = await Schema.find({
      fromDate: { $lte: now },
      toDate: { $gte: now }
    }).sort({ toDate: 1 });

    const data = [];
    for (const schema of schemas) {
      const rows = await buildLeaderboard(schema);
      const customers = rows.filter((row) => linkedToSalesman(row, salesmanId));

      data.push({
        _id: schema._id,
        name: schema.name,
        runBy: schema.runBy,
        fromDate: schema.fromDate,
        toDate: schema.toDate,
        pointsAllocations: schema.pointsAllocations, // view-only incentive products
        tiers: schema.tiers,                         // view-only achievement table
        customers
      });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get my status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
