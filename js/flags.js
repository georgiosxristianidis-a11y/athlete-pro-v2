// @ts-check
/* ════════════════════════════════════════════════════════
   flags.js — Feature flags (Strangler-Fig safety switch)
   ────────────────────────────────────────────────────────
   Hide in-progress / risky code paths behind a switch so a broken
   rewrite is a one-line flip, never a desperate `git reset --hard`.

   Pattern (Strangler-Fig):
     import { flag } from './flags.js';
     if (flag('v2-workout-view')) renderWorkoutV2();
     else                         renderWorkoutLegacy();   // 100% working

   Defaults below are the source of truth (ship OFF for unfinished work).
   Per-DEVICE override without a deploy — flip from DevTools console:
     Flags.setFlag('v2-workout-view', true)   // try it
     Flags.setFlag('v2-workout-view', false)  // kill switch if it breaks
     Flags.allFlags()                          // inspect
   Override is stored in localStorage('ap-flag-<name>') = '1' | '0'.
   ════════════════════════════════════════════════════════ */

/** @type {Record<string, boolean>} New v2 paths default OFF until released. */
const DEFAULTS = {
  // Add forward flags here, e.g.:
  // 'v2-workout-view': false,

  // PERF-DRUM: set-logger drums render a ~15-item window around the current
  // value instead of the full range (was 86% of the workout screen's DOM).
  // Kill switch on device: Flags.setFlag('drum-virtual', false)
  // 2026-07-09: default OFF — matches prod 1.21.1. The e4b2df6 scrollTop↔index
  // math fix proved insufficient in the field (weight still zeroed), so we fall
  // back to the proven kill-switch until virtualization is reworked.
  'drum-virtual': false,

  // DRUM-PERF-2 (flag 'drum-window'): set-logger drums render a ±20-item
  // window around the current value (DOM cap, fresh nodes each rebuild — no
  // recycling). Unlike 'drum-virtual', the window is NEVER rebuilt mid-scroll:
  // only at rest (scrollend commit / programmatic seek), so mandatory
  // scroll-snap cannot yank the position during a gesture — the exact
  // drum-virtual field-failure mode. Default OFF until Gio's field check.
  // Kill switch on device: Flags.setFlag('drum-window', false)
  'drum-window': false,

  // FAB-VIDEO: Claude FAB renders the live panda video with voiceover instead
  // of the SVG icon. Audio lives inside the mp4 track (one <video> = picture
  // and voice always in sync); the zoom is driven by video.currentTime, not
  // timers. Starts muted (autoplay policy), sound toggled by the mini button.
  // ON by default since SKIN-0 (2026-08-21): behind OFF nobody met the mascot
  // except the few who found the toggle in Profile, and the PANDA-SKINS
  // cosmetics line is built on top of a face that has to be on screen first.
  // Kill switch on device: Flags.setFlag('fab-video', false)
  'fab-video': true,

  // PANDA-1 «Бамбуковый счёт»: маскот перестаёт быть обоями и реагирует на
  // тренировку — мимика лупится внутри сегмента assets/panda-voice.mp4
  // (js/shared/panda-mood.js), перебор отдыха включает осуждение, в сводке
  // считается счёт «твои подходы vs его бамбук».
  // Рендерится в видео-FAB, поэтому читать ТОЛЬКО в паре с 'fab-video':
  // flag('panda-moods') && flag('fab-video'). Тумблер в профиле жмёт оба.
  // Режим отказа: нарезка по currentTime даёт видимый рывок на стыке или
  // грызёт батарею на слабом телефоне → выключить и вернуться к ровному лупу.
  // ON по умолчанию с SKIN-0 (2026-08-21) вместе с 'fab-video': тумблер в
  // Профиле и так жал оба сразу, дефолт просто перестал это прятать.
  // Kill switch on device: Flags.setFlag('panda-moods', false)
  'panda-moods': true,

  // USAGE-STATS: счётчик живых установок (js/usage.js). ON поднимает
  // /_vercel/insights/script.js и шлёт ровно три события — app_open,
  // workout_completed, coach_message — без содержимого сообщений, весов и
  // идентификаторов (белый список полей в SCHEMA). Поверх флага стоят ещё
  // четверо ворот: DNT/GPC браузера, самоисключение автора, тумблер в
  // «Приватности» и прод-хост. Дефолт ON (LAUNCH-4): на проде скрипт уже
  // 200. Kill switch on device: Flags.setFlag('usage-stats', false)
  'usage-stats': true,

  // ISL-PROFILE: Dynamic Island layout profiles. ON exposes the profile
  // system (Minimal-DHL default + Apple legacy), chosen in Island Settings
  // and persisted in island-profile.store.js. Kill switch → island reverts
  // to the proven Apple-2-state path: Flags.setFlag('island-profiles', false)
  'island-profiles': true,

  // CORE-S / photo: on the P.A.N.D.A. Core screen (js/intel.view.js) the
  // «ГЕНЕРАЦИЯ» card and the attach-photo path (camera button, file input,
  // preview) are hidden. Both are half-built: «ГЕНЕРАЦИЯ» only focuses the
  // input, and the Vision path sends every photo as image/png (Anthropic
  // silently drops it), with no client-side downscale — a phone photo 413s.
  // Code stays next to the flag (Strangler-Fig), the server Vision branch in
  // lib/aiOrchestrator.js is untouched. Avatar upload (athlete-photo) is a
  // different thing and never reads this flag.
  // Default OFF until Vision is finished (correct mime + resize).
  // Try on device: Flags.setFlag('core-photo-generate', true)
  'core-photo-generate': false,

  // FRAME-1: замер кадров в рантайме (js/shared/frame-meter.js) — p95 кадра,
  // % пропусков, long tasks > 50 мс, экспорт JSON. Debug-инструмент для
  // motion-карточек; на пользователей не влияет, пока OFF (дефолт).
  // Включить на телефоне: Flags.setFlag('frame-meter', true) и перезагрузить.
  'frame-meter': false,

  // LOG-SEC-1: секционный режим сет-логгера (js/workout.view/sections.js).
  // На экране активной тренировки открыта одна секция (блок плана), в ней
  // развёрнуто одно упражнение; закрытые и начатые — строкой с прогрессом,
  // следующая — строкой «Дальше». Закрыл последнее упражнение секции — через
  // 0,5 с открывается следующая. OFF — как после #488: все секции видны,
  // раскрыто одно упражнение. Дефолт ON по карточке LOG-SEC-1.
  // Kill switch on device: Flags.setFlag('logger-sections', false)
  'logger-sections': true,

  // SW-CACHE: на тёплом старте SW отдаёт JS/CSS/HTML из CACHE_NAME без сети
  // (зал, слабый Wi-Fi). Цена — обновление доезжает на запуск позже. Флаг
  // постится в SW из js/app.js; на localhost SW всегда network-first.
  // Default OFF до поля Gio. Kill switch: Flags.setFlag('sw-cache-first', false)
  'sw-cache-first': false,

  // BOOT-1 «Контент»: карточки Home входят одной лесенкой на --stagger-i
  // (пружина, шаг 48 мс, гейдж строго после заголовка), а числа трёх чипов
  // докручиваются барабаном только в изменившихся разрядах (js/shared/
  // digit-roll.js, база — localStorage 'ap-dash-seen'). OFF — как на проде:
  // DESIGN-3 в css/dashboard.css и числа появляются готовыми.
  // Читается в dashboard.js после данных, к этому моменту модуль загружен.
  // Default OFF до поля Gio. Kill switch: Flags.setFlag('boot-cascade', false)
  'boot-cascade': false,
  // WSET-1: тоннаж, объём и значки — только рабочие подходы силовых упражнений
  // (js/shared/working-sets.js): подводящие и пресс/поясница вне счёта.
  // Пересчёт на чтении в js/db/workouts.js, записи в IDB не меняются.
  // Default OFF до поля Gio. Kill switch: Flags.setFlag('working-sets', false)
  'working-sets': false,
};

/** @param {string} name @returns {boolean} */
export function flag(name) {
  try {
    const ls = localStorage.getItem('ap-flag-' + name);
    if (ls === '1') return true;
    if (ls === '0') return false;
  } catch { /* SSR / private mode — fall through to default */ }
  return !!DEFAULTS[name];
}

/** @param {string} name @param {boolean} on */
export function setFlag(name, on) {
  try { localStorage.setItem('ap-flag-' + name, on ? '1' : '0'); } catch { /* ignore */ }
}

/** @returns {Record<string, boolean>} effective value of every known flag */
export function allFlags() {
  return Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, flag(k)]));
}

/**
 * LAB-1 — флаги, выведенные тумблерами в «Лабораторию» Профиля: полевой чек с
 * телефона, где консоли DevTools нет. Только то, что ждёт поля, плюс kill
 * switch, который может понадобиться посреди тренировки. `drum-*` сюда не идут
 * намеренно: в поле они обнуляли вес. Новый флаг на поле — одна строка здесь
 * и две строки словаря `lab.<имя>` / `lab.<имя>_sub`.
 */
export const LAB_FLAGS = Object.freeze(['sw-cache-first', 'boot-cascade', 'logger-sections']);

/** @param {string} name @returns {boolean} есть ли на устройстве своё значение поверх дефолта */
export function isOverridden(name) {
  try {
    return localStorage.getItem('ap-flag-' + name) !== null;
  } catch {
    return false;
  }
}

/**
 * Тумблер Лаборатории. Значение, совпавшее с дефолтом, снимает override, а не
 * пишет '0'/'1': иначе выключенный однажды флаг пережил бы релиз, в котором
 * дефолт стал ON, и устройство навсегда осталось бы на старом пути.
 * @param {string} name @param {boolean} on
 */
export function setLabFlag(name, on) {
  try {
    if (on === !!DEFAULTS[name]) localStorage.removeItem('ap-flag-' + name);
    else localStorage.setItem('ap-flag-' + name, on ? '1' : '0');
  } catch { /* private mode — тумблер просто не сохранится */ }
}

// Console handle for live toggling during testing.
if (typeof window !== 'undefined') window.Flags = { flag, setFlag, allFlags };
