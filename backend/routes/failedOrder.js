const express = require('express');
const router = express.Router();
const failedOrderController = require('../controllers/failedOrderController');
const authMiddleware = require('../middleware/auth');

// Admin only — sell orders turned away for want of stock
router.get('/', authMiddleware, failedOrderController.getFailedOrders);
router.get('/summary', authMiddleware, failedOrderController.getShortageSummary);
router.delete('/:id', authMiddleware, failedOrderController.deleteFailedOrder);

module.exports = router;
