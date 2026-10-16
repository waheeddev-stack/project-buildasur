import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, backendDown } from '../api.js';

const ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function todayName() {
  const js = new Date().getDay(); // 0 Sun
  return ORDER[(js + 6) % 7]; // map to Mon-first
}

export default function Today() {
  const [day, setDay] = useState(todayName());
  const [who, setWho] = useState(''); // batch id or teacher id free text

  const tt = useQuery({
    queryKey: ['today-timetable'],
    queryFn: () => apiGet('/api/timetables?limit=1').then((d) => d?.data?.[0] || d?.timetable || d),
    retry: false
  });

  const sessions = useMemo(() => {
    const raw = tt.data;
    const list = raw?.sessions || raw?.data?.sessions || [];
    return Array.isArray(list) ? list : [];
  }, [tt.data]);

  const daySessions = useMemo(
    () =>
      sessions
        .filter((s) => (s.day || s.slot?.day) === day)
        .filter((s) => (!who ? true : String(s.batchId || s.batch_id || s.teacherId || s.teacher_id || '').toLowerCase().includes(who.toLowerCase()) || String(s.batchName || s.teacherName || '').toLowerCase().includes(who.toLowerCase())))
        .sort((a, b) => (a.period ?? a.slot?.period ?? 0) - (b.period ?? b.slot?.period ?? 0)),
    [sessions, day, who]
  );

  const next = daySessions[0];

  const shiftDay = (dir) => {
    const i = ORDER.indexOf(day);
    setDay(ORDER[(i + dir + ORDER.length) % ORDER.length]);
  };

  return (
    <div className="stack" style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ margin: '4px 0' }}>Today</h1>
      <p className="muted" style={{ margin: 0 }}>Your classes, minus the 2009 ERP energy.</p>

      <div className="row">
        <input className="input" placeholder="Batch or teacher (optional)…" value={who} onChange={(e) => setWho(e.target.value)} />
      </div>

      {tt.isLoading && (
        <div className="glass card"><div className="skeleton" style={{ height: 120 }} /><p className="muted">Finding your classes…</p></div>
      )}

      {tt.isError && (
        <div className="glass card state">
          <div className="empty-illus">{backendDown(tt.error) ? '🔌' : '📭'}</div>
          <h3>{backendDown(tt.error) ? 'Start backend on :4000' : 'Nothing published yet'}</h3>
          <p className="muted">{backendDown(tt.error) ? 'Today view needs the API.' : 'Ask your admin to publish a timetable first.'}</p>
          <button className="btn btn-ghost" onClick={() => tt.refetch()}>Retry</button>
        </div>
      )}

      {tt.isSuccess && (
        <>
          {next ? (
            <div className="glass card">
              <div className="microcopy">NEXT UP · {day}</div>
              <h2 style={{ margin: '4px 0' }}>{next.subjectName || next.subject?.name || 'Class'}</h2>
              <p className="muted" style={{ margin: 0 }}>
                {[next.roomName || next.room?.name, next.teacherName || next.teacher?.name].filter(Boolean).join(' · ') || 'Room + teacher TBA'}
                {' · '}Period {next.period ?? next.slot?.period ?? '?'}
              </p>
              <p className="microcopy">Countdown lands with push in v1.1 — for now, you are early. Probably. ⏳</p>
            </div>
          ) : (
            <div className="glass card state">
              <div className="empty-illus">🌤️</div>
              <h3>Free day unlocked</h3>
              <p className="muted">No classes {day}{who ? ` matching “${who}”` : ''}. Touch grass.</p>
            </div>
          )}

          <div className="spread">
            <button className="btn btn-ghost btn-sm" onClick={() => shiftDay(-1)}>← Prev</button>
            <strong>{day}</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => shiftDay(1)}>Next →</button>
          </div>

          <div className="stack" style={{ touchAction: 'pan-y' }} onTouchStart={(e) => (e.currentTarget.dataset.x = e.touches[0].clientX)} onTouchEnd={(e) => {
            const x0 = Number(e.currentTarget.dataset.x || 0);
            const dx = e.changedTouches[0].clientX - x0;
            if (Math.abs(dx) > 48) shiftDay(dx < 0 ? 1 : -1);
          }}>
            {daySessions.slice(1).map((s) => (
              <div key={s.id} className="glass card" style={{ padding: 16 }}>
                <div className="microcopy">P{s.period ?? s.slot?.period ?? '?'} · {s.roomName || s.room?.name || 'TBA'}</div>
                <strong>{s.subjectName || s.subject?.name || 'Class'}</strong>
                <div className="microcopy">{s.teacherName || s.teacher?.name || ''}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
