const express = require('express');
const multer = require('multer');
const router = express.Router();
const databaseController = require('../controllers/databaseController');
const authMiddleware = require('../middleware/auth');

// A backup has to be parsed whole to be restored, so it is held in memory
// rather than staged on disk. The cap is what the server can afford to parse.
const MAX_RESTORE_MB = 64;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESTORE_MB * 1024 * 1024 }
});

// Multer rejections (size / field name) should read like every other API error
const handleUpload = (req, res, next) =>
  upload.single('backup')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `Backup file is larger than ${MAX_RESTORE_MB} MB`
      : err.message;
    res.status(400).json({ success: false, message });
  });

// Admin only — every route here reads or rewrites the entire database
router.get('/stats', authMiddleware, databaseController.getStats);
router.get('/backup', authMiddleware, databaseController.downloadBackup);
router.post('/restore', authMiddleware, handleUpload, databaseController.restoreBackup);

module.exports = router;
