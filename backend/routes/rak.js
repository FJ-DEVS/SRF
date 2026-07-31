const express = require('express');
const router = express.Router();
const rakController = require('../controllers/rakController');
const authMiddleware = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');

// Roller route (read-only) — before /:id so it is not swallowed by it
router.get('/roller/list', roleAuth('roller'), rakController.getAllRaks);

// Admin routes
router.post('/', authMiddleware, rakController.createRak);
router.get('/', authMiddleware, rakController.getAllRaks);
router.get('/:id', authMiddleware, rakController.getRak);
router.put('/:id', authMiddleware, rakController.updateRak);
router.delete('/:id', authMiddleware, rakController.deleteRak);

module.exports = router;
