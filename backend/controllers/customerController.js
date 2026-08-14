const Customer = require('../models/Customer');
const { getIO } = require('../socket');
const { applySort } = require('../utils/listSort');

// The GST certificate is uploaded separately (POST /api/uploads), so what
// arrives here is just the stored file descriptor — keep only our own fields
const normaliseCertificate = (cert) => ({
  url: (cert?.url || '').trim(),
  key: (cert?.key || '').trim(),
  name: (cert?.name || '').trim()
});

// Create customer
exports.createCustomer = async (req, res) => {
  try {
    const { phone, name, gstin, paymentRating, assignedSalesman, gstCertificate, locationLink } = req.body;

    const customer = new Customer({
      phone,
      name,
      gstin,
      ...(paymentRating && { paymentRating }),
      assignedSalesman: assignedSalesman || null,
      gstCertificate: normaliseCertificate(gstCertificate),
      locationLink: (locationLink || '').trim()
    });

    await customer.save();

    getIO().emit('customers_updated');

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customer
    });

  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Get all customers
exports.getAllCustomers = async (req, res) => {
  try {
    const { search, isBlocked, paymentRating, sort, page = 1, limit = 10 } = req.query;
    
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

    if (paymentRating) {
      query.paymentRating = paymentRating;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const customers = await applySort(
      Customer.find(query).populate('assignedSalesman', 'name username phone'),
      sort
    )
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Customer.countDocuments(query);

    res.status(200).json({
      success: true,
      data: customers,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Get single customer
exports.getCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).populate('assignedSalesman', 'name username phone');
    
    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: customer
    });

  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Update customer
exports.updateCustomer = async (req, res) => {
  try {
    const {
      phone, name, gstin, isBlocked, paymentRating, assignedSalesman, gstCertificate, locationLink
    } = req.body;

    const updateData = {};
    if (phone !== undefined) updateData.phone = phone;
    if (name !== undefined) updateData.name = name;
    if (gstin !== undefined) updateData.gstin = gstin;
    if (isBlocked !== undefined) updateData.isBlocked = isBlocked;
    if (paymentRating !== undefined) updateData.paymentRating = paymentRating;
    if (assignedSalesman !== undefined) updateData.assignedSalesman = assignedSalesman || null;
    if (gstCertificate !== undefined) updateData.gstCertificate = normaliseCertificate(gstCertificate);
    if (locationLink !== undefined) updateData.locationLink = (locationLink || '').trim();

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    getIO().emit('customers_updated');

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: customer
    });

  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Get all customers (salesman access)
exports.getCustomersForSalesman = async (req, res) => {
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

    const customers = await Customer.find(query)
      .select('phone name gstin isBlocked')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Customer.countDocuments(query);

    res.status(200).json({
      success: true,
      data: customers,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get customers (salesman) error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single customer by ID (salesman access)
exports.getCustomerByIdForSalesman = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).select('phone name gstin');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.status(200).json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Get customer by ID (salesman) error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete customer
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);

    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    getIO().emit('customers_updated');

    res.status(200).json({
      success: true,
      message: 'Customer deleted successfully'
    });

  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

