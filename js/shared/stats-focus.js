// @ts-check
/* ════════════════════════════════════════════════════════
   stats-focus.js — «График» из карточки оси радара (DATA-4, хвост)

   Nav.go не несёт параметров, а Stats не знает, откуда пришли. Радар кладёт сюда ключ семейства
   (`family:<id>`, как в family-curves.js) перед `Nav.go('s-stats')`; загрузка Stats забирает его
   один раз и подсвечивает карточку семейства. Без карточки (флаг `stats-families` OFF, семейство
   вне топ-N) Stats открывается как раньше. Чистый модуль: ни DOM, ни флагов.
   ════════════════════════════════════════════════════════ */

/** @type {string|null} */
let _family = null;

/** @param {string|null|undefined} family */
export function setStatsFocus(family) { _family = family || null; }

/** Забрать и сбросить: фокус действует на один заход в Stats. @returns {string|null} */
export function takeStatsFocus() {
  const f = _family;
  _family = null;
  return f;
}

/**
 * Карточка нужного семейства среди карточек Stats (ключ — `data-family`, без селекторных escape).
 * @template {{ dataset?: Record<string, string|undefined> }} N
 * @param {ArrayLike<N>} nodes @param {string|null|undefined} family
 * @returns {N|null}
 */
export function findFamilyCard(nodes, family) {
  if (!family) return null;
  for (let i = 0; i < nodes.length; i++) if (nodes[i]?.dataset?.family === family) return nodes[i];
  return null;
}
