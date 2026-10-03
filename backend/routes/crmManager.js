const express = require('express');
const router = express.Router();
const controller = require('../controllers/crmManagerController');
const authMiddleware = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');

// Public route - CRM manager login
router.post('/login', controller.loginCrmManager);

// CRM manager's own session check — 401s the moment the account is deleted
router.get('/verify', roleAuth('crm'), controller.verifyCrmManager);

// Admin only routes - CRM manager management
router.post('/', authMiddleware, controller.createCrmManager);
router.get('/', authMiddleware, controller.getAllCrmManagers);
router.get('/:id', authMiddleware, controller.getCrmManager);
router.put('/:id', authMiddleware, controller.updateCrmManager);
router.delete('/:id', authMiddleware, controller.deleteCrmManager);

module.exports = router;
