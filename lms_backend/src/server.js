require('dotenv').config();

const app = require('./app');
const { connectToDatabase } = require('./config/db');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    await connectToDatabase();

    // Do not log credentials. Only log a safe/high-level indicator of configured DB.
    const dbName = process.env.MONGODB_DB || '(default)';
    console.log(`MongoDB connected (db: ${dbName})`);

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
  } catch (err) {
    // Avoid dumping full connection URI or stack traces that might include secrets.
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

module.exports = start();
