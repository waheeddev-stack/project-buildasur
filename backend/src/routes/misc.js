// Misc: GET /api/rooms/free, GET /api/audit-log, POST /api/seed
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { seedDatabase } = require('../seed');

const router = express.Router();
router.use(requireAuth);

router.get('/rooms/free', (req, res) => {
  const { day, period, timetableId } = req.query;
  if (!day || !period) {
    return res.status(400).json({ error: 'Give day and period, e.g. ?day=Tue&period=3.', fix: 'Add both query parameters.' });
  }
  const slot = db.find('time_slots', (s) => s.day === day && String(s.period) === String(period))[0];
  if (!slot) return res.status(404).json({ error: `No slot for ${day} period ${period}.`, fix: 'Check the time grid.' });
  let sessions = db.all('sessions');
  if (timetableId) sessions = sessions.filter((s) => s.timetable_id === timetableId);
  else {
    const published = db.find('timetables', (t) => t.status === 'published');
    const scope = published.length > 0 ? published : db.all('timetables').slice(-1);
    const ids = new Set(scope.map((t) => t.id));
    if (ids.size > 0) sessions = sessions.filter((s) => ids.has(s.timetable_id));
    else sessions = [];
  }
  const busy = new Set(sessions.filter((s) => s.slot_id === slot.id).map((s) => s.room_id));
  res.json({ data: db.all('rooms').filter((r) => !busy.has(r.id)), slot });
});

router.get('/audit-log', requireRole('admin', 'hod'), (req, res) => {
  const rows = db.all('audit_log').slice().reverse().slice(0, 200);
  res.json({ data: rows });
});

router.post('/seed', requireRole('admin'), (req, res) => {
  const r = seedDatabase({ force: true });
  res.json(r);
});

module.exports = router;
