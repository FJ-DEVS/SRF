const express = require('express');
const router = express.Router();
const { roleAuth } = require('../middleware/roleAuth');
const controller = require('../controllers/closingStockController');

// Closing stock per category per month — the stock side of the investor
// dashboard's sale : stock ratio graph. Investors read it; only the admin
// types figures in or sets the target ratio.
router.get('/', roleAuth('admin', 'investor'), controller.getClosingStock);
router.put('/', roleAuth('admin'), controller.setClosingStock);
router.put('/target', roleAuth('admin'), controller.setRatioTarget);

module.exports = router;
