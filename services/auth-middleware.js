const jwt = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET  || 'ck-dev-secret-change-in-production';
const COOKIE_NAME = 'ck_auth';
const BYPASS_AUTH = process.env.BYPASS_AUTH === 'true';

if (BYPASS_AUTH) {
  console.warn('⚠️  [Auth] BYPASS_AUTH=true — ALL authentication disabled. For testing only!');
}

/** Fake admin user injected when BYPASS_AUTH is on */
const BYPASS_USER = {
  id: 'bypass', username: 'bypass', displayName: 'Test Admin',
  role: 'admin',
  permissions: { maintenance: true, foodsafety: true, templog: true, procurement: true }
};

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
  if (BYPASS_AUTH) { req.user = BYPASS_USER; return next(); }
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

/**
 * Middleware factory for HTML page protection.
 * Skips non-HTML assets (CSS, JS, images, fonts, etc.).
 * Redirects unauthenticated users to /login.
 * Redirects users lacking module permission to /.
 *
 * Always re-reads permissions from the database so changes made in the admin
 * panel take effect immediately without requiring the user to re-login.
 *
 * module = null        → any authenticated user (hub)
 * module = '__admin__' → admin role required
 * module = 'xxx'       → user.permissions.xxx must be true (or admin)
 */
function requirePageAccess(module) {
  return async function (req, res, next) {
    if (BYPASS_AUTH) return next();

    // Only protect HTML page requests; pass assets straight through
    var p = req.path;
    var isHtml = p.endsWith('.html') || p === '/' || p.endsWith('/');
    if (!isHtml) return next();

    var token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) {
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }

    var decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (_e) {
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }

    // Re-read user from DB so permission changes are effective immediately
    var user;
    try {
      const User = require('../models/User');
      const dbUser = await User.findById(decoded.id);
      if (!dbUser || !dbUser.active) {
        return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
      }
      user = dbUser;
    } catch (_e) {
      // DB unavailable — fall back to JWT claims
      user = decoded;
    }

    req.user = user;

    // Admins bypass everything
    if (user.role === 'admin') return next();

    // Admin-only pages: redirect non-admins to hub
    if (module === '__admin__') return res.redirect('/');

    // Module permission gate
    if (module && !(user.permissions && user.permissions[module])) {
      return res.redirect('/?access=denied');
    }

    next();
  };
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, requireAuth, requireAuthPage, requireAdmin, requirePermission, requirePageAccess, COOKIE_NAME };
