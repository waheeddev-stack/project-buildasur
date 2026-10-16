// Central fetch wrapper: JWT accessToken + credentials + auto refresh on 401.
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

const TOKEN_KEY = 'slotsync_access_token';

export function getAccessToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setAccessToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

export function backendDown(err) {
  return err && (err.backendDown === true || err.code === 'BACKEND_DOWN');
}

async function rawFetch(path, options = {}) {
  const token = getAccessToken();
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm && typeof body !== 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    body = JSON.stringify(body);
  }
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers,
      body,
      credentials: 'include'
    });
  } catch (e) {
    const err = new Error('Start backend on :4000 — could not reach the API.');
    err.backendDown = true;
    err.cause = e;
    throw err;
  }
  return res;
}

async function parseBody(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// api(path, { method, body, headers }) — throws Error with .status/.data on HTTP errors.
export async function api(path, options = {}, retry = true) {
  const res = await rawFetch(path, options);
  if (res.status === 401 && retry && !path.startsWith('/api/auth/')) {
    // Try rotating the refresh token (httpOnly cookie), then retry once.
    try {
      const r = await rawFetch('/api/auth/refresh', { method: 'POST' });
      if (r.ok) {
        const data = await parseBody(r);
        if (data && data.accessToken) setAccessToken(data.accessToken);
        return api(path, options, false);
      }
    } catch {
      /* refresh failed — fall through to 401 error */
    }
  }
  if (!res.ok) {
    const data = await parseBody(res);
    const msg =
      (data && (data.message || data.error)) ||
      `Request failed (${res.status}). ${res.status === 401 ? 'Please log in again.' : 'Try again in a bit?'}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return parseBody(res);
}

export const apiGet = (path, opts) => api(path, { ...(opts || {}), method: 'GET' });
export const apiPost = (path, body, opts) => api(path, { ...(opts || {}), method: 'POST', body });
export const apiPatch = (path, body, opts) => api(path, { ...(opts || {}), method: 'PATCH', body });
export const apiPut = (path, body, opts) => api(path, { ...(opts || {}), method: 'PUT', body });
export const apiDelete = (path, opts) => api(path, { ...(opts || {}), method: 'DELETE' });

export { BASE as API_BASE };
