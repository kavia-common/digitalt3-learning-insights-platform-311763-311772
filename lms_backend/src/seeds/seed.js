require('dotenv').config();

const bcrypt = require('bcrypt');
const { createDataSourceFromEnv } = require('../config/db');

function envOrDefault(key, fallback) {
  const v = process.env[key];
  return v && String(v).trim().length > 0 ? String(v).trim() : fallback;
}

/**
 * Idempotently upsert a user by email.
 * @param {import('typeorm').Repository<any>} userRepo
 * @param {{email: string, name: string, role: 'admin'|'instructor'|'learner', password: string}} user
 */
async function upsertUser(userRepo, user) {
  const normalizedEmail = user.email.trim().toLowerCase();

  const existing = await userRepo.findOne({
    where: { email: normalizedEmail },
    select: { id: true, email: true, name: true, role: true },
  });

  if (existing) {
    // Keep seed stable: update name/role but do not override password unless explicitly desired later.
    await userRepo.update(
      { id: existing.id },
      {
        name: user.name,
        role: user.role,
      }
    );
    const updated = await userRepo.findOne({ where: { id: existing.id } });
    return updated;
  }

  const passwordHash = await bcrypt.hash(user.password, 12);

  const created = userRepo.create({
    email: normalizedEmail,
    passwordHash,
    name: user.name,
    role: user.role,
  });

  return userRepo.save(created);
}

/**
 * Idempotently create a course by title, tied to createdBy/updatedBy.
 * @param {import('typeorm').Repository<any>} courseRepo
 * @param {{title: string, description: string, status: 'draft'|'published'|'archived', tags: string[], createdById: number}} input
 */
async function upsertCourse(courseRepo, input) {
  const existing = await courseRepo.findOne({
    where: { title: input.title, deletedAt: null },
    select: { id: true, title: true },
  });

  const now = new Date();
  const publishedAt = input.status === 'published' ? now : null;

  if (existing) {
    await courseRepo.update(
      { id: existing.id },
      {
        description: input.description,
        status: input.status,
        tags: input.tags,
        publishedAt,
        updatedBy: { id: input.createdById },
      }
    );
    return courseRepo.findOne({ where: { id: existing.id } });
  }

  const created = courseRepo.create({
    title: input.title,
    description: input.description,
    status: input.status,
    tags: input.tags,
    publishedAt,
    deletedAt: null,
    createdBy: { id: input.createdById },
    updatedBy: { id: input.createdById },
  });

  return courseRepo.save(created);
}

/**
 * Idempotently upsert a lesson by (courseId, order).
 * @param {import('typeorm').Repository<any>} lessonRepo
 * @param {{courseId: number, order: number, title: string, content: string, status: 'draft'|'published'|'archived'}} input
 */
async function upsertLesson(lessonRepo, input) {
  const existing = await lessonRepo.findOne({
    where: { deletedAt: null, course: { id: input.courseId }, order: input.order },
    relations: { course: true },
  });

  if (existing) {
    await lessonRepo.update(
      { id: existing.id },
      {
        title: input.title,
        content: input.content,
        status: input.status,
      }
    );
    return lessonRepo.findOne({ where: { id: existing.id }, relations: { course: true } });
  }

  const created = lessonRepo.create({
    title: input.title,
    content: input.content,
    order: input.order,
    status: input.status,
    deletedAt: null,
    course: { id: input.courseId },
  });

  return lessonRepo.save(created);
}

// PUBLIC_INTERFACE
async function runSeeds() {
  /** Runs seed data insertion for users/courses/lessons. */
  const ds = createDataSourceFromEnv();
  await ds.initialize();

  try {
    const userRepo = ds.getRepository('User');
    const courseRepo = ds.getRepository('Course');
    const lessonRepo = ds.getRepository('Lesson');

    // Seed user credentials (override via env in real environments)
    const adminEmail = envOrDefault('SEED_ADMIN_EMAIL', 'admin@example.com');
    const adminPassword = envOrDefault('SEED_ADMIN_PASSWORD', 'AdminPass123!');

    const instructorEmail = envOrDefault('SEED_INSTRUCTOR_EMAIL', 'instructor@example.com');
    const instructorPassword = envOrDefault('SEED_INSTRUCTOR_PASSWORD', 'InstructorPass123!');

    const learnerEmail = envOrDefault('SEED_LEARNER_EMAIL', 'learner@example.com');
    const learnerPassword = envOrDefault('SEED_LEARNER_PASSWORD', 'LearnerPass123!');

    const admin = await upsertUser(userRepo, {
      email: adminEmail,
      password: adminPassword,
      name: 'Admin User',
      role: 'admin',
    });

    const instructor = await upsertUser(userRepo, {
      email: instructorEmail,
      password: instructorPassword,
      name: 'Instructor User',
      role: 'instructor',
    });

    const learner = await upsertUser(userRepo, {
      email: learnerEmail,
      password: learnerPassword,
      name: 'Learner User',
      role: 'learner',
    });

    // Sample courses created by instructor
    const course1 = await upsertCourse(courseRepo, {
      title: 'Introduction to Cybersecurity',
      description: 'Learn core security concepts, threats, and best practices.',
      status: 'published',
      tags: ['security', 'fundamentals'],
      createdById: instructor.id,
    });

    const course2 = await upsertCourse(courseRepo, {
      title: 'Secure Coding Basics',
      description: 'Practical secure coding habits to reduce vulnerabilities in web apps.',
      status: 'draft',
      tags: ['security', 'development', 'owasp'],
      createdById: instructor.id,
    });

    // Sample lessons (linked properly)
    await upsertLesson(lessonRepo, {
      courseId: course1.id,
      order: 1,
      title: 'Threat Modeling Basics',
      content:
        'Threat modeling helps identify risks early. Learn common threat categories and simple mitigations.',
      status: 'published',
    });

    await upsertLesson(lessonRepo, {
      courseId: course1.id,
      order: 2,
      title: 'Authentication & Authorization',
      content:
        'Understand the difference between authentication and authorization, and how to implement them safely.',
      status: 'published',
    });

    await upsertLesson(lessonRepo, {
      courseId: course2.id,
      order: 1,
      title: 'Input Validation & Output Encoding',
      content:
        'Validate inputs, encode outputs. Cover SQLi, XSS, and safe patterns to prevent injection bugs.',
      status: 'draft',
    });

    // Minimal log (no secrets)
    console.log('Seed completed.');
    console.log(`Users: admin=${admin.email}, instructor=${instructor.email}, learner=${learner.email}`);
    console.log(`Courses: ${course1.title} (id=${course1.id}), ${course2.title} (id=${course2.id})`);
    console.log('Note: passwords can be overridden via SEED_* env vars.');
  } finally {
    await ds.destroy();
  }
}

// Allow direct execution: `node src/seeds/seed.js`
if (require.main === module) {
  runSeeds()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = { runSeeds };

