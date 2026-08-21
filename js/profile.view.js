// @ts-check
/* ════════════════════════════════════════════════════════
   profile.view.js — Barrel + render entry for Profile Passport UI
   ════════════════════════════════════════════════════════ */

import { DB } from './db.js';
import { loadProfile, computeAge } from './profile.store.js';
import { mapOneRMs } from './shared/lift-map.js';
import { renderPassportHero } from './profile.view/passport-hero.js';
import { renderBento }        from './profile.view/bento.js';
import { renderHexagonRadar } from './profile.view/hexagon-radar.js';
import { renderLiftBars }     from './profile.view/lift-bars.js';

export { renderPassportHero, renderBento, renderHexagonRadar, renderLiftBars };

/**
 * Render the full Passport UI into a container element.
 * @param {HTMLElement} container
 * @param {string} [lang]
 */
export async function renderProfile(container, lang) {
  const resolvedLang = lang || (await DB.Settings.get('lang', 'en')) || 'en';

  const [profile, workouts, latestMetrics, oneRMsRaw] = await Promise.all([
    loadProfile(),
    DB.Workouts.getAll(),
    DB.Metrics.latest(),
    DB.OneRM.getAll(),
  ]);

  const metrics = latestMetrics || null;
  const bw = metrics?.weight || 80;
  const age = computeAge(profile.dob);
  const oneRMs = mapOneRMs(oneRMsRaw);

  // PP-3: ячейка «DOTS» из бенто убрана — DOTS и скор висели рядом как два
  // независимых показателя, хотя второй производен от первого. Полный разбор
  // теперь на вкладке «Сила» в Athlete Room, вход — пилюля скора в hero.
  //
  // DATA-1: туда же ушли и полосы по подъёмам (renderLiftBars). Один и тот же
  // блок «Силовые показатели» рендерился дважды — здесь и на вкладке «Сила»
  // (athlete-room.js), — причём во второй раз рядом с разбором, который эти
  // цифры объясняет. Здесь остаётся радар: обзор, а не таблица. Тупика нет —
  // вход в детали держит пилюля скора (pp:openScore сразу открывает нужную
  // вкладку, см. profile.view/passport-hero.js).
  container.innerHTML =
    renderPassportHero(profile, metrics, oneRMs, resolvedLang) +
    renderBento(workouts, resolvedLang) +
    renderHexagonRadar(oneRMs, bw, profile.sex, age, workouts, resolvedLang);

  // Post-render: Apply AthleteRoom photo and colors
  _syncAvatar(container);
}

/** @param {HTMLElement} container */
async function _syncAvatar(container) {
  const [photo, colorIdxRaw] = await Promise.all([
    DB.Settings.get('athlete-photo', null),
    DB.Settings.get('avatar-color', '0'),
  ]);

  const avatar = container.querySelector('#pp-avatar-main');
  const ring = container.querySelector('#pp-avatar-ring-main');
  if (!avatar) return;

  if (photo) {
    avatar.style.backgroundImage = `url(${photo})`;
    avatar.style.backgroundSize = 'cover';
    const initials = avatar.querySelector('.pp-avatar-initials');
    if (initials) initials.style.display = 'none';
  }

  // Ring color matching AthleteRoom palette
  const palettes = [
    ['#4f46e5', '#06b6d4'], ['#10b981', '#059669'], ['#f59e0b', '#d97706'],
    ['#ec4899', '#be185d'], ['#8b5cf6', '#6d28d9']
  ];
  const idx = parseInt(colorIdxRaw) || 0;
  const [c1] = palettes[idx % palettes.length];
  if (ring) {
    ring.style.borderColor = c1;
    ring.style.opacity = '0.4';
  }
}
