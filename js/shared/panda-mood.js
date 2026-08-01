// @ts-check
/* ════════════════════════════════════════════════════════
   panda-mood.js — маскот реагирует на тренировку (флаг 'panda-moods')
   ────────────────────────────────────────────────────────
   ЗАКОН ПЕРСОНАЖА (не потерять при рефакторе):
     Панда никогда не тренируется. Ты потеешь — он ест.
     Он не хвалит с пустым ртом. Молчание сильнее реплики.
     Максимум 5 слов на реплику. Эмодзи запрещены — только SVG.

   Ноль новых ассетов: в already-shipped assets/panda-voice.mp4 (10.0с)
   уже лежат пять мимик, разложенных по тайм-кодам. Мимика = луп внутри
   сегмента через currentTime, ровно тем же приёмом, каким panda-video.js
   гонит зум. Поэтому «новый персонаж» весит 0 КБ и не трогает ни бюджет
   прекеша (test/sw-media-budget.test.js), ни потолок файлов (repo-hygiene).

   Зума в mood-режиме НЕТ намеренно: наезд был срежиссирован под линейный
   проигрыш всех 10с, а здесь ролик больше линейно не играет.

   Звук: в дорожке лежит озвучка целиком, и нарезка её рубит. Стартуем
   muted (autoplay policy всё равно требует), тумблер звука — осознанный
   выбор пользователя, не наш дефолт.
   ════════════════════════════════════════════════════════ */

import { bindPandaLifecycle } from './panda-video.js';

/** Событие-шина: rest-timer/сводка шлют мимику, не импортируя вьюху FAB. */
export const MOOD_EVENT = 'ap-panda-mood';

/** Базовая мимика — то, чем панда занята, пока ты работаешь. */
export const BASE_MOOD = 'chew';

/**
 * Карта мимик по тайм-кодам assets/panda-voice.mp4 (10.0с).
 * Границы сверены с комментарием panda-video.js: голову панда поднимает
 * на ~5.6–5.8с — это и есть стык 'watch'.
 * `out` у 'judge' обрезан до 9.9с осознанно: на 10.0 браузер сам заворачивает
 * loop в ноль и на кадр показывает чужую мимику.
 * @type {Record<string, {in:number, out:number}>}
 */
export const MOODS = {
  /** жуёт, глаза закрыты, блаженство — база / «ты работаешь, я занят» */
  chew:   { in: 0.0, out: 2.4 },
  /** рот открыт, глаза круглые — PR, конец сессии */
  cheer:  { in: 2.0, out: 3.2 },
  /** прищур вбок, бровь вниз — «я видел» (резерв под чит-детектор) */
  squint: { in: 2.8, out: 3.6 },
  /** нейтральный взгляд в камеру — отдых пошёл в перебор */
  watch:  { in: 5.5, out: 7.5 },
  /** тяжёлые веки, деадпан — осуждение */
  judge:  { in: 7.5, out: 9.9 },
};

/** Снап чуть раньше границы: rAF 60Гц ловит стык за ~16мс, запас убирает перелёт. */
const EDGE_EPS = 0.03;

/** Сколько секунд перебора отдыха панда терпит, прежде чем перейти к осуждению. */
export const OVERRUN_JUDGE_SEC = 30;

/**
 * Лестница «осуждающего отдыха»: таймер отдыха истёк, а подход не залогирован.
 * Чистая функция — вся драматургия сценария 2 проверяется юнит-тестом.
 * @param {number} elapsedSec секунд СВЕРХ назначенного отдыха
 * @returns {string|null} ключ MOODS либо null, если осуждать ещё не за что
 */
export function restOverrunMood(elapsedSec) {
  if (!(elapsedSec >= 0)) return null;
  return elapsedSec >= OVERRUN_JUDGE_SEC ? 'judge' : 'watch';
}

/** Со скольких дней простоя панда начинает припоминать тебе прогресс. */
export const IDLE_GUILT_DAYS = 3;

/**
 * Сценарии 5 «Пока тебя не было» и 6 «Ночная смена» — реакция на ВХОД в
 * приложение, а не на тренировку. Чистая функция, вся драматургия в тесте.
 *
 * Порядок ветвлений неслучаен: время суток бьёт вину. Человек, открывший
 * приложение в два ночи, как раз пришёл — упрекать его пропуском в этот
 * момент не смешно, а мелочно.
 *
 * @param {{daysSinceLast: number|null, hour: number}} ctx
 *        daysSinceLast — null, если тренировок ещё не было вовсе
 * @returns {{mood: string, key: string}|null} null = поводов открывать рот нет
 */
export function entryGreeting(ctx) {
  const hour = ctx && ctx.hour;
  if (!(hour >= 0 && hour <= 23)) return null;
  const idle = ctx.daysSinceLast;

  // Он ест даже в два ночи — своей мимики «спит» в ролике нет, и выдумывать
  // её нарезкой честнее не пытаться.
  if (hour >= 23 || hour < 5) return { mood: 'chew', key: 'mascot.night_shift' };
  if (hour < 7) return { mood: 'watch', key: 'mascot.early_bird' };
  if (typeof idle === 'number' && idle >= IDLE_GUILT_DAYS) {
    return { mood: 'judge', key: 'mascot.ate_progress' };
  }
  return null;
}

/**
 * Вердикт бамбукового счёта. Панда ест по одному стеблю на каждый твой подход,
 * поэтому счёт всегда равный — выиграть можно только рекордом.
 * @param {number} prCount
 * @returns {string} ключ словаря
 */
export function ledgerVerdictKey(prCount) {
  return prCount > 0 ? 'mascot.you_won' : 'mascot.draw';
}

/**
 * Разослать мимику всем смонтированным пандам.
 * @param {string} mood ключ MOODS
 * @param {{hold?: number}} [opts] hold в мс — временная мимика с авто-возвратом
 */
export function emitMood(mood, opts = {}) {
  if (typeof window === 'undefined') return;
  if (!MOODS[mood]) return;
  window.dispatchEvent(new CustomEvent(MOOD_EVENT, {
    detail: { mood, hold: opts.hold || 0 }
  }));
}

/**
 * Превращает <video> в машину настроений: луп внутри сегмента текущей мимики.
 * Сам подписывается на MOOD_EVENT, поэтому вызывающему достаточно смонтировать
 * видео и один раз позвать attachMood. Самозавершается, когда host покидает DOM.
 *
 * @param {HTMLElement} host контейнер, чья жизнь в DOM ограничивает цикл
 * @param {Element|null} videoEl
 * @returns {{set:(mood:string, opts?:{hold?:number})=>void, destroy:()=>void}|null}
 */
export function attachMood(host, videoEl) {
  const v = videoEl;
  if (!(v instanceof HTMLVideoElement)) return null;

  const detachLifecycle = bindPandaLifecycle(host, v);
  const reduced = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Родной loop мешает: он заворачивает в 0, а не в начало сегмента.
  v.loop = false;

  let current = BASE_MOOD;
  let holdTimer = 0;
  let raf = 0;
  let dead = false;

  /** Прыжок в начало сегмента, устойчивый к ещё не готовым метаданным. */
  function seek(t) {
    try { v.currentTime = t; } catch { /* readyState 0 — сработает на loadedmetadata */ }
  }

  function set(mood, opts = {}) {
    if (dead) return;
    const seg = MOODS[mood];
    if (!seg) return;
    clearTimeout(holdTimer);
    holdTimer = 0;
    current = mood;
    seek(seg.in);
    if (reduced) {
      // Мимика остаётся, движения нет: замираем на середине сегмента.
      seek((seg.in + seg.out) / 2);
      v.pause();
    } else if (v.paused && !document.hidden) {
      v.play().catch(() => {});
    }
    if (opts.hold > 0 && mood !== BASE_MOOD) {
      holdTimer = setTimeout(() => set(BASE_MOOD), opts.hold);
    }
  }

  const onEvent = (e) => {
    const d = e && e.detail;
    if (!d || !d.mood) return;
    set(d.mood, { hold: d.hold });
  };
  window.addEventListener(MOOD_EVENT, onEvent);

  /** Удержать проигрывание внутри сегмента текущей мимики. */
  function clamp() {
    if (dead || v.readyState < 2) return;
    const seg = MOODS[current];
    if (!seg) return;
    const t = v.currentTime;
    if (t >= seg.out - EDGE_EPS || t < seg.in - EDGE_EPS) seek(seg.in);
  }

  // Сетка безопасности под rAF. rAF не тикает на скрытой странице, и без
  // этих двух слушателей ролик спокойно убегает за границу сегмента и
  // умирает на последнем кадре — панда навсегда застывает в чужой мимике.
  // timeupdate работает и в фоне (~4Гц), ended ловит добежавший до конца луп.
  const onEnded = () => {
    if (dead) return;
    seek((MOODS[current] || MOODS[BASE_MOOD]).in);
    if (!reduced && !document.hidden) v.play().catch(() => {});
  };
  v.addEventListener('timeupdate', clamp);
  v.addEventListener('ended', onEnded);

  function destroy() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    clearTimeout(holdTimer);
    window.removeEventListener(MOOD_EVENT, onEvent);
    v.removeEventListener('timeupdate', clamp);
    v.removeEventListener('ended', onEnded);
    detachLifecycle();
  }

  set(BASE_MOOD);
  // Метаданные могли ещё не приехать — тогда первый seek() ушёл в пустоту.
  v.addEventListener('loadedmetadata', () => set(current), { once: true });

  // reduced-motion: кадр мимики без движения, rAF не нужен вовсе.
  if (reduced) return { set, destroy };

  // rAF — точный клэмп на границе сегмента, пока страница видима.
  const tick = () => {
    if (!host.isConnected) { destroy(); return; }
    raf = requestAnimationFrame(tick);
    clamp();
  };
  raf = requestAnimationFrame(tick);

  return { set, destroy };
}
