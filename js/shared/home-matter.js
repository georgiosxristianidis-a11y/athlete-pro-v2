/**
 * HOME-3 (флаг home-matter): «материя» в карточке «Сегодня» — пыль и световые
 * ленты от правого верхнего угла, монохром токена --c-chrome (сталь, Gio 13.10).
 * Приём из ENERGY-PROTO-3, не код прототипа: три canvas рисуются ОДИН раз на
 * размер карточки, движение — WAAPI transform/opacity на самих слоях (композитор,
 * ноль перерисовок). «12 с» (решение Gio 14.10): 12 с после входа на Главную,
 * затем 1 с в нейтраль и замереть; «вечно» не переносить. reduced-motion —
 * статика, скрытая вкладка — пауза, уход с экрана — сброс (вход снова даёт 12 с).
 * Модуль грузится динамически из dashboard.js и только при включённом флаге.
 */

import { listenerGroup } from './utils.js';

const N_DUST = 2400;
const PAD = 0.04; // запас слоя с каждой стороны (inset -4% в css/dashboard.css)
const SETTLE_AT = 12000;
const SETTLE_MS = 1000;
const SEEDS = { push: 11, pull: 23, legs: 37 };
const RAY = [-1.15 / Math.hypot(1, 1.15), 1 / Math.hypot(1, 1.15)]; // луч вниз-влево
const tr = (d) => `translate(${(RAY[0] * d).toFixed(2)}px, ${(RAY[1] * d).toFixed(2)}px)`;
// Периоды 14/9/11 с некратны; ближний слой стартует с задержкой — без рывка на входе.
const LOOPS = [
  [0, [{ transform: tr(0) }, { transform: tr(2.5) }], { duration: 14000 }],
  [1, [{ transform: tr(0) }, { transform: tr(5) }], { duration: 9000, delay: 2000 }],
  [2, [{ opacity: 1 }, { opacity: 0.8 }], { duration: 11000 }],
];

export function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
/** @type {WeakMap<Element, object>} */
const states = new WeakMap();
let probeX = null;

/** Токен → [r,g,b]: холст сам разбирает hex и color-mix. */
function rgbOf(host, prop) {
  if (!probeX) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    probeX = cv.getContext('2d', { willReadFrequently: true });
  }
  probeX.clearRect(0, 0, 1, 1);
  probeX.fillStyle = getComputedStyle(host).getPropertyValue(prop).trim() || '#cfd1d8';
  probeX.fillRect(0, 0, 1, 1);
  const p = probeX.getImageData(0, 0, 1, 1).data;
  return [p[0], p[1], p[2]];
}

function layer(cv, dpr) {
  const r = cv.getBoundingClientRect();
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
  const x = cv.getContext('2d');
  const W = r.width / (1 + 2 * PAD);
  const H = r.height / (1 + 2 * PAD);
  x.setTransform(dpr, 0, 0, dpr, W * PAD * dpr, H * PAD * dpr);
  x.globalCompositeOperation = 'lighter';
  return { x, W, H };
}

function draw(host, cvs, type) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const far = layer(cvs[0], dpr);
  const near = layer(cvs[1], dpr);
  const rib = layer(cvs[2], dpr);
  const { W, H } = rib;
  const padX = W * PAD;
  const padY = H * PAD;
  const [mr, mg, mb] = rgbOf(host, '--c-chrome');
  const [hr, hg, hb] = rgbOf(host, '--c-text-1');
  const M = (a) => `rgba(${mr},${mg},${mb},${a})`;
  const HI = (a) => `rgba(${hr},${hg},${hb},${a})`;
  const rnd = mulberry(SEEDS[type] ?? SEEDS.push);
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const base = Math.atan2(1, -1.15); // свет идёт из правого верхнего угла вниз-влево
  const flow = (px, py, amp, f) => base + (noise(px * f, py * f) - 0.5) * amp;

  // Слой 3: свечение источника и три ленты
  let x = rib.x;
  const g = x.createRadialGradient(W, 0, 0, W, 0, W * 0.85);
  g.addColorStop(0, M(0.16));
  g.addColorStop(0.35, M(0.05));
  g.addColorStop(1, M(0));
  x.fillStyle = g;
  x.fillRect(-padX, -padY, W + 2 * padX, H + 2 * padY);
  const ribbons = [];
  for (let k = 0; k < 3; k++) {
    const pts = [];
    let px = W + 8 - k * 6;
    let py = -10 + k * 38;
    for (let s = 0; s < 260 && px > -40 && py < H + 40; s++) {
      pts.push([px, py]);
      const a = flow(px + k * 90, py, 1.3, 0.0065);
      px += Math.cos(a) * 4;
      py += Math.sin(a) * 4 * (0.78 + k * 0.08);
    }
    ribbons.push(pts);
  }
  ribbons.forEach((pts, k) => {
    const [ex, ey] = pts[pts.length - 1];
    const path = new Path2D();
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    const grad = (a0) => {
      const q = x.createLinearGradient(W, 0, ex, ey);
      q.addColorStop(0, M(a0));
      q.addColorStop(0.55, M(a0 * 0.3));
      q.addColorStop(1, M(0));
      return q;
    };
    x.lineCap = 'round';
    x.lineJoin = 'round';
    const wide = k === 0 ? 72 : 40;
    for (let p = 0; p < 6; p++) {
      x.lineWidth = wide * (1 - p / 6) + 3;
      x.strokeStyle = grad(0.026);
      x.stroke(path);
    }
    x.lineWidth = k === 0 ? 1.1 : 0.7;
    x.strokeStyle = grad(0.42 / (k + 1));
    x.stroke(path);
    if (k === 0) {
      const q = x.createLinearGradient(W, 0, ex, ey);
      q.addColorStop(0, HI(0.35));
      q.addColorStop(0.4, HI(0));
      x.lineWidth = 0.5;
      x.strokeStyle = q;
      x.stroke(path);
    }
  });

  // Слой 2: редкое боке у источника
  x = near.x;
  for (let i = 0; i < 16; i++) {
    const rr = Math.pow(rnd(), 1.4) * W * 0.55;
    const a = Math.PI / 2 + rnd() * (Math.PI / 2);
    const bx = W + Math.cos(a) * rr;
    const by = Math.sin(a) * rr;
    const rad = 2 + rnd() * 7;
    const bg = x.createRadialGradient(bx, by, 0, bx, by, rad);
    bg.addColorStop(0, M(0.06));
    bg.addColorStop(1, M(0));
    x.fillStyle = bg;
    x.fillRect(bx - rad, by - rad, rad * 2, rad * 2);
  }

  // Слои 1/2: пыль; глубина z делит её на дальнюю (мелкая, тусклая) и ближнюю
  for (let i = 0; i < N_DUST; i++) {
    let px;
    let py;
    let t;
    if (rnd() < 0.72) {
      const pts = ribbons[rnd() < 0.55 ? 0 : 1 + ((rnd() * 2) | 0)];
      t = Math.pow(rnd(), 2.1);
      const p = pts[Math.min(pts.length - 1, (t * pts.length) | 0)];
      const a = flow(p[0], p[1], 1.1, 0.0065) + Math.PI / 2;
      const off = gauss() * (9 + 72 * t);
      px = p[0] + Math.cos(a) * off;
      py = p[1] + Math.sin(a) * off;
    } else {
      // сектор чуть шире четверти: пыль заходит в запас, сдвиг не открывает пустой угол
      const rr = Math.pow(rnd(), 1.6) * W * 0.7;
      const a = Math.PI / 2 - 0.12 + rnd() * (Math.PI * 0.5 + 0.24);
      px = W + Math.cos(a) * rr;
      py = Math.sin(a) * rr * 0.9;
      t = rr / (W * 0.7);
    }
    const z = rnd();
    const nearK = Math.pow(1 - t, 2.2);
    const alpha = (0.04 + 0.5 * nearK * (0.3 + 0.7 * rnd())) * (0.5 + z * 0.5);
    const sz = 0.3 + z * z * 1.3;
    x = z < 0.55 ? far.x : near.x;
    if (rnd() < 0.14) {
      // штрих по потоку: «материя»
      const a = flow(px, py, 2.4, 0.02);
      const len = 2 + rnd() * 5;
      x.strokeStyle = M(alpha * 0.7);
      x.lineWidth = 0.5;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
      x.stroke();
    } else {
      x.fillStyle = z > 0.93 && nearK > 0.4 ? HI(alpha) : M(alpha);
      x.fillRect(px, py, sz, sz);
    }
  }
}

function stopMotion(s) {
  s.settles.forEach((a) => a.cancel());
  s.settles = [];
  s.loops?.forEach((a) => a.cancel());
  s.clock?.cancel();
}

/** Плавно (1 с) из текущей позы в нейтраль: transform none, opacity 1. */
function settle(s) {
  if (s.settles.length || !s.loops || s.loops[0].playState === 'idle') return;
  for (const a of s.loops) {
    const el = a.effect.target;
    const cs = getComputedStyle(el);
    const from = { transform: cs.transform, opacity: cs.opacity };
    a.cancel();
    s.settles.push(el.animate([from, { transform: 'none', opacity: 1 }], { duration: SETTLE_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }));
  }
}

function startMotion(s) {
  stopMotion(s);
  if (reduce?.matches || !s.drawn || !s.visible || !s.onScreen) return;
  if (!s.loops) {
    // создаются раз; перезапуск — cancel() + play(), без принудительного layout
    s.loops = LOOPS.map(([i, kf, o]) => {
      const a = s.cvs[i].animate(kf, { ...o, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
      a.cancel();
      return a;
    });
    // таймер на шкале документа: пауза и перемотка вместе со слоями
    s.clock = new Animation(new KeyframeEffect(null, null, SETTLE_AT));
    s.clock.onfinish = () => settle(s);
  }
  s.loops.forEach((a) => a.play());
  s.clock.play();
  if (document.hidden) pauseMotion(s, true);
}

function pauseMotion(s, p) {
  for (const a of [...(s.loops || []), s.clock, ...s.settles]) {
    if (a && a.playState !== 'idle' && a.playState !== 'finished') (p ? a.pause() : a.play());
  }
}

function paint(s) {
  if (!s.host.getBoundingClientRect().width) return; // экран скрыт: нарисуем, когда карточка получит размер
  draw(s.host, s.cvs, s.type);
  s.drawn = true;
  startMotion(s);
}

/**
 * Вешает материю на карточку «Сегодня». Повторный вызов с тем же типом дня
 * ничего не пересоздаёт (закон кадра п.6: хост анимации живёт между рендерами).
 * @param {HTMLElement} host
 * @param {'push'|'pull'|'legs'} type
 */
export function mountMatter(host, type) {
  if (!host || document.documentElement.dataset.theme === 'light') return unmountMatter(host);
  let s = states.get(host);
  if (s) {
    if (s.type !== type) {
      s.type = type;
      s.drawn = false;
      paint(s);
    }
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'matter';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = '<canvas></canvas><canvas></canvas><canvas></canvas>';
  host.prepend(wrap);
  host.classList.add('has-matter');
  const screenId = host.closest('.screen')?.id;
  s = { host, wrap, type, cvs: [...wrap.children], loops: null, clock: null, settles: [], drawn: false, visible: false, onScreen: true };
  let timer = 0;
  s.ro = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => paint(s), s.drawn ? 150 : 0);
  });
  s.ro.observe(host);
  s.io = new IntersectionObserver(([e]) => {
    s.visible = e.isIntersecting;
    if (s.visible) startMotion(s);
    else stopMotion(s); // уход с экрана: вход снова даёт свои 12 с
  });
  s.io.observe(host);
  s.onVis = () => pauseMotion(s, document.hidden);
  s.onReduce = () => startMotion(s);
  // Экраны прячутся через opacity, не display: IntersectionObserver уход с Главной не видит,
  // поэтому цикл сбрасываем и по навигации (как маскот-видео в dashboard.js).
  s.onNav = (e) => {
    s.onScreen = !screenId || e.detail?.id === screenId;
    if (s.onScreen) startMotion(s);
    else stopMotion(s);
  };
  s.on = listenerGroup(document); // потолок сырых слушателей: через группу, снимается в unmountMatter
  s.on.add('visibilitychange', s.onVis);
  s.onWin = listenerGroup(window);
  s.onWin.add('ap-nav-change', s.onNav);
  reduce?.addEventListener('change', s.onReduce);
  s.timerStop = () => clearTimeout(timer);
  states.set(host, s);
}

/** Снимает материю: наблюдатели, анимации, DOM. Безопасно вызывать без mount. */
export function unmountMatter(host) {
  const s = host && states.get(host);
  if (!s) return;
  s.timerStop();
  s.ro.disconnect();
  s.io.disconnect();
  s.on.release();
  s.onWin.release();
  reduce?.removeEventListener('change', s.onReduce);
  stopMotion(s);
  s.wrap.remove();
  host.classList.remove('has-matter');
  states.delete(host);
}
