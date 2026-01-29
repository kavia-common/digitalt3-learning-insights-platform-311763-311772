const express = require('express');

const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { getDataSource } = require('../config/db');

const router = express.Router();

const WRITE_ROLES = ['admin', 'instructor'];

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

function isValidId(raw) {
  const n = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0;
}

function toLessonResponse(lesson) {
  return {
    id: String(lesson.id),
    courseId: lesson.courseId
      ? String(lesson.courseId)
      : lesson.course?.id
        ? String(lesson.course.id)
        : undefined,
    title: lesson.title,
    content: lesson.content,
    order: lesson.order,
    status: lesson.status,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}

function validateCreatePayload(body) {
  const errors = [];
  const courseIdRaw = body?.courseId;

  if (!isValidId(courseIdRaw)) {
    errors.push('courseId is required and must be a positive integer');
  }

  const title = body?.title;
  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    errors.push('title is required and must be at least 3 characters');
  }

  const content = body?.content;
  if (content !== undefined && typeof content !== 'string') {
    errors.push('content must be a string');
  }

  const order = body?.order;
  if (order !== undefined && (!Number.isFinite(Number(order)) || Number(order) < 0)) {
    errors.push('order must be a non-negative integer');
  }

  const status = body?.status;
  if (status !== undefined && !['draft', 'published', 'archived'].includes(status)) {
    errors.push('status must be one of: draft, published, archived');
  }

  return {
    ok: errors.length === 0,
    errors,
    data: {
      courseId: Number.parseInt(String(courseIdRaw || ''), 10),
      title: typeof title === 'string' ? title.trim() : undefined,
      content: typeof content === 'string' ? content : undefined,
      order: order !== undefined ? Math.floor(Number(order)) : undefined,
      status,
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

  if (body?.content !== undefined) {
    if (typeof body.content !== 'string') {
      errors.push('content must be a string');
    } else {
      updates.content = body.content;
    }
  }

  if (body?.order !== undefined) {
    if (!Number.isFinite(Number(body.order)) || Number(body.order) < 0) {
      errors.push('order must be a non-negative integer');
    } else {
      updates.order = Math.floor(Number(body.order));
    }
  }

  if (body?.status !== undefined) {
    if (!['draft', 'published', 'archived'].includes(body.status)) {
      errors.push('status must be one of: draft, published, archived');
    } else {
      updates.status = body.status;
    }
  }

  if (Object.keys(updates).length === 0) {
    errors.push('At least one field must be provided to update');
  }

  return { ok: errors.length === 0, errors, updates };
}

/**
 * @swagger
 * /lessons:
 *   get:
 *     summary: List lessons
 *     description: Returns a paginated list of lessons. Can be filtered by courseId. Requires authentication.
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
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

    const courseId = req.query.courseId;
    if (courseId !== undefined && !isValidId(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId filter' });
    }

    const qb = ds.getRepository('Lesson').createQueryBuilder('lesson').where('lesson.deletedAt IS NULL');

    if (courseId !== undefined) {
      qb.andWhere('lesson.courseId = :courseId', { courseId: Number(courseId) });
    }

    qb.orderBy('lesson.order', 'ASC')
      .addOrderBy('lesson.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return res.status(200).json({
      items: items.map(toLessonResponse),
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
 * /lessons:
 *   post:
 *     summary: Create a lesson
 *     description: Creates a new lesson. Requires authentication.
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
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

    // Ensure course exists and isn't deleted
    const courseRepo = ds.getRepository('Course');
    const course = await courseRepo.findOne({
      where: { id: data.courseId, deletedAt: null },
      select: { id: true },
    });
    if (!course) {
      return res.status(400).json({ message: 'courseId does not refer to an existing course' });
    }

    const lessonRepo = ds.getRepository('Lesson');
    const lesson = lessonRepo.create({
      title: data.title,
      content: data.content || '',
      order: data.order !== undefined ? data.order : 0,
      status: data.status || 'draft',
      deletedAt: null,
      course: { id: course.id },
    });

    const saved = await lessonRepo.save(lesson);

    return res.status(201).json(
      toLessonResponse({
        ...saved,
        courseId: course.id,
      })
    );
  } catch (err) {
    return next(err);
  }
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
 */
router.get('/by-course/:courseId', auth, async (req, res, next) => {
  try {
    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { courseId } = req.params;
    if (!isValidId(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId' });
    }

    const lessonRepo = ds.getRepository('Lesson');
    const items = await lessonRepo.find({
      where: { deletedAt: null, course: { id: Number(courseId) } },
      order: { order: 'ASC', createdAt: 'ASC' },
    });

    return res.status(200).json({ items: items.map(toLessonResponse), total: items.length });
  } catch (err) {
    return next(err);
  }
});

router.get('/:lessonId', auth, async (req, res, next) => {
  try {
    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { lessonId } = req.params;
    if (!isValidId(lessonId)) {
      return res.status(400).json({ message: 'Invalid lessonId' });
    }

    const id = Number(lessonId);
    const lessonRepo = ds.getRepository('Lesson');

    const lesson = await lessonRepo.findOne({
      where: { id, deletedAt: null },
      relations: { course: true },
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    return res.status(200).json(toLessonResponse(lesson));
  } catch (err) {
    return next(err);
  }
});

router.patch('/:lessonId', auth, rbac(WRITE_ROLES), async (req, res, next) => {
  try {
    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { lessonId } = req.params;
    if (!isValidId(lessonId)) {
      return res.status(400).json({ message: 'Invalid lessonId' });
    }

    const { ok, errors, updates } = validateUpdatePayload(req.body);
    if (!ok) {
      return res.status(400).json({ message: errors.join('; ') });
    }

    const id = Number(lessonId);
    const lessonRepo = ds.getRepository('Lesson');

    const existing = await lessonRepo.findOne({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    await lessonRepo.update({ id, deletedAt: null }, updates);

    const updated = await lessonRepo.findOne({
      where: { id, deletedAt: null },
      relations: { course: true },
    });

    if (!updated) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    return res.status(200).json(toLessonResponse(updated));
  } catch (err) {
    return next(err);
  }
});

router.delete('/:lessonId', auth, rbac(WRITE_ROLES), async (req, res, next) => {
  try {
    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { lessonId } = req.params;
    if (!isValidId(lessonId)) {
      return res.status(400).json({ message: 'Invalid lessonId' });
    }

    const id = Number(lessonId);
    const lessonRepo = ds.getRepository('Lesson');

    const existing = await lessonRepo.findOne({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    await lessonRepo.update({ id, deletedAt: null }, { deletedAt: new Date() });

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
