// @ts-check
/* ════════════════════════════════════════════════════════
   supabase-check.js — Athlete Pro
   Supabase availability tester + status badge renderer
   ════════════════════════════════════════════════════════ */

import { on } from './events.js';

on('sb:recheck', () => window.SupabaseCheck?.renderCard(document.getElementById('supabase-card')));

export const SupabaseCheck = (() => {
  /* ── Last known result (cached for 60s) ── */
  let _cache = null;
  let _cacheTime = 0;
  const CACHE_TTL = 60_000;

  /* ── Ping the server-side proxy and return a status object ──
     Server proxies to Supabase so there are no CORS issues.
     Returns:
       { available: bool, status?, latencyMs?, reason?, url? }  */
  async function ping() {
    if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;

    try {
      const { safeFetch } = await import('./privacy.store.js');
      const res = await safeFetch('/api/supabase-status', {
        signal: AbortSignal.timeout(8000),
      }, 'sync');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      _cache = await res.json();
      _cacheTime = Date.now();
    } catch (err) {
      _cache = { available: false, reason: err.code === 'airgap' ? 'air-gapped' : err.message };
    }

    return _cache;
  }

  /* ── Run check and inject a status badge into `containerEl` ──
     Call this from the profile page or anywhere in the DOM.   */
  async function renderBadge(containerEl) {
    if (!containerEl) return;

    /* Show loading state */
    containerEl.innerHTML = _badgeHtml('checking', '···', 'Checking Supabase…');

    const result = await ping();

    if (result.reason === 'not_configured') {
      containerEl.innerHTML = _badgeHtml(
        'unconfigured',
        'Not configured',
        'Add SUPABASE_URL + SUPABASE_ANON_KEY to .env'
      );
      return;
    }

    if (result.available) {
      containerEl.innerHTML = _badgeHtml(
        'online',
        `${result.latencyMs}ms`,
        `Connected · ${result.url || 'Supabase'}`
      );
    } else {
      const label = result.reason === 'timeout' ? 'Timeout' : 'Unreachable';
      containerEl.innerHTML = _badgeHtml(
        'offline',
        label,
        result.reason || 'Could not reach Supabase'
      );
    }
  }

  /* ── Build the full Supabase cloud card HTML ──
     Suitable for inserting into the profile page.            */
  async function renderCard(containerEl) {
    if (!containerEl) return;

    containerEl.innerHTML = `
      <div class="section-header" style="margin-top:var(--sp-2)">
        <span class="section-label">Cloud Sync</span>
        <button class="btn-text" data-action="sb:recheck">
          Recheck
        </button>
      </div>
      <div class="cloud-card" id="supabase-card-inner">
        ${_cardLoadingHtml()}
      </div>`;

    const inner = containerEl.querySelector('#supabase-card-inner');
    const result = await ping();

    inner.innerHTML = _cardResultHtml(result);
  }

  /* ── Programmatic test — returns true/false, logs to console ── */
  async function test() {
    console.group('[SupabaseCheck] Running availability test…');
    const t0 = Date.now();
    const result = await ping();
    const elapsed = Date.now() - t0;

    if (result.reason === 'not_configured') {
      console.warn('Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env');
    } else if (result.available) {
      console.info(`Supabase reachable · ${result.latencyMs}ms · HTTP ${result.status}`);
    } else {
      console.error(`Supabase unreachable · reason: ${result.reason} · after ${elapsed}ms`);
    }

//     console.log('Full result:', result);
    console.groupEnd();
    return result;
  }

  /* ─────────────── private helpers ─────────────── */

  function _badgeHtml(state, label, title) {
    const colors = {
      online: { bg: 'var(--c-accent-bg)', text: 'var(--c-accent)', dot: 'var(--c-accent)' },
      offline: { bg: 'var(--c-red-bg)', text: 'var(--c-red)', dot: 'var(--c-red)' },
      unconfigured: { bg: 'var(--c-amber-bg)', text: 'var(--c-amber)', dot: 'var(--c-amber)' },
      checking: { bg: 'var(--c-surface)', text: 'var(--c-text-3)', dot: 'var(--c-text-3)' },
    };
    const c = colors[state] || colors.checking;
    const pulse = state === 'online' ? 'animation:pulse 2s infinite' : '';

    return `
      <div class="supabase-badge" title="${title}"
           style="display:flex;align-items:center;gap:6px;padding:4px 10px;
                  border-radius:8px;border:1px solid ${c.text}22;
                  background:${c.bg};font-size:11px;font-weight:700;
                  color:${c.text};width:fit-content">
        <span style="width:6px;height:6px;border-radius:50%;
                     background:${c.dot};flex-shrink:0;${pulse}"></span>
        Supabase · ${label}
      </div>`;
  }

  function _cardLoadingHtml() {
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:var(--sp-1) 0">
        <div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>
        <span style="font-size:12px;color:var(--c-text-3)">Checking Supabase…</span>
      </div>`;
  }

  function _cardResultHtml(result) {
    if (result.reason === 'not_configured') {
      return `
        <div class="cloud-status-row">
          <div class="cloud-status-dot" style="background:var(--c-amber)"></div>
          <div class="cloud-status-info">
            <span class="cloud-status-label">Supabase</span>
            <span class="cloud-status-sub">Not configured</span>
          </div>
          <span class="cloud-status-val" style="color:var(--c-amber)">Setup needed</span>
        </div>
        <div style="font-size:11px;color:var(--c-text-3);margin-top:var(--sp-1);line-height:1.6">
          Add <code style="background:var(--c-bg-3);padding:1px 4px;border-radius:4px">SUPABASE_URL</code>
          and <code style="background:var(--c-bg-3);padding:1px 4px;border-radius:4px">SUPABASE_ANON_KEY</code>
          to your <strong>.env</strong> file.
        </div>`;
    }

    if (result.available) {
      return `
        <div class="cloud-status-row">
          <div class="cloud-status-dot" style="background:var(--c-accent);animation:pulse 2s infinite"></div>
          <div class="cloud-status-info">
            <span class="cloud-status-label">Supabase</span>
            <span class="cloud-status-sub">${result.url || 'Connected'}</span>
          </div>
          <span class="cloud-status-val" style="color:var(--c-accent)">${result.latencyMs}ms</span>
        </div>`;
    }

    return `
      <div class="cloud-status-row">
        <div class="cloud-status-dot" style="background:var(--c-red)"></div>
        <div class="cloud-status-info">
          <span class="cloud-status-label">Supabase</span>
          <span class="cloud-status-sub">${result.reason === 'timeout' ? 'Request timed out' : result.reason || 'Unreachable'}</span>
        </div>
        <span class="cloud-status-val" style="color:var(--c-red)">Offline</span>
      </div>`;
  }

  return { ping, test, renderBadge, renderCard };
})();
