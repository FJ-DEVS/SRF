const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const authMiddleware = require('../middleware/auth');
const salesmanAuthMiddleware = require('../middleware/salesmanAuth');
const { roleAuth } = require('../middleware/roleAuth');

// Salesman routes (read-only) — must be before /:id to avoid conflict
router.get('/salesman/list', salesmanAuthMiddleware, itemController.getItemsForSalesman);
router.get('/salesman/:id', salesmanAuthMiddleware, itemController.getItemByIdForSalesman);

// Roller routes (read-only) — used by the item placement screen
router.get('/roller/list', roleAuth('roller'), itemController.getItemsForSalesman);
router.get('/roller/:id', roleAuth('roller'), itemController.getItemByIdForSalesman);

// Admin routes
router.post('/', authMiddleware, itemController.createItem);
router.get('/', authMiddleware, itemController.getAllItems);
router.put('/bulk-price-update', authMiddleware, itemController.bulkUpdatePriceByCategory);
router.post('/bulk-import', authMiddleware, itemController.bulkImportItems);
router.get('/:id/stats', authMiddleware, itemController.getItemStats);
router.get('/:id', authMiddleware, itemController.getItem);
router.put('/:id', authMiddleware, itemController.updateItem);
router.delete('/:id', authMiddleware, itemController.deleteItem);

module.exports = router;

