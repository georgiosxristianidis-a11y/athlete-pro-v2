// @ts-check
/* ════════════════════════════════════════════════════════
   journal.view.js — Журнал тренировок: DOM, события, UI

   Логика и данные — в journal.store.js. Здесь только отрисовка.
   ════════════════════════════════════════════════════════ */

import { esc, haptic } from './shared/utils.js';
import { fmtDate, fmtDuration, fmtVol, fmtWeight } from './shared/format.js';
import { t } from './locale.store.js';
import { on, onInput } from './events.js';
import {
  JournalState,
  TYPES,
  loadWorkouts,
  visibleSlice,
  hasMore,
  loadMore,
  resetPaging,
  groupByMonth,
  summarize,
  typeCounts,
  findWorkout,
  doneSetCount,
} from './journal.store.js';

/* PPL-закон: push=green · pull=cyan · legs=purple. Точечная подсветка
   строки берёт цвет отсюда, чтобы не хардкодить hue в разметке. */
const TYPE_VAR = {
  push: 'var(--c-push)',
  pull: 'var(--c-pull)',
  legs: 'var(--c-legs)',
};

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  empty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><polyline points="14 3 14 8 19 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
};

/** Подпись месяца в заголовке секции: «Июль 2026» / «July 2026». */
function monthLabel(ts) {
  const s = fmtDate(ts, { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Локализованное имя типа тренировки. */
function typeLabel(type) {
  if (!type) return t('journal.training');
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/* ══════════════════════════════════════════════
   СПИСОК
   ══════════════════════════════════════════════ */

function rowHtml(w) {
  const s = summarize(w);
  const color = TYPE_VAR[s.type] || 'var(--c-text-3)';
  const meta = [
    t('journal.exercises', { n: s.exerciseCount }),
    t('journal.sets', { n: s.setCount }),
    s.duration ? fmtDuration(s.duration) : null,
  ].filter(Boolean).join(' · ');

  const pr = s.prCount
    ? `<span class="jr-pr"><span class="jr-pr-ico">${ICON.star}</span>${s.prCount}</span>`
    : '';

  return `
    <button class="jr-row" data-action="journal:open" data-id="${esc(String(s.id))}">
      <span class="jr-dot" style="background:${color}"></span>
      <span class="jr-body">
        <span class="jr-top">
          <span class="jr-type">${esc(typeLabel(s.type))}</span>
          <span class="jr-date">${esc(fmtDate(s.timestamp))}</span>
        </span>
        <span class="jr-meta">${esc(meta)}</span>
      </span>
      <span class="jr-tail">
        ${pr}
        <span class="jr-vol">${esc(fmtVol(s.tonnage))}<span class="jr-unit">kg</span></span>
        <span class="jr-chev">${ICON.chevron}</span>
      </span>
    </button>`;
}

/** Пустое состояние различает «архив пуст» и «фильтр ничего не нашёл». */
function emptyHtml() {
  const noData = JournalState.all.length === 0;
  const title = noData ? t('journal.empty_title') : t('journal.nomatch_title');
  const desc  = noData ? t('journal.empty_desc')  : t('journal.nomatch_desc');
  const cta = noData
    ? ''
    : `<button class="jr-reset" data-action="journal:reset">${esc(t('journal.reset'))}</button>`;
  return `
    <div class="empty-state">
      <div class="empty-icon">${ICON.empty}</div>
      <div class="empty-title">${esc(title)}</div>
      <div class="empty-desc">${esc(desc)}</div>
      ${cta}
    </div>`;
}

function renderSegments() {
  const el = document.getElementById('jr-segments');
  if (!el) return;
  const counts = typeCounts(JournalState.all, JournalState.query);
  el.innerHTML = TYPES.map((type) => {
    const active = JournalState.type === type ? ' active' : '';
    const n = counts[type] || 0;
    return `<button class="jr-seg${active}" data-action="journal:filter" data-type="${esc(type)}"
      >${esc(t('journal.filter_' + type))}<span class="jr-seg-n">${n}</span></button>`;
  }).join('');
}

function renderList() {
  const el = document.getElementById('jr-list');
  if (!el) return;

  const { filtered, page } = visibleSlice();

  if (!page.length) {
    el.innerHTML = emptyHtml();
    _teardownSentinel();
    return;
  }

  const groups = groupByMonth(page).map((g) => `
    <div class="jr-month">
      <span class="jr-month-label">${esc(monthLabel(g.ts))}</span>
      <span class="jr-month-n">${g.items.length}</span>
    </div>
    ${g.items.map(rowHtml).join('')}
  `).join('');

  // Кнопка-дублёр к автоподгрузке: наблюдатель молчит, если экран не
  // прокручивается (короткий список на планшете) — тап всё равно работает.
  const more = hasMore()
    ? `<button class="jr-more" id="jr-sentinel" data-action="journal:more">${esc(t('journal.more'))}</button>`
    : '';

  el.innerHTML = `<div class="jr-count">${esc(t('journal.count', { n: filtered.length }))}</div>${groups}${more}`;
  _setupSentinel();
}

/* ── Подгрузка по мере прокрутки ──────────────────────────────
   Скроллер — сам элемент экрана (`.screen` = position:absolute +
   overflow-y:auto), поэтому root наблюдателя именно он, а не вьюпорт. */
/** @type {IntersectionObserver|null} */
let _io = null;

function _teardownSentinel() {
  _io?.disconnect();
  _io = null;
}

function _setupSentinel() {
  _teardownSentinel();
  const sentinel = document.getElementById('jr-sentinel');
  const root = document.getElementById('s-journal');
  if (!sentinel || !root) return;
  _io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    if (loadMore()) renderList();
  }, { root, rootMargin: '200px' });
  _io.observe(sentinel);
}

/* ══════════════════════════════════════════════
   КАРТОЧКА ТРЕНИРОВКИ
   ══════════════════════════════════════════════ */

function setsHtml(ex) {
  const sets = Array.isArray(ex?.sets) ? ex.sets : [];
  if (!sets.length) return `<div class="jr-noset">${esc(t('journal.no_sets'))}</div>`;
  return `<div class="jr-sets">${sets.map((s, i) => {
    const skipped = s?.done === false ? ' skipped' : '';
    const w = Number(s?.weight) || 0;
    const reps = Number(s?.reps) || 0;
    return `<span class="jr-set${skipped}">
        <span class="jr-set-i">${i + 1}</span>
        <span class="jr-set-v">${esc(fmtWeight(w))}<span class="jr-unit">kg</span> × ${reps}</span>
      </span>`;
  }).join('')}</div>`;
}

function detailHtml(w) {
  const s = summarize(w);
  const color = TYPE_VAR[s.type] || 'var(--c-text-3)';
  const prNames = new Set((Array.isArray(w.prs) ? w.prs : []).map((p) => p?.name));

  const exercises = (Array.isArray(w.exercises) ? w.exercises : []).map((ex) => `
    <div class="jr-ex">
      <div class="jr-ex-head">
        <span class="jr-ex-name">${esc(ex?.name || '—')}</span>
        ${prNames.has(ex?.name) ? `<span class="jr-pr"><span class="jr-pr-ico">${ICON.star}</span>PR</span>` : ''}
      </div>
      ${setsHtml(ex)}
    </div>`).join('') || `<div class="jr-noset">${esc(t('journal.no_sets'))}</div>`;

  return `
    <div class="modal-sheet jr-sheet">
      <div class="modal-handle"></div>
      <div class="jr-detail-head">
        <div>
          <div class="jr-detail-type" style="color:${color}">${esc(typeLabel(s.type))}</div>
          <div class="jr-detail-date">${esc(fmtDate(s.timestamp, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div>
        </div>
        <button class="jr-x" data-action="journal:close" aria-label="${esc(t('journal.close'))}">${ICON.close}</button>
      </div>

      <div class="jr-detail-stats">
        <div class="jr-stat">
          <div class="jr-stat-v">${esc(fmtVol(s.tonnage))}<span class="jr-unit">kg</span></div>
          <div class="jr-stat-k">${esc(t('journal.detail_volume'))}</div>
        </div>
        <div class="jr-stat">
          <div class="jr-stat-v">${doneSetCount(w)}</div>
          <div class="jr-stat-k">${esc(t('journal.detail_sets'))}</div>
        </div>
        <div class="jr-stat">
          <div class="jr-stat-v">${esc(s.duration ? fmtDuration(s.duration) : '—')}</div>
          <div class="jr-stat-k">${esc(t('journal.detail_time'))}</div>
        </div>
      </div>

      <div class="jr-ex-list">${exercises}</div>
    </div>`;
}

function openDetail(id) {
  const w = findWorkout(id);
  if (!w) return;
  document.querySelector('.jr-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay jr-overlay';
  overlay.innerHTML = detailHtml(w);
  // Тап по затемнению закрывает; тап внутри листа — нет.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
  haptic(10);
}

/* ══════════════════════════════════════════════
   СОБЫТИЯ
   ══════════════════════════════════════════════ */

on('journal:open', (el) => openDetail(el.dataset.id));
on('journal:close', (el) => el.closest('.modal-overlay')?.remove());
on('journal:more', () => { if (loadMore()) renderList(); });

on('journal:filter', (el) => {
  const type = el.dataset.type;
  if (!TYPES.includes(type) || type === JournalState.type) return;
  JournalState.type = /** @type {any} */ (type);
  resetPaging();
  haptic(10);
  renderSegments();
  renderList();
});

on('journal:reset', () => {
  JournalState.type = 'all';
  JournalState.query = '';
  resetPaging();
  const input = /** @type {HTMLInputElement|null} */ (document.getElementById('jr-search'));
  if (input) input.value = '';
  renderSegments();
  renderList();
});

// Поле поиска намеренно живёт вне #jr-list: перерисовка списка на каждый
// символ отобрала бы у него фокус вместе с экранной клавиатурой.
onInput('journal:search', (el) => {
  JournalState.query = /** @type {HTMLInputElement} */ (el).value;
  resetPaging();
  renderSegments();
  renderList();
});

/* ══════════════════════════════════════════════
   MAIN LOAD
   ══════════════════════════════════════════════ */

/**
 * Отрисовать экран журнала.
 * @returns {Promise<void>}
 */
export async function load() {
  const screen = document.getElementById('s-journal');
  if (!screen) return;

  screen.innerHTML = `
    <div class="screen-header">
      <div>
        <div class="screen-title">${esc(t('journal.title'))}</div>
        <div class="screen-sub">${esc(t('journal.sub'))}</div>
      </div>
    </div>

    <div class="jr-search-wrap">
      <span class="jr-search-ico">${ICON.search}</span>
      <input id="jr-search" class="jr-search" type="search" data-input="journal:search"
             autocomplete="off" spellcheck="false"
             placeholder="${esc(t('journal.search'))}" aria-label="${esc(t('journal.search'))}" />
    </div>

    <div id="jr-segments" class="jr-segments"></div>
    <div id="jr-list" class="jr-list"></div>
  `;

  resetPaging();
  renderSegments();

  await loadWorkouts();
  renderSegments();
  renderList();
}

export const Journal = { load };
