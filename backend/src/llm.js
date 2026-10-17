// Multi-provider LLM client with automatic fallback.
//
// Speaks the OpenAI-compatible /chat/completions protocol, which a self-hosted
// local server, OpenRouter, Google AI Studio (Gemini) and NVIDIA NIM all expose.
// Providers are tried in order; if one errors, times out or is rate-limited we
// roll to the next.
//
//   AI_PROVIDER       = local | openrouter | google | nvidia   (primary; default local)
//   AI_FALLBACK_ORDER = comma list, e.g. "local,openrouter,google,nvidia"  (optional override)
//   AI_API_KEY        = <key>   (or provider-specific: OPENROUTER_API_KEY /
//                                GEMINI_API_KEY / NVIDIA_API_KEY)
//   AI_MODEL          = <model> (primary only; per-provider: AI_MODEL_OPENROUTER, AI_MODEL_GOOGLE, …)
//   LOCAL_AI_BASE_URL = <self-hosted endpoint>  (enables `local`) — a bare Cloudflare
//                       Tunnel link works too, e.g. https://foo.trycloudflare.com
//                       ("/v1" is appended for you; a pasted path is kept as-is)
//   LOCAL_AI_MODEL    = <model id served by your VM>  (default "local-model")
//   CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET = optional Cloudflare Access service token
//   AI_BASE_URL       = <override> (primary only)
//
// Nothing here is required: callers fall back to the on-device engine when no
// provider is configured. Keys are never logged or returned to clients.

const PROVIDERS = {
  local: {
    // Self-hosted OpenAI-compatible server on your VM (Ollama / vLLM / llama.cpp /
    // LM Studio / text-generation-webui …). Paste the base URL into
    // LOCAL_AI_BASE_URL (include the /v1 suffix for OpenAI-compatible servers).
    // No API key needed by default; set LOCAL_AI_API_KEY if your server expects one.
    label: 'Local (VM)',
    base: '',
    baseEnv: ['LOCAL_AI_BASE_URL', 'AI_LOCAL_BASE_URL'],
    model: 'local-model',
    modelEnv: 'LOCAL_AI_MODEL',
    keyEnv: ['LOCAL_AI_API_KEY', 'AI_LOCAL_API_KEY'],
    noKey: true,
    // Works through a Cloudflare Tunnel out of the box. If the tunnel is behind
    // Cloudflare Access (Zero Trust), set CF_ACCESS_CLIENT_ID / _SECRET and they
    // are added as service-token headers automatically.
    headers: () => {
      const h = {};
      if (process.env.CF_ACCESS_CLIENT_ID) h['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
      if (process.env.CF_ACCESS_CLIENT_SECRET) h['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
      return h;
    },
  },
  openrouter: {
    // OpenRouter is primary. Default to a free Poolside Laguna model; any
    // OpenRouter model id works (e.g. "openrouter/auto", "meta-llama/…:free").
    label: 'OpenRouter',
    base: 'https://openrouter.ai/api/v1',
    model: 'poolside/laguna-xs-2.1:free',
    keyEnv: ['AI_API_KEY', 'OPENROUTER_API_KEY'],
    headers: () => ({
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:5173',
      'X-Title': 'SlotSync',
    }),
  },
  google: {
    // Google AI Studio — OpenAI-compatible shim. Keys from aistudio.google.com/apikey
    label: 'Google AI Studio',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.8-flash',
    keyEnv: ['AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY'],
  },
  nvidia: {
    label: 'NVIDIA NIM',
    base: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.3-70b-instruct',
    keyEnv: ['AI_API_KEY', 'NVIDIA_API_KEY'],
  },
};

// Default preference: self-hosted local VM first, then OpenRouter / Google / NVIDIA.
// `local` only joins the chain once LOCAL_AI_BASE_URL is set, so it is a no-op until then.
const DEFAULT_ORDER = ['local', 'openrouter', 'google', 'nvidia'];

function keyFor(name) {
  for (const env of PROVIDERS[name].keyEnv) {
    if (process.env[env]) return process.env[env];
  }
  return '';
}

// Accepts a bare tunnel link (e.g. "https://foo.trycloudflare.com") and turns it
// into a usable OpenAI-compatible base: strips trailing slashes, drops a pasted
// "/chat/completions" suffix, and appends "/v1" when no path was given.
function normalizeBase(raw) {
  let b = String(raw || '').trim().replace(/\/+$/, '');
  if (!b) return '';
  b = b.replace(/\/chat\/completions$/, '');
  if (/^https?:\/\/[^/]+$/i.test(b)) b += '/v1';
  return b;
}

function configFor(name, isPrimary) {
  const p = PROVIDERS[name];
  const apiKey = process.env.AI_API_KEY || keyFor(name);
  const envModel = p.modelEnv ? process.env[p.modelEnv] : '';
  const model = process.env[`AI_MODEL_${name.toUpperCase()}`] || envModel || (isPrimary && process.env.AI_MODEL) || p.model;
  const envBase = (p.baseEnv || []).map((n) => process.env[n]).find(Boolean);
  const base = normalizeBase(envBase || (isPrimary && process.env.AI_BASE_URL) || p.base);
  const ready = !!(base && model && (apiKey || p.noKey));
  return { provider: name, label: p.label, apiKey, base, model, ready };
}

function orderedNames() {
  const explicit = String(process.env.AI_PROVIDER || '').toLowerCase().trim();
  const order = [];
  if (explicit && PROVIDERS[explicit]) order.push(explicit);
  String(process.env.AI_FALLBACK_ORDER || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .forEach((n) => { if (PROVIDERS[n] && !order.includes(n)) order.push(n); });
  DEFAULT_ORDER.forEach((n) => { if (!order.includes(n)) order.push(n); });
  return order;
}

// Ordered list of providers that actually have a key configured (the fallback chain).
function chain() {
  return orderedNames()
    .map((name, i) => configFor(name, i === 0))
    .filter((c) => c.ready);
}

// Back-compat: the primary (first ready) config, or null.
function resolveConfig() {
  return chain()[0] || null;
}

// Safe public view — never exposes keys.
function providerStatus() {
  const ch = chain();
  const primary = ch[0] || null;
  return {
    ready: ch.length > 0,
    provider: primary ? primary.provider : null,
    providerLabel: primary ? primary.label : null,
    model: primary ? primary.model : null,
    available: ch.map((c) => ({ provider: c.provider, label: c.label, model: c.model })),
    chain: ch.map((c) => c.label),
    fallback: 'on-device',
    hint: ch.length
      ? null
      : 'Set LOCAL_AI_BASE_URL (self-hosted), OPENROUTER_API_KEY, GEMINI_API_KEY or NVIDIA_API_KEY in backend/.env to enable the hosted chatbot. The on-device assistant stays available.',
  };
}

async function callProvider(c, messages, opts) {
  const timeoutMs = Number(opts.timeoutMs || 30000);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const extra = PROVIDERS[c.provider].headers ? PROVIDERS[c.provider].headers() : {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extra);
  if (c.apiKey) headers.Authorization = `Bearer ${c.apiKey}`;
  try {
    const res = await fetch(`${c.base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: c.model,
        messages,
        temperature: opts.temperature == null ? 0.4 : opts.temperature,
        max_tokens: opts.maxTokens || 800,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const err = new Error(`Provider ${res.status}: ${txt.slice(0, 240) || res.statusText}`);
      err.code = 'PROVIDER_ERROR';
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!content) {
      const err = new Error('Provider returned an empty completion.');
      err.code = 'EMPTY';
      throw err;
    }
    return { content: String(content).trim(), provider: c.provider, providerLabel: c.label, model: c.model, usage: json.usage || null };
  } finally {
    clearTimeout(timer);
  }
}

// Try each ready provider in order; return the first success. If all fail, throw.
async function chat(messages, opts = {}) {
  const ch = chain();
  if (!ch.length) {
    const err = new Error('No AI provider configured.');
    err.code = 'NO_PROVIDER';
    throw err;
  }
  const errors = [];
  for (let i = 0; i < ch.length; i += 1) {
    const c = ch[i];
    try {
      const out = await callProvider(c, messages, opts);
      return Object.assign(out, {
        attempts: i + 1,
        tried: ch.slice(0, i + 1).map((x) => x.provider),
        fellBack: i > 0,
      });
    } catch (e) {
      errors.push(`${c.provider}: ${e.message}`);
    }
  }
  const err = new Error(`All providers failed — ${errors.join(' | ')}`);
  err.code = 'ALL_FAILED';
  err.errors = errors;
  throw err;
}

module.exports = { resolveConfig, providerStatus, chat, chain, PROVIDERS };
