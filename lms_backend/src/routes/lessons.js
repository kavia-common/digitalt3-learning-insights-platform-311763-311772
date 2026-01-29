const express = require('express');

const auth = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Lessons
 *     description: Lesson management endpoints
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Lesson:
 *       type: object
 *       description: Lesson model
 *       properties:
 *         id:
 *           type: string
 *           example: 7700c2c6e6f5c2f0a1b2c3d4
 *         courseId:
 *           type: string
 *           example: 6600c2c6e6f5c2f0a1b2c3d4
 *         title:
 *           type: string
 *           example: Threat Modeling Basics
 *         content:
 *           type: string
 *           example: Lesson content (markdown or HTML)...
 *         order:
 *           type: integer
 *           example: 1
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           example: draft
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     LessonCreateRequest:
 *       type: object
 *       required: [courseId, title]
 *       properties:
 *         courseId:
 *           type: string
 *           example: 6600c2c6e6f5c2f0a1b2c3d4
 *         title:
 *           type: string
 *           example: Threat Modeling Basics
 *         content:
 *           type: string
 *           example: Lesson content (markdown or HTML)...
 *         order:
 *           type: integer
 *           example: 1
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           example: draft
 *     LessonUpdateRequest:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           example: Threat Modeling Basics (Updated)
 *         content:
 *           type: string
 *           example: Updated lesson content...
 *         order:
 *           type: integer
 *           example: 2
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           example: published
 */

/**
 * @swagger
 * /lessons:
 *   get:
 *     summary: List lessons
 *     description: Returns a paginated list of lessons. Can be filtered by courseId. Requires authentication.
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: courseId
 *         schema:
 *           type: string
 *         description: Optional course id to filter lessons
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated lessons list
 *         content:
 *           application/json:
 *             examples:
 *               example:
 *                 value:
 *                   items:
 *                     - id: 7700c2c6e6f5c2f0a1b2c3d4
 *                       courseId: 6600c2c6e6f5c2f0a1b2c3d4
 *                       title: Threat Modeling Basics
 *                       order: 1
 *                       status: draft
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
 *                     $ref: '#/components/schemas/Lesson'
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *       401:
 *         description: Missing or invalid token
 *   post:
 *     summary: Create a lesson
 *     description: Creates a new lesson. Requires authentication.
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LessonCreateRequest'
 *     responses:
 *       201:
 *         description: Lesson created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Lesson'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid token
 */
router.get('/', auth, async (req, res) => {
  return res.status(200).json({ items: [], page: 1, limit: 20, total: 0 });
});

router.post('/', auth, async (req, res) => {
  return res.status(501).json({ message: 'Not implemented' });
});

/**
 * @swagger
 * /courses/{courseId}/lessons:
 *   get:
 *     summary: List lessons for a course
 *     description: Convenience endpoint to list lessons belonging to a course. Requires authentication.
 *     tags: [Lessons]
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
 *         description: Lessons for the course
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Lesson'
 *                 total:
 *                   type: integer
 *       401:
 *         description: Missing or invalid token
 */
router.get('/by-course/:courseId', auth, async (req, res) => {
  return res.status(200).json({ items: [], total: 0 });
});

/**
 * @swagger
 * /lessons/{lessonId}:
 *   get:
 *     summary: Get a lesson by id
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: string
 *         description: Lesson id
 *     responses:
 *       200:
 *         description: Lesson
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Lesson'
 *       404:
 *         description: Lesson not found
 *       401:
 *         description: Missing or invalid token
 *   patch:
 *     summary: Update a lesson
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: string
 *         description: Lesson id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LessonUpdateRequest'
 *     responses:
 *       200:
 *         description: Updated lesson
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Lesson'
 *       400:
 *         description: Validation error
 *       404:
 *         description: Lesson not found
 *       401:
 *         description: Missing or invalid token
 *   delete:
 *     summary: Delete a lesson
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: string
 *         description: Lesson id
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Lesson not found
 *       401:
 *         description: Missing or invalid token
 */
router.get('/:lessonId', auth, async (req, res) => {
  return res.status(501).json({ message: 'Not implemented' });
});

router.patch('/:lessonId', auth, async (req, res) => {
  return res.status(501).json({ message: 'Not implemented' });
});

router.delete('/:lessonId', auth, async (req, res) => {
  return res.status(501).json({ message: 'Not implemented' });
});

module.exports = router;
