// @ts-check
/* ════════════════════════════════════════════════════════
   panda-mood.js — маскот реагирует на тренировку (флаг 'panda-moods')
   ────────────────────────────────────────────────────────
   ЗАКОН ПЕРСОНАЖА (не потерять при рефакторе):
     Панда никогда не тренируется. Ты потеешь — он ест.
     Он не хвалит с пустым ртом. Молчание сильнее реплики.
     Максимум 5 слов на реплику. Эмодзи запрещены — только SVG.

   Базовые пять мимик нарезаны из already-shipped assets/panda-voice.mp4
   (10.0с) по тайм-кодам: мимика = луп внутри сегмента через currentTime,
   ровно тем же приёмом, каким panda-video.js гонит зум. Поэтому персонаж
   ожил, не прибавив ни байта.

   PANDA-2 добавил шестую мимику отдельным клипом (assets/panda-drop.mp4,
   80 КБ): «роняет бамбук» физически не нарезается из ролика, где он
   бамбук ни разу не выпускает. Отсюда контракт мимики — {clip, in, out},
   а не {in, out}: источников теперь два. Медиа исключено из прекеша
   (scripts/build-sw.mjs), так что бюджет 1.5 МБ не затронут; ролик
   подтягивается по факту первого рекорда и дальше живёт в runtime-кеше.

   Зума в mood-режиме НЕТ намеренно: наезд был срежиссирован под линейный
   проигрыш всех 10с, а здесь ролик больше линейно не играет.

   Звук: в дорожке лежит озвучка целиком, и нарезка её рубит. Стартуем
   muted (autoplay policy всё равно требует), тумблер звука — осознанный
   выбор пользователя, не наш дефолт.
   ════════════════════════════════════════════════════════ */

import { bindPandaLifecycle, PANDA_VIDEO_SRC } from './panda-video.js';

/** Событие-шина: rest-timer/сводка шлют мимику, не импортируя вьюху FAB. */
export const MOOD_EVENT = 'ap-panda-mood';

/** Базовая мимика — то, чем панда занята, пока ты работаешь. */
export const BASE_MOOD = 'chew';

/**
 * Источники мимик. Ключ, а не путь, потому что на него ссылается каждая
 * запись MOODS и тест сверяет наличие файлов на диске.
 * @type {Record<string, string>}
 */
export const PANDA_CLIPS = {
  // Берём из panda-video.js, а не дублируем строкой: путь к базовому ролику
  // обязан остаться один на весь проект.
  /** исходный ролик с озвучкой — пять мимик по тайм-кодам */
  voice: PANDA_VIDEO_SRC,
  /** PANDA-2: отдельный клип «роняет бамбук», без звука */
  drop: 'assets/panda-drop.mp4',
};

/**
 * Карта мимик: какой клип и какой его отрезок крутить.
 * Границы сегментов voice сверены с комментарием panda-video.js: голову
 * панда поднимает на ~5.6–5.8с — это и есть стык 'watch'.
 * `out` у 'judge' обрезан до 9.9с осознанно: на 10.0 браузер сам заворачивает
 * loop в ноль и на кадр показывает чужую мимику.
 * `once` — не лупить, а замереть на последнем кадре.
 * @type {Record<string, {clip:string, in:number, out:number, once?:boolean}>}
 */
export const MOODS = {
  /** жуёт, глаза закрыты, блаженство — база / «ты работаешь, я занят» */
  chew:   { clip: 'voice', in: 0.0, out: 2.4 },
  /** рот открыт, глаза круглые — конец сессии */
  cheer:  { clip: 'voice', in: 2.0, out: 3.2 },
  /** прищур вбок, бровь вниз — «я видел» (резерв под чит-детектор) */
  squint: { clip: 'voice', in: 2.8, out: 3.6 },
  /** нейтральный взгляд в камеру — отдых пошёл в перебор */
  watch:  { clip: 'voice', in: 5.5, out: 7.5 },
  /** тяжёлые веки, деадпан — осуждение */
  judge:  { clip: 'voice', in: 7.5, out: 9.9 },
  /**
   * PANDA-2, рекорд: жуёт → глаза распахиваются → бамбук выпадает из лап.
   * once: лупить нельзя — на второй итерации стебель телепортируется обратно
   * в лапы и панчлайн ломается. Замираем на кадре с пустыми лапами, и этот
   * взгляд держится до конца hold.
   */
  drop:   { clip: 'drop', in: 0.0, out: 3.0, once: true },
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
  let currentClip = MOODS[BASE_MOOD].clip;
  let holdTimer = 0;
  let raf = 0;
  let dead = false;

  /** Прыжок в начало сегмента, устойчивый к ещё не готовым метаданным. */
  function seek(t) {
    try { v.currentTime = t; } catch { /* readyState 0 — сработает на loadedmetadata */ }
  }

  /**
   * Перевести <video> на другой файл. Пока новый грузится, элемент показывает
   * poster — это та же панда, поэтому провал в пустоту зрителю не виден.
   */
  function swapClip(clipKey, startAt) {
    currentClip = clipKey;
    v.src = PANDA_CLIPS[clipKey];
    v.addEventListener('loadedmetadata', () => {
      if (dead) return;
      seek(startAt);
      if (!reduced && !document.hidden) v.play().catch(() => {});
    }, { once: true });
    v.load();
  }

  function set(mood, opts = {}) {
    if (dead) return;
    const seg = MOODS[mood];
    if (!seg) return;
    clearTimeout(holdTimer);
    holdTimer = 0;
    current = mood;

    // reduced-motion: мимика остаётся, движения нет — замираем на кадре.
    const target = reduced ? (seg.in + seg.out) / 2 : seg.in;

    if (seg.clip !== currentClip) {
      swapClip(seg.clip, target);
    } else {
      seek(target);
      if (reduced) v.pause();
      else if (v.paused && !document.hidden) v.play().catch(() => {});
    }
    if (reduced) v.pause();

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
    if (!seg || seg.clip !== currentClip) return;   // клип ещё догружается
    const t = v.currentTime;
    if (t >= seg.out - EDGE_EPS) {
      // once — одноразовая сцена: замереть на последнем кадре, не лупить.
      if (seg.once) { v.pause(); return; }
      seek(seg.in);
    } else if (t < seg.in - EDGE_EPS) {
      seek(seg.in);
    }
  }

  // Сетка безопасности под rAF. rAF не тикает на скрытой странице, и без
  // этих двух слушателей ролик спокойно убегает за границу сегмента и
  // умирает на последнем кадре — панда навсегда застывает в чужой мимике.
  // timeupdate работает и в фоне (~4Гц), ended ловит добежавший до конца луп.
  const onEnded = () => {
    if (dead) return;
    const seg = MOODS[current] || MOODS[BASE_MOOD];
    if (seg.once) return;                 // одноразовая сцена досмотрена — стоим
    seek(seg.in);
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
