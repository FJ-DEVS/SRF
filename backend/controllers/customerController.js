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

// The list of app logins typed into the admin's customer form — each
// { _id?, name, username, password } — checked and turned into the appUsers
// to save, or { error }. `current` is the customer as it stands, with its
// password hashes (null while creating). A login keeps its password unless a
// new one is typed; one left out of the list is taken away (`revoked` holds
// their ids). Usernames share the one login screen with salesmen, so a name
// taken by either is refused.
const appUsersUpdate = async (list, current) => {
  if (!Array.isArray(list)) return { error: 'App logins must be a list' };

  const existing = new Map((current?.appUsers || []).map((u) => [String(u._id), u]));
  const appUsers = [];
  const seen = new Set();

  for (const entry of list) {
    const name = String(entry?.name ?? '').trim();
    const username = String(entry?.username ?? '').trim().toLowerCase();
    const pass = String(entry?.password ?? '');
    if (!name && !username && !pass) continue; // a blank row in the form

    const label = name || username;
    if (!username) return { error: `Enter a username for ${label}` };
    if (/\s/.test(username)) return { error: `Username "${username}" cannot contain spaces` };
    if (seen.has(username)) return { error: `Username "${username}" is used twice` };
    seen.add(username);

    const before = entry?._id && existing.get(String(entry._id));
    if (!pass && !before) return { error: `Enter a password for ${label}` };
    if (pass && pass.length < 6) return { error: `Password for ${label} must be at least 6 characters` };

    const user = before
      ? { _id: before._id, name, username, password: before.password, plainPassword: before.plainPassword }
      : { name, username };
    if (pass) {
      user.password = await bcrypt.hash(pass, await bcrypt.genSalt(10));
      user.plainPassword = pass;
    }
    appUsers.push(user);
  }

  if (seen.size) {
    const names = [...seen];
    const otherCustomers = current?._id ? { _id: { $ne: current._id } } : {};
    const [customerClash, salesmanClash] = await Promise.all([
      Customer.findOne({ 'appUsers.username': { $in: names }, ...otherCustomers }).select('appUsers.username').lean(),
      Salesman.findOne({ username: { $in: names.map(exact) } }).select('username').lean()
    ]);
    const taken = salesmanClash?.username
      || customerClash?.appUsers?.find((u) => seen.has(u.username))?.username;
    if (taken) return { error: `Username "${String(taken).toLowerCase()}" already exists` };
  }

  const kept = new Set(appUsers.filter((u) => u._id).map((u) => String(u._id)));
  const revoked = [...existing.keys()].filter((id) => !kept.has(id));
  return { appUsers, revoked };
};

// Every login of a customer that has gone — sign those phones out now, not on
// their next request
const emitRevoked = (ids) => {
  for (const id of ids) getIO().emit('session_revoked', { role: 'customer', id: String(id) });
};

// Only the admin sees a customer's app passwords; CRM managers read the same
// records without them
const withPassword = (query, req) =>
  req.user?.role === 'admin' ? query.select('+appUsers.plainPassword') : query;

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

    const login = String(username).trim().toLowerCase();
    const customer = await Customer.findOne({ 'appUsers.username': login })
      .select('+appUsers.password');
    const appUser = customer?.appUsers.find((u) => u.username === login);
    if (!appUser || !(await appUser.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // `id` stays the customer — everything the customer may see or order is
    // keyed on it. `userId` is the one login, checked on every request (see
    // middleware/roleAuth.js) so taking it away signs out that phone alone.
    const token = jwt.sign(
      {
        id: customer._id,
        userId: appUser._id,
        username: appUser.username,
        role: 'customer',
        name: customer.name,
        userName: appUser.name
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
        userId: appUser._id,
        username: appUser.username,
        name: customer.name,
        userName: appUser.name,
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

    const login = await appUsersUpdate(req.body.appUsers ?? [], null);
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
      appUsers: login.appUsers
    });

    await customer.save();
    await grantAssignedSalesman(customer);

    getIO().emit('customers_updated');

    const data = customer.toObject();
    for (const user of data.appUsers) delete user.password;

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data
    });

  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.['appUsers.username']) {
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
        { gstin: { $regex: search, $options: 'i' } },
        { 'appUsers.username': { $regex: search, $options: 'i' } },
        { 'appUsers.name': { $regex: search, $options: 'i' } }
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

    // A request without appUsers (e.g. the block toggle) leaves the logins alone
    let login = { revoked: [] };
    if (req.body.appUsers !== undefined) {
      const current = await Customer.findById(req.params.id)
        .select('+appUsers.password +appUsers.plainPassword')
        .lean();
      if (!current) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }
      login = await appUsersUpdate(req.body.appUsers, current);
      if (login.error) {
        return res.status(400).json({ success: false, message: login.error });
      }
      updateData.appUsers = login.appUsers;
    }

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('+appUsers.plainPassword');

    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    if (assignedSalesman !== undefined) await grantAssignedSalesman(customer);

    getIO().emit('customers_updated');
    emitRevoked(login.revoked);

    res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      data: customer
    });

  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.['appUsers.username']) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }
    console.error('Update customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Set which item categories may be sold to a customer and which cargos they
// may use (Admin only). null for either list opens it to every one.
exports.updateCustomerPermissions = async (req, res) => {
  try {
    const categories = parseIdList(req.body.allowedCategories, 'Categories');
    if (categories.error) return res.status(400).json({ success: false, message: categories.error });
    const cargos = parseIdList(req.body.allowedCargos, 'Cargos');
    if (cargos.error) return res.status(400).json({ success: false, message: cargos.error });

    const lists = [['allowedCategories', categories.list]];
    // Cargos came later: a request without them leaves them as they are
    if (req.body.allowedCargos !== undefined) lists.push(['allowedCargos', cargos.list]);

    // A list is saved as given; "all" is the field left unset
    const update = {};
    for (const [field, list] of lists) {
      if (list) update.$set = { ...update.$set, [field]: list };
      else update.$unset = { ...update.$unset, [field]: 1 };
    }

    const customer = await Customer.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('assignedSalesman', 'name username phone')
      .select('+appUsers.plainPassword');
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    getIO().emit('customers_updated');
    // A customer signed in to the app reloads their items and cargos
    getIO().emit('permissions_updated', { role: 'customer', id: String(customer._id) });

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
    // Kick every phone signed in to one of the customer's logins
    emitRevoked((customer.appUsers || []).map((u) => u._id));

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

