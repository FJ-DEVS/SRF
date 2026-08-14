const express = require('express');
const multer = require('multer');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const authMiddleware = require('../middleware/auth');

// Files are held in memory just long enough to stream them to Spaces
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only PDF, JPG, PNG, WEBP or HEIC files are allowed'));
  }
});

// Multer rejections (size / type) should read like every other API error
const handleUpload = (req, res, next) =>
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 10 MB' : err.message;
    res.status(400).json({ success: false, message });
  });

router.post('/', authMiddleware, handleUpload, uploadController.uploadFile);
router.delete('/', authMiddleware, uploadController.deleteFile);

module.exports = router;
