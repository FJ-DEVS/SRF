const spaces = require('../utils/spaces');

// Upload a single document (GST certificates today) to DigitalOcean Spaces.
// The admin form stores the returned descriptor on the customer record.
exports.uploadFile = async (req, res) => {
  try {
    if (!spaces.isConfigured) {
      return res.status(503).json({
        success: false,
        message: 'File storage is not configured. Set the DO_SPACES_* environment variables.'
      });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file received' });
    }

    // Only the folders the admin panel actually writes to
    const ALLOWED_FOLDERS = ['gst-certificates'];
    const folder = ALLOWED_FOLDERS.includes(req.body.folder) ? req.body.folder : 'misc';

    const stored = await spaces.uploadFile(req.file, folder);

    res.status(201).json({ success: true, message: 'File uploaded successfully', data: stored });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

// Remove a previously uploaded object
exports.deleteFile = async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ success: false, message: 'key is required' });
    }
    await spaces.deleteFile(key);
    res.status(200).json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};
