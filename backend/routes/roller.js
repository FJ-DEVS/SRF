const express = require('express');
const router = express.Router();
const rollerController = require('../controllers/rollerController');
const authMiddleware = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');

// Public route - Roller login
router.post('/login', rollerController.loginRoller);

// Roller's own session check — 401s the moment the account is deleted
router.get('/verify', roleAuth('roller'), rollerController.verifyRoller);

// Admin only routes - Roller management
router.post('/', authMiddleware, rollerController.createRoller);
router.get('/', authMiddleware, rollerController.getAllRollers);
router.get('/:id', authMiddleware, rollerController.getRoller);
router.put('/:id', authMiddleware, rollerController.updateRoller);
router.delete('/:id', authMiddleware, rollerController.deleteRoller);

module.exports = router;
