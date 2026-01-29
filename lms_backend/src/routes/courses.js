const express = require('express');

const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { getDataSource } = require('../config/db');

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
 *           type: integer
 *           format: int32
 *           description: Relational primary key (auto-increment integer)
 *           example: 123
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
 *       description: Course model (relational)
 *       properties:
 *         id:
 *           type: integer
 *           format: int32
 *           description: Relational primary key (auto-increment integer)
 *           example: 42
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
 *     PaginatedCoursesResponse:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Course'
 *         page:
 *           type: integer
 *           format: int32
 *           example: 1
 *         limit:
 *           type: integer
 *           format: int32
 *           example: 20
 *         total:
 *           type: integer
 *           format: int32
 *           example: 100
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

function isValidId(raw) {
  const n = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0;
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

/**
 * Convert DB entity to API response shape.
 * Works with objects returned by repository/query builder.
 */
function toCourseResponse(course) {
  const createdBy =
    course.createdBy && typeof course.createdBy === 'object'
      ? {
          id: String(course.createdBy.id),
          email: course.createdBy.email,
          name: course.createdBy.name,
          role: course.createdBy.role,
        }
      : undefined;

  return {
    id: String(course.id),
    title: course.title,
    description: course.description,
    status: course.status,
    tags: Array.isArray(course.tags) ? course.tags : [],
    createdBy: createdBy || undefined,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
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
 *             schema:
 *               $ref: '#/components/schemas/PaginatedCoursesResponse'
 *       401:
 *         description: Missing or invalid token
 */
router.get('/', auth, async (req, res, next) => {
  try {
    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const pageRaw = Number(req.query.page || 1);
    const limitRaw = Number(req.query.limit || 20);

    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 20;

    const search = req.query.search;
    const status = req.query.status;

    if (status !== undefined && !['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status filter' });
    }

    const qb = ds
      .getRepository('Course')
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.createdBy', 'createdBy')
      .where('course.deletedAt IS NULL');

    if (status) {
      qb.andWhere('course.status = :status', { status });
    }

    if (search && typeof search === 'string' && search.trim().length > 0) {
      const q = `%${search.trim()}%`;
      qb.andWhere('(course.title LIKE :q OR course.description LIKE :q)', { q });
    }

    qb.orderBy('course.createdAt', 'DESC').skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

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
 *       403:
 *         description: Insufficient permissions
 */
router.post('/', auth, rbac(WRITE_ROLES), async (req, res, next) => {
  try {
    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { ok, errors, data } = validateCreatePayload(req.body);

    if (!ok) {
      return res.status(400).json({ message: errors.join('; ') });
    }

    const now = new Date();
    const status = data.status || 'draft';

    const courseRepo = ds.getRepository('Course');
    const course = courseRepo.create({
      title: data.title,
      description: data.description || '',
      status,
      tags: data.tags || [],
      publishedAt: status === 'published' ? now : null,
      deletedAt: null,
      createdBy: req.user?.id ? { id: Number(req.user.id) } : null,
      updatedBy: req.user?.id ? { id: Number(req.user.id) } : null,
    });

    const saved = await courseRepo.save(course);

    const hydrated = await courseRepo.findOne({
      where: { id: saved.id },
      relations: { createdBy: true },
    });

    return res.status(201).json(toCourseResponse(hydrated || saved));
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
 *           type: integer
 *           format: int32
 *         description: Relational course id
 *     responses:
 *       200:
 *         description: Course
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Course'
 *       400:
 *         description: Invalid courseId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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
 *           type: integer
 *           format: int32
 *         description: Relational course id
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
 *         description: Validation error or invalid courseId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   delete:
 *     summary: Delete a course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: integer
 *           format: int32
 *         description: Relational course id
 *     responses:
 *       204:
 *         description: Deleted
 *       400:
 *         description: Invalid courseId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:courseId', auth, async (req, res, next) => {
  try {
    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { courseId } = req.params;

    if (!isValidId(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId' });
    }

    const id = Number(courseId);
    const courseRepo = ds.getRepository('Course');

    const course = await courseRepo.findOne({
      where: { id, deletedAt: null },
      relations: { createdBy: true },
    });

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
    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { courseId } = req.params;

    if (!isValidId(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId' });
    }

    const { ok, errors, updates } = validateUpdatePayload(req.body);
    if (!ok) {
      return res.status(400).json({ message: errors.join('; ') });
    }

    const id = Number(courseId);
    const courseRepo = ds.getRepository('Course');

    const existing = await courseRepo.findOne({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Handle publishedAt rules
    if (updates.status === 'published') {
      if (!existing.publishedAt) {
        updates.publishedAt = new Date();
      }
    }
    if (updates.status && updates.status !== 'published') {
      updates.publishedAt = null;
    }

    // Track updater
    if (req.user?.id) {
      updates.updatedBy = { id: Number(req.user.id) };
    }

    await courseRepo.update({ id, deletedAt: null }, updates);

    const updated = await courseRepo.findOne({
      where: { id, deletedAt: null },
      relations: { createdBy: true },
    });

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
    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { courseId } = req.params;

    if (!isValidId(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId' });
    }

    const id = Number(courseId);
    const courseRepo = ds.getRepository('Course');

    const existing = await courseRepo.findOne({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ message: 'Course not found' });
    }

    await courseRepo.update(
      { id, deletedAt: null },
      {
        deletedAt: new Date(),
        updatedBy: req.user?.id ? { id: Number(req.user.id) } : null,
      }
    );

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
