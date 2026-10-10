const express = require('express');
const router = express.Router();
const damagedItemController = require('../controllers/damagedItemController');
const authMiddleware = require('../middleware/auth');

// All routes require admin authentication
router.get('/', authMiddleware, damagedItemController.getDamagedItems);
router.post('/', authMiddleware, damagedItemController.markDamaged);
router.post('/:id/restore', authMiddleware, damagedItemController.restoreDamaged);

module.exports = router;
