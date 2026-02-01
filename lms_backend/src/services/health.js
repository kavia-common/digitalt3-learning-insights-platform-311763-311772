const { getConfiguredDbName, getDataSource, getDbMeta } = require('../config/db');

class HealthService {
  async getStatus() {
    const jwtConfigured = Boolean(process.env.JWT_SECRET);
    const dbName = getConfiguredDbName();

    const ds = getDataSource();
    const meta = getDbMeta();
    const dbType = meta && meta.type ? meta.type : (process.env.DB_PROVIDER || 'mysql').toLowerCase().includes('postgres') ? 'postgres' : 'mysql';
    const provider = meta && meta.provider ? meta.provider : (process.env.DB_PROVIDER || 'mysql').toLowerCase();

    // We always return a response (even if DB is down / env vars are missing).
    let connected = false;
    let dbError;
    let dbVersion;

    try {
      if (ds && ds.isInitialized) {
        await ds.query('SELECT 1');

        // Version query differs across engines.
        if (dbType === 'postgres') {
          const rows = await ds.query('SHOW server_version');
          // pg driver returns array of objects: [{ server_version: '...' }]
          dbVersion =
            Array.isArray(rows) && rows.length > 0 && rows[0] && typeof rows[0] === 'object'
              ? rows[0].server_version || rows[0].serverVersion || undefined
              : undefined;
        } else {
          const rows = await ds.query('SELECT VERSION() AS version');
          dbVersion =
            Array.isArray(rows) && rows.length > 0 && rows[0] && typeof rows[0] === 'object'
              ? rows[0].version || rows[0]['VERSION()'] || undefined
              : undefined;
        }

        connected = true;
      }
    } catch (err) {
      connected = false;
      dbError = err && err.message ? String(err.message) : 'Database ping failed';
    }

    const status = connected ? 'ok' : 'degraded';

    return {
      status,
      message: connected ? 'Service is healthy' : 'Service is running but database is unavailable',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      db: {
        connected,
        provider,
        type: dbType,
        dbName: dbName || undefined,
        ...(dbVersion ? { version: dbVersion } : {}),
        ...(dbError ? { error: dbError } : {}),
      },
      auth: {
        jwtConfigured,
      },
    };
  }
}

module.exports = new HealthService();
