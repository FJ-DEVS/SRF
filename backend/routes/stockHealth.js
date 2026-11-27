const express = require('express');
const router = express.Router();
const { roleAuth } = require('../middleware/roleAuth');
const controller = require('../controllers/stockHealthController');

// Stock that isn't moving — the admin trims reorder levels from it, the
// investor reads it
router.get('/non-moving', roleAuth('admin', 'investor'), controller.getNonMoving);

module.exports = router;
