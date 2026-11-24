const express = require('express');
const router = express.Router();
const controller = require('../controllers/viewerController');
const authMiddleware = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');

// Public route - viewer login (mobile number + password)
router.post('/login', controller.loginViewer);

// Viewer's own session check — 401s the moment the account is deleted
router.get('/verify', roleAuth('viewer'), controller.verifyViewer);

// Admin only routes - viewer management
router.post('/', authMiddleware, controller.createViewer);
router.get('/', authMiddleware, controller.getAllViewers);
router.get('/:id', authMiddleware, controller.getViewer);
router.put('/:id', authMiddleware, controller.updateViewer);
router.put('/:id/permissions', authMiddleware, controller.updateViewerPermissions);
router.delete('/:id', authMiddleware, controller.deleteViewer);

module.exports = router;
