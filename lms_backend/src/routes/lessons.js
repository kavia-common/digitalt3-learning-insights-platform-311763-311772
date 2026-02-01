const express = require('express');

const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { getDataSource } = require('../config/db');
const { createAIService } = require('../services/ai');
const { getUploadPresignedUrl, getPresignedUrl } = require('../services/storage');

const router = express.Router();

const WRITE_ROLES = ['admin', 'instructor'];
const ALLOWED_LESSON_STATUSES = ['draft', 'published', 'archived'];

const SORT_FIELDS = ['createdAt', 'updatedAt', 'title', 'order'];
const SORT_ORDERS = ['ASC', 'DESC'];

/**
 * Helper: normalize quiz stored in DB (may be null, JSON, or stringified JSON depending on MySQL driver).
 * @param {any} raw
 * @returns {Array<{questionText: string, options: string[], correctAnswerIndex: number}>|null}
 */
function normalizeStoredQuiz(raw) {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Helper: compute quiz score as percentage 0..100.
 * @param {Array<{questionText: string, options: string[], correctAnswerIndex: number}>} quiz
 * @param {Record<string, number>|Array<number>|undefined|null} answers
 * @returns {{ correctCount: number, total: number, percentage: number }}
 */
function computeQuizScore(quiz, answers) {
  const total = Array.isArray(quiz) ? quiz.length : 0;
  if (!total) return { correctCount: 0, total: 0, percentage: 0 };

  let correctCount = 0;

  for (let i = 0; i < total; i += 1) {
    const q = quiz[i];
    const correct = Number.isFinite(Number(q?.correctAnswerIndex)) ? Number(q.correctAnswerIndex) : null;

    let provided = null;
    if (Array.isArray(answers)) {
      provided = Number.isFinite(Number(answers[i])) ? Number(answers[i]) : null;
    } else if (answers && typeof answers === 'object') {
      // allow either numeric keys ("0") or ("1") etc - try both 0-based and 1-based
      const v0 = answers[i] ?? answers[String(i)];
      const v1 = answers[i + 1] ?? answers[String(i + 1)];
      const raw = v0 !== undefined ? v0 : v1;
      provided = Number.isFinite(Number(raw)) ? Number(raw) : null;
    }

    if (correct !== null && provided !== null && Number.isInteger(provided) && provided >= 0 && provided <= 3) {
      if (provided === correct) correctCount += 1;
    }
  }

  const percentage = Math.round((correctCount / total) * 10000) / 100; // 2 decimals
  return { correctCount, total, percentage };
}

/**
 * @swagger
 * tags:
 *   - name: Lessons
 *     description: Lesson management endpoints
 *   - name: Storage
 *     description: Video storage (S3) helper endpoints
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
 *         videoUrl:
 *           type: string
 *           nullable: true
 *           description: S3 object key for the lesson video (not a public URL)
 *           example: lessons/101/video.mp4
 *         duration:
 *           type: integer
 *           nullable: true
 *           description: Video duration in minutes
 *           example: 15
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
 *           description: Optional duration in minutes
 *           example: 15
 *         videoUrl:
 *           type: string
 *           description: Optional S3 object key for the video (not a public URL)
 *           example: lessons/101/video.mp4
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
 *           description: Lesson content (markdown or HTML). If description is provided, it may be embedded into content.
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
 *           example: lessons/101/video-v2.mp4
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
 *       required: [questionText, options, correctAnswerIndex]
 *       properties:
 *         questionText:
 *           type: string
 *           example: What is threat modeling primarily used for?
 *         options:
 *           type: array
 *           minItems: 4
 *           maxItems: 4
 *           items:
 *             type: string
 *           example: ["Identify threats early", "Encrypt all data", "Write unit tests", "Deploy faster"]
 *         correctAnswerIndex:
 *           type: integer
 *           minimum: 0
 *           maximum: 3
 *           example: 0
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
 *     LessonUploadUrlRequest:
 *       type: object
 *       required: [lessonId, fileName]
 *       properties:
 *         lessonId:
 *           type: integer
 *           format: int32
 *           description: Lesson id to associate the video with
 *           example: 101
 *         fileName:
 *           type: string
 *           description: Original file name (used to derive an S3 key extension)
 *           example: intro.mp4
 *         contentType:
 *           type: string
 *           description: Optional content-type (recommended), e.g. video/mp4
 *           example: video/mp4
 *     LessonUploadUrlResponse:
 *       type: object
 *       properties:
 *         fileKey:
 *           type: string
 *           description: S3 object key to upload to
 *           example: lessons/101/intro.mp4
 *         uploadUrl:
 *           type: string
 *           description: Presigned PUT URL for direct upload
 *     LessonVideoViewUrlResponse:
 *       type: object
 *       properties:
 *         fileKey:
 *           type: string
 *           example: lessons/101/intro.mp4
 *         viewUrl:
 *           type: string
 *           description: Presigned GET URL for temporary private viewing
 */

function isValidId(raw) {
  const n = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(n) && n > 0;
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
    videoUrl: lesson.videoUrl ?? null,
    duration: Number.isFinite(Number(lesson.duration)) ? Number(lesson.duration) : lesson.duration ?? null,
    aiSummary: lesson.aiSummary ?? null,
    aiQuizJson: lesson.aiQuizJson ?? null,
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

  const videoUrl = body?.videoUrl;
  if (videoUrl !== undefined && videoUrl !== null && videoUrl !== '') {
    if (typeof videoUrl !== 'string' || videoUrl.trim().length === 0) {
      errors.push('videoUrl must be a non-empty string (S3 key) when provided');
    }
  }

  const duration = body?.duration;
  if (duration !== undefined && duration !== null) {
    if (!Number.isFinite(Number(duration)) || Number(duration) < 0) {
      errors.push('duration must be a non-negative number');
    }
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

  // If client sends description but no content, still save something helpful.
  const descriptionNormalized = normalizeString(body?.description);
  if (descriptionNormalized === null) {
    errors.push('description must be a string');
  }

  let contentToPersist = typeof contentNormalized === 'string' ? contentNormalized : undefined;
  const pieces = [];
  if (descriptionNormalized && descriptionNormalized.length > 0) {
    pieces.push(descriptionNormalized);
  }
  if (!contentToPersist || contentToPersist.trim().length === 0) {
    if (pieces.length > 0) {
      contentToPersist = pieces.join('\n\n');
    }
  } else if (pieces.length > 0) {
    contentToPersist = `${contentToPersist}\n\n---\n${pieces.join('\n')}`;
  }

  return {
    ok: errors.length === 0,
    errors,
    data: {
      courseId: Number(courseIdRaw),
      title: typeof titleNormalized === 'string' ? titleNormalized.trim() : undefined,
      content: typeof contentToPersist === 'string' ? contentToPersist : undefined,
      order: order !== undefined ? Math.floor(Number(order)) : undefined,
      status,
      videoUrl: typeof videoUrl === 'string' ? videoUrl.trim() : undefined,
      duration: duration !== undefined && duration !== null ? Math.floor(Number(duration)) : undefined,
    },
  };
}

function validateUpdatePayload(body) {
  const errors = [];
  const updates = {};

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

  if (body?.videoUrl !== undefined) {
    if (body.videoUrl === null || body.videoUrl === '') {
      updates.videoUrl = null;
    } else if (typeof body.videoUrl !== 'string' || body.videoUrl.trim().length === 0) {
      errors.push('videoUrl must be a non-empty string (S3 key) when provided');
    } else {
      updates.videoUrl = body.videoUrl.trim();
    }
  }

  if (body?.duration !== undefined) {
    if (body.duration === null) {
      updates.duration = null;
    } else if (!Number.isFinite(Number(body.duration)) || Number(body.duration) < 0) {
      errors.push('duration must be a non-negative number');
    } else {
      updates.duration = Math.floor(Number(body.duration));
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

  if (body?.description !== undefined && updates.content === undefined) {
    const descriptionNormalized = normalizeString(body.description);
    if (descriptionNormalized === null) {
      errors.push('description must be a string');
    } else if (descriptionNormalized && descriptionNormalized.length > 0) {
      updates.__appendToContent = descriptionNormalized;
    }
  }

  if (Object.keys(updates).length === 0) {
    errors.push('At least one field must be provided to update');
  }

  return { ok: errors.length === 0, errors, updates };
}

function parseListQueryParams(query) {
  const page = Math.max(1, Math.floor(Number.isFinite(Number(query.page)) ? Number(query.page) : 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number.isFinite(Number(query.limit)) ? Number(query.limit) : 20)));

  const courseId = query.courseId;
  const search = typeof query.search === 'string' ? query.search.trim() : undefined;

  const sortByRaw = typeof query.sortBy === 'string' ? query.sortBy : 'order';
  const sortBy = SORT_FIELDS.includes(sortByRaw) ? sortByRaw : null;

  const sortOrderRaw = typeof query.sortOrder === 'string' ? query.sortOrder.toUpperCase() : 'ASC';
  const sortOrder = SORT_ORDERS.includes(sortOrderRaw) ? sortOrderRaw : null;

  const includeCourseRaw = typeof query.includeCourse === 'string' ? query.includeCourse : undefined;
  const includeCourse = includeCourseRaw === 'true' || includeCourseRaw === '1';

  return { page, limit, courseId, search, sortBy, sortOrder, includeCourse };
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

    const { page, limit, courseId, search, sortBy, sortOrder, includeCourse } = parseListQueryParams(req.query);

    if (courseId !== undefined && !isValidId(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId filter' });
    }

    if (!sortBy) {
      return res.status(400).json({ message: `Invalid sortBy (allowed: ${SORT_FIELDS.join(', ')})` });
    }
    if (!sortOrder) {
      return res.status(400).json({ message: `Invalid sortOrder (allowed: ${SORT_ORDERS.join(', ')})` });
    }

    const qb = ds.getRepository('Lesson').createQueryBuilder('lesson').where('lesson.deletedAt IS NULL');

    if (includeCourse) {
      qb.innerJoin('lesson.course', 'course', 'course.deletedAt IS NULL');
    }

    if (courseId !== undefined) {
      qb.andWhere('lesson.courseId = :courseId', { courseId: Number(courseId) });
    }

    if (search && search.length > 0) {
      qb.andWhere('lesson.title LIKE :q', { q: `%${search}%` });
    }

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

    const created = await ds.transaction(async (manager) => {
      const courseRepo = manager.getRepository('Course');
      const lessonRepo = manager.getRepository('Lesson');

      const course = await courseRepo.findOne({
        where: { id: data.courseId, deletedAt: null },
        select: { id: true },
      });
      if (!course) {
        const err = new Error('courseId does not refer to an existing course');
        err.statusCode = 400;
        throw err;
      }

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
        videoUrl: data.videoUrl || null,
        duration: data.duration ?? null,
        order: orderToUse,
        status: data.status || 'draft',
        deletedAt: null,
        course: { id: course.id },
      });

      const saved = await lessonRepo.save(lesson);

      // AI Automation:
      // If a transcript/content is present at creation time, auto-generate aiSummary + aiQuizJson and persist.
      const contentForAi = typeof saved.content === 'string' ? saved.content.trim() : '';
      if (contentForAi.length > 0) {
        try {
          const ai = createAIService();
          const [aiSummary, aiQuizJson] = await Promise.all([
            ai.generateSummary(contentForAi),
            ai.generateQuiz(contentForAi),
          ]);

          saved.aiSummary = aiSummary || null;
          saved.aiQuizJson = aiQuizJson || null;
          await lessonRepo.save(saved);
        } catch (aiErr) {
          // Best-effort: lesson creation must succeed even if AI fails.
          // Client can retry via POST /lessons/:id/generate-ai.
          // Avoid logging secrets; keep minimal context.
          // eslint-disable-next-line no-console
          console.warn('AI auto-generation failed during lesson create:', aiErr?.code || aiErr?.message);
        }
      }

      return { saved, courseId: course.id };
    });

    return res.status(201).json(
      toLessonResponse({
        ...created.saved,
        courseId: created.courseId,
      })
    );
  } catch (err) {
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
 * /api/admin/lessons/upload-url:
 *   post:
 *     summary: Get a presigned upload URL for a lesson video
 *     description: >
 *       Returns a presigned PUT URL to upload a video directly to S3. This keeps the backend fast.
 *       The returned fileKey can be stored on the lesson as `videoUrl`.
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LessonUploadUrlRequest'
 *     responses:
 *       200:
 *         description: Upload URL generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LessonUploadUrlResponse'
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
 *       503:
 *         description: Storage not configured
 */
router.post('/admin/lessons/upload-url', auth, rbac(WRITE_ROLES), async (req, res, next) => {
  try {
    const lessonId = req.body?.lessonId;
    const fileName = req.body?.fileName;
    const contentType = req.body?.contentType;

    if (!isValidId(lessonId)) {
      return res.status(400).json({ message: 'lessonId must be a positive integer' });
    }
    if (!fileName || typeof fileName !== 'string' || fileName.trim().length === 0) {
      return res.status(400).json({ message: 'fileName is required' });
    }

    // Keep key deterministic and scoped by lesson id.
    // We preserve extension if present.
    const cleanedName = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `lessons/${Number(lessonId)}/${cleanedName}`;

    const uploadUrl = await getUploadPresignedUrl(fileKey, {
      contentType: typeof contentType === 'string' ? contentType : undefined,
      expiresInSeconds: 900,
    });

    return res.status(200).json({ fileKey, uploadUrl });
  } catch (err) {
    if (err && (err.code === 'AWS_S3_BUCKET_NAME_MISSING' || err.code === 'S3_KEY_INVALID')) {
      return res.status(503).json({ message: err.message });
    }
    return next(err);
  }
});

/**
 * @swagger
 * /lessons/{lessonId}/video-view-url:
 *   post:
 *     summary: Get a presigned view URL for a lesson video
 *     description: >
 *       Returns a presigned GET URL for the lesson's stored `videoUrl` (S3 key). This supports private video playback.
 *     tags: [Storage]
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
 *         description: View URL generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LessonVideoViewUrlResponse'
 *       400:
 *         description: Invalid lessonId or lesson has no videoUrl
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: Lesson not found
 *       503:
 *         description: Storage not configured
 */
router.post('/:lessonId/video-view-url', auth, async (req, res, next) => {
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
      select: { id: true, videoUrl: true },
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }
    if (!lesson.videoUrl || typeof lesson.videoUrl !== 'string' || lesson.videoUrl.trim().length === 0) {
      return res.status(400).json({ message: 'Lesson has no videoUrl set' });
    }

    const fileKey = lesson.videoUrl.trim();
    const viewUrl = await getPresignedUrl(fileKey, { expiresInSeconds: 900 });

    return res.status(200).json({ fileKey, viewUrl });
  } catch (err) {
    if (err && err.code === 'AWS_S3_BUCKET_NAME_MISSING') {
      return res.status(503).json({ message: err.message });
    }
    return next(err);
  }
});

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
 *       503:
 *         description: Database not available (or AI not configured)
 */
router.post('/:lessonId/generate-ai', auth, rbac(WRITE_ROLES), async (req, res, next) => {
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

    const result = await ds.transaction(async (manager) => {
      const lessonRepo = manager.getRepository('Lesson');

      const lesson = await lessonRepo.findOne({
        where: { id, deletedAt: null },
        select: {
          id: true,
          content: true,
          aiSummary: true,
          aiQuizJson: true,
        },
      });

      if (!lesson) {
        const err = new Error('Lesson not found');
        err.statusCode = 404;
        throw err;
      }

      const ai = createAIService();
      const [aiSummary, aiQuizJson] = await Promise.all([
        ai.generateSummary(lesson.content || ''),
        ai.generateQuiz(lesson.content || ''),
      ]);

      lesson.aiSummary = aiSummary || null;
      lesson.aiQuizJson = aiQuizJson || null;
      await lessonRepo.save(lesson);

      return {
        lessonId: lesson.id,
        aiSummary: lesson.aiSummary,
        aiQuizJson: lesson.aiQuizJson,
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    if (err && err.code === 'ANTHROPIC_API_KEY_MISSING') {
      return res.status(503).json({ message: 'AI service not configured (missing ANTHROPIC_API_KEY)' });
    }
    if (err && err.code && String(err.code).startsWith('AI_OUTPUT_')) {
      return res.status(502).json({ message: err.message });
    }
    if (err && err.code === 'AI_INPUT_INVALID') {
      return res.status(400).json({ message: err.message });
    }
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    return next(err);
  }
});

/**
 * @swagger
 * /lessons/{lessonId}/content:
 *   get:
 *     summary: Get AI-generated lesson content (summary + quiz)
 *     description: >
 *       Returns the AI summary and quiz for a lesson in a clean JSON format. Requires authentication.
 *       If aiSummary/aiQuizJson are missing, client can call POST /lessons/{lessonId}/generate-ai (admin/instructor).
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
 *     responses:
 *       200:
 *         description: Lesson AI content
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 lessonId:
 *                   type: integer
 *                   format: int32
 *                 aiSummary:
 *                   type: string
 *                   nullable: true
 *                 aiQuizJson:
 *                   type: array
 *                   nullable: true
 *                   items:
 *                     $ref: '#/components/schemas/LessonQuizQuestion'
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
 *       503:
 *         description: Database not available
 */
router.get('/:lessonId/content', auth, async (req, res, next) => {
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
      select: { id: true, aiSummary: true, aiQuizJson: true },
    });

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    return res.status(200).json({
      lessonId: lesson.id,
      aiSummary: lesson.aiSummary ?? null,
      aiQuizJson: normalizeStoredQuiz(lesson.aiQuizJson),
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /lessons/{lessonId}/submit-quiz:
 *   post:
 *     summary: Submit quiz answers and update the current user's readiness score
 *     description: >
 *       Compares submitted answers against the lesson's aiQuizJson, calculates a percentage score,
 *       and updates the authenticated user's readinessScore using a rolling average.
 *       Requires authentication (mock login remains active; uses JWT auth).
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answers]
 *             properties:
 *               answers:
 *                 description: >
 *                   Answers can be either an array (0-based index per question) or an object map.
 *                   Values must be integers 0..3.
 *                 oneOf:
 *                   - type: array
 *                     items:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 3
 *                   - type: object
 *                     additionalProperties:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 3
 *     responses:
 *       200:
 *         description: Quiz graded and readiness score updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 lessonId:
 *                   type: integer
 *                   format: int32
 *                 correctCount:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 percentage:
 *                   type: number
 *                   format: float
 *                 readinessScore:
 *                   type: number
 *                   format: float
 *                 readinessScoreQuizCount:
 *                   type: integer
 *       400:
 *         description: Invalid input or lesson has no quiz
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid token
 *       404:
 *         description: Lesson not found
 *       503:
 *         description: Database not available
 */
router.post('/:lessonId/submit-quiz', auth, async (req, res, next) => {
  try {
    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { lessonId } = req.params;
    if (!isValidId(lessonId)) {
      return res.status(400).json({ message: 'Invalid lessonId' });
    }

    const answers = req.body?.answers;
    if (!answers || (typeof answers !== 'object' && !Array.isArray(answers))) {
      return res.status(400).json({ message: 'answers is required and must be an array or object' });
    }

    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(401).json({ message: 'Invalid user context' });
    }

    const id = Number(lessonId);

    const result = await ds.transaction(async (manager) => {
      const lessonRepo = manager.getRepository('Lesson');
      const userRepo = manager.getRepository('User');

      const lesson = await lessonRepo.findOne({
        where: { id, deletedAt: null },
        select: { id: true, aiQuizJson: true },
      });

      if (!lesson) {
        const err = new Error('Lesson not found');
        err.statusCode = 404;
        throw err;
      }

      const quiz = normalizeStoredQuiz(lesson.aiQuizJson);
      if (!quiz || quiz.length === 0) {
        const err = new Error('Lesson has no AI quiz available');
        err.statusCode = 400;
        throw err;
      }

      const { correctCount, total, percentage } = computeQuizScore(quiz, answers);

      const user = await userRepo.findOne({
        where: { id: userId },
        select: { id: true, readinessScore: true, readinessScoreQuizCount: true },
      });

      if (!user) {
        const err = new Error('User no longer exists');
        err.statusCode = 401;
        throw err;
      }

      const prevScore = Number(user.readinessScore || 0);
      const prevCount = Number.isFinite(Number(user.readinessScoreQuizCount)) ? Number(user.readinessScoreQuizCount) : 0;

      // Rolling average: newScore = (prevScore*prevCount + percentage) / (prevCount+1)
      const nextCount = prevCount + 1;
      const nextScore = Math.round(((prevScore * prevCount + percentage) / nextCount) * 100) / 100;

      user.readinessScore = nextScore;
      user.readinessScoreQuizCount = nextCount;
      user.readinessScoreUpdatedAt = new Date();
      await userRepo.save(user);

      return {
        lessonId: lesson.id,
        correctCount,
        total,
        percentage,
        readinessScore: Number(user.readinessScore),
        readinessScoreQuizCount: Number(user.readinessScoreQuizCount),
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
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
 *       503:
 *         description: Database not available
 */
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

      // If order is being changed without courseId change, best-effort prevent duplicates within same course.
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

      if (updates.videoUrl !== undefined) existing.videoUrl = updates.videoUrl;
      if (updates.duration !== undefined) existing.duration = updates.duration;

      await lessonRepo.save(existing);

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
