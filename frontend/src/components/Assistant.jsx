import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost, backendDown } from '../api.js';
import { IconClose, IconRefresh, IconSend } from './Icons.jsx';

const LANGS = [
  { value: 'auto', label: 'Auto' },
  { value: 'english', label: 'English' },
  { value: 'hindi', label: 'हिन्दी' },
  { value: 'telugu', label: 'తెలుగు' },
  { value: 'tamil', label: 'தமிழ்' },
  { value: 'bengali', label: 'বাংলা' },
  { value: 'marathi', label: 'मराठी' },
  { value: 'spanish', label: 'Español' },
  { value: 'french', label: 'Français' },
  { value: 'german', label: 'Deutsch' },
  { value: 'arabic', label: 'العربية' },
  { value: 'japanese', label: '日本語' },
  { value: 'chinese', label: '中文' }
];

const QUICK = [
  'Free rooms on Tue period 3',
  'When is DBMS for CSE A?',
  'Who is the busiest teacher?',
  'Explain the lunch break rule'
];

const GREETING = { role: 'assistant', text: 'Hi! I’m Bulba 🌱 — ask me anything about rooms, teachers, subjects or batches, in any language.' };
const STORE_KEY = 'slotsync-chat-v1';
const AVATAR = '/bulbasaur.jpeg';

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p.messages) && p.messages.length) return p;
    }
  } catch {
    /* ignore */
  }
  return { messages: [GREETING], language: 'auto' };
}

export default function Assistant() {
  const initial = useRef(loadState());
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [language, setLanguage] = useState(initial.current.language);
  const [messages, setMessages] = useState(initial.current.messages);
  const logRef = useRef(null);

  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => apiGet('/api/ai/status').catch(() => null) });
  const info = status.data || {};
  const hosted = info.ready;

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ messages, language })); } catch { /* ignore */ }
  }, [messages, language]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, open, busy]);

  const send = async (question) => {
    const text = (question ?? q).trim();
    if (!text || busy) return;
    const next = [...messages, { role: 'user', text }];
    setMessages(next);
    setQ('');
    setBusy(true);
    try {
      const res = await apiPost('/api/ai/chat', {
        language,
        messages: next.filter((m) => m.text).map((m) => ({ role: m.role, content: m.text }))
      });
      setMessages((m) => [...m, { role: 'assistant', text: res.answer || 'No answer.', rows: res.rows || [], note: res.note }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: backendDown(e) ? 'Start the backend on :4000 and I can look that up.' : `Sorry — ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => setMessages([GREETING]);

  return (
    <>
      <button
        type="button"
        className="assistant-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close assistant' : 'Open AI assistant'}
        title="Chat with Bulba"
      >
        {open ? (
          <span className="fab-close"><IconClose size={20} /></span>
        ) : (
          <>
            <span className="fab-avatar"><img src={AVATAR} alt="" /></span>
            <span className="fab-label">Ask Bulba</span>
          </>
        )}
      </button>

      {open && (
        <section className="glass assistant-panel" role="dialog" aria-label="Bulba AI assistant">
          <header className="assistant-head">
            <span className="assistant-avatar"><img src={AVATAR} alt="" /></span>
            <div className="assistant-head-txt">
              <strong>Bulba</strong>
              <span className="assistant-status">
                <i className="dot-online" />
                {hosted ? (info.providerLabel || info.provider || 'hosted') : 'on-device'}
              </span>
            </div>
            <div className="assistant-head-actions">
              <select
                className="assistant-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="Reply language"
                title="Reply language"
              >
                {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <button type="button" className="icon-btn" onClick={reset} title="New chat" aria-label="Start a new chat">
                <IconRefresh size={16} />
              </button>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} title="Close" aria-label="Close assistant">
                <IconClose size={16} />
              </button>
            </div>
          </header>

          <div className="assistant-log" ref={logRef}>
            {messages.map((m, i) => (
              <div key={i} className={`assistant-turn ${m.role === 'user' ? 'me' : 'ai'}`}>
                {m.role !== 'user' && (
                  <span className="bubble-avatar"><img src={AVATAR} alt="" /></span>
                )}
                <div className={`assistant-msg ${m.role === 'user' ? 'me' : 'ai'}`}>
                  <p className="assistant-text">{m.text}</p>
                  {Array.isArray(m.rows) && m.rows.length > 0 && (
                    <div className="assistant-rows">
                      {m.rows.slice(0, 6).map((r, j) => (
                        <span key={j} className="assistant-row">{Object.values(r).filter(Boolean).join(' · ')}</span>
                      ))}
                    </div>
                  )}
                  {m.note && <p className="assistant-note">{m.note}</p>}
                </div>
              </div>
            ))}
            {busy && (
              <div className="assistant-turn ai">
                <span className="bubble-avatar"><img src={AVATAR} alt="" /></span>
                <div className="assistant-msg ai assistant-typing" aria-label="Bulba is typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>

          {messages.length <= 1 && (
            <div className="assistant-quick">
              {QUICK.map((s) => (
                <button key={s} type="button" className="assistant-chip" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}

          <form className="assistant-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              className="input"
              placeholder="Ask in any language…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Ask the assistant"
              autoComplete="off"
            />
            <button type="submit" className="assistant-send" disabled={busy || !q.trim()} aria-label="Send">
              <IconSend size={18} />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
