const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authMiddleware = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');

// Apps ask before opening the order form — before the admin-only routes
router.get(
  '/order-restriction/status',
  roleAuth('admin', 'salesman', 'customer'),
  settingsController.getOrderRestrictionStatus
);

// Admin only
router.get('/order-restriction', authMiddleware, settingsController.getOrderRestriction);
router.put('/order-restriction', authMiddleware, settingsController.updateOrderRestriction);

module.exports = router;
