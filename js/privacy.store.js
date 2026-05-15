// @ts-check
/* ════════════════════════════════════════════════════════
   privacy.store.js — Privacy mode + safeFetch network gate
   ────────────────────────────────────────────────────────
   Tri-state: 'cloud' | 'anon' | 'airgap'
   Independent toggle: aiEnabled (default false — opt-in)

   safeFetch(url, opts, kind):
     kind='ai'   → blocked unless mode!=airgap AND aiEnabled
     kind='sync' → blocked unless mode!=airgap; identifiers stripped if anon
     kind='static' → always allowed (local assets only)

   Privacy-first: NEW installs default to 'airgap'.
   EXISTING installs (with workout history) keep 'cloud' as legacy.
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';

const KEY_MODE = 'privacy.mode';
const KEY_AI = 'privacy.aiEnabled';
const KEY_INSTALL = 'privacy.installedAt';
const KEY_AUDIT = 'privacy.audit'; // last 50 fetch events (in-memory + persisted)

/* ── In-memory cache (sync access) ── */
let _mode = 'airgap';
let _aiEnabled = false;
let _audit = [];
let _initialized = false;
const _listeners = new Set();

/**
 * @typedef {'cloud'|'anon'|'airgap'} PrivacyMode
 * @typedef {'ai'|'sync'|'static'} FetchKind
 * @typedef {{
 *   t: number, url: string, kind: FetchKind,
 *   mode: PrivacyMode, allowed: boolean, reason?: string
 * }} AuditEntry
 */

/* ════════════════════════════════════════════════════════
   INIT — must be called before first safeFetch
   ════════════════════════════════════════════════════════ */
export async function initPrivacy() {
  if (_initialized) return;
  _initialized = true;

  const [mode, ai, installedAt, audit] = await Promise.all([
    DB.Settings.get(KEY_MODE, null),
    DB.Settings.get(KEY_AI, null),
    DB.Settings.get(KEY_INSTALL, null),
    DB.Settings.get(KEY_AUDIT, []),
  ]);

  if (mode === null) {
    // First-time setup — decide default based on whether user has data
    const workouts = await DB.Workouts.getAll().catch(() => []);
    const isExistingUser = workouts.length > 0;
    _mode = isExistingUser ? 'cloud' : 'airgap';
    _aiEnabled = isExistingUser; // legacy users keep AI on
    await DB.Settings.set(KEY_MODE, _mode);
    await DB.Settings.set(KEY_AI, _aiEnabled);
    if (!installedAt) {
      await DB.Settings.set(KEY_INSTALL, Date.now());
    }
  } else {
    _mode = /** @type {PrivacyMode} */ (mode);
    _aiEnabled = !!ai;
  }

  _audit = Array.isArray(audit) ? audit : [];

  // Expose globally so service worker / inline handlers can read
  if (typeof window !== 'undefined') {
    window.__privacyMode = () => _mode;
    window.__privacyAi = () => _aiEnabled;
  }

  _syncToServiceWorker();
}

function _syncToServiceWorker() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  const post = () => {
    navigator.serviceWorker.controller?.postMessage({
      type: 'privacy-mode',
      mode: _mode,
    });
  };
  if (navigator.serviceWorker.controller) post();
  else navigator.serviceWorker.ready.then(post).catch(() => {});
}

/* ── Public getters ── */
export function getPrivacyMode() { return _mode; }
export function getAiEnabled() { return _aiEnabled; }
export function isLegacyInstall() {
  // Returns true if app had data before privacy system existed.
  // Used to show one-time "switch to private?" prompt.
  return _mode === 'cloud' && _aiEnabled === true;
}

/* ── Mutators ── */
export async function setPrivacyMode(mode) {
  if (!['cloud', 'anon', 'airgap'].includes(mode)) {
    throw new Error('Invalid privacy mode: ' + mode);
  }
  _mode = mode;
  await DB.Settings.set(KEY_MODE, mode);
  // Forcing airgap implicitly disables AI
  if (mode === 'airgap' && _aiEnabled) {
    _aiEnabled = false;
    await DB.Settings.set(KEY_AI, false);
  }
  _syncToServiceWorker();
  _notify();
}

export async function setAiEnabled(enabled) {
  if (_mode === 'airgap' && enabled) {
    throw new Error('Cannot enable AI in air-gapped mode');
  }
  _aiEnabled = !!enabled;
  await DB.Settings.set(KEY_AI, _aiEnabled);
  _notify();
}

/* ── Reactivity ── */
export function onPrivacyChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
function _notify() {
  _listeners.forEach((fn) => { try { fn({ mode: _mode, aiEnabled: _aiEnabled }); } catch {} });
}

/* ════════════════════════════════════════════════════════
   safeFetch — gated network wrapper
   ════════════════════════════════════════════════════════ */

/**
 * @param {string} url
 * @param {RequestInit} [opts]
 * @param {FetchKind} [kind]
 * @returns {Promise<Response>}
 */
export async function safeFetch(url, opts = {}, kind = 'sync') {
  if (!_initialized) await initPrivacy();

  const isExternal = !_isStaticAsset(url);
  const finalKind = isExternal ? kind : 'static';

  // Static assets bypass the gate
  if (finalKind === 'static') {
    return fetch(url, opts);
  }

  // AI gate
  if (finalKind === 'ai') {
    if (_mode === 'airgap') {
      _logAudit({ url, kind, allowed: false, reason: 'airgap' });
      throw new PrivacyBlockedError('AI blocked in air-gapped mode', 'airgap', kind);
    }
    if (!_aiEnabled) {
      _logAudit({ url, kind, allowed: false, reason: 'ai-disabled' });
      throw new PrivacyBlockedError('AI Coach is disabled (Settings → Privacy)', 'ai-off', kind);
    }
  }

  // Sync gate
  if (finalKind === 'sync' && _mode === 'airgap') {
    _logAudit({ url, kind, allowed: false, reason: 'airgap' });
    throw new PrivacyBlockedError('Network blocked in air-gapped mode', 'airgap', kind);
  }

  // Anonymous: strip identifying headers / body fields if possible
  let finalOpts = opts;
  if (_mode === 'anon') {
    finalOpts = _stripIdentifiers(opts);
  }

  _logAudit({ url, kind, allowed: true });
  return fetch(url, finalOpts);
}

export class PrivacyBlockedError extends Error {
  constructor(msg, code, kind) {
    super(msg);
    this.name = 'PrivacyBlockedError';
    this.code = code; // 'airgap' | 'ai-off'
    this.kind = kind;
  }
}

/* ── Helpers ── */
function _isStaticAsset(url) {
  // Same-origin non-API paths are static
  try {
    const u = new URL(url, location.origin);
    if (u.origin !== location.origin) return false;
    if (u.pathname.startsWith('/api/')) return false;
    return true;
  } catch {
    // Relative path — treat as same-origin
    return !url.startsWith('/api/') && !url.startsWith('http');
  }
}

function _stripIdentifiers(opts) {
  const next = { ...opts };
  if (next.headers) {
    const h = new Headers(next.headers);
    h.delete('Authorization');
    h.delete('X-User-Id');
    h.delete('X-Device-Id');
    h.delete('Cookie');
    next.headers = h;
  }
  // If body is JSON with known identifying fields, strip them
  if (next.body && typeof next.body === 'string') {
    try {
      const parsed = JSON.parse(next.body);
      delete parsed.userId;
      delete parsed.deviceId;
      delete parsed.email;
      delete parsed.name;
      next.body = JSON.stringify(parsed);
    } catch { /* leave as-is */ }
  }
  return next;
}

/* ════════════════════════════════════════════════════════
   AUDIT LOG — last 50 events, persisted on flush
   ════════════════════════════════════════════════════════ */
let _flushTimer = null;
function _logAudit({ url, kind, allowed, reason }) {
  _audit.unshift({
    t: Date.now(),
    url: _sanitizeUrl(url),
    kind,
    mode: _mode,
    allowed,
    reason,
  });
  if (_audit.length > 50) _audit.length = 50;

  // Debounce persist
  clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => {
    DB.Settings.set(KEY_AUDIT, _audit).catch(() => {});
  }, 500);
}

function _sanitizeUrl(url) {
  // Strip query string for audit (avoid leaking PII)
  try {
    const u = new URL(url, location.origin);
    return u.pathname;
  } catch {
    return url.split('?')[0];
  }
}

/** @returns {AuditEntry[]} */
export function getAuditLog() {
  return [..._audit];
}

export function clearAuditLog() {
  _audit = [];
  return DB.Settings.set(KEY_AUDIT, []);
}
