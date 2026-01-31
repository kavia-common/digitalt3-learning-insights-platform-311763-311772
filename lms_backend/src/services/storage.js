'use strict';

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

/**
 * Create a configured S3Client from environment variables.
 * We do this lazily so the service can boot even if env vars are not set yet.
 * @returns {import('@aws-sdk/client-s3').S3Client}
 */
function createS3ClientFromEnv() {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';

  // The AWS SDK will also automatically pick up standard env vars:
  // AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, (optional) AWS_SESSION_TOKEN
  return new S3Client({ region });
}

/**
 * Validate S3 env vars and return the bucket name.
 * @returns {string}
 */
function getBucketNameFromEnv() {
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket || String(bucket).trim().length === 0) {
    const err = new Error('AWS_S3_BUCKET_NAME is not configured');
    err.code = 'AWS_S3_BUCKET_NAME_MISSING';
    throw err;
  }
  return String(bucket).trim();
}

/**
 * Small safety validator: ensure key isn't empty or obviously dangerous.
 * Note: S3 keys can contain many characters; we keep validation minimal.
 * @param {string} key
 * @returns {string}
 */
function normalizeAndValidateS3Key(key) {
  const k = typeof key === 'string' ? key.trim() : '';
  if (!k) {
    const err = new Error('fileKey is required');
    err.code = 'S3_KEY_INVALID';
    throw err;
  }
  if (k.startsWith('/')) {
    const err = new Error('fileKey must not start with "/"');
    err.code = 'S3_KEY_INVALID';
    throw err;
  }
  return k;
}

/**
 * Infer a basic content-type from filename extension when the client doesn't supply one.
 * @param {string} fileName
 * @returns {string}
 */
function inferContentType(fileName) {
  const name = typeof fileName === 'string' ? fileName.toLowerCase() : '';
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.m4v')) return 'video/x-m4v';
  return 'application/octet-stream';
}

/**
 * Generate a secure, temporary URL for viewing a private video (GET).
 * PUBLIC_INTERFACE
 * @param {string} fileKey S3 object key (e.g. lessons/123/video.mp4)
 * @param {{expiresInSeconds?: number}} [opts]
 * @returns {Promise<string>} Presigned URL
 */
async function getPresignedUrl(fileKey, opts = {}) {
  const bucket = getBucketNameFromEnv();
  const key = normalizeAndValidateS3Key(fileKey);

  const expiresInSeconds = Number(opts.expiresInSeconds || 900); // default 15 minutes
  const s3 = createS3ClientFromEnv();

  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
}

/**
 * Generate a secure, temporary URL for uploading a video (PUT).
 * PUBLIC_INTERFACE
 * @param {string} fileKey S3 object key to write to (e.g. lessons/123/video.mp4)
 * @param {{contentType?: string, expiresInSeconds?: number}} [opts]
 * @returns {Promise<string>} Presigned URL
 */
async function getUploadPresignedUrl(fileKey, opts = {}) {
  const bucket = getBucketNameFromEnv();
  const key = normalizeAndValidateS3Key(fileKey);

  const expiresInSeconds = Number(opts.expiresInSeconds || 900); // default 15 minutes
  const s3 = createS3ClientFromEnv();

  const contentType =
    typeof opts.contentType === 'string' && opts.contentType.trim().length > 0
      ? opts.contentType.trim()
      : inferContentType(key);

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3, cmd, { expiresIn: expiresInSeconds });
}

module.exports = {
  getPresignedUrl,
  getUploadPresignedUrl,
};
