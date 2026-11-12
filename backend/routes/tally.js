const express = require('express');
const router = express.Router();
const tallyController = require('../controllers/tallyController');
const authMiddleware = require('../middleware/auth');

// Admin only — the outstanding reports built from what Tally pushes, and the
// upkeep around them. The routes Tally itself calls are in tallyApi.js.
router.get('/status', authMiddleware, tallyController.getStatus);
router.get('/outstandings/parties', authMiddleware, tallyController.getParties);
router.get('/outstandings/bills', authMiddleware, tallyController.getBills);
router.get('/syncs', authMiddleware, tallyController.getSyncs);
router.get('/ledgers', authMiddleware, tallyController.getLedgers);
router.put('/ledgers/:id/customer', authMiddleware, tallyController.setLedgerCustomer);
router.post('/api-key', authMiddleware, tallyController.generateApiKey);
router.delete('/api-key', authMiddleware, tallyController.revokeApiKey);

module.exports = router;
