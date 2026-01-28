const mongoose = require('mongoose');

/**
 * Build a MongoDB connection URI from env vars.
 * We use MONGODB_URL as-is, and optionally append a db name from MONGODB_DB.
 */
function buildMongoUri() {
  const baseUrl = process.env.MONGODB_URL;
  const dbName = process.env.MONGODB_DB;

  if (!baseUrl) {
    const err = new Error('MONGODB_URL is not configured');
    err.code = 'MONGODB_URL_MISSING';
    throw err;
  }

  // If MONGODB_URL already includes a path (e.g., mongodb://host:27017/db),
  // do not override. Otherwise, append /<dbName> if provided.
  const hasPathAfterHost = (() => {
    try {
      const u = new URL(baseUrl);
      return u.pathname && u.pathname !== '/' && u.pathname.length > 1;
    } catch {
      // For mongodb:// URIs, URL() can be finicky; fallback to simple check.
      const afterProto = baseUrl.replace(/^mongodb(\+srv)?:\/\//, '');
      return afterProto.includes('/') && !afterProto.endsWith('/');
    }
  })();

  if (dbName && !hasPathAfterHost) {
    // Ensure exactly one slash before db name
    return baseUrl.endsWith('/') ? `${baseUrl}${dbName}` : `${baseUrl}/${dbName}`;
  }

  return baseUrl;
}

// PUBLIC_INTERFACE
async function connectToDatabase() {
  /** Connects to MongoDB and returns the mongoose connection. */
  const mongoUri = buildMongoUri();

  // Keep connection options minimal; mongoose has good defaults in v8.
  await mongoose.connect(mongoUri);

  return mongoose.connection;
}

// PUBLIC_INTERFACE
async function checkDatabaseConnectivity() {
  /** Checks DB connectivity (ping) and returns boolean. */
  try {
    if (mongoose.connection.readyState !== 1) {
      return false;
    }
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  connectToDatabase,
  checkDatabaseConnectivity,
};
