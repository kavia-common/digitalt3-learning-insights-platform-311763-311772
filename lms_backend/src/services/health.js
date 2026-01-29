const { getConfiguredDbName, getDataSource } = require('../config/db');

class HealthService {
  async getStatus() {
    const jwtConfigured = Boolean(process.env.JWT_SECRET);
    const dbName = getConfiguredDbName();

    const ds = getDataSource();

    // We always return a response (even if DB is down / env vars are missing).
    // This endpoint must never crash startup.
    let connected = false;
    let dbError;

    try {
      if (ds && ds.isInitialized) {
        // Simple, safe ping. No secrets logged or returned.
        await ds.query('SELECT 1');
        connected = true;
      } else {
        connected = false;
      }
    } catch (err) {
      connected = false;
      dbError = err && err.message ? String(err.message) : 'Database ping failed';
    }

    // Health semantics:
    // - ok: DB is connected
    // - degraded: service is up, but DB is unavailable (common during preview/startup)
    const status = connected ? 'ok' : 'degraded';

    return {
      status,
      message: connected ? 'Service is healthy' : 'Service is running but database is unavailable',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      db: {
        connected,
        type: 'mysql',
        dbName: dbName || undefined,
        ...(dbError ? { error: dbError } : {}),
      },
      auth: {
        jwtConfigured,
      },
    };
  }
}

module.exports = new HealthService();
