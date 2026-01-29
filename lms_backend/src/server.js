require('dotenv').config();

const app = require('./app');
const { connectToDatabase, getConfiguredDbName } = require('./config/db');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

function isLikelyAtlasUri(mongoUri) {
  return typeof mongoUri === 'string' && mongoUri.startsWith('mongodb+srv://');
}

async function start() {
  const mongoUri = process.env.MONGODB_URL;
  const atlasMode = isLikelyAtlasUri(mongoUri);

  // Startup log: indicate Atlas mode (if applicable) and effective DB name, without secrets.
  const configuredDbName = getConfiguredDbName() || '(default)';
  if (atlasMode) {
    console.log(`[Atlas mode] Mongo configured (db: ${configuredDbName}).`);
  }

  try {
    await connectToDatabase();

    // Do not log credentials. Only log a safe/high-level indicator of configured DB.
    const dbName = getConfiguredDbName() || '(default)';
    console.log(`MongoDB connected (db: ${dbName})`);
  } catch (err) {
    // If we're in Atlas mode, do NOT fail startup just because DB isn't reachable yet.
    // This allows backend preview to boot even when the local lms_database container is down.
    if (atlasMode) {
      const dbName = getConfiguredDbName() || '(default)';
      console.warn(
        `[Atlas mode] MongoDB connection failed at startup (db: ${dbName}). ` +
          `Continuing to start server without DB. Error: ${err.message}`
      );
    } else {
      // Non-Atlas mode: preserve existing behavior (fail fast) for local/dev setups.
      console.error(`Failed to start server: ${err.message}`);
      process.exit(1);
    }
  }

  const server = app.listen(PORT, HOST, () => {
    if (atlasMode) {
      console.log('[Atlas mode] Backend started (DB connectivity may still be initializing).');
    }
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
