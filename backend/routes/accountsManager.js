const express = require('express');
const router = express.Router();
const controller = require('../controllers/accountsManagerController');
const authMiddleware = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');

// Public route - Accounts manager login
router.post('/login', controller.loginAccountsManager);

// Accounts manager's own session check — 401s the moment the account is deleted
router.get('/verify', roleAuth('accounts'), controller.verifyAccountsManager);

// Admin only routes - Accounts manager management
router.post('/', authMiddleware, controller.createAccountsManager);
router.get('/', authMiddleware, controller.getAllAccountsManagers);
router.get('/:id', authMiddleware, controller.getAccountsManager);
router.put('/:id', authMiddleware, controller.updateAccountsManager);
router.delete('/:id', authMiddleware, controller.deleteAccountsManager);

module.exports = router;
