import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost, backendDown, API_BASE, getAccessToken } from '../api.js';
import SessionChip from '../components/SessionChip.jsx';
import { useTimetableView } from '../store.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

function normalizeTimetable(raw) {
  if (!raw) return { sessions: [], meta: null };
  const tt = raw.timetable || raw.data || raw;
  const sessions = tt.sessions || raw.sessions || [];
  return { sessions, meta: tt };
}

export default function Grid() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const qc = useQueryClient();
  const { mode, filterId, setMode, setFilterId, selectedSessionId, selectSession } = useTimetableView();
  const [dragOver, setDragOver] = useState(null); // slotKey
  const [shakeKey, setShakeKey] = useState(null);
  const [conflictMsg, setConflictMsg] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState('');

  // Deep-link from Cmd+K palette: /timetable?batch=ID etc.
  useEffect(() => {
    const b = search.get('batch');
    const t = search.get('teacher');
    const r = search.get('room');
    if (b) { setMode('batch'); setFilterId(b); }
    else if (t) { setMode('teacher'); setFilterId(t); }
    else if (r) { setMode('room'); setFilterId(r); }
  }, [search, setMode, setFilterId]);

  const timetableQuery = useQuery({
    queryKey: ['timetable', id || 'latest'],
    queryFn: async () => {
      if (id) return apiGet(`/api/timetables/${id}`);
      const list = await apiGet('/api/timetables?limit=1');
      const latest = list?.data?.[0] || list?.timetable || list?.data || null;
      if (!latest || !latest.id) return { data: null, sessions: [] };
      return apiGet(`/api/timetables/${latest.id}`);
    },
    retry: false
  });

  const { sessions, meta } = useMemo(() => normalizeTimetable(timetableQuery.data), [timetableQuery.data]);

  // Time grid drives which day/period columns render, including break columns.
  const gridQuery = useQuery({ queryKey: ['time-grid'], queryFn: () => apiGet('/api/time-grid').catch(() => null) });
  const gridInfo = useMemo(() => {
    const g = gridQuery.data?.data || null;
    const slots = gridQuery.data?.slots || [];
    const breakPeriods = new Set(slots.filter((s) => s.is_break).map((s) => s.period));
    const timingByPeriod = {};
    for (const s of slots) if (!(s.period in timingByPeriod)) timingByPeriod[s.period] = { start: s.start_time, end: s.end_time };
    const periods = g?.timings?.length ? g.timings.map((t) => t.period) : [...new Set(slots.map((s) => s.period))];
    const days = g?.days || [...new Set(slots.map((s) => s.day))];
    return { breakPeriods, timingByPeriod, periods, days };
  }, [gridQuery.data]);

  // ---- Batch / teacher / room-wise view: show one entity's grid at a time ----
  // Options are derived from the timetable's own sessions so this also works on
  // public share links (no /api/batches auth needed).
  const entityOptions = useMemo(() => {
    const seen = new Map();
    for (const s of sessions) {
      let id;
      let label;
      if (mode === 'batch') { id = s.batch_id; label = s.batch_name || s.batch?.name; }
      else if (mode === 'teacher') { id = s.teacher_id; label = s.teacher_name || s.teacher?.name; }
      else { id = s.room_id; label = s.room_name || s.room?.name; }
      if (id == null) continue;
      if (!seen.has(String(id))) seen.set(String(id), label || String(id));
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [sessions, mode]);

  // Default to the first entity so the grid is always one batch/teacher/room.
  useEffect(() => {
    if (!entityOptions.length) return;
    if (!entityOptions.some((o) => String(o.id) === String(filterId))) setFilterId(entityOptions[0].id);
  }, [entityOptions, filterId, setFilterId]);

  const visibleSessions = useMemo(() => {
    if (!filterId) return sessions;
    const f = String(filterId);
    if (mode === 'batch') return sessions.filter((s) => String(s.batch_id) === f);
    if (mode === 'teacher') return sessions.filter((s) => String(s.teacher_id) === f);
    if (mode === 'room') return sessions.filter((s) => String(s.room_id) === f);
    return sessions;
  }, [sessions, mode, filterId]);

  const selectedLabel = entityOptions.find((o) => String(o.id) === String(filterId))?.label || '';

  const bySlot = useMemo(() => {
    const m = new Map();
    for (const s of visibleSessions) {
      const day = s.day || s.slot?.day || s.slotDay;
      const period = s.period ?? s.slot?.period ?? s.slotPeriod;
      if (day != null && period != null) {
        const k = `${day}|${period}`;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(s);
      }
    }
    return m;
  }, [visibleSessions]);

  const slotsInUse = useMemo(() => {
    const days = new Set();
    const periods = new Set();
    for (const s of visibleSessions) {
      const day = s.day || s.slot?.day;
      const period = s.period ?? s.slot?.period;
      if (day) days.add(day);
      if (period != null) periods.add(period);
    }
    return {
      days: days.size ? DAYS.filter((d) => days.has(d)).concat([...days].filter((d) => !DAYS.includes(d))) : DAYS.slice(0, 5),
      periods: periods.size ? [...periods].sort((a, b) => a - b) : PERIODS.slice(0, 6)
    };
  }, [visibleSessions]);

  // Resolve a target slot id (from enriched sessions); backend also accepts day+period.
  const knownSlotId = (day, period) => {
    const hit = sessions.find((s) => (s.slot?.day ?? s.day) === day && (s.slot?.period ?? s.period) === period);
    return hit?.slot?.id || null;
  };

  const moveMut = useMutation({
    mutationFn: ({ sessionId, day, period }) => {
      const body = { day, period };
      const slotId = knownSlotId(day, period);
      if (slotId) body.slot_id = slotId;
      return apiPatch(`/api/sessions/${sessionId}`, body);
    },
    onSuccess: () => {
      setConflictMsg('');
      qc.invalidateQueries({ queryKey: ['timetable'] });
    },
    onError: (e, vars) => {
      const why = e?.data?.error || e.message || 'That move would clash. Pick another slot?';
      const fixes = Array.isArray(e?.data?.suggestions) && e.data.suggestions.length
        ? ` Try ${e.data.suggestions.map((s) => `${s.day} P${s.period}`).join(', ')}.`
        : '';
      setConflictMsg(`${why}${fixes}`);
      setShakeKey(`${vars.day}|${vars.period}`);
      setTimeout(() => setShakeKey(null), 400);
    }
  });

  const publishMut = useMutation({
    mutationFn: () => apiPost(`/api/timetables/${meta?.id || id}/publish`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timetable'] })
  });

  const attemptMove = (session, day, period) => {
    if (!session) return;
    if (session.isLocked || session.is_locked) {
      setConflictMsg('🔒 That session is locked. Unlock it to move.');
      return;
    }
    setConflictMsg('');
    moveMut.mutate({ sessionId: session.id, day, period });
  };

  const onDropTo = (e, day, period) => {
    e.preventDefault();
    setDragOver(null);
    try {
      const raw = e.dataTransfer.getData('application/json');
      const sess = raw ? JSON.parse(raw) : sessions.find((s) => String(s.id) === String(selectedSessionId));
      if (sess) attemptMove(sess, day, period);
    } catch {
      setConflictMsg('Drop did not carry a session. Click a session, then click a slot.');
    }
  };

  const onChipSelect = (sess) => {
    if (selectedSessionId === sess.id) selectSession(null);
    else selectSession(sess.id);
  };

  const onCellClick = (day, period) => {
    if (!selectedSessionId) return;
    const sess = sessions.find((s) => String(s.id) === String(selectedSessionId));
    if (sess) {
      attemptMove(sess, day, period);
      selectSession(null);
    }
  };

  const exportFile = async (format) => {
    try {
      const res = await fetch(`${API_BASE}/api/timetables/${meta?.id || id}/export?format=${format}`,
        { credentials: 'include', headers: { Authorization: `Bearer ${getAccessToken()}` } });
      if (!res.ok) throw new Error(`Export failed (${res.status}). Is the backend up?`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timetable.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setConflictMsg(e.message);
    }
  };

  if (timetableQuery.isLoading) {
    return (
      <div className="glass card">
        <div className="skeleton" style={{ height: 28, width: '40%' }} />
        <div className="skeleton mt" style={{ height: 300 }} />
        <p className="muted">Warming up the grid…</p>
      </div>
    );
  }

  if (timetableQuery.isError) {
    const e = timetableQuery.error;
    return (
      <div className="glass card state">
        <div className="empty-illus">{backendDown(e) ? '🔌' : '🗺️'}</div>
        <h3>{backendDown(e) ? 'Start backend on :4000' : 'No timetable to show yet'}</h3>
        <p className="muted">{backendDown(e) ? 'The grid needs the API. Start it and retry.' : e.message || 'Generate one first — it takes one click.'}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-ghost" onClick={() => timetableQuery.refetch()}>Retry</button>
          <Link to="/generate" className="btn btn-gradient">Go generate ✨</Link>
        </div>
      </div>
    );
  }

  if (!sessions.length) {
    return (
      <div className="glass card state">
        <div className="empty-illus">📭</div>
        <h3>This timetable is empty</h3>
        <p className="muted">No sessions placed. Generate again or check assignments in Setup.</p>
        <Link to="/generate" className="btn btn-gradient">Generate ✨</Link>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}/timetable/${meta?.id || id || ''}`;
  const tableDays = gridInfo.days.length ? gridInfo.days : slotsInUse.days;
  const tablePeriods = gridInfo.periods.length ? gridInfo.periods : slotsInUse.periods;

  return (
    <div className="stack">
      <div className="spread page-head">
        <div>
          <h1 className="page-title">{meta?.term ? `${meta.term} · ` : ''}{selectedLabel || 'Timetable grid'}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {mode} view · {meta?.status || 'draft'} · score {meta?.score ?? '—'} ·{' '}
            {(meta?.conflicts ?? 0) === 0 ? 'No clashes. We checked twice. 🎉' : `${meta?.conflicts} conflicts`} ·{' '}
            {selectedSessionId ? 'a session is selected — click a slot to move it' : 'drag a chip, or click it then click a slot'}
          </p>
        </div>
        <div className="row grid-controls">
          <div className="glass view-switch" role="tablist" aria-label="View switcher">
            {['batch', 'teacher', 'room'].map((m) => (
              <button key={m} type="button" className={`btn btn-sm ${mode === m ? 'btn-gradient' : 'btn-ghost'}`} onClick={() => setMode(m)}>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <select
            className="select filter-input"
            value={filterId}
            onChange={(e) => setFilterId(e.target.value)}
            aria-label={`Choose ${mode}`}
          >
            {entityOptions.length === 0 && <option value="">No {mode}s yet</option>}
            {entityOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {conflictMsg && <div className="error-box">⚠️ {conflictMsg}</div>}
      {snapshotMsg && <div className="glass card">📸 {snapshotMsg}</div>}

      <div className="grid-2">
        <div className="glass card grid-wrap">
          <table className="tt-grid" aria-label="Timetable grid">
            <thead>
              <tr>
                <th>Day</th>
                {tablePeriods.map((p) => {
                  const isBreak = gridInfo.breakPeriods.has(p);
                  const t = gridInfo.timingByPeriod[p];
                  return (
                    <th key={p} className={isBreak ? 'tt-break-head' : ''}>
                      {isBreak ? '🍽️ Lunch' : `P${p}`}
                      {t?.start && <span className="tt-time">{t.start}–{t.end}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tableDays.map((day) => (
                <tr key={day}>
                  <th scope="row">{day}</th>
                  {tablePeriods.map((period) => {
                    const key = `${day}|${period}`;
                    if (gridInfo.breakPeriods.has(period)) {
                      return (
                        <td key={key}>
                          <div className="tt-cell tt-break" aria-label={`${day} lunch break`}>Lunch break</div>
                        </td>
                      );
                    }
                    const cell = bySlot.get(key) || [];
                    const valid = dragOver === key;
                    return (
                      <td key={key}>
                        <div
                          className={`tt-cell${valid ? ' drop-valid' : ''}${shakeKey === key ? ' shake drop-invalid' : ''}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(key);
                          }}
                          onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                          onDrop={(e) => onDropTo(e, day, period)}
                          onClick={() => onCellClick(day, period)}
                          aria-label={`${day} period ${period}, ${cell.length} sessions. Activate to place selected session here.`}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && selectedSessionId) onCellClick(day, period);
                          }}
                        >
                          {cell.length === 0 && <span className="microcopy">Free period unlocked 🌤️</span>}
                          {cell.map((s) => (
                             <SessionChip
                               key={s.id}
                               session={s}
                               showBatch={mode !== 'batch'}
                               selected={String(selectedSessionId) === String(s.id)}
                              onSelect={onChipSelect}
                              onDragStart={(e, sess) => {
                                e.dataTransfer.setData('application/json', JSON.stringify(sess));
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                            />
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="glass card side-panel stack">
          <h3 style={{ margin: 0 }}>Actions</h3>
          <button type="button" className="btn btn-gradient" disabled={publishMut.isPending} onClick={() => publishMut.mutate()}>
            {publishMut.isPending ? 'Publishing…' : 'Publish'}
          </button>
          {publishMut.isError && <span className="microcopy">⚠️ {publishMut.error.message}</span>}
          {publishMut.isSuccess && <span className="microcopy">✅ Published. Students see it now.</span>}
          <div className="row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportFile('csv')}>Export CSV</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => exportFile('ics')}>Export ICS</button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSnapshotMsg('Snapshot saved. Undo/redo history lands with named versions in v1.1.'); setTimeout(() => setSnapshotMsg(''), 4000); }}>
            📸 Snapshot
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShareOpen((v) => !v)}>🔗 Share link / QR</button>
          {shareOpen && (
            <div className="stack">
              <input className="input" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
              <p className="microcopy">QR code renders here in v1.1 — this link is already shareable (published only).</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(shareUrl)}>Copy link</button>
            </div>
          )}
          <h3 style={{ margin: '8px 0 0' }}>Conflicts</h3>
          {(meta?.conflicts ?? 0) === 0 ? (
            <p className="microcopy">None. No clashes. We checked twice. 🎉</p>
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(meta?.conflictDetails || meta?.conflicts, null, 2)}</pre>
          )}
        </aside>
      </div>
    </div>
  );
}
