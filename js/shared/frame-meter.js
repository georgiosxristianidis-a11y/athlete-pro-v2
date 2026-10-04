// @ts-check
/* ════════════════════════════════════════════════════════
   frame-meter.js — FRAME-1: замер кадров в рантайме (debug, флаг 'frame-meter')
   ────────────────────────────────────────────────────────
   Меряет то, что видит палец: p95 длительности кадра, долю пропущенных
   кадров и long tasks > 50 мс. Нужен, чтобы motion-карточки опирались на
   цифру с телефона, а не на «вроде плавно».

   Включение на устройстве (флаг по умолчанию OFF, в прод-сборке мёртв):
     Flags.setFlag('frame-meter', true)  → перезагрузить страницу
   Дальше в консоли (chrome://inspect → Android):
     FrameMeter.start('workout')   // метка экрана; новый старт сбрасывает окно
     ...потрогать экран 20-30 с...
     FrameMeter.report()           // объект со сводкой
     FrameMeter.json()             // строка JSON — копировать в карточку
     FrameMeter.stop()

   Скрытая вкладка не источник цифр: rAF там не тикает, окно рвётся —
   см. _gapMs. Кадры длиннее GAP_RESET_MS отбрасываются как «страница спала».
   ════════════════════════════════════════════════════════ */

/** Кадр длиннее этого — страница была скрыта/заморожена, а не «тормозила». */
export const GAP_RESET_MS = 1000;
/** Порог long task по спецификации Long Tasks API. */
export const LONG_TASK_MS = 50;
/** Кадр считается пропущенным, если дольше медианы в столько раз. */
const MISS_FACTOR = 1.5;

/**
 * @param {number[]} sorted по возрастанию
 * @param {number} q 0..1
 */
export function percentile(sorted, q) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

/**
 * Чистая сводка по длительностям кадров. Интервал дисплея оценивается медианой
 * (60/90/120 Гц без угадывания), пропуск = кадр дольше 1.5 интервала, и
 * считается сколько кадров он съел.
 * @param {number[]} deltas длительности кадров, мс
 * @param {number[]} [longTasks] длительности long tasks, мс
 */
export function summarize(deltas, longTasks = []) {
  const sorted = [...deltas].sort((a, b) => a - b);
  const frames = sorted.length;
  const median = percentile(sorted, 0.5);
  let missed = 0;
  let slow = 0;
  if (median > 0) {
    for (const d of deltas) {
      if (d > median * MISS_FACTOR) {
        slow++;
        missed += Math.max(1, Math.round(d / median) - 1);
      }
    }
  }
  const round = (/** @type {number} */ n) => Math.round(n * 100) / 100;
  return {
    frames,
    refreshMs: round(median),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    p99Ms: round(percentile(sorted, 0.99)),
    maxMs: round(sorted[frames - 1] || 0),
    slowFrames: slow,
    missedFrames: missed,
    missedPct: frames ? round((missed / (frames + missed)) * 100) : 0,
    longTasks: longTasks.filter((d) => d > LONG_TASK_MS).length,
    longTaskMaxMs: round(Math.max(0, ...longTasks)),
  };
}

/** Окно замера — без привязки к DOM, rAF/PerformanceObserver подаются снаружи. */
export function createFrameMeter() {
  /** @type {number[]} */ let deltas = [];
  /** @type {number[]} */ let longTasks = [];
  let last = 0;
  let label = '';
  let startedAt = 0;
  let resets = 0;

  return {
    /** @param {string} [name] */
    reset(name = '') {
      deltas = [];
      longTasks = [];
      last = 0;
      label = name;
      startedAt = Date.now();
      resets = 0;
    },
    /** @param {number} ts timestamp rAF, мс */
    frame(ts) {
      if (last) {
        const d = ts - last;
        if (d > GAP_RESET_MS) resets++;
        else deltas.push(d);
      }
      last = ts;
    },
    /** @param {number} ms */
    longTask(ms) { longTasks.push(ms); },
    report() {
      return {
        label,
        startedAt: new Date(startedAt).toISOString(),
        durationMs: deltas.reduce((a, b) => a + b, 0) | 0,
        gapsDropped: resets,
        ...summarize(deltas, longTasks),
      };
    },
  };
}

/** Подключает счётчик к rAF и PerformanceObserver, вешает window.FrameMeter. */
export function initFrameMeter() {
  if (typeof window === 'undefined') return;
  const meter = createFrameMeter();
  let running = false;
  /** @type {PerformanceObserver|null} */ let po = null;

  /** @param {number} ts */
  const tick = (ts) => {
    if (!running) return;
    meter.frame(ts);
    requestAnimationFrame(tick);
  };

  const api = {
    /** @param {string} [name] метка экрана */
    start(name = '') {
      meter.reset(name);
      if (running) return;
      running = true;
      try {
        po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) meter.longTask(e.duration);
        });
        po.observe({ type: 'longtask', buffered: false });
      } catch { /* longtask недоступен (Safari) — цифры только по кадрам */ }
      requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      po?.disconnect();
      po = null;
    },
    report: () => ({ ...meter.report(), visibility: document.visibilityState, ua: navigator.userAgent }),
    json() { return JSON.stringify(api.report(), null, 2); },
  };
  /** @type {any} */ (window).FrameMeter = api;
}
