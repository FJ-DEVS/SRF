const Cargo = require('../models/Cargo');
const { getIO } = require('../socket');
const { applySort } = require('../utils/listSort');
const { exact, findDuplicate } = require('../utils/duplicateCheck');

const duplicateNameMessage = (name) => `A cargo named "${String(name).trim()}" already exists`;

// Create cargo
exports.createCargo = async (req, res) => {
  try {
    const { name } = req.body;

    if (name && String(name).trim()) {
      const clash = await findDuplicate(Cargo, { name: exact(name) });
      if (clash) {
        return res.status(400).json({ success: false, message: duplicateNameMessage(name) });
      }
    }

    const cargo = new Cargo({ name });
    await cargo.save();

    getIO().emit('cargo_updated');

    res.status(201).json({
      success: true,
      message: 'Cargo created successfully',
      data: cargo
    });

  } catch (error) {
    console.error('Create cargo error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Get all cargo
exports.getAllCargo = async (req, res) => {
  try {
    const { search, sort, page = 1, limit = 10 } = req.query;

    let query = {};

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const cargo = await applySort(Cargo.find(query), sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Cargo.countDocuments(query);

    res.status(200).json({
      success: true,
      data: cargo,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get cargo error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Get single cargo
exports.getCargo = async (req, res) => {
  try {
    const cargo = await Cargo.findById(req.params.id);
    
    if (!cargo) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cargo not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: cargo
    });

  } catch (error) {
    console.error('Get cargo error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Update cargo
exports.updateCargo = async (req, res) => {
  try {
    const { name } = req.body;

    if (name !== undefined && String(name).trim()) {
      const clash = await findDuplicate(Cargo, { name: exact(name) }, req.params.id);
      if (clash) {
        return res.status(400).json({ success: false, message: duplicateNameMessage(name) });
      }
    }

    const cargo = await Cargo.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true, runValidators: true }
    );

    if (!cargo) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cargo not found' 
      });
    }

    getIO().emit('cargo_updated');

    res.status(200).json({
      success: true,
      message: 'Cargo updated successfully',
      data: cargo
    });

  } catch (error) {
    console.error('Update cargo error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Get all cargo (salesman access)
exports.getCargoListForSalesman = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    let query = {};

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const cargo = await Cargo.find(query)
      .select('name')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Cargo.countDocuments(query);

    res.status(200).json({
      success: true,
      data: cargo,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get cargo (salesman) error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single cargo by ID (salesman access)
exports.getCargoByIdForSalesman = async (req, res) => {
  try {
    const cargo = await Cargo.findById(req.params.id).select('name');

    if (!cargo) {
      return res.status(404).json({
        success: false,
        message: 'Cargo not found'
      });
    }

    res.status(200).json({
      success: true,
      data: cargo
    });
  } catch (error) {
    console.error('Get cargo by ID (salesman) error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete cargo
exports.deleteCargo = async (req, res) => {
  try {
    const cargo = await Cargo.findByIdAndDelete(req.params.id);

    if (!cargo) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cargo not found' 
      });
    }

    getIO().emit('cargo_updated');

    res.status(200).json({
      success: true,
      message: 'Cargo deleted successfully'
    });

  } catch (error) {
    console.error('Delete cargo error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

