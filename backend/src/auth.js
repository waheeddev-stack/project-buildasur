// Auth: JWT access (15m) + refresh in httpOnly cookie (7d). bcryptjs hashing.
const jwt = require('jsonwebtoken');
const db = require('./db');

const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'refreshToken';

function secret() {
  return process.env.JWT_SECRET || 'dev-secret-change';
}

function signAccess(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, department_id: user.department_id || null },
    secret(),
    { expiresIn: ACCESS_TTL }
  );
}

function signRefresh(user) {
  const token = jwt.sign({ sub: user.id, typ: 'refresh' }, secret(), {
    expiresIn: `${REFRESH_TTL_MS / 1000}s`,
  });
  const d = db.read();
  d.refresh_tokens.push({
    token,
    userId: user.id,
    expires_at: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
  });
  db.persist();
  return token;
}

// Cross-site (e.g. Vercel frontend → Render backend) needs SameSite=None + Secure;
// over plain http://localhost those would be dropped, so fall back to Lax in dev.
function cookieBase() {
  // Treat https frontends (and NODE_ENV=production) as cross-site/secure.
  const prod = process.env.NODE_ENV === 'production' || /^https:/i.test(process.env.FRONTEND_URL || '');
  return {
    httpOnly: true,
    sameSite: prod ? 'none' : 'lax',
    secure: prod,
    path: '/',
  };
}

function setRefreshCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieBase(), maxAge: REFRESH_TTL_MS });
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieBase());
}

function revokeRefresh(token) {
  const d = db.read();
  const i = d.refresh_tokens.findIndex((r) => r.token === token);
  if (i !== -1) {
    d.refresh_tokens.splice(i, 1);
    db.persist();
  }
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in first.', fix: 'Log in again to continue.' });
  try {
    const p = jwt.verify(token, secret());
    const user = db.findById('users', p.sub);
    if (!user || user.is_active === false) {
      return res.status(401).json({ error: 'Account is deactivated.', fix: 'Ask your admin to reactivate it.' });
    }
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired. Please log in again.', fix: 'Log in again to continue.' });
  }
}

// Like requireAuth, but never blocks: sets req.user when a valid token is present,
// otherwise leaves it null. Used by public read-only routes (published timetables).
function optionalAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) { req.user = null; return next(); }
  try {
    const p = jwt.verify(token, secret());
    const user = db.findById('users', p.sub);
    req.user = user && user.is_active !== false ? user : null;
  } catch (e) {
    req.user = null;
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in first.', fix: 'Log in again to continue.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission for this.', fix: 'Ask an admin if you need access.' });
    }
    next();
  };
}

// HODs are scoped to their own department; admins pass everything.
function deptOk(req, departmentId) {
  if (!departmentId) return true;
  if (req.user.role === 'admin') return true;
  return String(req.user.department_id || '') === String(departmentId || '');
}

module.exports = {
  signAccess, signRefresh, setRefreshCookie, clearRefreshCookie, revokeRefresh,
  requireAuth, optionalAuth, requireRole, deptOk, COOKIE_NAME,
};
