// @ts-check
/* ════════════════════════════════════════════════════════
   orm-list.js — список 1RM в аналитике: склейка и сворачиваемая секция (ANL-2)
   Чистый модуль без DOM-запросов: view только вешает действие и гонит Spring.
   ════════════════════════════════════════════════════════ */

import { esc } from './utils.js';
import { canonicalKey, canonicalName } from './exercise-identity.js';

/** id тела списка: на него указывает aria-controls тоггла. */
export const ORM_BODY_ID = 'orm-list';

/**
 * Строки 1RM для показа: одно движение под разными именами (NAME-1) — одна строка
 * с максимумом, по убыванию значения. Вход не мутируется.
 * @param {ReadonlyArray<{ id?: string, value?: number }>|undefined} orms
 * @returns {Array<{ id: string, value: number }>}
 */
export function mergeORMRows(orms) {
  /** @type {Map<string, { id: string, value: number }>} */
  const byKey = new Map();
  for (const o of orms ?? []) {
    const key = canonicalKey(o?.id ?? '');
    const value = Number(o?.value);
    if (!key || !Number.isFinite(value)) continue;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { id: canonicalName(o.id ?? ''), value });
    else if (value > prev.value) prev.value = value;
  }
  return [...byKey.values()].sort((a, b) => b.value - a.value);
}

/**
 * Секция «Рекорды (1RM)»: заголовок — кнопка-тоггл с числом записей, список
 * свёрнут. Нативная `<button>` даёт Enter/Space без своего кода; `inert` на
 * свёрнутом теле убирает строки (`tabindex=0`) из Tab-порядка.
 * @param {Array<{ id: string, value: number }>} rows результат mergeORMRows
 * @param {{ title: string }} opts уже локализованный заголовок
 * @returns {string} пустая строка, если записей нет
 */
export function ormSectionHtml(rows, { title }) {
  if (!rows.length) return '';
  const items = rows
    .map(
      (o, i) => `
        <div class="orm-row" data-action="analytics:openExercise" data-exercise="${esc(o.id)}" role="button" tabindex="0" aria-label="${esc(o.id)}">
          <div class="orm-name">${esc(o.id)}</div>
          <div class="orm-val">${o.value}<span class="orm-unit">kg</span></div>
          <div class="orm-bar-wrap"><div class="orm-bar-fill" id="an-orm-bar-${i}" style="background:var(--c-legs)"></div></div>
        </div>`
    )
    .join('');
  return `
    <button type="button" class="list-toggle list-toggle-section" data-action="analytics:toggleORM" aria-expanded="false" aria-controls="${ORM_BODY_ID}">
      <span class="section-label">${esc(title)}</span>
      <span class="list-toggle-count">${rows.length}</span>
      <svg class="list-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" aria-hidden="true">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
    <div id="${ORM_BODY_ID}" class="list-collapse" inert>
      <div class="list-collapse-inner">${items}
      </div>
    </div>`;
}

/**
 * Единственное место, где меняется состояние тоггла: aria-expanded, классы
 * (шеврон и grid-раскрытие) и inert идут вместе, иначе они расходятся.
 * @param {Element} toggle
 * @param {Element} body
 * @param {boolean} expanded
 */
export function setORMExpanded(toggle, body, expanded) {
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.classList.toggle('expanded', expanded);
  body.classList.toggle('expanded', expanded);
  body.toggleAttribute('inert', !expanded);
}
