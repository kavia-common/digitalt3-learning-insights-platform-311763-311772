const User = require('../models/User');
const { verifyAccessToken } = require('../utils/jwt');

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
    const userId = decoded.sub;
    if (!userId) {
      return res.status(401).json({ message: 'Invalid token claims' });
    }

    // Optionally verify user still exists.
    const user = await User.findById(userId).select('email name role').lean();
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }

    req.user = {
      id: String(user._id),
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
