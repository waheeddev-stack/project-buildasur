import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api.js';
import { useAuth, useTheme } from '../store.js';
import Assistant from './Assistant.jsx';
import {
  BulbaLogo, IconHome, IconSliders, IconSparkles, IconCalendar, IconClock,
  IconSearch, IconMenu, IconClose, IconSun, IconMoon, IconLogout
} from './Icons.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: IconHome, end: true },
  { to: '/setup', label: 'Setup', icon: IconSliders },
  { to: '/generate', label: 'Generate', icon: IconSparkles },
  { to: '/timetable', label: 'Timetable', icon: IconCalendar },
  { to: '/today', label: 'Today', icon: IconClock }
];

const TICKER = [
  '🌱 gotta schedule ’em all',
  'no cap',
  'it’s super effective!',
  'we checked twice ✓',
  'a wild timetable appeared',
  'zero clashes, zero stress',
  'critical hit: 0 conflicts ⚡',
  'your timetable but it goes hard',
  'it’s giving organized ✨',
  'rooms locked, chai brewed ☕',
  'gym? lab? sorted.',
  'vibe check: passed ✅',
  'level up your sem 📈'
];

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
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data } = usePaletteData(open);

  // Close mobile menu on every navigation (fixes stuck-open drawer)
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

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

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate('/login', { replace: true });
  };

  const handleLogin = () => {
    setMenuOpen(false);
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <div className="app-scene" aria-hidden="true" />
      <div className="app-grain" aria-hidden="true" />
      <div className="app-glow" aria-hidden="true" />
      <div className="container">
        <nav className="nav glass" aria-label="Primary">
          <button
            type="button"
            className="btn btn-ghost btn-sm nav-menu-btn"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <IconClose size={18} /> : <IconMenu size={18} />}
          </button>
          <NavLink to="/" className="nav-brand" onClick={() => setMenuOpen(false)} aria-label="SlotSync home">
            <BulbaLogo size={30} />
          </NavLink>
          <div className="nav-links">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
          <div className="nav-right">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title="Jump to batch / teacher / room (Ctrl+K)">
              <IconSearch size={16} />
              <span className="theme-label">Ctrl K</span>
            </button>
            <button type="button" className="btn btn-ghost btn-sm theme-toggle" onClick={toggle} title="Toggle theme">
              {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
              <span className="theme-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            {user ? (
              <>
                <span className="muted nav-user" title={user.name || user.email}>
                  {user.name || user.email}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleLogout}
                >
                  <IconLogout size={16} />
                  <span className="theme-label">Logout</span>
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-gradient btn-sm" onClick={handleLogin}>
                Login
              </button>
            )}
          </div>
          {menuOpen && (
            <div className="nav-mobile-menu" role="menu" aria-label="Mobile navigation">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')} onClick={() => setMenuOpen(false)}>
                  <Icon size={18} />
                  <span>{label}</span>
                </NavLink>
              ))}
              {user ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
                  <IconLogout size={18} />
                  Logout ({user.name || user.email})
                </button>
              ) : (
                <button type="button" className="btn btn-gradient btn-sm" onClick={handleLogin}>
                  Login
                </button>
              )}
            </div>
          )}
        </nav>
        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i}>{i % 3 === 0 ? <b>{t}</b> : t}</span>
            ))}
          </div>
        </div>
      </div>

      <main className="container">
        <Outlet />
      </main>

      {user && <Assistant />}

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
                <button type="button" key={`${r.kind}-${r.id}`} className="palette-item" onClick={() => go(r)}>
                  <span>{r.label}</span>
                  <span className="muted">{r.kind}</span>
                </button>
              ))}
            </div>
            <div className="mt row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                Close (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
