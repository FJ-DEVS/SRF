const crypto = require('crypto');
const TallyConfig = require('../models/TallyConfig');

const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

// The Tally side signs every request with the API key generated in
// Admin → Tally Sync, sent as "Authorization: Bearer <key>"
const tallyAuth = async (req, res, next) => {
  try {
    const [scheme, key] = String(req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !key) {
      return res.status(401).json({
        success: false,
        error_code: 'UNAUTHORIZED',
        message: 'Send the API key as "Authorization: Bearer <key>"'
      });
    }

    const config = await TallyConfig.findOne({ key: 'main' }).select('apiKeyHash').lean();
    const sent = Buffer.from(hashKey(key));
    const kept = Buffer.from(config?.apiKeyHash || '');
    if (sent.length !== kept.length || !crypto.timingSafeEqual(sent, kept)) {
      return res.status(401).json({
        success: false,
        error_code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      });
    }

    await TallyConfig.updateOne({ key: 'main' }, { $set: { apiKeyLastUsedAt: new Date() } }, { timestamps: false });
    next();
  } catch (error) {
    console.error('Tally auth error:', error);
    res.status(500).json({ success: false, error_code: 'SERVER_ERROR', message: 'Internal server error' });
  }
};

module.exports = { tallyAuth, hashKey };
