const express = require('express');
const bcrypt = require('bcrypt');

const authMiddleware = require('../middleware/auth');
const { signAccessToken } = require('../utils/jwt');
const { getDataSource } = require('../config/db');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication and identity endpoints
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     RegisterRequest:
 *       type: object
 *       required: [email, password, name]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: user@example.com
 *         password:
 *           type: string
 *           minLength: 8
 *           example: StrongPassword123!
 *         name:
 *           type: string
 *           example: Jane Doe
 *         role:
 *           type: string
 *           enum: [admin, instructor, learner]
 *           example: learner
 *     LoginRequest:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: user@example.com
 *         password:
 *           type: string
 *           example: StrongPassword123!
 *     AuthUser:
 *       type: object
 *       description: Authenticated user profile (public fields only)
 *       properties:
 *         id:
 *           type: integer
 *           format: int32
 *           description: Relational primary key (auto-increment integer)
 *           example: 123
 *         email:
 *           type: string
 *           format: email
 *         name:
 *           type: string
 *         role:
 *           type: string
 *           enum: [admin, instructor, learner]
 *     AuthResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           description: JWT access token
 *         user:
 *           $ref: '#/components/schemas/AuthUser'
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Creates a user, hashing their password with bcrypt. Role defaults to learner.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error or email already in use
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, role } = req.body || {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ message: 'Valid email is required' });
    }
    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const userRepo = ds.getRepository('User');
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await userRepo.findOne({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // bcrypt default 10 salt rounds is OK; use 12 for a bit stronger without being excessive.
    const passwordHash = await bcrypt.hash(password, 12);

    const created = userRepo.create({
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      role: role || 'learner',
    });
    const user = await userRepo.save(created);

    const token = signAccessToken({
      sub: String(user.id),
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return res.status(201).json({
      token,
      user: { id: String(user.id), email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    // Handle MySQL unique constraint errors (e.g., ER_DUP_ENTRY)
    if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    return next(err);
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ message: 'Valid email is required' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ message: 'Password is required' });
    }

    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const userRepo = ds.getRepository('User');
    const normalizedEmail = email.trim().toLowerCase();

    // Need passwordHash for verification
    const user = await userRepo.findOne({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, role: true, passwordHash: true },
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = signAccessToken({
      sub: String(user.id),
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return res.status(200).json({
      token,
      user: { id: String(user.id), email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/AuthUser'
 *       401:
 *         description: Missing or invalid token
 */
router.get('/me', authMiddleware, async (req, res) => {
  return res.status(200).json({ user: req.user });
});

module.exports = router;
