const Customer = require('../models/Customer');
const Salesman = require('../models/Salesman');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getIO } = require('../socket');
const { parseIdList, allowedCustomerIds } = require('../utils/permissions');
const { applySort } = require('../utils/listSort');
const { exact, findDuplicate, isPlaceholderPhone } = require('../utils/duplicateCheck');

const duplicatePhoneMessage = (phone) =>
  `A customer with phone number ${String(phone).trim()} already exists`;

// The GST certificate is uploaded separately (POST /api/uploads), so what
// arrives here is just the stored file descriptor — keep only our own fields
const normaliseCertificate = (cert) => ({
  url: (cert?.url || '').trim(),
  key: (cert?.key || '').trim(),
  name: (cert?.name || '').trim()
});

// A salesman limited to a list of customers can still see the ones assigned
// to them — add the customer to that list. Salesmen open to every customer
// have no list and are left alone.
const grantAssignedSalesman = (customer) =>
  customer.assignedSalesman
    ? Salesman.updateOne(
      { _id: customer.assignedSalesman, allowedCustomers: { $ne: null } },
      { $addToSet: { allowedCustomers: customer._id } }
    )
    : null;

// The app login typed into the admin's customer form, checked and turned into
// { set } / { unset } for the record — or { error }. `current` is the customer
// as it stands (null while creating). Clearing the username takes the login
// away. Usernames share the one login screen with salesmen, so a name taken by
// either is refused.
const loginUpdate = async ({ username, password }, current) => {
  if (username === undefined && !password) return {};

  const name = String(username ?? current?.username ?? '').trim().toLowerCase();
  if (!name) {
    return current?.username
      ? { unset: { username: 1, password: 1, plainPassword: 1 }, revoked: true }
      : {};
  }

  const pass = String(password ?? '');
  if (!pass && !current?.username) {
    return { error: 'A password is required to give this customer an app login' };
  }
  if (pass && pass.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }

  const [customerClash, salesmanClash] = await Promise.all([
    findDuplicate(Customer, { username: exact(name) }, current?._id),
    findDuplicate(Salesman, { username: exact(name) })
  ]);
  if (customerClash || salesmanClash) return { error: 'Username already exists' };

  const set = { username: name };
  if (pass) {
    set.password = await bcrypt.hash(pass, await bcrypt.genSalt(10));
    set.plainPassword = pass;
  }
  return { set };
};

// Only the admin sees a customer's app password; CRM managers read the same
// records without it
const withPassword = (query, req) =>
  req.user?.role === 'admin' ? query.select('+plainPassword') : query;

// Customer login — the customer app, on the same screen as the salesman's
exports.loginCustomer = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const customer = await Customer.findOne({ username: String(username).trim().toLowerCase() })
      .select('+password');
    if (!customer || !(await customer.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      {
        id: customer._id,
        username: customer.username,
        role: 'customer',
        name: customer.name
      },
      process.env.JWT_SECRET,
      // Same window as staff — taking the login away or deleting the customer
      // still ends every session at once (see middleware/roleAuth.js)
      { expiresIn: '30d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: customer._id,
        username: customer.username,
        name: customer.name,
        phone: customer.phone,
        role: 'customer'
      }
    });
  } catch (error) {
    console.error('Customer login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// The customer's own session check — 401s once the login is taken away
exports.verifyCustomer = (req, res) => {
  res.status(200).json({ success: true, user: req.user });
};

// Create customer
exports.createCustomer = async (req, res) => {
  try {
    const { phone, name, gstin, paymentRating, assignedSalesman, gstCertificate, locationLink } = req.body;

    // Phone number is the customer's identity — two records sharing one is a duplicate
    if (phone && !isPlaceholderPhone(phone)) {
      const clash = await findDuplicate(Customer, { phone: exact(phone) });
      if (clash) {
        return res.status(400).json({ success: false, message: duplicatePhoneMessage(phone) });
      }
    }

    const login = await loginUpdate(req.body, null);
    if (login.error) {
      return res.status(400).json({ success: false, message: login.error });
    }

    const customer = new Customer({
      phone,
      name,
      gstin,
      ...(paymentRating && { paymentRating }),
      assignedSalesman: assignedSalesman || null,
      gstCertificate: normaliseCertificate(gstCertificate),
      locationLink: (locationLink || '').trim(),
      ...login.set
    });

    await customer.save();
    await grantAssignedSalesman(customer);

    getIO().emit('customers_updated');

    const data = customer.toObject();
    delete data.password;

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data
    });

  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.username) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
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
      withPassword(Customer.find(query).populate('assignedSalesman', 'name username phone'), req),
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
    const customer = await withPassword(
      Customer.findById(req.params.id).populate('assignedSalesman', 'name username phone'),
      req
    );
    
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

    if (phone !== undefined && phone && !isPlaceholderPhone(phone)) {
      const clash = await findDuplicate(Customer, { phone: exact(phone) }, req.params.id);
      if (clash) {
        return res.status(400).json({ success: false, message: duplicatePhoneMessage(phone) });
      }
    }

    let login = {};
    if (req.body.username !== undefined || req.body.password) {
      const current = await Customer.findById(req.params.id).select('username').lean();
      if (!current) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }
      login = await loginUpdate(req.body, current);
      if (login.error) {
        return res.status(400).json({ success: false, message: login.error });
      }
      Object.assign(updateData, login.set);
      if (login.unset) updateData.$unset = login.unset;
    }

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('+plainPassword');

    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    if (assignedSalesman !== undefined) await grantAssignedSalesman(customer);

    getIO().emit('customers_updated');
    // Login taken away — sign the customer's app out now, not on its next request
    if (login.revoked) getIO().emit('session_revoked', { role: 'customer', id: String(customer._id) });

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: customer
    });

  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.username) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    console.error('Update customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Set which item categories may be sold to a customer (Admin only). null opens
// every category.
exports.updateCustomerPermissions = async (req, res) => {
  try {
    const categories = parseIdList(req.body.allowedCategories, 'Categories');
    if (categories.error) return res.status(400).json({ success: false, message: categories.error });

    const update = categories.list
      ? { $set: { allowedCategories: categories.list } }
      : { $unset: { allowedCategories: 1 } };
    const customer = await Customer.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('assignedSalesman', 'name username phone')
      .select('+plainPassword');
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    getIO().emit('customers_updated');

    res.status(200).json({ success: true, message: 'Permissions updated', data: customer });
  } catch (error) {
    console.error('Update customer permissions error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Block or unblock a customer — customer relation managers can do this and
// nothing else to a customer, so it is its own endpoint rather than a way
// through updateCustomer
exports.setCustomerBlocked = async (req, res) => {
  try {
    const { isBlocked } = req.body;

    if (typeof isBlocked !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isBlocked must be true or false'
      });
    }

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { isBlocked },
      { new: true }
    ).populate('assignedSalesman', 'name username phone');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    getIO().emit('customers_updated');

    res.status(200).json({
      success: true,
      message: isBlocked ? 'Customer blocked' : 'Customer unblocked',
      data: customer
    });

  } catch (error) {
    console.error('Set customer blocked error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
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

    // Only the customers this salesman has been given
    const allowed = await allowedCustomerIds(req.user.id);
    if (allowed) query._id = { $in: allowed };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const customers = await Customer.find(query)
      .select('phone name gstin isBlocked allowedCategories')
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
    const allowed = await allowedCustomerIds(req.user.id);
    const permitted = !allowed || allowed.some((id) => String(id) === req.params.id);
    const customer = permitted ? await Customer.findById(req.params.id).select('phone name gstin allowedCategories') : null;

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
    // Kick the customer's app out too, if they had a login
    if (customer.username) getIO().emit('session_revoked', { role: 'customer', id: String(customer._id) });

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

