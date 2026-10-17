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
    create: z.object({
      code: z.string().min(1), name: z.string().min(1), type: z.enum(['theory', 'lab']),
      sessions_per_week: z.number().int().min(1).max(10), periods_per_session: z.number().int().min(1).max(4).optional(),
      department_id: z.string().optional(), teacher_id: z.string().optional(),
    }),
    update: z.object({
      code: z.string().min(1).optional(), name: z.string().min(1).optional(), type: z.enum(['theory', 'lab']).optional(),
      sessions_per_week: z.number().int().min(1).max(10).optional(), periods_per_session: z.number().int().min(1).max(4).optional(),
      department_id: z.string().optional().nullable(), teacher_id: z.string().optional().nullable(),
    }),
  },
  batches: {
    create: z.object({ program: z.string().min(1), semester: z.number().int().min(1), division: z.string().min(1), strength: z.number().int().min(1), parent_batch_id: z.string().nullable().optional() }),
    update: z.object({ program: z.string().min(1).optional(), semester: z.number().int().min(1).optional(), division: z.string().min(1).optional(), strength: z.number().int().min(1).optional(), parent_batch_id: z.string().nullable().optional() }),
  },
  // A subject has exactly one teacher, so assignments only pick subject + batch;
  // teacher_id is derived from the subject (may still be sent, must match).
  assignments: {
    create: z.object({ subject_id: z.string().min(1), batch_id: z.string().min(1), teacher_id: z.string().min(1).optional(), required_room_type: z.enum(['lecture', 'lab', 'seminar']).nullable().optional() }),
    update: z.object({ subject_id: z.string().min(1).optional(), batch_id: z.string().min(1).optional(), teacher_id: z.string().min(1).optional(), required_room_type: z.enum(['lecture', 'lab', 'seminar']).nullable().optional() }),
  },
};

// Departments are read-only master data (CSE, ECE, …). Teachers reference them by id.
router.get('/departments', requireAuth, (req, res) => {
  res.json({ data: db.all('departments') });
});

// Accept a department id OR name from clients and resolve it to the real record.
function resolveDepartment(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return null;
  return db.findById('departments', v)
    || db.find('departments', (d) => String(d.name).toLowerCase() === v.toLowerCase())[0]
    || null;
}

function writerRoles(col) {
  // teachers + assignments: admin or hod (scoped); rooms/subjects/batches: admin only
  if (col === 'teachers' || col === 'assignments') return ['admin', 'hod'];
  return ['admin'];
}

function scopeDept(req, col, body) {
  if (req.user.role === 'admin') return null; // no restriction
  if (col === 'teachers') {
    if (body.department_id) {
      const dep = resolveDepartment(body.department_id);
      if (dep && !deptOk(req, dep.id)) return 'hod-scope';
    }
    return null;
  }
  if (col === 'assignments') {
    const t = body.teacher_id ? db.findById('teachers', body.teacher_id) : null;
    if (t && !deptOk(req, t.department_id)) return 'hod-scope';
    return null;
  }
  return 'admin-only';
}

const teacherName = (id) => (db.findById('teachers', id) || {}).name || 'that teacher';

function checkRefs(col, body) {
  if (col === 'assignments') {
    const subject = body.subject_id ? db.findById('subjects', body.subject_id) : null;
    if (body.subject_id && !subject) return 'Subject not found.';
    if (body.batch_id && !db.findById('batches', body.batch_id)) return 'Batch not found.';
    if (body.teacher_id && !db.findById('teachers', body.teacher_id)) return 'Teacher not found.';
    // One teacher per subject: derive the teacher, or reject a mismatch.
    if (subject) {
      if (!body.teacher_id) {
        if (!subject.teacher_id) return `Assign a teacher to ${subject.code || subject.name} first (Subjects step).`;
        body.teacher_id = subject.teacher_id;
      } else if (subject.teacher_id && String(body.teacher_id) !== String(subject.teacher_id)) {
        return `${subject.code || subject.name} is taught by ${teacherName(subject.teacher_id)} — a subject has one teacher.`;
      }
    }
  }
  if (col === 'subjects') {
    if (body.department_id) {
      const dep = resolveDepartment(body.department_id);
      if (!dep) return 'Department not found.';
      body.department_id = dep.id; // normalise name → id
    }
    if (body.teacher_id) {
      const t = db.findById('teachers', body.teacher_id);
      if (!t) return 'Teacher not found.';
      if (body.department_id && t.department_id && t.department_id !== body.department_id) {
        return `${t.name} is in another department. Pick a teacher from the chosen department.`;
      }
    }
  }
  if (col === 'teachers' && body.department_id) {
    const dep = resolveDepartment(body.department_id);
    if (!dep) return 'Department not found.';
    body.department_id = dep.id; // normalise name → id
  }
  return null;
}

// Deleting master data that is still in use would orphan assignments/sessions.
function referencedBy(col, id) {
  if (col === 'subjects') {
    const n = db.find('assignments', (a) => a.subject_id === id).length;
    return n ? `${n} assignment(s) use this subject. Remove them first.` : null;
  }
  if (col === 'batches') {
    const a = db.find('assignments', (x) => x.batch_id === id).length;
    const s = db.find('sessions', (x) => x.batch_id === id).length;
    if (a || s) return `${a} assignment(s) and ${s} scheduled session(s) use this batch. Remove them first.`;
    return null;
  }
  if (col === 'rooms') {
    const n = db.find('sessions', (s) => s.room_id === id).length;
    return n ? `${n} scheduled session(s) use this room.` : null;
  }
  return null;
}

for (const col of Object.keys(schemas)) {
  const base = `/${col}`;

  router.get(base, requireAuth, (req, res) => {
    // Everyone (admin, HOD, teacher, student) sees the same master data so the
    // timetables stay consistent across roles. Writes remain role-scoped below.
    res.json({ data: db.all(col) });
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
    // A subject has one teacher — keep its assignments in sync when it changes.
    if (col === 'subjects' && req.body.teacher_id !== undefined) {
      for (const a of db.find('assignments', (x) => x.subject_id === row.id)) {
        if (String(a.teacher_id) !== String(row.teacher_id)) db.update('assignments', a.id, { teacher_id: row.teacher_id || null });
      }
    }
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
    const refErr = referencedBy(col, cur.id);
    if (refErr) return res.status(409).json({ error: `Cannot delete — ${refErr}`, fix: 'Detach it first, then delete.' });
    db.remove(col, req.params.id);
    db.addAudit({ actor_user_id: req.user.id, action: `delete:${col}`, target_type: col, target_id: req.params.id, before: cur });
    res.json({ ok: true });
  });
}

module.exports = router;
