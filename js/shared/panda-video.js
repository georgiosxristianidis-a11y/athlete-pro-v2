// @ts-check
/* ════════════════════════════════════════════════
   panda-video.js — живая панда с озвучкой (флаг 'fab-video')
   Общая логика для Claude FAB и маскота пустого дашборда.
   Звук записан в mp4-дорожку: один <video> = картинка и голос
   всегда синхронны; зум привязан к video.currentTime.
   ════════════════════════════════════════════════ */

export const PANDA_VIDEO_SRC = 'assets/panda-voice.mp4';

/* Тайм-коды ролика (10.0с): панда поднимает голову на ~5.6–5.8с —
   наезд стартует на 5.5с и достигает пика, когда взгляд уже в камеру. */
const ZOOM_START = 5.5;
const ZOOM_SCALE = 1.35;
const IN_DUR = 1.8;
const OUT_DUR = 0.8;

/**
 * Timecode-driven zoom + background pause for a looping panda video.
 * The zoom follows video.currentTime, so it stays in sync with the
 * voiceover even across pause/resume. GPU transform only — no relayout.
 * Self-terminates once `host` leaves the DOM.
 * @param {HTMLElement} host container whose DOM lifetime bounds the loop
 * @param {Element|null} videoEl the <video> to animate
 */
export function initPandaVideo(host, videoEl) {
  const v = videoEl;
  if (!(v instanceof HTMLVideoElement)) return;
  v.play().catch(() => { /* autoplay blocked (e.g. Low Power Mode) — static plate stays */ });

  // Батарея: видео играет только когда его реально видно.
  const onVis = () => {
    if (!host.isConnected) { document.removeEventListener('visibilitychange', onVis); io.disconnect(); return; }
    if (document.hidden) v.pause();
    else if (host.offsetParent !== null) v.play().catch(() => {});
  };
  document.addEventListener('visibilitychange', onVis);
  const io = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) { if (!document.hidden) v.play().catch(() => {}); }
    else v.pause();
  });
  io.observe(host);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // quintic in-out — мягкий вход/выход «наезда»; rAF-цикл живёт только пока
  // видео играет (пауза = ноль работы, и превью-панель не голодает от rAF)
  const ease = (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
  let last = '';
  let raf = 0;
  const tick = () => {
    if (!host.isConnected) return;
    raf = requestAnimationFrame(tick);
    if (v.readyState < 2) return;
    const dur = v.duration || 10;
    const t = v.currentTime;
    let s = 1;
    if (t >= ZOOM_START) {
      const holdEnd = dur - OUT_DUR;
      if (t < ZOOM_START + IN_DUR) s = 1 + (ZOOM_SCALE - 1) * ease((t - ZOOM_START) / IN_DUR);
      else if (t < holdEnd) s = ZOOM_SCALE;
      else s = 1 + (ZOOM_SCALE - 1) * (1 - ease(Math.min(1, (t - holdEnd) / OUT_DUR)));
    }
    const next = `translateZ(0) scale(${s.toFixed(4)})`;
    if (last !== next) { last = next; v.style.transform = next; }
  };
  const start = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); };
  v.addEventListener('play', start);
  v.addEventListener('pause', () => cancelAnimationFrame(raf));
  if (!v.paused) start();
}

/**
 * Тумблер звука. Вызывать только из пользовательского жеста (autoplay policy).
 * @param {HTMLVideoElement} v
 * @returns {boolean} новое состояние muted
 */
export function togglePandaSound(v) {
  v.muted = !v.muted;
  v.volume = 1;
  v.play().catch(() => {});
  return v.muted;
}
