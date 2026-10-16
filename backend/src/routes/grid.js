// GET,PUT /api/time-grid
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { validate } = require('../validate');
const { requireAuth, requireRole } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const gridSchema = z.object({
  days: z.array(z.string().min(1)).min(1).max(7),
  periodsPerDay: z.number().int().min(1).max(12),
  timings: z.array(z.object({ period: z.number().int().min(1), start: z.string(), end: z.string() })).optional(),
  breaks: z.array(z.number().int().min(1)).optional().default([]),
});

function buildSlots(grid) {
  const timings = grid.timings && grid.timings.length > 0
    ? grid.timings
    : Array.from({ length: grid.periodsPerDay }, (_, i) => ({ period: i + 1, start: '', end: '' }));
  const slots = [];
  for (const day of grid.days) {
    for (const t of timings) {
      slots.push({
        id: `${String(day).toLowerCase()}-p${t.period}`,
        day, period: t.period, start_time: t.start || '', end_time: t.end || '',
        is_break: (grid.breaks || []).includes(t.period),
      });
    }
  }
  return slots;
}

router.get('/', (req, res) => {
  const d = db.read();
  res.json({ data: d.time_grid, slots: d.time_slots });
});

router.put('/', requireRole('admin'), validate(gridSchema), (req, res) => {
  const d = db.read();
  d.time_grid = { days: req.body.days, periodsPerDay: req.body.periodsPerDay, timings: req.body.timings || [], breaks: req.body.breaks || [] };
  d.time_slots = buildSlots(d.time_grid);
  db.persist();
  db.addAudit({ actor_user_id: req.user.id, action: 'update:time-grid', target_type: 'time_grid', target_id: 'grid', after: d.time_grid });
  res.json({ data: d.time_grid, slots: d.time_slots });
});

module.exports = router;
