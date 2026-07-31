const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const authMiddleware = require('../middleware/auth');
const salesmanAuthMiddleware = require('../middleware/salesmanAuth');

// Salesman routes (read-only) — before /:id
router.get('/salesman/list', salesmanAuthMiddleware, customerController.getCustomersForSalesman);
router.get('/salesman/:id', salesmanAuthMiddleware, customerController.getCustomerByIdForSalesman);

// All routes require admin authentication
router.post('/', authMiddleware, customerController.createCustomer);
router.get('/', authMiddleware, customerController.getAllCustomers);
router.get('/:id', authMiddleware, customerController.getCustomer);
router.put('/:id', authMiddleware, customerController.updateCustomer);
router.delete('/:id', authMiddleware, customerController.deleteCustomer);

module.exports = router;

