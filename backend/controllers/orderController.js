const mongoose = require('mongoose');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Salesman = require('../models/Salesman');
const Item = require('../models/Item');
const Cargo = require('../models/Cargo');
const Category = require('../models/Category');
const axios = require('axios');
const { getIO } = require('../socket');
const { consumePlacedStock } = require('../utils/placementMath');
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

    // Sell orders reference a Customer, purchase orders reference a Vendor
    const customerModel = type === 'purchase order' ? 'Vendor' : 'Customer';

    if (customerName) {
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

        // The stock that just left also leaves whichever rak(s) it was sitting
        // in, so the rak never shows more placed than physically remains.
        await consumePlacedStock(itemId, requestedQty, session);
      }
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
      items,
      customerName,
      customerModel,
      cargo: cargo || null,
      notes: notes || null,
      createdBy: req.user.role === 'salesman' ? req.user.id : 'Admin',
      createdByType: req.user.role === 'admin' ? 'admin' : 'salesman',
      status: 'pending'
    });

    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Populate references (conditionally populate createdBy only if it's a salesman)
    const populateOptions = [
      { path: 'items.item' },
      { path: 'customerName' },
      { path: 'cargo' }
    ];
    
    if (order.createdByType === 'salesman') {
      populateOptions.unshift({ path: 'createdBy', model: 'Salesman', select: '-password' });
    }
    
    await order.populate(populateOptions);

    // Send push notification to admin
    const salesmanName = req.user.role === 'salesman' ? req.user.name : 'Admin';
    await sendPushNotification(
      `New order placed by ${salesmanName}`,
      {
        orderId: order._id,
        salesmanName,
        type: order.type
      }
    );

    getIO().emit('orders_updated');
    if (type === 'sell order') {
      // Rak occupancy may have just changed underneath the roller's screen
      getIO().emit('placements_updated');
      getIO().emit('raks_updated');
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
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

// Get all orders
exports.getAllOrders = async (req, res) => {
  try {
    const { status, type, month, year, date, search, sort = 'newest', page = 1, limit = 10 } = req.query;

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

    // Rollers only ever see the queue they work on
    if (req.user.role === 'roller') {
      conditions.push({ status: 'to roll' });
    } else if (status) {
      conditions.push({ status });
    }
    if (type) conditions.push({ type });

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

    // Search by customer/vendor name or order id
    if (search && search.trim()) {
      const regex = { $regex: escapeRegex(search.trim()), $options: 'i' };
      const [customerIds, vendorIds] = await Promise.all([
        Customer.find({ name: regex }).select('_id').lean(),
        Vendor.find({ name: regex }).select('_id').lean()
      ]);
      const partyIds = [...customerIds, ...vendorIds].map((d) => d._id);
      const searchOr = [{ customerName: { $in: partyIds } }];
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
      qty_asc: { totalQty: 1, createdAt: -1 }
    };
    const sortSpec = sortSpecs[sort] || sortSpecs.newest;
    const needsComputedSort = ['name_asc', 'name_desc', 'qty_desc', 'qty_asc'].includes(sort);

    let orders;
    let total;

    if (needsComputedSort) {
      // Sort by computed fields (party name / total quantity) via aggregation,
      // then hydrate the page of ids with a normal populated find
      const pipeline = [
        { $match: query },
        { $addFields: { totalQty: { $sum: '$items.quantity' } } },
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
        .populate('cargo');
      const byId = new Map(found.map((o) => [String(o._id), o]));
      orders = ids.map((id) => byId.get(String(id))).filter(Boolean);
    } else {
      orders = await Order.find(query)
        .populate('items.item')
        .populate('customerName')
        .populate('cargo')
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

    // Rollers only see the "to roll" queue
    if (req.user.role === 'roller' && order.status !== 'to roll') {
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

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

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

    // Check valid transition
    if (!validTransitions[order.status] || !validTransitions[order.status].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot transition from ${order.status} to ${status}` 
      });
    }

    const previousStatus = order.status;
    order.status = status;
    await order.save();

    // If purchase order is completed, add items to inventory
    if (order.type === 'purchase order' && status === 'completed' && previousStatus !== 'completed') {
      const populatedOrder = await Order.findById(order._id);
      for (const orderItem of populatedOrder.items) {
        await Item.findByIdAndUpdate(
          orderItem.item,
          { $inc: { quantity: orderItem.quantity } },
          { new: true }
        );
      }
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
      { path: 'cargo' }
    ];
    
    if (order.createdByType === 'salesman') {
      populateOptions.unshift({ path: 'createdBy', model: 'Salesman', select: '-password' });
    }
    
    await order.populate(populateOptions);

    getIO().emit('orders_updated');

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: order
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ 
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

// Revert order status — admin only
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
      }
    };

    const prevStatus = revertMap[order.type]?.[order.status];
    if (!prevStatus) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Cannot revert order with status "${order.status}"`
      });
    }

    // If reverting a completed purchase order, deduct stock that was added
    if (order.type === 'purchase order' && order.status === 'completed') {
      for (const orderItem of order.items) {
        await Item.findByIdAndUpdate(
          orderItem.item,
          { $inc: { quantity: -orderItem.quantity } },
          { session }
        );
      }
    }

    order.status = prevStatus;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

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

// Approve cancellation — admin only
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
    if (order.type === 'sell order') {
      for (const orderItem of order.items) {
        await Item.findByIdAndUpdate(
          orderItem.item,
          { $inc: { quantity: orderItem.quantity } },
          { session }
        );
      }
    }

    order.status = 'cancelled';
    order.previousStatus = null;
    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

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

// Get dashboard stats (Admin only)
exports.getDashboardStats = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const toRollOrders = await Order.countDocuments({ status: 'to roll' });
    const rolledOrders = await Order.countDocuments({ status: 'rolled' });
    const billedOrders = await Order.countDocuments({ status: 'billed' });
    const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
    
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
          delivered: deliveredOrders
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

