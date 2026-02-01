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

/**
 * Serve the OpenAPI JSON. This uses the same dynamic "servers" URL logic as Swagger UI
 * so the spec remains correct behind proxies and in different environments.
 */
app.get('/openapi.json', (req, res) => {
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

  return res.status(200).json(dynamicSpec);
});

/**
 * Interactive Swagger UI.
 * Note: Swagger UI will pull the spec from /openapi.json.
 */
const swaggerUiMiddleware = swaggerUi.setup(null, {
  swaggerOptions: {
    url: '/openapi.json',
  },
});

// Mounted at both routes to retain backward compatibility (/api-docs) and add /docs.
app.use('/api-docs', swaggerUi.serve, swaggerUiMiddleware);
app.use('/docs', swaggerUi.serve, swaggerUiMiddleware);

// Parse JSON request body
app.use(express.json());

/**
 * Simple preview healthcheck endpoint.
 * Keeps behavior minimal and stable for infrastructure checks.
 */
app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));

/**
 * Mount routes:
 * - Root (existing): /auth, /courses, /lessons, etc.
 * - Alias (requested): /api/* -> same routes to provide /api/lessons/:id/generate-ai
 */
app.use('/', routes);
app.use('/api', routes);

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
