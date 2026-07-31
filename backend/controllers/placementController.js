const mongoose = require('mongoose');
const Placement = require('../models/Placement');
const Rak = require('../models/Rak');
const Item = require('../models/Item');
const { getIO } = require('../socket');
const { usageByRak, remainingForItem, freeSpace } = require('../utils/placementMath');

// Escape user input before using it inside a regex
const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PLACEMENT_SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 }
};

// Who is doing the placing — used for the audit columns
const actorFor = (user) => ({
  placedBy: user.role === 'roller' ? user.id : null,
  placedByName: user.role === 'roller' ? (user.name || user.username) : 'Admin'
});

// List placements (admin + roller). Optional ?item= narrows to one item.
exports.getAllPlacements = async (req, res) => {
  try {
    const { search, item, rak, sort, page = 1, limit = 10 } = req.query;

    const conditions = [];

    if (item && mongoose.Types.ObjectId.isValid(item)) {
      conditions.push({ item: new mongoose.Types.ObjectId(item) });
    }
    if (rak && mongoose.Types.ObjectId.isValid(rak)) {
      conditions.push({ rak: new mongoose.Types.ObjectId(rak) });
    }

    if (search && search.trim()) {
      const regex = { $regex: escapeRegex(search.trim()), $options: 'i' };
      const [itemIds, rakIds] = await Promise.all([
        Item.find({ name: regex }).select('_id').lean(),
        Rak.find({ $or: [{ name: regex }, { code: regex }] }).select('_id').lean()
      ]);
      conditions.push({
        $or: [
          { item: { $in: itemIds.map((d) => d._id) } },
          { rak: { $in: rakIds.map((d) => d._id) } }
        ]
      });
    }

    const query = conditions.length ? { $and: conditions } : {};
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 500);
    const skip = (pageNum - 1) * limitNum;

    const placements = await Placement.find(query)
      .populate('item', 'name category price quantity')
      .populate('rak', 'name code capacity')
      .sort(PLACEMENT_SORTS[sort] || PLACEMENT_SORTS.newest)
      .skip(skip)
      .limit(limitNum);

    const total = await Placement.countDocuments(query);

    res.status(200).json({
      success: true,
      data: placements,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Get placements error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Items that still have stock waiting to go onto a rak.
// Anything fully placed drops out of the list.
exports.getItemsToPlace = async (req, res) => {
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
      conditions.push({
        $or: [
          { category },
          { name: { $regex: escapeRegex(category), $options: 'i' } }
        ]
      });
    }

    const match = conditions.length ? { $and: conditions } : {};
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 500);
    const skip = (pageNum - 1) * limitNum;

    const sortStage = {
      name_asc: { name: 1 },
      name_desc: { name: -1 },
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      qty_desc: { remainingQty: -1 },
      qty_asc: { remainingQty: 1 }
    }[sort] || { name: 1 };

    const [result] = await Item.aggregate([
      { $match: match },
      { $lookup: { from: 'placements', localField: '_id', foreignField: 'item', as: 'placements' } },
      { $addFields: { placedQty: { $sum: '$placements.quantity' } } },
      {
        $addFields: {
          // Stock can drop below what is already placed once orders ship,
          // so clamp at zero rather than showing a negative backlog
          remainingQty: {
            $max: [{ $subtract: [{ $ifNull: ['$quantity', 0] }, '$placedQty'] }, 0]
          }
        }
      },
      { $match: { remainingQty: { $gt: 0 } } },
      {
        $facet: {
          data: [
            { $sort: sortStage },
            { $skip: skip },
            { $limit: limitNum },
            {
              $project: {
                name: 1, category: 1, price: 1,
                quantity: 1, placedQty: 1, remainingQty: 1
              }
            }
          ],
          meta: [{ $count: 'total' }]
        }
      }
    ]).collation({ locale: 'en', strength: 2 });

    const total = result.meta[0]?.total || 0;

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Get items to place error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Place stock of one item into one or more raks.
// Body: { item, rak | raks: [...], quantity? }
//
// Quantity is capped twice — by what is left of the item's stock, and by the
// free space in each rak. Raks are filled in the order they were given and
// whatever does not fit stays unplaced.
exports.createPlacement = async (req, res) => {
  try {
    const { item, rak } = req.body;
    const rakIds = Array.isArray(req.body.raks) ? req.body.raks : (rak ? [rak] : []);

    if (!item || !mongoose.Types.ObjectId.isValid(item)) {
      return res.status(400).json({ success: false, message: 'A valid item is required' });
    }
    if (rakIds.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one rak is required' });
    }

    const itemDoc = await Item.findById(item).select('name quantity');
    if (!itemDoc) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const validIds = rakIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const rakDocs = await Rak.find({ _id: { $in: validIds } });
    if (rakDocs.length !== rakIds.length) {
      return res.status(404).json({ success: false, message: 'One or more raks were not found' });
    }
    // Preserve the order the caller asked for
    const byId = new Map(rakDocs.map((r) => [String(r._id), r]));
    const ordered = validIds.map((id) => byId.get(String(id))).filter(Boolean);

    const remaining = await remainingForItem(itemDoc);
    if (remaining <= 0) {
      return res.status(400).json({
        success: false,
        message: `All ${itemDoc.quantity || 0} of "${itemDoc.name}" is already placed`
      });
    }

    const asked = req.body.quantity !== undefined ? parseInt(req.body.quantity, 10) : remaining;
    if (Number.isNaN(asked) || asked < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }

    let left = Math.min(asked, remaining);
    const requested = left;

    const used = await usageByRak(ordered.map((r) => r._id));
    const existing = await Placement.find({ item: itemDoc._id, rak: { $in: ordered.map((r) => r._id) } });
    const existingByRak = new Map(existing.map((p) => [String(p.rak), p]));

    const actor = actorFor(req.user);
    const filled = [];

    for (const target of ordered) {
      if (left <= 0) break;

      const space = freeSpace(target, used.get(String(target._id)) || 0);
      const take = Math.min(space, left);
      if (take <= 0) continue;

      const current = existingByRak.get(String(target._id));
      if (current) {
        current.quantity += take;
        Object.assign(current, actor);
        await current.save();
      } else {
        await Placement.create({ item: itemDoc._id, rak: target._id, quantity: take, ...actor });
      }

      filled.push({ code: target.code, quantity: take });
      left -= take;
    }

    if (filled.length === 0) {
      return res.status(400).json({
        success: false,
        message: ordered.length === 1
          ? `Rak ${ordered[0].code} is full`
          : 'None of the selected raks have any space left'
      });
    }

    const placed = requested - left;
    const stillLeft = remaining - placed;
    // Anything left in `left` means the raks filled up; a shortfall beyond that
    // is simply the caller asking for less than the whole remaining stock
    const ranOutOfSpace = left > 0;

    const where = filled.map((f) => `${f.code} (${f.quantity})`).join(', ');
    let message = `Placed ${placed} of "${itemDoc.name}" into ${where}`;
    if (stillLeft > 0) {
      message += ranOutOfSpace
        ? ` — ${stillLeft} still to place, ${filled.length > 1 ? 'those raks are' : 'that rak is'} full`
        : ` — ${stillLeft} still to place`;
    }

    getIO().emit('placements_updated');

    res.status(201).json({
      success: true,
      message,
      data: { placed, requested, remaining: stillLeft, ranOutOfSpace, filled }
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'That rak was just updated by someone else. Refresh and try again.'
      });
    }
    console.error('Create placement error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Adjust a placement — change its quantity and/or move it to another rak
exports.updatePlacement = async (req, res) => {
  try {
    const placement = await Placement.findById(req.params.id).populate('item', 'name quantity');
    if (!placement) {
      return res.status(404).json({ success: false, message: 'Placement not found' });
    }

    const { rak } = req.body;
    let targetRak = await Rak.findById(placement.rak);

    if (rak !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(rak)) {
        return res.status(400).json({ success: false, message: 'A valid rak is required' });
      }
      targetRak = await Rak.findById(rak);
      if (!targetRak) {
        return res.status(404).json({ success: false, message: 'Rak not found' });
      }
      const clash = await Placement.findOne({
        item: placement.item._id,
        rak: targetRak._id,
        _id: { $ne: placement._id }
      });
      if (clash) {
        return res.status(400).json({
          success: false,
          message: `"${placement.item.name}" is already in rak ${targetRak.code}`
        });
      }
    }

    let quantity = placement.quantity;
    if (req.body.quantity !== undefined) {
      quantity = parseInt(req.body.quantity, 10);
      if (Number.isNaN(quantity) || quantity < 1) {
        return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
      }

      // What is free for this item, ignoring the quantity this row already claims
      const headroom = await remainingForItem(placement.item) + placement.quantity;
      if (quantity > headroom) {
        return res.status(400).json({
          success: false,
          message: `Only ${headroom} of "${placement.item.name}" is available to place`
        });
      }
    }

    // Space in the destination, ignoring this placement's own contribution
    const usedThere = (await usageByRak([targetRak._id])).get(String(targetRak._id)) || 0;
    const ownShare = String(placement.rak) === String(targetRak._id) ? placement.quantity : 0;
    const space = freeSpace(targetRak, usedThere - ownShare);

    if (quantity > space) {
      return res.status(400).json({
        success: false,
        message: `Rak ${targetRak.code} only has space for ${space}`
      });
    }

    placement.rak = targetRak._id;
    placement.quantity = quantity;
    Object.assign(placement, actorFor(req.user));
    await placement.save();

    await placement.populate([
      { path: 'item', select: 'name category price quantity' },
      { path: 'rak', select: 'name code capacity' }
    ]);

    getIO().emit('placements_updated');

    res.status(200).json({
      success: true,
      message: 'Placement updated successfully',
      data: placement
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'That rak was just updated by someone else. Refresh and try again.'
      });
    }
    console.error('Update placement error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Remove a placement — frees that space in the rak again
exports.deletePlacement = async (req, res) => {
  try {
    const placement = await Placement.findByIdAndDelete(req.params.id);

    if (!placement) {
      return res.status(404).json({ success: false, message: 'Placement not found' });
    }

    getIO().emit('placements_updated');

    res.status(200).json({
      success: true,
      message: 'Placement removed successfully'
    });

  } catch (error) {
    console.error('Delete placement error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Rak codes and quantities grouped per item
exports.getPlacementSummary = async (req, res) => {
  try {
    const rows = await Placement.aggregate([
      { $lookup: { from: 'raks', localField: 'rak', foreignField: '_id', as: 'rakDoc' } },
      { $unwind: { path: '$rakDoc', preserveNullAndEmptyArrays: true } },
      { $sort: { 'rakDoc.code': 1 } },
      {
        $group: {
          _id: '$item',
          count: { $sum: 1 },
          placedQty: { $sum: '$quantity' },
          raks: {
            $push: {
              placementId: '$_id',
              rakId: '$rakDoc._id',
              code: '$rakDoc.code',
              name: '$rakDoc.name',
              quantity: '$quantity'
            }
          }
        }
      },
      { $project: { _id: 0, itemId: '$_id', count: 1, placedQty: 1, raks: 1 } }
    ]);

    res.status(200).json({ success: true, data: rows });

  } catch (error) {
    console.error('Get placement summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
