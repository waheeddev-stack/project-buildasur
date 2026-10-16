// Timetables: generate (async job), list/get, move session, publish, snapshot,
// lock-sessions, export csv/ics.
const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { validate } = require('../validate');
const { requireAuth, requireRole } = require('../auth');
const { generateTimetableAsync } = require('../solver');

const router = express.Router();
router.use(requireAuth);

function slotLabel(slot) {
  if (!slot) return 'that slot';
  const hm = (slot.start_time || '').split(':')[0];
  let h = parseInt(hm, 10);
  let suffix = '';
  if (!Number.isNaN(h)) {
    suffix = ` (${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'})`;
  }
  return `${slot.day} Period ${slot.period}${suffix}`;
}

function teacherName(id) {
  const t = db.findById('teachers', id);
  return (t && t.name) || 'That teacher';
}

function batchName(id) {
  const b = db.findById('batches', id);
  return b ? `${b.program} Sem ${b.semester} Div ${b.division}` : 'That batch';
}

// Enforce UNIQUE(timetable,slot,teacher|room|batch) with plain-language 409s.
function clashError(timetableId, slotId, teacherId, roomId, batchId, ignoreSessionId) {
  const sessions = db.find('sessions', (s) => s.timetable_id === timetableId && (!ignoreSessionId || s.id !== ignoreSessionId));
  const slot = db.find('time_slots', (s) => s.id === slotId)[0];
  const label = slotLabel(slot);
  if (slot && slot.is_break) {
    return { error: `${label} is a break. Sessions cannot go there.`, fix: 'Pick a teaching period.', suggestions: [] };
  }
  if (sessions.some((s) => s.slot_id === slotId && s.teacher_id === teacherId)) {
    return { error: `${teacherName(teacherId)} is already teaching at ${label}.`, fix: 'Pick another slot or teacher.', suggestions: [] };
  }
  if (sessions.some((s) => s.slot_id === slotId && s.room_id === roomId)) {
    const r = db.findById('rooms', roomId);
    return { error: `${(r && r.name) || 'That room'} is already booked at ${label}.`, fix: 'Pick another room or slot.', suggestions: [] };
  }
  if (sessions.some((s) => s.slot_id === slotId && s.batch_id === batchId)) {
    return { error: `${batchName(batchId)} already has a class at ${label}.`, fix: 'Pick another slot for this batch.', suggestions: [] };
  }
  return null;
}

function validatePlacement(timetableId, slotId, teacherId, roomId, batchId, assignmentId, ignoreSessionId) {
  const slot = db.find('time_slots', (s) => s.id === slotId)[0];
  if (!slot) return { error: 'That slot does not exist.', fix: 'Pick a valid day and period.', suggestions: [] };
  const clash = clashError(timetableId, slotId, teacherId, roomId, batchId, ignoreSessionId);
  if (clash) return clash;
  const un = db.find('teacher_unavailability', (u) => u.teacher_id === teacherId && u.day === slot.day && u.period === slot.period)[0];
  if (un) return { error: `${teacherName(teacherId)} is on leave at ${slotLabel(slot)}.`, fix: 'Pick a slot when they are available.', suggestions: [] };
  const room = db.findById('rooms', roomId);
  const batch = db.findById('batches', batchId);
  if (room && batch && (room.capacity || 0) < (batch.strength || 0)) {
    return { error: `${room.name} fits ${room.capacity} but ${batchName(batchId)} has ${batch.strength} students.`, fix: 'Pick a bigger room or split the batch.', suggestions: [] };
  }
  if (assignmentId) {
    const a = db.findById('assignments', assignmentId);
    const subj = a && db.findById('subjects', a.subject_id);
    if (subj && subj.type === 'lab' && room && room.type !== 'lab') {
      return { error: `${subj.name} is a lab and needs a lab room.`, fix: 'Pick a lab room.', suggestions: [] };
    }
  }
  return null;
}

function suggestSlots(timetableId, assignmentId, teacherId, batchId, roomId, n = 3) {
  const a = assignmentId ? db.findById('assignments', assignmentId) : null;
  const slots = db.all('time_slots').filter((s) => !s.is_break);
  const out = [];
  for (const s of slots) {
    if (out.length >= n) break;
    const err = validatePlacement(timetableId, s.id, a ? a.teacher_id : teacherId, roomId, a ? a.batch_id : batchId, assignmentId, null);
    if (!err) out.push({ slot_id: s.id, day: s.day, period: s.period, room_id: roomId });
  }
  return out;
}

// ---- Generate (async job) ----
router.post('/timetables/generate', requireRole('admin', 'hod'), (req, res) => {
  const term = (req.body && req.body.term) || '2026-odd';
  const d = db.read();
  const job = db.insert('jobs', { status: 'queued', progress: 0, resultTimetableId: null, error: null, infeasibilityReport: null, term });
  // async run
  setImmediate(async () => {
    try {
      db.update('jobs', job.id, { status: 'running', progress: 0.05 });
      const locked = db.find('sessions', (s) => s.is_locked);
      const data = {
        teachers: d.teachers, rooms: d.rooms, subjects: d.subjects, batches: d.batches,
        assignments: d.assignments, time_slots: d.time_slots,
        teacher_unavailability: d.teacher_unavailability, lockedSessions: locked,
      };
      const result = await generateTimetableAsync(data, {
        timeLimitMs: 25000,
        onProgress: (f) => { try { db.update('jobs', job.id, { progress: f }); } catch (e) {} },
      });
      if (!result.feasible) {
        db.update('jobs', job.id, { status: 'failed', progress: 1, error: result.report, infeasibilityReport: result });
        return;
      }
      const tt = db.insert('timetables', { term, version: d.timetables.length + 1, status: 'draft', score: result.score, created_by: req.user.id });
      for (const s of result.sessions) {
        db.insert('sessions', {
          timetable_id: tt.id, assignment_id: s.assignment_id, slot_id: s.slot_id,
          room_id: s.room_id, teacher_id: s.teacher_id, batch_id: s.batch_id,
          session_group: s.session_group, is_locked: false,
        });
      }
      db.addAudit({ actor_user_id: req.user.id, action: 'generate:timetable', target_type: 'timetable', target_id: tt.id, after: { term, score: result.score } });
      db.update('jobs', job.id, { status: 'done', progress: 1, resultTimetableId: tt.id });
    } catch (e) {
      db.update('jobs', job.id, { status: 'failed', progress: 1, error: e.message || 'Generation failed.' });
    }
  });
  res.status(202).json({ jobId: job.id });
});

// ---- List / get ----
router.get('/timetables', (req, res) => {
  res.json({ data: db.all('timetables') });
});

router.get('/timetables/:id', (req, res) => {
  const tt = db.findById('timetables', req.params.id);
  if (!tt) return res.status(404).json({ error: 'Timetable not found.', fix: 'Generate a new one.' });
  if (req.user.role === 'student' && tt.status !== 'published') {
    return res.status(403).json({ error: 'This timetable is not published yet.', fix: 'Ask your coordinator to publish it.' });
  }
  let sessions = db.find('sessions', (s) => s.timetable_id === tt.id);
  const { view, filter } = req.query;
  if (view && filter) {
    if (view === 'batch') sessions = sessions.filter((s) => s.batch_id === filter);
    else if (view === 'teacher') sessions = sessions.filter((s) => s.teacher_id === filter);
    else if (view === 'room') sessions = sessions.filter((s) => s.room_id === filter);
  }
  if (req.user.role === 'teacher' && req.user.teacher_id) {
    sessions = sessions.filter((s) => s.teacher_id === req.user.teacher_id);
  }
  if (req.user.role === 'student' && req.user.batch_id && !filter) {
    sessions = sessions.filter((s) => s.batch_id === req.user.batch_id);
  }
  const enrich = (s) => {
    const slot = db.find('time_slots', (x) => x.id === s.slot_id)[0] || null;
    const a = (s.assignment_id && db.findById('assignments', s.assignment_id)) || null;
    const subj = (a && db.findById('subjects', a.subject_id)) || null;
    return Object.assign({}, s, {
      slot, subject: subj,
      teacher_name: teacherName(s.teacher_id),
      room_name: (db.findById('rooms', s.room_id) || {}).name || '',
      batch_name: batchName(s.batch_id),
    });
  };
  res.json({ data: tt, sessions: sessions.map(enrich) });
});

// ---- Move session (validated) ----
const moveSchema = z.object({ slot_id: z.string().min(1).optional(), room_id: z.string().min(1).optional() }).refine((v) => v.slot_id || v.room_id, { message: 'Give a new slot_id and/or room_id.' });

router.patch('/sessions/:id', requireRole('admin', 'hod'), validate(moveSchema), (req, res) => {
  const s = db.findById('sessions', req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found.', fix: 'Refresh the grid and try again.' });
  if (s.is_locked) return res.status(409).json({ error: 'This session is locked and cannot move.', fix: 'Unlock it first, then move.', suggestions: [] });
  const slotId = req.body.slot_id || s.slot_id;
  const roomId = req.body.room_id || s.room_id;
  const err = validatePlacement(s.timetable_id, slotId, s.teacher_id, roomId, s.batch_id, s.assignment_id, s.id);
  if (err) {
    err.suggestions = suggestSlots(s.timetable_id, s.assignment_id, s.teacher_id, s.batch_id, roomId, 3);
    return res.status(409).json({ error: err.error, reason: err.error, fix: err.fix, suggestions: err.suggestions });
  }
  const before = Object.assign({}, s);
  const row = db.update('sessions', s.id, { slot_id: slotId, room_id: roomId });
  db.addAudit({ actor_user_id: req.user.id, action: 'move:session', target_type: 'session', target_id: s.id, before, after: row });
  res.json({ data: row });
});

// ---- Publish / snapshot / lock ----
function auditNoClash(timetableId) {
  const sessions = db.find('sessions', (s) => s.timetable_id === timetableId);
  const seen = { t: new Set(), r: new Set(), b: new Set() };
  for (const s of sessions) {
    for (const [kind, val] of [['t', s.teacher_id], ['r', s.room_id], ['b', s.batch_id]]) {
      const k = `${timetableId}|${s.slot_id}|${val}`;
      const set = kind === 't' ? seen.t : kind === 'r' ? seen.r : seen.b;
      if (set.has(k)) return `Double-booking found at slot ${s.slot_id}.`;
      set.add(k);
    }
  }
  return null;
}

router.post('/timetables/:id/publish', requireRole('admin', 'hod'), (req, res) => {
  const tt = db.findById('timetables', req.params.id);
  if (!tt) return res.status(404).json({ error: 'Timetable not found.', fix: 'Generate a new one.' });
  const problem = auditNoClash(tt.id);
  if (problem) return res.status(409).json({ error: `Cannot publish — ${problem}`, fix: 'Fix the clash, then publish again.' });
  const row = db.update('timetables', tt.id, { status: 'published' });
  db.addAudit({ actor_user_id: req.user.id, action: 'publish:timetable', target_type: 'timetable', target_id: tt.id });
  res.json({ data: row });
});

router.post('/timetables/:id/snapshot', requireRole('admin', 'hod'), (req, res) => {
  const tt = db.findById('timetables', req.params.id);
  if (!tt) return res.status(404).json({ error: 'Timetable not found.', fix: 'Generate a new one.' });
  const d = db.read();
  const copy = db.insert('timetables', { term: tt.term, version: d.timetables.length + 1, status: 'draft', score: tt.score, created_by: req.user.id });
  const sessions = db.find('sessions', (s) => s.timetable_id === tt.id);
  for (const s of sessions) {
    db.insert('sessions', { timetable_id: copy.id, assignment_id: s.assignment_id, slot_id: s.slot_id, room_id: s.room_id, teacher_id: s.teacher_id, batch_id: s.batch_id, session_group: s.session_group, is_locked: !!s.is_locked });
  }
  db.addAudit({ actor_user_id: req.user.id, action: 'snapshot:timetable', target_type: 'timetable', target_id: copy.id, after: { from: tt.id } });
  res.status(201).json({ data: copy });
});

const lockSchema = z.object({ sessionIds: z.array(z.string()).min(1), locked: z.boolean().optional().default(true) });

router.post('/timetables/:id/lock-sessions', requireRole('admin', 'hod'), validate(lockSchema), (req, res) => {
  const tt = db.findById('timetables', req.params.id);
  if (!tt) return res.status(404).json({ error: 'Timetable not found.', fix: 'Generate a new one.' });
  const out = [];
  for (const sid of req.body.sessionIds) {
    const s = db.findById('sessions', sid);
    if (s && s.timetable_id === tt.id) out.push(db.update('sessions', sid, { is_locked: !!req.body.locked }));
  }
  res.json({ data: out });
});

// ---- Export ----
router.get('/timetables/:id/export', (req, res) => {
  const tt = db.findById('timetables', req.params.id);
  if (!tt) return res.status(404).json({ error: 'Timetable not found.', fix: 'Generate a new one.' });
  const format = String(req.query.format || 'csv').toLowerCase();
  if (format === 'pdf') {
    return res.status(501).json({ error: 'PDF export is not in v1. Use CSV or ICS.', fix: 'Export as CSV, then print to PDF from your spreadsheet.' });
  }
  const sessions = db.find('sessions', (s) => s.timetable_id === tt.id);
  const rows = sessions.map((s) => {
    const slot = db.find('time_slots', (x) => x.id === s.slot_id)[0] || {};
    const a = (s.assignment_id && db.findById('assignments', s.assignment_id)) || {};
    const subj = (a.subject_id && db.findById('subjects', a.subject_id)) || {};
    return { day: slot.day || '', period: slot.period || '', start: slot.start_time || '', end: slot.end_time || '', subject: subj.code || '', teacher: teacherName(s.teacher_id), room: (db.findById('rooms', s.room_id) || {}).name || '', batch: batchName(s.batch_id) };
  });
  if (format === 'ics') {
    const dayNum = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SlotSync//Timetable//EN\r\n';
    rows.forEach((r, i) => {
      ics += `BEGIN:VEVENT\r\nUID:${tt.id}-${i}@slotsync\r\nSUMMARY:${r.subject} (${r.batch}) - ${r.teacher} @ ${r.room}\r\nDESCRIPTION:${r.day} Period ${r.period} ${r.start}-${r.end}\r\nDTSTART:2026010${Math.min(5, (dayNum[r.day] || 0) + 1)}T${String(r.start || '09:00').replace(':', '')}00\r\nDURATION:PT1H\r\nEND:VEVENT\r\n`;
    });
    ics += 'END:VCALENDAR';
    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', `attachment; filename="timetable-${tt.id}.ics"`);
    return res.send(ics);
  }
  // csv default
  const head = 'day,period,start,end,subject,teacher,room,batch';
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const body = rows.map((r) => [r.day, r.period, r.start, r.end, r.subject, r.teacher, r.room, r.batch].map(esc).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="timetable-${tt.id}.csv"`);
  res.send(head + '\n' + body);
});

module.exports = router;
module.exports.helpers = { slotLabel, clashError, validatePlacement };
