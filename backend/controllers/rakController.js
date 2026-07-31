const Rak = require('../models/Rak');
const Placement = require('../models/Placement');
const { getIO } = require('../socket');
const { applySort } = require('../utils/listSort');
const { usageByRak, freeSpace } = require('../utils/placementMath');

// Escape user input before using it inside a regex
const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const duplicateCodeMessage = (code) => `Rak code "${code}" is already in use`;

const parseCapacity = (value) => {
  const capacity = parseInt(value, 10);
  return Number.isNaN(capacity) ? null : capacity;
};

// Create rak
exports.createRak = async (req, res) => {
  try {
    const { name, code } = req.body;
    const capacity = parseCapacity(req.body.capacity);

    if (capacity === null || capacity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Rak space must be a number of at least 1'
      });
    }

    const rak = new Rak({ name, code, capacity });
    await rak.save();

    getIO().emit('raks_updated');

    res.status(201).json({
      success: true,
      message: 'Rak created successfully',
      data: rak
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: duplicateCodeMessage(String(req.body.code || '').toUpperCase())
      });
    }
    console.error('Create rak error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get all raks, each annotated with how full it is.
// ?status=space|full|empty filters on current occupancy.
exports.getAllRaks = async (req, res) => {
  try {
    const { search, status, sort, page = 1, limit = 10 } = req.query;

    const query = {};

    if (search) {
      const regex = { $regex: escapeRegex(search), $options: 'i' };
      query.$or = [{ name: regex }, { code: regex }];
    }

    // Occupancy filters need the usage totals before paging, so resolve the
    // matching ids first and narrow the query with them
    if (['space', 'full', 'empty'].includes(status)) {
      const used = await usageByRak();
      const all = await Rak.find(query).select('_id capacity').lean();
      const matching = all.filter((rak) => {
        const usedQty = used.get(String(rak._id)) || 0;
        if (status === 'empty') return usedQty === 0;
        if (status === 'full') return freeSpace(rak, usedQty) === 0;
        return freeSpace(rak, usedQty) > 0;
      });
      query._id = { $in: matching.map((r) => r._id) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const raks = await applySort(Rak.find(query), sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Rak.countDocuments(query);

    // Attach what each rak is currently holding
    const rakIds = raks.map((r) => r._id);
    const placements = await Placement.find({ rak: { $in: rakIds } })
      .populate('item', 'name category price quantity')
      .sort({ createdAt: 1 });

    const byRak = new Map();
    placements.forEach((p) => {
      const key = String(p.rak);
      if (!byRak.has(key)) byRak.set(key, []);
      byRak.get(key).push({
        _id: p._id,
        item: p.item,
        quantity: p.quantity,
        placedByName: p.placedByName,
        createdAt: p.createdAt
      });
    });

    const data = raks.map((rak) => {
      const rakPlacements = byRak.get(String(rak._id)) || [];
      const usedQty = rakPlacements.reduce((sum, p) => sum + (p.quantity || 0), 0);
      return {
        ...rak.toObject(),
        placements: rakPlacements,
        usedQty,
        freeQty: freeSpace(rak, usedQty)
      };
    });

    res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get raks error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single rak
exports.getRak = async (req, res) => {
  try {
    const rak = await Rak.findById(req.params.id);

    if (!rak) {
      return res.status(404).json({
        success: false,
        message: 'Rak not found'
      });
    }

    res.status(200).json({
      success: true,
      data: rak
    });

  } catch (error) {
    console.error('Get rak error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update rak
exports.updateRak = async (req, res) => {
  try {
    const { name, code } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;

    if (req.body.capacity !== undefined) {
      const capacity = parseCapacity(req.body.capacity);
      if (capacity === null || capacity < 1) {
        return res.status(400).json({
          success: false,
          message: 'Rak space must be a number of at least 1'
        });
      }

      // Shrinking below what is already in the rak would leave it over-filled
      const used = (await usageByRak([req.params.id])).get(String(req.params.id)) || 0;
      if (capacity < used) {
        return res.status(400).json({
          success: false,
          message: `This rak already holds ${used}. Remove some stock before reducing its space to ${capacity}.`
        });
      }

      updateData.capacity = capacity;
    }

    const rak = await Rak.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!rak) {
      return res.status(404).json({
        success: false,
        message: 'Rak not found'
      });
    }

    getIO().emit('raks_updated');

    res.status(200).json({
      success: true,
      message: 'Rak updated successfully',
      data: rak
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: duplicateCodeMessage(String(req.body.code || '').toUpperCase())
      });
    }
    console.error('Update rak error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Delete rak — refuse while stock is still sitting in it
exports.deleteRak = async (req, res) => {
  try {
    const placements = await Placement.find({ rak: req.params.id }).populate('item', 'name');
    if (placements.length) {
      const names = placements.map((p) => p.item?.name).filter(Boolean);
      return res.status(400).json({
        success: false,
        message: `This rak still holds ${names.length ? `"${names.join('", "')}"` : 'stock'}. Remove the placements first.`
      });
    }

    const rak = await Rak.findByIdAndDelete(req.params.id);

    if (!rak) {
      return res.status(404).json({
        success: false,
        message: 'Rak not found'
      });
    }

    getIO().emit('raks_updated');

    res.status(200).json({
      success: true,
      message: 'Rak deleted successfully'
    });

  } catch (error) {
    console.error('Delete rak error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
