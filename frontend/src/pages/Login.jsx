import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiPost, setAccessToken } from '../api.js';
import { useAuth } from '../store.js';

const DEMOS = [
  { label: 'Admin demo', email: 'admin@slotsync.demo', password: 'slotsync-admin-01' },
  { label: 'HOD demo', email: 'hod@slotsync.demo', password: 'slotsync-hod-01' },
  { label: 'Teacher demo', email: 'teacher@slotsync.demo', password: 'slotsync-teacher-01' }
];

export default function Login() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e, demo) => {
    if (e) e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const creds = demo ? { email: demo.email, password: demo.password } : { email, password };
      const data = await apiPost('/api/auth/login', creds);
      const accessToken = data.accessToken || data.token || '';
      setAccessToken(accessToken);
      login(data.user || { email: creds.email, name: creds.email.split('@')[0] }, accessToken);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.backendDown ? 'Start backend on :4000 — we could not reach the API.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="app-glow" aria-hidden="true" />
      <main className="container" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <motion.div
          className="glass card"
          style={{ width: 'min(420px, 94vw)' }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          <h2 style={{ fontSize: 28 }}>
            Slot<span style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Sync</span>
          </h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Clash-free timetables. No clashes. We checked twice.
          </p>
          <form onSubmit={submit} className="stack">
            <label className="field">
              <span className="lbl">Email</span>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" />
            </label>
            <label className="field">
              <span className="lbl">Password</span>
              <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
            </label>
            {error && <div className="error-box">{error}</div>}
            <button className="btn btn-gradient" disabled={busy} type="submit">
              {busy ? 'Logging you in…' : 'Log in'}
            </button>
          </form>
          <div className="mt">
            <p className="microcopy">Just looking around? One tap:</p>
            <div className="row">
              {DEMOS.map((d) => (
                <button key={d.label} className="btn btn-ghost btn-sm" disabled={busy} onClick={(e) => submit(e, d)}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <p className="microcopy mt">
            Student? Skip the login — <Link to="/today">see today's classes</Link>.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
