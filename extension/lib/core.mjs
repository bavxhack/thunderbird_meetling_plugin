export class ApiError extends Error {
  constructor(message, reason = '') { super(message); this.reason = reason; }
  get invalidToken() { return ['No user loged in', 'No user loged found', 'User not found', 'HTTP 401', 'HTTP 403'].includes(this.reason); }
}
export class JsonNumber { constructor(raw) { this.raw = raw; } }
// Preserve integer IDs without IEEE-754 rounding and reject ambiguous duplicate keys.
export function parseJson(text) {
  if (typeof text !== 'string' || !text.trim()) throw new ApiError('Meetling liefert eine leere Antwort.');
  if (text.trimStart().startsWith('<')) throw new ApiError('Meetling liefert HTML statt API-JSON. Anmeldung und Konfiguration prüfen.');
  let i = 0;
  const ws = () => { while (/[ \t\r\n]/.test(text[i] || '') && i < text.length) i++; };
  const fail = () => { throw new ApiError('Meetling liefert ungültiges oder mehrdeutiges JSON.'); };
  function str() {
    const start = i++;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i++] === '"') { try { return JSON.parse(text.slice(start, i)); } catch { fail(); } }
    }
    fail();
  }
  function value(depth = 0) {
    if (depth > 64) fail();
    ws(); const c = text[i];
    if (c === '"') return str();
    if (c === '{') {
      i++; ws(); const obj = Object.create(null);
      if (text[i] === '}') { i++; return obj; }
      while (true) {
        ws(); if (text[i] !== '"') fail(); const key = str(); ws();
        if (Object.hasOwn(obj, key) || text[i++] !== ':') fail();
        obj[key] = value(depth + 1); ws();
        const end = text[i++]; if (end === '}') return obj; if (end !== ',') fail();
      }
    }
    if (c === '[') {
      i++; ws(); const arr = []; if (text[i] === ']') { i++; return arr; }
      while (true) { arr.push(value(depth + 1)); ws(); const end = text[i++]; if (end === ']') return arr; if (end !== ',') fail(); }
    }
    for (const [word, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(word, i)) { i += word.length; return result; }
    }
    const match = text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) fail(); i += match[0].length; return new JsonNumber(match[0]);
  }
  const result = value(); ws(); if (i !== text.length) fail();
  if (result?.error === true) {
    const known = ['No user loged in', 'No user loged found', 'User not found', 'Server not found', 'Server not allowed for user'];
    const reason = typeof result.reason === 'string' ? result.reason : '';
    throw new ApiError(known.includes(reason) ? `Meetling: ${reason}` : 'Meetling meldet einen fachlichen Fehler.', reason);
  }
  return result;
}
export const defaults = Object.freeze({baseUrl:'', apiBasePath:'api/v1/outlook/plugin/', loginBasePath:'room/outlook/plugin/', timeoutSeconds:30,
  endpoints:{login:'outlooklogin', servers:'server', createConference:'createConference', logout:'logout'}});
export function normalizeBase(value) {
  let u; try { u = new URL(value.trim()); } catch { throw new Error('Eine HTTPS-Installationsadresse ist erforderlich.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || /[?#]/.test(value)) throw new Error('HTTPS-Adresse ohne Zugangsdaten, Query oder Fragment erforderlich.');
  return u.href.replace(/\/+$/, '') + '/';
}
export function relativePath(value) {
  if (typeof value !== 'string' || !value.trim() || /[\\:%?#\s]/.test(value) || value.startsWith('/') || value.split('/').some(p => p === '.' || p === '..')) throw new Error('Ungültiger relativer API-Pfad.');
  return value;
}
export function settings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ungültige Konfiguration.');
  const s = {...defaults, ...input, endpoints:{...defaults.endpoints, ...input.endpoints}};
  if (['room/outlook/plugin/', 'room/outlook/plugin'].includes(s.apiBasePath)) {
    s.apiBasePath = defaults.apiBasePath;
    if (s.loginBasePath === defaults.loginBasePath && s.endpoints.login === 'login') s.endpoints.login = 'outlooklogin';
  }
  s.baseUrl = normalizeBase(s.baseUrl);
  if (!Number.isInteger(s.timeoutSeconds) || s.timeoutSeconds < 1 || s.timeoutSeconds > 300) throw new Error('Timeout muss zwischen 1 und 300 Sekunden liegen.');
  relativePath(s.apiBasePath); relativePath(s.loginBasePath);
  for (const k of Object.keys(defaults.endpoints)) relativePath(s.endpoints[k]);
  return s;
}
export function endpoint(s, action) {
  const prefix = action === 'login' ? s.loginBasePath : s.apiBasePath;
  return s.baseUrl + relativePath(prefix).replace(/\/$/, '') + '/' + relativePath(s.endpoints[action]);
}
export function exactLogin(expected, actual) {
  try { const u = new URL(actual); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && !/[?#]/.test(actual) && u.href === expected; } catch { return false; }
}
export function validateToken(token) {
  if (typeof token !== 'string' || !token.trim() || /[\x00-\x1f\x7f-\x9f]/.test(token)) throw new ApiError('Ungültiges Anmeldetoken.');
  return token;
}
const object = v => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof JsonNumber);
function required(o, key) { if (!object(o) || typeof o[key] !== 'string' || !o[key].trim()) throw new ApiError('Pflichtfeld fehlt oder ist ungültig.'); return o[key]; }
export function parseLogin(text) { const o = parseJson(text); return {token:validateToken(required(o,'token')), name:required(o,'name')}; }
export function parseServers(text) {
  const data = parseJson(text); if (!Array.isArray(data)) throw new ApiError('Ungültiges Serverlisten-Schema.');
  const seen = new Set();
  return data.map(o => {
    if (!object(o) || !(o.id instanceof JsonNumber) || !/^-?\d+$/.test(o.id.raw)) throw new ApiError('Server-ID ist keine Ganzzahl.');
    const id = BigInt(o.id.raw).toString(); if (seen.has(id)) throw new ApiError('Doppelte Server-ID.'); seen.add(id);
    return {id, name:required(o,'name')};
  });
}
export function parseConference(text, s) {
  const o = parseJson(text); const url = required(o,'url'); const title = required(o,'title');
  let u; try { u = new URL(url); } catch { throw new ApiError('Ungültiger Konferenzlink.'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new ApiError('Ungültiger HTTP(S)-Konferenzlink.');
  const rawId = o.id instanceof JsonNumber ? o.id.raw : o.id;
  const id = typeof rawId === 'string' && /^\d+$/.test(rawId) && /[1-9]/.test(rawId) ? rawId : null;
  const moderatorEditUrl = id ? s.baseUrl + 'room/dashboard?editConference_id=' + id : null;
  const nums = o.phone?.numbers?.numbers;
  const phoneNumbers = object(nums) ? Object.entries(nums).filter(([k,v]) => k.trim() && typeof v === 'string' && v.trim()).map(([k,v]) => [k,v.trim()]) : [];
  const pin = typeof o.phone?.dialIn === 'string' && o.phone.dialIn.trim() ? o.phone.dialIn.trim() : null;
  const parts = ['Meetling-Konferenz', 'Teilnehmen: ' + url];
  if (phoneNumbers.length) parts.push('', 'Einwahlnummern:', ...phoneNumbers.map(([k,v]) => k + ': ' + v));
  if (pin) parts.push('', 'Einwahl-PIN: ' + pin);
  if (moderatorEditUrl) parts.push('', 'Konferenz in Meetling bearbeiten (nur für Moderatoren):', moderatorEditUrl);
  const bodyText = parts.join('\n') + '\n';
  const escape = v => v.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const html = parts.map(line => [url, moderatorEditUrl].includes(line) ? `<a href="${escape(line)}">${escape(line)}</a>` : escape(line)).join('<br>') + '<br>';
  return {url,title,id,moderatorEditUrl,phoneNumbers,pin,bodyText,html};
}
export class ApiClient {
  constructor(s, token, fetcher = fetch, trace = () => {}) { this.s = s; this.token = validateToken(token); this.fetcher = fetcher; this.trace = trace; }
  async request(action, id, signal) {
    if (action === 'createConference' && !/^-?\d+$/.test(id)) throw new Error('Ungültige Server-ID.');
    const controller = new AbortController();
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, {once:true}); if (signal?.aborted) abort();
    const timer = setTimeout(abort, this.s.timeoutSeconds * 1000);
    const options = {method:action === 'createConference' ? 'POST' : 'GET', credentials:'omit', redirect:'error', cache:'no-store', referrerPolicy:'no-referrer', signal:controller.signal,
      headers:{Authorization:'Bearer ' + this.token, Accept:'application/json'}};
    if (action === 'createConference') { options.body = new URLSearchParams({server_id:id}); }
    this.trace(action, 'start');
    try {
      const response = await this.fetcher(endpoint(this.s, action), options);
      this.trace(action, 'HTTP ' + response.status);
      if (!response.ok) throw new ApiError('Meetling HTTP-Fehler ' + response.status, 'HTTP ' + response.status);
      const text = await response.text();
      if (action === 'servers') return parseServers(text);
      if (action === 'createConference') return parseConference(text, this.s);
      const o = parseJson(text); if (!object(o) || !Object.hasOwn(o,'token') || o.token !== null) throw new ApiError('Logout wurde nicht bestätigt.');
    } catch (e) { this.trace(action,'failed'); throw e; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
}
