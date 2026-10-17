import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut, apiDelete, backendDown } from '../api.js';
import { useAuth } from '../store.js';

const STEPS = ['Time Grid', 'Teachers', 'Rooms', 'Subjects + Batches', 'Assignments', 'Accounts'];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FALLBACK_PERIODS = [1, 2, 3, 4, 5, 6];
const LUNCH_PERIOD = 5; // 13:00-14:00 on every working day

// Hourly slots from 09:00, with a fixed 1-2 PM lunch break at period 5.
function buildTimings(n) {
  const hours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
  return Array.from({ length: n }, (_, i) => ({ period: i + 1, start: hours[i] || '', end: hours[i + 1] || '' }));
}

const emptyTeacher = { name: '', department: '', maxHoursDay: 6, maxHoursWeek: 24 };
const emptyRoom = { name: '', capacity: 60, type: 'lecture' };
const emptySubject = { code: '', name: '', type: 'theory', sessionsPerWeek: 3, periodsPerSession: 1 };
const emptyBatch = { program: '', semester: 1, division: 'A', strength: 60 };
const emptyAccount = { name: '', email: '', password: '', role: 'student', teacher_id: '', batch_id: '' };

export default function Setup() {
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const canWrite = me?.role === 'admin' || me?.role === 'hod';

  const teachers = useQuery({ queryKey: ['teachers'], queryFn: () => apiGet('/api/teachers') });
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => apiGet('/api/rooms') });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => apiGet('/api/subjects') });
  const batches = useQuery({ queryKey: ['batches'], queryFn: () => apiGet('/api/batches') });
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => apiGet('/api/departments') });
  const grid = useQuery({ queryKey: ['time-grid'], queryFn: () => apiGet('/api/time-grid').catch(() => null) });
  const availability = useQuery({ queryKey: ['availability'], queryFn: () => apiGet('/api/availability') });
  const users = useQuery({ queryKey: ['users'], queryFn: () => apiGet('/api/users'), enabled: canWrite });

  const down = [teachers, rooms].some((q) => q.error && backendDown(q.error));

  // Generic save/delete hook factory — called unconditionally so hook order is stable.
  const useSave = (fn, keys) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        setMsg('Saved. Nice.');
        setErr('');
        keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      },
      onError: (e) => {
        setErr(backendDown(e) ? 'Start backend on :4000 — could not save.' : e.message);
        setMsg('');
      }
    });

  // Time grid
  const gridMut = useSave((body) => apiPut('/api/time-grid', body), ['time-grid']);

  // Teachers
  const teacherCreate = useSave((b) => apiPost('/api/teachers', b), ['teachers']);
  const teacherUpdate = useSave(({ id, b }) => apiPut(`/api/teachers/${id}`, b), ['teachers']);
  const teacherDelete = useSave((id) => apiDelete(`/api/teachers/${id}`), ['teachers']);

  // Rooms
  const roomCreate = useSave((b) => apiPost('/api/rooms', b), ['rooms']);

  // Subjects + batches + assignments
  const subjectCreate = useSave((b) => apiPost('/api/subjects', b), ['subjects']);
  const batchCreate = useSave((b) => apiPost('/api/batches', b), ['batches']);
  const assignCreate = useSave((b) => apiPost('/api/assignments', b), ['assignments']);

  // Accounts (teacher + student logins)
  const userCreate = useSave((b) => apiPost('/api/users', b), ['users']);
  const userUpdate = useSave(({ id, b }) => apiPut(`/api/users/${id}`, b), ['users']);
  const userDelete = useSave((id) => apiDelete(`/api/users/${id}`), ['users']);

  const availMut = useMutation({
    mutationFn: ({ id, slots }) => apiPut(`/api/teachers/${id}/availability`, { slots }),
    onSuccess: () => {
      setMsg('Availability saved.');
      setErr('');
      setAvailFor(null);
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
    onError: (e) => setErr(backendDown(e) ? 'Start backend on :4000 — could not save.' : e.message)
  });

  // Time grid form
  const [gridForm, setGridForm] = useState({ days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], periodsPerDay: 7 });
  const [teacherForm, setTeacherForm] = useState(emptyTeacher);
  const [teacherEditId, setTeacherEditId] = useState(null);
  const [roomForm, setRoomForm] = useState(emptyRoom);
  const [subjectForm, setSubjectForm] = useState(emptySubject);
  const [batchForm, setBatchForm] = useState(emptyBatch);
  const [assignForm, setAssignForm] = useState({ subjectId: '', batchId: '', teacherId: '', requiredRoomType: 'lecture' });
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [accountEditId, setAccountEditId] = useState(null);
  const [availFor, setAvailFor] = useState(null);
  const [availSelection, setAvailSelection] = useState(() => new Set());

  const list = (q) => {
    if (!q.data) return [];
    if (Array.isArray(q.data)) return q.data;
    return q.data.data || q.data.items || [];
  };

  const depName = (id) => list(departments).find((d) => d.id === id)?.name || id;

  const gridSlots = useMemo(() => (list(grid).length ? list(grid) : grid.data?.slots || []), [grid.data]);
  const availDays = useMemo(() => {
    const fromGrid = [...new Set(gridSlots.filter((s) => !s.is_break).map((s) => s.day))];
    return fromGrid.length ? fromGrid : DAYS;
  }, [gridSlots]);
  const availPeriods = useMemo(() => {
    const fromGrid = [...new Set(gridSlots.filter((s) => !s.is_break).map((s) => s.period))].sort((a, b) => a - b);
    return fromGrid.length ? fromGrid : FALLBACK_PERIODS;
  }, [gridSlots]);

  // ---- Teachers handlers ----
  const submitTeacher = () => {
    const body = {
      name: teacherForm.name,
      department_id: teacherForm.department || undefined,
      max_hours_day: teacherForm.maxHoursDay,
      max_hours_week: teacherForm.maxHoursWeek
    };
    if (teacherEditId) teacherUpdate.mutate({ id: teacherEditId, b: body });
    else teacherCreate.mutate(body);
    setTeacherForm(emptyTeacher);
    setTeacherEditId(null);
  };
  const editTeacher = (t) => {
    setTeacherEditId(t.id);
    setTeacherForm({ name: t.name || '', department: t.department_id || '', maxHoursDay: t.max_hours_day ?? 6, maxHoursWeek: t.max_hours_week ?? 24 });
  };
  const cancelTeacherEdit = () => { setTeacherEditId(null); setTeacherForm(emptyTeacher); };

  const openAvail = (t) => {
    setAvailFor(t.id);
    const existing = list(availability).filter((u) => u.teacher_id === t.id).map((u) => `${u.day}|${u.period}`);
    setAvailSelection(new Set(existing));
  };
  const toggleAvail = (day, period) => {
    const k = `${day}|${period}`;
    setAvailSelection((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };
  const saveAvail = () => {
    const slots = [...availSelection].map((k) => {
      const [day, period] = k.split('|');
      return { day, period: Number(period) };
    });
    availMut.mutate({ id: availFor, slots });
  };

  // ---- Accounts handlers ----
  const submitAccount = () => {
    const body = {
      name: accountForm.name || undefined,
      email: accountForm.email,
      role: accountForm.role,
      teacher_id: accountForm.role === 'teacher' ? accountForm.teacher_id || undefined : undefined,
      batch_id: accountForm.role === 'student' ? accountForm.batch_id || undefined : undefined
    };
    if (accountEditId) {
      if (accountForm.password) body.password = accountForm.password;
      userUpdate.mutate({ id: accountEditId, b: body });
    } else {
      body.password = accountForm.password;
      userCreate.mutate(body);
    }
    setAccountForm(emptyAccount);
    setAccountEditId(null);
  };
  const editAccount = (u) => {
    setAccountEditId(u.id);
    setAccountForm({ name: u.name || '', email: u.email || '', password: '', role: u.role === 'teacher' ? 'teacher' : 'student', teacher_id: u.teacher_id || '', batch_id: u.batch_id || '' });
  };
  const cancelAccountEdit = () => { setAccountEditId(null); setAccountForm(emptyAccount); };
  const toggleActive = (u) => userUpdate.mutate({ id: u.id, b: { is_active: u.is_active === false } });

  if (down) {
    return (
      <div className="glass card state">
        <div className="empty-illus">🔌</div>
        <h3>Start backend on :4000</h3>
        <p className="muted">Setup needs the API for teachers, rooms and the rest. The wizard will wait for you.</p>
        <button
          type="button"
          className="btn btn-gradient"
          onClick={() => {
            qc.invalidateQueries({ queryKey: ['teachers'] });
            qc.invalidateQueries({ queryKey: ['rooms'] });
            qc.invalidateQueries({ queryKey: ['subjects'] });
            qc.invalidateQueries({ queryKey: ['batches'] });
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const accountList = list(users);

  return (
    <div className="stack">
      <h1 className="page-title">Setup wizard</h1>
      <p className="muted" style={{ margin: 0 }}>Configure once. Everyone sees the same teachers, rooms and availability. Future-you says thanks.</p>

      <div className="progress-line" aria-label="Setup progress">
        <div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <div className="wizard-steps" role="tablist" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={i === step}
            className={`btn btn-sm ${i === step ? 'btn-gradient' : 'btn-ghost'}`}
            onClick={() => setStep(i)}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {msg && <div className="glass card" style={{ borderColor: 'rgba(52,211,153,0.4)' }}>✅ {msg}</div>}
      {err && <div className="error-box">⚠️ {err}</div>}
      {!canWrite && <div className="microcopy">You are signed in read-only. Ask an admin or HOD to make changes.</div>}

      {step === 0 && (
        <div className="glass card stack">
          <h3>Time grid</h3>
          <div className="row">
            {DAYS.map((d) => (
              <label key={d} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={gridForm.days.includes(d)}
                  onChange={() =>
                    setGridForm((f) => ({
                      ...f,
                      days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d]
                    }))
                  }
                />
                {d}
              </label>
            ))}
          </div>
          <div className="form-grid">
            <label className="field">
              <span className="lbl">Periods per day</span>
              <input className="input" type="number" min={1} max={12} value={gridForm.periodsPerDay}
                onChange={(e) => setGridForm((f) => ({ ...f, periodsPerDay: Number(e.target.value) }))} />
            </label>
          </div>
          {gridForm.periodsPerDay >= LUNCH_PERIOD && (
            <p className="microcopy" style={{ margin: 0 }}>🍽️ Period {LUNCH_PERIOD} (13:00–14:00) is reserved as a <strong>lunch break on every day</strong>.</p>
          )}
          {grid.data?.data ? <p className="microcopy wrap-anywhere">Current grid: {JSON.stringify(grid.data.data).slice(0, 160)}</p> : <p className="microcopy">No grid saved yet — pick days + periods and save.</p>}
          <div><button type="button" className="btn btn-gradient" disabled={gridMut.isPending || !canWrite} onClick={() => gridMut.mutate({ days: gridForm.days, periodsPerDay: gridForm.periodsPerDay, timings: buildTimings(gridForm.periodsPerDay), breaks: gridForm.periodsPerDay >= LUNCH_PERIOD ? [LUNCH_PERIOD] : [] })}>Save time grid</button></div>
        </div>
      )}

      {step === 1 && (
        <div className="glass card stack">
          <h3>Teachers ({list(teachers).length})</h3>
          <div className="form-grid">
            <label className="field"><span className="lbl">Name</span><input className="input" value={teacherForm.name} onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })} placeholder="Dr. Rao" /></label>
            <label className="field"><span className="lbl">Department</span>
              <select className="select" value={teacherForm.department} onChange={(e) => setTeacherForm({ ...teacherForm, department: e.target.value })}>
                <option value="">— none —</option>
                {list(departments).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="field"><span className="lbl">Max hrs / day</span><input className="input" type="number" value={teacherForm.maxHoursDay} onChange={(e) => setTeacherForm({ ...teacherForm, maxHoursDay: Number(e.target.value) })} /></label>
            <label className="field"><span className="lbl">Max hrs / week</span><input className="input" type="number" value={teacherForm.maxHoursWeek} onChange={(e) => setTeacherForm({ ...teacherForm, maxHoursWeek: Number(e.target.value) })} /></label>
          </div>
          <div className="row">
            <button type="button" className="btn btn-gradient" disabled={(teacherEditId ? teacherUpdate : teacherCreate).isPending || !teacherForm.name || !canWrite} onClick={submitTeacher}>
              {teacherEditId ? 'Save changes' : 'Add teacher'}
            </button>
            {teacherEditId && <button type="button" className="btn btn-ghost" onClick={cancelTeacherEdit}>Cancel</button>}
          </div>
          {teachers.isLoading ? <div className="skeleton" style={{ height: 60 }} /> : list(teachers).length === 0 ? <p className="muted">No teachers yet — add your first one above.</p> : (
            <div className="stack">
              {list(teachers).map((t) => (
                <div key={t.id} className="glass card list-row" style={{ padding: 12 }}>
                  <div>
                    <strong>{t.name}</strong>
                    <div className="microcopy">
                      {t.department_id ? depName(t.department_id) : 'no dept'} · {t.max_hours_day ?? '—'} hrs/day · {t.max_hours_week ?? '—'} hrs/week
                    </div>
                  </div>
                  <div className="row">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openAvail(t)}>Availability</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={!canWrite} onClick={() => editTeacher(t)}>Edit</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={!canWrite || teacherDelete.isPending} onClick={() => teacherDelete.mutate(t.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {availFor && (
            <div className="glass card stack" style={{ padding: 12 }}>
              <div className="spread">
                <strong>Availability — {list(teachers).find((t) => t.id === availFor)?.name || availFor}</strong>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAvailFor(null)}>Close</button>
              </div>
              <p className="microcopy" style={{ margin: 0 }}>Tick the slots the teacher is <strong>unavailable</strong>. Everyone sees the same list.</p>
              <div className="avail-grid">
                <div className="avail-row">
                  <span />
                  {availPeriods.map((p) => <span key={p} className="microcopy">P{p}</span>)}
                </div>
                {availDays.map((d) => (
                  <div key={d} className="avail-row">
                    <span className="microcopy">{d}</span>
                    {availPeriods.map((p) => (
                      <input
                        key={`${d}-${p}`}
                        type="checkbox"
                        aria-label={`${d} period ${p}`}
                        checked={availSelection.has(`${d}|${p}`)}
                        disabled={!canWrite}
                        onChange={() => toggleAvail(d, p)}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div><button type="button" className="btn btn-gradient" disabled={availMut.isPending || !canWrite} onClick={saveAvail}>Save availability</button></div>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="glass card stack">
          <h3>Rooms ({list(rooms).length})</h3>
          <div className="form-grid">
            <label className="field"><span className="lbl">Name</span><input className="input" value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} placeholder="Room 204" /></label>
            <label className="field"><span className="lbl">Capacity</span><input className="input" type="number" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: Number(e.target.value) })} /></label>
            <label className="field"><span className="lbl">Type</span>
              <select className="select" value={roomForm.type} onChange={(e) => setRoomForm({ ...roomForm, type: e.target.value })}>
                <option value="lecture">Lecture hall</option>
                <option value="lab">Lab</option>
                <option value="seminar">Seminar</option>
              </select>
            </label>
          </div>
          <div><button type="button" className="btn btn-gradient" disabled={roomCreate.isPending || !roomForm.name || !canWrite} onClick={() => roomCreate.mutate(roomForm)}>Add room</button></div>
          {rooms.isLoading ? <div className="skeleton" style={{ height: 60 }} /> : list(rooms).length === 0 ? <p className="muted">No rooms yet — labs count too.</p> : (
            <ul>{list(rooms).map((r) => <li key={r.id}>{r.name} · {r.type} · {r.capacity}</li>)}</ul>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <div className="glass card stack">
            <h3>Subjects ({list(subjects).length})</h3>
            <div className="form-grid">
              <label className="field"><span className="lbl">Code</span><input className="input" value={subjectForm.code} onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })} placeholder="CS301" /></label>
              <label className="field"><span className="lbl">Name</span><input className="input" value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} placeholder="DBMS" /></label>
              <label className="field"><span className="lbl">Type</span>
                <select className="select" value={subjectForm.type} onChange={(e) => setSubjectForm({ ...subjectForm, type: e.target.value })}>
                  <option value="theory">Theory</option>
                  <option value="lab">Lab</option>
                </select>
              </label>
              <label className="field"><span className="lbl">Sessions / week</span><input className="input" type="number" value={subjectForm.sessionsPerWeek} onChange={(e) => setSubjectForm({ ...subjectForm, sessionsPerWeek: Number(e.target.value) })} /></label>
            </div>
            <div><button type="button" className="btn btn-gradient" disabled={subjectCreate.isPending || !subjectForm.name || !canWrite} onClick={() => subjectCreate.mutate({ code: subjectForm.code, name: subjectForm.name, type: subjectForm.type, sessions_per_week: subjectForm.sessionsPerWeek, periods_per_session: subjectForm.periodsPerSession })}>Add subject</button></div>
          </div>
          <div className="glass card stack">
            <h3>Batches ({list(batches).length})</h3>
            <div className="form-grid">
              <label className="field"><span className="lbl">Program</span><input className="input" value={batchForm.program} onChange={(e) => setBatchForm({ ...batchForm, program: e.target.value })} placeholder="CSE" /></label>
              <label className="field"><span className="lbl">Semester</span><input className="input" type="number" value={batchForm.semester} onChange={(e) => setBatchForm({ ...batchForm, semester: Number(e.target.value) })} /></label>
              <label className="field"><span className="lbl">Division</span><input className="input" value={batchForm.division} onChange={(e) => setBatchForm({ ...batchForm, division: e.target.value })} /></label>
              <label className="field"><span className="lbl">Strength</span><input className="input" type="number" value={batchForm.strength} onChange={(e) => setBatchForm({ ...batchForm, strength: Number(e.target.value) })} /></label>
            </div>
            <div><button type="button" className="btn btn-gradient" disabled={batchCreate.isPending || !batchForm.program || !canWrite} onClick={() => batchCreate.mutate(batchForm)}>Add batch</button></div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="glass card stack">
          <h3>Assignments — who teaches what to whom</h3>
          <div className="form-grid">
            <label className="field"><span className="lbl">Subject</span>
              <select className="select" value={assignForm.subjectId} onChange={(e) => setAssignForm({ ...assignForm, subjectId: e.target.value })}>
                <option value="">— pick a subject —</option>
                {list(subjects).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
              </select>
            </label>
            <label className="field"><span className="lbl">Batch</span>
              <select className="select" value={assignForm.batchId} onChange={(e) => setAssignForm({ ...assignForm, batchId: e.target.value })}>
                <option value="">— pick a batch —</option>
                {list(batches).map((b) => <option key={b.id} value={b.id}>{b.program} Sem {b.semester} Div {b.division}</option>)}
              </select>
            </label>
            <label className="field"><span className="lbl">Teacher</span>
              <select className="select" value={assignForm.teacherId} onChange={(e) => setAssignForm({ ...assignForm, teacherId: e.target.value })}>
                <option value="">— pick a teacher —</option>
                {list(teachers).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="field"><span className="lbl">Room type</span>
              <select className="select" value={assignForm.requiredRoomType} onChange={(e) => setAssignForm({ ...assignForm, requiredRoomType: e.target.value })}>
                <option value="lecture">Lecture</option>
                <option value="lab">Lab</option>
                <option value="seminar">Seminar</option>
              </select>
            </label>
          </div>
          <div><button type="button" className="btn btn-gradient" disabled={assignCreate.isPending || !assignForm.subjectId || !assignForm.batchId || !assignForm.teacherId || !canWrite} onClick={() => assignCreate.mutate({ subject_id: assignForm.subjectId, batch_id: assignForm.batchId, teacher_id: assignForm.teacherId, required_room_type: assignForm.requiredRoomType })}>Link assignment</button></div>
          <p className="microcopy">Pick from the dropdowns — no need to copy IDs.</p>
        </div>
      )}

      {step === 5 && (
        <div className="glass card stack">
          <h3>Accounts ({accountList.length})</h3>
          <p className="microcopy" style={{ margin: 0 }}>Create and edit the logins teachers and students use. They sign in with just email + password; the role is set here.</p>
          {!canWrite ? <p className="muted">Only an admin or HOD can manage accounts.</p> : (
            <>
              <div className="form-grid">
                <label className="field"><span className="lbl">Name</span><input className="input" value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Dr. Rao / Student A1" /></label>
                <label className="field"><span className="lbl">Email</span><input className="input" type="email" value={accountForm.email} onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })} placeholder="person@college.edu" /></label>
                <label className="field"><span className="lbl">{accountEditId ? 'New password (optional)' : 'Password'}</span><input className="input" type="password" value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} placeholder="min 10 characters" /></label>
                <label className="field"><span className="lbl">Role</span>
                  <select className="select" value={accountForm.role} onChange={(e) => setAccountForm({ ...accountForm, role: e.target.value })}>
                    <option value="teacher">Teacher</option>
                    <option value="student">Student</option>
                  </select>
                </label>
                {accountForm.role === 'teacher' ? (
                  <label className="field"><span className="lbl">Link to teacher</span>
                    <select className="select" value={accountForm.teacher_id} onChange={(e) => setAccountForm({ ...accountForm, teacher_id: e.target.value })}>
                      <option value="">— optional —</option>
                      {list(teachers).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </label>
                ) : (
                  <label className="field"><span className="lbl">Batch</span>
                    <select className="select" value={accountForm.batch_id} onChange={(e) => setAccountForm({ ...accountForm, batch_id: e.target.value })}>
                      <option value="">— optional —</option>
                      {list(batches).map((b) => <option key={b.id} value={b.id}>{b.program} Sem {b.semester} Div {b.division}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <div className="row">
                <button type="button" className="btn btn-gradient" disabled={(accountEditId ? userUpdate : userCreate).isPending || !accountForm.email || (!accountEditId && accountForm.password.length < 10)} onClick={submitAccount}>
                  {accountEditId ? 'Save account' : 'Create account'}
                </button>
                {accountEditId && <button type="button" className="btn btn-ghost" onClick={cancelAccountEdit}>Cancel</button>}
              </div>
            </>
          )}
          {users.isLoading ? <div className="skeleton" style={{ height: 60 }} /> : accountList.length === 0 ? <p className="muted">No accounts yet.</p> : (
            <div className="stack">
              {accountList.filter((u) => u.role !== 'admin').map((u) => (
                <div key={u.id} className="glass card list-row" style={{ padding: 12 }}>
                  <div>
                    <strong>{u.name || u.email}</strong>
                    <div className="microcopy">
                      {u.email} · <span className={`badge badge-${u.role}`}>{u.role}</span> · {u.is_active === false ? 'inactive' : 'active'}
                      {u.teacher_id ? ` · ${u.teacher_id}` : ''}{u.batch_id ? ` · ${u.batch_id}` : ''}
                    </div>
                  </div>
                  <div className="row">
                    <button type="button" className="btn btn-ghost btn-sm" disabled={!canWrite} onClick={() => editAccount(u)}>Edit</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={!canWrite} onClick={() => toggleActive(u)}>{u.is_active === false ? 'Activate' : 'Deactivate'}</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={!canWrite || userDelete.isPending} onClick={() => userDelete.mutate(u.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="row wizard-nav">
        <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>← Back</button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn btn-gradient" onClick={() => setStep((s) => s + 1)}>Next →</button>
        ) : (
          <Link to="/generate" className="btn btn-gradient">Generate ✨</Link>
        )}
      </div>
    </div>
  );
}
