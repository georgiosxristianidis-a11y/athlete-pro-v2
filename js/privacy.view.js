// @ts-check
/* ════════════════════════════════════════════════════════
   privacy.view.js — Privacy UI
   ────────────────────────────────────────────────────────
   • renderPrivacyCard()   — tri-state segmented + AI toggle + entry to passport/audit
   • openDataPassport()    — modal: per-store record counts + export/delete
   • openAuditLog()        — modal: last 50 fetch events
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import {
  getPrivacyMode, getAiEnabled, setPrivacyMode, setAiEnabled,
  getAuditLog, clearAuditLog,
} from './privacy.store.js';
import { t } from './locale.store.js';
import { esc } from './shared/utils.js';

const MODES = [
  { id: 'cloud',  label: 'Cloud',     desc: 'AI Coach + cloud sync available.' },
  { id: 'anon',   label: 'Anonymous', desc: 'AI works, but identifiers are stripped before sending.' },
  { id: 'airgap', label: 'Air-Gapped', desc: 'Zero data leaves this device. AI is disabled.' },
];

/* ════════════════════════════════════════════════════════
   PRIVACY CARD — drop this into Profile screen
   ════════════════════════════════════════════════════════ */

export function renderPrivacyCard() {
  const mode = getPrivacyMode();
  const ai = getAiEnabled();
  const cur = MODES.find(m => m.id === mode) || MODES[2];

  return `
    <div class="section-header" style="margin-top:var(--sp-3)">
      <span class="section-label">Privacy</span>
      <span class="privacy-mode-tag privacy-mode-${mode}">
        ${_modeIcon(mode)}<span>${cur.label}</span>
      </span>
    </div>

    <div class="profile-card privacy-card">
      <div class="privacy-segment" role="tablist" aria-label="Privacy mode">
        ${MODES.map(m => `
          <button class="privacy-seg-btn ${m.id === mode ? 'active' : ''}"
                  data-mode="${m.id}" role="tab" aria-selected="${m.id === mode}"
                  onclick="Privacy._setMode('${m.id}')">
            ${_modeIcon(m.id)}
            <span>${m.label}</span>
          </button>`).join('')}
      </div>

      <div class="privacy-desc" id="privacy-desc">${cur.desc}</div>

      <div class="pref-divider"></div>

      <div class="pref-row">
        <div class="pref-info">
          <div class="pref-title">AI Coach</div>
          <div class="pref-sub">
            ${mode === 'airgap'
              ? 'Disabled in Air-Gapped mode'
              : 'Sends workout context to Anthropic when on'}
          </div>
        </div>
        <div class="switch-wrap ${mode === 'airgap' ? 'switch-disabled' : ''}"
             onclick="${mode === 'airgap' ? '' : 'Privacy._toggleAi()'}">
          <div class="switch ${ai && mode !== 'airgap' ? 'on' : ''}" id="sw-privacy-ai">
            <div class="switch-thumb"></div>
          </div>
        </div>
      </div>

      <div class="pref-divider"></div>

      <button class="data-btn" onclick="Privacy.openDataPassport()">
        <div class="data-btn-icon" style="background:var(--c-purple-bg)">
          ${_iconPassport()}
        </div>
        <div class="data-btn-info">
          <div class="data-btn-title">Data Passport</div>
          <div class="data-btn-sub">See exactly what's stored, where</div>
        </div>
        ${_iconChevron()}
      </button>

      <div class="pref-divider"></div>

      <button class="data-btn" onclick="Privacy.openAuditLog()">
        <div class="data-btn-icon" style="background:var(--c-blue-bg)">
          ${_iconAudit()}
        </div>
        <div class="data-btn-info">
          <div class="data-btn-title">Privacy Budget</div>
          <div class="data-btn-sub">Audit recent network activity</div>
        </div>
        ${_iconChevron()}
      </button>
    </div>
  `;
}

/* ════════════════════════════════════════════════════════
   ACTIONS
   ════════════════════════════════════════════════════════ */

async function _setMode(mode) {
  await setPrivacyMode(mode);
  // Re-render the privacy card in place (section-header + profile-card pair)
  const cardEl = document.querySelector('.privacy-card');
  const sectionHeader = cardEl?.previousElementSibling;
  if (cardEl && sectionHeader?.classList.contains('section-header')) {
    const wrap = document.createElement('template');
    wrap.innerHTML = renderPrivacyCard().trim();
    const newNodes = Array.from(wrap.content.children);
    if (newNodes.length >= 2) {
      cardEl.replaceWith(newNodes[1]);
      sectionHeader.replaceWith(newNodes[0]);
    }
  } else if (window.Profile?.load) {
    window.Profile.load();
  }
  _flashStatusBar();
  navigator.vibrate?.(10);
}

async function _toggleAi() {
  const cur = getAiEnabled();
  await setAiEnabled(!cur);
  const sw = document.getElementById('sw-privacy-ai');
  if (sw) sw.classList.toggle('on', !cur);
  navigator.vibrate?.(8);
}

/* ════════════════════════════════════════════════════════
   DATA PASSPORT
   ════════════════════════════════════════════════════════ */

export async function openDataPassport() {
  const [workouts, orms, metrics, settings, events] = await Promise.all([
    DB.Workouts.getAll().catch(() => []),
    DB.OneRM.getAll().catch(() => []),
    DB.Metrics.getAll().catch(() => []),
    DB.Settings.getAll().catch(() => ({})),
    DB.Events.getAll().catch(() => []),
  ]);

  const audit = getAuditLog();
  const sentRecently = audit.filter(a => a.allowed && (Date.now() - a.t) < 30 * 24 * 3600e3);
  const aiCalls = sentRecently.filter(a => a.kind === 'ai').length;
  const syncCalls = sentRecently.filter(a => a.kind === 'sync').length;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'data-passport-overlay';
  overlay.style.zIndex = '5000';
  overlay.innerHTML = `
    <div class="modal-sheet" style="max-height:88vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-title">${t('privacy.passport')}</div>
        <button class="btn-icon-sm" onclick="Privacy._closeOverlay('data-passport-overlay')" aria-label="Close">
          ${_iconClose()}
        </button>
      </div>

      <div class="passport-section-label">${t('privacy.device')}</div>
      <div class="passport-grid">
        ${_passportTile(workouts.length, 'Workouts')}
        ${_passportTile(orms.length, 'PR records')}
        ${_passportTile(metrics.length, 'Body metrics')}
        ${_passportTile(events.length, 'Events')}
        ${_passportTile(Object.keys(settings || {}).length, 'Settings')}
      </div>

      <div class="passport-section-label">${t('privacy.sent')}</div>
      <div class="passport-grid">
        ${_passportTile(aiCalls, 'AI requests', aiCalls === 0)}
        ${_passportTile(syncCalls, 'Sync events', syncCalls === 0)}
      </div>

      <div class="passport-section-label">${t('privacy.storage')}</div>
      <div class="passport-row">
        <span class="passport-row-key">IndexedDB</span>
        <span class="passport-row-val">${t('privacy.indexeddb')}</span>
      </div>
      <div class="passport-row">
        <span class="passport-row-key">localStorage</span>
        <span class="passport-row-val">${t('privacy.localstorage')}</span>
      </div>
      <div class="passport-row">
        <span class="passport-row-key">Cloud / server</span>
        <span class="passport-row-val">${getPrivacyMode() === 'airgap' ? t('privacy.desc.airgap') : t('privacy.cloud_server')}</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-top:var(--sp-3)">
        <button class="btn btn-primary" onclick="Profile.exportData();Privacy._closeOverlay('data-passport-overlay')">
          ${t('privacy.export_all')}
        </button>
        <button class="btn btn-ghost" style="color:var(--c-red);border-color:rgba(232,132,140,0.3)"
                onclick="Privacy._confirmDelete()">
          ${t('privacy.delete_all')}
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) _closeOverlay('data-passport-overlay');
  });
}

function _passportTile(num, label, dim = false) {
  return `<div class="passport-tile ${dim ? 'dim' : ''}">
    <span class="passport-num">${num}</span>
    <span class="passport-lbl">${label}</span>
  </div>`;
}

/* ════════════════════════════════════════════════════════
   AUDIT LOG
   ════════════════════════════════════════════════════════ */

export function openAuditLog() {
  const audit = getAuditLog();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'audit-overlay';
  overlay.style.zIndex = '5000';

  const rows = audit.length === 0
    ? '<div class="audit-empty">No network activity recorded.</div>'
    : audit.map(a => `
        <div class="audit-row ${a.allowed ? 'allowed' : 'blocked'}">
          <div class="audit-row-left">
            <span class="audit-dot ${a.allowed ? '' : 'blocked'}"></span>
            <div>
              <div class="audit-url">${esc(a.url)}</div>
              <div class="audit-meta">${esc(a.kind)} · ${_relTime(a.t)}</div>
            </div>
          </div>
          <span class="audit-status">${a.allowed ? esc(t('privacy.status_sent')) : esc(a.reason || t('privacy.status_blocked'))}</span>
        </div>`).join('');

  overlay.innerHTML = `
    <div class="modal-sheet" style="max-height:88vh;overflow-y:auto">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-title">Privacy Budget</div>
        <button class="btn-icon-sm" onclick="Privacy._closeOverlay('audit-overlay')" aria-label="Close">
          ${_iconClose()}
        </button>
      </div>
      <div class="audit-summary">
        Last ${audit.length} network attempts · ${audit.filter(a => a.allowed).length} sent · ${audit.filter(a => !a.allowed).length} blocked
      </div>
      <div class="audit-list">${rows}</div>
      <button class="btn btn-ghost" style="margin-top:var(--sp-2)"
              onclick="Privacy._clearAudit()">
        Clear log
      </button>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) _closeOverlay('audit-overlay');
  });
}

async function _clearAudit() {
  await clearAuditLog();
  _closeOverlay('audit-overlay');
  openAuditLog();
}

function _closeOverlay(id) {
  const o = document.getElementById(id);
  if (!o) return;
  o.classList.remove('visible');
  setTimeout(() => o.remove(), 200);
}

function _confirmDelete() {
  if (!confirm('Delete ALL local data? This cannot be undone.')) return;
  DB.clearAll().then(() => {
    location.reload();
  });
}

/* ════════════════════════════════════════════════════════
   STATUS BAR FLASH — visual confirmation of mode change
   ════════════════════════════════════════════════════════ */
function _flashStatusBar() {
  const ind = document.getElementById('privacy-indicator');
  if (!ind) return;
  ind.classList.remove('flash');
  void ind.offsetWidth;
  ind.classList.add('flash');
}

/* ════════════════════════════════════════════════════════
   ICONS
   ════════════════════════════════════════════════════════ */

function _modeIcon(mode) {
  const paths = {
    cloud:  '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    anon:   '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/><line x1="3" y1="3" x2="21" y2="21"/>',
    airgap: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
    width="14" height="14" style="flex-shrink:0">${paths[mode]}</svg>`;
}

function _iconPassport() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="var(--c-purple)"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <circle cx="12" cy="14" r="3"/>
  </svg>`;
}

function _iconAudit() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="var(--c-blue)"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
    <line x1="3" y1="12" x2="21" y2="12"/>
    <polyline points="3 6 12 6 21 6"/>
    <polyline points="3 18 8 18 21 18"/>
  </svg>`;
}

function _iconChevron() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="var(--c-text-3)"
    stroke-width="1.5" stroke-linecap="round" width="16" height="16">
    <polyline points="9 18 15 12 9 6"/>
  </svg>`;
}

function _iconClose() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" width="18" height="18">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;
}

function _relTime(t) {
  const d = Date.now() - t;
  if (d < 60_000) return 'just now';
  if (d < 3600_000) return Math.floor(d / 60_000) + 'm ago';
  if (d < 86_400_000) return Math.floor(d / 3600_000) + 'h ago';
  return Math.floor(d / 86_400_000) + 'd ago';
}

/* ════════════════════════════════════════════════════════
   PUBLIC API (window.Privacy)
   ════════════════════════════════════════════════════════ */
export const Privacy = {
  renderPrivacyCard,
  openDataPassport,
  openAuditLog,
  _setMode,
  _toggleAi,
  _closeOverlay,
  _confirmDelete,
  _clearAudit,
};
