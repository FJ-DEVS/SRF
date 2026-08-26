const Roller = require('../models/Roller');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { exact, findDuplicate } = require('../utils/duplicateCheck');
const { getIO } = require('../socket');
const { applySort } = require('../utils/listSort');

// Login roller
exports.loginRoller = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const roller = await Roller.findOne({ username: String(username).toLowerCase().trim() });
    if (!roller) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isPasswordValid = await roller.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      {
        id: roller._id,
        username: roller.username,
        role: 'roller',
        name: roller.name || roller.username
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: roller._id,
        username: roller.username,
        name: roller.name || roller.username,
        phone: roller.phone,
        role: 'roller'
      }
    });

  } catch (error) {
    console.error('Roller login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Verify the caller's own session — used by the roller app to notice that the
// admin deleted the account even while the app is sitting idle
exports.verifyRoller = (req, res) => {
  res.status(200).json({ success: true, user: req.user });
};

// Create roller (Admin only)
exports.createRoller = async (req, res) => {
  try {
    const { name, username, password, phone } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const existingRoller = await findDuplicate(Roller, { username: exact(username) });
    if (existingRoller) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    const roller = new Roller({
      name,
      username,
      password,
      plainPassword: password,
      phone
    });

    await roller.save();

    const rollerResponse = roller.toObject();
    delete rollerResponse.password;

    res.status(201).json({
      success: true,
      message: 'Roller created successfully',
      data: rollerResponse
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    console.error('Create roller error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Get all rollers (Admin only)
exports.getAllRollers = async (req, res) => {
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

    const rollers = await applySort(
      Roller.find(query).select('-password'),
      sort
    )
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Roller.countDocuments(query);

    res.status(200).json({
      success: true,
      data: rollers,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get rollers error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single roller (Admin only)
exports.getRoller = async (req, res) => {
  try {
    const roller = await Roller.findById(req.params.id).select('-password');

    if (!roller) {
      return res.status(404).json({
        success: false,
        message: 'Roller not found'
      });
    }

    res.status(200).json({
      success: true,
      data: roller
    });

  } catch (error) {
    console.error('Get roller error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update roller (Admin only)
exports.updateRoller = async (req, res) => {
  try {
    const { name, username, password, phone } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (username) updateData.username = username;
    if (phone !== undefined) updateData.phone = phone;

    if (username) {
      const existingRoller = await findDuplicate(
        Roller,
        { username: exact(username) },
        req.params.id
      );
      if (existingRoller) {
        return res.status(400).json({ success: false, message: 'Username already exists' });
      }
    }
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
      updateData.plainPassword = password;
    }

    const roller = await Roller.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!roller) {
      return res.status(404).json({
        success: false,
        message: 'Roller not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Roller updated successfully',
      data: roller
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    console.error('Update roller error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Delete roller (Admin only)
exports.deleteRoller = async (req, res) => {
  try {
    const roller = await Roller.findByIdAndDelete(req.params.id);

    if (!roller) {
      return res.status(404).json({
        success: false,
        message: 'Roller not found'
      });
    }

    // Their token is already dead server-side (middleware/roleAuth.js); this
    // makes an open roller app log itself out instantly.
    getIO().emit('session_revoked', { role: 'roller', id: String(roller._id) });

    res.status(200).json({
      success: true,
      message: 'Roller deleted successfully'
    });

  } catch (error) {
    console.error('Delete roller error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
