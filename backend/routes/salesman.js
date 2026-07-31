const express = require('express');
const router = express.Router();
const salesmanController = require('../controllers/salesmanController');
const authMiddleware = require('../middleware/auth');

// Public route - Salesman login
router.post('/login', salesmanController.loginSalesman);

// Admin only routes - Salesman management
router.post('/', authMiddleware, salesmanController.createSalesman);
router.get('/', authMiddleware, salesmanController.getAllSalesmen);
router.get('/:id', authMiddleware, salesmanController.getSalesman);
router.put('/:id', authMiddleware, salesmanController.updateSalesman);
router.delete('/:id', authMiddleware, salesmanController.deleteSalesman);

module.exports = router;

