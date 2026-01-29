const express = require('express');
const mongoose = require('mongoose');

const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const Course = require('../models/Course');

const router = express.Router();

const WRITE_ROLES = ['admin', 'instructor'];

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

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeTags(tags) {
  if (tags === undefined) {
    return undefined;
  }
  if (!Array.isArray(tags)) {
    return null;
  }
  const normalized = tags
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean);

  // De-dupe, preserve order.
  const seen = new Set();
  const deduped = [];
  for (const t of normalized) {
    const key = t.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(t);
  }
  return deduped;
}

function toCourseResponse(doc) {
  // doc may be mongoose document or a lean object
  const id = doc._id ? String(doc._id) : String(doc.id);

  const createdBy =
    doc.createdBy && typeof doc.createdBy === 'object'
      ? {
          id: doc.createdBy._id ? String(doc.createdBy._id) : String(doc.createdBy.id),
          email: doc.createdBy.email,
          name: doc.createdBy.name,
          role: doc.createdBy.role,
        }
      : undefined;

  return {
    id,
    title: doc.title,
    description: doc.description,
    status: doc.status,
    tags: doc.tags || [],
    createdBy: createdBy || undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function buildCourseSearchFilter({ search, status }) {
  const filter = { deletedAt: null };

  if (status) {
    filter.status = status;
  }

  if (search && typeof search === 'string' && search.trim().length > 0) {
    const q = search.trim();
    // Simple regex search to avoid requiring text indexes.
    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ];
  }

  return filter;
}

function validateCreatePayload(body) {
  const errors = [];

  const title = body?.title;
  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    errors.push('title is required and must be at least 3 characters');
  }

  const description = body?.description;
  if (description !== undefined && typeof description !== 'string') {
    errors.push('description must be a string');
  }

  const status = body?.status;
  if (status !== undefined && !['draft', 'published', 'archived'].includes(status)) {
    errors.push('status must be one of: draft, published, archived');
  }

  const tagsNormalized = normalizeTags(body?.tags);
  if (tagsNormalized === null) {
    errors.push('tags must be an array of strings');
  }

  return {
    ok: errors.length === 0,
    errors,
    data: {
      title: typeof title === 'string' ? title.trim() : undefined,
      description: typeof description === 'string' ? description.trim() : undefined,
      status,
      tags: tagsNormalized !== null ? tagsNormalized : undefined,
    },
  };
}

function validateUpdatePayload(body) {
  const errors = [];
  const updates = {};

  if (body?.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length < 3) {
      errors.push('title must be a string of at least 3 characters');
    } else {
      updates.title = body.title.trim();
    }
  }

  if (body?.description !== undefined) {
    if (typeof body.description !== 'string') {
      errors.push('description must be a string');
    } else {
      updates.description = body.description.trim();
    }
  }

  if (body?.status !== undefined) {
    if (!['draft', 'published', 'archived'].includes(body.status)) {
      errors.push('status must be one of: draft, published, archived');
    } else {
      updates.status = body.status;
    }
  }

  if (body?.tags !== undefined) {
    const tagsNormalized = normalizeTags(body.tags);
    if (tagsNormalized === null) {
      errors.push('tags must be an array of strings');
    } else {
      updates.tags = tagsNormalized;
    }
  }

  if (Object.keys(updates).length === 0) {
    errors.push('At least one field must be provided to update');
  }

  return { ok: errors.length === 0, errors, updates };
}

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
 */
router.get('/', auth, async (req, res, next) => {
  try {
    const pageRaw = Number(req.query.page || 1);
    const limitRaw = Number(req.query.limit || 20);

    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
    const limit = Number.isFinite(limitRaw)
      ? Math.min(100, Math.max(1, Math.floor(limitRaw)))
      : 20;

    const search = req.query.search;
    const status = req.query.status;

    if (status !== undefined && !['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status filter' });
    }

    const filter = buildCourseSearchFilter({ search, status });

    const [items, total] = await Promise.all([
      Course.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('createdBy', 'email name role')
        .lean(),
      Course.countDocuments(filter),
    ]);

    return res.status(200).json({
      items: items.map(toCourseResponse),
      page,
      limit,
      total,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /courses:
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
 *       403:
 *         description: Insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', auth, rbac(WRITE_ROLES), async (req, res, next) => {
  try {
    const { ok, errors, data } = validateCreatePayload(req.body);

    if (!ok) {
      return res.status(400).json({ message: errors.join('; ') });
    }

    const now = new Date();
    const status = data.status || 'draft';

    const course = await Course.create({
      title: data.title,
      description: data.description || '',
      status,
      tags: data.tags || [],
      createdBy: req.user?.id || null,
      updatedBy: req.user?.id || null,
      publishedAt: status === 'published' ? now : null,
      deletedAt: null,
    });

    const populated = await Course.findById(course._id)
      .populate('createdBy', 'email name role')
      .lean();

    return res.status(201).json(toCourseResponse(populated));
  } catch (err) {
    return next(err);
  }
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
 *       403:
 *         description: Insufficient permissions
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
 *       403:
 *         description: Insufficient permissions
 */
router.get('/:courseId', auth, async (req, res, next) => {
  try {
    const { courseId } = req.params;

    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId' });
    }

    const course = await Course.findOne({ _id: courseId, deletedAt: null })
      .populate('createdBy', 'email name role')
      .lean();

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    return res.status(200).json(toCourseResponse(course));
  } catch (err) {
    return next(err);
  }
});

router.patch('/:courseId', auth, rbac(WRITE_ROLES), async (req, res, next) => {
  try {
    const { courseId } = req.params;

    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId' });
    }

    const { ok, errors, updates } = validateUpdatePayload(req.body);
    if (!ok) {
      return res.status(400).json({ message: errors.join('; ') });
    }

    // If status transitions to published, set publishedAt if not already set.
    if (updates.status === 'published') {
      updates.$set = updates.$set || {};
      // we'll compute after fetching current state
    }

    const existing = await Course.findOne({ _id: courseId, deletedAt: null }).lean();
    if (!existing) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const updateDoc = { ...updates, updatedBy: req.user?.id || null };

    if (updates.status === 'published') {
      if (!existing.publishedAt) {
        updateDoc.publishedAt = new Date();
      }
    }
    if (updates.status && updates.status !== 'published') {
      // Clear publishedAt when moving away from published.
      updateDoc.publishedAt = null;
    }

    const updated = await Course.findOneAndUpdate(
      { _id: courseId, deletedAt: null },
      { $set: updateDoc },
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'email name role')
      .lean();

    if (!updated) {
      return res.status(404).json({ message: 'Course not found' });
    }

    return res.status(200).json(toCourseResponse(updated));
  } catch (err) {
    return next(err);
  }
});

router.delete('/:courseId', auth, rbac(WRITE_ROLES), async (req, res, next) => {
  try {
    const { courseId } = req.params;

    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId' });
    }

    const updated = await Course.findOneAndUpdate(
      { _id: courseId, deletedAt: null },
      {
        $set: {
          deletedAt: new Date(),
          updatedBy: req.user?.id || null,
        },
      },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: 'Course not found' });
    }

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
