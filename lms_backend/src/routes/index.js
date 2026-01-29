const express = require('express');
const healthController = require('../controllers/health');
const authRoutes = require('./auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Health
 *     description: Service health and diagnostics
 */

/**
 * @swagger
 * /:
 *   get:
 *     summary: Health endpoint
 *     description: Returns basic service status, DB connectivity, and whether JWT auth is configured.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service health check passed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Service is healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: development
 *                 db:
 *                   type: object
 *                   properties:
 *                     connected:
 *                       type: boolean
 *                       example: true
 *                 auth:
 *                   type: object
 *                   properties:
 *                     jwtConfigured:
 *                       type: boolean
 *                       example: true
 */
router.get('/', healthController.check.bind(healthController));

// Auth endpoints
router.use('/auth', authRoutes);

module.exports = router;
