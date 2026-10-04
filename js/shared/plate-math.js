// @ts-check
/* ════════════════════════════════════════════════════════
   shared/plate-math.js — какими блинами собрать вес на грифе (PLATE-1a)
   ────────────────────────────────────────────────────────
   Чистая арифметика, без DOM и без чтения хранилища: UI калькулятора
   (PLATE-1b) только рисует то, что вернул `loadPlates`.

   Честность важнее гладкости. Вес на барабане идёт шагом 2 или 2.5, а
   набор блинов собирает только шаг 2.5 (пара самых мелких, 2 × 1.25):
   22 при грифе 20 не собирается — это обычный случай, а не ошибка.
   Модуль не подменяет вес: ниже грифа остаётся «ниже грифа», не
   собираемый вес остаётся не собираемым, рядом даётся ближайший вверх.

   Считаем в целых сотых килограмма: 101.1 * 100 даёт 10109.999…, а
   накопление float по цепочке «вычесть блин» дало бы дробный остаток
   там, где его нет.
   ════════════════════════════════════════════════════════ */

/**
 * @typedef {object} PlateSpec
 * @property {number} kg  номинал
 * @property {string} bg  цвет диска
 * @property {string} fg  цвет подписи на диске
 * @property {number} h   высота диска, px
 * @property {number} w   толщина диска, px
 */

/**
 * Единственный источник номиналов, цветов и размеров блинов.
 * Порядок — от крупного к мелкому: на нём стоит жадный подбор.
 *
 * DS-2 whitelist: хексы ниже — данные, а не декор. Цвета дисков по
 * стандарту IWF (25 красный · 20 синий · 15 жёлтый · 10 зелёный · 5 белый ·
 * 2.5 красный · 1.25 серебро), токеном темы их не выразить.
 *
 * @type {readonly PlateSpec[]}
 */
export const PLATE_SPEC = [
  { kg: 25, bg: '#c62828', fg: '#fff', h: 88, w: 17 },
  { kg: 20, bg: '#1565c0', fg: '#fff', h: 78, w: 15 },
  { kg: 15, bg: '#f9a825', fg: '#000', h: 70, w: 13 },
  { kg: 10, bg: '#2e7d32', fg: '#fff', h: 62, w: 11 },
  { kg: 5, bg: '#e0e0e0', fg: '#000', h: 50, w: 9 },
  { kg: 2.5, bg: '#c62828', fg: '#fff', h: 40, w: 7 },
  { kg: 1.25, bg: '#9e9e9e', fg: '#000', h: 32, w: 5 },
];

/** Грифы, которые умеет выбирать пользователь, кг. */
export const BAR_OPTIONS = [20, 15, 10];
export const DEFAULT_BAR = 20;

const CENTI = 100;
/** @param {number} kg */
const toCenti = (kg) => Math.round(kg * CENTI);
/** @param {number} centi */
const fromCenti = (centi) => centi / CENTI;

/** Вес пары блинов (по одному на сторону), сотые кг. */
const PAIRS = PLATE_SPEC.map((p) => ({ kg: p.kg, centi: toCenti(p.kg) * 2 }));
/**
 * Шаг сетки собираемых весов — пара самых мелких блинов. Любой собираемый
 * вес лежит на этой сетке, потому что каждый номинал кратен самому мелкому
 * (держит `test/plate-math.test.js`); добавили 0.5 или 2 — сетка и жадность
 * надо пересматривать.
 */
const GRID_CENTI = Math.min(...PAIRS.map((p) => p.centi));

/** Шаг собираемых весов, кг (2.5). */
export const LOAD_STEP = fromCenti(GRID_CENTI);

/**
 * @typedef {{ kg: number, n: number }} PlateCount  n блинов номинала kg на каждую сторону
 *
 * @typedef {object} PlateLoad
 * @property {'exact'|'unreachable'|'below-bar'} status
 *   exact — вес собирается · unreachable — не собирается · below-bar — меньше грифа
 * @property {PlateCount[]} plates  на одну сторону, от крупного к мелкому. Для
 *   `unreachable` — ближайший собираемый вес снизу, для `below-bar` — пусто
 * @property {number} loaded  вес на грифе вместе с грифом, кг. Для `below-bar` — сам
 *   гриф, для `unreachable` — ближайший собираемый снизу
 * @property {number} perSide  вес блинов на одну сторону, кг
 * @property {{ total: number, delta: number, plates: PlateCount[] } | null} up
 *   только для `unreachable`: ближайший собираемый вес вверх, сколько до него
 *   добавить и чем он собирается
 */

/**
 * Блины на одну сторону под вес блинов `spanCenti` (на обе стороны), жадно.
 * Остатка нет: `spanCenti` лежит на сетке, а номиналы ей кратны.
 * @param {number} spanCenti
 * @returns {PlateCount[]}
 */
function fill(spanCenti) {
  /** @type {PlateCount[]} */
  const plates = [];
  let rest = spanCenti;
  for (const { kg, centi } of PAIRS) {
    const n = Math.floor(rest / centi);
    if (n > 0) {
      plates.push({ kg, n });
      rest -= n * centi;
    }
  }
  return plates;
}

/** Не число и не конечное — это 0: вес из поля ввода, не из конфига. */
const asWeight = (/** @type {unknown} */ x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/**
 * @param {number} bar
 * @returns {number} гриф в сотых кг
 */
function barCenti(bar) {
  if (!Number.isFinite(bar) || bar < 0) throw new RangeError(`bar must be a finite non-negative number, got ${bar}`);
  return toCenti(bar);
}

/**
 * Чем собрать `total` кг на грифе `bar` кг. Вес округляется до 0.01 кг;
 * не число — это 0.
 * @param {number} total
 * @param {number} [bar]
 * @returns {PlateLoad}
 */
export function loadPlates(total, bar = DEFAULT_BAR) {
  const barC = barCenti(bar);
  const wantC = toCenti(asWeight(total));
  if (wantC < barC) return { status: 'below-bar', plates: [], loaded: fromCenti(barC), perSide: 0, up: null };

  const spanC = wantC - barC;
  const downC = Math.floor(spanC / GRID_CENTI) * GRID_CENTI;
  const exact = downC === spanC;
  const upC = downC + GRID_CENTI;
  return {
    status: exact ? 'exact' : 'unreachable',
    plates: fill(downC),
    loaded: fromCenti(barC + downC),
    perSide: fromCenti(downC / 2),
    up: exact ? null : { total: fromCenti(barC + upC), delta: fromCenti(upC - spanC), plates: fill(upC) },
  };
}

/**
 * Соседний собираемый вес: `dir > 0` — вверх, иначе вниз. Всегда шагает на
 * сетку, откуда бы ни стартовал (22 → 22.5 вверх, → 20 вниз). Ниже грифа
 * вверх идёт к грифу, вниз — не двигается: подбирать там нечего.
 * @param {number} weight
 * @param {number} bar
 * @param {number} dir
 * @returns {number}
 */
export function stepLoadable(weight, bar, dir) {
  const barC = barCenti(bar);
  const wantC = toCenti(asWeight(weight));
  if (dir > 0) {
    if (wantC < barC) return fromCenti(barC);
    return fromCenti(barC + (Math.floor((wantC - barC) / GRID_CENTI) + 1) * GRID_CENTI);
  }
  if (wantC <= barC) return fromCenti(wantC);
  return fromCenti(barC + (Math.ceil((wantC - barC) / GRID_CENTI) - 1) * GRID_CENTI);
}

/**
 * Гриф из хранилища (строка, число, null) — в один из `BAR_OPTIONS`.
 * Всё прочее — `DEFAULT_BAR`: `parseFloat(x) || 20` пропускал и -5, и 7.
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizeBar(raw) {
  const n = Number(raw);
  return BAR_OPTIONS.includes(n) ? n : DEFAULT_BAR;
}
