// @ts-check
/* ════════════════════════════════════════════════════════
   workout.view/exercise-hint.js — подсказка техники (HINT-1, флаг exercise-hint)
   Полоса в раскрытой карточке: два мини-силуэта + строка «какой тренажёр и движение» +
   шеврон. Тап — шторка «Техника»: имена, снаряд, крупный силуэт, легенда, line + tips.
   Полоса скрывается после HINT_HIDE_AFTER сессий с упражнением; пункт «Техника» в меню ⋮
   при флаге ON есть всегда. Данные и контуры грузятся import() только при флаге ON.
   История — аргументом из рендера (loadWorkoutHistory стора), библиотека — через стор (A15).
   Отдельный модуль: render.js и handlers.js не растут.
   ════════════════════════════════════════════════════════ */

import { State, getExerciseLibrary } from '../workout.store.js';
import { flag } from '../flags.js';
import { on } from '../events.js';
import { esc, haptic } from '../shared/utils.js';
import { getLang, tri } from '../locale.store.js';
import { isPplType } from '../shared/ppl-color.js';
import { resolveHint, sessionsDone, HINT_HIDE_AFTER } from '../shared/hint-resolve.js';

on('wo:hint', (el) => openHintSheet(+el.dataset.ei));

/** @param {string} name @returns {Promise<import('../shared/hint-resolve.js').ResolvedHint|null>} */
async function hintFor(name) {
  const [{ HINTS }, library] = await Promise.all([import('../shared/exercise-hints.js'), getExerciseLibrary()]);
  const lang = /** @type {'ru'|'en'|'el'} */ (getLang());
  return resolveHint(name, HINTS, library, lang);
}

/** @type {Record<string, [string, string, string]>} подписи шторки ru/en/el */
const TEXT = {
  title: ['Техника', 'Technique', 'Τεχνική'],
  open: ['Открыть технику', 'Open technique', 'Άνοιγμα τεχνικής'],
  primary: ['основные', 'primary', 'κύριοι'],
  secondary: ['вспомогательные', 'secondary', 'βοηθητικοί'],
  front: ['спереди', 'front', 'μπροστά'],
  back: ['сзади', 'back', 'πίσω'],
  close: ['Закрыть', 'Close', 'Κλείσιμο'],
};

/** @type {Record<string, [string, string, string]>} снаряд библиотеки → ru/en/el */
const EQ = {
  barbell: ['штанга', 'barbell', 'μπάρα'],
  dumbbell: ['гантели', 'dumbbells', 'αλτήρες'],
  cable: ['блок', 'cable', 'τροχαλία'],
  machine: ['тренажёр', 'machine', 'μηχάνημα'],
  bodyweight: ['свой вес', 'bodyweight', 'σωματικό βάρος'],
  'ez-bar': ['EZ-гриф', 'EZ bar', 'μπάρα EZ'],
  'smith machine': ['машина Смита', 'Smith machine', 'μηχάνημα Smith'],
  kettlebell: ['гиря', 'kettlebell', 'kettlebell'],
  band: ['резина', 'band', 'λάστιχο'],
};

/** @type {Record<string, [string, string, string]>} зона силуэта → ru/en/el */
const ZONE = {
  chest: ['грудь', 'chest', 'στήθος'],
  abs: ['пресс', 'abs', 'κοιλιακοί'],
  obliques: ['косые', 'obliques', 'πλάγιοι'],
  biceps: ['бицепс', 'biceps', 'δικέφαλοι'],
  triceps: ['трицепс', 'triceps', 'τρικέφαλοι'],
  forearm: ['предплечья', 'forearms', 'πήχεις'],
  front_deltoids: ['передняя дельта', 'front delts', 'πρόσθιοι δελτοειδείς'],
  back_deltoids: ['задняя дельта', 'rear delts', 'οπίσθιοι δελτοειδείς'],
  trapezius: ['трапеция', 'traps', 'τραπεζοειδής'],
  upper_back: ['широчайшие и середина спины', 'lats and mid back', 'πλατύς ραχιαίος και μέση πλάτη'],
  lower_back: ['поясница', 'lower back', 'οσφύς'],
  gluteal: ['ягодицы', 'glutes', 'γλουτοί'],
  adductors: ['приводящие', 'adductors', 'προσαγωγοί'],
  quadriceps: ['квадрицепс', 'quads', 'τετρακέφαλοι'],
  hamstring: ['бицепс бедра', 'hamstrings', 'οπίσθιοι μηριαίοι'],
  calves: ['икры', 'calves', 'γάμπες'],
  soleus: ['камбаловидная', 'soleus', 'υποκνημίδιος'],
};

/** Ключ словаря → строка текущего языка; нет в словаре — запасное значение. */
const say = (/** @type {Record<string, [string, string, string]>} */ dict, /** @type {string} */ k, fb = '') =>
  dict[k] ? tri(dict[k][0], dict[k][1], dict[k][2]) : fb;

/** Тон силуэта: PPL-категория библиотеки, прочее (core, cardio) — акцент. */
const tone = (/** @type {string} */ cat) => (isPplType(cat) ? cat : 'core');

/**
 * Силуэт одного вида. Основные зоны — тон категории, вспомогательные — тот же тон
 * приглушённо, прочие — нейтральные (цвета в css/workout.css, блок HINT-1).
 * @param {any} body модуль body-map.js
 * @param {'a'|'p'} v
 * @param {{primary: string[], secondary: string[]}} zones
 * @param {string} cls
 */
function bodyPolys(body, v, zones) {
  return Object.entries(body.BODY[v]).flatMap(([zone, list]) => {
    const c = zones.primary.includes(zone) ? 'is-p' : zones.secondary.includes(zone) ? 'is-s' : body.NEUTRAL.has(zone) ? 'is-n' : '';
    return /** @type {string[]} */ (list).map((pt) => [c, pt]);
  });
}
/** Силуэт строкой — для полосы в разметке рендера. @param {any} body @param {'a'|'p'} v @param {any} zones @param {string} cls */
function bodySvg(body, v, zones, cls) {
  const polys = bodyPolys(body, v, zones).map(([c, pt]) => `<polygon class="${c}" points="${pt}"/>`);
  return `<svg class="${cls}" viewBox="${body.VIEWBOX[v]}" aria-hidden="true">${polys.join('')}</svg>`;
}
const SVG_NS = 'http://www.w3.org/2000/svg';
/** Силуэт DOM-узлом — для шторки (без innerHTML). @param {any} body @param {'a'|'p'} v @param {any} zones @param {string} cls */
function bodyNode(body, v, zones, cls) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('viewBox', body.VIEWBOX[v]);
  svg.setAttribute('aria-hidden', 'true');
  const g = document.createElementNS(SVG_NS, 'g');
  for (const [c, pt] of bodyPolys(body, v, zones)) {
    const p = document.createElementNS(SVG_NS, 'polygon');
    if (c) p.setAttribute('class', c);
    p.setAttribute('points', pt);
    g.append(p);
  }
  svg.append(outlineFilter(`hint-ol-${v}`), g);
  g.setAttribute('filter', `url(#hint-ol-${v})`);
  return svg;
}
/**
 * HINT-1b: тонкий контур тела крупного силуэта. Полигоны разделены зазорами, обводка
 * каждого дала бы линии между мышцами — фильтр смыкает зазоры (dilate→erode, радиус 4
 * единиц viewBox), расширяет маску на 1 единицу и вычитает её: остаётся кольцо только по
 * внешнему краю. Без blur; цвет кольца — flood-color в css/workout.css (блок HINT-1).
 * @param {string} id
 */
function outlineFilter(id) {
  const f = document.createElementNS(SVG_NS, 'filter');
  f.id = id;
  f.setAttribute('class', 'hint-ol');
  /** @type {Array<[string, Record<string, string>]>} */
  const steps = [
    ['feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: '4', result: 'd' }],
    ['feMorphology', { in: 'd', operator: 'erode', radius: '4', result: 'c' }],
    ['feMorphology', { in: 'c', operator: 'dilate', radius: '1', result: 'r' }],
    ['feComposite', { in: 'r', in2: 'c', operator: 'out', result: 'ring' }],
    ['feFlood', {}],
    ['feComposite', { in2: 'ring', operator: 'in', result: 'line' }],
  ];
  for (const [tag, attrs] of steps) {
    const s = document.createElementNS(SVG_NS, tag);
    for (const [k, val] of Object.entries(attrs)) s.setAttribute(k, val);
    f.append(s);
  }
  const merge = document.createElementNS(SVG_NS, 'feMerge');
  for (const src of ['SourceGraphic', 'line']) {
    const m = document.createElementNS(SVG_NS, 'feMergeNode');
    m.setAttribute('in', src);
    merge.append(m);
  }
  f.append(merge);
  return f;
}
/** Элемент с классом и текстом. @param {string} tag @param {string} cls @param {string} [text] @param {Array<Node|string>} [kids] */
function node(tag, cls, text, kids = []) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  n.append(...kids);
  return n;
}

/**
 * Полоса подсказки в раскрытой карточке. Пусто при OFF, у пропущенной карточки, у
 * неизвестного упражнения и после HINT_HIDE_AFTER сессий с ним.
 * @param {any} ex
 * @param {number} ei
 * @param {Array<any>} workouts история из рендера
 * @returns {Promise<string>}
 */
export async function hintStripHtml(ex, ei, workouts) {
  if (!flag('exercise-hint') || ex.skipped) return '';
  if (sessionsDone(workouts, ex.name) >= HINT_HIDE_AFTER) return '';
  const [h, body] = await Promise.all([hintFor(ex.name), import('../shared/body-map.js')]);
  if (!h) return '';
  const caption = h.line || [h.nameRu, say(EQ, h.eq, h.eq)].filter(Boolean).join(' · ');
  return `<button type="button" class="hint-strip" data-tone="${tone(h.cat)}" data-action="wo:hint" data-ei="${ei}" aria-label="${esc(say(TEXT, 'open'))}">
    ${bodySvg(body, 'a', h.zones, 'hint-body is-mini')}${bodySvg(body, 'p', h.zones, 'hint-body is-mini')}
    <span class="hint-line">${esc(caption)}</span>
    <svg class="hint-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>
  </button>`;
}

/**
 * Пункт «Техника» для меню ⋮: при флаге ON есть всегда, даже когда полоса скрыта историей.
 * Нет ни подсказки, ни упражнения в библиотеке — пункта нет (показывать нечего).
 * @param {number} ei
 * @returns {Promise<Array<{label: string, icon: string, action: () => void}>>}
 */
export async function hintMenuItems(ei) {
  const ex = State.plan[ei];
  if (!flag('exercise-hint') || !ex || !(await hintFor(ex.name))) return [];
  const icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="18" height="18"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12" y2="8"/></svg>`;
  return [{ label: say(TEXT, 'title'), icon, action: () => openHintSheet(ei) }];
}

/**
 * Шторка «Техника»: имя ru, имя en + снаряд, крупный силуэт, легенда, line + tips.
 * @param {number} ei
 */
export async function openHintSheet(ei) {
  const ex = State.plan[ei];
  if (!flag('exercise-hint') || !ex) return;
  const [h, body] = await Promise.all([hintFor(ex.name), import('../shared/body-map.js')]);
  if (!h) return;
  haptic(10);
  document.querySelectorAll('.modal-overlay').forEach((o) => o.remove());
  const title = getLang() === 'ru' && h.nameRu ? h.nameRu : h.name;
  const sub = [title !== h.name ? h.name : '', say(EQ, h.eq, h.eq)].filter(Boolean).join(' · ');
  const legend = (/** @type {'primary'|'secondary'} */ k) =>
    h.zones[k].length
      ? [node('li', `hint-lg is-${k === 'primary' ? 'p' : 's'}`, '', [node('i', ''), `${say(TEXT, k)}: ${h.zones[k].map((z) => say(ZONE, z, z)).join(', ')}`])]
      : [];
  const fig = (/** @type {'a'|'p'} */ v, /** @type {string} */ cap) =>
    node('figure', '', '', [bodyNode(body, v, h.zones, 'hint-body is-big'), node('figcaption', '', say(TEXT, cap))]);
  const tech = h.line ? [node('div', 'hint-tech', '', [node('p', 'hint-tech-line', h.line), ...h.tips.map((s) => node('p', '', s))])] : [];
  const close = node('button', 'btn btn-ghost hint-close', say(TEXT, 'close'));
  close.dataset.action = 'wo:closeModal';
  const sheet = node('div', 'modal-sheet hint-sheet', '', [
    node('div', 'modal-handle'),
    node('div', 'hint-title', title),
    ...(sub ? [node('div', 'hint-sub', sub)] : []),
    node('div', 'hint-bodies', '', [fig('a', 'front'), fig('p', 'back')]),
    node('ul', 'hint-legend', '', [...legend('primary'), ...legend('secondary')]),
    ...tech,
    close,
  ]);
  sheet.dataset.tone = tone(h.cat);
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', say(TEXT, 'title'));
  document.body.appendChild(node('div', 'modal-overlay animate-in hint-overlay', '', [sheet]));
}
