import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { apiGet, apiPost, backendDown } from '../api.js';

const CHECKS = [
  'Teachers free in every slot',
  'Rooms free in every slot',
  'Batches free in every slot',
  'Availability respected',
  'Room capacity + type fit',
  'All weekly sessions placed'
];

export default function Generate() {
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [term, setTerm] = useState('Fall 2026');

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    let timer;
    const poll = async () => {
      try {
        const data = await apiGet(`/api/jobs/${jobId}`);
        if (stop) return;
        setJob(data?.job || data);
        const status = data?.job?.status || data?.status;
        if (status === 'completed' || status === 'failed') return; // done polling
        timer = setTimeout(poll, 1500);
      } catch (e) {
        if (stop) return;
        setError(backendDown(e) ? 'Start backend on :4000 — lost the job feed.' : e.message);
        timer = setTimeout(poll, 3000);
      }
    };
    poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  const start = async () => {
    setError('');
    setJob(null);
    setStarting(true);
    try {
      const data = await apiPost('/api/timetables/generate', { term });
      const id = data.jobId || data.job?.id || data.id;
      if (!id) throw new Error('Backend did not return a jobId. Check the generate endpoint.');
      setJobId(id);
    } catch (e) {
      setError(backendDown(e) ? 'Start backend on :4000 — cannot generate yet.' : e.message);
    } finally {
      setStarting(false);
    }
  };

  const status = job?.status || (jobId ? 'running' : 'idle');
  const progress = Math.max(0, Math.min(100, job?.progress ?? (jobId ? 8 : 0)));
  const doneCount = Math.round((progress / 100) * CHECKS.length);
  const conflicts = job?.conflicts ?? job?.result?.conflicts ?? null;
  const score = job?.score ?? job?.result?.score ?? null;
  const timetableId = job?.timetableId || job?.result?.timetableId || job?.timetable?.id || null;
  const zeroClash = status === 'completed' && (conflicts === 0 || conflicts == null);

  return (
    <div className="stack">
      <h1 style={{ margin: '4px 0' }}>Generate</h1>
      <p className="muted" style={{ margin: 0 }}>One big button. Zero hard conflicts, or a report that tells you exactly why.</p>

      <div className="glass card state">
        <label className="field" style={{ maxWidth: 320, margin: '0 auto', textAlign: 'left' }}>
          <span className="lbl">Term</span>
          <input className="input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Fall 2026" />
        </label>
        <div className="mt">
          <motion.button
            className="btn btn-gradient"
            style={{ fontSize: 18, padding: '14px 36px' }}
            onClick={start}
            disabled={starting}
            whileTap={{ scale: 0.97 }}
          >
            {starting ? 'Warming up the solver…' : jobId ? '✨ Regenerate' : '✨ Generate timetable'}
          </motion.button>
        </div>
        {error && <div className="error-box mt" style={{ textAlign: 'left' }}>⚠️ {error}</div>}
      </div>

      {jobId && (
        <div className="glass card">
          <div className="spread">
            <strong>Status: {status}</strong>
            <span className="muted">job {jobId}</span>
          </div>
          <div className="progress-line mt"><div style={{ width: `${progress}%` }} /></div>
          <ul className="check">
            {CHECKS.map((c, i) => (
              <li key={c}>
                <span>{i < doneCount || status === 'completed' ? '✅' : status === 'failed' ? '⛔' : '⏳'}</span>
                <span className={i < doneCount || status === 'completed' ? '' : 'muted'}>{c}</span>
              </li>
            ))}
          </ul>
          {status === 'completed' && (
            <div>
              {zeroClash && <div className="confetti-burst" aria-hidden="true">🎉 ✨ 🎊 ✨ 🎉</div>}
              <p>
                {zeroClash ? <strong>No clashes. We checked twice. 🎉</strong> : <strong>{conflicts} conflicts need a look.</strong>}
                {score != null && <span className="muted"> Soft score: {score}.</span>}
              </p>
              {timetableId ? (
                <Link to={`/timetable/${timetableId}`} className="btn btn-gradient" style={{ textDecoration: 'none' }}>
                  Open the grid →
                </Link>
              ) : (
                <p className="microcopy">Solver finished but gave no timetable id — check the job payload below.</p>
              )}
              {job?.infeasibility && (
                <div className="error-box mt" style={{ textAlign: 'left' }}>
                  <strong>What blocks a solution:</strong>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(job.infeasibility, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
          {status === 'failed' && (
            <div className="error-box">Generation failed: {job?.error || job?.message || 'unknown error'}. Fix the inputs and try again?</div>
          )}
        </div>
      )}
    </div>
  );
}
