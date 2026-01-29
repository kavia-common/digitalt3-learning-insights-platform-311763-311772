const express = require('express');
const healthController = require('../controllers/health');
const authRoutes = require('./auth');
const courseRoutes = require('./courses');
const lessonRoutes = require('./lessons');

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
 *     description: Returns basic service status, MySQL connectivity (TypeORM), and whether JWT auth is configured.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service health status (may be degraded if DB is unavailable)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   description: Overall service health
 *                   enum: [ok, degraded, error]
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
 *                     type:
 *                       type: string
 *                       example: mysql
 *                     dbName:
 *                       type: string
 *                       description: Database name from DEFAULT_DB (if configured)
 *                       example: lms
 *                     error:
 *                       type: string
 *                       description: Present when the DB ping fails (no secrets)
 *                       example: connect ECONNREFUSED 127.0.0.1:3306
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

// Course and lesson endpoints (OpenAPI-first; implementations may be completed in later tasks)
router.use('/courses', courseRoutes);
router.use('/lessons', lessonRoutes);

// Convenience nested endpoint for listing lessons by course
// Documented as: /courses/{courseId}/lessons
router.use('/courses/:courseId/lessons', (req, res, next) => {
  // Delegate to lessons route handler that expects "courseId" in path (we map it to a compatible route)
  req.url = `/by-course/${req.params.courseId}`;
  return lessonRoutes(req, res, next);
});

module.exports = router;
