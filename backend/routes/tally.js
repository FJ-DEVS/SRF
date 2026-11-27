const express = require('express');
const router = express.Router();
const tallyController = require('../controllers/tallyController');
const authMiddleware = require('../middleware/auth');
const { roleAuth } = require('../middleware/roleAuth');

// Admin only — the outstanding reports built from what Tally pushes, and the
// upkeep around them. The routes Tally itself calls are in tallyApi.js.
// Outstandings are a report investors read too; everything else is admin only
router.get('/status', roleAuth('admin', 'investor'), tallyController.getStatus);
router.get('/outstandings/parties', roleAuth('admin', 'investor'), tallyController.getParties);
router.get('/outstandings/bills', roleAuth('admin', 'investor'), tallyController.getBills);
// Its body is parsed by a larger JSON parser mounted for this path in server.js
router.post('/outstandings/import', authMiddleware, tallyController.importOutstandings);
router.get('/syncs', authMiddleware, tallyController.getSyncs);
router.get('/ledgers', authMiddleware, tallyController.getLedgers);
router.put('/ledgers/:id/customer', authMiddleware, tallyController.setLedgerCustomer);
router.post('/api-key', authMiddleware, tallyController.generateApiKey);
router.delete('/api-key', authMiddleware, tallyController.revokeApiKey);

module.exports = router;
