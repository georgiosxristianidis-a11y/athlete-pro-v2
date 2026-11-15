// @ts-check
/* ════════════════════════════════════════════════════════
   avatar-ring.js — AVA-1: аватар в кольце (флаг 'avatar-ring', выбор Gio 16.11).
   Вынесено из athlete-room.js: тот стоит на потолке гиганта (file-size-ratchet),
   поэтому комната только зовёт эти функции правками в строку.
   Цвет кольца — id токена через profile.store.js, сам цвет рисует CSS
   по [data-ring] (css/athlete-room.css). Сырых hex здесь нет: c1/c2 —
   легаси-заливка «Цвет аватара» без фото, приходит из комнаты как есть.
   ════════════════════════════════════════════════════════ */
import { DB } from '../db.js';
import { getAvatarAppearance, setAvatarRing, AVATAR_RING_IDS, loadProfile } from '../profile.store.js';
import { tri } from '../locale.store.js';
import { on } from '../events.js';
import { haptic } from './utils.js';

const CAMERA_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';

/** @type {Record<string, [string, string, string]>} подписи 4 бренд-цветов */
const RING_LABELS = {
  brand: ['Бренд', 'Brand', 'Brand'],
  accent: ['Зелёный', 'Green', 'Πράσινο'],
  secondary: ['Фиолетовый', 'Violet', 'Μωβ'],
  chrome: ['Хром', 'Chrome', 'Χρώμιο'],
};

/** @returns {Promise<string>} сохранённый id кольца (неизвестный → brand) */
export async function loadRingId() {
  return (await getAvatarAppearance()).ringId;
}

/** @param {string|null} photo @param {string} c1 @param {string} c2 */
function faceLayer(photo, c1, c2) {
  return photo ? `url('${photo}')` : `linear-gradient(135deg, ${c1}, ${c2})`;
}

/**
 * Аватар комнаты атлета: круг в кольце, без ring-spin, один бейдж камеры.
 * @param {string|null} photo @param {string} c1 @param {string} c2
 * @param {string} initials уже экранированные инициалы @param {string} ringId
 */
export function ringRoomAvatarHtml(photo, c1, c2, initials, ringId) {
  return `<div class="ar-avatar ava-ring" id="ar-avatar-circle" data-ring="${ringId}" style="--ava-face: ${faceLayer(photo, c1, c2)}" data-action="ar:photoUpload">
           ${photo ? '' : `<div class="ar-avatar-initials">${initials}</div>`}
           <div class="ava-badge" aria-hidden="true">${CAMERA_SVG}</div>
         </div>`;
}

/** Ряд выбора цвета кольца — заменяет «Цвет рамки» в редакторе. @param {string} ringId */
export function ringPickerHtml(ringId) {
  const label = tri('Цвет кольца', 'Ring Color', 'Χρώμα δαχτυλιδιού');
  return `
              <div class="ar-editor-colors-label" style="margin-top:var(--sp-2)">${label}</div>
              <div class="ar-color-row" role="radiogroup" aria-label="${label}">
                ${AVATAR_RING_IDS.map((id) => `
                  <button type="button" class="ar-ring-swatch ava-ring ${id === ringId ? 'active' : ''}" data-ring="${id}"
                       role="radio" aria-checked="${id === ringId}" aria-label="${tri(...RING_LABELS[id])}"
                       data-action="ar:selectRing"></button>`).join('')}
              </div>`;
}

/**
 * Выбор цвета — без перерисовки комнаты (редактор остаётся открытым): правятся
 * только классы образцов и data-ring живых аватаров (шапка, комната, hero).
 * @param {string|undefined} id
 */
export async function selectRing(id) {
  haptic(10);
  const ringId = await setAvatarRing(id);
  for (const sw of document.querySelectorAll('.ar-ring-swatch')) {
    const isOn = /** @type {HTMLElement} */ (sw).dataset.ring === ringId;
    sw.classList.toggle('active', isOn);
    sw.setAttribute('aria-checked', isOn ? 'true' : 'false');
  }
  for (const el of document.querySelectorAll('.ava-ring:not(.ar-ring-swatch)')) {
    /** @type {HTMLElement} */ (el).dataset.ring = ringId;
  }
}
on('ar:selectRing', (el) => selectRing(/** @type {HTMLElement} */ (el).dataset.ring));

/**
 * Кружок шапки (30px) в кольце 2px; фото или легаси-заливка — слоем --ava-face.
 * Возвращает true сразу, чтобы initAvatar комнаты ушёл со своего легаси-пути.
 * @param {HTMLElement} btn @param {Array<[string, string]>} avatarColors
 */
export function initHeaderRing(btn, avatarColors) {
  void (async () => {
    const [{ photo, colorIdx, ringId }, customName, profile] = await Promise.all([
      getAvatarAppearance(),
      DB.Settings.get('athlete-name', ''),
      loadProfile(),
    ]);
    const face = document.getElementById('athlete-avatar-face') || btn;
    const [c1, c2] = avatarColors[colorIdx % avatarColors.length];
    btn.classList.toggle('has-photo', !!photo);
    face.classList.add('ava-ring');
    face.dataset.ring = ringId;
    face.style.background = '';
    face.style.removeProperty('--avatar-img');
    face.style.setProperty('--ava-face', faceLayer(photo, c1, c2));
    const ini = document.getElementById('athlete-avatar-initials');
    if (ini) {
      const name = customName || profile?.name || 'Athlete';
      ini.style.display = photo ? 'none' : 'block';
      ini.textContent = name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'A';
    }
  })();
  return true;
}
