const cors = require('cors');
const express = require('express');
const routes = require('./routes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');

// Initialize express app
const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow non-browser clients without origin and allow all if '*' configured
    if (!origin || allowedOrigins.includes('*')) {
      return cb(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('Not allowed by CORS'));
  },
  methods: (process.env.ALLOWED_METHODS || 'GET,POST,PUT,DELETE,PATCH,OPTIONS').split(',').map((m) => m.trim()),
  allowedHeaders: (process.env.ALLOWED_HEADERS || 'Content-Type,Authorization').split(',').map((h) => h.trim()),
  maxAge: Number(process.env.CORS_MAX_AGE || 600),
}));

app.set('trust proxy', process.env.TRUST_PROXY === 'true' || true);

app.use('/docs', swaggerUi.serve, (req, res, next) => {
  const host = req.get('host'); // may or may not include port
  let protocol = req.protocol; // http or https

  const actualPort = req.socket.localPort;
  const hasPort = host.includes(':');

  const needsPort =
    !hasPort &&
    ((protocol === 'http' && actualPort !== 80) ||
      (protocol === 'https' && actualPort !== 443));
  const fullHost = needsPort ? `${host}:${actualPort}` : host;
  protocol = req.secure ? 'https' : protocol;

  const dynamicSpec = {
    ...swaggerSpec,
    servers: [
      {
        url: `${protocol}://${fullHost}`,
      },
    ],
  };
  swaggerUi.setup(dynamicSpec)(req, res, next);
});

// Parse JSON request body
app.use(express.json());

// Mount routes
app.use('/', routes);

// Error handling middleware
app.use((err, req, res, next) => {
  // Handle CORS errors explicitly
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ status: 'error', message: err.message });
  }

  console.error(err.stack);
  return res.status(500).json({
    status: 'error',
    message: 'Internal Server Error',
  });
});

module.exports = app;
