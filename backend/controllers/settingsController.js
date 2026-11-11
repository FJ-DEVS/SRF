const Settings = require('../models/Settings');
const { getIO } = require('../socket');
const {
  RESTRICTED_ROLES,
  isValidTimeZone,
  describeRestriction
} = require('../utils/orderRestriction');

// GET /api/settings/order-restriction — admin: the full setting
exports.getOrderRestriction = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    res.json({ success: true, data: describeRestriction(settings.orderRestriction) });
  } catch (error) {
    console.error('Get order restriction error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/settings/order-restriction — admin: set, change or switch off
exports.updateOrderRestriction = async (req, res) => {
  try {
    const { enabled, from, to, note, timeZone } = req.body;
    const settings = await Settings.getSingleton();
    const current = settings.orderRestriction?.toObject?.() || {};

    const next = {
      enabled: Boolean(enabled),
      from: from ? new Date(from) : null,
      to: to ? new Date(to) : null,
      note: typeof note === 'string' ? note.trim() : '',
      timeZone: timeZone && isValidTimeZone(timeZone) ? timeZone : current.timeZone || 'Asia/Kolkata'
    };

    if (next.note.length > 300) {
      return res.status(400).json({ success: false, message: 'The note can be at most 300 characters' });
    }

    if (next.enabled) {
      if (!next.from || !next.to || isNaN(next.from) || isNaN(next.to)) {
        return res.status(400).json({ success: false, message: 'Pick both a start and an end time' });
      }
      if (next.to <= next.from) {
        return res.status(400).json({ success: false, message: 'The end time must be after the start time' });
      }
      if (next.to <= new Date()) {
        return res.status(400).json({ success: false, message: 'The end time is already in the past' });
      }
    } else {
      // Switched off — keep nothing half-set around
      if (next.from && isNaN(next.from)) next.from = null;
      if (next.to && isNaN(next.to)) next.to = null;
    }

    settings.orderRestriction = next;
    await settings.save();

    const data = describeRestriction(settings.orderRestriction);
    try {
      getIO().emit('order_restriction_updated', data);
    } catch (e) {
      // Socket not ready — the apps still get the answer when they ask
    }

    res.json({ success: true, message: 'Order restriction saved', data });
  } catch (error) {
    console.error('Update order restriction error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/settings/order-restriction/status — apps: may this user order now?
// Salesmen and customers get the live window; the admin is never restricted.
exports.getOrderRestrictionStatus = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    const data = describeRestriction(settings.orderRestriction);
    const applies = RESTRICTED_ROLES.includes(req.user.role);
    res.json({
      success: true,
      data: {
        restricted: applies && data.active,
        from: data.from,
        to: data.to,
        message: applies && data.active ? data.message : ''
      }
    });
  } catch (error) {
    console.error('Get order restriction status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
