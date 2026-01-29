const { DataSource } = require('typeorm');

/**
 * Small helper to parse an integer env var safely.
 * @param {string|undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function parseIntEnv(value, fallback) {
  const n = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Returns a minimal, secret-free description of the target DB.
 * @param {{host: string, port: number, database: string}} target
 * @returns {string}
 */
function describeTarget(target) {
  return `${target.host}:${target.port}/${target.database}`;
}

/**
 * Build MySQL DataSource config from env vars.
 * Required: DB_HOST, DB_USERNAME, DB_PASSWORD, DEFAULT_DB
 * Optional: DB_PORT (default 3306)
 */
function buildMySqlDataSourceOptionsFromEnv() {
  const host = process.env.DB_HOST;
  const port = parseIntEnv(process.env.DB_PORT, 3306);
  const username = process.env.DB_USERNAME;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DEFAULT_DB;

  const missing = [];
  if (!host) missing.push('DB_HOST');
  if (!username) missing.push('DB_USERNAME');
  if (!password) missing.push('DB_PASSWORD');
  if (!database) missing.push('DEFAULT_DB');

  if (missing.length > 0) {
    const err = new Error(`MySQL env vars missing: ${missing.join(', ')}`);
    err.code = 'MYSQL_ENV_MISSING';
    throw err;
  }

  return {
    type: 'mysql',
    host,
    port,
    username,
    password,
    database,

    // TypeORM entities (replacing Mongoose models).
    entities: [
      require('../entities/User').UserEntity,
      require('../entities/Course').CourseEntity,
      require('../entities/Lesson').LessonEntity,
    ],

    // For this migration step we use synchronize so the service can boot end-to-end.
    // In production, this should be replaced by migrations.
    synchronize: process.env.TYPEORM_SYNC === 'true' || process.env.NODE_ENV !== 'production',

    // Keep logs low-noise; can be adjusted later.
    logging: false,
  };
}

let appDataSource = null;

/**
 * When multiple requests (or startup + request) race to initialize the DataSource,
 * we want to ensure only a single initialize() happens.
 */
let initializationPromise = null;

// PUBLIC_INTERFACE
function getDataSource() {
  /** Returns the singleton TypeORM DataSource instance, if created. */
  return appDataSource;
}

// PUBLIC_INTERFACE
async function initializeDataSource() {
  /**
   * Initializes TypeORM DataSource (MySQL) using environment variables.
   * Returns the DataSource instance.
   */
  if (appDataSource && appDataSource.isInitialized) {
    return appDataSource;
  }

  // Single-flight: if init is already in progress, await it.
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const options = buildMySqlDataSourceOptionsFromEnv();
    const target = { host: options.host, port: options.port, database: options.database };

    // Safe log: no secrets.
    console.log(`MySQL configuring connection target: ${describeTarget(target)}`);

    appDataSource = new DataSource(options);
    await appDataSource.initialize();

    console.log(`MySQL connected: ${describeTarget(target)}`);
    return appDataSource;
  })();

  try {
    return await initializationPromise;
  } finally {
    // If initialization failed, allow retry later (e.g., DB comes up after preview starts).
    if (!appDataSource || !appDataSource.isInitialized) {
      initializationPromise = null;
    }
  }
}

// PUBLIC_INTERFACE
async function checkDatabaseConnectivity() {
  /** Checks DB connectivity (simple ping) and returns boolean. */
  try {
    if (!appDataSource || !appDataSource.isInitialized) {
      return false;
    }
    // MySQL ping via a trivial query.
    await appDataSource.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// PUBLIC_INTERFACE
function getConfiguredDbName() {
  /** Returns the configured MySQL database name, if known. */
  return process.env.DEFAULT_DB || null;
}

module.exports = {
  initializeDataSource,
  checkDatabaseConnectivity,
  getConfiguredDbName,
  getDataSource,
};
