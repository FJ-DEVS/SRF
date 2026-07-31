const Vendor = require('../models/Vendor');
const { getIO } = require('../socket');
const { applySort } = require('../utils/listSort');

// Create vendor
exports.createVendor = async (req, res) => {
  try {
    const { phone, name, gstin } = req.body;

    const vendor = new Vendor({
      phone,
      name,
      gstin
    });

    await vendor.save();

    getIO().emit('vendors_updated');

    res.status(201).json({
      success: true,
      message: 'Vendor created successfully',
      data: vendor
    });

  } catch (error) {
    console.error('Create vendor error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Get all vendors
exports.getAllVendors = async (req, res) => {
  try {
    const { search, isBlocked, sort, page = 1, limit = 10 } = req.query;
    
    let query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } }
      ];
    }

    if (isBlocked !== undefined) {
      query.isBlocked = isBlocked === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const vendors = await applySort(Vendor.find(query), sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Vendor.countDocuments(query);

    res.status(200).json({
      success: true,
      data: vendors,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get vendors error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Get single vendor
exports.getVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    
    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        message: 'Vendor not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: vendor
    });

  } catch (error) {
    console.error('Get vendor error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Update vendor
exports.updateVendor = async (req, res) => {
  try {
    const { phone, name, gstin, isBlocked } = req.body;
    
    const updateData = {};
    if (phone !== undefined) updateData.phone = phone;
    if (name !== undefined) updateData.name = name;
    if (gstin !== undefined) updateData.gstin = gstin;
    if (isBlocked !== undefined) updateData.isBlocked = isBlocked;

    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        message: 'Vendor not found' 
      });
    }

    getIO().emit('vendors_updated');

    res.status(200).json({
      success: true,
      message: 'Vendor updated successfully',
      data: vendor
    });

  } catch (error) {
    console.error('Update vendor error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Get all vendors (salesman access)
exports.getVendorsForSalesman = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const vendors = await Vendor.find(query)
      .select('phone name gstin')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Vendor.countDocuments(query);

    res.status(200).json({
      success: true,
      data: vendors,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get vendors (salesman) error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single vendor by ID (salesman access)
exports.getVendorByIdForSalesman = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id).select('phone name gstin');

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found'
      });
    }

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    console.error('Get vendor by ID (salesman) error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete vendor
exports.deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);

    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        message: 'Vendor not found' 
      });
    }

    getIO().emit('vendors_updated');

    res.status(200).json({
      success: true,
      message: 'Vendor deleted successfully'
    });

  } catch (error) {
    console.error('Delete vendor error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

