require('dotenv').config();

const app = require('./app');
const { initializeDataSource, getConfiguredDbName, getDbMeta } = require('./config/db');

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  const provider = (process.env.DB_PROVIDER || 'mysql').toLowerCase();
  const dbName = getConfiguredDbName() || '(unknown)';

  // Safe startup log (no secrets). Provider-specific target hints.
  if (provider === 'aws_rds_postgres' || provider === 'postgres') {
    const pgHost = process.env.PG_HOST;
    const pgPort = process.env.PG_PORT || '5432';
    console.log(pgHost ? `Postgres target: ${pgHost}:${pgPort}/${dbName}` : 'Postgres target: (PG_HOST not set yet)');
  } else if (provider === 'disabled') {
    console.log('DB provider disabled (DB_PROVIDER=disabled). Starting server without DB.');
  } else {
    const dbHost = process.env.DB_HOST;
    const dbPort = process.env.DB_PORT || '3306';
    console.log(dbHost ? `MySQL target: ${dbHost}:${dbPort}/${dbName}` : 'MySQL target: (DB_HOST not set yet)');
  }

  try {
    await initializeDataSource();
  } catch (err) {
    // Do not hard-fail startup: backend preview should boot even if DB isn't reachable yet.
    const code = err && err.code ? String(err.code) : null;

    if (code === 'MYSQL_ENV_MISSING' || code === 'POSTGRES_ENV_MISSING') {
      console.warn(`DB not configured (missing env vars). Continuing to start server without DB. Error: ${err.message}`);
    } else if (code === 'DB_DISABLED') {
      console.warn(`DB disabled. Continuing to start server without DB. Error: ${err.message}`);
    } else {
      const meta = getDbMeta();
      const hint = meta ? `${meta.type} ${meta.host}:${meta.port}/${meta.database}` : 'unknown target';
      console.warn(`DB connection failed at startup (${hint}). Continuing to start server without DB. Error: ${err.message}`);
    }
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT}`);
    // Helpful for local dev convenience; binding is still controlled by HOST above.
    console.log(`Local access (if applicable): http://localhost:${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

  return server;
}

module.exports = start();
