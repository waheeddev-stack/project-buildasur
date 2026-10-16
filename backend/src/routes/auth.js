// POST /api/auth/login|refresh|logout
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
const { validate } = require('../validate');
const { signAccess, signRefresh, setRefreshCookie, clearRefreshCookie, revokeRefresh, requireAuth, COOKIE_NAME } = require('../auth');

const router = express.Router();
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, 'Password must be at least 10 characters.'),
});

function secret() { return process.env.JWT_SECRET || 'dev-secret-change'; }

router.post('/login', validate(loginSchema), (req, res) => {
  const { email, password } = req.body;
  const user = db.find('users', (u) => u.email.toLowerCase() === String(email).toLowerCase())[0];
  if (!user || user.is_active === false) {
    return res.status(401).json({ error: 'Wrong email or password.', fix: 'Check your email and try again.' });
  }
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    return res.status(423).json({ error: 'Account locked after too many attempts. Try again in 15 minutes.', fix: 'Wait 15 minutes or ask your HOD/admin.' });
  }
  const ok = bcrypt.compareSync(password, user.password_hash || '');
  if (!ok) {
    const failed = (user.failed_logins || 0) + 1;
    const patch = { failed_logins: failed };
    if (failed >= 5) patch.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.update('users', user.id, patch);
    return res.status(401).json({ error: 'Wrong email or password.', fix: 'Check your password and try again.' });
  }
  db.update('users', user.id, { failed_logins: 0, lockedUntil: null, last_login_at: new Date().toISOString() });
  const token = signAccess(user);
  setRefreshCookie(res, signRefresh(user));
  db.addAudit({ actor_user_id: user.id, action: 'login', target_type: 'user', target_id: user.id });
  const { password_hash, ...safe } = db.findById('users', user.id);
  res.json({ token, user: safe });
});

router.post('/refresh', (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Session expired. Please log in again.', fix: 'Log in again to continue.' });
  const stored = db.find('refresh_tokens', (r) => r.token === token)[0];
  if (!stored) return res.status(401).json({ error: 'Session expired. Please log in again.', fix: 'Log in again to continue.' });
  try {
    const p = jwt.verify(token, secret());
    const user = db.findById('users', p.sub);
    if (!user || user.is_active === false) throw new Error('inactive');
    revokeRefresh(token);
    const access = signAccess(user);
    setRefreshCookie(res, signRefresh(user));
    res.json({ token: access });
  } catch (e) {
    revokeRefresh(token);
    return res.status(401).json({ error: 'Session expired. Please log in again.', fix: 'Log in again to continue.' });
  }
});

router.post('/logout', (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) revokeRefresh(token);
  clearRefreshCookie(res);
  res.json({ ok: true });
});

router.get('/me-route', requireAuth, (req, res) => {
  const { password_hash, ...safe } = req.user;
  res.json({ user: safe });
});

module.exports = router;
