const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const authMiddleware = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');

// Mobile app routes (read-only) — must be before /:id to avoid conflict.
// Customers signed into the app read the same catalogue, narrowed to the
// categories open to them.
const appAuthMiddleware = roleAuth('salesman', 'customer');
router.get('/salesman/list', appAuthMiddleware, itemController.getItemsForSalesman);
router.get('/salesman/:id', appAuthMiddleware, itemController.getItemByIdForSalesman);

// Roller routes (read-only) — used by the item placement screen
router.get('/roller/list', roleAuth('roller'), itemController.getItemsForSalesman);
router.get('/roller/:id', roleAuth('roller'), itemController.getItemByIdForSalesman);

// Reading the item list and an item's stats is also open to accounts managers,
// who see every item but never create, edit or delete one
const readAuthMiddleware = roleAuth('admin', 'accounts');

// Admin routes
router.post('/', authMiddleware, itemController.createItem);
router.get('/', readAuthMiddleware, itemController.getAllItems);
router.put('/bulk-price-update', authMiddleware, itemController.bulkUpdatePriceByCategory);
router.post('/bulk-import', authMiddleware, itemController.bulkImportItems);
router.get('/:id/stats', readAuthMiddleware, itemController.getItemStats);
router.get('/:id', authMiddleware, itemController.getItem);
router.put('/:id', authMiddleware, itemController.updateItem);
router.delete('/:id', authMiddleware, itemController.deleteItem);

module.exports = router;

