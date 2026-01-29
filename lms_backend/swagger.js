const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DigitalT3 LMS Backend API',
      version: process.env.API_VERSION || '1.0.0',
      description:
        'Backend APIs for the DigitalT3 AI-enabled Learning Management System (LMS). Includes authentication and health endpoints. Additional modules will appear here as routes are added.',
    },
    tags: [
      { name: 'Health', description: 'Service health and diagnostics' },
      { name: 'Auth', description: 'Authentication and identity endpoints' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Provide a JWT access token as: `Authorization: Bearer <token>`.',
        },
      },
    },
  },

  // Scan all routes and middleware for @swagger JSDoc blocks.
  apis: ['./src/routes/**/*.js', './src/middleware/**/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
