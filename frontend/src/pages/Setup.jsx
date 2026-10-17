import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, backendDown } from '../api.js';

const STEPS = ['Time Grid', 'Teachers', 'Rooms', 'Subjects + Batches', 'Assignments'];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Setup() {
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const qc = useQueryClient();

  const teachers = useQuery({ queryKey: ['teachers'], queryFn: () => apiGet('/api/teachers') });
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => apiGet('/api/rooms') });
  const subjects = useQuery({ queryKey: ['subjects'], queryFn: () => apiGet('/api/subjects') });
  const batches = useQuery({ queryKey: ['batches'], queryFn: () => apiGet('/api/batches') });
  const grid = useQuery({ queryKey: ['time-grid'], queryFn: () => apiGet('/api/time-grid').catch(() => null) });

  const down = [teachers, rooms].some((q) => q.error && backendDown(q.error));

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['teachers'] });
    qc.invalidateQueries({ queryKey: ['rooms'] });
    qc.invalidateQueries({ queryKey: ['subjects'] });
    qc.invalidateQueries({ queryKey: ['batches'] });
  };

  const save = (endpoint, invalidateKey) =>
    useMutation({
      mutationFn: (body) => apiPost(endpoint, body),
      onSuccess: () => {
        setMsg('Saved. Nice.');
        setErr('');
        qc.invalidateQueries({ queryKey: [invalidateKey] });
      },
      onError: (e) => {
        setErr(backendDown(e) ? 'Start backend on :4000 — could not save.' : e.message);
        setMsg('');
      }
    });

  // Hooks must stay unconditional — create one mutation per entity.
  const teacherMut = save('/api/teachers', 'teachers');
  const roomMut = save('/api/rooms', 'rooms');
  const subjectMut = save('/api/subjects', 'subjects');
  const batchMut = save('/api/batches', 'batches');
  const assignMut = save('/api/assignments', 'assignments');
  const gridMut = useMutation({
    mutationFn: (body) => apiPost('/api/time-grid', body).catch(() => apiPost('/api/time-grid', body)),
    onSuccess: () => {
      setMsg('Time grid saved.');
      setErr('');
      qc.invalidateQueries({ queryKey: ['time-grid'] });
    },
    onError: (e) => setErr(backendDown(e) ? 'Start backend on :4000 — could not save.' : e.message)
  });
  void invalidateAll;

  const [gridForm, setGridForm] = useState({ days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], periodsPerDay: 8 });
  const [teacherForm, setTeacherForm] = useState({ name: '', department: '', maxHoursDay: 6, maxHoursWeek: 24 });
  const [roomForm, setRoomForm] = useState({ name: '', capacity: 60, type: 'lecture' });
  const [subjectForm, setSubjectForm] = useState({ code: '', name: '', type: 'theory', sessionsPerWeek: 3, periodsPerSession: 1 });
  const [batchForm, setBatchForm] = useState({ program: '', semester: 1, division: 'A', strength: 60 });
  const [assignForm, setAssignForm] = useState({ subjectId: '', batchId: '', teacherId: '', requiredRoomType: 'lecture' });

  const list = (q) => {
    if (!q.data) return [];
    if (Array.isArray(q.data)) return q.data;
    return q.data.data || q.data.items || [];
  };

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

  return (
    <div className="stack">
      <h1 className="page-title">Setup wizard</h1>
      <p className="muted" style={{ margin: 0 }}>Five tiny steps. Future-you says thanks.</p>

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
          {grid.data?.data ? <p className="microcopy wrap-anywhere">Current grid: {JSON.stringify(grid.data.data).slice(0, 160)}</p> : <p className="microcopy">No grid saved yet — pick days + periods and save.</p>}
          <div><button type="button" className="btn btn-gradient" disabled={gridMut.isPending} onClick={() => gridMut.mutate({ days: gridForm.days, periodsPerDay: gridForm.periodsPerDay, periods: gridForm.periodsPerDay })}>Save time grid</button></div>
        </div>
      )}

      {step === 1 && (
        <div className="glass card stack">
          <h3>Teachers ({list(teachers).length})</h3>
          <div className="form-grid">
            <label className="field"><span className="lbl">Name</span><input className="input" value={teacherForm.name} onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })} placeholder="Dr. Rao" /></label>
            <label className="field"><span className="lbl">Department</span><input className="input" value={teacherForm.department} onChange={(e) => setTeacherForm({ ...teacherForm, department: e.target.value })} placeholder="CSE" /></label>
            <label className="field"><span className="lbl">Max hrs / day</span><input className="input" type="number" value={teacherForm.maxHoursDay} onChange={(e) => setTeacherForm({ ...teacherForm, maxHoursDay: Number(e.target.value), max_hours_day: Number(e.target.value) })} /></label>
            <label className="field"><span className="lbl">Max hrs / week</span><input className="input" type="number" value={teacherForm.maxHoursWeek} onChange={(e) => setTeacherForm({ ...teacherForm, maxHoursWeek: Number(e.target.value), max_hours_week: Number(e.target.value) })} /></label>
          </div>
          <div><button type="button" className="btn btn-gradient" disabled={teacherMut.isPending || !teacherForm.name} onClick={() => teacherMut.mutate({ ...teacherForm, max_hours_day: teacherForm.maxHoursDay, max_hours_week: teacherForm.maxHoursWeek })}>Add teacher</button></div>
          {teachers.isLoading ? <div className="skeleton" style={{ height: 60 }} /> : list(teachers).length === 0 ? <p className="muted">No teachers yet — add your first one above.</p> : (
            <ul>{list(teachers).slice(0, 8).map((t) => <li key={t.id}>{t.name} {t.department ? `· ${t.department}` : ''}</li>)}</ul>
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
          <div><button type="button" className="btn btn-gradient" disabled={roomMut.isPending || !roomForm.name} onClick={() => roomMut.mutate(roomForm)}>Add room</button></div>
          {rooms.isLoading ? <div className="skeleton" style={{ height: 60 }} /> : list(rooms).length === 0 ? <p className="muted">No rooms yet — labs count too.</p> : (
            <ul>{list(rooms).slice(0, 8).map((r) => <li key={r.id}>{r.name} · {r.type} · {r.capacity}</li>)}</ul>
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
              <label className="field"><span className="lbl">Sessions / week</span><input className="input" type="number" value={subjectForm.sessionsPerWeek} onChange={(e) => setSubjectForm({ ...subjectForm, sessionsPerWeek: Number(e.target.value), sessions_per_week: Number(e.target.value) })} /></label>
            </div>
            <div><button type="button" className="btn btn-gradient" disabled={subjectMut.isPending || !subjectForm.name} onClick={() => subjectMut.mutate({ ...subjectForm, sessions_per_week: subjectForm.sessionsPerWeek, periods_per_session: subjectForm.periodsPerSession })}>Add subject</button></div>
          </div>
          <div className="glass card stack">
            <h3>Batches ({list(batches).length})</h3>
            <div className="form-grid">
              <label className="field"><span className="lbl">Program</span><input className="input" value={batchForm.program} onChange={(e) => setBatchForm({ ...batchForm, program: e.target.value })} placeholder="CSE" /></label>
              <label className="field"><span className="lbl">Semester</span><input className="input" type="number" value={batchForm.semester} onChange={(e) => setBatchForm({ ...batchForm, semester: Number(e.target.value) })} /></label>
              <label className="field"><span className="lbl">Division</span><input className="input" value={batchForm.division} onChange={(e) => setBatchForm({ ...batchForm, division: e.target.value })} /></label>
              <label className="field"><span className="lbl">Strength</span><input className="input" type="number" value={batchForm.strength} onChange={(e) => setBatchForm({ ...batchForm, strength: Number(e.target.value) })} /></label>
            </div>
            <div><button type="button" className="btn btn-gradient" disabled={batchMut.isPending || !batchForm.program} onClick={() => batchMut.mutate(batchForm)}>Add batch</button></div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="glass card stack">
          <h3>Assignments — who teaches what to whom</h3>
          <div className="form-grid">
            <label className="field"><span className="lbl">Subject ID</span><input className="input" value={assignForm.subjectId} onChange={(e) => setAssignForm({ ...assignForm, subjectId: e.target.value, subject_id: e.target.value })} placeholder={list(subjects)[0]?.id || 'subject id'} /></label>
            <label className="field"><span className="lbl">Batch ID</span><input className="input" value={assignForm.batchId} onChange={(e) => setAssignForm({ ...assignForm, batchId: e.target.value, batch_id: e.target.value })} placeholder={list(batches)[0]?.id || 'batch id'} /></label>
            <label className="field"><span className="lbl">Teacher ID</span><input className="input" value={assignForm.teacherId} onChange={(e) => setAssignForm({ ...assignForm, teacherId: e.target.value, teacher_id: e.target.value })} placeholder={list(teachers)[0]?.id || 'teacher id'} /></label>
            <label className="field"><span className="lbl">Room type</span>
              <select className="select" value={assignForm.requiredRoomType} onChange={(e) => setAssignForm({ ...assignForm, requiredRoomType: e.target.value, required_room_type: e.target.value })}>
                <option value="lecture">Lecture</option>
                <option value="lab">Lab</option>
                <option value="seminar">Seminar</option>
              </select>
            </label>
          </div>
          <div><button type="button" className="btn btn-gradient" disabled={assignMut.isPending} onClick={() => assignMut.mutate({ subject_id: assignForm.subjectId, batch_id: assignForm.batchId, teacher_id: assignForm.teacherId, required_room_type: assignForm.requiredRoomType })}>Link assignment</button></div>
          <p className="microcopy">Tip: IDs are shown in the lists above. CSV bulk import lands in v1.1 — flat inputs for now, on purpose.</p>
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
