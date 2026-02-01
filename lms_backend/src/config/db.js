const path = require('path');
const fs = require('fs');
const { DataSource } = require('typeorm');

/**
 * Supported DB providers.
 * - mysql: current/default provider (backwards compatible)
 * - aws_rds_postgres: intended AWS RDS Postgres option (also accepts postgres)
 * - disabled: do not configure any DB (useful for preview without DB)
 */
const DB_PROVIDERS = {
  MYSQL: 'mysql',
  AWS_RDS_POSTGRES: 'aws_rds_postgres',
  POSTGRES: 'postgres', // alias
  DISABLED: 'disabled',
};

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
 * Returns the normalized DB provider from env.
 * @returns {'mysql'|'aws_rds_postgres'|'disabled'}
 */
function getDbProvider() {
  const raw = (process.env.DB_PROVIDER || DB_PROVIDERS.MYSQL).toLowerCase().trim();
  if (raw === DB_PROVIDERS.DISABLED) return DB_PROVIDERS.DISABLED;
  if (raw === DB_PROVIDERS.AWS_RDS_POSTGRES || raw === DB_PROVIDERS.POSTGRES) return DB_PROVIDERS.AWS_RDS_POSTGRES;
  return DB_PROVIDERS.MYSQL;
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
 * Build AWS RDS-compatible TLS options for mysql2.
 *
 * Behavior:
 * - Looks for an RDS CA bundle file named `global-bundle.pem` at the backend root
 *   (same folder as package.json), or via DB_SSL_CA_PATH.
 * - Sets rejectUnauthorized=false as required for this environment.
 *
 * @returns {false|{ca?: string, rejectUnauthorized: boolean}}
 */
function buildMySqlSslOptionsFromEnv() {
  const sslEnabledRaw = process.env.DB_SSL || process.env.DB_SSL_ENABLED;
  const sslEnabled =
    sslEnabledRaw === undefined || sslEnabledRaw === null
      ? true // default ON for production RDS safety; can be disabled by setting DB_SSL=false
      : !['false', '0', 'no'].includes(String(sslEnabledRaw).toLowerCase());

  if (!sslEnabled) {
    return false;
  }

  const caPathFromEnv = process.env.DB_SSL_CA_PATH;
  const defaultCaPath = path.join(process.cwd(), 'global-bundle.pem');
  const caPath = caPathFromEnv && String(caPathFromEnv).trim().length > 0 ? String(caPathFromEnv).trim() : defaultCaPath;

  let ca;
  try {
    if (fs.existsSync(caPath)) {
      ca = fs.readFileSync(caPath, 'utf8');
    }
  } catch {
    // If we can't read CA for any reason, fall back to no explicit CA.
    // We still keep rejectUnauthorized=false as requested.
    ca = undefined;
  }

  return {
    ...(ca ? { ca } : {}),
    rejectUnauthorized: false,
  };
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

  const migrationsDir = path.join(__dirname, '..', 'migrations');

  const ssl = buildMySqlSslOptionsFromEnv();

  return {
    type: 'mysql',
    host,
    port,
    username,
    password,
    database,

    /**
     * AWS RDS SSL/TLS.
     * TypeORM passes this through to mysql2 as `ssl`.
     */
    ssl,

    // TypeORM entities.
    entities: [
      require('../entities/User').UserEntity,
      require('../entities/Course').CourseEntity,
      require('../entities/Lesson').LessonEntity,
    ],

    migrations: [path.join(migrationsDir, '*.js')],

    synchronize: process.env.TYPEORM_SYNC === 'true',
    migrationsRun: false,
    logging: false,
  };
}

/**
 * Build AWS RDS Postgres-compatible TLS options.
 *
 * Notes:
 * - For AWS RDS, `rejectUnauthorized` is commonly left true when CA bundle is provided.
 * - We keep behavior similar to existing MySQL setup: allow `rejectUnauthorized=false`
 *   (configurable via DB_SSL_REJECT_UNAUTHORIZED).
 *
 * @returns {false|{ca?: string, rejectUnauthorized?: boolean}}
 */
function buildPostgresSslOptionsFromEnv() {
  const sslEnabledRaw = process.env.DB_SSL || process.env.DB_SSL_ENABLED;
  const sslEnabled =
    sslEnabledRaw === undefined || sslEnabledRaw === null
      ? true
      : !['false', '0', 'no'].includes(String(sslEnabledRaw).toLowerCase());

  if (!sslEnabled) {
    return false;
  }

  const rejectUnauthorizedRaw = process.env.DB_SSL_REJECT_UNAUTHORIZED;
  const rejectUnauthorized =
    rejectUnauthorizedRaw === undefined || rejectUnauthorizedRaw === null
      ? false
      : !['false', '0', 'no'].includes(String(rejectUnauthorizedRaw).toLowerCase());

  const caPathFromEnv = process.env.DB_SSL_CA_PATH;
  const defaultCaPath = path.join(process.cwd(), 'global-bundle.pem');
  const caPath = caPathFromEnv && String(caPathFromEnv).trim().length > 0 ? String(caPathFromEnv).trim() : defaultCaPath;

  let ca;
  try {
    if (fs.existsSync(caPath)) {
      ca = fs.readFileSync(caPath, 'utf8');
    }
  } catch {
    ca = undefined;
  }

  return {
    ...(ca ? { ca } : {}),
    rejectUnauthorized,
  };
}

/**
 * Build Postgres DataSource config from env vars.
 * Required: PG_HOST, PG_USERNAME, PG_PASSWORD, PG_DATABASE
 * Optional: PG_PORT (default 5432)
 */
function buildPostgresDataSourceOptionsFromEnv() {
  const host = process.env.PG_HOST;
  const port = parseIntEnv(process.env.PG_PORT, 5432);
  const username = process.env.PG_USERNAME;
  const password = process.env.PG_PASSWORD;
  const database = process.env.PG_DATABASE;

  const missing = [];
  if (!host) missing.push('PG_HOST');
  if (!username) missing.push('PG_USERNAME');
  if (!password) missing.push('PG_PASSWORD');
  if (!database) missing.push('PG_DATABASE');

  if (missing.length > 0) {
    const err = new Error(`Postgres env vars missing: ${missing.join(', ')}`);
    err.code = 'POSTGRES_ENV_MISSING';
    throw err;
  }

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const ssl = buildPostgresSslOptionsFromEnv();

  return {
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    ssl,

    entities: [
      require('../entities/User').UserEntity,
      require('../entities/Course').CourseEntity,
      require('../entities/Lesson').LessonEntity,
    ],
    migrations: [path.join(migrationsDir, '*.js')],

    synchronize: process.env.TYPEORM_SYNC === 'true',
    migrationsRun: false,
    logging: false,
  };
}

let appDataSource = null;
let configuredDbMeta = null;

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
function getDbMeta() {
  /** Returns non-secret metadata about the configured DB (provider/type/name). */
  return configuredDbMeta;
}

// PUBLIC_INTERFACE
function createDataSourceFromEnv() {
  /** Creates a non-initialized TypeORM DataSource using environment variables. */
  const provider = getDbProvider();

  if (provider === DB_PROVIDERS.DISABLED) {
    const err = new Error('Database provider disabled via DB_PROVIDER=disabled');
    err.code = 'DB_DISABLED';
    throw err;
  }

  const options = provider === DB_PROVIDERS.AWS_RDS_POSTGRES ? buildPostgresDataSourceOptionsFromEnv() : buildMySqlDataSourceOptionsFromEnv();
  return new DataSource(options);
}

// PUBLIC_INTERFACE
async function initializeDataSource() {
  /**
   * Initializes TypeORM DataSource using environment variables.
   * Provider selected via DB_PROVIDER:
   * - mysql (default)
   * - aws_rds_postgres (alias: postgres)
   * - disabled
   */
  const provider = getDbProvider();

  if (provider === DB_PROVIDERS.DISABLED) {
    const err = new Error('Database provider disabled via DB_PROVIDER=disabled');
    err.code = 'DB_DISABLED';
    throw err;
  }

  if (appDataSource && appDataSource.isInitialized) {
    return appDataSource;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const options = provider === DB_PROVIDERS.AWS_RDS_POSTGRES ? buildPostgresDataSourceOptionsFromEnv() : buildMySqlDataSourceOptionsFromEnv();
    const target = { host: options.host, port: options.port, database: options.database };

    configuredDbMeta = {
      provider,
      type: options.type,
      database: options.database,
      host: options.host,
      port: options.port,
    };

    console.log(`${options.type} configuring connection target: ${describeTarget(target)}`);

    appDataSource = new DataSource(options);
    await appDataSource.initialize();

    console.log(`${options.type} connected: ${describeTarget(target)}`);
    return appDataSource;
  })();

  try {
    return await initializationPromise;
  } finally {
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
    await appDataSource.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// PUBLIC_INTERFACE
function getConfiguredDbName() {
  /** Returns the configured database name (MySQL: DEFAULT_DB, Postgres: PG_DATABASE), if known. */
  const provider = getDbProvider();
  if (provider === DB_PROVIDERS.AWS_RDS_POSTGRES) {
    return process.env.PG_DATABASE || null;
  }
  return process.env.DEFAULT_DB || null;
}

module.exports = {
  initializeDataSource,
  checkDatabaseConnectivity,
  getConfiguredDbName,
  getDataSource,
  createDataSourceFromEnv,
  getDbMeta,
};

