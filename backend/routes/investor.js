const express = require('express');
const router = express.Router();
const controller = require('../controllers/investorController');
const authMiddleware = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');

// Public route - investor login
router.post('/login', controller.loginInvestor);

// Investor's own session check — 401s the moment the account is deleted
router.get('/verify', roleAuth('investor'), controller.verifyInvestor);

// Admin only routes - investor account management
router.post('/', authMiddleware, controller.createInvestor);
router.get('/', authMiddleware, controller.getAllInvestors);
router.get('/:id', authMiddleware, controller.getInvestor);
router.put('/:id', authMiddleware, controller.updateInvestor);
router.delete('/:id', authMiddleware, controller.deleteInvestor);

module.exports = router;
