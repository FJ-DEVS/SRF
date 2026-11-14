const crypto = require('crypto');
const TallyConfig = require('../models/TallyConfig');

const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

// The Tally side signs every request with the API key generated in
// Admin → Tally Sync: as "api_key" in the JSON body (the sync's own format),
// or as "Authorization: Bearer <key>" (for the GET endpoints, which have no body)
const keyOf = (req) => {
  const fromBody = req.body && typeof req.body === 'object' ? req.body.api_key : null;
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim();
  const [scheme, key] = String(req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && key ? key : null;
};

const tallyAuth = async (req, res, next) => {
  try {
    const key = keyOf(req);
    if (!key) {
      console.warn(`Tally API: ${req.method} ${req.originalUrl} rejected — no API key sent`);
      return res.status(401).json({
        success: false,
        error_code: 'UNAUTHORIZED',
        message: 'Send the API key as "api_key" in the request body, or as "Authorization: Bearer <key>"'
      });
    }

    const config = await TallyConfig.findOne({ key: 'main' }).select('apiKeyHash').lean();
    const sent = Buffer.from(hashKey(key));
    const kept = Buffer.from(config?.apiKeyHash || '');
    if (sent.length !== kept.length || !crypto.timingSafeEqual(sent, kept)) {
      console.warn(`Tally API: ${req.method} ${req.originalUrl} rejected — API key ending "${key.slice(-4)}" does not match`);
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
