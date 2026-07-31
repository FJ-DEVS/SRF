const express = require('express');
const router = express.Router();
const schemaController = require('../controllers/schemaController');
const authMiddleware = require('../middleware/auth');
const salesmanAuthMiddleware = require('../middleware/salesmanAuth');

// Salesman self view (registered before '/:id' so it isn't captured as an id)
router.get('/my', salesmanAuthMiddleware, schemaController.getMyStatus);

// Admin only
router.post('/', authMiddleware, schemaController.createSchema);
router.get('/', authMiddleware, schemaController.getAllSchemas);
router.get('/:id', authMiddleware, schemaController.getSchema);
router.get('/:id/leaderboard', authMiddleware, schemaController.getSchemaLeaderboard);
router.put('/:id', authMiddleware, schemaController.updateSchema);
router.delete('/:id', authMiddleware, schemaController.deleteSchema);

module.exports = router;
