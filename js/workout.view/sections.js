// @ts-check
/* ════════════════════════════════════════════════════════
   workout.view/sections.js — секционный режим сет-логгера (LOG-SEC-1)

   Экран активной тренировки показывает одну секцию (блок плана). Остальные —
   строкой «заголовок · итог» или не видны вовсе, пока до них не дошли.
   Все карточки упражнений при этом лежат в DOM с самого начала: переход между
   секциями — переключение `data-sec-state`, а не перерисовка (барабаны
   `initDrumPickers` уже подняты, прокрутка и значения не теряются).

   Состояние секции на `.log-sec[data-sec-state]`:
     open   — раскрыта: заголовок + карточки, в ней развёрнуто одно упражнение;
     row    — свёрнута до строки с прогрессом, тап раскрывает;
     hidden — до неё ещё не дошли (кроме строки «Дальше» под открытой).

   За флагом `logger-sections` (js/flags.js). Режим включён на экране, только
   если `#exercise-list` несёт `data-sections` — его ставит renderActive. Флаг
   переключили посреди тренировки — экран живёт в том режиме, в каком отрисован.
   ════════════════════════════════════════════════════════ */

import { State } from '../workout.store.js';
import { flag } from '../flags.js';
import { t, isRu } from '../locale.store.js';
import { blockLabel } from '../shared/block-names.js';
import {
  OTHER_BLOCK,
  sectionList,
  focusInSection,
  nextSection,
  initialSection,
} from '../shared/logger-sections.js';

/**
 * Какая секция открыта и какие уже открывали. Привязано к сессии по
 * `State.startedAt`: новая тренировка начинает с чистого листа, а перерисовка
 * экрана посреди той же (добавили подход, переключили BW) открытую секцию
 * не сбрасывает.
 * @type {{ sid: number | null, open: string | null, visited: Set<string> }}
 */
const view = { sid: null, open: null, visited: new Set() };

/** Включён ли режим для этого плана: флаг ON и в плане есть хоть один блок. */
export function sectionsEnabled(plan = State.plan) {
  return flag('logger-sections') && plan.some((ex) => !!ex.block);
}

/** Режим уже отрисован на экране (а не только включён флагом). */
export function sectionsRendered() {
  return !!document.getElementById('exercise-list')?.hasAttribute('data-sections');
}

/** Название секции: словарь блоков, а для упражнений без блока — «Прочее». */
export function sectionLabel(id) {
  return id === OTHER_BLOCK ? t('train.sec_other') : blockLabel(id, isRu());
}

/**
 * Определить открытую секцию при (пере)рисовке экрана.
 * @param {import('../shared/logger-sections.js').Section[]} secs
 * @returns {string | null}
 */
export function resolveOpenSection(secs) {
  if (view.sid !== State.startedAt) {
    view.sid = State.startedAt;
    view.open = null;
    view.visited = new Set();
  }
  if (!view.open || !secs.some((s) => s.id === view.open)) {
    view.open = initialSection(secs)?.id ?? null;
  }
  if (view.open) view.visited.add(view.open);
  return view.open;
}

/** Раскрыть/свернуть подходы одной карточки (без побочных эффектов на соседей). */
export function setCardOpen(ei, open) {
  const wrap = document.getElementById(`sets-wrap-${ei}`);
  const chev = document.getElementById(`ex-chevron-${ei}`);
  if (!wrap || !chev) return;
  wrap.style.display = open ? 'block' : 'none';
  chev.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
}

function scrollToEl(el) {
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/**
 * Разложить состояние по DOM: статус каждой секции, итоги в строках и строку
 * «Дальше» под открытой. Дёшево, зовётся после любого изменения подходов.
 */
export function syncSections() {
  const list = document.getElementById('exercise-list');
  if (!list || !sectionsRendered()) return;
  const secs = sectionList(State.plan);
  const openId = view.open;

  /** @type {Map<string, string>} */
  const states = new Map();
  for (const sec of secs) {
    const visible = sec.id === openId || sec.anyDone || view.visited.has(sec.id);
    states.set(sec.id, sec.id === openId ? 'open' : visible ? 'row' : 'hidden');
  }

  for (const sec of secs) {
    const el = /** @type {HTMLElement | null} */ (
      list.querySelector(`.log-sec[data-block="${CSS.escape(sec.id)}"]`)
    );
    if (!el) continue;
    const state = states.get(sec.id) || 'hidden';
    el.dataset.secState = state;
    el.classList.toggle('is-done', sec.allDone);
    const head = /** @type {HTMLElement | null} */ (el.querySelector('.log-sec-head'));
    const sum = el.querySelector('.log-sec-sum');
    if (sum) sum.textContent = t('train.sec_count', { n: `${sec.doneEx}/${sec.total}` });
    if (head) {
      // Открытая секция — не кнопка: тап по её заголовку ничего не делает.
      head.setAttribute('tabindex', state === 'open' ? '-1' : '0');
      if (state === 'open') head.setAttribute('aria-current', 'true');
      else head.removeAttribute('aria-current');
    }
  }

  // «Дальше»: ближайшая за открытой секция с работой, если её ещё не видно.
  const nextEl = /** @type {HTMLElement | null} */ (list.querySelector('.log-sec-next'));
  if (!nextEl) return;
  const openIdx = secs.findIndex((s) => s.id === openId);
  const target = openIdx === -1 ? undefined : secs.slice(openIdx + 1).find((s) => !s.allDone);
  if (!target || states.get(target.id) !== 'hidden') {
    nextEl.hidden = true;
    return;
  }
  nextEl.hidden = false;
  nextEl.dataset.block = target.id;
  nextEl.textContent = t('train.sec_next', {
    name: sectionLabel(target.id),
    count: t('train.sec_count', { n: target.total }),
  });
  list.querySelector(`.log-sec[data-block="${CSS.escape(openId || '')}"]`)?.after(nextEl);
}

/**
 * Открыть секцию (тап по строке, «Дальше», автопереход): прежняя открытая
 * сворачивается в строку, в новой раскрыто первое недоделанное упражнение.
 * @param {string} id
 * @param {{ scroll?: boolean }} [opts]
 */
export function openSection(id, { scroll = true } = {}) {
  if (!sectionsRendered() || view.open === id) return;
  const secs = sectionList(State.plan);
  const sec = secs.find((s) => s.id === id);
  if (!sec) return;
  view.open = id;
  view.visited.add(id);
  const focus = focusInSection(sec, State.plan);
  for (const ei of sec.eis) setCardOpen(ei, ei === focus);
  syncSections();
  if (scroll) {
    // К заголовку, а не к секции: у него scroll-margin-top держит его под шапкой.
    scrollToEl(document.querySelector(`.log-sec[data-block="${CSS.escape(id)}"] > .log-sec-head`));
  }
}

/**
 * Автопереход после закрытия упражнения `ei` (все подходы). В секции есть ещё
 * недоделанное — раскрывается оно; секция закрыта — сворачивается, открывается
 * следующая по порядку, а если дальше секций нет — пропущенная.
 * @param {number} ei
 */
export function advanceFromExercise(ei) {
  const secs = sectionList(State.plan);
  const sec = secs.find((s) => s.eis.includes(ei));
  setCardOpen(ei, false);
  if (!sec) return;
  if (!sec.allDone) {
    const next = focusInSection(sec, State.plan, ei);
    if (next === -1) return;
    setCardOpen(next, true);
    scrollToEl(document.getElementById(`ex-card-${next}`));
    syncSections();
    return;
  }
  const target = nextSection(secs, sec.id);
  if (!target) {
    view.open = null; // тренировка закрыта целиком — открывать нечего, всё строками
    syncSections();
    return;
  }
  openSection(target.id);
}
