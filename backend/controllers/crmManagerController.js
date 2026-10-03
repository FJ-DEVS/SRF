const CrmManager = require('../models/CrmManager');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { exact, findDuplicate } = require('../utils/duplicateCheck');
const { getIO } = require('../socket');
const { applySort } = require('../utils/listSort');

// Login customer relation manager
exports.loginCrmManager = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const manager = await CrmManager.findOne({ username: String(username).toLowerCase().trim() });
    if (!manager) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isPasswordValid = await manager.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      {
        id: manager._id,
        username: manager.username,
        role: 'crm',
        name: manager.name || manager.username
      },
      process.env.JWT_SECRET,
      // Same 30-day window as rollers: deleting the account still kills every
      // open session on its next request (middleware/roleAuth.js).
      { expiresIn: '30d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: manager._id,
        username: manager.username,
        name: manager.name || manager.username,
        phone: manager.phone,
        role: 'crm'
      }
    });

  } catch (error) {
    console.error('CRM manager login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Verify the caller's own session — lets an idle CRM app notice that the
// admin deleted the account
exports.verifyCrmManager = (req, res) => {
  res.status(200).json({ success: true, user: req.user });
};

// Create CRM manager (Admin only)
exports.createCrmManager = async (req, res) => {
  try {
    const { name, username, password, phone } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const existing = await findDuplicate(CrmManager, { username: exact(username) });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    const manager = new CrmManager({
      name,
      username,
      password,
      plainPassword: password,
      phone
    });

    await manager.save();

    const managerResponse = manager.toObject();
    delete managerResponse.password;

    res.status(201).json({
      success: true,
      message: 'CRM manager created successfully',
      data: managerResponse
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    console.error('Create CRM manager error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get all CRM managers (Admin only)
exports.getAllCrmManagers = async (req, res) => {
  try {
    const { search, sort, page = 1, limit = 10 } = req.query;

    let query = {};

    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const managers = await applySort(
      CrmManager.find(query).select('-password'),
      sort
    )
      .skip(skip)
      .limit(parseInt(limit));

    const total = await CrmManager.countDocuments(query);

    res.status(200).json({
      success: true,
      data: managers,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get CRM managers error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single CRM manager (Admin only)
exports.getCrmManager = async (req, res) => {
  try {
    const manager = await CrmManager.findById(req.params.id).select('-password');

    if (!manager) {
      return res.status(404).json({
        success: false,
        message: 'CRM manager not found'
      });
    }

    res.status(200).json({
      success: true,
      data: manager
    });

  } catch (error) {
    console.error('Get CRM manager error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update CRM manager (Admin only)
exports.updateCrmManager = async (req, res) => {
  try {
    const { name, username, password, phone } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (username) updateData.username = username;
    if (phone !== undefined) updateData.phone = phone;

    if (username) {
      const existing = await findDuplicate(
        CrmManager,
        { username: exact(username) },
        req.params.id
      );
      if (existing) {
        return res.status(400).json({ success: false, message: 'Username already exists' });
      }
    }
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
      updateData.plainPassword = password;
    }

    const manager = await CrmManager.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!manager) {
      return res.status(404).json({
        success: false,
        message: 'CRM manager not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'CRM manager updated successfully',
      data: manager
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    console.error('Update CRM manager error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Delete CRM manager (Admin only)
exports.deleteCrmManager = async (req, res) => {
  try {
    const manager = await CrmManager.findByIdAndDelete(req.params.id);

    if (!manager) {
      return res.status(404).json({
        success: false,
        message: 'CRM manager not found'
      });
    }

    // Their token is already dead server-side (middleware/roleAuth.js); this
    // makes an open CRM app log itself out instantly.
    getIO().emit('session_revoked', { role: 'crm', id: String(manager._id) });

    res.status(200).json({
      success: true,
      message: 'CRM manager deleted successfully'
    });

  } catch (error) {
    console.error('Delete CRM manager error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
