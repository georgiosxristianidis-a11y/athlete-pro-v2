// @ts-check
/* ════════════════════════════════════════════════════════
   radar-axis-card.js — DATA-4, карточка оси радара силы (вариант A, выбор Gio 07.11)

   Тап по оси радара открывает под ним карточку: «Мой максимум» (вес × повторы реально
   поднятого подхода), 1ПМ и уровень (те же числа, по которым радар считает ось), семейство и
   мышцы из реестра DATA-1, «График» → Stats. Объём и Регулярность — одна строка без «Графика».
   Всё за флагом `muscles-ui`; вызывающий (hexagon-radar.js) зовёт модуль только при ON.

   Чистый модуль: ни DOM, ни events.js, ни флагов — обработчики вешает hexagon-radar.js.
   ════════════════════════════════════════════════════════ */

import { tri, isRu } from '../locale.store.js';
import { esc } from '../shared/utils.js';
import { fmtNum } from '../shared/format.js';
import { exrxTier } from '../strength-engine.js';
import { EXERCISES, MUSCLE_RU, getExercise } from '../shared/exercise-registry.js';

/** @type {Record<string, [string, string, string]>} */
const TIER = {
  untrained: ['Новичок', 'Untrained', 'Αγύμναστος'],
  novice: ['Начинающий', 'Novice', 'Αρχάριος'],
  intermediate: ['Средний', 'Intermediate', 'Μέτριος'],
  advanced: ['Продвинутый', 'Advanced', 'Προχωρημένος'],
  elite: ['Элита', 'Elite', 'Ελίτ'],
};

/**
 * @typedef {Object} AxisCtx
 * @property {{ bench?: number, squat?: number, deadlift?: number, ohp?: number }} oneRMs
 * @property {number} bw
 * @property {'m'|'f'} sex
 * @property {number} age
 * @property {Map<string, import('../shared/exercise-records.js').ExerciseRecord>} records
 * @property {number} monthVol    тоннаж за 30 дней, кг
 * @property {number} sessions30d
 */

/** @returns {string} */
export function hintHtml() {
  return `<div class="pp-radar-hint">${tri('Тапни вершину или подпись оси.', 'Tap a vertex or an axis label.', 'Πάτα μια κορυφή ή την ετικέτα άξονα.')}</div>`;
}

/**
 * Повторный тап по выбранной оси снимает выбор.
 * @param {string|null} current @param {string} tapped
 * @returns {string|null}
 */
export function nextSelection(current, tapped) {
  return current === tapped ? null : tapped;
}

/** @param {{ key?: string }} e */
export function isActivateKey(e) {
  return e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar';
}

/**
 * Лучший подход оси: максимум по весу, при равенстве по повторам, среди рекордов её lift.
 * @param {Map<string, import('../shared/exercise-records.js').ExerciseRecord>} records @param {string} lift
 */
export function topRecordFor(records, lift) {
  /** @type {import('../shared/exercise-records.js').ExerciseRecord|null} */
  let best = null;
  for (const rec of records.values()) {
    if (rec.lift !== lift) continue;
    const m = rec.myMax;
    if (!best || m.weight > best.myMax.weight || (m.weight === best.myMax.weight && m.reps > best.myMax.reps)) best = rec;
  }
  return best;
}

/** @param {string} k @param {string} v */
const row = (k, v) => `<div class="pp-rc-row"><span class="pp-rc-k">${esc(k)}</span><span class="pp-rc-v">${v}</span></div>`;

/**
 * @param {{ key: string, label: string }} axis
 * @param {AxisCtx} ctx
 * @returns {string}
 */
export function axisCardHtml(axis, ctx) {
  const head = `<div class="pp-rc-head">${esc(axis.label)}</div>`;
  if (axis.key === 'volume') {
    return head + `<div class="pp-rc-info">${tri(`Тоннаж за 30 дней: ${fmtNum(ctx.monthVol)} кг.`, `30-day tonnage: ${fmtNum(ctx.monthVol)} kg.`, `Όγκος 30 ημερών: ${fmtNum(ctx.monthVol)} kg.`)}</div>`;
  }
  if (axis.key === 'consist') {
    return head + `<div class="pp-rc-info">${tri(`${ctx.sessions30d} сессий из 20 за 30 дней.`, `${ctx.sessions30d} of 20 sessions in 30 days.`, `${ctx.sessions30d} από 20 προπονήσεις σε 30 ημέρες.`)}</div>`;
  }

  const lift = axis.key;
  const rec = topRecordFor(ctx.records, lift);
  const rm = Number(/** @type {Record<string, number|undefined>} */ (ctx.oneRMs)[lift]) || 0;
  if (!rec && !rm) {
    return head + `<div class="pp-rc-info">${tri('Нет данных. Запиши подход — ось оживёт.', 'No data yet. Log a set and the axis comes alive.', 'Χωρίς δεδομένα. Κατέγραψε ένα σετ.')}</div>`;
  }

  let body = '';
  if (rec) body += row(tri('Мой максимум', 'My max', 'Το μέγιστό μου'), `${fmtNum(rec.myMax.weight)} × ${rec.myMax.reps}`);
  if (rm > 0) {
    const t = exrxTier({ lift: /** @type {any} */ (lift), sex: ctx.sex, bodyweight: ctx.bw, oneRM: rm, age: ctx.age });
    const lvl = t && TIER[t.tier] ? ` · ${esc(tri(...TIER[t.tier]))}` : '';
    body += row(tri('1ПМ', '1RM', '1RM'), `${fmtNum(Math.round(rm))} ${tri('кг', 'kg', 'kg')}${lvl}`);
  }

  // Семейство и мышцы — из реестра (русские подписи; в en/el строка скрыта, как и в пикере — только ru).
  const entry = (rec && getExercise(rec.id)) || EXERCISES.find((e) => e.lift === lift) || null;
  const muscles = entry && isRu()
    ? `<div class="pp-rc-muscles">${esc(entry.familyRu)} · ${entry.muscles.map((m) => esc(/** @type {Record<string, string>} */ (MUSCLE_RU)[m] || m)).join(', ')}</div>`
    : '';
  const go = `<button type="button" class="btn-text pp-radar-go" data-action="radar-open-stats">${tri('График', 'Chart', 'Γράφημα')}</button>`;
  return head + body + muscles + go;
}
