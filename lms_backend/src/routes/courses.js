const express = require('express');

const auth = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Courses
 *     description: Course management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: Validation error
 *     User:
 *       type: object
 *       description: A user profile (public fields only)
 *       properties:
 *         id:
 *           type: string
 *           example: 65f0c2c6e6f5c2f0a1b2c3d4
 *         email:
 *           type: string
 *           format: email
 *           example: user@example.com
 *         name:
 *           type: string
 *           example: Jane Doe
 *         role:
 *           type: string
 *           enum: [admin, instructor, learner]
 *           example: learner
 *     Course:
 *       type: object
 *       description: Course model
 *       properties:
 *         id:
 *           type: string
 *           example: 6600c2c6e6f5c2f0a1b2c3d4
 *         title:
 *           type: string
 *           example: Introduction to Cybersecurity
 *         description:
 *           type: string
 *           example: Learn core security concepts, threats, and best practices.
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           example: draft
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           example: [security, fundamentals]
 *         createdBy:
 *           $ref: '#/components/schemas/User'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     CourseCreateRequest:
 *       type: object
 *       required: [title]
 *       properties:
 *         title:
 *           type: string
 *           example: Introduction to Cybersecurity
 *         description:
 *           type: string
 *           example: Learn core security concepts, threats, and best practices.
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           example: draft
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           example: [security, fundamentals]
 *     CourseUpdateRequest:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           example: Introduction to Cybersecurity (Updated)
 *         description:
 *           type: string
 *           example: Updated description
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           example: published
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           example: [security, fundamentals, compliance]
 */

/**
 * @swagger
 * /courses:
 *   get:
 *     summary: List courses
 *     description: Returns a paginated list of courses. Requires authentication.
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (1-based)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Page size
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Optional text search over course title/description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, archived]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Paginated courses list
 *         content:
 *           application/json:
 *             examples:
 *               example:
 *                 value:
 *                   items:
 *                     - id: 6600c2c6e6f5c2f0a1b2c3d4
 *                       title: Introduction to Cybersecurity
 *                       description: Learn core security concepts, threats, and best practices.
 *                       status: draft
 *                       tags: [security, fundamentals]
 *                       createdAt: '2025-01-01T00:00:00.000Z'
 *                       updatedAt: '2025-01-02T00:00:00.000Z'
 *                   page: 1
 *                   limit: 20
 *                   total: 1
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Course'
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     summary: Create a course
 *     description: Creates a new course. Requires authentication.
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CourseCreateRequest'
 *           examples:
 *             example:
 *               value:
 *                 title: Introduction to Cybersecurity
 *                 description: Learn core security concepts, threats, and best practices.
 *                 status: draft
 *                 tags: [security, fundamentals]
 *     responses:
 *       201:
 *         description: Course created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Course'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', auth, async (req, res) => {
  // Placeholder implementation: OpenAPI-first contract. CRUD will be implemented in a later task.
  return res.status(200).json({ items: [], page: 1, limit: 20, total: 0 });
});

router.post('/', auth, async (req, res) => {
  // Placeholder implementation: OpenAPI-first contract. CRUD will be implemented in a later task.
  return res.status(501).json({ message: 'Not implemented' });
});

/**
 * @swagger
 * /courses/{courseId}:
 *   get:
 *     summary: Get a course by id
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Course id
 *     responses:
 *       200:
 *         description: Course
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Course'
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *   patch:
 *     summary: Update a course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Course id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CourseUpdateRequest'
 *     responses:
 *       200:
 *         description: Updated course
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Course'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Course not found
 *       401:
 *         description: Missing or invalid token
 *   delete:
 *     summary: Delete a course
 *     description: Deletes a course. Requires authentication.
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Course id
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Course not found
 *       401:
 *         description: Missing or invalid token
 */
router.get('/:courseId', auth, async (req, res) => {
  return res.status(501).json({ message: 'Not implemented' });
});

router.patch('/:courseId', auth, async (req, res) => {
  return res.status(501).json({ message: 'Not implemented' });
});

router.delete('/:courseId', auth, async (req, res) => {
  return res.status(501).json({ message: 'Not implemented' });
});

module.exports = router;
