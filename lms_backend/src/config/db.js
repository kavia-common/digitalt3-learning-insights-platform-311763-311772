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

    // Migration phase: no entities yet; this DataSource is primarily for connectivity.
    // Entities will be added in later subtasks without removing existing Mongo models yet.
    entities: [],

    // Never enable synchronize in production unintentionally.
    synchronize: false,

    // Keep logs low-noise; can be adjusted later.
    logging: false,
  };
}

let appDataSource = null;

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

  const options = buildMySqlDataSourceOptionsFromEnv();
  const target = { host: options.host, port: options.port, database: options.database };

  // Safe log: no secrets.
  console.log(`MySQL configuring connection target: ${describeTarget(target)}`);

  appDataSource = new DataSource(options);
  await appDataSource.initialize();

  console.log(`MySQL connected: ${describeTarget(target)}`);
  return appDataSource;
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
