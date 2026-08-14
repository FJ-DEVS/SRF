// DigitalOcean Spaces (S3-compatible) storage for customer documents.
//
// Required env vars:
//   DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_ENDPOINT, DO_SPACES_BUCKET
// Optional:
//   DO_SPACES_CDN_ENDPOINT (public URL base — falls back to the origin endpoint)
//   DO_SPACES_FOLDER       (key prefix, e.g. "srf")
const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const {
  DO_SPACES_KEY,
  DO_SPACES_SECRET,
  DO_SPACES_ENDPOINT,
  DO_SPACES_CDN_ENDPOINT,
  DO_SPACES_BUCKET,
  DO_SPACES_FOLDER
} = process.env;

const isConfigured = Boolean(
  DO_SPACES_KEY && DO_SPACES_SECRET && DO_SPACES_ENDPOINT && DO_SPACES_BUCKET
);

const withProtocol = (url = '') => (/^https?:\/\//i.test(url) ? url : `https://${url}`);
const trimSlash = (url = '') => url.replace(/\/+$/, '');

// Spaces regions look like "blr1" in "https://blr1.digitaloceanspaces.com"
const regionFromEndpoint = (endpoint = '') => {
  const match = withProtocol(endpoint).match(/^https?:\/\/([^.]+)\./i);
  return match ? match[1] : 'us-east-1';
};

let client = null;
if (isConfigured) {
  client = new S3Client({
    endpoint: withProtocol(DO_SPACES_ENDPOINT),
    region: regionFromEndpoint(DO_SPACES_ENDPOINT),
    forcePathStyle: false,
    credentials: {
      accessKeyId: DO_SPACES_KEY,
      secretAccessKey: DO_SPACES_SECRET
    }
  });
}

const sanitiseName = (name = 'file') =>
  name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'file';

// The public URL a stored object is served from
const publicUrl = (key) => {
  const base = DO_SPACES_CDN_ENDPOINT
    ? trimSlash(withProtocol(DO_SPACES_CDN_ENDPOINT))
    : `${trimSlash(withProtocol(DO_SPACES_ENDPOINT))}/${DO_SPACES_BUCKET}`;
  return `${base}/${key}`;
};

// Uploads a buffer and returns { url, key, name }
const uploadFile = async (file, folder = '') => {
  if (!isConfigured) {
    throw new Error('File storage is not configured. Set the DO_SPACES_* environment variables.');
  }

  const prefix = [DO_SPACES_FOLDER, folder].filter(Boolean).join('/');
  const key = [prefix, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${sanitiseName(file.originalname)}`]
    .filter(Boolean)
    .join('/');

  await client.send(new PutObjectCommand({
    Bucket: DO_SPACES_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read'
  }));

  return { url: publicUrl(key), key, name: file.originalname };
};

const deleteFile = async (key) => {
  if (!isConfigured || !key) return;
  await client.send(new DeleteObjectCommand({ Bucket: DO_SPACES_BUCKET, Key: key }));
};

module.exports = { isConfigured, uploadFile, deleteFile, publicUrl };
