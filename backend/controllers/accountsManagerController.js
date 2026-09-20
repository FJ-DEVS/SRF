const AccountsManager = require('../models/AccountsManager');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { exact, findDuplicate } = require('../utils/duplicateCheck');
const { getIO } = require('../socket');
const { applySort } = require('../utils/listSort');

// Login accounts manager
exports.loginAccountsManager = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const manager = await AccountsManager.findOne({ username: String(username).toLowerCase().trim() });
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
        role: 'accounts',
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
        role: 'accounts'
      }
    });

  } catch (error) {
    console.error('Accounts manager login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Verify the caller's own session — lets an idle accounts app notice that the
// admin deleted the account
exports.verifyAccountsManager = (req, res) => {
  res.status(200).json({ success: true, user: req.user });
};

// Create accounts manager (Admin only)
exports.createAccountsManager = async (req, res) => {
  try {
    const { name, username, password, phone } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const existing = await findDuplicate(AccountsManager, { username: exact(username) });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    const manager = new AccountsManager({
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
      message: 'Accounts manager created successfully',
      data: managerResponse
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    console.error('Create accounts manager error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get all accounts managers (Admin only)
exports.getAllAccountsManagers = async (req, res) => {
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
      AccountsManager.find(query).select('-password'),
      sort
    )
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AccountsManager.countDocuments(query);

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
    console.error('Get accounts managers error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single accounts manager (Admin only)
exports.getAccountsManager = async (req, res) => {
  try {
    const manager = await AccountsManager.findById(req.params.id).select('-password');

    if (!manager) {
      return res.status(404).json({
        success: false,
        message: 'Accounts manager not found'
      });
    }

    res.status(200).json({
      success: true,
      data: manager
    });

  } catch (error) {
    console.error('Get accounts manager error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update accounts manager (Admin only)
exports.updateAccountsManager = async (req, res) => {
  try {
    const { name, username, password, phone } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (username) updateData.username = username;
    if (phone !== undefined) updateData.phone = phone;

    if (username) {
      const existing = await findDuplicate(
        AccountsManager,
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

    const manager = await AccountsManager.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!manager) {
      return res.status(404).json({
        success: false,
        message: 'Accounts manager not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Accounts manager updated successfully',
      data: manager
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    console.error('Update accounts manager error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Delete accounts manager (Admin only)
exports.deleteAccountsManager = async (req, res) => {
  try {
    const manager = await AccountsManager.findByIdAndDelete(req.params.id);

    if (!manager) {
      return res.status(404).json({
        success: false,
        message: 'Accounts manager not found'
      });
    }

    // Their token is already dead server-side (middleware/roleAuth.js); this
    // makes an open accounts app log itself out instantly.
    getIO().emit('session_revoked', { role: 'accounts', id: String(manager._id) });

    res.status(200).json({
      success: true,
      message: 'Accounts manager deleted successfully'
    });

  } catch (error) {
    console.error('Delete accounts manager error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
