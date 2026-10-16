// Seed data: 2 departments, 6 teachers, 6 rooms, 6 subjects, 4 batches,
// assignments, Mon-Fri x 6 grid (period 4 = break), demo users.
const bcrypt = require('bcryptjs');
const db = require('./db');

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const TIMINGS = [
  { period: 1, start: '09:00', end: '10:00' },
  { period: 2, start: '10:00', end: '11:00' },
  { period: 3, start: '11:00', end: '12:00' },
  { period: 4, start: '12:00', end: '13:00' },
  { period: 5, start: '14:00', end: '15:00' },
  { period: 6, start: '15:00', end: '16:00' },
];

function seedDatabase(opts = {}) {
  const d = db.read();
  const force = !!opts.force;
  const empty = d.users.length === 0 && d.teachers.length === 0;
  if (!empty && !force) return { seeded: false, reason: 'db not empty' };

  if (force) {
    for (const c of ['departments', 'users', 'teachers', 'teacher_unavailability', 'availability_requests', 'rooms', 'subjects', 'batches', 'assignments', 'time_slots', 'timetables', 'sessions', 'jobs']) {
      d[c] = [];
    }
    d.time_grid = null;
  }

  const hash = (pw) => bcrypt.hashSync(pw, 10);

  const cse = { id: 'dep_cse', name: 'CSE' };
  const ece = { id: 'dep_ece', name: 'ECE' };
  d.departments.push(cse, ece);

  const teachers = [
    { id: 't_rao', name: 'Dr. Rao', employee_id: 'CSE001', department_id: cse.id, is_active: true, max_hours_day: 4, max_hours_week: 20 },
    { id: 't_meena', name: 'Dr. Meena', employee_id: 'CSE002', department_id: cse.id, is_active: true, max_hours_day: 4, max_hours_week: 20 },
    { id: 't_kumar', name: 'Prof. Kumar', employee_id: 'CSE003', department_id: cse.id, is_active: true, max_hours_day: 5, max_hours_week: 22 },
    { id: 't_iyer', name: 'Dr. Iyer', employee_id: 'ECE001', department_id: ece.id, is_active: true, max_hours_day: 4, max_hours_week: 20 },
    { id: 't_das', name: 'Prof. Das', employee_id: 'ECE002', department_id: ece.id, is_active: true, max_hours_day: 5, max_hours_week: 22 },
    { id: 't_khan', name: 'Dr. Khan', employee_id: 'ECE003', department_id: ece.id, is_active: true, max_hours_day: 4, max_hours_week: 20 },
  ];
  d.teachers.push(...teachers);

  const rooms = [
    { id: 'r101', name: 'R101', capacity: 70, type: 'lecture' },
    { id: 'r102', name: 'R102', capacity: 70, type: 'lecture' },
    { id: 'r103', name: 'R103', capacity: 60, type: 'lecture' },
    { id: 'r104', name: 'R104', capacity: 60, type: 'lecture' },
    { id: 'lab1', name: 'Lab 1', capacity: 65, type: 'lab' },
    { id: 'lab2', name: 'Lab 2', capacity: 65, type: 'lab' },
  ];
  d.rooms.push(...rooms);

  const subjects = [
    { id: 's_dbms', code: 'CS301', name: 'DBMS', type: 'theory', sessions_per_week: 3, periods_per_session: 1 },
    { id: 's_os', code: 'CS302', name: 'Operating Systems', type: 'theory', sessions_per_week: 3, periods_per_session: 1 },
    { id: 's_sig', code: 'EC201', name: 'Signals', type: 'theory', sessions_per_week: 3, periods_per_session: 1 },
    { id: 's_cir', code: 'EC202', name: 'Circuits', type: 'theory', sessions_per_week: 3, periods_per_session: 1 },
    { id: 's_dbmslab', code: 'CS391', name: 'DBMS Lab', type: 'lab', sessions_per_week: 1, periods_per_session: 2 },
    { id: 's_cirlab', code: 'EC392', name: 'Circuits Lab', type: 'lab', sessions_per_week: 1, periods_per_session: 2 },
  ];
  d.subjects.push(...subjects);

  const batches = [
    { id: 'b_cse_a', program: 'B.Tech CSE', semester: 3, division: 'A', strength: 60, parent_batch_id: null },
    { id: 'b_cse_b', program: 'B.Tech CSE', semester: 3, division: 'B', strength: 55, parent_batch_id: null },
    { id: 'b_ece_a', program: 'B.Tech ECE', semester: 3, division: 'A', strength: 60, parent_batch_id: null },
    { id: 'b_ece_b', program: 'B.Tech ECE', semester: 3, division: 'B', strength: 50, parent_batch_id: null },
  ];
  d.batches.push(...batches);

  const A = (id, subject_id, batch_id, teacher_id, required_room_type) =>
    ({ id, subject_id, batch_id, teacher_id, required_room_type: required_room_type || null });
  d.assignments.push(
    A('a1', 's_dbms', 'b_cse_a', 't_rao'), A('a2', 's_os', 'b_cse_a', 't_meena'),
    A('a3', 's_dbmslab', 'b_cse_a', 't_kumar', 'lab'),
    A('a4', 's_dbms', 'b_cse_b', 't_rao'), A('a5', 's_os', 'b_cse_b', 't_meena'),
    A('a6', 's_dbmslab', 'b_cse_b', 't_kumar', 'lab'),
    A('a7', 's_sig', 'b_ece_a', 't_iyer'), A('a8', 's_cir', 'b_ece_a', 't_das'),
    A('a9', 's_cirlab', 'b_ece_a', 't_khan', 'lab'),
    A('a10', 's_sig', 'b_ece_b', 't_iyer'), A('a11', 's_cir', 'b_ece_b', 't_das'),
    A('a12', 's_cirlab', 'b_ece_b', 't_khan', 'lab'),
  );

  d.time_grid = { days: DAYS, periodsPerDay: 6, timings: TIMINGS, breaks: [4] };
  d.time_slots = [];
  for (const day of DAYS) {
    for (const t of TIMINGS) {
      d.time_slots.push({
        id: `${day.toLowerCase()}-p${t.period}`,
        day, period: t.period, start_time: t.start, end_time: t.end,
        is_break: t.period === 4,
      });
    }
  }

  // A little leave so availability rules actually bite.
  d.teacher_unavailability.push({ teacher_id: 't_rao', day: 'Mon', period: 1 });

  const users = [
    { id: 'u_admin', email: 'admin@slotsync.local', password_hash: hash('admin12345678'), role: 'admin', department_id: null, teacher_id: null, batch_id: null, is_active: true },
    { id: 'u_hod', email: 'hod.cse@slotsync.local', password_hash: hash('hod12345678'), role: 'hod', department_id: cse.id, teacher_id: null, batch_id: null, is_active: true },
    { id: 'u_t1', email: 'teacher1@slotsync.local', password_hash: hash('teach12345678'), role: 'teacher', department_id: cse.id, teacher_id: 't_rao', batch_id: null, is_active: true },
    { id: 'u_s1', email: 'student1@slotsync.local', password_hash: hash('stud12345678'), role: 'student', department_id: cse.id, teacher_id: null, batch_id: 'b_cse_a', is_active: true },
  ];
  d.users.push(...users);
  cse.hod_user_id = 'u_hod';

  db.persist();
  db.addAudit({ actor_user_id: null, action: 'seed', target_type: 'db', target_id: null, after: { force } });
  return {
    seeded: true,
    counts: {
      departments: 2, teachers: 6, rooms: 6, subjects: 6, batches: 4,
      assignments: d.assignments.length, slots: d.time_slots.length, users: 4,
    },
  };
}

if (require.main === module) {
  const r = seedDatabase({ force: process.argv.includes('--force') });
  console.log(JSON.stringify(r));
}

module.exports = { seedDatabase };
