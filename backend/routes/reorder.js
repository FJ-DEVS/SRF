const express = require('express');
const router = express.Router();
const reorderController = require('../controllers/reorderController');
const authMiddleware = require('../middleware/auth');

// Admin only. Reorder rules per item, and the reorder status report built
// from them.
router.get('/levels', authMiddleware, reorderController.getReorderLevels);
// Bulk must sit before /:itemId or "bulk" would be read as an item ID
router.put('/levels/bulk', authMiddleware, reorderController.bulkSetReorderLevels);
router.put('/levels/:itemId', authMiddleware, reorderController.setReorderLevel);
router.get('/status', authMiddleware, reorderController.getReorderStatus);

module.exports = router;
