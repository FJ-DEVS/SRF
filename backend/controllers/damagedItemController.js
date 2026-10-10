const mongoose = require('mongoose');
const Item = require('../models/Item');
const DamagedItem = require('../models/DamagedItem');
const { getIO } = require('../socket');

// Escape user input before using it inside a regex
const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole pieces, at least one
const parsePieces = (value) => {
  const qty = Number(value);
  return Number.isInteger(qty) && qty >= 1 ? qty : null;
};

// List damaged items — only those still holding damaged pieces, most recently
// changed first. Search and category filter on the item, like the items list.
exports.getDamagedItems = async (req, res) => {
  try {
    const { search, category } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);

    const conditions = [];
    if (search) {
      conditions.push({
        $or: [
          { 'item.name': { $regex: escapeRegex(search), $options: 'i' } },
          { 'item.category': { $regex: escapeRegex(search), $options: 'i' } }
        ]
      });
    }
    if (category) conditions.push({ 'item.category': category });

    const [result] = await DamagedItem.aggregate([
      { $match: { quantity: { $gt: 0 } } },
      { $lookup: { from: Item.collection.name, localField: 'item', foreignField: '_id', as: 'item' } },
      // Rows whose item has since been deleted drop out
      { $unwind: '$item' },
      ...(conditions.length ? [{ $match: { $and: conditions } }] : []),
      { $sort: { updatedAt: -1, _id: 1 } },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                quantity: 1,
                updatedAt: 1,
                item: { _id: 1, name: 1, category: 1, price: 1, quantity: 1 }
              }
            }
          ],
          summary: [
            {
              $group: {
                _id: null,
                items: { $sum: 1 },
                pieces: { $sum: '$quantity' },
                value: { $sum: { $multiply: ['$quantity', '$item.price'] } }
              }
            }
          ]
        }
      }
    ]);

    const summary = result.summary[0] || { items: 0, pieces: 0, value: 0 };

    res.status(200).json({
      success: true,
      data: result.data,
      summary: { items: summary.items, pieces: summary.pieces, value: summary.value },
      pagination: {
        total: summary.items,
        page,
        pages: Math.ceil(summary.items / limit)
      }
    });
  } catch (error) {
    console.error('Get damaged items error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Mark pieces of an item as damaged: they come off its stock and onto its
// damaged count, both in one transaction.
exports.markDamaged = async (req, res) => {
  const { item: itemId } = req.body;
  const qty = parsePieces(req.body.quantity);
  if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ success: false, message: 'Select the item that is damaged' });
  }
  if (!qty) {
    return res.status(400).json({ success: false, message: 'Damaged quantity must be a whole number of at least 1' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const item = await Item.findOneAndUpdate(
      { _id: itemId, quantity: { $gte: qty } },
      { $inc: { quantity: -qty } },
      { new: true, session }
    );
    if (!item) {
      const existing = await Item.findById(itemId).session(session);
      await session.abortTransaction();
      return existing
        ? res.status(400).json({
            success: false,
            message: `Only ${existing.quantity} of "${existing.name}" in stock — cannot mark ${qty} as damaged`
          })
        : res.status(404).json({ success: false, message: 'Item not found' });
    }

    const damaged = await DamagedItem.findOneAndUpdate(
      { item: item._id },
      { $inc: { quantity: qty } },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );

    await session.commitTransaction();
    getIO().emit('items_updated');

    res.status(200).json({
      success: true,
      message: `${qty} of "${item.name}" marked as damaged`,
      data: { item, damaged }
    });
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    console.error('Mark damaged error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  } finally {
    session.endSession();
  }
};

// Put damaged pieces back into stock — for pieces marked damaged by mistake
// or repaired since.
exports.restoreDamaged = async (req, res) => {
  const qty = parsePieces(req.body.quantity);
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, message: 'Damaged item not found' });
  }
  if (!qty) {
    return res.status(400).json({ success: false, message: 'Quantity to restore must be a whole number of at least 1' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const damaged = await DamagedItem.findOneAndUpdate(
      { _id: req.params.id, quantity: { $gte: qty } },
      { $inc: { quantity: -qty } },
      { new: true, session }
    );
    if (!damaged) {
      const existing = await DamagedItem.findById(req.params.id).session(session);
      await session.abortTransaction();
      return existing
        ? res.status(400).json({
            success: false,
            message: `Only ${existing.quantity} damaged piece${existing.quantity === 1 ? '' : 's'} to restore`
          })
        : res.status(404).json({ success: false, message: 'Damaged item not found' });
    }

    const item = await Item.findByIdAndUpdate(
      damaged.item,
      { $inc: { quantity: qty } },
      { new: true, session }
    );
    if (!item) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'The item behind these damaged pieces no longer exists' });
    }

    await session.commitTransaction();
    getIO().emit('items_updated');

    res.status(200).json({
      success: true,
      message: `${qty} of "${item.name}" restored to stock`,
      data: { item, damaged }
    });
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    console.error('Restore damaged error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  } finally {
    session.endSession();
  }
};
