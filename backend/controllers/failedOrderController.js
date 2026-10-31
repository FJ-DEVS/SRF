const mongoose = require('mongoose');
const FailedOrder = require('../models/FailedOrder');
const { getIO } = require('../socket');

// Escape user input before using it inside a regex
const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Search matches the customer, who tried it, or any item on it
const searchQuery = (search) => {
  if (!search || !String(search).trim()) return {};
  const pattern = { $regex: escapeRegex(String(search).trim()), $options: 'i' };
  return { $or: [{ customerName: pattern }, { createdByName: pattern }, { 'items.name': pattern }] };
};

// Sell orders turned away for want of stock, newest first (Admin only)
exports.getFailedOrders = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const query = searchQuery(search);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [failedOrders, total] = await Promise.all([
      FailedOrder.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      FailedOrder.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: failedOrders,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get failed orders error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// The items those orders ran short of: how often, by how many pieces in all,
// when last, and what is in stock now — most pieces short first (Admin only)
exports.getShortageSummary = async (req, res) => {
  try {
    const summary = await FailedOrder.aggregate([
      { $match: searchQuery(req.query.search) },
      { $sort: { createdAt: -1 } },
      { $unwind: '$items' },
      { $match: { 'items.short': { $gt: 0 } } },
      {
        $group: {
          _id: '$items.item',
          name: { $first: '$items.name' },
          attempts: { $sum: 1 },
          totalShort: { $sum: '$items.short' },
          totalRequested: { $sum: '$items.requested' },
          lastTried: { $max: '$createdAt' }
        }
      },
      { $lookup: { from: 'items', localField: '_id', foreignField: '_id', as: 'current' } },
      {
        $project: {
          _id: 0,
          item: '$_id',
          // The live name when the item still exists
          name: { $ifNull: [{ $arrayElemAt: ['$current.name', 0] }, '$name'] },
          attempts: 1,
          totalShort: 1,
          totalRequested: 1,
          lastTried: 1,
          inStock: { $ifNull: [{ $arrayElemAt: ['$current.quantity', 0] }, null] }
        }
      },
      { $sort: { totalShort: -1, lastTried: -1 } }
    ]);

    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error('Get shortage summary error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Take one attempt off the list (Admin only)
exports.deleteFailedOrder = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Failed order not found' });
    }
    const failedOrder = await FailedOrder.findByIdAndDelete(req.params.id);
    if (!failedOrder) {
      return res.status(404).json({ success: false, message: 'Failed order not found' });
    }

    getIO().emit('failed_orders_updated');

    res.status(200).json({ success: true, message: 'Removed from failed orders' });
  } catch (error) {
    console.error('Delete failed order error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
