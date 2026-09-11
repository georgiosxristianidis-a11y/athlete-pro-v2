// @ts-check
/* ════════════════════════════════════════════════════════
   intel.voice-wave.js — живая волна на озвучке тренера (карточка VOICE-2)
   ────────────────────────────────────────────────────────
   Пока P.A.N.D.A. Core говорит, рядом с репликой идёт эквалайзер, снятый
   с настоящего звука через Web Audio, а не изображающий речь ключевыми кадрами.

   Три мины, на которых стоит вся конструкция:

   1. `createMediaElementSource` УВОДИТ звук из <audio> в граф. Если контекст
      не поднялся (политика автоплея), граф молчит — и голоса нет вообще.
      Поэтому элемент не трогаем, пока `ctx.state !== 'running'`: без Web Audio
      волна живёт на ключевых кадрах, звук в этом случае идёт мимо графа.
   2. Класс `.intel-wave-bar` занят волной кнопки отправки (`css/intel.css`,
      «канал занят»). Глобальный `querySelectorAll('.intel-wave-bar')` из
      невлитого `f7fdb95` угонял её столбики и оставлял на них инлайновый
      transform после конца реплики. Здесь своё имя — `.intel-voice-wave-bar`.
   3. Полосы спектра логарифмические, а не равные. Речь живёт в нижних бинах:
      при линейной нарезке 32 бинов на пять столбиков верхние два стоят мёртвые.
   ════════════════════════════════════════════════════════ */

/** Столбиков в волне. Пять — как у реплики маскота (`.talk-wave` в base.css). */
export const BAR_COUNT = 5;

/** Ниже этого столбик не опускается: пустая полоска читается как поломка. */
export const MIN_SCALE = 0.15;

/**
 * Границы полос в бинах анализатора (fftSize 64 → 32 бина, TTS 24 кГц →
 * ~375 Гц на бин). Выше 16-го бина (≈6 кГц) в синтезированной речи пусто.
 * @type {ReadonlyArray<readonly [number, number]>}
 */
export const BANDS = /** @type {const} */ ([
  [0, 2],
  [2, 4],
  [4, 7],
  [7, 11],
  [11, 16],
]);

/** Верхние полосы тише нижних на порядок — без компенсации они не шевелятся. */
export const BAND_GAIN = [1, 1.15, 1.4, 1.8, 2.2];

/**
 * Байт спектра → множитель scaleY. Чистая функция: весь расчёт волны
 * проверяется тестом без DOM и без Web Audio.
 * @param {unknown} value 0..255 (значения выше обрезаются усилением полосы)
 * @returns {number} MIN_SCALE..1
 */
export function barScale(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return MIN_SCALE;
  const norm = Math.min(1, v / 255);
  return Math.round((MIN_SCALE + norm * (1 - MIN_SCALE)) * 100) / 100;
}

/**
 * Прозрачность столбика по его высоте: тихий столбик не только низкий, но и бледный.
 * @param {unknown} scale
 * @returns {number} 0.35..1
 */
export function barOpacity(scale) {
  const s = Number(scale);
  if (!Number.isFinite(s)) return 0.35;
  const clamped = Math.min(1, Math.max(MIN_SCALE, s));
  const norm = (clamped - MIN_SCALE) / (1 - MIN_SCALE);
  return Math.round((0.35 + norm * 0.65) * 100) / 100;
}

/**
 * Спектр → высоты пяти столбиков.
 * @param {ArrayLike<number>|null|undefined} bins
 * @returns {number[]} длиной BANDS.length
 */
export function waveScales(bins) {
  const out = [];
  for (let b = 0; b < BANDS.length; b++) {
    const [from, to] = BANDS[b];
    let sum = 0;
    let n = 0;
    for (let i = from; i < to; i++) {
      const v = Number(bins?.[i]);
      if (Number.isFinite(v)) {
        sum += Math.max(0, v);
        n++;
      }
    }
    out.push(n ? barScale((sum / n) * BAND_GAIN[b]) : MIN_SCALE);
  }
  return out;
}

/* ── Ниже — DOM и Web Audio. Одна реплика за раз, как и один _isSpeaking. ── */

/** @type {AudioContext|null} */
let _ctx = null;
/** @type {AnalyserNode|null} */
let _analyser = null;
/** @type {MediaElementAudioSourceNode|null} */
let _source = null;
/** @type {Uint8Array|null} */
let _bins = null;
let _raf = 0;
/** @type {HTMLElement|null} */
let _wave = null;
/** @type {HTMLElement[]} */
let _bars = [];
/** @type {HTMLAudioElement|null} */
let _audio = null;

function _reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Волна собирается узлами, а не innerHTML: данных в ней нет, зато и повода
 * держать в голове esc() тоже нет.
 * @param {Element|null|undefined} host
 */
function _mount(host) {
  if (!host || !host.isConnected || typeof document === 'undefined') return null;
  const wave = document.createElement('span');
  wave.className = 'intel-voice-wave';
  wave.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement('i');
    bar.className = 'intel-voice-wave-bar';
    wave.appendChild(bar);
  }
  host.appendChild(wave);
  return wave;
}

/**
 * Поднять граф. Возвращает анализатор или null — null значит «звук идёт мимо
 * нас», и это штатный исход, а не ошибка.
 * @param {HTMLAudioElement} audioEl
 */
async function _attach(audioEl) {
  const Ctx =
    typeof window !== 'undefined' &&
    /** @type {any} */ (window.AudioContext || /** @type {any} */ (window).webkitAudioContext);
  if (!Ctx || !audioEl) return null;

  try {
    if (!_ctx) _ctx = new Ctx();
    if (_ctx.state === 'suspended') await _ctx.resume();
    // Мина №1: пока контекст не running, элемент в граф не уводим — иначе
    // визуализация обменяет голос на картинку.
    if (_ctx.state !== 'running') return null;

    _analyser = _ctx.createAnalyser();
    _analyser.fftSize = 64;
    _analyser.smoothingTimeConstant = 0.75;
    _source = _ctx.createMediaElementSource(audioEl);
    _source.connect(_analyser);
    _analyser.connect(_ctx.destination);
    return _analyser;
  } catch {
    // Источник мог успеть создаться до броска — тогда элемент уже отвязан от
    // колонок, и «просто выйти» значит выйти в тишину. Возвращаем прямую ветку.
    try {
      if (_source && _ctx) _source.connect(_ctx.destination);
    } catch {
      /* ignore */
    }
    _analyser = null;
    return null;
  }
}

function _frame() {
  if (!_analyser || !_bins || !_bars.length) return;
  // Хост мог уехать вместе с оверлеем отчёта. Рисовать больше некуда, но звук
  // идёт через НАШ граф: полный stopVoiceWave() тут оборвал бы реплику на
  // середине (disconnect + suspend). Гасим только цикл кадров.
  if (_wave && !_wave.isConnected) {
    _raf = 0;
    return;
  }
  _analyser.getByteFrequencyData(_bins);
  const scales = waveScales(_bins);
  for (let i = 0; i < _bars.length; i++) {
    const s = scales[i] ?? MIN_SCALE;
    _bars[i].style.transform = `scaleY(${s})`;
    _bars[i].style.opacity = String(barOpacity(s));
  }
  _raf = requestAnimationFrame(_frame);
}

/**
 * Запустить волну на элементе `audioEl`, вмонтировав её в `host`.
 * Хост не найден — выходим молча: озвучка важнее своей картинки.
 * @param {HTMLAudioElement|null} audioEl
 * @param {Element|null|undefined} host
 * @returns {Promise<boolean>} true — волна идёт по реальному звуку
 */
export async function startVoiceWave(audioEl, host) {
  stopVoiceWave();
  _wave = _mount(host);
  if (!_wave) return false;
  _bars = /** @type {HTMLElement[]} */ (Array.from(_wave.children));

  if (_reducedMotion()) {
    // Просили без движения — пилюля остаётся на экране как индикатор речи.
    _wave.classList.add('is-static');
    return false;
  }

  // Ключевые кадры включаются сразу: движение обязано начаться вместе со
  // звуком, даже если Web Audio в этом браузере не поднимется вовсе.
  _wave.classList.add('is-live');

  if (audioEl) {
    _audio = audioEl;
    _audio.addEventListener('ended', stopVoiceWave, { once: true });
    _audio.addEventListener('error', stopVoiceWave, { once: true });
  }

  const analyser = audioEl ? await _attach(audioEl) : null;
  // Пока ждали resume(), реплика могла кончиться — тогда волны уже нет.
  if (!analyser || !_wave) return false;

  _wave.classList.remove('is-live');
  _wave.classList.add('is-reactive');
  _bins = new Uint8Array(analyser.frequencyBinCount);
  _raf = requestAnimationFrame(_frame);
  return true;
}

/** Снять волну и разобрать граф. Идемпотентна: её зовут из всех выходов speakText. */
export function stopVoiceWave() {
  if (_raf) {
    cancelAnimationFrame(_raf);
    _raf = 0;
  }
  try {
    _source?.disconnect();
  } catch {
    /* ignore */
  }
  try {
    _analyser?.disconnect();
  } catch {
    /* ignore */
  }
  _source = null;
  _analyser = null;
  // Контекст переживает реплику — поднимать его на каждую фразу дороже, чем
  // держать усыплённым; suspend() снимает аудиопоток с батареи между репликами.
  try {
    if (_ctx && _ctx.state === 'running') _ctx.suspend();
  } catch {
    /* ignore */
  }
  if (_audio) {
    _audio.removeEventListener('ended', stopVoiceWave);
    _audio.removeEventListener('error', stopVoiceWave);
    _audio = null;
  }
  if (_wave) {
    _wave.remove();
    _wave = null;
  }
  _bars = [];
  _bins = null;
}
