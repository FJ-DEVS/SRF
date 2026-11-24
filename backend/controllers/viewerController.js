const jwt = require('jsonwebtoken');
const Viewer = require('../models/Viewer');
const { getIO, revokeSession, refreshStockAccess } = require('../socket');
const { applySort } = require('../utils/listSort');
const { escapeRegex } = require('../utils/duplicateCheck');
const { parseIdList } = require('../utils/permissions');

const { phoneKey } = Viewer;

// Ten digits after dropping a country code / leading zero — anything shorter
// cannot be a mobile number
const checkPhone = (phone) => {
  if (!phone || !String(phone).trim()) return 'Mobile number is required';
  if (phoneKey(phone).length < 10) return 'Enter a valid 10-digit mobile number';
  return null;
};

const duplicatePhoneMessage = 'A viewer with this mobile number already exists';

// Login — the mobile app's sign-in screen, with the mobile number as the
// username
exports.loginViewer = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Mobile number and password are required' });
    }

    const key = phoneKey(phone);
    const viewer = key.length === 10 ? await Viewer.findOne({ phoneKey: key }) : null;
    if (!viewer || !(await viewer.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: viewer._id, role: 'viewer', name: viewer.name, phone: viewer.phone },
      process.env.JWT_SECRET,
      // Same window as the other app accounts — deleting the viewer still ends
      // every session at once (see middleware/roleAuth.js)
      { expiresIn: '30d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: viewer._id,
        name: viewer.name,
        phone: viewer.phone,
        role: 'viewer'
      }
    });
  } catch (error) {
    console.error('Viewer login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// The viewer's own session check — 401s once the account is deleted
exports.verifyViewer = (req, res) => {
  res.status(200).json({ success: true, user: req.user });
};

// Create viewer (Admin only)
exports.createViewer = async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    const phoneError = checkPhone(phone);
    if (phoneError) return res.status(400).json({ success: false, message: phoneError });
    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    if (await Viewer.exists({ phoneKey: phoneKey(phone) })) {
      return res.status(400).json({ success: false, message: duplicatePhoneMessage });
    }

    const viewer = new Viewer({
      name: name || '',
      phone,
      password,
      plainPassword: password
    });
    await viewer.save();

    const data = viewer.toObject();
    delete data.password;

    res.status(201).json({ success: true, message: 'Viewer created successfully', data });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: duplicatePhoneMessage });
    }
    console.error('Create viewer error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Get all viewers (Admin only)
exports.getAllViewers = async (req, res) => {
  try {
    const { search, sort, page = 1, limit = 10 } = req.query;

    const query = search
      ? {
        $or: [
          { name: { $regex: escapeRegex(search), $options: 'i' } },
          { phone: { $regex: escapeRegex(search), $options: 'i' } }
        ]
      }
      : {};

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [viewers, total] = await Promise.all([
      applySort(Viewer.find(query).select('-password'), sort).skip(skip).limit(parseInt(limit)),
      Viewer.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: viewers,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    console.error('Get viewers error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get single viewer (Admin only)
exports.getViewer = async (req, res) => {
  try {
    const viewer = await Viewer.findById(req.params.id).select('-password');
    if (!viewer) return res.status(404).json({ success: false, message: 'Viewer not found' });
    res.status(200).json({ success: true, data: viewer });
  } catch (error) {
    console.error('Get viewer error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Update viewer (Admin only). A blank password keeps the current one.
exports.updateViewer = async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    const viewer = await Viewer.findById(req.params.id);
    if (!viewer) return res.status(404).json({ success: false, message: 'Viewer not found' });

    if (phone !== undefined) {
      const phoneError = checkPhone(phone);
      if (phoneError) return res.status(400).json({ success: false, message: phoneError });
      if (await Viewer.exists({ phoneKey: phoneKey(phone), _id: { $ne: viewer._id } })) {
        return res.status(400).json({ success: false, message: duplicatePhoneMessage });
      }
      viewer.phone = phone;
    }
    if (name !== undefined) viewer.name = name;
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      viewer.password = password; // hashed on save
      viewer.plainPassword = password;
    }

    await viewer.save();

    const data = viewer.toObject();
    delete data.password;

    res.status(200).json({ success: true, message: 'Viewer updated successfully', data });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: duplicatePhoneMessage });
    }
    console.error('Update viewer error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Set what a viewer sees (Admin only): the item categories (null for every
// one), and whether the stock count and the rate are shown
exports.updateViewerPermissions = async (req, res) => {
  try {
    const categories = parseIdList(req.body.allowedCategories, 'Categories');
    if (categories.error) return res.status(400).json({ success: false, message: categories.error });

    const update = {};
    if (categories.list) update.$set = { allowedCategories: categories.list };
    else update.$unset = { allowedCategories: 1 };

    for (const field of ['canViewQuantity', 'canViewPrice']) {
      if (req.body[field] === undefined) continue;
      if (typeof req.body[field] !== 'boolean') {
        return res.status(400).json({ success: false, message: `${field} must be true or false` });
      }
      update.$set = { ...update.$set, [field]: req.body[field] };
    }

    const viewer = await Viewer.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!viewer) return res.status(404).json({ success: false, message: 'Viewer not found' });

    // Live stock counts follow the new stock-count permission at once
    await refreshStockAccess('viewer', String(viewer._id));
    // A viewer signed in to the app reloads their items and category chips
    getIO().emit('permissions_updated', { role: 'viewer', id: String(viewer._id) });

    res.status(200).json({ success: true, message: 'Permissions updated', data: viewer });
  } catch (error) {
    console.error('Update viewer permissions error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Delete viewer (Admin only)
exports.deleteViewer = async (req, res) => {
  try {
    const viewer = await Viewer.findByIdAndDelete(req.params.id);
    if (!viewer) return res.status(404).json({ success: false, message: 'Viewer not found' });

    // Sign the app out now; the token is already refused server-side
    revokeSession('viewer', viewer._id);

    res.status(200).json({ success: true, message: 'Viewer deleted successfully' });
  } catch (error) {
    console.error('Delete viewer error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
