const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DigitalT3 LMS Backend API',
      version: process.env.API_VERSION || '1.0.0',
      description:
        'Backend APIs for the DigitalT3 AI-enabled Learning Management System (LMS). Includes authentication, courses, lessons, health endpoints, and S3 video helpers.',
    },
    tags: [
      { name: 'Health', description: 'Service health and diagnostics' },
      { name: 'Auth', description: 'Authentication and identity endpoints' },
      { name: 'Courses', description: 'Course management endpoints' },
      { name: 'Lessons', description: 'Lesson management endpoints' },
      { name: 'Storage', description: 'Video storage (S3) helper endpoints' },
      { name: 'AI', description: 'AI-assisted generation endpoints (Claude)' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Provide a JWT access token as: `Authorization: Bearer <token>`.',
        },
      },
    },
  },

  // Scan all routes/middleware (and models/controllers for shared schema blocks) for @swagger JSDoc.
  apis: ['./src/routes/**/*.js', './src/middleware/**/*.js', './src/models/**/*.js', './src/controllers/**/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
