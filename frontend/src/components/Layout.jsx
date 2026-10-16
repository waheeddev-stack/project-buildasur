import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api.js';
import { useAuth, useTheme } from '../store.js';

function usePaletteData(enabled) {
  return useQuery({
    queryKey: ['palette'],
    enabled,
    queryFn: async () => {
      const [batches, teachers, rooms] = await Promise.all([
        apiGet('/api/batches').catch(() => []),
        apiGet('/api/teachers').catch(() => []),
        apiGet('/api/rooms').catch(() => [])
      ]);
      const norm = (arr) => (Array.isArray(arr) ? arr : arr?.data || arr?.items || []);
      return {
        batches: norm(batches),
        teachers: norm(teachers),
        rooms: norm(rooms)
      };
    }
  });
}

export default function Layout() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data } = usePaletteData(open);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = [
      ...(data?.batches || []).map((b) => ({
        kind: 'batch',
        id: b.id,
        label: b.name || `${b.program || ''} ${b.semester || ''} ${b.division || ''}`.trim() || `Batch ${b.id}`
      })),
      ...(data?.teachers || []).map((t) => ({ kind: 'teacher', id: t.id, label: t.name || `Teacher ${t.id}` })),
      ...(data?.rooms || []).map((r) => ({ kind: 'room', id: r.id, label: r.name || `Room ${r.id}` }))
    ];
    if (!needle) return all.slice(0, 12);
    return all.filter((r) => r.label.toLowerCase().includes(needle)).slice(0, 12);
  }, [data, q]);

  const go = (r) => {
    setOpen(false);
    setQ('');
    navigate(`/timetable?${r.kind}=${encodeURIComponent(r.id)}`);
  };

  return (
    <div className="app-shell">
      <div className="app-glow" aria-hidden="true" />
      <div className="container">
        <nav className="nav glass" aria-label="Primary">
          <NavLink to="/" className="nav-brand">
            Slot<span>Sync</span>
          </NavLink>
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
              Dashboard
            </NavLink>
            <NavLink to="/setup" className={({ isActive }) => (isActive ? 'active' : '')}>
              Setup
            </NavLink>
            <NavLink to="/generate" className={({ isActive }) => (isActive ? 'active' : '')}>
              Generate
            </NavLink>
            <NavLink to="/timetable" className={({ isActive }) => (isActive ? 'active' : '')}>
              Timetable
            </NavLink>
            <NavLink to="/today" className={({ isActive }) => (isActive ? 'active' : '')}>
              Today
            </NavLink>
          </div>
          <div className="nav-right">
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title="Jump to batch / teacher / room (Ctrl+K)">
              ⌘K
            </button>
            <button className="btn btn-ghost btn-sm" onClick={toggle} title="Toggle theme">
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
            {user ? (
              <>
                <span className="muted" style={{ fontSize: 13 }}>
                  {user.name || user.email}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                >
                  Logout
                </button>
              </>
            ) : (
              <button className="btn btn-gradient btn-sm" onClick={() => navigate('/login')}>
                Login
              </button>
            )}
          </div>
        </nav>
      </div>

      <main className="container">
        <Outlet />
      </main>

      {open && (
        <div className="palette-backdrop" onClick={() => setOpen(false)}>
          <div className="glass palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
            <input
              autoFocus
              className="input"
              placeholder="Jump to a batch, teacher or room…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results[0]) go(results[0]);
              }}
            />
            <div className="mt">
              {results.length === 0 && <p className="muted">No matches. Try another name — we believe in you.</p>}
              {results.map((r) => (
                <button key={`${r.kind}-${r.id}`} className="palette-item" onClick={() => go(r)}>
                  <span>{r.label}</span>
                  <span className="muted">{r.kind}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
