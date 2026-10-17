// SlotSync assistant engine.
//
// AI is an assistant, never the scheduler: it only reads data, parses plain
// English into *suggestions*, and explains results. Nothing here writes
// timetable data.
//
// The engine runs fully on-device (deterministic heuristics) so the features
// work with AI_ENABLED=false and no API key. When an external LLM is wired in
// later, `aiEnabled()` flips and callers can route through `withProvider`,
// which falls back to the local engine on any error.
const db = require('./db');

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_ALIASES = {
  monday: 'Mon', mon: 'Mon', tuesday: 'Tue', tue: 'Tue', tues: 'Tue',
  wednesday: 'Wed', wed: 'Wed', thursday: 'Thu', thu: 'Thu', thurs: 'Thu',
  friday: 'Fri', fri: 'Fri', saturday: 'Sat', sat: 'Sat', sunday: 'Sun', sun: 'Sun',
};
const LUNCH = 5; // 13:00-14:00 lunch break period

function aiEnabled() {
  return String(process.env.AI_ENABLED || 'false').toLowerCase() === 'true';
}

// ---------- small helpers ----------
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function dayFrom(text) {
  const t = norm(text);
  for (const [k, v] of Object.entries(DAY_ALIASES)) {
    if (new RegExp(`\\b${k}\\b`).test(t)) return v;
  }
  return null;
}

function periodsFrom(text) {
  const t = norm(text);
  const out = new Set();
  const re = /\b(?:p|period|slot|hour|hr|h)?\s?(\d{1,2})\b/g;
  let m;
  while ((m = re.exec(t))) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 12) out.add(n);
  }
  const ord = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8 };
  for (const [w, n] of Object.entries(ord)) if (t.includes(w)) out.add(n);
  return [...out].sort((a, b) => a - b);
}

function teacherByHint(hint) {
  const h = norm(hint);
  if (!h) return null;
  const teachers = db.all('teachers');
  const words = h.split(' ').filter((w) => w.length > 1 && !['dr', 'prof', 'professor', 'mr', 'ms', 'mrs', 'sir', 'mam'].includes(w));
  let best = null;
  let bestScore = 0;
  for (const t of teachers) {
    const n = norm(t.name);
    let score = 0;
    if (n === h) score = 100;
    else if (words.some((w) => n.includes(w))) score = words.filter((w) => n.includes(w)).length * 10 + 1;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return bestScore > 0 ? best : null;
}

function subjectByHint(hint) {
  const h = norm(hint);
  if (!h) return null;
  const subjects = db.all('subjects');
  for (const s of subjects) if (norm(s.code) === h) return s;
  let best = null;
  let bestScore = 0;
  for (const s of subjects) {
    const n = norm(s.name);
    if (!n) continue;
    let score = 0;
    if (n === h || h.includes(n)) score = 100;
    else {
      const words = h.split(' ').filter((w) => w.length > 2);
      score = words.filter((w) => n.includes(w)).length * 10;
    }
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore > 0 ? best : null;
}

function batchByHint(hint) {
  const h = norm(hint);
  if (!h) return null;
  const batches = db.all('batches');
  const div = (h.match(/\b(?:div(?:ision)?|section)?\s*([abc])\b/) || [])[1];
  const sem = (h.match(/\bsem(?:ester)?\s*(\d+)\b/) || [])[1];
  const progWords = ['cse', 'ece', 'mech', 'civil', 'eee', 'it', 'cs', 'aids'];
  let best = null;
  let bestScore = 0;
  for (const b of batches) {
    let score = 0;
    const label = norm(`${b.program} ${b.division}`);
    if (progWords.some((p) => h.includes(p) && norm(b.program).includes(p))) score += 20;
    if (div && b.division && norm(b.division) === div) score += 30;
    if (sem && String(b.semester) === sem) score += 15;
    if (label && (h.includes(label) || label.includes(h))) score += 25;
    if (score > bestScore) { bestScore = score; best = b; }
  }
  return bestScore > 0 ? best : null;
}

function teacherName(id) { const t = db.findById('teachers', id); return (t && t.name) || 'Unknown'; }
function batchLabel(id) {
  const b = db.findById('batches', id);
  return b ? `${b.program} Sem ${b.semester} Div ${b.division}` : 'Unknown batch';
}
function subjectOf(s) {
  const a = s.assignment_id ? db.findById('assignments', s.assignment_id) : null;
  return (a && db.findById('subjects', a.subject_id)) || null;
}
function slotOf(s) { return db.find('time_slots', (x) => x.id === s.slot_id)[0] || null; }
function roomName(id) { const r = db.findById('rooms', id); return (r && r.name) || ''; }

function latestTimetable() {
  const rows = db.all('timetables');
  return rows.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;
}
function latestSessions() {
  const tt = latestTimetable();
  if (!tt) return { tt: null, sessions: [] };
  return { tt, sessions: db.find('sessions', (s) => s.timetable_id === tt.id) };
}
function describe(s) {
  const slot = slotOf(s);
  const subj = subjectOf(s);
  return {
    day: slot?.day || '', period: slot?.period ?? null, time: slot ? `${slot.start_time}-${slot.end_time}` : '',
    subject: subj ? `${subj.code} ${subj.name}` : '',
    teacher: teacherName(s.teacher_id), room: roomName(s.room_id), batch: batchLabel(s.batch_id),
  };
}

// ---------- A1: plain English -> structured rule (suggestion only) ----------
function parseRule(text, user) {
  const src = String(text || '');
  const teacher = teacherByHint(src);
  const day = dayFrom(src);
  const explicit = periodsFrom(src);
  const afterLunch = /\bafter lunch\b|\bpost lunch\b/.test(norm(src));
  const beforeLunch = /\bbefore lunch\b|\bpre lunch\b/.test(norm(src));
  const allDays = /\bevery day\b|\bdaily\b|\ball days\b/.test(norm(src)) || !day;
  const days = allDays ? DAYS.slice(0, 5) : [day];

  let periods = explicit;
  if (!periods.length && afterLunch) periods = [6, 7];
  if (!periods.length && beforeLunch) periods = [1, 2, 3, 4];

  const slots = [];
  for (const d of days) {
    for (const p of periods) if (p !== LUNCH) slots.push({ day: d, period: p });
  }
  const summary = teacher
    ? `${teacher.name} unavailable ${allDays ? 'every day' : 'on ' + day}${periods.length ? `, period${periods.length > 1 ? 's' : ''} ${periods.join(', ')}` : ' (all periods)'}.`
    : 'Could not spot a teacher name in that sentence.';

  return {
    type: 'unavailable',
    teacher_id: teacher ? teacher.id : null,
    teacher_name: teacher ? teacher.name : null,
    slots,
    confidence: teacher ? (slots.length ? 0.9 : 0.5) : 0.2,
    summary,
    requiresConfirmation: true,
    note: 'Preview and confirm — AI never applies rules by itself.',
  };
}

// ---------- A2/A5: explain a report or summarise a change ----------
function explainReport(input) {
  let report = input;
  if (typeof report === 'string') { try { report = JSON.parse(report); } catch (e) { /* keep string */ } }
  if (report && report.before && report.after) return changeNotes(report.before, report.after);

  const reason = report && (report.reason || report.error || report.message);
  const fixes = (report && (report.topFixes || report.fixes)) || [];
  const plain = reason
    ? `Short version: ${String(reason).replace(/\.$/, '')}. The solver hit a hard rule it could not satisfy, so nothing was placed.`
    : 'No blockers found — the solver did not report any hard-rule failures.';
  const friendly = fixes.length
    ? fixes.map((f, i) => `${i + 1}. ${f}`)
    : [
        'Free up a teacher who is currently over their weekly cap.',
        'Add a room that matches the required type (lab vs lecture).',
        'Relax one unavailability window that is pinching a busy slot.',
      ];
  return { plainWords: plain, fixes: friendly, headline: reason ? 'Why no timetable?' : 'All clear' };
}

function changeNotes(before, after) {
  const b = new Map((before || []).map((s) => [s.id, s.slot_id]));
  const a = new Map((after || []).map((s) => [s.id, s.slot_id]));
  let added = 0, removed = 0, moved = 0;
  for (const [id] of a) if (!b.has(id)) added++;
  for (const [id] of b) if (!a.has(id)) removed++;
  for (const [id, slot] of a) if (b.has(id) && b.get(id) !== slot) moved++;
  const bits = [];
  if (added) bits.push(`${added} session${added > 1 ? 's' : ''} added`);
  if (removed) bits.push(`${removed} removed`);
  if (moved) bits.push(`${moved} moved`);
  return {
    headline: bits.length ? 'What changed' : 'Nothing changed',
    summary: bits.length ? bits.join(', ') + '.' : 'The two versions are identical.',
    added, removed, moved,
  };
}

// ---------- A4: Ask SlotSync (natural language over read-only data) ----------
function ask(question) {
  const q = String(question || '').trim();
  if (!q) return help();

  const { tt, sessions } = latestSessions();
  const qn = norm(q);

  // Free rooms
  if (/free room|available room|empty room|rooms? free/.test(qn)) {
    const day = dayFrom(q) || 'Mon';
    const periods = periodsFrom(q);
    const period = periods[0] || 1;
    const booked = new Set(sessions.filter((s) => {
      const slot = slotOf(s);
      return slot && slot.day === day && slot.period === period;
    }).map((s) => s.room_id));
    const free = db.all('rooms').filter((r) => !booked.has(r.id));
    return {
      intent: 'free_rooms',
      question: q,
      answer: free.length
        ? `Free rooms on ${day} period ${period}: ${free.map((r) => r.name).join(', ')}.`
        : `Every room is booked on ${day} period ${period}.`,
      rows: free.map((r) => ({ room: r.name, type: r.type, capacity: r.capacity })),
    };
  }

  // Teacher load / schedule
  const teacher = teacherByHint(q);
  if (teacher && /how many|load|hours|schedule|classes|teach|free|when/.test(qn)) {
    const mine = sessions.filter((s) => s.teacher_id === teacher.id).map(describe);
    const days = new Set(mine.map((m) => m.day));
    const answer = mine.length
      ? `${teacher.name} teaches ${mine.length} session${mine.length > 1 ? 's' : ''} this week across ${days.size} day${days.size > 1 ? 's' : ''} (cap ${teacher.max_hours_week}/week, ${teacher.max_hours_day}/day).`
      : `${teacher.name} has no sessions in the latest timetable.`;
    return { intent: 'teacher_load', question: q, answer, rows: mine };
  }

  // Subject schedule
  const subject = subjectByHint(q);
  if (subject && /when|schedule|where|class|slot|time|teach/.test(qn)) {
    const mine = sessions.filter((s) => (subjectOf(s) || {}).id === subject.id).map(describe);
    const answer = mine.length
      ? `${subject.code} ${subject.name} runs ${mine.length} time${mine.length > 1 ? 's' : ''}: ${mine.map((m) => `${m.day} P${m.period}`).join(', ')}.`
      : `${subject.code} ${subject.name} has no sessions in the latest timetable.`;
    return { intent: 'subject_schedule', question: q, answer, rows: mine };
  }

  // Batch schedule
  const batch = batchByHint(q);
  if (batch && /timetable|schedule|class|when|table|routine/.test(qn)) {
    const mine = sessions.filter((s) => s.batch_id === batch.id).map(describe);
    const answer = mine.length
      ? `${batchLabel(batch.id)} has ${mine.length} sessions: ${mine.map((m) => `${m.day} P${m.period} ${m.subject}`).join('; ')}.`
      : `${batchLabel(batch.id)} has no sessions in the latest timetable.`;
    return { intent: 'batch_schedule', question: q, answer, rows: mine };
  }

  // Busiest / lightest day
  if (/busiest|heaviest|lightest|free day|most classes/.test(qn)) {
    if (!sessions.length) return noData();
    const byDay = {};
    for (const s of sessions) { const d = (slotOf(s) || {}).day; if (d) byDay[d] = (byDay[d] || 0) + 1; }
    const sorted = Object.entries(byDay).sort((a, b) => b[1] - a[1]);
    const busiest = sorted[0];
    const lightest = sorted[sorted.length - 1];
    const wantLight = /lightest|free day/.test(qn);
    const pick = wantLight ? lightest : busiest;
    return {
      intent: 'day_balance',
      question: q,
      answer: `${pick[0]} is the ${wantLight ? 'lightest' : 'busiest'} day with ${pick[1]} session${pick[1] > 1 ? 's' : ''}.`,
      rows: sorted.map(([day, n]) => ({ day, sessions: n })),
    };
  }

  // Overview
  if (/overview|summary|stats|how many|clash|conflict/.test(qn)) return overview();

  return help();
}

function noData() {
  return { intent: 'no_data', answer: 'No timetable has been generated yet. Generate one first, then ask me again.', rows: [] };
}

function overview() {
  const { tt, sessions } = latestSessions();
  if (!tt) return noData();
  const teachers = new Set(sessions.map((s) => s.teacher_id)).size;
  const rooms = new Set(sessions.map((s) => s.room_id)).size;
  const batches = new Set(sessions.map((s) => s.batch_id)).size;
  return {
    intent: 'overview',
    answer: `Latest timetable "${tt.term}" (${tt.status}) has ${sessions.length} sessions across ${batches} batches, ${teachers} teachers and ${rooms} rooms. Score ${tt.score ?? '—'}, ${tt.conflicts ?? 0} clashes.`,
    rows: [
      { metric: 'Sessions', value: sessions.length },
      { metric: 'Batches', value: batches },
      { metric: 'Teachers', value: teachers },
      { metric: 'Rooms used', value: rooms },
    ],
  };
}

function help() {
  return {
    intent: 'help',
    answer: 'Try: "Free rooms on Tue period 3", "How many classes does Dr. Rao teach?", "When is DBMS?", "Timetable for CSE A", or "busiest day?".',
    suggestions: [
      'Free rooms on Tue period 3',
      'How many classes does Dr. Rao teach?',
      'When is DBMS?',
      'Timetable for CSE A',
      'Busiest day?'
    ],
    rows: [],
  };
}

// ---------- context digest for the hosted chatbot ----------
function dataDigest() {
  const lines = [];
  const grid = db.read().time_grid;
  if (grid) {
    lines.push(`Grid: ${(grid.days || []).join(', ')} · ${grid.periodsPerDay} periods/day · break period(s): ${(grid.breaks || []).join(', ') || 'none'} (period 5 = 13:00–14:00 lunch).`);
  }
  lines.push('Teachers: ' + db.all('teachers').map((t) => t.name).join('; '));
  lines.push('Subjects: ' + db.all('subjects').map((s) => `${s.code} ${s.name}`).join('; '));
  lines.push('Batches: ' + db.all('batches').map((b) => batchLabel(b.id)).join('; '));
  const { tt, sessions } = latestSessions();
  if (tt) {
    lines.push(`Latest timetable "${tt.term}" (${tt.status}): score ${tt.score ?? '—'}, ${tt.conflicts ?? 0} clashes, ${sessions.length} sessions.`);
    const byBatch = {};
    for (const s of sessions) { const k = s.batch_id; (byBatch[k] = byBatch[k] || []).push(describe(s)); }
    for (const [bid, arr] of Object.entries(byBatch)) {
      lines.push(`${batchLabel(bid)}: ` + arr.map((m) => `${m.day} P${m.period} ${m.subject} @${m.room} ${m.teacher}`).join('; '));
    }
  } else {
    lines.push('No timetable has been generated yet.');
  }
  const un = db.all('teacher_unavailability');
  if (un.length) lines.push('Unavailability: ' + un.map((u) => `${teacherName(u.teacher_id)} ${u.day} P${u.period}`).join('; '));
  return lines.join('\n');
}

module.exports = { aiEnabled, parseRule, explainReport, changeNotes, ask, help, overview, dataDigest };
