// PUBLIC_INTERFACE
function rbac(allowedRoles = []) {
  /** Express middleware factory: ensures authenticated user has one of the allowed roles. */
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    if (roles.length === 0) {
      return next(); // no restriction
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    return next();
  };
}

module.exports = rbac;
