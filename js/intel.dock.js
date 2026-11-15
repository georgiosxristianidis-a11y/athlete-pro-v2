// @ts-check
/**
 * CORE-03 (флаг 'core-composer-dock'): док быстрых модулей над композером и
 * журнал потока — лист из иконки в шапке экрана P.A.N.D.A. Core.
 *
 * Вынесено из js/intel.view.js (потолок размера файла): здесь только разметка
 * модулей/пилюли/журнала и открытие листа. Сам экран решает, где что стоит:
 * OFF — сетка в ленте и пилюля лога над композером, побитно как до CORE-03.
 */
import { esc, dismissOverlay } from './shared/utils.js';

/** Лист журнала потока. */
export const JOURNAL_ID = 'intel-journal-overlay';

/**
 * Сетка быстрых модулей (Сводка / [Генерация] / Анализ / Биометрия).
 * @param {Record<string, string>} L строки экрана
 * @param {string} generateCard разметка карточки генерации (или '')
 */
export function modulesGridHtml(L, generateCard) {
  return `
        <div class="intel-modules-grid">
          <button class="intel-module-card" data-action="intel:weekly">
            <span class="intel-module-icon intel-module-icon--intel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            </span>
            <span class="intel-module-label">${L.summary}</span>
          </button>
          ${generateCard}
          <button class="intel-module-card" data-action="intel:analyzeStats">
            <span class="intel-module-icon intel-module-icon--blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </span>
            <span class="intel-module-label">${L.analyze}</span>
          </button>
          <button class="intel-module-card" data-action="intel:biometrics">
            <span class="intel-module-icon intel-module-icon--red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </span>
            <span class="intel-module-label">${L.biometrics}</span>
          </button>
        </div>`;
}

/**
 * Легаси-пилюля лога в потоке (OFF).
 * @param {Record<string, string>} L
 * @param {string} status
 */
export function logsPillHtml(L, status) {
  return `
      <div class="intel-logs" data-action="intel:toggleLogs" data-keydown="intel:toggleLogs" role="button" tabindex="0" aria-expanded="false" aria-label="${L.logs}">
        <div class="intel-logs-header">
          <h3 class="intel-logs-title">STREAMING_LOGS</h3>
          <span class="intel-logs-status" id="intel-logs-status-pill">${esc(status)}</span>
        </div>
        <div id="intel-logs-container"></div>
      </div>`;
}

/** Иконка журнала в шапке (ON). @param {Record<string, string>} L */
export function journalButtonHtml(L) {
  return `
          <button class="intel-btn-close intel-btn-journal" data-action="intel:openJournal" aria-label="${L.logs}" aria-haspopup="dialog">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
              <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>
            </svg>
          </button>`;
}

/**
 * Шаблон листа журнала (ON). Лист собирается из него клонированием — без
 * своего innerHTML (AUD-1). Внутри те же #intel-logs-status-pill и
 * #intel-logs-container, поэтому renderLogs() и слушатель статуса экрана
 * работают с листом без второй ветки.
 * @param {Record<string, string>} L
 */
export function journalTplHtml(L) {
  return `<template id="intel-journal-tpl"><div class="modal-sheet intel-journal-sheet" role="dialog" aria-modal="true" aria-label="${L.logs}">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <div class="modal-title">${L.logs}</div>
          <button class="btn-icon-sm" data-action="intel:closeJournal" aria-label="${L.close}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <span class="intel-logs-status" id="intel-logs-status-pill"></span>
        <div id="intel-logs-container"></div>
      </div></template>`;
}

/** @param {HTMLElement|null} pill @param {string} statusText */
export function paintStatusPill(pill, statusText) {
  if (!pill) return;
  pill.textContent = statusText;
  let color = 'var(--c-intel)';
  if (statusText.includes('ERROR')) color = 'var(--c-red)';
  else if (statusText.includes('SCANNING')) color = 'var(--c-accent)';
  else if (statusText.includes('COMPUTING')) color = 'var(--c-amber)';
  else if (statusText.includes('STANDBY')) color = 'var(--c-text-3)';
  pill.style.color = color;
  pill.style.borderColor = color;
}

/* Та же шторка, что AI-настройки (.modal-overlay.sd-overlay): стекло листа
   узаконено в base.css, третьего стекла на экране Core не появляется. */

/**
 * @param {string} status текущий статус стора
 * @param {() => void} renderLogs перерисовка лога экрана
 */
export function openJournal(status, renderLogs) {
  document.getElementById(JOURNAL_ID)?.remove();
  const tpl = /** @type {HTMLTemplateElement|null} */ (document.getElementById('intel-journal-tpl'));
  if (!tpl) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay sd-overlay intel-journal-overlay';
  overlay.id = JOURNAL_ID;
  overlay.append(tpl.content.cloneNode(true));
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeJournal();
  });
  paintStatusPill(document.getElementById('intel-logs-status-pill'), status);
  renderLogs();
}

export function closeJournal() {
  const overlay = document.getElementById(JOURNAL_ID);
  if (overlay) dismissOverlay(overlay);
}
