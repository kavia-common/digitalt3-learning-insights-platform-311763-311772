# digitalt3-learning-insights-platform-311763-311772

## Backend

See `lms_backend/README.md` for configuration.

### Database providers

The backend supports a rollback-safe DB provider flag:

- `DB_PROVIDER=mysql` (default)
- `DB_PROVIDER=aws_rds_postgres` (alias: `postgres`)
- `DB_PROVIDER=disabled` (run API without DB connectivity)

A template is provided at `lms_backend/.env.example`.
