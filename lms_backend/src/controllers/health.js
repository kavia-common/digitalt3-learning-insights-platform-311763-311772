const healthService = require('../services/health');

class HealthController {
  async check(req, res, next) {
    try {
      const healthStatus = await healthService.getStatus();
      return res.status(200).json(healthStatus);
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new HealthController();
