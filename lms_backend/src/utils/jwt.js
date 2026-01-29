const jwt = require('jsonwebtoken');

const DEFAULT_EXPIRES_IN = '1d';

/**
 * Returns JWT config values from environment.
 * Throws if JWT_SECRET is missing.
 */
function getJwtConfig() {
  const secret = process.env.JWT_SECRET;

  // Support both env var spellings for backward compatibility.
  // Preferred: JWT_EXPIRES_IN
  // Legacy: JWT_EXPIRESIN
  const expiresIn =
    process.env.JWT_EXPIRES_IN ||
    process.env.JWT_EXPIRESIN ||
    DEFAULT_EXPIRES_IN;

  if (!secret) {
    const err = new Error('JWT_SECRET is not configured');
    err.code = 'JWT_SECRET_MISSING';
    throw err;
  }

  return { secret, expiresIn };
}

// PUBLIC_INTERFACE
function signAccessToken(payload) {
  /** Signs a JWT access token using environment configuration. */
  const { secret, expiresIn } = getJwtConfig();
  return jwt.sign(payload, secret, { expiresIn });
}

// PUBLIC_INTERFACE
function verifyAccessToken(token) {
  /** Verifies a JWT access token and returns decoded payload. */
  const { secret } = getJwtConfig();
  return jwt.verify(token, secret);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
};
