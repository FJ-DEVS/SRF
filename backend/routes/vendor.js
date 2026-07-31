const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const authMiddleware = require('../middleware/auth');
const salesmanAuthMiddleware = require('../middleware/salesmanAuth');

// Salesman routes (read-only) — before /:id
router.get('/salesman/list', salesmanAuthMiddleware, vendorController.getVendorsForSalesman);
router.get('/salesman/:id', salesmanAuthMiddleware, vendorController.getVendorByIdForSalesman);

// All routes require admin authentication
router.post('/', authMiddleware, vendorController.createVendor);
router.get('/', authMiddleware, vendorController.getAllVendors);
router.get('/:id', authMiddleware, vendorController.getVendor);
router.put('/:id', authMiddleware, vendorController.updateVendor);
router.delete('/:id', authMiddleware, vendorController.deleteVendor);

module.exports = router;

