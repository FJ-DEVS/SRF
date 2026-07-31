const express = require('express');
const router = express.Router();
const placementController = require('../controllers/placementController');
const { roleAuth } = require('../middleware/roleAuth');

// Rollers do the placing; admins can see and correct it
const staffAuth = roleAuth('admin', 'roller');

router.get('/summary', staffAuth, placementController.getPlacementSummary);
// Items that still have stock waiting for a rak
router.get('/items-to-place', staffAuth, placementController.getItemsToPlace);
router.get('/', staffAuth, placementController.getAllPlacements);
router.post('/', staffAuth, placementController.createPlacement);
router.put('/:id', staffAuth, placementController.updatePlacement);
router.delete('/:id', staffAuth, placementController.deletePlacement);

module.exports = router;
