// User account management: admin and HOD create/edit/delete teacher and student
// logins (the email + password used to sign in). The role is stored on the account,
// so login only needs email + password to know what the user is.
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../db');
const { validate } = require('../validate');
const { requireAuth, requireRole, deptOk } = require('../auth');

const router = express.Router();

const safe = (u) => {
  const { password_hash, ...rest } = u;
  return rest;
};

function checkRef(kind, id) {
  if (!id) return null;
  const col = kind === 'teacher' ? 'teachers' : kind === 'batch' ? 'batches' : 'departments';
  return db.findById(col, id) ? null : `${kind} not found.`;
}

const createSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email(),
  password: z.string().min(10, 'Password must be at least 10 characters.'),
  role: z.enum(['teacher', 'student']),
  department_id: z.string().optional().nullable(),
  teacher_id: z.string().optional().nullable(),
  batch_id: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(10, 'Password must be at least 10 characters.').optional(),
  role: z.enum(['teacher', 'student', 'hod']).optional(),
  department_id: z.string().optional().nullable(),
  teacher_id: z.string().optional().nullable(),
  batch_id: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

// HODs may only touch their own department and never admins.
function mayManage(req, target) {
  if (target.role === 'admin') return req.user.role === 'admin';
  if (req.user.role === 'admin') return true;
  // hod
  return deptOk(req, target.department_id);
}

router.get('/users', requireAuth, requireRole('admin', 'hod'), (req, res) => {
  let rows = db.all('users');
  if (req.user.role === 'hod') {
    rows = rows.filter((u) => u.role !== 'admin' && (deptOk(req, u.department_id) || u.id === req.user.id));
  }
  if (req.query.role) rows = rows.filter((u) => u.role === req.query.role);
  res.json({ data: rows.map(safe) });
});

router.post('/users', requireAuth, requireRole('admin', 'hod'), validate(createSchema), (req, res) => {
  const email = String(req.body.email).toLowerCase();
  if (db.find('users', (u) => String(u.email).toLowerCase() === email)[0]) {
    return res.status(409).json({ error: 'That email is already in use.', fix: 'Pick a different email.' });
  }
  if (req.user.role === 'hod' && !deptOk(req, req.body.department_id)) {
    return res.status(403).json({ error: 'HODs can only create accounts in their department.', fix: 'Set the department to your own.' });
  }
  for (const r of [['teacher', req.body.teacher_id], ['batch', req.body.batch_id], ['department', req.body.department_id]]) {
    const err = checkRef(r[0], r[1]);
    if (err) return res.status(400).json({ error: err, fix: 'Pick an existing record.' });
  }
  const { password, ...rest } = req.body;
  const row = db.insert('users', Object.assign({}, rest, { email, password_hash: bcrypt.hashSync(password, 10) }));
  db.addAudit({ actor_user_id: req.user.id, action: 'create:user', target_type: 'user', target_id: row.id, after: safe(row) });
  res.status(201).json({ data: safe(row) });
});

const upd = (req, res) => {
  const cur = db.findById('users', req.params.id);
  if (!cur) return res.status(404).json({ error: 'Account not found.', fix: 'Refresh and try again.' });
  if (!mayManage(req, cur)) return res.status(403).json({ error: 'You cannot manage this account.', fix: 'Ask an admin.' });
  if (req.body.role === 'hod' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only an admin can make someone an HOD.', fix: 'Ask an admin.' });
  }
  const nextDept = req.body.department_id !== undefined ? req.body.department_id : cur.department_id;
  if (req.user.role === 'hod' && !deptOk(req, nextDept)) {
    return res.status(403).json({ error: 'HODs can only manage their own department.', fix: 'Keep the account in your department.' });
  }
  const patch = Object.assign({}, req.body);
  if (patch.email) {
    const email = String(patch.email).toLowerCase();
    if (db.find('users', (u) => u.id !== cur.id && String(u.email).toLowerCase() === email)[0]) {
      return res.status(409).json({ error: 'That email is already in use.', fix: 'Pick a different email.' });
    }
    patch.email = email;
  }
  if (patch.password) {
    patch.password_hash = bcrypt.hashSync(patch.password, 10);
    delete patch.password;
  }
  const row = db.update('users', cur.id, patch);
  db.addAudit({ actor_user_id: req.user.id, action: 'update:user', target_type: 'user', target_id: cur.id, before: safe(cur), after: safe(row) });
  res.json({ data: safe(row) });
};
router.put('/users/:id', requireAuth, requireRole('admin', 'hod'), validate(updateSchema), upd);
router.patch('/users/:id', requireAuth, requireRole('admin', 'hod'), validate(updateSchema), upd);

router.delete('/users/:id', requireAuth, requireRole('admin', 'hod'), (req, res) => {
  const cur = db.findById('users', req.params.id);
  if (!cur) return res.status(404).json({ error: 'Account not found.', fix: 'Refresh and try again.' });
  if (String(cur.id) === String(req.user.id)) {
    return res.status(400).json({ error: 'You cannot delete your own account.', fix: 'Ask another admin.' });
  }
  if (!mayManage(req, cur)) return res.status(403).json({ error: 'You cannot manage this account.', fix: 'Ask an admin.' });
  db.remove('users', cur.id);
  db.addAudit({ actor_user_id: req.user.id, action: 'delete:user', target_type: 'user', target_id: cur.id, before: safe(cur) });
  res.json({ ok: true });
});

module.exports = router;
