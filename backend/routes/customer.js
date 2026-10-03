const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const authMiddleware = require('../middleware/auth');
const salesmanAuthMiddleware = require('../middleware/salesmanAuth');
const { roleAuth } = require('../middleware/roleAuth');

// Salesman routes (read-only) — before /:id
router.get('/salesman/list', salesmanAuthMiddleware, customerController.getCustomersForSalesman);
router.get('/salesman/:id', salesmanAuthMiddleware, customerController.getCustomerByIdForSalesman);

// CRM routes — before /:id. Customer relation managers read the same full
// customer records as the admin and may block / unblock, but never edit.
router.get('/crm/list', roleAuth('crm'), customerController.getAllCustomers);
router.put('/crm/:id/block', roleAuth('crm'), customerController.setCustomerBlocked);

// All routes require admin authentication
router.post('/', authMiddleware, customerController.createCustomer);
router.get('/', authMiddleware, customerController.getAllCustomers);
router.get('/:id', authMiddleware, customerController.getCustomer);
router.put('/:id', authMiddleware, customerController.updateCustomer);
router.delete('/:id', authMiddleware, customerController.deleteCustomer);

module.exports = router;

