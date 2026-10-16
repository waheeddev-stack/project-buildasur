// AI stubs (POST rules/parse, explain, ask; GET status).
// AI never writes timetable data. Off by default (AI_ENABLED=false).
const express = require('express');
const { aiEnabled, off } = require('../ai');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.post('/rules/parse', (req, res) => {
  if (!aiEnabled()) return res.json(off({ suggestion: null }));
  const text = (req.body && req.body.text) || '';
  res.json({ aiEnabled: true, suggestion: { type: 'unavailable', text }, message: 'Preview and confirm — AI never applies rules by itself.' });
});

router.post('/explain', (req, res) => {
  if (!aiEnabled()) {
    const r = (req.body && req.body.report) || 'No report provided.';
    return res.json(off({ plainWords: typeof r === 'string' ? r : JSON.stringify(r) }));
  }
  res.json({ aiEnabled: true, plainWords: 'stub explanation', fixes: [] });
});

router.post('/ask', (req, res) => {
  if (!aiEnabled()) return res.json(off({ answer: 'AI is off. Use the timetable grid and free-room finder instead.' }));
  res.json({ aiEnabled: true, answer: 'stub answer (read-only query would run here)', rows: [] });
});

router.get('/status', (req, res) => {
  res.json({ aiEnabled: aiEnabled(), provider: aiEnabled() ? 'stub' : 'off', message: aiEnabled() ? 'AI stubs active.' : 'AI is off; the app works fully without it.' });
});

module.exports = router;
