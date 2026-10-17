// Teacher availability (unavailable day+period slots).
// GET is readable by every authenticated role so the same data shows everywhere;
// writes are limited to admin / HOD (own department).
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { validate } = require('../validate');
const { requireAuth, requireRole, deptOk } = require('../auth');

const router = express.Router();

// Every role sees the identical availability list.
router.get('/availability', requireAuth, (req, res) => {
  res.json({ data: db.all('teacher_unavailability') });
});

const slotsSchema = z.object({
  slots: z
    .array(z.object({ day: z.string().min(1), period: z.number().int().min(1).max(12) }))
    .max(200),
});

// Replace one teacher's availability in a single call.
router.put(
  '/teachers/:id/availability',
  requireAuth,
  requireRole('admin', 'hod'),
  validate(slotsSchema),
  (req, res) => {
    const teacher = db.findById('teachers', req.params.id);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found.', fix: 'It may have been deleted.' });
    if (req.user.role === 'hod' && !deptOk(req, teacher.department_id)) {
      return res.status(403).json({ error: 'HODs can only manage their own department.', fix: 'Pick a teacher in your department.' });
    }
    const d = db.read();
    const before = d.teacher_unavailability.filter((u) => u.teacher_id === teacher.id);
    d.teacher_unavailability = d.teacher_unavailability.filter((u) => u.teacher_id !== teacher.id);
    for (const s of req.body.slots) {
      d.teacher_unavailability.push({ teacher_id: teacher.id, day: s.day, period: s.period });
    }
    db.persist();
    const after = d.teacher_unavailability.filter((u) => u.teacher_id === teacher.id);
    db.addAudit({ actor_user_id: req.user.id, action: 'update:availability', target_type: 'teacher', target_id: teacher.id, before, after });
    res.json({ data: after });
  }
);

module.exports = router;
