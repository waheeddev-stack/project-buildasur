import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Setup from './pages/Setup.jsx';
import Generate from './pages/Generate.jsx';
import Grid from './pages/Grid.jsx';
import Today from './pages/Today.jsx';
import { useAuth } from './store.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000
    }
  }
});

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch() {
    /* global boundary — never blank screen */
  }
  render() {
    if (this.state.error) {
      return (
        <div className="container" style={{ paddingTop: 48 }}>
          <div className="glass card state">
            <div className="empty-illus">🧊</div>
            <h3>Something melted down.</h3>
            <p className="muted">{String(this.state.error?.message || this.state.error)}</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn btn-gradient" onClick={() => this.setState({ error: null })}>
                Try that again
              </button>
              <a className="btn btn-ghost" href="/" onClick={(e) => { e.preventDefault(); window.location.assign('/'); }}>
                Go home
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

function RequireAuth({ children }) {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.accessToken);
  const location = useLocation();
  if (!user && !token) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function RedirectIfAuthed({ children }) {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.accessToken);
  if (user || token) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <ErrorBoundary>
          <Routes>
            <Route
              path="/login"
              element={
                <RedirectIfAuthed>
                  <Login />
                </RedirectIfAuthed>
              }
            />
            <Route element={<Layout />}>
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/setup"
                element={
                  <RequireAuth>
                    <Setup />
                  </RequireAuth>
                }
              />
              <Route
                path="/generate"
                element={
                  <RequireAuth>
                    <Generate />
                  </RequireAuth>
                }
              />
              <Route path="/timetable/:id?" element={<Grid />} />
              <Route path="/today" element={<Today />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
