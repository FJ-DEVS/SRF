const mongoose = require('mongoose');
const Item = require('../models/Item');
const Order = require('../models/Order');
const { getIO } = require('../socket');
const { applySort } = require('../utils/listSort');
const { parseCheckLevel, categoryCheckLevels, decorateCheckLevel, belowCheckLevelQuery } =
  require('../utils/checkLevel');

// Escape user input before using it inside a regex
const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Create item
exports.createItem = async (req, res) => {
  try {
    const { name, price, quantity, category, checkLevel } = req.body;

    const item = new Item({
      name,
      price,
      quantity,
      category,
      checkLevel: parseCheckLevel(checkLevel) ?? null
    });

    await item.save();

    getIO().emit('items_updated');

    res.status(201).json({
      success: true,
      message: 'Item created successfully',
      data: item
    });

  } catch (error) {
    console.error('Create item error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Get all items
exports.getAllItems = async (req, res) => {
  try {
    const { search, category, sort, stockState, page = 1, limit = 10 } = req.query;

    const conditions = [];

    if (search) {
      conditions.push({
        $or: [
          { name: { $regex: escapeRegex(search), $options: 'i' } },
          { category: { $regex: escapeRegex(search), $options: 'i' } }
        ]
      });
    }

    // Category filter — strictly the category field. It used to fall back to a
    // name match for items that carried the size in their name, but that made
    // "2mm" pull in "0.72mm" and "1.2mm". Every item now stores its category.
    if (category) {
      conditions.push({ category });
    }

    // Stock health filter — "below" / "above" the effective check level
    const levelsByCategory = await categoryCheckLevels();
    if (stockState === 'below' || stockState === 'above') {
      const below = belowCheckLevelQuery(levelsByCategory);
      conditions.push(stockState === 'below' ? below : { $nor: [below] });
    }

    const query = conditions.length ? { $and: conditions } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const items = await applySort(Item.find(query).lean(), sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Item.countDocuments(query);

    res.status(200).json({
      success: true,
      data: items.map((item) => decorateCheckLevel(item, levelsByCategory)),
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Get single item
exports.getItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ 
        success: false, 
        message: 'Item not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: item
    });

  } catch (error) {
    console.error('Get item error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Update item
exports.updateItem = async (req, res) => {
  try {
    const { name, price, quantity, category, checkLevel } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (price !== undefined) updateData.price = price;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (category !== undefined) updateData.category = category;
    const parsedCheckLevel = parseCheckLevel(checkLevel);
    if (parsedCheckLevel !== undefined) updateData.checkLevel = parsedCheckLevel;

    const item = await Item.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({ 
        success: false, 
        message: 'Item not found' 
      });
    }

    getIO().emit('items_updated');

    res.status(200).json({
      success: true,
      message: 'Item updated successfully',
      data: item
    });

  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Get all items (salesman / roller access)
exports.getItemsForSalesman = async (req, res) => {
  try {
    const { search, category, sort, page = 1, limit = 10 } = req.query;

    const conditions = [];

    if (search) {
      conditions.push({
        $or: [
          { name: { $regex: escapeRegex(search), $options: 'i' } },
          { category: { $regex: escapeRegex(search), $options: 'i' } }
        ]
      });
    }

    if (category) {
      conditions.push({ category });
    }

    const query = conditions.length ? { $and: conditions } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const levelsByCategory = await categoryCheckLevels();

    const items = await applySort(
      Item.find(query).select('name price quantity category checkLevel createdAt').lean(),
      sort
    )
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Item.countDocuments(query);

    res.status(200).json({
      success: true,
      data: items.map((item) => decorateCheckLevel(item, levelsByCategory)),
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get items (salesman) error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single item by ID (salesman access)
exports.getItemByIdForSalesman = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id).select('name price quantity');

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    res.status(200).json({
      success: true,
      data: item
    });

  } catch (error) {
    console.error('Get item by ID (salesman) error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get purchase/sales statistics for a single item (Admin)
exports.getItemStats = async (req, res) => {
  try {
    const itemId = new mongoose.Types.ObjectId(req.params.id);

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // One row per order containing this item
    const rows = await Order.aggregate([
      { $match: { 'items.item': itemId } },
      { $unwind: '$items' },
      { $match: { 'items.item': itemId } },
      {
        $project: {
          type: 1,
          status: 1,
          createdAt: 1,
          quantity: '$items.quantity'
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    const purchases = rows.filter((r) => r.type === 'purchase order');
    const completedPurchases = purchases.filter((r) => r.status === 'completed');
    const sales = rows.filter(
      (r) => r.type === 'sell order' && !['cancelled', 'cancellation_requested'].includes(r.status)
    );

    const sum = (arr) => arr.reduce((acc, r) => acc + (r.quantity || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        totalPurchased: sum(completedPurchases),
        pendingPurchase: sum(purchases.filter((r) => r.status === 'pending')),
        purchaseOrders: purchases.length,
        totalSold: sum(sales),
        sellOrders: sales.length,
        lastPurchase: purchases[0]
          ? { date: purchases[0].createdAt, quantity: purchases[0].quantity, status: purchases[0].status }
          : null,
        lastSold: sales[0]
          ? { date: sales[0].createdAt, quantity: sales[0].quantity, status: sales[0].status }
          : null,
        recentActivity: rows.slice(0, 6).map((r) => ({
          orderId: r._id,
          type: r.type,
          status: r.status,
          quantity: r.quantity,
          date: r.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Get item stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Bulk increase price for all items in a category
exports.bulkUpdatePriceByCategory = async (req, res) => {
  try {
    const { category, amount } = req.body;

    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ success: false, message: 'category is required' });
    }
    const increase = parseFloat(amount);
    if (isNaN(increase) || increase === 0) {
      return res.status(400).json({ success: false, message: 'amount must be a non-zero number' });
    }

    const result = await Item.updateMany(
      { category: category.trim() },
      { $inc: { price: increase } }
    );

    getIO().emit('items_updated');

    res.status(200).json({
      success: true,
      message: `Price updated for ${result.modifiedCount} item(s) in category "${category}"`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk price update error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Bulk import items from Excel — rows with an ID update the matching item,
// rows without one create a new item
exports.bulkImportItems = async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'items array is required' });
    }

    let created = 0;
    let updated = 0;
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const row = items[i] || {};
      const rowLabel = row.name ? row.name : `Row ${i + 1}`;
      const price = row.price !== undefined && row.price !== '' ? parseFloat(row.price) : undefined;
      const quantity = row.quantity !== undefined && row.quantity !== '' ? parseInt(row.quantity, 10) : undefined;
      const checkLevel = parseCheckLevel(row.checkLevel);

      try {
        if (row._id) {
          const updateData = {};
          if (row.name !== undefined && String(row.name).trim() !== '') updateData.name = String(row.name).trim();
          if (price !== undefined && !isNaN(price)) updateData.price = price;
          if (quantity !== undefined && !isNaN(quantity)) updateData.quantity = quantity;
          if (row.category !== undefined) updateData.category = String(row.category).trim();
          if (checkLevel !== undefined) updateData.checkLevel = checkLevel;

          const item = await Item.findByIdAndUpdate(row._id, updateData, { new: true, runValidators: true });
          if (!item) {
            errors.push(`${rowLabel}: no item found for ID ${row._id}`);
            continue;
          }
          updated++;
        } else {
          if (!row.name || !String(row.name).trim()) {
            errors.push(`${rowLabel}: name is required`);
            continue;
          }
          const item = new Item({
            name: String(row.name).trim(),
            price,
            quantity,
            category: row.category ? String(row.category).trim() : '',
            checkLevel: checkLevel ?? null
          });
          await item.save();
          created++;
        }
      } catch (rowError) {
        errors.push(`${rowLabel}: ${rowError.message}`);
      }
    }

    if (created + updated > 0) getIO().emit('items_updated');

    res.status(200).json({
      success: true,
      message: `Import complete: ${created} created, ${updated} updated${errors.length ? `, ${errors.length} failed` : ''}`,
      created,
      updated,
      errors
    });

  } catch (error) {
    console.error('Bulk import items error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Delete item
exports.deleteItem = async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({ 
        success: false, 
        message: 'Item not found' 
      });
    }

    getIO().emit('items_updated');

    res.status(200).json({
      success: true,
      message: 'Item deleted successfully'
    });

  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

