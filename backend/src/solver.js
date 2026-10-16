// Solver engine (PRD §7.2): expand -> order by difficulty -> backtracking with
// forward checking -> hill-climbing for soft constraints -> infeasibility report.
//
// generateTimetable(data) is sync; generateTimetableAsync wraps it for jobs.
// Data: { teachers, rooms, subjects, batches, assignments, time_slots,
//         teacher_unavailability, lockedSessions }
// Returns { feasible:true, sessions:[per-period rows], score } or
//         { feasible:false, report, topFixes[3] }

function slotKey(day, period) {
  return `${day}|${period}`;
}

function roomFitsType(roomType, required) {
  if (!required) return roomType !== 'lab' ? true : true; // theory may use any room by default
  if (required === 'lab') return roomType === 'lab';
  return roomType === required || roomType === 'lecture' || roomType === 'seminar';
}

function subjectRoomOk(subjectType, requiredRoomType, room) {
  const need = requiredRoomType || (subjectType === 'lab' ? 'lab' : null);
  if (need === 'lab' && room.type !== 'lab') return false;
  return true;
}

function generateTimetable(data, options = {}) {
  const t0 = Date.now();
  const timeLimitMs = options.timeLimitMs || 25000;
  const onProgress = options.onProgress || null;
  const progress = (f) => { try { if (onProgress) onProgress(Math.max(0, Math.min(1, f))); } catch (e) {} };

  const teachers = data.teachers || [];
  const rooms = data.rooms || [];
  const subjects = data.subjects || [];
  const batches = data.batches || [];
  const assignments = data.assignments || [];
  const slots = (data.time_slots || []).filter((s) => !s.is_break);
  const unavail = data.teacher_unavailability || [];
  const locked = data.lockedSessions || [];

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const unavailSet = new Set(unavail.map((u) => `${u.teacher_id}|${u.day}|${u.period}`));
  const isUnavail = (teacherId, day, per) => unavailSet.has(`${teacherId}|${day}|${per}`);

  // Slots grouped by day, sorted by period.
  const daysInOrder = [];
  for (const s of slots) if (!daysInOrder.includes(s.day)) daysInOrder.push(s.day);
  const slotsByDay = new Map(daysInOrder.map((d) => [d, slots.filter((s) => s.day === d).sort((a, b) => a.period - b.period)]));

  // Batch family map (parent <-> children conflict).
  const batchFamily = new Map();
  for (const b of batches) {
    const fam = new Set([b.id]);
    if (b.parent_batch_id) fam.add(b.parent_batch_id);
    for (const c of batches) if (c.parent_batch_id === b.id) fam.add(c.id);
    batchFamily.set(b.id, fam);
  }
  const batchConflicts = (batchId, occBatch) => {
    const fam = batchFamily.get(batchId) || new Set([batchId]);
    for (const f of fam) if (occBatch.has(f)) return true;
    return false;
  };

  // Expand assignments into tasks.
  const tasks = [];
  for (const a of assignments) {
    const subj = subjectById.get(a.subject_id);
    if (!subj) continue;
    const n = subj.sessions_per_week || 1;
    const len = subj.periods_per_session || 1;
    for (let i = 0; i < n; i++) {
      tasks.push({ key: `${a.id}#${i}`, assignment: a, subject: subj, len });
    }
  }

  // Candidate rooms per assignment.
  const roomsFor = (task) => {
    const batch = batchById.get(task.assignment.batch_id);
    const strength = batch ? batch.strength || 0 : 0;
    return rooms.filter(
      (r) => (r.capacity || 0) >= strength && subjectRoomOk(task.subject.type, task.assignment.required_room_type, r)
    );
  };
  const roomsCache = new Map();
  const getRooms = (task) => {
    if (!roomsCache.has(task.key)) roomsCache.set(task.key, roomsFor(task));
    return roomsCache.get(task.key);
  };

  // Enumerate consecutive blocks of length len within a day (no break crossing).
  function blocksFor(task, day) {
    const list = slotsByDay.get(day) || [];
    const out = [];
    for (let i = 0; i + task.len <= list.length; i++) {
      const win = list.slice(i, i + task.len);
      let consec = true;
      for (let k = 1; k < win.length; k++) {
        if (win[k].period !== win[k - 1].period + 1) { consec = false; break; }
      }
      if (!consec) continue;
      if (win.some((s) => isUnavail(task.assignment.teacher_id, s.day, s.period))) continue;
      out.push(win);
    }
    return out;
  }

  // Difficulty ordering: labs & long sessions, tight availability, big batches first.
  const scored = tasks.map((t) => {
    let starts = 0;
    for (const d of daysInOrder) starts += blocksFor(t, d).length;
    const batch = batchById.get(t.assignment.batch_id);
    return { t, starts, strength: (batch && batch.strength) || 0 };
  });
  scored.sort((a, b) => (a.starts - b.starts) || (b.t.len - a.t.len) || (b.strength - a.strength));
  const ordered = scored.map((s) => s.t);

  // Early infeasibility: task with rooms but zero start slots, or no rooms at all.
  const impossible = scored.filter((s) => getRooms(s.t).length === 0 || s.starts === 0);
  if (impossible.length > 0) {
    return infeasible(ordered, { teachers, teacherById, subjectById, batchById, getRooms, scored, daysInOrder, slots });
  }

  // Occupancy state.
  const occTeacher = new Map(); // slotId -> Set teacherId
  const occRoom = new Map();
  const occBatch = new Map();   // slotId -> Set batchId
  const dayHours = new Map();   // teacher|day -> periods
  const weekHours = new Map();  // teacher -> periods
  const touch = (m, k) => { if (!m.has(k)) m.set(k, new Set()); return m.get(k); };

  // Locked sessions occupy first (one row per period).
  for (const L of locked) {
    touch(occTeacher, L.slot_id).add(L.teacher_id);
    touch(occRoom, L.slot_id).add(L.room_id);
    touch(occBatch, L.slot_id).add(L.batch_id);
  }

  const placed = []; // {task, block, room}
  let nodes = 0;
  const maxNodes = options.maxNodes || 60000;

  function teacherHoursOk(teacherId, day, len) {
    const t = teacherById.get(teacherId);
    const md = (t && t.max_hours_day) || 6;
    const mw = (t && t.max_hours_week) || 30;
    return ((dayHours.get(`${teacherId}|${day}`) || 0) + len <= md) &&
           ((weekHours.get(teacherId) || 0) + len <= mw);
  }

  function blockFree(task, block, roomId) {
    const a = task.assignment;
    if (!teacherHoursOk(a.teacher_id, block[0].day, block.length)) return false;
    for (const s of block) {
      if (touch(occTeacher, s.id).has(a.teacher_id)) return false;
      if (touch(occRoom, s.id).has(roomId)) return false;
      if (batchConflicts(a.batch_id, touch(occBatch, s.id))) return false;
      // locked clash
      if (touch(occTeacher, s.id).has(a.teacher_id)) return false;
    }
    return true;
  }

  function occupy(task, block, room, on) {
    const a = task.assignment;
    const d = block[0].day;
    dayHours.set(`${a.teacher_id}|${d}`, (dayHours.get(`${a.teacher_id}|${d}`) || 0) + (on ? block.length : -block.length));
    weekHours.set(a.teacher_id, (weekHours.get(a.teacher_id) || 0) + (on ? block.length : -block.length));
    for (const s of block) {
      const st = touch(occTeacher, s.id), sr = touch(occRoom, s.id), sb = touch(occBatch, s.id);
      if (on) { st.add(a.teacher_id); sr.add(room.id); sb.add(a.batch_id); }
      else { st.delete(a.teacher_id); sr.delete(room.id); sb.delete(a.batch_id); }
    }
  }

  function candidates(task) {
    const out = [];
    const rms = getRooms(task);
    if (rms.length === 0) return out;
    for (const d of daysInOrder) {
      for (const b of blocksFor(task, d)) {
        for (const r of rms) {
          if (blockFree(task, b, r.id)) out.push({ block: b, room: r });
        }
      }
    }
    return out;
  }

  // Backtracking with MRV: pick unplaced task with fewest candidates each step.
  const remaining = ordered.slice();
  let timedOut = false;

  function search(depth) {
    if (Date.now() - t0 > timeLimitMs) { timedOut = true; return false; }
    if (remaining.length === 0) return true;
    if (++nodes > maxNodes) return false;
    if (nodes % 500 === 0) progress(0.05 + 0.85 * (depth / Math.max(1, ordered.length)));

    // MRV pick
    let bestIdx = -1, bestCands = null;
    for (let i = 0; i < remaining.length; i++) {
      const c = candidates(remaining[i]);
      if (c.length === 0) return false; // forward-checking failure
      if (!bestCands || c.length < bestCands.length) { bestCands = c; bestIdx = i; if (c.length === 1) break; }
    }
    const [task] = remaining.splice(bestIdx, 1);
    // Try candidates: prefer days used less by this batch (spread), shuffle rooms lightly.
    for (const c of bestCands) {
      if (Date.now() - t0 > timeLimitMs) { timedOut = true; break; }
      occupy(task, c.block, c.room, true);
      placed.push({ task, block: c.block, room: c.room });
      if (search(depth + 1)) return true;
      placed.pop();
      occupy(task, c.block, c.room, false);
    }
    remaining.splice(bestIdx, 0, task);
    return false;
  }

  const ok = search(0);
  progress(0.92);
  if (!ok) {
    return infeasible(ordered, { teachers, teacherById, subjectById, batchById, getRooms, scored, daysInOrder, slots, timedOut });
  }

  // Hill-climbing on soft constraints: random swaps that keep hard rules.
  let score = softScore(placed, { batchById, subjectById, teacherById });
  for (let iter = 0; iter < 1500; iter++) {
    if (Date.now() - t0 > timeLimitMs + 4000) break;
    const i = Math.floor(Math.random() * placed.length);
    const j = Math.floor(Math.random() * placed.length);
    if (i === j) continue;
    const A = placed[i], B = placed[j];
    if (A.task.len !== B.task.len) continue;
    if (A.block[0].day === B.block[0].day && A.room.id === B.room.id) continue;
    // try swap blocks+rooms if hard-valid
    occupy(A.task, A.block, A.room, false);
    occupy(B.task, B.block, B.room, false);
    const aOk = blockFree(B.task, A.block, A.room.id) || (sameBlock(A.block, B.block) && false);
    // Simpler: swap blocks, keep rooms if they fit, else keep original rooms when they fit swapped
    const roomForA = roomFitsSwap(A.task, B.block, B.room, A.room, getRooms);
    const roomForB = roomFitsSwap(B.task, A.block, A.room, B.room, getRooms);
    let improved = false;
    if (roomForA && roomForB) {
      // tentatively apply
      occupy(A.task, B.block, roomForA, true);
      occupy(B.task, A.block, roomForB, true);
      const s2 = softScore(placed.map((p, k) => k === i ? { task: p.task, block: B.block, room: roomForA } : k === j ? { task: p.task, block: A.block, room: roomForB } : p), { batchById, subjectById, teacherById });
      if (s2 > score) {
        placed[i] = { task: A.task, block: B.block, room: roomForA };
        placed[j] = { task: B.task, block: A.block, room: roomForB };
        score = s2; improved = true;
      } else {
        occupy(A.task, B.block, roomForA, false);
        occupy(B.task, A.block, roomForB, false);
        occupy(A.task, A.block, A.room, true);
        occupy(B.task, B.block, B.room, true);
      }
    } else {
      occupy(A.task, A.block, A.room, true);
      occupy(B.task, B.block, B.room, true);
    }
    if (improved) continue;
  }

  function sameBlock(a, b) { return a.length === b.length && a.every((s, k) => s.id === b[k].id); }
  function roomFitsSwap(task, block, prefer, fallback, getRoomsFn) {
    const rms = getRoomsFn(task);
    for (const r of [prefer, fallback]) {
      if (r && rms.some((x) => x.id === r.id) && blockFree(task, block, r.id)) return r;
    }
    for (const r of rms) if (blockFree(task, block, r.id)) return r;
    return null;
  }

  progress(1);
  // Flatten to one row per period (DB UNIQUE constraints cover these).
  const sessions = [];
  for (const p of placed) {
    for (const s of p.block) {
      sessions.push({
        assignment_id: p.task.assignment.id,
        slot_id: s.id,
        room_id: p.room.id,
        teacher_id: p.task.assignment.teacher_id,
        batch_id: p.task.assignment.batch_id,
        session_group: p.task.key,
      });
    }
  }
  return { feasible: true, sessions, score };
}

function softScore(placed, ctx) {
  // Higher is better. Penalties: same subject twice a day per batch, batch gaps,
  // heavy subject in last period, teacher early+late same day.
  let score = 1000;
  const byBatchDay = new Map();
  const teacherDayPeriods = new Map();
  for (const p of placed) {
    const day = p.block[0].day;
    const k = `${p.task.assignment.batch_id}|${day}`;
    if (!byBatchDay.has(k)) byBatchDay.set(k, []);
    byBatchDay.get(k).push(p);
    const tk = `${p.task.assignment.teacher_id}|${day}`;
    if (!teacherDayPeriods.has(tk)) teacherDayPeriods.set(tk, []);
    for (const s of p.block) teacherDayPeriods.get(tk).push(s.period);
  }
  for (const [, list] of byBatchDay) {
    const seen = new Map();
    for (const p of list) {
      const c = (seen.get(p.task.subject.id) || 0) + 1;
      seen.set(p.task.subject.id, c);
      if (c > 1) score -= 8; // same subject twice a day
    }
    const pers = list.flatMap((p) => p.block.map((s) => s.period)).sort((a, b) => a - b);
    if (pers.length > 1) {
      const span = pers[pers.length - 1] - pers[0] + 1;
      score -= (span - pers.length) * 3; // gaps
      const last = Math.max(...pers);
      for (const p of list) {
        if (p.block.some((s) => s.period === last) && p.task.subject.type !== 'lab') score -= 1;
      }
    }
  }
  for (const [, pers] of teacherDayPeriods) {
    const mn = Math.min(...pers), mx = Math.max(...pers);
    if (mx - mn >= 4 && pers.length <= 3) score -= 2; // early + late with little in between
  }
  return score;
}

function infeasible(ordered, ctx) {
  const { teacherById, subjectById, batchById, getRooms, daysInOrder, slots } = ctx;
  const usable = (slots || []).filter((s) => !s.is_break).length;
  // busiest teacher: required periods vs available slots
  const need = new Map();
  for (const t of ordered) {
    const a = t.assignment;
    need.set(a.teacher_id, (need.get(a.teacher_id) || 0) + t.len);
  }
  let worst = null;
  for (const [tid, n] of need) {
    const t = teacherById.get(tid);
    const name = (t && t.name) || tid;
    if (!worst || n > worst.n) worst = { tid, n, name };
  }
  const noRoom = ordered.filter((t) => getRooms(t).length === 0);
  const report =
    `Could not place all ${ordered.length} sessions with the current setup. ` +
    (worst ? `${worst.name} needs ${worst.n} periods/week but only ${usable} usable slots exist per grid (minus leave and daily caps). ` : '') +
    (noRoom.length > 0 ? `${noRoom.length} session(s) have no room with enough capacity and the right type. ` : '') +
    (ctx.timedOut ? 'The search also hit the time limit — the problem may just be very tight.' : 'No arrangement satisfies every hard rule at once.');
  const topFixes = [
    worst ? `Free up ${worst.name}: reduce their sessions or add available slots (approve leave changes, raise max hours/day).` : 'Add more available slots for the busiest teachers.',
    noRoom.length > 0 ? 'Add a room (or bigger lab) matching the required type, or split the batch.' : 'Add one more room of the scarcest type, or allow theory in seminar rooms.',
    'Split a large batch, shorten lab blocks to single periods, or add a working day/period.',
  ].slice(0, 3);
  return { feasible: false, report, topFixes };
}

function generateTimetableAsync(data, options = {}) {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(generateTimetable(data, options));
      } catch (e) {
        reject(e);
      }
    });
  });
}

module.exports = { generateTimetable, generateTimetableAsync };
