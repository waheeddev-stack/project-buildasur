// AI assistant endpoints. The assistant only reads data and suggests — it never
// writes timetable data.
//
// Every endpoint prefers the hosted provider (OpenRouter / Google AI Studio / NVIDIA) when
// a key is configured and falls back to the on-device engine otherwise, so the app
// works with no keys and gets sharper when a key is added.
const express = require('express');
const engine = require('../ai');
const llm = require('../llm');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const LANGUAGES = {
  auto: 'the same language as the user',
  english: 'English', hindi: 'Hindi', telugu: 'Telugu', tamil: 'Tamil', bengali: 'Bengali',
  marathi: 'Marathi', kannada: 'Kannada', malayalam: 'Malayalam', urdu: 'Urdu',
  spanish: 'Spanish', french: 'French', german: 'German', arabic: 'Arabic',
  japanese: 'Japanese', chinese: 'Chinese', russian: 'Russian', portuguese: 'Portuguese',
};

function systemPrompt(language) {
  const lang = LANGUAGES[String(language || 'auto').toLowerCase()] || LANGUAGES.auto;
  return [
    'You are "Bulba" 🌱, the friendly timetable assistant inside SlotSync — a clash-free college timetable app.',
    'Rules:',
    `- Reply in ${lang}. Match whatever language the user writes in, including transliteration.`,
    '- You are READ-ONLY. Never claim to change data. To make changes, point the user to Setup, Generate or the Grid.',
    '- Be concise, warm and a little playful. Prefer short paragraphs or bullets.',
    '- Use the DATA block below. If something is missing, say so and suggest the next step.',
    '- Period 5 is the 13:00–14:00 lunch break; sessions never fall in it.',
    '',
    'DATA:',
    engine.dataDigest(),
  ].join('\n');
}

function normalizeMessages(body) {
  let messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages) {
    const q = (body && body.question) || '';
    messages = q ? [{ role: 'user', content: q }] : [];
  }
  return messages
    .filter((m) => m && m.role && m.content)
    .slice(-12)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user', content: String(m.content).slice(0, 4000) }));
}

// Pull the first JSON object out of a model reply (handles ```json fences).
function parseJson(text) {
  if (!text) return null;
  const s = String(text).replace(/```json/gi, '```').replace(/```/g, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b === -1 || b < a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}

// A1 — plain English -> structured availability suggestion (admin previews/confirms).
router.post('/rules/parse', async (req, res) => {
  const text = (req.body && req.body.text) || '';
  const local = engine.parseRule(text, req.user);
  try {
    const out = await llm.chat([
      {
        role: 'system',
        content: [
          'You convert a plain-English teacher availability rule into STRICT JSON.',
          'Return ONLY JSON with this shape:',
          '{"type":"unavailable","teacher_name":"","slots":[{"day":"Mon","period":1}],"summary":"","confidence":0.0}',
          'Days are Mon..Sat. Periods are 1..7 (period 5 is lunch). If a teacher is unknown, use an empty teacher_name.',
          `Known teachers: ${engine.dataDigest().split('\n').find((l) => l.startsWith('Teachers:')) || ''}`,
        ].join('\n'),
      },
      { role: 'user', content: text },
    ], { temperature: 0, maxTokens: 400 });
    const parsed = parseJson(out.content);
    if (parsed && Array.isArray(parsed.slots)) {
      const teacher = parsed.teacher_name ? engine.parseRule(parsed.teacher_name, req.user) : null;
      return res.json({
        engine: 'hosted', provider: out.provider, model: out.model,
        suggestion: Object.assign({ requiresConfirmation: true, note: 'Preview and confirm — AI never applies rules by itself.' }, parsed, {
          teacher_id: (teacher && teacher.teacher_id) || null,
        }),
      });
    }
  } catch (e) { /* fall through to local */ }
  res.json({ aiEnabled: engine.aiEnabled(), engine: 'local', suggestion: local, note: llm.providerStatus().ready ? 'Hosted provider unavailable — used the on-device parser.' : undefined });
});

// A2 / A5 — explain an infeasibility report, or write change notes for a diff.
router.post('/explain', async (req, res) => {
  const body = req.body || {};
  const isDiff = body.before && body.after;
  const localReport = isDiff ? engine.changeNotes(body.before, body.after) : engine.explainReport(body.report != null ? body.report : body);
  try {
    const userPayload = isDiff
      ? `Summarise what changed between these two session lists as friendly JSON. before=${JSON.stringify(body.before).slice(0, 1500)} after=${JSON.stringify(body.after).slice(0, 1500)}`
      : `Explain this solver report in plain words and give the top fixes as JSON. report=${JSON.stringify(body.report != null ? body.report : body).slice(0, 2000)}`;
    const out = await llm.chat([
      {
        role: 'system',
        content: 'You explain timetable-solver results to a non-technical college admin. Reply with STRICT JSON: {"headline":"","plainWords":"","fixes":["",""]}. No prose outside JSON.',
      },
      { role: 'user', content: userPayload },
    ], { temperature: 0.2, maxTokens: 500 });
    const parsed = parseJson(out.content);
    if (parsed && (parsed.plainWords || parsed.headline)) {
      return res.json(Object.assign({ engine: 'hosted', provider: out.provider, model: out.model }, parsed, { fixes: parsed.fixes || [] }));
    }
  } catch (e) { /* fall through to local */ }
  res.json(Object.assign({ aiEnabled: engine.aiEnabled(), engine: 'local' }, localReport, { note: llm.providerStatus().ready ? 'Hosted provider unavailable — used the on-device explainer.' : undefined }));
});

// A4 — on-device natural-language Q&A (no keys needed).
router.post('/ask', (req, res) => {
  const question = (req.body && req.body.question) || '';
  res.json(Object.assign({ aiEnabled: engine.aiEnabled(), engine: 'local', provider: 'local' }, engine.ask(question)));
});

// Multilingual chatbot — hosted provider when configured, on-device otherwise.
router.post('/chat', async (req, res) => {
  const body = req.body || {};
  const language = body.language || 'auto';
  const messages = normalizeMessages(body);
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  try {
    const out = await llm.chat(
      [{ role: 'system', content: systemPrompt(language) }, ...messages.filter((m) => m.role !== 'system')],
      { temperature: body.temperature, maxTokens: body.maxTokens }
    );
    return res.json({
      provider: out.provider,
      providerLabel: out.providerLabel,
      model: out.model,
      tried: out.tried,
      fellBack: out.fellBack,
      note: out.fellBack ? `Replied via ${out.providerLabel} (fallback).` : undefined,
      language,
      answer: out.content,
    });
  } catch (e) {
    const local = engine.ask(lastUser ? lastUser.content : '');
    const note = e.code === 'NO_PROVIDER'
      ? 'No hosted provider configured — using the on-device assistant. Add a key in backend/.env for multilingual chat.'
      : `Provider unavailable (${e.message}). Using the on-device assistant.`;
    return res.json({ provider: 'local', providerLabel: 'On-device', model: null, language, fallback: true, answer: local.answer, rows: local.rows || [], note });
  }
});

router.get('/status', (req, res) => {
  const p = llm.providerStatus();
  res.json(Object.assign({
    aiEnabled: engine.aiEnabled(),
    engine: p.ready ? 'hosted' : 'local',
    multilingual: true,
    languages: Object.keys(LANGUAGES),
    features: ['chat', 'rules/parse', 'explain', 'ask', 'change-notes'],
  }, p));
});

module.exports = router;
