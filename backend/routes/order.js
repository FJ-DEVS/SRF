const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/auth');
const salesmanAuthMiddleware = require('../middleware/salesmanAuth');
const { roleAuth } = require('../middleware/roleAuth');

// Admin + salesman (deleted salesman accounts are rejected by roleAuth)
const anyAuthMiddleware = roleAuth('admin', 'salesman');

// Reading orders is also open to accounts managers, who see every order but
// never create, edit or delete one
const readAuthMiddleware = roleAuth('admin', 'salesman', 'accounts');

// Status changes are also open to rollers and accounts managers — the
// controller pins rollers to "to roll" → "rolled" and accounts managers to
// "pending" → "to roll" and "rolled" → "billed" on sell orders, and
// "pending" → "completed" on purchase orders
const statusAuthMiddleware = roleAuth('admin', 'salesman', 'roller', 'accounts');

// Approving a cancellation is shared with accounts managers; rejecting one
// stays with the admin
const cancelApproveAuthMiddleware = roleAuth('admin', 'accounts');

const rollerAuthMiddleware = roleAuth('roller');

// Dashboard stats - Admin and accounts manager
router.get('/stats', roleAuth('admin', 'accounts'), orderController.getDashboardStats);

// Consolidation report - Admin only
router.get('/consolidation', authMiddleware, orderController.getConsolidationReport);

// Salesman-only list/detail (same controller rules as GET / and GET /:id for role salesman)
router.get('/salesman/list', salesmanAuthMiddleware, orderController.getAllOrders);
router.get('/salesman/:id', salesmanAuthMiddleware, orderController.getOrder);

// Roller-only list/detail — the controller pins these to "to roll" / "rolled" orders
router.get('/roller/list', rollerAuthMiddleware, orderController.getAllOrders);
router.get('/roller/filters', rollerAuthMiddleware, orderController.getRollerFilterOptions);
router.get('/roller/:id', rollerAuthMiddleware, orderController.getOrder);
router.put('/roller/:id/seen', rollerAuthMiddleware, orderController.markRollerSeen);

// Which raks hold this order's items — feeds the roller's "pick the raks"
// dialog shown on the way to "rolled"; admins can look too
router.get('/:id/rak-allocation', roleAuth('admin', 'roller'), orderController.getRakAllocation);

// Orders - Both admin and salesman can access (with restrictions in controller)
router.post('/', anyAuthMiddleware, orderController.createOrder);
router.get('/', readAuthMiddleware, orderController.getAllOrders);
router.get('/:id', readAuthMiddleware, orderController.getOrder);

// Status update - Admin, salesman, roller and accounts manager (with restrictions in controller)
router.put('/:id/status', statusAuthMiddleware, orderController.updateOrderStatus);

// Revert status — Admin, and rollers for "rolled" → "to roll" (enforced in controller)
router.put('/:id/revert-status', roleAuth('admin', 'roller'), orderController.revertOrderStatus);

// Cancellation workflow
router.post('/:id/cancel-request', anyAuthMiddleware, orderController.requestCancellation);
router.put('/:id/cancel-approve', cancelApproveAuthMiddleware, orderController.approveCancellation);
router.put('/:id/cancel-reject', authMiddleware, orderController.rejectCancellation);

// Admin only routes
router.put('/:id', authMiddleware, orderController.updateOrder);
router.delete('/:id', authMiddleware, orderController.deleteOrder);

module.exports = router;

