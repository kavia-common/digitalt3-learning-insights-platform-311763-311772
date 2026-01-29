const { verifyAccessToken } = require('../utils/jwt');
const { getDataSource } = require('../config/db');

// PUBLIC_INTERFACE
async function auth(req, res, next) {
  /** Express middleware: verifies Bearer JWT and sets req.user (id, email, role, name). */
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Missing or invalid Authorization header' });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Token claims include: sub (user id), email, role, name
    const userIdRaw = decoded.sub;
    const userId = Number.parseInt(String(userIdRaw || ''), 10);
    if (!Number.isFinite(userId)) {
      return res.status(401).json({ message: 'Invalid token claims' });
    }

    const ds = getDataSource();
    if (!ds || !ds.isInitialized) {
      // Cannot validate user existence without DB; fail closed.
      return res.status(503).json({ message: 'Database not available' });
    }

    // Optionally verify user still exists.
    const userRepo = ds.getRepository('User');
    const user = await userRepo.findOne({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }

    req.user = {
      id: String(user.id),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = auth;
