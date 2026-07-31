const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/auth');
const salesmanAuthMiddleware = require('../middleware/salesmanAuth');
const { roleAuth } = require('../middleware/roleAuth');

// Admin + salesman (deleted salesman accounts are rejected by roleAuth)
const anyAuthMiddleware = roleAuth('admin', 'salesman');

// Status changes are also open to rollers — the controller restricts them to
// "to roll" → "rolled"
const statusAuthMiddleware = roleAuth('admin', 'salesman', 'roller');

const rollerAuthMiddleware = roleAuth('roller');

// Dashboard stats - Admin only
router.get('/stats', authMiddleware, orderController.getDashboardStats);

// Consolidation report - Admin only
router.get('/consolidation', authMiddleware, orderController.getConsolidationReport);

// Salesman-only list/detail (same controller rules as GET / and GET /:id for role salesman)
router.get('/salesman/list', salesmanAuthMiddleware, orderController.getAllOrders);
router.get('/salesman/:id', salesmanAuthMiddleware, orderController.getOrder);

// Roller-only list/detail — the controller pins these to "to roll" orders
router.get('/roller/list', rollerAuthMiddleware, orderController.getAllOrders);
router.get('/roller/:id', rollerAuthMiddleware, orderController.getOrder);

// Orders - Both admin and salesman can access (with restrictions in controller)
router.post('/', anyAuthMiddleware, orderController.createOrder);
router.get('/', anyAuthMiddleware, orderController.getAllOrders);
router.get('/:id', anyAuthMiddleware, orderController.getOrder);

// Status update - Admin, salesman and roller (with restrictions in controller)
router.put('/:id/status', statusAuthMiddleware, orderController.updateOrderStatus);

// Revert status — Admin only
router.put('/:id/revert-status', authMiddleware, orderController.revertOrderStatus);

// Cancellation workflow
router.post('/:id/cancel-request', anyAuthMiddleware, orderController.requestCancellation);
router.put('/:id/cancel-approve', authMiddleware, orderController.approveCancellation);
router.put('/:id/cancel-reject', authMiddleware, orderController.rejectCancellation);

// Admin only routes
router.put('/:id', authMiddleware, orderController.updateOrder);
router.delete('/:id', authMiddleware, orderController.deleteOrder);

module.exports = router;

