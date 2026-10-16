import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet, backendDown } from '../api.js';
import StatTile from '../components/StatTile.jsx';

const countOf = (v) => {
  if (Array.isArray(v)) return v.length;
  if (v && Array.isArray(v.data)) return v.data.length;
  if (typeof v?.total === 'number') return v.total;
  if (typeof v?.count === 'number') return v.count;
  return null;
};

export default function Dashboard() {
  const teachers = useQuery({ queryKey: ['teachers-count'], queryFn: () => apiGet('/api/teachers') });
  const rooms = useQuery({ queryKey: ['rooms-count'], queryFn: () => apiGet('/api/rooms') });
  const batches = useQuery({ queryKey: ['batches-count'], queryFn: () => apiGet('/api/batches') });
  const latest = useQuery({
    queryKey: ['latest-timetable'],
    queryFn: () => apiGet('/api/timetables?limit=1').catch(() => apiGet('/api/timetables/latest').catch(() => null))
  });

  const down = [teachers, rooms, batches].some((q) => q.error && backendDown(q.error));
  const anyError = [teachers, rooms, batches].some((q) => q.isError);

  const latestId = latest.data?.id || latest.data?.data?.[0]?.id || latest.data?.timetable?.id || null;
  const latestMeta = latest.data?.data?.[0] || latest.data?.timetable || latest.data || null;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1 style={{ margin: '4px 0', fontSize: 32, letterSpacing: '-0.02em' }}>Good morning, scheduler ☕</h1>
          <p className="muted" style={{ margin: 0 }}>
            Three numbers, one button. No clashes. We checked twice.
          </p>
        </div>
        <Link to="/generate" className="btn btn-gradient" style={{ textDecoration: 'none' }}>
          ✨ Generate timetable
        </Link>
      </div>

      {down ? (
        <div className="glass card state">
          <div className="empty-illus">🔌</div>
          <h3>Backend is napping</h3>
          <p className="muted">Start backend on :4000 and refresh. The UI is ready when it is.</p>
          <button className="btn btn-gradient" onClick={() => window.location.reload()}>
            Retry connection
          </button>
        </div>
      ) : (
        <>
          <div className="tiles">
            <StatTile label="Teachers" value={teachers.isError ? '—' : countOf(teachers.data)} hint="across departments" loading={teachers.isLoading} />
            <StatTile label="Rooms" value={rooms.isError ? '—' : countOf(rooms.data)} hint="labs + halls" loading={rooms.isLoading} />
            <StatTile label="Batches" value={batches.isError ? '—' : countOf(batches.data)} hint="and sub-batches" loading={batches.isLoading} />
          </div>
          {anyError && !down && (
            <div className="error-box">Some stats failed to load — the rest still works. Check the backend logs.</div>
          )}
        </>
      )}

      <div className="glass card">
        <div className="spread">
          <div>
            <h3>Last timetable</h3>
            {latest.isLoading ? (
              <div className="skeleton" style={{ width: 220, height: 20 }} />
            ) : latestId ? (
              <p className="muted" style={{ margin: 0 }}>
                {latestMeta?.term || 'Term'} · {latestMeta?.status || 'draft'} · score {latestMeta?.score ?? '—'} ·{' '}
                {latestMeta?.conflicts === 0 ? '0 conflicts 🎉' : `${latestMeta?.conflicts ?? '?'} conflicts`}
              </p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                Nothing generated yet. Hit Setup, add your people and rooms, then Generate.
              </p>
            )}
          </div>
          <div className="row">
            {latestId ? (
              <Link to={`/timetable/${latestId}`} className="btn btn-ghost">
                Open grid
              </Link>
            ) : (
              <Link to="/setup" className="btn btn-ghost" style={{ textDecoration: 'none' }}>
                Start setup →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
