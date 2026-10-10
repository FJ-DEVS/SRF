const mongoose = require('mongoose');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Salesman = require('../models/Salesman');
const Item = require('../models/Item');
const DamagedItem = require('../models/DamagedItem');
const Cargo = require('../models/Cargo');
const Category = require('../models/Category');
const axios = require('axios');
const { getIO } = require('../socket');
const Placement = require('../models/Placement');
const { consumePlacedStock, consumeFromRaks, restorePlacedStock } = require('../utils/placementMath');
const { decorateCheckLevel, categoryCheckLevels, belowCheckLevelQuery } = require('../utils/checkLevel');

// Helper function to send OneSignal notification
const sendPushNotification = async (message, data = {}) => {
  try {
    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!appId || !apiKey) {
      console.warn('OneSignal credentials not configured');
      return;
    }

    const notification = {
      app_id: appId,
      included_segments: ['All'],
      contents: { en: message },
      data: data
    };

    await axios.post('https://onesignal.com/api/v1/notifications', notification, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`
      }
    });

    console.log('Push notification sent successfully');
  } catch (error) {
    console.error('Error sending push notification:', error.message);
  }
};

// Helper function to send WhatsApp message
const sendWhatsAppMessage = async (phone, customerName) => {
  try {
    const whatsappApiUrl = process.env.WHATSAPP_API_URL;
    const whatsappApiKey = process.env.WHATSAPP_API_KEY;

    if (!whatsappApiUrl || !whatsappApiKey) {
      console.warn('WhatsApp API credentials not configured');
      return;
    }

    const currentDate = new Date().toLocaleDateString('en-IN');
    const currentTime = new Date().toLocaleTimeString('en-IN');
    
    const message = `Hello ${customerName},\n\nYour order has been delivered successfully!\n\nDate: ${currentDate}\nTime: ${currentTime}\n\nThank you for your business!`;

    // Adjust this based on your WhatsApp API provider
    await axios.post(whatsappApiUrl, {
      phone: phone,
      message: message
    }, {
      headers: {
        'Authorization': `Bearer ${whatsappApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('WhatsApp message sent successfully');
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.message);
  }
};

// Sell-order statuses a return can be recorded against — the goods have left
// the shelf, so some of them may come back
const RETURNABLE_STATUSES = ['rolled', 'billed', 'delivered'];

// What is left to return on one sell order: per item, what was sold, what has
// come back on completed returns, what is held by returns still pending, and
// what is left. Cancelled returns hold nothing. Resolves to { error, status }
// when the order cannot take a return at all.
const returnableLinesFor = async (orderId, session = null) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    return { error: 'Select the sell order the goods came back from', status: 400 };
  }
  const original = await Order.findById(orderId)
    .populate('items.item', 'name price category')
    .populate('customerName', 'name phone')
    .session(session);
  if (!original) return { error: 'Original order not found', status: 404 };
  if (original.type !== 'sell order') {
    return { error: 'Returns can only be recorded against sell orders', status: 400 };
  }
  if (!RETURNABLE_STATUSES.includes(original.status)) {
    return {
      error: `Only ${RETURNABLE_STATUSES.join(', ')} sell orders can take a return — this one is "${original.status}"`,
      status: 400
    };
  }

  const earlier = await Order.find({
    type: 'return order',
    returnOf: original._id,
    status: { $ne: 'cancelled' }
  })
    .select('items status')
    .session(session);
  const returnedByItem = new Map();
  const pendingByItem = new Map();
  for (const ret of earlier) {
    const tally = ret.status === 'completed' ? returnedByItem : pendingByItem;
    for (const line of ret.items) {
      const key = String(line.item);
      tally.set(key, (tally.get(key) || 0) + (line.quantity || 0));
    }
  }

  // One line per item even if the order listed it twice
  const byItem = new Map();
  for (const line of original.items) {
    const key = String(line.item?._id || line.item);
    if (!byItem.has(key)) {
      byItem.set(key, {
        item: line.item,
        ordered: 0,
        returned: returnedByItem.get(key) || 0,
        pending: pendingByItem.get(key) || 0
      });
    }
    byItem.get(key).ordered += line.quantity || 0;
  }
  const lines = [...byItem.values()].map((l) => ({
    ...l,
    remaining: Math.max(l.ordered - l.returned - l.pending, 0)
  }));

  return { original, lines };
};

// A return line's split between stock and the damaged list: whole pieces, none
// negative, adding up to exactly what came back. Resolves to an error message,
// or null when the split is good.
const returnSplitError = (restock, damaged, quantity, name) => {
  if (![restock, damaged].every((n) => Number.isInteger(n) && n >= 0)) {
    return `Enter the restocked and damaged pieces of "${name}" as whole numbers of 0 or more`;
  }
  if (restock + damaged !== quantity) {
    return `"${name}": ${restock} restocked + ${damaged} damaged = ${restock + damaged}, but ${quantity} came back`;
  }
  return null;
};

// The split a completed return applied to one line. Returns recorded before
// the split existed restocked every piece or none, and their unrestocked
// pieces were written off rather than put on the damaged list.
const returnSplitOf = (order, line) =>
  line.restockQuantity != null || line.damagedQuantity != null
    ? { restock: line.restockQuantity || 0, damaged: line.damagedQuantity || 0 }
    : { restock: order.restocked ? line.quantity : 0, damaged: 0 };

// Create order — admin (any type); salesman (sell orders only)
exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { type, items, customerName, cargo, notes } = req.body;

    // Validate that salesman can only create sell orders
    if (req.user.role === 'salesman' && type !== 'sell order') {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ 
        success: false, 
        message: 'Salesmen can only create sell orders' 
      });
    }

    // Validate items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        success: false, 
        message: 'Items array is required and must not be empty' 
      });
    }

    // Validate items structure - each item must be an object with item and quantity
    for (let i = 0; i < items.length; i++) {
      if (typeof items[i] === 'string') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          success: false, 
          message: `Invalid items format. Each item must be an object with 'item' (ID) and 'quantity' properties, not a string. Error at index ${i}` 
        });
      }
      if (!items[i].item || !items[i].quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          success: false, 
          message: `Each item must have 'item' (ID) and 'quantity' properties. Error at index ${i}` 
        });
      }
      if (typeof items[i].quantity !== 'number' || items[i].quantity < 1) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          success: false, 
          message: `Item quantity must be a number greater than 0. Error at index ${i}` 
        });
      }
    }

    // Return orders: goods coming back from a sell order. Every line is capped
    // at what that order sold less what earlier (non-cancelled) returns hold,
    // and the customer is copied from it. Each line also says how many of its
    // pieces go back into stock and how many are damaged. The return starts
    // out pending; only completing it moves the pieces and takes the points
    // back (see updateOrderStatus).
    let returnOf = null;
    let returnCustomer = null;
    let restocked = false;
    let orderItems = items;
    if (type === 'return order') {
      const check = await returnableLinesFor(req.body.returnOf, session);
      if (check.error) {
        await session.abortTransaction();
        session.endSession();
        return res.status(check.status).json({ success: false, message: check.error });
      }
      const openByItem = new Map(check.lines.map((l) => [String(l.item?._id || l.item), l]));
      const seen = new Set();
      for (const line of items) {
        const key = String(line.item);
        const open = openByItem.get(key);
        if (!open) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: 'A returned item is not on the original order' });
        }
        if (seen.has(key)) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: 'The same item is listed twice on the return' });
        }
        seen.add(key);
        if (!Number.isInteger(line.quantity) || line.quantity > open.remaining) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Only ${open.remaining} of "${open.item?.name || 'this item'}" can still be returned on that order`
          });
        }
      }
      returnOf = check.original._id;
      returnCustomer = check.original.customerName?._id || check.original.customerName || null;

      // Saleable pieces go back into stock, damaged ones onto the damaged list.
      // A line sent without a split falls back to the order-wide `restock`
      // flag: every piece restocked, or every piece damaged.
      orderItems = [];
      for (const line of items) {
        const noSplit = line.restockQuantity === undefined && line.damagedQuantity === undefined;
        const restock = noSplit ? (req.body.restock ? line.quantity : 0) : line.restockQuantity;
        const damaged = noSplit ? line.quantity - restock : line.damagedQuantity;
        const name = openByItem.get(String(line.item)).item?.name || 'this item';
        const splitError = returnSplitError(restock, damaged, line.quantity, name);
        if (splitError) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: splitError });
        }
        orderItems.push({ item: line.item, quantity: line.quantity, restockQuantity: restock, damagedQuantity: damaged });
      }
      restocked = orderItems.some((l) => l.restockQuantity > 0);
    }

    // Sell orders reference a Customer, purchase orders reference a Vendor
    const customerModel = type === 'purchase order' ? 'Vendor' : 'Customer';

    if (customerName && type !== 'return order') {
      if (customerModel === 'Customer') {
        const customer = await Customer.findById(customerName).session(session);
        if (!customer) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({
            success: false,
            message: 'Customer not found'
          });
        }
        if (customer.isBlocked) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: 'Cannot create order for blocked customer'
          });
        }
      } else {
        const vendor = await Vendor.findById(customerName).session(session);
        if (!vendor) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({
            success: false,
            message: 'Vendor not found'
          });
        }
      }
    }

    // For sell orders: atomically deduct stock inside the transaction.
    // Using findOneAndUpdate with { quantity: { $gte: requestedQty } } ensures
    // the check-and-deduct is a single atomic operation — no race condition possible.
    if (type === 'sell order') {
      for (const orderItem of items) {
        const { item: itemId, quantity: requestedQty } = orderItem;

        const updatedItem = await Item.findOneAndUpdate(
          { _id: itemId, quantity: { $gte: requestedQty } },
          { $inc: { quantity: -requestedQty } },
          { new: true, session }
        );

        if (!updatedItem) {
          // Either item not found or insufficient stock — check which
          const existingItem = await Item.findById(itemId).session(session);
          await session.abortTransaction();
          session.endSession();
          if (!existingItem) {
            return res.status(404).json({ 
              success: false, 
              message: `Item with ID ${itemId} not found` 
            });
          }
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for "${existingItem.name}". Available: ${existingItem.quantity}, Requested: ${requestedQty}`
          });
        }
      }
      // Raks are deliberately left alone here. The goods are committed but
      // still physically on the shelf until the roller pulls them and marks
      // the order "rolled" — see updateOrderStatus.
    }

    // For purchase orders: only validate items exist (pending state — no inventory change).
    // Inventory will be updated only when the order status changes to 'completed'.
    if (type === 'purchase order') {
      for (const orderItem of items) {
        const { item: itemId } = orderItem;

        const existingItem = await Item.findById(itemId).session(session);

        if (!existingItem) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ 
            success: false, 
            message: `Item with ID ${itemId} not found` 
          });
        }
      }
    }

    // Create the order (stock already updated atomically above)
    const order = new Order({
      type,
      items: orderItems,
      customerName: type === 'return order' ? returnCustomer : customerName,
      customerModel,
      cargo: cargo || null,
      notes: notes || null,
      createdBy: req.user.role === 'salesman' ? req.user.id : 'Admin',
      createdByType: req.user.role === 'admin' ? 'admin' : 'salesman',
      status: 'pending',
      returnOf,
      restocked
    });

    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Populate references (conditionally populate createdBy only if it's a salesman)
    const populateOptions = [
      { path: 'items.item' },
      { path: 'customerName' },
      { path: 'cargo' },
      { path: 'returnOf', select: 'createdAt billNumber status' }
    ];
    
    if (order.createdByType === 'salesman') {
      populateOptions.unshift({ path: 'createdBy', model: 'Salesman', select: '-password' });
    }
    
    await order.populate(populateOptions);

    // Send push notification to admin
    const salesmanName = req.user.role === 'salesman' ? req.user.name : 'Admin';
    await sendPushNotification(
      type === 'return order' ? `Return recorded by ${salesmanName}` : `New order placed by ${salesmanName}`,
      {
        orderId: order._id,
        salesmanName,
        type: order.type
      }
    );

    getIO().emit('orders_updated');

    res.status(201).json({
      success: true,
      message: type === 'return order' ? 'Return order recorded successfully' : 'Order created successfully',
      data: order
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Create order error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Escape user input before using it inside a regex
const escapeRegex = (str = '') => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The two statuses a roller works on — the only ones they can change or mark seen
const ROLLER_STATUSES = ['to roll', 'rolled'];

// Everything a roller's list may show: every sell order once it has been
// queued for rolling, including where it went after (billed, completed …)
const ROLLER_VISIBLE_STATUSES = ['to roll', 'rolled', 'billed', 'delivered', 'completed', 'cancellation_requested', 'cancelled'];
const rollerVisibleQuery = { type: 'sell order', customerModel: 'Customer', status: { $in: ROLLER_VISIBLE_STATUSES } };

// A roller's status param: one of the visible statuses, or "all" (the default)
const rollerStatusMatch = (status) =>
  ROLLER_VISIBLE_STATUSES.includes(status) ? status : { $in: ROLLER_VISIBLE_STATUSES };

// Customer relation managers work the billed end of the pipeline: a sell order
// from the moment it is billed, and on to delivered. Nothing before billing.
const CRM_VISIBLE_STATUSES = ['billed', 'delivered'];

// A CRM manager's status param: one of the visible statuses, or "all" (the default)
const crmStatusMatch = (status) =>
  CRM_VISIBLE_STATUSES.includes(status) ? status : { $in: CRM_VISIBLE_STATUSES };

// The roller's chat list: one row per customer, most recent order first, with
// that order as the preview and how many of their "to roll" orders are unseen
exports.getRollerCustomers = async (req, res) => {
  try {
    const { search, cargo } = req.query;
    const limitNum = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 200);

    // An optional cargo narrows everything — the list, its counts and the cards
    const scope = cargo && mongoose.Types.ObjectId.isValid(cargo)
      ? { ...rollerVisibleQuery, cargo: new mongoose.Types.ObjectId(cargo) }
      : rollerVisibleQuery;

    const pipeline = [
      { $match: scope },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$customerName',
          lastOrderAt: { $first: '$createdAt' },
          lastStatus: { $first: '$status' },
          lastCargo: { $first: '$cargo' },
          lastQty: { $first: { $sum: '$items.quantity' } },
          orderCount: { $sum: 1 },
          toRollCount: { $sum: { $cond: [{ $eq: ['$status', 'to roll'] }, 1, 0] } },
          unseenCount: {
            $sum: { $cond: [{ $and: [{ $eq: ['$status', 'to roll'] }, { $eq: [{ $ifNull: ['$rollerSeenAt', null] }, null] }] }, 1, 0] }
          }
        }
      },
      { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: '$customer' },
      { $lookup: { from: 'cargos', localField: 'lastCargo', foreignField: '_id', as: 'cargo' } }
    ];
    if (search && search.trim()) {
      pipeline.push({ $match: { 'customer.name': { $regex: escapeRegex(search.trim()), $options: 'i' } } });
    }
    pipeline.push(
      { $sort: { lastOrderAt: -1 } },
      {
        $facet: {
          data: [
            { $limit: limitNum },
            {
              $project: {
                _id: 1, lastOrderAt: 1, lastStatus: 1, lastQty: 1, orderCount: 1, toRollCount: 1, unseenCount: 1,
                name: '$customer.name',
                lastCargoName: { $first: '$cargo.name' }
              }
            }
          ],
          meta: [{ $count: 'total' }]
        }
      }
    );

    // Counts for the cards above the chat — across every customer, not just the search
    const [[result], statusCounts] = await Promise.all([
      Order.aggregate(pipeline),
      Order.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }])
    ]);
    const countOf = (status) => statusCounts.find((c) => c._id === status)?.count || 0;
    const stats = {
      total: statusCounts.reduce((sum, c) => sum + c.count, 0),
      toRoll: countOf('to roll'),
      rolled: countOf('rolled')
    };
    res.status(200).json({ success: true, data: result.data, total: result.meta[0]?.total || 0, stats });
  } catch (error) {
    console.error('Get roller customers error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// A roller opened a customer's chat — every unseen "to roll" order of theirs
// is now seen, for every roller. updatedAt is left alone since nothing about
// the orders themselves changed. With ?cargo= only that cargo's orders — the
// ones the chat actually showed — are marked.
exports.markRollerCustomerSeen = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.customerId)) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    const filter = { customerName: req.params.customerId, status: { $in: ROLLER_STATUSES }, rollerSeenAt: null };
    if (req.query.cargo && mongoose.Types.ObjectId.isValid(req.query.cargo)) filter.cargo = req.query.cargo;
    const result = await Order.updateMany(
      filter,
      { $set: { rollerSeenAt: new Date() } },
      { timestamps: false }
    );
    if (result.modifiedCount) getIO().emit('orders_updated');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Mark roller customer seen error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get all orders
exports.getAllOrders = async (req, res) => {
  try {
    const { status, type, month, year, date, search, customer, cargo, before, since, sort = 'newest', page = 1, limit = 10 } = req.query;

    const conditions = [];

    // If salesman, show their own orders OR orders with status "to roll"
    if (req.user.role === 'salesman') {
      conditions.push({
        $or: [
          { createdBy: req.user.id },
          { status: 'to roll' }
        ]
      });
    }

    // Rollers see sell orders from the moment they are queued for rolling
    if (req.user.role === 'roller') {
      conditions.push({ type: 'sell order', status: rollerStatusMatch(status) });
    } else if (req.user.role === 'crm') {
      conditions.push({ type: 'sell order', status: crmStatusMatch(status) });
    } else if (status) {
      // One status, or a comma-separated set ("rolled,billed,delivered")
      const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length) conditions.push({ status: statuses.length > 1 ? { $in: statuses } : statuses[0] });
    }
    if (type) conditions.push({ type });
    if (customer && mongoose.Types.ObjectId.isValid(customer)) conditions.push({ customerName: customer });
    if (cargo && mongoose.Types.ObjectId.isValid(cargo)) conditions.push({ cargo });

    // Date filters: exact day ("today" / YYYY-MM-DD) wins over month/year
    if (date) {
      const day = date === 'today' ? new Date() : new Date(date);
      if (!isNaN(day)) {
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
        const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
        conditions.push({ createdAt: { $gte: start, $lte: end } });
      }
    } else if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);
      conditions.push({ createdAt: { $gte: startDate, $lte: endDate } });
    } else if (year) {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
      conditions.push({ createdAt: { $gte: startDate, $lte: endDate } });
    }

    // Cursors on createdAt — the roller's chat pages back with "before" and
    // re-reads everything it has loaded with "since"
    if (before && !isNaN(new Date(before))) conditions.push({ createdAt: { $lt: new Date(before) } });
    if (since && !isNaN(new Date(since))) conditions.push({ createdAt: { $gte: new Date(since) } });

    // Search by customer/vendor name, bill number or order id
    if (search && search.trim()) {
      const regex = { $regex: escapeRegex(search.trim()), $options: 'i' };
      const [customerIds, vendorIds] = await Promise.all([
        Customer.find({ name: regex }).select('_id').lean(),
        Vendor.find({ name: regex }).select('_id').lean()
      ]);
      const partyIds = [...customerIds, ...vendorIds].map((d) => d._id);
      const searchOr = [{ customerName: { $in: partyIds } }, { billNumber: regex }];
      if (mongoose.Types.ObjectId.isValid(search.trim())) {
        searchOr.push({ _id: search.trim() });
      }
      conditions.push({ $or: searchOr });
    }

    const query = conditions.length ? { $and: conditions } : {};
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const sortSpecs = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      name_asc: { partyName: 1, createdAt: -1 },
      name_desc: { partyName: -1, createdAt: -1 },
      qty_desc: { totalQty: -1, createdAt: -1 },
      qty_asc: { totalQty: 1, createdAt: -1 },
      // Bill numbers are stored as strings, so they are compared as numbers
      // (otherwise "100" sorts before "20"); orders with no bill go last
      bill_desc: { hasBill: -1, billNo: -1, createdAt: -1 },
      bill_asc: { hasBill: -1, billNo: 1, createdAt: -1 }
    };
    const sortSpec = sortSpecs[sort] || sortSpecs.newest;
    const needsComputedSort = ['name_asc', 'name_desc', 'qty_desc', 'qty_asc', 'bill_desc', 'bill_asc'].includes(sort);

    let orders;
    let total;

    if (needsComputedSort) {
      // Sort by computed fields (party name / total quantity) via aggregation,
      // then hydrate the page of ids with a normal populated find
      const pipeline = [
        { $match: query },
        {
          $addFields: {
            totalQty: { $sum: '$items.quantity' },
            billNo: { $convert: { input: '$billNumber', to: 'long', onError: 0, onNull: 0 } },
            hasBill: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$billNumber', ''] } }, 0] }, 1, 0] }
          }
        },
        { $lookup: { from: 'customers', localField: 'customerName', foreignField: '_id', as: '_cust' } },
        { $lookup: { from: 'vendors', localField: 'customerName', foreignField: '_id', as: '_vend' } },
        {
          $addFields: {
            partyName: {
              $toLower: {
                $ifNull: [
                  { $first: '$_cust.name' },
                  { $ifNull: [{ $first: '$_vend.name' }, ''] }
                ]
              }
            }
          }
        },
        { $sort: sortSpec },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limitNum }, { $project: { _id: 1 } }],
            meta: [{ $count: 'total' }]
          }
        }
      ];
      const [result] = await Order.aggregate(pipeline);
      const ids = result.data.map((d) => d._id);
      total = result.meta[0]?.total || 0;

      const found = await Order.find({ _id: { $in: ids } })
        .populate('items.item')
        .populate('customerName')
        .populate('cargo')
        .populate('rolledBy', 'name username')
        .populate('returnOf', 'createdAt billNumber status');
      const byId = new Map(found.map((o) => [String(o._id), o]));
      orders = ids.map((id) => byId.get(String(id))).filter(Boolean);
    } else {
      orders = await Order.find(query)
        .populate('items.item')
        .populate('customerName')
        .populate('cargo')
        .populate('rolledBy', 'name username')
        .populate('returnOf', 'createdAt billNumber status')
        .sort(sortSpec)
        .skip(skip)
        .limit(limitNum);
      total = await Order.countDocuments(query);
    }

    // Conditionally populate createdBy for salesmen
    for (let order of orders) {
      if (order.createdByType === 'salesman') {
        await order.populate({ path: 'createdBy', model: 'Salesman', select: '-password' });
      }
    }

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single order
exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.item')
      .populate('customerName')
      .populate('cargo')
      .populate('returnOf', 'createdAt billNumber status');
    
    // Conditionally populate createdBy if it's a salesman
    if (order && order.createdByType === 'salesman') {
      await order.populate({ path: 'createdBy', model: 'Salesman', select: '-password' });
    }
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // Align with getAllOrders: salesman sees own orders or any "to roll" order
    if (req.user.role === 'salesman') {
      const creatorId =
        order.createdByType === 'salesman'
          ? String(order.createdBy?._id ?? order.createdBy)
          : null;
      const isOwn = creatorId === String(req.user.id);
      const isSharedToRoll = order.status === 'to roll';
      if (!isOwn && !isSharedToRoll) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
    }

    // Rollers only see sell orders that have been queued for rolling
    if (req.user.role === 'roller' && (order.type !== 'sell order' || !ROLLER_VISIBLE_STATUSES.includes(order.status))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// What can still come back from one sell order — feeds the admin's "record a
// return" form: the order itself plus, per item, sold / already returned /
// still returnable.
exports.getReturnable = async (req, res) => {
  try {
    const check = await returnableLinesFor(req.params.id);
    if (check.error) {
      return res.status(check.status).json({ success: false, message: check.error });
    }
    res.status(200).json({
      success: true,
      data: { order: check.original, items: check.lines }
    });
  } catch (error) {
    console.error('Get returnable error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// What is on the raks for each item of one order, with the oldest-first split
// already worked out — this is what fills the roller's "pick the raks" dialog
// before an order is marked "rolled".
exports.getRakAllocation = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.item', 'name category quantity');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.type !== 'sell order') {
      return res.status(400).json({
        success: false,
        message: 'Only sell orders take stock off the raks'
      });
    }

    const items = [];
    for (const orderItem of order.items) {
      const itemId = orderItem.item?._id || orderItem.item;

      // Same order consumePlacedStock would walk, so the suggestion below is
      // exactly what happens if the admin changes nothing
      const placements = await Placement.find({ item: itemId })
        .populate('rak', 'name code capacity')
        .sort({ createdAt: 1, _id: 1 });

      let left = orderItem.quantity;
      const raks = placements
        .filter((p) => p.rak)
        .map((p) => {
          const suggested = Math.min(p.quantity, left);
          left -= suggested;
          return {
            rak: p.rak,
            available: p.quantity,
            suggested,
            placedAt: p.createdAt,
            placedByName: p.placedByName
          };
        });

      items.push({
        item: orderItem.item,
        quantity: orderItem.quantity,
        placedQty: raks.reduce((sum, r) => sum + r.available, 0),
        // What the raks cannot cover — that stock was never put away, so there
        // is nothing to take off a shelf for it
        shortfall: left,
        raks
      });
    }

    res.status(200).json({
      success: true,
      data: {
        orderId: order._id,
        status: order.status,
        alreadyConsumed: order.placementsConsumed,
        items
      }
    });

  } catch (error) {
    console.error('Get rak allocation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Checks the roller's hand-picked rak quantities against the order before any
// of it reaches the database. Returns { entries } for the picks to apply, entries
// null when the caller sent none (meaning: fall back to oldest-first), or
// { error } with a message to hand back.
//
// Taking less than was ordered is allowed on purpose — an item may only be
// part-placed, and the rest simply never sat on a shelf.
const parseRakAllocation = (raw, order) => {
  if (raw === undefined || raw === null) return { entries: null };
  if (!Array.isArray(raw)) return { error: 'Rak selection must be a list' };

  const orderedByItem = new Map();
  for (const orderItem of order.items) {
    const key = String(orderItem.item?._id || orderItem.item);
    orderedByItem.set(key, (orderedByItem.get(key) || 0) + orderItem.quantity);
  }

  const seen = new Set();
  const runningByItem = new Map();
  const entries = [];

  for (const row of raw) {
    const item = String(row?.item || '');
    const rak = String(row?.rak || '');
    const quantity = Number(row?.quantity);

    if (!mongoose.Types.ObjectId.isValid(item) || !mongoose.Types.ObjectId.isValid(rak)) {
      return { error: 'Every rak selection needs a valid item and rak' };
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      return { error: 'Rak quantities must be whole numbers of zero or more' };
    }
    if (quantity === 0) continue;

    const ordered = orderedByItem.get(item);
    if (ordered === undefined) {
      return { error: 'Rak selection refers to an item that is not on this order' };
    }

    const key = `${item}|${rak}`;
    if (seen.has(key)) {
      return { error: 'The same rak is listed twice for one item' };
    }
    seen.add(key);

    const running = (runningByItem.get(item) || 0) + quantity;
    if (running > ordered) {
      return { error: `That takes ${running} off the raks but only ${ordered} was ordered` };
    }
    runningByItem.set(item, running);

    entries.push({ item, rak, quantity });
  }

  return { entries };
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status, rakAllocation, billNumber } = req.body;

    const order = await Order.findById(req.params.id)
      .populate('customerName');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // Valid status transitions based on order type
    const validTransitions = order.type === 'purchase order'
      ? { 'pending': ['completed'] }
      : order.type === 'return order'
      ? { 'pending': ['completed', 'cancelled'] }
      : {
          'pending': ['to roll'],
          'to roll': ['rolled'],
          'rolled': ['billed'],
          'billed': ['delivered']
        };

    // Salesman can only update "to roll" → "rolled"
    if (req.user.role === 'salesman') {
      if (order.status !== 'to roll' || status !== 'rolled') {
        return res.status(403).json({
          success: false,
          message: 'Salesmen can only update orders from "to roll" to "rolled"'
        });
      }
    }

    // Roller owns exactly one transition: "to roll" → "rolled"
    if (req.user.role === 'roller') {
      if (order.status !== 'to roll' || status !== 'rolled') {
        return res.status(403).json({
          success: false,
          message: 'Rollers can only update orders from "to roll" to "rolled"'
        });
      }
    }

    // Accounts manager owns the desk-side moves: queueing a fresh sell order
    // for rolling, billing a rolled one, and completing a purchase order
    if (req.user.role === 'accounts') {
      const allowed = order.type === 'purchase order'
        ? (order.status === 'pending' && status === 'completed')
        : (order.status === 'pending' && status === 'to roll') ||
          (order.status === 'rolled' && status === 'billed');
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'Accounts managers can only move sell orders from "pending" to "to roll" and from "rolled" to "billed", and purchase orders from "pending" to "completed"'
        });
      }
    }

    // Customer relation manager owns one move: confirming a billed sell order
    // as delivered
    if (req.user.role === 'crm') {
      if (order.type !== 'sell order' || order.status !== 'billed' || status !== 'delivered') {
        return res.status(403).json({
          success: false,
          message: 'CRM managers can only move sell orders from "billed" to "delivered"'
        });
      }
    }

    // Completing or cancelling a return is the admin's call — it moves stock
    // and leaderboard points
    if (order.type === 'return order' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only an admin can complete or cancel a return order'
      });
    }

    // Check valid transition
    if (!validTransitions[order.status] || !validTransitions[order.status].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot transition from ${order.status} to ${status}` 
      });
    }

    // Billing is the one move that carries data with it: the bill number has
    // to be typed in by whoever bills the order, whatever their role.
    const bill = String(billNumber ?? '').trim();
    if (status === 'billed' && !/^\d{1,10}$/.test(bill)) {
      return res.status(400).json({
        success: false,
        message: 'A bill number (digits only) is required to mark an order as billed'
      });
    }

    // Completing a return is where its pieces are counted for good: the admin
    // reconfirms, line by line, how many go back into stock and how many are
    // damaged, and every line has to add up to what came back.
    let returnSplit = null;
    if (order.type === 'return order' && status === 'completed') {
      const sent = Array.isArray(req.body.split) ? req.body.split : [];
      const byItem = new Map(sent.map((s) => [String(s?.item), s]));
      if (sent.length !== order.items.length || byItem.size !== order.items.length) {
        return res.status(400).json({
          success: false,
          message: 'Confirm how many pieces of every returned item go back to stock and how many are damaged'
        });
      }
      const names = new Map(
        (await Item.find({ _id: { $in: order.items.map((l) => l.item) } }).select('name'))
          .map((i) => [String(i._id), i.name])
      );
      returnSplit = new Map();
      for (const line of order.items) {
        const key = String(line.item);
        const entry = byItem.get(key);
        if (!entry) {
          return res.status(400).json({ success: false, message: 'The confirmed split lists an item that is not on this return' });
        }
        const splitError = returnSplitError(
          entry.restockQuantity, entry.damagedQuantity, line.quantity, names.get(key) || 'Deleted item'
        );
        if (splitError) return res.status(400).json({ success: false, message: splitError });
        returnSplit.set(key, { restock: entry.restockQuantity, damaged: entry.damagedQuantity });
      }
    }

    const previousStatus = order.status;

    // The roller may hand-pick which raks give the stock up. Anything they did
    // not send falls through to oldest-first, so the admin screen and any
    // other caller keep working untouched.
    const { entries: picked, error: pickError } = parseRakAllocation(rakAllocation, order);
    if (pickError) {
      return res.status(400).json({ success: false, message: pickError });
    }

    // Everything that has to move together — the status itself, the rak
    // deduction for "rolled" and the stock top-up for a completed purchase
    // order — is written inside one transaction, so a crash can never leave
    // the raks out of step with the order.
    const session = await mongoose.startSession();
    session.startTransaction();
    let raksChanged = false;
    let itemsChanged = false;
    try {
      // Re-read under the transaction. Two people advancing the same order at
      // once (or a double-tapped button) both passed the checks above against
      // the same stale copy; whoever gets here second finds the status already
      // moved and is turned away instead of deducting the raks twice.
      const fresh = await Order.findById(order._id).session(session);
      if (!fresh || fresh.status !== previousStatus) {
        await session.abortTransaction();
        return res.status(409).json({
          success: false,
          message: 'This order was just updated by someone else. Refresh and try again.'
        });
      }

      fresh.status = status;
      if (status === 'billed') fresh.billNumber = bill;
      // A (re)queued order is new to the rollers again
      if (status === 'to roll') fresh.rollerSeenAt = null;
      if (status === 'rolled') fresh.rolledBy = req.user.role === 'roller' ? req.user.id : null;

      // A sell order leaves its raks when the roller marks it rolled — that is
      // the moment the material has physically come off the shelf, not when
      // the order was taken or queued. Oldest rak first unless the roller
      // picked otherwise; whatever is not on a rak is simply not there to
      // relieve. placementsConsumed makes this idempotent across a revert and
      // a second advance.
      if (fresh.type === 'sell order' && status === 'rolled' && !fresh.placementsConsumed) {
        let taken;
        if (picked) {
          taken = await consumeFromRaks(picked, session);
        } else {
          taken = [];
          for (const orderItem of fresh.items) {
            taken.push(...await consumePlacedStock(orderItem.item, orderItem.quantity, session));
          }
        }
        fresh.rakConsumption = taken;
        fresh.placementsConsumed = true;
        raksChanged = true;
      }

      // A completed return records the split it was confirmed with, then puts
      // the saleable pieces back into stock and the rest on the damaged list
      if (returnSplit) {
        for (const line of fresh.items) {
          const { restock, damaged } = returnSplit.get(String(line.item));
          line.restockQuantity = restock;
          line.damagedQuantity = damaged;
          if (restock > 0) {
            await Item.findByIdAndUpdate(line.item, { $inc: { quantity: restock } }, { session });
          }
          if (damaged > 0) {
            await DamagedItem.findOneAndUpdate(
              { item: line.item },
              { $inc: { quantity: damaged } },
              { upsert: true, setDefaultsOnInsert: true, session }
            );
          }
        }
        fresh.restocked = fresh.items.some((l) => l.restockQuantity > 0);
        itemsChanged = true;
      }

      await fresh.save({ session });

      // If purchase order is completed, add items to inventory
      if (fresh.type === 'purchase order' && status === 'completed' && previousStatus !== 'completed') {
        for (const orderItem of fresh.items) {
          await Item.findByIdAndUpdate(
            orderItem.item,
            { $inc: { quantity: orderItem.quantity } },
            { session }
          );
        }
      }

      order.status = fresh.status;
      order.billNumber = fresh.billNumber;
      order.placementsConsumed = fresh.placementsConsumed;
      order.rakConsumption = fresh.rakConsumption;
      order.rolledBy = fresh.rolledBy;
      if (returnSplit) {
        for (const line of order.items) {
          const { restock, damaged } = returnSplit.get(String(line.item));
          line.restockQuantity = restock;
          line.damagedQuantity = damaged;
        }
        order.restocked = fresh.restocked;
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally {
      session.endSession();
    }

    // If status is delivered, send WhatsApp message
    if (status === 'delivered' && order.customerName) {
      await sendWhatsAppMessage(
        order.customerName.phone,
        order.customerName.name
      );
    }

    // Conditionally populate createdBy if it's a salesman
    const populateOptions = [
      { path: 'items.item' },
      { path: 'cargo' },
      { path: 'rolledBy', select: 'name username' }
    ];
    
    if (order.createdByType === 'salesman') {
      populateOptions.unshift({ path: 'createdBy', model: 'Salesman', select: '-password' });
    }
    
    await order.populate(populateOptions);

    getIO().emit('orders_updated');
    if (itemsChanged) getIO().emit('items_updated');
    if (raksChanged) {
      // The roller's rak screens are now showing stale occupancy
      getIO().emit('placements_updated');
      getIO().emit('raks_updated');
    }

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: order
    });

  } catch (error) {
    // A rejected rak pick is the caller's problem, not a server fault — no
    // point filling the log with a stack trace for it
    if (!error.status) console.error('Update order status error:', error);
    res.status(error.status || 500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Update order (Admin only)
exports.updateOrder = async (req, res) => {
  try {
    const { items, customerName, cargo, status, notes } = req.body;
    
    // Validate items structure if items are being updated
    if (items !== undefined) {
      if (!Array.isArray(items)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Items must be an array' 
        });
      }

      if (items.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Items array must not be empty' 
        });
      }

      // Validate items structure - each item must be an object with item and quantity
      for (let i = 0; i < items.length; i++) {
        if (typeof items[i] === 'string') {
          return res.status(400).json({ 
            success: false, 
            message: `Invalid items format. Each item must be an object with 'item' (ID) and 'quantity' properties, not a string. Error at index ${i}` 
          });
        }
        if (!items[i].item || !items[i].quantity) {
          return res.status(400).json({ 
            success: false, 
            message: `Each item must have 'item' (ID) and 'quantity' properties. Error at index ${i}` 
          });
        }
        if (typeof items[i].quantity !== 'number' || items[i].quantity < 1) {
          return res.status(400).json({ 
            success: false, 
            message: `Item quantity must be a number greater than 0. Error at index ${i}` 
          });
        }
        
        // Verify that the item exists
        const itemExists = await Item.findById(items[i].item);
        if (!itemExists) {
          return res.status(404).json({ 
            success: false, 
            message: `Item with ID ${items[i].item} not found. Error at index ${i}` 
          });
        }
      }
    }

    // Validate the referenced party against the right collection for the order type
    const existingOrder = await Order.findById(req.params.id).select('type');
    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    const customerModel = existingOrder.type === 'purchase order' ? 'Vendor' : 'Customer';

    // A return's lines were checked against its source order and may already
    // have gone back into stock and off the leaderboard — they are not edited
    // in place. Delete the return and record it again instead.
    if (existingOrder.type === 'return order' && (items !== undefined || customerName !== undefined || status !== undefined)) {
      return res.status(400).json({
        success: false,
        message: 'The items, customer and status of a return order cannot be changed — delete it and record the return again'
      });
    }

    if (customerName !== undefined && customerName) {
      if (customerModel === 'Customer') {
        const customer = await Customer.findById(customerName);
        if (!customer) {
          return res.status(404).json({
            success: false,
            message: 'Customer not found'
          });
        }
        if (customer.isBlocked) {
          return res.status(400).json({
            success: false,
            message: 'Cannot assign order to blocked customer'
          });
        }
      } else {
        const vendor = await Vendor.findById(customerName);
        if (!vendor) {
          return res.status(404).json({
            success: false,
            message: 'Vendor not found'
          });
        }
      }
    }

    const updateData = {};
    if (items !== undefined) updateData.items = items;
    if (customerName !== undefined) {
      updateData.customerName = customerName;
      updateData.customerModel = customerModel;
    }
    if (cargo !== undefined) updateData.cargo = cargo || null;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes || null;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('items.item')
      .populate('customerName')
      .populate('cargo');
    
    // Conditionally populate createdBy if it's a salesman
    if (order && order.createdByType === 'salesman') {
      await order.populate({ path: 'createdBy', model: 'Salesman', select: '-password' });
    }

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    getIO().emit('orders_updated');

    res.status(200).json({
      success: true,
      message: 'Order updated successfully',
      data: order
    });

  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};

// Delete order (Admin only)
exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    getIO().emit('orders_updated');

    res.status(200).json({
      success: true,
      message: 'Order deleted successfully'
    });

  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
};

// Revert order status — admin, and rollers for "rolled" → "to roll" only
// Moves the order one step backward in the status chain
exports.revertOrderStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = await Order.findById(req.params.id).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const revertMap = {
      'sell order': {
        'to roll':  'pending',
        'rolled':   'to roll',
        'billed':   'rolled',
        'delivered': 'billed'
      },
      'purchase order': {
        'completed': 'pending'
      },
      // Re-opens a completed return: its points go back on the leaderboard,
      // restocked pieces come back out of stock and damaged pieces off the
      // damaged list
      'return order': {
        'completed': 'pending'
      }
    };

    // A roller may only take back their own step
    if (req.user.role === 'roller' && !(order.type === 'sell order' && order.status === 'rolled')) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: 'Rollers can only revert rolled orders back to "to roll"'
      });
    }

    const prevStatus = revertMap[order.type]?.[order.status];
    if (!prevStatus) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Cannot revert order with status "${order.status}"`
      });
    }

    // If reverting a completed purchase order, deduct the stock that was added
    if (order.type === 'purchase order' && order.status === 'completed') {
      for (const orderItem of order.items) {
        await Item.findByIdAndUpdate(
          orderItem.item,
          { $inc: { quantity: -orderItem.quantity } },
          { session }
        );
      }
    }

    // Reverting a completed return takes back exactly what completing it put
    // in: restocked pieces out of stock, damaged pieces off the damaged list.
    // The split stays on the lines, ready to be reconfirmed. Damaged pieces
    // already restored since cannot be taken back, so the revert is refused.
    let itemsChanged = false;
    if (order.type === 'return order' && order.status === 'completed') {
      for (const line of order.items) {
        const { restock, damaged } = returnSplitOf(order, line);
        if (restock > 0) {
          await Item.findByIdAndUpdate(line.item, { $inc: { quantity: -restock } }, { session });
        }
        if (damaged > 0) {
          const taken = await DamagedItem.findOneAndUpdate(
            { item: line.item, quantity: { $gte: damaged } },
            { $inc: { quantity: -damaged } },
            { session }
          );
          if (!taken) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              success: false,
              message: 'Some damaged pieces from this return are no longer on the damaged list (restored to stock since), so it cannot be reverted'
            });
          }
        }
      }
      itemsChanged = true;
    }

    // Undoing "rolled" puts the material back on the very raks it came off, so
    // a mis-tapped button costs nothing. Leaving the order's own stock
    // deduction alone is correct — the order is still live, it has just gone
    // back to the roll queue.
    let raksChanged = false;
    if (order.type === 'sell order' && order.status === 'rolled' && order.placementsConsumed) {
      await restorePlacedStock(order.rakConsumption, session);
      order.rakConsumption = [];
      order.placementsConsumed = false;
      raksChanged = true;
    }
    if (order.status === 'rolled') order.rolledBy = null;

    // Undoing "billed" voids the bill number typed in for it; the next billing
    // pass asks for one afresh.
    if (order.status === 'billed') order.billNumber = null;

    order.status = prevStatus;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    getIO().emit('orders_updated');
    if (itemsChanged) getIO().emit('items_updated');
    if (raksChanged) {
      getIO().emit('placements_updated');
      getIO().emit('raks_updated');
    }

    res.status(200).json({
      success: true,
      message: `Order status reverted to "${prevStatus}"`,
      data: order
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Revert order status error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Request cancellation — salesman only
// Allowed for sell orders in: pending, to roll
exports.requestCancellation = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Only the salesman who created the order can request cancellation
    // Admin-created orders can be cancelled by any salesman
    if (req.user.role === 'salesman' && order.createdByType === 'salesman') {
      const creatorId = String(order.createdBy);
      if (creatorId !== String(req.user.id)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const allowedStatuses = ['pending', 'to roll'];
    if (!allowedStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cancellation request is only allowed for orders in: ${allowedStatuses.join(', ')}`
      });
    }

    order.previousStatus = order.status;
    order.status = 'cancellation_requested';
    await order.save();

    await sendPushNotification(
      `Cancellation requested for an order`,
      { orderId: order._id, action: 'cancellation_requested' }
    );

    res.status(200).json({ success: true, message: 'Cancellation request submitted', data: order });
  } catch (error) {
    console.error('Request cancellation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Approve cancellation — admin and accounts manager
// Restores stock for sell orders, then marks order cancelled
exports.approveCancellation = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const order = await Order.findById(req.params.id).session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'cancellation_requested') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Order does not have a pending cancellation request'
      });
    }

    // Restore stock for sell orders
    let raksChanged = false;
    if (order.type === 'sell order') {
      for (const orderItem of order.items) {
        await Item.findByIdAndUpdate(
          orderItem.item,
          { $inc: { quantity: orderItem.quantity } },
          { session }
        );
      }

      // Cancellation stops at "to roll" today, before any rak is touched, so
      // this is a guard: should an order that already gave up its rak space
      // ever be cancelled, hand that back too, or the stock would come home
      // as unplaced and need putting away by hand.
      if (order.placementsConsumed) {
        await restorePlacedStock(order.rakConsumption, session);
        order.rakConsumption = [];
        order.placementsConsumed = false;
        raksChanged = true;
      }
    }

    order.status = 'cancelled';
    order.previousStatus = null;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    getIO().emit('orders_updated');
    if (raksChanged) {
      getIO().emit('placements_updated');
      getIO().emit('raks_updated');
    }

    res.status(200).json({ success: true, message: 'Order cancelled successfully', data: order });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Approve cancellation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Reject cancellation — admin only
// Reverts order back to its previous status
exports.rejectCancellation = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'cancellation_requested') {
      return res.status(400).json({
        success: false,
        message: 'Order does not have a pending cancellation request'
      });
    }

    const restoredStatus = order.previousStatus || 'pending';
    order.status = restoredStatus;
    order.previousStatus = null;
    await order.save();

    res.status(200).json({ success: true, message: 'Cancellation request rejected', data: order });
  } catch (error) {
    console.error('Reject cancellation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Get dashboard stats (Admin and accounts manager)
exports.getDashboardStats = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const toRollOrders = await Order.countDocuments({ status: 'to roll' });
    const rolledOrders = await Order.countDocuments({ status: 'rolled' });
    const billedOrders = await Order.countDocuments({ status: 'billed' });
    const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
    const completedOrders = await Order.countDocuments({ status: 'completed' });
    const cancellationRequestedOrders = await Order.countDocuments({ status: 'cancellation_requested' });
    const cancelledOrders = await Order.countDocuments({ status: 'cancelled' });
    
    const totalSalesmen = await Salesman.countDocuments();
    const totalCustomers = await Customer.countDocuments();

    // Safety stock: items at or below their (own or inherited) check level,
    // plus categories whose total stock has fallen to their check level
    const levelsByCategory = await categoryCheckLevels();
    const belowQuery = belowCheckLevelQuery(levelsByCategory);
    const itemsBelowCheck = await Item.find(belowQuery)
      .select('name category quantity price checkLevel')
      .sort({ quantity: 1 })
      .lean();

    const categoryStock = await Item.aggregate([
      { $group: { _id: { $ifNull: ['$category', ''] }, stockQty: { $sum: { $ifNull: ['$quantity', 0] } } } }
    ]);
    const categoriesBelowCheck = categoryStock
      .filter((c) => levelsByCategory.has(c._id) && c.stockQty <= levelsByCategory.get(c._id))
      .map((c) => ({ category: c._id, stockQty: c.stockQty, checkLevel: levelsByCategory.get(c._id) }))
      .sort((a, b) => a.stockQty - b.stockQty);

    // Get monthly trend data for last 6 months
    const monthlyTrends = [];
    const currentDate = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const startDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const endDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);
      
      const monthOrders = await Order.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      });
      
      const monthDelivered = await Order.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'delivered'
      });
      
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      monthlyTrends.push({
        month: monthNames[monthDate.getMonth()],
        orders: monthOrders,
        delivered: monthDelivered
      });
    }

    res.status(200).json({
      success: true,
      data: {
        orders: {
          total: totalOrders,
          pending: pendingOrders,
          toRoll: toRollOrders,
          rolled: rolledOrders,
          billed: billedOrders,
          delivered: deliveredOrders,
          completed: completedOrders,
          cancellationRequested: cancellationRequestedOrders,
          cancelled: cancelledOrders
        },
        salesmen: totalSalesmen,
        customers: totalCustomers,
        trends: monthlyTrends,
        stockAlerts: {
          itemsBelow: itemsBelowCheck.length,
          categoriesBelow: categoriesBelowCheck.length,
          // Worst-off first, enough for a dashboard panel
          items: itemsBelowCheck.slice(0, 8).map((it) => decorateCheckLevel(it, levelsByCategory)),
          categories: categoriesBelowCheck.slice(0, 8)
        }
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Consolidation report - Admin only
// Aggregates orders (optionally filtered by date range, type, status, item,
// order quantity, booking salesman) into summary totals, status/trend/item/party
// breakdowns, plus unfiltered entity counts describing the overall project
// structure and the check-level (safety stock) state of the catalog.
exports.getConsolidationReport = async (req, res) => {
  try {
    const { startDate, endDate, type, status, item, minQty, maxQty, salesman } = req.query;

    const match = {};
    if (type) match.type = type;
    if (status) match.status = status;

    // Orders booked by one salesman. createdBy is a Mixed field — older rows
    // hold the id as a string, newer ones as an ObjectId — so match both.
    if (salesman && mongoose.Types.ObjectId.isValid(salesman)) {
      match.createdByType = 'salesman';
      match.createdBy = { $in: [salesman, new mongoose.Types.ObjectId(salesman)] };
    }

    let rangeStart = null;
    let rangeEnd = null;
    if (startDate) {
      const s = new Date(startDate);
      if (!isNaN(s)) rangeStart = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    }
    if (endDate) {
      const e = new Date(endDate);
      if (!isNaN(e)) rangeEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999);
    }
    if (rangeStart || rangeEnd) {
      match.createdAt = {};
      if (rangeStart) match.createdAt.$gte = rangeStart;
      if (rangeEnd) match.createdAt.$lte = rangeEnd;
    }

    let itemId = null;
    if (item && mongoose.Types.ObjectId.isValid(item)) {
      itemId = new mongoose.Types.ObjectId(item);
      match['items.item'] = itemId;
    }

    // Daily buckets for ranges up to ~3 months, monthly otherwise
    const dayMs = 24 * 60 * 60 * 1000;
    const granularity = rangeStart && rangeEnd && (rangeEnd - rangeStart) <= 92 * dayMs ? 'day' : 'month';
    const bucketFormat = granularity === 'day' ? '%Y-%m-%d' : '%Y-%m';

    const pipeline = [
      { $match: match },
      { $addFields: { totalQty: { $sum: '$items.quantity' } } }
    ];

    const minQ = parseInt(minQty);
    const maxQ = parseInt(maxQty);
    if (!isNaN(minQ)) pipeline.push({ $match: { totalQty: { $gte: minQ } } });
    if (!isNaN(maxQ)) pipeline.push({ $match: { totalQty: { $lte: maxQ } } });

    pipeline.push({
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              totalQty: { $sum: '$totalQty' },
              avgQty: { $avg: '$totalQty' },
              sellOrders: { $sum: { $cond: [{ $eq: ['$type', 'sell order'] }, 1, 0] } },
              purchaseOrders: { $sum: { $cond: [{ $eq: ['$type', 'purchase order'] }, 1, 0] } },
              parties: { $addToSet: '$customerName' }
            }
          },
          {
            $project: {
              _id: 0,
              orders: 1,
              totalQty: 1,
              avgQty: 1,
              sellOrders: 1,
              purchaseOrders: 1,
              uniqueParties: {
                $size: { $filter: { input: '$parties', cond: { $ne: ['$$this', null] } } }
              }
            }
          }
        ],
        statusBreakdown: [
          { $group: { _id: '$status', orders: { $sum: 1 }, qty: { $sum: '$totalQty' } } },
          { $project: { _id: 0, status: '$_id', orders: 1, qty: 1 } }
        ],
        trend: [
          {
            $group: {
              _id: { $dateToString: { format: bucketFormat, date: '$createdAt' } },
              orders: { $sum: 1 },
              qty: { $sum: '$totalQty' }
            }
          },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, period: '$_id', orders: 1, qty: 1 } }
        ],
        itemBreakdown: [
          { $unwind: '$items' },
          ...(itemId ? [{ $match: { 'items.item': itemId } }] : []),
          {
            $group: {
              _id: '$items.item',
              qty: { $sum: '$items.quantity' },
              orders: { $sum: 1 }
            }
          },
          { $lookup: { from: 'items', localField: '_id', foreignField: '_id', as: 'itemDoc' } },
          { $unwind: { path: '$itemDoc', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              itemId: '$_id',
              name: { $ifNull: ['$itemDoc.name', 'Deleted item'] },
              category: { $ifNull: ['$itemDoc.category', ''] },
              price: { $ifNull: ['$itemDoc.price', 0] },
              qty: 1,
              orders: 1,
              value: { $multiply: ['$qty', { $ifNull: ['$itemDoc.price', 0] }] }
            }
          },
          { $sort: { qty: -1 } }
        ],
        // Rolled-up twin of itemBreakdown — 800+ items collapse into a handful
        // of categories, which is what the detailed summary needs
        categoryBreakdown: [
          { $unwind: '$items' },
          ...(itemId ? [{ $match: { 'items.item': itemId } }] : []),
          { $lookup: { from: 'items', localField: 'items.item', foreignField: '_id', as: 'itemDoc' } },
          { $unwind: { path: '$itemDoc', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: { $ifNull: ['$itemDoc.category', ''] },
              qty: { $sum: '$items.quantity' },
              value: {
                $sum: { $multiply: ['$items.quantity', { $ifNull: ['$itemDoc.price', 0] }] }
              },
              sellQty: {
                $sum: { $cond: [{ $eq: ['$type', 'sell order'] }, '$items.quantity', 0] }
              },
              purchaseQty: {
                $sum: { $cond: [{ $eq: ['$type', 'purchase order'] }, '$items.quantity', 0] }
              },
              itemIds: { $addToSet: '$items.item' },
              orderIds: { $addToSet: '$_id' }
            }
          },
          {
            $project: {
              _id: 0,
              category: { $cond: [{ $in: ['$_id', ['', null]] }, 'Uncategorised', '$_id'] },
              qty: 1,
              value: 1,
              sellQty: 1,
              purchaseQty: 1,
              items: { $size: '$itemIds' },
              orders: { $size: '$orderIds' }
            }
          },
          { $sort: { qty: -1 } }
        ],
        topParties: [
          { $match: { customerName: { $ne: null } } },
          {
            $group: {
              _id: { id: '$customerName', model: '$customerModel' },
              orders: { $sum: 1 },
              qty: { $sum: '$totalQty' }
            }
          },
          { $sort: { orders: -1 } },
          { $limit: 8 },
          { $lookup: { from: 'customers', localField: '_id.id', foreignField: '_id', as: '_c' } },
          { $lookup: { from: 'vendors', localField: '_id.id', foreignField: '_id', as: '_v' } },
          {
            $project: {
              _id: 0,
              name: {
                $ifNull: [
                  { $first: '$_c.name' },
                  { $ifNull: [{ $first: '$_v.name' }, 'Unknown'] }
                ]
              },
              partyType: { $cond: [{ $eq: ['$_id.model', 'Vendor'] }, 'Vendor', 'Customer'] },
              orders: 1,
              qty: 1
            }
          }
        ]
      }
    });

    const [result] = await Order.aggregate(pipeline);

    const [totalOrders, totalItems, totalCustomers, totalVendors, totalSalesmen, totalCargo, catalogItems, categories] =
      await Promise.all([
        Order.countDocuments(),
        Item.countDocuments(),
        Customer.countDocuments(),
        Vendor.countDocuments(),
        Salesman.countDocuments(),
        Cargo.countDocuments(),
        // Catalog side of the summary — the whole item master, independent of
        // the order filters, so stock and check levels are always in view
        Item.find().select('name category quantity price checkLevel').lean(),
        Category.find().select('name checkLevel').lean()
      ]);

    const levelsByCategory = new Map(
      categories.filter((c) => c.checkLevel !== null && c.checkLevel !== undefined)
        .map((c) => [c.name, c.checkLevel])
    );

    // Per-category catalog rows: item count, stock on hand, its own check level
    // and how many of its items are sitting at or below theirs
    const catalogByCategory = new Map();
    const itemMeta = new Map();
    for (const it of catalogItems) {
      const name = it.category || 'Uncategorised';
      if (!catalogByCategory.has(name)) {
        catalogByCategory.set(name, {
          category: name,
          items: 0,
          stockQty: 0,
          stockValue: 0,
          checkLevel: levelsByCategory.has(name) ? levelsByCategory.get(name) : null,
          itemsBelowCheck: 0
        });
      }
      const row = catalogByCategory.get(name);
      const qty = it.quantity || 0;
      row.items += 1;
      row.stockQty += qty;
      row.stockValue += qty * (it.price || 0);

      const decorated = decorateCheckLevel(it, levelsByCategory);
      if (decorated.belowCheckLevel) row.itemsBelowCheck += 1;
      itemMeta.set(String(it._id), {
        stockQty: qty,
        checkLevel: decorated.effectiveCheckLevel,
        belowCheckLevel: decorated.belowCheckLevel
      });
    }

    const categoryCatalog = [...catalogByCategory.values()]
      .map((row) => ({
        ...row,
        // A category is below its line when its total stock has fallen to it
        belowCheckLevel: row.checkLevel !== null && row.stockQty <= row.checkLevel
      }))
      .sort((a, b) => b.items - a.items);

    // Carry the same stock/check-level facts onto the ordered-items table
    const itemBreakdown = result.itemBreakdown.map((row) => {
      const meta = itemMeta.get(String(row.itemId)) || {};
      return {
        ...row,
        stockQty: meta.stockQty ?? 0,
        checkLevel: meta.checkLevel ?? null,
        belowCheckLevel: Boolean(meta.belowCheckLevel)
      };
    });

    const summary = result.summary[0] || {
      orders: 0, totalQty: 0, avgQty: 0, sellOrders: 0, purchaseOrders: 0, uniqueParties: 0
    };
    summary.totalValue = itemBreakdown.reduce((sum, row) => sum + (row.value || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        structure: {
          orders: totalOrders,
          items: totalItems,
          customers: totalCustomers,
          vendors: totalVendors,
          salesmen: totalSalesmen,
          cargo: totalCargo
        },
        summary,
        statusBreakdown: result.statusBreakdown,
        trend: result.trend,
        granularity,
        itemBreakdown,
        categoryBreakdown: result.categoryBreakdown,
        categoryCatalog,
        // Catalog-wide safety-stock picture, unaffected by the order filters
        stockHealth: {
          itemsTracked: [...itemMeta.values()].filter((m) => m.checkLevel !== null).length,
          itemsBelow: [...itemMeta.values()].filter((m) => m.belowCheckLevel).length,
          categoriesTracked: categoryCatalog.filter((c) => c.checkLevel !== null).length,
          categoriesBelow: categoryCatalog.filter((c) => c.belowCheckLevel).length
        },
        topParties: result.topParties
      }
    });

  } catch (error) {
    console.error('Get consolidation report error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

