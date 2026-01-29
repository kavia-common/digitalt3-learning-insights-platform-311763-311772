const mongoose = require('mongoose');

/**
 * Determines whether the provided MongoDB URI already contains a database path.
 * - For example, `mongodb://host:27017/mydb` has a db path.
 * - `mongodb+srv://cluster.example.net/?retryWrites=true` does not.
 */
function uriHasDatabasePath(mongoUri) {
  try {
    const u = new URL(mongoUri);
    return Boolean(u.pathname && u.pathname !== '/' && u.pathname.length > 1);
  } catch {
    // URL() parsing can be unreliable for some mongodb connection strings; use a conservative fallback.
    const afterProto = mongoUri.replace(/^mongodb(\+srv)?:\/\//, '');
    // A db path looks like: host[:port]/dbname (and not just a trailing slash)
    return afterProto.includes('/') && !afterProto.endsWith('/');
  }
}

/**
 * Build Mongo connection settings from env vars.
 *
 * We prefer using mongoose's `dbName` option (instead of mutating the URI) when:
 * - MONGODB_DB is provided, AND
 * - the URI does not already include a DB path.
 *
 * This plays nicely with MongoDB Atlas SRV connection strings like:
 * `mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/?appName=...`
 */
function buildMongoConnectionConfig() {
  const mongoUri = process.env.MONGODB_URL;
  const dbName = process.env.MONGODB_DB;

  if (!mongoUri) {
    const err = new Error('MONGODB_URL is not configured');
    err.code = 'MONGODB_URL_MISSING';
    throw err;
  }

  const config = { mongoUri, options: {} };

  if (dbName && !uriHasDatabasePath(mongoUri)) {
    config.options.dbName = dbName;
  }

  return config;
}

// PUBLIC_INTERFACE
async function connectToDatabase() {
  /** Connects to MongoDB and returns the mongoose connection. */
  const { mongoUri, options } = buildMongoConnectionConfig();

  // Keep connection options minimal; mongoose has good defaults in v8.
  await mongoose.connect(mongoUri, options);

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
