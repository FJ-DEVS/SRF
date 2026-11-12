const express = require('express');
const router = express.Router();
const tallySyncController = require('../controllers/tallySyncController');
const { tallyAuth } = require('../middleware/tallyAuth');

// The API handed to the Tally team — see TALLY_API.md. Signed with the API
// key from Admin → Tally Sync, not with a user login.
//
// A full outstanding list runs to hundreds of KB, well past the 100 KB the
// rest of the API accepts, so this router parses its own bodies.
router.use(express.json({ limit: '10mb' }));

router.get('/ping', tallyAuth, tallySyncController.ping);
router.post('/outstandings/sync', tallyAuth, tallySyncController.syncOutstandings);
router.get('/outstandings/sync-status', tallyAuth, tallySyncController.getSyncStatus);
router.get('/outstandings/customers', tallyAuth, tallySyncController.getCustomerBalances);

// Body-parser rejections should read like every other answer here, not as
// Express's HTML error page
router.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error_code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is larger than 10 MB — send the outstandings in batches'
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error_code: 'INVALID_JSON', message: 'Request body is not valid JSON' });
  }
  next(err);
});

module.exports = router;
