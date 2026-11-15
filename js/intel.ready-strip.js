/* ════════════════════════════════════════════════════════
   intel.ready-strip.js — полоса готовности P.A.N.D.A. Core (CORE-02)
   ────────────────────────────────────────────────────────
   Флаг 'core-ready-strip' (дефолт OFF). intel.view.js грузит модуль лениво
   import()-ом только при ON: легаси _buildReadinessWidget остаётся веткой OFF,
   а бут не платит за полосу ни байта.

   Виджет готовности (индекс · четыре слагаемых · ЦНС) сворачивается в одну
   полосу 64 px. Тап раскрывает шкалы панелью ПОВЕРХ ленты: панель absolute
   внутри обёртки, высота обёртки = высота полосы, поэтому лента под ней не
   сдвигается ни на пиксель; въезд — только transform/opacity (css/intel.css).
   ════════════════════════════════════════════════════════ */

import { esc, haptic } from './shared/utils.js';
import { tri } from './locale.store.js';
import { on } from './events.js';

// Раскрытие — класс на обёртке; панель вне потока, поэтому тоггл не трогает
// layout ленты. Закрытая панель inert — без фокуса и клика.
on('intel:toggleReady', (el) => {
  const box = el.closest('.intel-ready');
  if (!box) return;
  const open = box.classList.toggle('is-open');
  box.querySelector('.intel-ready-strip')?.setAttribute('aria-expanded', String(open));
  const panel = box.querySelector('.intel-ready-panel');
  if (panel) {
    panel.toggleAttribute('inert', !open);
    panel.setAttribute('aria-hidden', String(!open));
  }
  haptic(2);
});

/**
 * Числа — те же поля `fetchReadiness()`, что читает легаси-виджет: индекс,
 * четыре слагаемых индекса (восстановление, ACWR, монотонность, тренд) и ЦНС.
 * Сна в движке нет — его шкалы нет и здесь.
 * @param {import('./intel.engine.js').Readiness} data
 * @returns {string}
 */
export function buildReadyStrip(data) {
  const clamp = (n) => Math.max(0, Math.min(100, Number.isFinite(+n) ? Math.round(+n) : 0));
  const tone = (v) => (v >= 90 ? 'is-high' : v >= 50 ? 'is-mid' : 'is-low');
  const title = tri('Готовность', 'Readiness', 'Ετοιμότητα');

  // INTEL-2b: меньше MIN_DATA.parts живых слагаемых — числа нет вообще.
  if (data?.confidence === 'none' || data?.index === null || data?.index === undefined) {
    return `
      <div class="intel-ready">
        <div class="intel-ready-strip is-empty">
          <span class="intel-ready-word">${esc(title)}</span>
          <span class="intel-ready-note">${esc(tri('мало данных — история копится', 'not enough data yet', 'λίγα δεδομένα ακόμα'))}</span>
        </div>
      </div>`;
  }

  const index = clamp(data.index);
  const cns = clamp(data.cns);
  const word =
    index >= 90
      ? tri('Отлично', 'Excellent', 'Άριστα')
      : index >= 70
        ? tri('Хорошо', 'Good', 'Καλά')
        : index >= 50
          ? tri('Удовл.', 'Fair', 'Μέτρια')
          : tri('Внимание', 'Caution', 'Προσοχή');
  const lowNote =
    data.confidence === 'low' ? tri('мало истории', 'little history', 'λίγο ιστορικό') : '';

  // Шкала: заливка — scaleX от 0 до 1 (compositor-only), не width.
  const scale = (label, val, cls = '') => {
    if (val === null || val === undefined) {
      return `
        <div class="intel-ready-row">
          <span class="intel-ready-row-label">${esc(label)}</span>
          <span class="intel-ready-row-none">${esc(tri('нет данных', 'no data', 'χωρίς δεδομένα'))}</span>
        </div>`;
    }
    const v = clamp(val);
    const c = cls || tone(v);
    return `
      <div class="intel-ready-row">
        <span class="intel-ready-row-label">${esc(label)}</span>
        <span class="intel-ready-track"><span class="intel-ready-fill ${c}" style="transform:scaleX(${v / 100})"></span></span>
        <span class="intel-ready-row-val ${c}">${v}</span>
      </div>`;
  };

  return `
    <div class="intel-ready">
      <button type="button" class="intel-ready-strip" data-action="intel:toggleReady" aria-expanded="false" aria-controls="intel-ready-panel">
        <span class="intel-ready-index ${tone(index)}">${index}</span>
        <span class="intel-ready-text">
          <span class="intel-ready-word">${esc(word)}</span>
          ${lowNote ? `<span class="intel-ready-note">${esc(lowNote)}</span>` : ''}
        </span>
        <span class="intel-ready-cns">${esc(tri('ЦНС', 'CNS', 'ΚΝΣ'))} <b>${cns}%</b></span>
        <svg class="intel-ready-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="intel-ready-panel" id="intel-ready-panel" data-action="intel:toggleReady" aria-hidden="true" inert>
        ${scale(title, index)}
        ${scale(tri('Восстановление', 'Recovery', 'Αποκατάσταση'), data.parts?.recovery)}
        ${scale(tri('Нагрузка ACWR', 'ACWR load', 'Φορτίο ACWR'), data.parts?.acwr)}
        ${scale(tri('Монотонность', 'Monotony', 'Μονοτονία'), data.parts?.monotony)}
        ${scale(tri('Тренд нагрузки', 'Load trend', 'Τάση φορτίου'), data.parts?.trend)}
        ${scale(tri('Утомление ЦНС', 'CNS fatigue', 'Κόπωση ΚΝΣ'), cns, 'is-cns')}
      </div>
    </div>`;
}
