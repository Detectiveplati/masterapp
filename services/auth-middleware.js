const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ck-dev-secret-change-in-production';
const COOKIE_NAME = 'ck_auth';

/**
 * Sign a JWT for a user. Returns the token string.
 */
function signToken(user) {
  return jwt.sign(
    {
      id:          user._id,
      username:    user.username,
      displayName: user.displayName,
      role:        user.role,
      permissions: user.permissions
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

/**
 * Set the auth cookie on the response.
 */
function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   12 * 60 * 60 * 1000 // 12 hours
  });
}

/**
 * Clear the auth cookie.
 */
function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

/**
 * Middleware: verify JWT cookie. If valid, attaches req.user.
 * If invalid/missing, returns 401 JSON (for API routes).
 */
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

/**
 * Middleware: like requireAuth but redirects to /login for GET HTML requests.
 */
function requireAuthPage(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.redirect('/login');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.redirect('/login');
  }
}

/**
 * Middleware: require admin role.
 */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

/**
 * Middleware factory: require a specific module permission.
 * Admins always pass.
 */
function requirePermission(module) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role === 'admin') return next();
    if (req.user.permissions && req.user.permissions[module]) return next();
    return res.status(403).json({ error: `No access to ${module}` });
  };
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, requireAuth, requireAuthPage, requireAdmin, requirePermission, COOKIE_NAME };
