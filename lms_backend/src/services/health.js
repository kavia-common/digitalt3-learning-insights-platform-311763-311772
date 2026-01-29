const { checkDatabaseConnectivity, getConfiguredDbName } = require('../config/db');

class HealthService {
  async getStatus() {
    const dbConnected = await checkDatabaseConnectivity();
    const jwtConfigured = Boolean(process.env.JWT_SECRET);

    const dbName = getConfiguredDbName();

    return {
      status: 'ok',
      message: 'Service is healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      db: {
        connected: dbConnected,
        status: dbConnected ? 'connected' : 'disconnected',
        dbName: dbName || undefined,
      },
      auth: {
        jwtConfigured,
      },
    };
  }
}

module.exports = new HealthService();
