require('dotenv').config();

const { createDataSourceFromEnv } = require('../config/db');

/**
 * Run npm script (db:migrate / db:seed) in-process without spawning a child shell.
 * We do this by requiring the underlying modules directly:
 * - Migrations: use TypeORM DataSource.runMigrations()
 * - Seeds: call the existing runSeeds() implementation
 */
async function runMigrations() {
  const ds = createDataSourceFromEnv();
  await ds.initialize();
  try {
    const migrations = await ds.runMigrations({ transaction: 'all' });
    return { dataSource: ds, migrations };
  } catch (err) {
    await ds.destroy();
    throw err;
  }
}

async function runSeeds() {
  // Use the existing seed entrypoint to preserve behavior.
  const { runSeeds: seed } = require('../seeds/seed');
  await seed();
}

/**
 * Print a concise summary for operators (no secrets).
 * @param {import('typeorm').DataSource} ds
 */
async function printSummary(ds) {
  const [usersTotal, coursesTotal, lessonsTotal] = await Promise.all([
    ds.getRepository('User').count(),
    ds.getRepository('Course').count(),
    ds.getRepository('Lesson').count(),
  ]);

  console.log('--- DB init summary ---');
  console.log('Tables created (via migrations): users, courses, lessons');
  console.log(`Seeded rows (current totals): users=${usersTotal}, courses=${coursesTotal}, lessons=${lessonsTotal}`);
}

// PUBLIC_INTERFACE
async function initDb() {
  /** Runs migrations then seeds, and prints a concise results summary. */
  const required = ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DEFAULT_DB'];
  const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim().length === 0);
  if (missing.length > 0) {
    const err = new Error(`Missing required DB env vars: ${missing.join(', ')}`);
    err.code = 'MYSQL_ENV_MISSING';
    throw err;
  }

  console.log(
    `DB init target: ${process.env.DB_HOST}:${process.env.DB_PORT || '3306'}/${process.env.DEFAULT_DB}`
  );

  const { dataSource, migrations } = await runMigrations();
  try {
    console.log(`Migrations applied: ${migrations.length}`);
    await runSeeds();
    await printSummary(dataSource);
  } finally {
    await dataSource.destroy();
  }
}

// Allow direct execution: `node src/scripts/db-init.js`
if (require.main === module) {
  initDb()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('DB init failed:', err && err.message ? err.message : err);
      process.exit(1);
    });
}

module.exports = { initDb };

