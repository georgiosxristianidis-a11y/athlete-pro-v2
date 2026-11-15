// @ts-check
/**
 * CORE-06 — «На устройстве · 0 ₽»: спокойный режим Core без ИИ.
 *
 * Было: плашка с замком «Локальный режим… ИИ выключен» и «НЕТ КЛЮЧА» в шапке —
 * пугает и ничего не даёт. Стало: карточка того, что Панда уже делает на
 * телефоне (нагрузка по мышцам за 72 ч, биометрия без ИИ), и тихая дверь
 * «Подключить ключ» в настройки ИИ. Числа — из тех же локальных движков, что
 * и раньше (`Heatmap.compute()` → `fatiguePercent`), сети здесь нет вовсе.
 *
 * Флаг 'core-on-device' (дефолт OFF): OFF — шапка и плашка побитно прежние.
 * Тексты — через tri(): словарь locale.store.js стоит на потолке храповика.
 */
import { flag } from './flags.js';
import { isCoachLocal } from './intel.store.js';
import { Heatmap } from './claude.store.js';
import { fatiguePercent } from './shared/coach-snapshot.js';
import { html, raw } from './shared/utils.js';
import { tri } from './locale.store.js';
import { canAskAiConsent } from './ai-consent.view.js';

/** Сколько мышц показывать: карточка — сводка, полный список живёт в БИОМЕТРИИ. */
export const ON_DEVICE_MUSCLES_MAX = 4;
/** Порог «устала» — тот же, что у локального разбора (`LOCAL_THRESHOLDS.musclePct`). */
const TIRED_PCT = 60;

/** @returns {boolean} Core рисует режим «На устройстве» вместо плашки с замком. */
export function onDeviceMode() {
  return isCoachLocal() && flag('core-on-device');
}

/** @type {Record<string, [string, string, string]>} id мышцы из MUSCLE_MAP → ru/en/el */
const MUSCLE_NAMES = {
  chest: ['Грудь', 'Chest', 'Στήθος'],
  'upper-chest': ['Верх груди', 'Upper chest', 'Άνω στήθος'],
  'front-delt': ['Передняя дельта', 'Front delt', 'Πρόσθιος δελτοειδής'],
  'mid-delt': ['Средняя дельта', 'Side delt', 'Μέσος δελτοειδής'],
  'rear-delt': ['Задняя дельта', 'Rear delt', 'Οπίσθιος δελτοειδής'],
  rotator: ['Ротаторы', 'Rotator cuff', 'Στροφικό πέταλο'],
  tricep: ['Трицепс', 'Triceps', 'Τρικέφαλος'],
  bicep: ['Бицепс', 'Biceps', 'Δικέφαλος'],
  brachialis: ['Брахиалис', 'Brachialis', 'Βραχιόνιος'],
  lat: ['Широчайшие', 'Lats', 'Πλατύς ραχιαίος'],
  trap: ['Трапеция', 'Traps', 'Τραπεζοειδής'],
  'upper-trap': ['Верх трапеции', 'Upper traps', 'Άνω τραπεζοειδής'],
  'mid-trap': ['Середина трапеции', 'Mid traps', 'Μέσος τραπεζοειδής'],
  'lower-back': ['Поясница', 'Lower back', 'Οσφύς'],
  quad: ['Квадрицепс', 'Quads', 'Τετρακέφαλος'],
  hamstring: ['Бицепс бедра', 'Hamstrings', 'Οπίσθιοι μηριαίοι'],
  glute: ['Ягодицы', 'Glutes', 'Γλουτοί'],
  calf: ['Икры', 'Calves', 'Γάμπες'],
};

/** @param {string} id */
function muscleName(id) {
  const n = MUSCLE_NAMES[id];
  return n ? tri(n[0], n[1], n[2]) : id;
}

/**
 * Подпись и точка в шапке Core. Режим «На устройстве» — статичная точка
 * (`airgap`, без мигания) и спокойный текст вместо «НЕТ КЛЮЧА».
 * @param {{ keyOk: string, keyAirgap: string, keyMissing: string }} L
 * @param {boolean} hasKey
 * @param {string} source
 * @returns {{ dot: string, cls: string, text: string }}
 */
export function keyBadge(L, hasKey, source) {
  if (hasKey) return { dot: 'active', cls: 'is-ok', text: L.keyOk };
  if (onDeviceMode()) return { dot: 'airgap', cls: 'is-device', text: tri('На устройстве', 'On device', 'Στη συσκευή') };
  return { dot: 'missing', cls: 'is-missing', text: source === 'airgap' ? L.keyAirgap : L.keyMissing };
}

/**
 * Строки мышц: топ по нагрузке, потолок, порог «устала». Чистая — гоняет unit-тест.
 * @param {Record<string, number>} musclePct id мышцы → 0..100 (`fatiguePercent`)
 * @returns {Array<{ name: string, pct: number, high: boolean }>}
 */
export function onDeviceRows(musclePct) {
  return Object.entries(musclePct || {})
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, ON_DEVICE_MUSCLES_MAX)
    .map(([id, raw]) => {
      const pct = Math.max(0, Math.min(100, Math.round(raw)));
      return { name: muscleName(id), pct, high: pct >= TIRED_PCT };
    });
}

/**
 * Статичная часть карточки — ложится в шаблон экрана вместо плашки с замком.
 * Мышцы приходят асинхронно в слот `#intel-device-muscles` (renderOnDevice).
 * «Включить ИИ» — только там, где шторка согласия открывается (не airgap):
 * та же дверь, что была у плашки, флаг её не отнимает.
 * @param {{ canEnableAi?: boolean }} [opts]
 * @returns {string}
 */
export function onDeviceCardHtml({ canEnableAi = canAskAiConsent() } = {}) {
  const enable = canEnableAi
    ? html`<button type="button" class="intel-device-link" data-action="intel:enableAi">${tri('Включить ИИ', 'Turn on AI', 'Ενεργοποίηση AI')}</button>`
    : '';
  return html`
      <section class="intel-device" aria-labelledby="intel-device-title">
        <div class="intel-device-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
          <h2 class="intel-device-title" id="intel-device-title">${tri('На устройстве · 0 ₽', 'On device · free', 'Στη συσκευή · δωρεάν')}</h2>
        </div>
        <p class="intel-device-text">${tri('Нагрузку, ACWR и ЦНС считаю на телефоне. Данные никуда не уходят.', 'I compute load, ACWR and CNS on your phone. Your data stays here.', 'Υπολογίζω φορτίο, ACWR και ΚΝΣ στο τηλέφωνο. Τα δεδομένα μένουν εδώ.')}</p>
        <div class="intel-device-label">${tri('Мышцы · 72 ч', 'Muscles · 72 h', 'Μύες · 72 ώρες')}</div>
        <div id="intel-device-muscles" aria-live="polite"></div>
        <div class="intel-device-actions">
          <button type="button" class="intel-device-btn" data-action="intel:biometrics">${tri('Биометрия без ИИ', 'Biometrics without AI', 'Βιομετρικά χωρίς AI')}</button>
          <button type="button" class="intel-device-btn is-quiet" data-action="intel:openSettings">${tri('Подключить ключ', 'Connect a key', 'Σύνδεση κλειδιού')}</button>
          ${raw(enable)}
        </div>
      </section>`;
}

/**
 * Данные — только локальная база: тот же Heatmap, что кормит БИОМЕТРИЮ и
 * снимок коуча. Отказ базы — пусто, не ошибка.
 * @returns {Promise<Record<string, number>>}
 */
export async function onDeviceMuscles() {
  try {
    return fatiguePercent(await Heatmap.compute());
  } catch {
    return {};
  }
}

/**
 * Слот мышц — DOM-узлами через textContent: имена не проходят через HTML вовсе.
 * @param {HTMLElement|null} slot `#intel-device-muscles`
 */
export async function renderOnDevice(slot) {
  if (!slot) return;
  const rows = onDeviceRows(await onDeviceMuscles());
  if (slot.isConnected === false) return;
  const el = (/** @type {string} */ tag, /** @type {string} */ cls, text = '') => {
    const n = document.createElement(tag);
    n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  if (!rows.length) {
    slot.replaceChildren(el('p', 'intel-device-empty', tri('Мышцы свежие: за 72 часа нагрузки не было.', 'Muscles are fresh: no load in the last 72 hours.', 'Οι μύες είναι ξεκούραστοι: κανένα φορτίο τις τελευταίες 72 ώρες.')));
    return;
  }
  const list = el('ul', 'intel-device-muscles');
  for (const r of rows) {
    const li = el('li', `intel-device-row${r.high ? ' is-high' : ''}`);
    const track = el('span', 'intel-device-track');
    const fill = el('span', 'intel-device-fill');
    fill.style.transform = `scaleX(${r.pct / 100})`;
    track.append(fill);
    li.append(el('span', 'intel-device-name', r.name), track, el('span', 'intel-device-pct', `${r.pct}%`));
    list.append(li);
  }
  slot.replaceChildren(list);
}
