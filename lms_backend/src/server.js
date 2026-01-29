require('dotenv').config();

const app = require('./app');
const { initializeDataSource, getConfiguredDbName } = require('./config/db');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  const dbHost = process.env.DB_HOST;
  const dbPort = process.env.DB_PORT || '3306';
  const dbName = getConfiguredDbName() || '(unknown)';

  // Safe startup log: show target without secrets.
  if (dbHost) {
    console.log(`MySQL target: ${dbHost}:${dbPort}/${dbName}`);
  } else {
    console.log('MySQL target: (DB_HOST not set yet)');
  }

  try {
    await initializeDataSource();
  } catch (err) {
    // Do not hard-fail startup: backend preview should boot even if DB isn't reachable yet.
    // This supports AWS RDS being temporarily unavailable during preview.
    console.warn(
      `MySQL connection failed at startup (target: ${dbHost || '(unknown)'}:${dbPort}/${dbName}). ` +
        `Continuing to start server without DB. Error: ${err.message}`
    );
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
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
