# LMS Backend (Express + TypeORM + MySQL)

This backend uses TypeORM with MySQL (e.g., AWS RDS). **Do not rely on `synchronize` in production**; use migrations.

## Required environment variables

- `DB_HOST`
- `DB_PORT` (optional; defaults to `3306`)
- `DB_USERNAME`
- `DB_PASSWORD`
- `DEFAULT_DB`
- `JWT_SECRET` (for auth endpoints)

## Migrations

Apply migrations:

```bash
npm run db:migrate
```

Revert last migration:

```bash
npm run db:migrate:revert
```

Show applied/pending migrations:

```bash
npm run db:migrate:show
```

## Seed data

Run seeds (idempotent inserts/updates for initial users + sample courses/lessons):

```bash
npm run db:seed
```

Seed users created (defaults; override via env vars below):

- admin: `admin@example.com`
- instructor: `instructor@example.com`
- learner: `learner@example.com`

Optional overrides:

- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`
- `SEED_INSTRUCTOR_EMAIL`, `SEED_INSTRUCTOR_PASSWORD`
- `SEED_LEARNER_EMAIL`, `SEED_LEARNER_PASSWORD`

## Notes

- `TYPEORM_SYNC=true` enables TypeORM schema synchronization. **Keep this disabled in production** and use migrations instead.
- Migrations are located in `src/migrations/`.
- The TypeORM CLI DataSource entrypoint is `src/typeorm-datasource.js`.

