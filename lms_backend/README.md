# LMS Backend (Express + TypeORM)

This backend uses TypeORM and supports multiple DB providers via an environment flag.

## DB provider selection (rollback-safe)

Set `DB_PROVIDER` to choose the DB engine:

- `mysql` (default): current behavior (uses `DB_*` vars below)
- `aws_rds_postgres` (alias: `postgres`): AWS RDS Postgres support (uses `PG_*` vars below)
- `disabled`: start API without DB connectivity (useful for preview)

If `DB_PROVIDER` is not set, the backend defaults to **MySQL** and will continue to work as before.

## Required environment variables

### MySQL (default)

- `DB_PROVIDER=mysql` (optional; default)
- `DB_HOST`
- `DB_PORT` (optional; defaults to `3306`)
- `DB_USERNAME`
- `DB_PASSWORD`
- `DEFAULT_DB`

### AWS RDS Postgres (optional)

- `DB_PROVIDER=aws_rds_postgres` (or `postgres`)
- `PG_HOST`
- `PG_PORT` (optional; defaults to `5432`)
- `PG_USERNAME`
- `PG_PASSWORD`
- `PG_DATABASE`

### Auth

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

