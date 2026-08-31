const Salesman = require('../models/Salesman');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { exact, findDuplicate } = require('../utils/duplicateCheck');
const { applySort } = require('../utils/listSort');
const { getIO } = require('../socket');

// Login salesman
exports.loginSalesman = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    // Find salesman by username
    const salesman = await Salesman.findOne({ username });
    if (!salesman) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Check password
    const isPasswordValid = await salesman.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: salesman._id,
        username: salesman.username, 
        role: 'salesman',
        name: salesman.name
      },
      process.env.JWT_SECRET,
      // Staff work a full route before they get near a login screen, and a
      // 24h token meant everyone was signed out once a day. Deleting the
      // account still kills every session it has open immediately (the auth
      // middleware checks the account still exists on every request), so the
      // longer window does not outlive the admin's control over access.
      { expiresIn: '30d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: salesman._id,
        username: salesman.username,
        name: salesman.name,
        phone: salesman.phone,
        role: 'salesman'
      }
    });

  } catch (error) {
    console.error('Salesman login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Verify the caller's own session — used by the mobile app to notice that the
// admin deleted the account even while the app is sitting idle
exports.verifySalesman = (req, res) => {
  res.status(200).json({ success: true, user: req.user });
};

// Create salesman (Admin only)
exports.createSalesman = async (req, res) => {
  try {
    const { name, username, password, phone } = req.body;

    // Usernames are stored lowercase, so the lookup has to ignore case too
    const existingSalesman = await findDuplicate(Salesman, { username: exact(username) });
    if (existingSalesman) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username already exists' 
      });
    }

    const salesman = new Salesman({
      name,
      username,
      password,
      plainPassword: password,
      phone
    });

    await salesman.save();

    // Remove hashed password from response, keep plainPassword
    const salesmanResponse = salesman.toObject();
    delete salesmanResponse.password;

    res.status(201).json({
      success: true,
      message: 'Salesman created successfully',
      data: salesmanResponse
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    console.error('Create salesman error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Get all salesmen (Admin only)
exports.getAllSalesmen = async (req, res) => {
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

    const salesmen = await applySort(
      Salesman.find(query).select('-password'),
      sort
    )
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Salesman.countDocuments(query);

    res.status(200).json({
      success: true,
      data: salesmen,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get salesmen error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Get single salesman (Admin only)
exports.getSalesman = async (req, res) => {
  try {
    const salesman = await Salesman.findById(req.params.id).select('-password');
    
    if (!salesman) {
      return res.status(404).json({ 
        success: false, 
        message: 'Salesman not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: salesman
    });

  } catch (error) {
    console.error('Get salesman error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Update salesman (Admin only)
exports.updateSalesman = async (req, res) => {
  try {
    const { name, username, password, phone } = req.body;
    
    const updateData = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username;
    if (phone) updateData.phone = phone;

    if (username) {
      const existingSalesman = await findDuplicate(
        Salesman,
        { username: exact(username) },
        req.params.id
      );
      if (existingSalesman) {
        return res.status(400).json({ success: false, message: 'Username already exists' });
      }
    }
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
      updateData.plainPassword = password;
    }

    const salesman = await Salesman.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!salesman) {
      return res.status(404).json({ 
        success: false, 
        message: 'Salesman not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Salesman updated successfully',
      data: salesman
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    console.error('Update salesman error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Delete salesman (Admin only)
exports.deleteSalesman = async (req, res) => {
  try {
    const salesman = await Salesman.findByIdAndDelete(req.params.id);

    if (!salesman) {
      return res.status(404).json({
        success: false,
        message: 'Salesman not found'
      });
    }

    // Kick the deleted salesman out of any app they still have open. Their token
    // is already dead server-side (see middleware/salesmanAuth.js); this makes
    // the client react instantly instead of on its next request.
    getIO().emit('session_revoked', { role: 'salesman', id: String(salesman._id) });

    res.status(200).json({
      success: true,
      message: 'Salesman deleted successfully'
    });

  } catch (error) {
    console.error('Delete salesman error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

