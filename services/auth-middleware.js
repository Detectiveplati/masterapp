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
  position: 'Administrator',
  role: 'admin',
  permissions: { maintenance: true, foodsafety: true, templog: true, procurement: true, pest: true, tempmon: true, iso: true }
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
      position:    user.position,
      role:        user.role,
      permissions: user.permissions
    },
    JWT_SECRET,
    { expiresIn: '400d' }
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
    maxAge:   400 * 24 * 60 * 60 * 1000 // 400 days — persistent until manual logout
  });
}

/**
 * Clear the auth cookie.
 */
function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

async function loadFreshUserFromToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  const User = require('../models/User');
  const dbUser = await User.findById(decoded.id);
  if (!dbUser || !dbUser.active) {
    const err = new Error('User not found or inactive');
    err.code = 'AUTH_USER_NOT_FOUND';
    throw err;
  }
  return dbUser;
}

/**
 * Middleware: verify JWT cookie. If valid, attaches req.user.
 * If invalid/missing, returns 401 JSON (for API routes).
 */
async function requireAuth(req, res, next) {
  if (BYPASS_AUTH) { req.user = BYPASS_USER; return next(); }
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = await loadFreshUserFromToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

/**
 * Middleware: like requireAuth but redirects to /login for GET HTML requests.
 */
async function requireAuthPage(req, res, next) {
  if (BYPASS_AUTH) { req.user = BYPASS_USER; return next(); }
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.redirect('/login');
  try {
    req.user = await loadFreshUserFromToken(token);
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

function requireAnyPermission(modules) {
  const list = Array.isArray(modules) ? modules.filter(Boolean) : [];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (req.user.role === 'admin') return next();
    if (req.user.permissions && list.some((module) => req.user.permissions[module])) return next();
    return res.status(403).json({ error: `No access to ${list.join(' or ')}` });
  };
}

async function hasFoodSafetyAssignmentAccess(user, unitCode) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.permissions && user.permissions.foodsafety) return true;
  const FoodSafetyFormAssignment = require('../models/FoodSafetyFormAssignment');
  const query = { userId: String(user._id || user.id), active: true };
  if (unitCode) query.unitCode = String(unitCode);
  const assignment = await FoodSafetyFormAssignment.findOne(query).lean();
  return Boolean(assignment);
}

async function listFoodSafetyFormAssignments(user) {
  if (!user) return [];
  const FoodSafetyFormAssignment = require('../models/FoodSafetyFormAssignment');
  return FoodSafetyFormAssignment.find({
    userId: String(user._id || user.id),
    active: true
  }).sort({ templateCode: 1, unitCode: 1 }).lean();
}

function canAccessAllFoodSafetyForms(user) {
  return Boolean(user && (
    user.role === 'admin' ||
    (user.permissions && user.permissions.foodsafety)
  ));
}

async function hasFoodSafetyFormsAccess(user, templateCode, unitCode) {
  if (!user) return false;
  if (canAccessAllFoodSafetyForms(user)) return true;
  if (!(user.permissions && user.permissions.foodsafetyforms)) return false;
  if (!templateCode || !unitCode) return false;
  const FoodSafetyFormAssignment = require('../models/FoodSafetyFormAssignment');
  const assignment = await FoodSafetyFormAssignment.findOne({
    userId: String(user._id || user.id),
    templateCode: String(templateCode),
    unitCode: String(unitCode),
    active: true
  }).lean();
  return Boolean(assignment);
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function getFoodSafetyFormsFallbackUrl(user, monthKey) {
  const assignments = await listFoodSafetyFormAssignments(user);
  if (assignments.length === 1) {
    const assignment = assignments[0];
    const month = String(monthKey || currentMonthKey());
    return `/foodsafety-forms/checklists?template=${encodeURIComponent(assignment.templateCode)}&month=${encodeURIComponent(month)}&unit=${encodeURIComponent(assignment.unitCode)}`;
  }
  return '/foodsafety-forms/forms';
}

function requireFoodSafetyFormsAssignedAccess(getTarget) {
  return async function (req, res, next) {
    if (BYPASS_AUTH) { req.user = BYPASS_USER; return next(); }
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      req.user = await loadFreshUserFromToken(token);
      if (canAccessAllFoodSafetyForms(req.user)) return next();
      if (!(req.user.permissions && req.user.permissions.foodsafetyforms)) {
        return res.status(403).json({ error: 'No access to food safety forms' });
      }
      const target = typeof getTarget === 'function' ? getTarget(req) : {};
      const templateCode = String((target && target.templateCode) || '').trim();
      const unitCode = String((target && target.unitCode) || '').trim();
      if (!templateCode || !unitCode) {
        return res.status(403).json({ error: 'Assigned form access requires template and unit' });
      }
      if (await hasFoodSafetyFormsAccess(req.user, templateCode, unitCode)) return next();
      return res.status(403).json({ error: 'No access to assigned food safety form' });
    } catch {
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }
  };
}

function requireFoodSafetyFormsAccess() {
  return async function (req, res, next) {
    if (BYPASS_AUTH) { req.user = BYPASS_USER; return next(); }
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const User = require('../models/User');
      const dbUser = await User.findById(decoded.id);
      if (!dbUser || !dbUser.active) return res.status(401).json({ error: 'Not authenticated' });
      req.user = dbUser;
      const unitCode = req.query.unit || req.body.unitCode || req.body.unit || '';
      if (await hasFoodSafetyAssignmentAccess(dbUser, unitCode)) return next();
      return res.status(403).json({ error: 'No access to assigned food safety forms' });
    } catch {
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }
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
    var isHtml = p === '/' || p.endsWith('/') || p.endsWith('.html') || !/\.[a-z0-9]+$/i.test(p);
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

function requireFoodSafetyFormsPageAccess() {
  return async function (req, res, next) {
    if (BYPASS_AUTH) return next();
    var p = req.path;
    var isHtml = p === '/' || p.endsWith('/') || p.endsWith('.html') || !/\.[a-z0-9]+$/i.test(p);
    if (!isHtml) return next();
    var token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    var decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (_e) {
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
    try {
      const User = require('../models/User');
      const dbUser = await User.findById(decoded.id);
      if (!dbUser || !dbUser.active) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
      req.user = dbUser;
      const unitCode = req.query.unit || '';
      if (await hasFoodSafetyAssignmentAccess(dbUser, unitCode)) return next();
      return res.redirect('/?access=denied');
    } catch (_e) {
      return res.redirect('/?access=denied');
    }
  };
}

function requirePageAccessAny(modules) {
  const list = Array.isArray(modules) ? modules.filter(Boolean) : [];
  return async function (req, res, next) {
    if (BYPASS_AUTH) return next();

    var p = req.path;
    var isHtml = p === '/' || p.endsWith('/') || p.endsWith('.html') || !/\.[a-z0-9]+$/i.test(p);
    if (!isHtml) return next();

    var token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) {
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }

    try {
      const user = await loadFreshUserFromToken(token);
      req.user = user;
      if (user.role === 'admin') return next();
      if (user.permissions && list.some((module) => user.permissions[module])) return next();
      return res.redirect('/?access=denied');
    } catch (_e) {
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
  };
}

function requireFoodSafetyFormsAssignedPageAccess(getTarget) {
  return async function (req, res, next) {
    if (BYPASS_AUTH) return next();

    var p = req.path;
    var isHtml = p === '/' || p.endsWith('/') || p.endsWith('.html') || !/\.[a-z0-9]+$/i.test(p);
    if (!isHtml) return next();

    var token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) {
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }

    try {
      const user = await loadFreshUserFromToken(token);
      req.user = user;
      if (canAccessAllFoodSafetyForms(user)) return next();
      if (!(user.permissions && user.permissions.foodsafetyforms)) {
        return res.redirect('/?access=denied');
      }
      const target = typeof getTarget === 'function' ? getTarget(req) : {};
      const templateCode = String((target && target.templateCode) || '').trim();
      const unitCode = String((target && target.unitCode) || '').trim();
      if (templateCode && unitCode && await hasFoodSafetyFormsAccess(user, templateCode, unitCode)) {
        return next();
      }
      const fallback = await getFoodSafetyFormsFallbackUrl(user, target && target.monthKey);
      return res.redirect(fallback);
    } catch (_e) {
      return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
    }
  };
}

module.exports = {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireAuthPage,
  requireAdmin,
  requirePermission,
  requireAnyPermission,
  requirePageAccess,
  requirePageAccessAny,
  requireFoodSafetyFormsAccess,
  requireFoodSafetyFormsPageAccess,
  requireFoodSafetyFormsAssignedAccess,
  requireFoodSafetyFormsAssignedPageAccess,
  hasFoodSafetyFormsAccess,
  canAccessAllFoodSafetyForms,
  getFoodSafetyFormsFallbackUrl,
  COOKIE_NAME
};
