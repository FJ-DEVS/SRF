const Investor = require('../models/Investor');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { exact, findDuplicate } = require('../utils/duplicateCheck');
const { revokeSession } = require('../socket');
const { applySort } = require('../utils/listSort');

// Investor login
exports.loginInvestor = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const manager = await Investor.findOne({ username: String(username).toLowerCase().trim() });
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
        role: 'investor',
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
        role: 'investor'
      }
    });

  } catch (error) {
    console.error('Investor login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Verify the caller's own session — lets an idle investor dashboard notice that the
// admin deleted the account
exports.verifyInvestor = (req, res) => {
  res.status(200).json({ success: true, user: req.user });
};

// Create Investor (Admin only)
exports.createInvestor = async (req, res) => {
  try {
    const { name, username, password, phone } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const existing = await findDuplicate(Investor, { username: exact(username) });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    const manager = new Investor({
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
      message: 'Investor created successfully',
      data: managerResponse
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    console.error('Create Investor error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get all Investors (Admin only)
exports.getAllInvestors = async (req, res) => {
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
      Investor.find(query).select('-password'),
      sort
    )
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Investor.countDocuments(query);

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
    console.error('Get Investors error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single Investor (Admin only)
exports.getInvestor = async (req, res) => {
  try {
    const manager = await Investor.findById(req.params.id).select('-password');

    if (!manager) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found'
      });
    }

    res.status(200).json({
      success: true,
      data: manager
    });

  } catch (error) {
    console.error('Get Investor error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update Investor (Admin only)
exports.updateInvestor = async (req, res) => {
  try {
    const { name, username, password, phone } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (username) updateData.username = username;
    if (phone !== undefined) updateData.phone = phone;

    if (username) {
      const existing = await findDuplicate(
        Investor,
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

    const manager = await Investor.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!manager) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Investor updated successfully',
      data: manager
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    console.error('Update Investor error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Delete Investor (Admin only)
exports.deleteInvestor = async (req, res) => {
  try {
    const manager = await Investor.findByIdAndDelete(req.params.id);

    if (!manager) {
      return res.status(404).json({
        success: false,
        message: 'Investor not found'
      });
    }

    // Their token is already dead server-side (middleware/roleAuth.js); this
    // makes an open investor dashboard log itself out instantly.
    revokeSession('investor', manager._id);

    res.status(200).json({
      success: true,
      message: 'Investor deleted successfully'
    });

  } catch (error) {
    console.error('Delete Investor error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
