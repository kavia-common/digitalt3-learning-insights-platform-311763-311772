const { checkDatabaseConnectivity } = require('../config/db');

class HealthService {
  async getStatus() {
    const dbConnected = await checkDatabaseConnectivity();
    const jwtConfigured = Boolean(process.env.JWT_SECRET);

    return {
      status: 'ok',
      message: 'Service is healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      db: {
        connected: dbConnected,
      },
      auth: {
        jwtConfigured,
      },
    };
  }
}

module.exports = new HealthService();
