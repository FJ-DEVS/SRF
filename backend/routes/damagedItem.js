
const express = require('express');
const router = express.Router();
const damagedItemController = require('../controllers/damagedItemController');
const { roleAuth } = require('../middleware/roleAuth');

// Admin and accounts managers can list damaged stock, mark pieces damaged and
// restore them to stock
const damagedAuthMiddleware = roleAuth('admin', 'accounts');

router.get('/', damagedAuthMiddleware, damagedItemController.getDamagedItems);
router.post('/', damagedAuthMiddleware, damagedItemController.markDamaged);
router.post('/:id/restore', damagedAuthMiddleware, damagedItemController.restoreDamaged);

module.exports = router;
