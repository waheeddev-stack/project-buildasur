import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiPost, setAccessToken } from '../api.js';
import { useAuth } from '../store.js';

// Landing page per role. Accounts are provisioned by an admin or HOD; the server
// authenticates the email + password and returns the role, which decides where we go.
function landingFor(role) {
  if (role === 'teacher' || role === 'student') return '/today';
  return '/';
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || null;
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await apiPost('/api/auth/login', { email: email.trim(), password });
      const accessToken = data.accessToken || data.token || '';
      const user = data.user || { email, name: email.split('@')[0] };
      setAccessToken(accessToken);
      login(user, accessToken);
      navigate(from || landingFor(user.role), { replace: true });
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
              <input className="input" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" />
            </label>
            <label className="field">
              <span className="lbl">Password</span>
              <input className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
            </label>
            {error && <div className="error-box">{error}</div>}
            <button className="btn btn-gradient" disabled={busy} type="submit">
              {busy ? 'Logging you in…' : 'Log in'}
            </button>
          </form>
          <p className="microcopy mt">
            Use the email and password your admin or HOD set up for you. Your role is detected automatically.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
