// CRUD: /api/teachers /rooms /subjects /batches /assignments
// Reads: any authenticated user. Writes: admin (+ HOD scoped to own dept for teachers/assignments).
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { validate } = require('../validate');
const { requireAuth, requireRole, deptOk } = require('../auth');

const router = express.Router();
// NOTE: requireAuth is applied per-route (not router.use) so this router mounted
// at /api does not block unrelated public routes such as /api/timetables.

const schemas = {
  teachers: {
    create: z.object({
      name: z.string().min(1), employee_id: z.string().optional(),
      department_id: z.string().optional(), is_active: z.boolean().optional(),
      max_hours_day: z.number().int().min(1).max(12).optional(),
      max_hours_week: z.number().int().min(1).max(60).optional(),
    }),
    update: z.object({
      name: z.string().min(1).optional(), employee_id: z.string().optional().nullable(),
      department_id: z.string().optional(), is_active: z.boolean().optional(),
      max_hours_day: z.number().int().min(1).max(12).optional(),
      max_hours_week: z.number().int().min(1).max(60).optional(),
    }),
  },
  rooms: {
    create: z.object({ name: z.string().min(1), capacity: z.number().int().min(1), type: z.enum(['lecture', 'lab', 'seminar']) }),
    update: z.object({ name: z.string().min(1).optional(), capacity: z.number().int().min(1).optional(), type: z.enum(['lecture', 'lab', 'seminar']).optional() }),
  },
  subjects: {
    create: z.object({ code: z.string().min(1), name: z.string().min(1), type: z.enum(['theory', 'lab']), sessions_per_week: z.number().int().min(1).max(10), periods_per_session: z.number().int().min(1).max(4).optional() }),
    update: z.object({ code: z.string().min(1).optional(), name: z.string().min(1).optional(), type: z.enum(['theory', 'lab']).optional(), sessions_per_week: z.number().int().min(1).max(10).optional(), periods_per_session: z.number().int().min(1).max(4).optional() }),
  },
  batches: {
    create: z.object({ program: z.string().min(1), semester: z.number().int().min(1), division: z.string().min(1), strength: z.number().int().min(1), parent_batch_id: z.string().nullable().optional() }),
    update: z.object({ program: z.string().min(1).optional(), semester: z.number().int().min(1).optional(), division: z.string().min(1).optional(), strength: z.number().int().min(1).optional(), parent_batch_id: z.string().nullable().optional() }),
  },
  assignments: {
    create: z.object({ subject_id: z.string().min(1), batch_id: z.string().min(1), teacher_id: z.string().min(1), required_room_type: z.enum(['lecture', 'lab', 'seminar']).nullable().optional() }),
    update: z.object({ subject_id: z.string().min(1).optional(), batch_id: z.string().min(1).optional(), teacher_id: z.string().min(1).optional(), required_room_type: z.enum(['lecture', 'lab', 'seminar']).nullable().optional() }),
  },
};

function writerRoles(col) {
  // teachers + assignments: admin or hod (scoped); rooms/subjects/batches: admin only
  if (col === 'teachers' || col === 'assignments') return ['admin', 'hod'];
  return ['admin'];
}

function scopeDept(req, col, body) {
  if (req.user.role === 'admin') return null; // no restriction
  if (col === 'teachers') {
    const dep = body.department_id || null;
    if (dep && !deptOk(req, dep)) return 'hod-scope';
    return null;
  }
  if (col === 'assignments') {
    const t = body.teacher_id ? db.findById('teachers', body.teacher_id) : null;
    if (t && !deptOk(req, t.department_id)) return 'hod-scope';
    return null;
  }
  return 'admin-only';
}

function checkRefs(col, body) {
  if (col === 'assignments') {
    if (body.subject_id && !db.findById('subjects', body.subject_id)) return 'Subject not found.';
    if (body.batch_id && !db.findById('batches', body.batch_id)) return 'Batch not found.';
    if (body.teacher_id && !db.findById('teachers', body.teacher_id)) return 'Teacher not found.';
  }
  if (col === 'teachers' && body.department_id && !db.findById('departments', body.department_id)) return 'Department not found.';
  return null;
}

for (const col of Object.keys(schemas)) {
  const base = `/${col}`;

  router.get(base, requireAuth, (req, res) => {
    let rows = db.all(col);
    if (req.user.role === 'hod' && col === 'teachers' && req.user.department_id) {
      rows = rows.filter((t) => t.department_id === req.user.department_id);
    }
    res.json({ data: rows });
  });

  router.get(`${base}/:id`, requireAuth, (req, res) => {
    const row = db.findById(col, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found.', fix: 'It may have been deleted.' });
    res.json({ data: row });
  });

  router.post(base, requireAuth, requireRole(...writerRoles(col)), validate(schemas[col].create), (req, res) => {
    const scope = scopeDept(req, col, req.body);
    if (scope === 'hod-scope') return res.status(403).json({ error: 'HODs can only manage their own department.', fix: 'Pick a teacher in your department.' });
    if (scope === 'admin-only') return res.status(403).json({ error: 'Only admins manage this.', fix: 'Ask an admin to make the change.' });
    const refErr = checkRefs(col, req.body);
    if (refErr) return res.status(400).json({ error: refErr, fix: 'Pick an existing record.' });
    if (col === 'rooms' && db.find('rooms', (r) => r.name === req.body.name)[0]) {
      return res.status(409).json({ error: `Room ${req.body.name} already exists.`, fix: 'Use a different room name.' });
    }
    if (col === 'subjects' && db.find('subjects', (s) => s.code === req.body.code)[0]) {
      return res.status(409).json({ error: `Subject ${req.body.code} already exists.`, fix: 'Use a different subject code.' });
    }
    const row = db.insert(col, req.body);
    db.addAudit({ actor_user_id: req.user.id, action: `create:${col}`, target_type: col, target_id: row.id, after: row });
    res.status(201).json({ data: row });
  });

  const upd = (req, res) => {
    const cur = db.findById(col, req.params.id);
    if (!cur) return res.status(404).json({ error: 'Not found.', fix: 'It may have been deleted.' });
    if (col === 'teachers' && req.user.role === 'hod') {
      if (!deptOk(req, cur.department_id) || (req.body.department_id && !deptOk(req, req.body.department_id))) {
        return res.status(403).json({ error: 'HODs can only manage their own department.', fix: 'Pick a teacher in your department.' });
      }
    }
    const refErr = checkRefs(col, req.body);
    if (refErr) return res.status(400).json({ error: refErr, fix: 'Pick an existing record.' });
    const row = db.update(col, req.params.id, req.body);
    db.addAudit({ actor_user_id: req.user.id, action: `update:${col}`, target_type: col, target_id: row.id, before: cur, after: row });
    res.json({ data: row });
  };
  router.put(`${base}/:id`, requireAuth, requireRole(...writerRoles(col)), validate(schemas[col].update), upd);
  router.patch(`${base}/:id`, requireAuth, requireRole(...writerRoles(col)), validate(schemas[col].update), upd);

  router.delete(`${base}/:id`, requireAuth, requireRole(...writerRoles(col)), (req, res) => {
    const cur = db.findById(col, req.params.id);
    if (!cur) return res.status(404).json({ error: 'Not found.', fix: 'It may have been deleted.' });
    if (col === 'teachers' && req.user.role === 'hod' && !deptOk(req, cur.department_id)) {
      return res.status(403).json({ error: 'HODs can only manage their own department.', fix: 'Pick a teacher in your department.' });
    }
    if (col === 'teachers') {
      // Never hard-delete history: deactivate instead if sessions reference them.
      const used = db.find('sessions', (s) => s.teacher_id === cur.id);
      if (used.length > 0) {
        const row = db.update(col, cur.id, { is_active: false });
        db.addAudit({ actor_user_id: req.user.id, action: 'deactivate:teachers', target_type: col, target_id: cur.id, before: cur, after: row });
        return res.json({ data: row, note: 'Teacher has scheduled sessions, so they were deactivated instead of deleted.' });
      }
    }
    db.remove(col, req.params.id);
    db.addAudit({ actor_user_id: req.user.id, action: `delete:${col}`, target_type: col, target_id: req.params.id, before: cur });
    res.json({ ok: true });
  });
}

module.exports = router;
