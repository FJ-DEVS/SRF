const express = require('express');
const router = express.Router();
const cargoController = require('../controllers/cargoController');
const authMiddleware = require('../middleware/auth');
const salesmanAuthMiddleware = require('../middleware/salesmanAuth');
const { roleAuth } = require('../middleware/roleAuth');

// Salesman routes (read-only) — before /:id
router.get('/salesman/list', salesmanAuthMiddleware, cargoController.getCargoListForSalesman);
router.get('/salesman/:id', salesmanAuthMiddleware, cargoController.getCargoByIdForSalesman);

// Cargo names for the order-list filters of every staff panel (read-only)
router.get('/options', roleAuth('admin', 'accounts', 'crm', 'roller'), cargoController.getCargoListForSalesman);

// All routes require admin authentication
router.post('/', authMiddleware, cargoController.createCargo);
router.get('/', authMiddleware, cargoController.getAllCargo);
router.get('/:id', authMiddleware, cargoController.getCargo);
router.put('/:id', authMiddleware, cargoController.updateCargo);
router.delete('/:id', authMiddleware, cargoController.deleteCargo);

module.exports = router;

