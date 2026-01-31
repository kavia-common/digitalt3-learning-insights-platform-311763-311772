const express = require('express');

const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { getDataSource } = require('../config/db');
const { createAIService } = require('../services/ai');

const router = express.Router();

const WRITE_ROLES = ['admin', 'instructor'];
const ALLOWED_LESSON_STATUSES = ['draft', 'published', 'archived'];

const SORT_FIELDS = ['createdAt', 'updatedAt', 'title', 'order'];
const SORT_ORDERS = ['ASC', 'DESC'];

/**
 * @swagger
 * tags:
 *   - name: Lessons
 *     description: Lesson management endpoints
 */

/**
 * NOTE ABOUT ERROR SHAPE:
 * This codebase historically returns errors as: { "message": "..." }.
 * For compatibility, we keep this response contract while ensuring OpenAPI
 * references the shared ErrorResponse schema (defined in courses.js).
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Lesson:
 *       type: object
 *       description: Lesson model (relational)
 *       properties:
 *         id:
 *           type: integer
 *           format: int32
 *           description: Relational primary key (auto-increment integer)
 *           example: 101
 *         courseId:
 *           type: integer
 *           format: int32
 *           description: Foreign key to Course.id
 *           example: 42
 *         title:
 *           type: string
 *           example: Threat Modeling Basics
 *         content:
 *           type: string
 *           example: Lesson content (markdown or HTML)...
 *         aiSummary:
 *           type: string
 *           nullable: true
 *           description: AI-generated 3-paragraph lesson summary
 *           example: "Paragraph 1...\n\nParagraph 2...\n\nParagraph 3..."
 *         aiQuizJson:
 *           type: array
 *           nullable: true
 *           description: AI-generated quiz questions (5 MCQs)
 *           items:
 *             $ref: '#/components/schemas/LessonQuizQuestion'
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
 *           type: integer
 *           format: int32
 *           description: Foreign key to Course.id (must exist and not be soft-deleted)
 *           example: 42
 *         title:
 *           type: string
 *           minLength: 3
 *           maxLength: 200
 *           example: Threat Modeling Basics
 *         description:
 *           type: string
 *           description: Optional short description (alias for content; will be appended or stored into content)
 *           example: Identify threats early and choose mitigations.
 *         duration:
 *           type: integer
 *           description: Optional duration in minutes (currently not persisted in DB schema; accepted for forward compatibility)
 *           example: 15
 *         videoUrl:
 *           type: string
 *           description: Optional video URL (currently not persisted in DB schema; accepted for forward compatibility)
 *           example: https://cdn.example.com/video.mp4
 *         order:
 *           type: integer
 *           minimum: 0
 *           description: Lesson order/index within the course
 *           example: 1
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           example: draft
 *         content:
 *           type: string
 *           description: Lesson content (markdown or HTML). If description/videoUrl are provided, they may be embedded into content.
 *           example: Lesson content (markdown or HTML)...
 *     LessonUpdateRequest:
 *       type: object
 *       properties:
 *         courseId:
 *           type: integer
 *           format: int32
 *           description: Optional change of course foreign key (must exist and not be soft-deleted)
 *           example: 42
 *         title:
 *           type: string
 *           minLength: 3
 *           maxLength: 200
 *           example: Threat Modeling Basics (Updated)
 *         description:
 *           type: string
 *           example: Updated description...
 *         duration:
 *           type: integer
 *           example: 20
 *         videoUrl:
 *           type: string
 *           example: https://cdn.example.com/video2.mp4
 *         order:
 *           type: integer
 *           minimum: 0
 *           example: 2
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           example: published
 *         content:
 *           type: string
 *           example: Updated lesson content...
 *     PaginatedLessonsResponse:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Lesson'
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
 *     LessonsByCourseResponse:
 *       type: object
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Lesson'
 *         total:
 *           type: integer
 *           format: int32
 *           example: 3
 *     LessonQuizQuestion:
 *       type: object
 *       required: [question, options, correctAnswer]
 *       properties:
 *         question:
 *           type: string
 *           example: What is threat modeling primarily used for?
 *         options:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Identify threats early", "Encrypt all data", "Write unit tests", "Deploy faster"]
 *         correctAnswer:
 *           type: string
 *           example: Identify threats early
 *     GenerateAiResponse:
 *       type: object
 *       properties:
 *         lessonId:
 *           type: integer
 *           format: int32
 *           example: 101
 *         aiSummary:
 *           type: string
 *           nullable: true
 *         aiQuizJson:
 *           type: array
 *           nullable: true
 *           items:
 *             $ref: '#/components/schemas/LessonQuizQuestion'
 */

function isValidId(raw) {
  const n = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0;
}

function parsePositiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw || ''), 10);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return n;
}

function parseNonNegativeInt(raw, fallback) {
  const n = Number.parseInt(String(raw || ''), 10);
  if (!Number.isFinite(n) || n < 0) {
    return fallback;
  }
  return n;
}

function normalizeString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? '' : trimmed;
}

function isValidOptionalUrl(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return true;
  }
  if (typeof raw !== 'string') {
    return false;
  }
  try {
    new URL(raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert DB entity (Lesson) to API response shape.
 * Works with objects returned by repository/query builder.
 */
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
    aiSummary: lesson.aiSummary ?? null,
    aiQuizJson: lesson.aiQuizJson ?? null,
    order: lesson.order,
    status: lesson.status,
    createdAt: lesson.createdAt,
    updatedAt: lesson.updatedAt,
  };
}

/**
 * Stronger validation for create payload.
 * We accept additional fields (description, duration, videoUrl) for forward compatibility,
 * but only persist what the current schema supports (title/content/order/status/course relation).
 */
function validateCreatePayload(body) {
  const errors = [];

  const courseIdRaw = body?.courseId;
  if (!isValidId(courseIdRaw)) {
    errors.push('courseId is required and must be a positive integer');
  }

  const titleNormalized = normalizeString(body?.title);
  if (titleNormalized === null) {
    errors.push('title must be a string');
  } else if (!titleNormalized || titleNormalized.trim().length < 3) {
    errors.push('title is required and must be at least 3 characters');
  } else if (titleNormalized.length > 200) {
    errors.push('title must be at most 200 characters');
  }

  const contentNormalized = normalizeString(body?.content);
  if (contentNormalized === null) {
    errors.push('content must be a string');
  }

  const descriptionNormalized = normalizeString(body?.description);
  if (descriptionNormalized === null) {
    errors.push('description must be a string');
  }

  const duration = body?.duration;
  if (duration !== undefined && duration !== null) {
    if (!Number.isFinite(Number(duration)) || Number(duration) < 0) {
      errors.push('duration must be a non-negative number');
    }
  }

  const videoUrl = body?.videoUrl;
  if (!isValidOptionalUrl(videoUrl)) {
    errors.push('videoUrl must be a valid URL');
  }

  const order = body?.order;
  if (order !== undefined && order !== null) {
    if (!Number.isFinite(Number(order)) || Number(order) < 0) {
      errors.push('order must be a non-negative integer');
    }
  }

  const status = body?.status;
  if (status !== undefined && !ALLOWED_LESSON_STATUSES.includes(status)) {
    errors.push('status must be one of: draft, published, archived');
  }

  // Build content payload (schema currently only has "content").
  // If client sends description/videoUrl but no content, we still save a helpful content string.
  let contentToPersist = typeof contentNormalized === 'string' ? contentNormalized : undefined;
  const pieces = [];
  if (descriptionNormalized && descriptionNormalized.length > 0) {
    pieces.push(descriptionNormalized);
  }
  if (videoUrl && typeof videoUrl === 'string' && videoUrl.trim().length > 0) {
    pieces.push(`Video: ${videoUrl.trim()}`);
  }
  if (!contentToPersist || contentToPersist.trim().length === 0) {
    if (pieces.length > 0) {
      contentToPersist = pieces.join('\n\n');
    }
  } else if (pieces.length > 0) {
    // Append optional metadata to content so nothing is lost for clients using newer fields.
    contentToPersist = `${contentToPersist}\n\n---\n${pieces.join('\n')}`;
  }

  return {
    ok: errors.length === 0,
    errors,
    data: {
      courseId: parsePositiveInt(courseIdRaw, null),
      title: typeof titleNormalized === 'string' ? titleNormalized.trim() : undefined,
      content: typeof contentToPersist === 'string' ? contentToPersist : undefined,
      order: order !== undefined ? Math.floor(Number(order)) : undefined,
      status,
    },
  };
}

function validateUpdatePayload(body) {
  const errors = [];
  const updates = {};
  const meta = {};

  if (body?.courseId !== undefined) {
    if (!isValidId(body.courseId)) {
      errors.push('courseId must be a positive integer');
    } else {
      updates.courseId = Number(body.courseId);
    }
  }

  if (body?.title !== undefined) {
    const titleNormalized = normalizeString(body.title);
    if (titleNormalized === null) {
      errors.push('title must be a string');
    } else if (titleNormalized.trim().length < 3) {
      errors.push('title must be at least 3 characters');
    } else if (titleNormalized.length > 200) {
      errors.push('title must be at most 200 characters');
    } else {
      updates.title = titleNormalized.trim();
    }
  }

  if (body?.content !== undefined) {
    const contentNormalized = normalizeString(body.content);
    if (contentNormalized === null) {
      errors.push('content must be a string');
    } else {
      updates.content = contentNormalized;
    }
  }

  if (body?.description !== undefined) {
    const descriptionNormalized = normalizeString(body.description);
    if (descriptionNormalized === null) {
      errors.push('description must be a string');
    } else {
      meta.description = descriptionNormalized;
    }
  }

  if (body?.duration !== undefined) {
    const duration = body.duration;
    if (duration !== null && (!Number.isFinite(Number(duration)) || Number(duration) < 0)) {
      errors.push('duration must be a non-negative number');
    } else {
      meta.duration = duration;
    }
  }

  if (body?.videoUrl !== undefined) {
    if (!isValidOptionalUrl(body.videoUrl)) {
      errors.push('videoUrl must be a valid URL');
    } else {
      meta.videoUrl = body.videoUrl;
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
    if (!ALLOWED_LESSON_STATUSES.includes(body.status)) {
      errors.push('status must be one of: draft, published, archived');
    } else {
      updates.status = body.status;
    }
  }

  // If any "meta" fields are provided but content isn't, we keep the API contract by embedding
  // those into content rather than dropping them.
  if (Object.keys(meta).length > 0 && updates.content === undefined) {
    const pieces = [];
    if (typeof meta.description === 'string' && meta.description.length > 0) {
      pieces.push(meta.description);
    }
    if (meta.videoUrl && typeof meta.videoUrl === 'string' && meta.videoUrl.trim().length > 0) {
      pieces.push(`Video: ${meta.videoUrl.trim()}`);
    }
    if (pieces.length > 0) {
      // We will later merge with existing content in the handler (transactional read+write),
      // because we don't want to overwrite content accidentally.
      updates.__appendToContent = pieces.join('\n\n');
    }
  }

  if (Object.keys(updates).length === 0) {
    errors.push('At least one field must be provided to update');
  }

  return { ok: errors.length === 0, errors, updates };
}

function parseListQueryParams(query) {
  const page = Math.max(1, Math.floor(Number.isFinite(Number(query.page)) ? Number(query.page) : 1));
  const limit = Math.min(
    100,
    Math.max(1, Math.floor(Number.isFinite(Number(query.limit)) ? Number(query.limit) : 20))
  );

  const courseId = query.courseId;
  const search = typeof query.search === 'string' ? query.search.trim() : undefined;

  const sortByRaw = typeof query.sortBy === 'string' ? query.sortBy : 'order';
  const sortBy = SORT_FIELDS.includes(sortByRaw) ? sortByRaw : null;

  const sortOrderRaw = typeof query.sortOrder === 'string' ? query.sortOrder.toUpperCase() : 'ASC';
  const sortOrder = SORT_ORDERS.includes(sortOrderRaw) ? sortOrderRaw : null;

  const includeCourseRaw = typeof query.includeCourse === 'string' ? query.includeCourse : undefined;
  const includeCourse = includeCourseRaw === 'true' || includeCourseRaw === '1';

  return {
    page,
    limit,
    courseId,
    search,
    sortBy,
    sortOrder,
    includeCourse,
  };
}

/**
 * @swagger
 * /lessons:
 *   get:
 *     summary: List lessons
 *     description: >
 *       Returns a paginated list of lessons (excluding soft-deleted rows). Supports filtering by courseId,
 *       searching by title, and sorting. Requires authentication (learner read-only).
 *     tags: [Lessons]
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
 *         name: courseId
 *         schema:
 *           type: integer
 *           format: int32
 *         description: Optional filter by Course.id (foreign key)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Optional search by lesson title (substring match)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [order, createdAt, updatedAt, title]
 *           default: order
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: ASC
 *         description: Sort direction
 *       - in: query
 *         name: includeCourse
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, joins Course to validate course soft-delete (slower; default false)
 *     responses:
 *       200:
 *         description: Paginated lessons list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedLessonsResponse'
 *             examples:
 *               example:
 *                 value:
 *                   items:
 *                     - id: 101
 *                       courseId: 42
 *                       title: Threat Modeling Basics
 *                       content: Lesson content...
 *                       order: 1
 *                       status: draft
 *                       createdAt: "2025-01-01T10:00:00.000Z"
 *                       updatedAt: "2025-01-01T10:00:00.000Z"
 *                   page: 1
 *                   limit: 20
 *                   total: 1
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       503:
 *         description: Database not available
 */
router.get('/', auth, async (req, res, next) => {
  try {
    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { page, limit, courseId, search, sortBy, sortOrder, includeCourse } = parseListQueryParams(
      req.query
    );

    if (courseId !== undefined && !isValidId(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId filter' });
    }

    if (!sortBy) {
      return res.status(400).json({ message: `Invalid sortBy (allowed: ${SORT_FIELDS.join(', ')})` });
    }
    if (!sortOrder) {
      return res.status(400).json({ message: `Invalid sortOrder (allowed: ${SORT_ORDERS.join(', ')})` });
    }

    // Query optimization:
    // - Always filter lesson.deletedAt IS NULL.
    // - Optional filter courseId hits the FK index.
    // - Search uses LIKE on title (ideally add DB index later if needed).
    const qb = ds
      .getRepository('Lesson')
      .createQueryBuilder('lesson')
      .where('lesson.deletedAt IS NULL');

    // Optionally ensure course isn't soft-deleted too (requires join).
    if (includeCourse) {
      qb.innerJoin('lesson.course', 'course', 'course.deletedAt IS NULL');
    }

    if (courseId !== undefined) {
      qb.andWhere('lesson.courseId = :courseId', { courseId: Number(courseId) });
    }

    if (search && search.length > 0) {
      qb.andWhere('lesson.title LIKE :q', { q: `%${search}%` });
    }

    // Stable ordering: always add deterministic tie-breakers.
    qb.orderBy(`lesson.${sortBy}`, sortOrder).addOrderBy('lesson.id', 'ASC');

    qb.skip((page - 1) * limit).take(limit);

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
 *     description: Creates a new lesson. Requires authentication (admin/instructor only). Course must exist and not be soft-deleted.
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
 *         description: Validation error (including invalid courseId)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Insufficient permissions
 *       503:
 *         description: Database not available
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

    // Use a transaction since we validate FK existence then insert.
    const created = await ds.transaction(async (manager) => {
      const courseRepo = manager.getRepository('Course');
      const lessonRepo = manager.getRepository('Lesson');

      // Ensure course exists and isn't deleted
      const course = await courseRepo.findOne({
        where: { id: data.courseId, deletedAt: null },
        select: { id: true },
      });
      if (!course) {
        const err = new Error('courseId does not refer to an existing course');
        err.statusCode = 400;
        throw err;
      }

      // Optional: avoid duplicate order within a course (soft-deleted lessons excluded).
      // This is not enforced by a DB constraint, so we do a best-effort check.
      const orderToUse = data.order !== undefined ? data.order : 0;
      const existingSameOrder = await lessonRepo.findOne({
        where: { deletedAt: null, course: { id: course.id }, order: orderToUse },
        select: { id: true },
        relations: { course: true },
      });
      if (existingSameOrder) {
        const err = new Error('A lesson with the same order already exists for this course');
        err.statusCode = 400;
        throw err;
      }

      const lesson = lessonRepo.create({
        title: data.title,
        content: data.content || '',
        order: orderToUse,
        status: data.status || 'draft',
        deletedAt: null,
        course: { id: course.id },
      });

      const saved = await lessonRepo.save(lesson);
      return { saved, courseId: course.id };
    });

    return res.status(201).json(
      toLessonResponse({
        ...created.saved,
        courseId: created.courseId,
      })
    );
  } catch (err) {
    // Localized handling for explicit validation errors thrown inside transaction.
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    return next(err);
  }
});

/**
 * @swagger
 * /courses/{courseId}/lessons:
 *   get:
 *     summary: List lessons for a course
 *     description: Convenience endpoint to list lessons belonging to a course (excluding soft-deleted lessons). Requires authentication.
 *     tags: [Lessons]
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
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Optional search by lesson title
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [order, createdAt, updatedAt, title]
 *           default: order
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: ASC
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Lessons for the course
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LessonsByCourseResponse'
 *       400:
 *         description: Invalid courseId or query params
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       503:
 *         description: Database not available
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

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const sortByRaw = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'order';
    const sortBy = SORT_FIELDS.includes(sortByRaw) ? sortByRaw : null;

    const sortOrderRaw = typeof req.query.sortOrder === 'string' ? req.query.sortOrder.toUpperCase() : 'ASC';
    const sortOrder = SORT_ORDERS.includes(sortOrderRaw) ? sortOrderRaw : null;

    if (!sortBy) {
      return res.status(400).json({ message: `Invalid sortBy (allowed: ${SORT_FIELDS.join(', ')})` });
    }
    if (!sortOrder) {
      return res.status(400).json({ message: `Invalid sortOrder (allowed: ${SORT_ORDERS.join(', ')})` });
    }

    // Use QB to support search + ordering.
    const qb = ds
      .getRepository('Lesson')
      .createQueryBuilder('lesson')
      .where('lesson.deletedAt IS NULL')
      .andWhere('lesson.courseId = :courseId', { courseId: Number(courseId) })
      .orderBy(`lesson.${sortBy}`, sortOrder)
      .addOrderBy('lesson.id', 'ASC');

    if (search && search.length > 0) {
      qb.andWhere('lesson.title LIKE :q', { q: `%${search}%` });
    }

    const items = await qb.getMany();

    return res.status(200).json({ items: items.map(toLessonResponse), total: items.length });
  } catch (err) {
    return next(err);
  }
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
 *           type: integer
 *           format: int32
 *         description: Relational lesson id
 *     responses:
 *       200:
 *         description: Lesson
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Lesson'
 *       400:
 *         description: Invalid lessonId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: Lesson not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Database not available
 *   patch:
 *     summary: Update a lesson
 *     description: Updates a lesson (excluding soft-deleted). Requires authentication (admin/instructor only).
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: integer
 *           format: int32
 *         description: Relational lesson id
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
 *         description: Validation error or invalid lessonId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Lesson not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Database not available
 *   delete:
 *     summary: Delete a lesson
 *     description: Soft-deletes a lesson (sets deletedAt). Requires authentication (admin/instructor only).
 *     tags: [Lessons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: integer
 *           format: int32
 *         description: Relational lesson id
 *     responses:
 *       204:
 *         description: Deleted
 *       400:
 *         description: Invalid lessonId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Lesson not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Database not available
 */
/**
 * @swagger
 * /lessons/{lessonId}/generate-ai:
 *   post:
 *     summary: Generate AI summary and quiz for a lesson
 *     description: >
 *       Uses Anthropic Claude to generate a 3-paragraph summary and a 5-question MCQ quiz from the lesson content,
 *       persists the results to the lesson record (aiSummary, aiQuizJson), and returns the generated fields.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: integer
 *           format: int32
 *         description: Relational lesson id
 *     responses:
 *       200:
 *         description: AI content generated and saved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GenerateAiResponse'
 *       400:
 *         description: Invalid lessonId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Lesson not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Database not available (or AI not configured)
 */
=======
/**
 * @swagger
 * /api/lessons/{lessonId}/generate-ai:
 *   post:
 *     summary: Generate AI summary and quiz for a lesson (alias)
 *     description: Alias for `/lessons/{lessonId}/generate-ai` to support `/api/*` base path.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: integer
 *           format: int32
 *     responses:
 *       200:
 *         description: AI content generated and saved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GenerateAiResponse'
 */
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: integer
 *           format: int32
 *         description: Relational lesson id
 *     responses:
 *       200:
 *         description: AI content generated and saved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GenerateAiResponse'
 *       400:
 *         description: Invalid lessonId
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Lesson not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Database not available (or AI not configured)
 */
+router.post('/:lessonId/generate-ai', auth, rbac(WRITE_ROLES), async (req, res, next) => {
+  try {
+    const ds = getDataSource();
+    if (!ds || !ds.isInitialized) {
+      return res.status(503).json({ message: 'Database not available' });
+    }
+
+    const { lessonId } = req.params;
+    if (!isValidId(lessonId)) {
+      return res.status(400).json({ message: 'Invalid lessonId' });
+    }
+
+    const id = Number(lessonId);
+
+    const result = await ds.transaction(async (manager) => {
+      const lessonRepo = manager.getRepository('Lesson');
+
+      const lesson = await lessonRepo.findOne({
+        where: { id, deletedAt: null },
+        select: {
+          id: true,
+          content: true,
+          aiSummary: true,
+          aiQuizJson: true,
+        },
+      });
+
+      if (!lesson) {
+        const err = new Error('Lesson not found');
+        err.statusCode = 404;
+        throw err;
+      }
+
+      const ai = createAIService();
+      const [aiSummary, aiQuizJson] = await Promise.all([
+        ai.generateSummary(lesson.content || ''),
+        ai.generateQuiz(lesson.content || ''),
+      ]);
+
+      // Persist results
+      lesson.aiSummary = aiSummary || null;
+      lesson.aiQuizJson = aiQuizJson || null;
+      await lessonRepo.save(lesson);
+
+      return {
+        lessonId: lesson.id,
+        aiSummary: lesson.aiSummary,
+        aiQuizJson: lesson.aiQuizJson,
+      };
+    });
+
+    return res.status(200).json(result);
+  } catch (err) {
+    if (err && err.code === 'ANTHROPIC_API_KEY_MISSING') {
+      return res.status(503).json({ message: 'AI service not configured (missing ANTHROPIC_API_KEY)' });
+    }
+    if (err && err.code && String(err.code).startsWith('AI_OUTPUT_')) {
+      return res.status(502).json({ message: err.message });
+    }
+    if (err && err.code === 'AI_INPUT_INVALID') {
+      return res.status(400).json({ message: err.message });
+    }
+    if (err && err.statusCode) {
+      return res.status(err.statusCode).json({ message: err.message });
+    }
+    return next(err);
+  }
+});
+
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

    const updatedLesson = await ds.transaction(async (manager) => {
      const lessonRepo = manager.getRepository('Lesson');
      const courseRepo = manager.getRepository('Course');

      const existing = await lessonRepo.findOne({
        where: { id, deletedAt: null },
        relations: { course: true },
      });

      if (!existing) {
        const err = new Error('Lesson not found');
        err.statusCode = 404;
        throw err;
      }

      // If courseId is being changed, verify FK exists and not soft-deleted
      if (updates.courseId !== undefined) {
        const targetCourseId = Number(updates.courseId);
        const course = await courseRepo.findOne({
          where: { id: targetCourseId, deletedAt: null },
          select: { id: true },
        });
        if (!course) {
          const err = new Error('courseId does not refer to an existing course');
          err.statusCode = 400;
          throw err;
        }

        // If order is also set (or stays the same), best-effort uniqueness within course.
        const orderToUse =
          updates.order !== undefined ? updates.order : Number.isFinite(Number(existing.order)) ? existing.order : 0;

        const sameOrder = await lessonRepo.findOne({
          where: { deletedAt: null, course: { id: targetCourseId }, order: orderToUse },
          select: { id: true },
          relations: { course: true },
        });
        if (sameOrder && Number(sameOrder.id) !== Number(existing.id)) {
          const err = new Error('A lesson with the same order already exists for this course');
          err.statusCode = 400;
          throw err;
        }

        existing.course = { id: targetCourseId };
      }

      // If order is being changed without courseId change, still best-effort prevent duplicates within same course.
      if (updates.order !== undefined && updates.courseId === undefined) {
        const orderToUse = updates.order;
        const courseIdToUse = existing.course?.id ? Number(existing.course.id) : existing.courseId;

        if (courseIdToUse) {
          const sameOrder = await lessonRepo.findOne({
            where: { deletedAt: null, course: { id: Number(courseIdToUse) }, order: orderToUse },
            select: { id: true },
            relations: { course: true },
          });
          if (sameOrder && Number(sameOrder.id) !== Number(existing.id)) {
            const err = new Error('A lesson with the same order already exists for this course');
            err.statusCode = 400;
            throw err;
          }
        }
      }

      // Merge content append if present
      let nextContent = updates.content !== undefined ? updates.content : existing.content;
      if (updates.__appendToContent) {
        const appendix = String(updates.__appendToContent);
        if (typeof nextContent !== 'string') {
          nextContent = '';
        }
        nextContent = nextContent.trim().length > 0 ? `${nextContent}\n\n---\n${appendix}` : appendix;
      }

      if (updates.title !== undefined) existing.title = updates.title;
      if (updates.status !== undefined) existing.status = updates.status;
      if (updates.order !== undefined) existing.order = updates.order;
      if (updates.content !== undefined || updates.__appendToContent) existing.content = nextContent;

      // IMPORTANT: do not allow direct mass assignment of unknown keys
      await lessonRepo.save(existing);

      // Re-hydrate with relations to compute courseId
      const hydrated = await lessonRepo.findOne({
        where: { id: existing.id, deletedAt: null },
        relations: { course: true },
      });

      if (!hydrated) {
        const err = new Error('Lesson not found');
        err.statusCode = 404;
        throw err;
      }

      return hydrated;
    });

    return res.status(200).json(toLessonResponse(updatedLesson));
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
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
