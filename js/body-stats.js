// @ts-check
/* ════════════════════════════════════════════════════════
   body-stats.js — BODY METRICS, view layer (card BS-1)

   One sheet, six tiles, a trend on each. The previous pass made every tile a
   separate one-field modal: updating a full set of measurements meant thirteen
   open/type/save/re-render cycles. A tap now opens the whole form with the
   tapped field focused, so the common case is one sheet and one save.

   Logic lives in body-stats.core.js — this file is DOM only.
   ════════════════════════════════════════════════════════ */
import { DB } from './db.js';
import { Spring } from './shared/spring.js';
import { Toast } from './shell.js';
import { esc } from './shared/utils.js';
import { confirmDialog } from './shared/confirm.js';
import { isRu } from './locale.store.js';
import { on } from './events.js';
import {
  BS_FIELDS, BS_INPUT_FIELDS, BS_FORM_SECTIONS, BS_BENTO,
  cellFocusField, bodyFatCategory, enrichEntries, sortEntries, latestValues,
  cellSeries, cellDelta, fieldDeltaAt, sparkPoints, fmtNum, fmtDelta,
} from './body-stats.core.js';

on('bs:edit',       (el) => openForm(el.dataset.focus || null));
on('bs:histToggle', (el) => el.parentElement?.classList.toggle('open'));
on('bs:delete',     (el, e) => { e.stopPropagation(); deleteEntry(el.dataset.date); });

const BS_KEY = 'ap-bodystats';
const SPARK_W = 100, SPARK_H = 38;

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString(isRu() ? 'ru' : 'en', { month: 'short', day: 'numeric', year: 'numeric' });

const label = (f) => (isRu() ? f.ru : f.label);

function bsLoad() {
  try {
    const raw = JSON.parse(localStorage.getItem(BS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}
function bsSave(data) {
  localStorage.setItem(BS_KEY, JSON.stringify(data));
}

/**
 * The screen lives in two hosts — the standalone `#body-stats-root` and the
 * Metrics tab of the athlete room, which passes its own node. A re-render after
 * save has no argument, so the last host is remembered here; without it the
 * athlete room silently kept showing pre-save values.
 * @type {HTMLElement|null}
 */
let _root = null;

/* ── Render ─────────────────────────────────────────────────────────────── */

/** @param {HTMLElement} [targetEl] */
export async function renderBodyStats(targetEl) {
  const root = targetEl || _root || document.getElementById('body-stats-root');
  if (!root) return;
  _root = root;

  const ru = isRu();
  const sex = (await DB.Settings.get('sex', 'm')) === 'f' ? 'f' : 'm';
  const latestMetric = await DB.Metrics.latest();
  const stored = bsLoad();
  // Height lives in the metrics store (onboarding writes it there); legacy logs
  // carried their own copy. Without it the Navy formula cannot answer at all.
  const heightCm = latestMetric?.height || sortEntries(stored)[0]?.height || null;

  const entries = enrichEntries(stored, { sex, heightCm });
  const latest = entries[0] || null;

  root.innerHTML = `
    <div class="bs-wrap">
      <div class="bs-header">
        <h2 class="bs-title">${ru ? 'Замеры тела' : 'Body Measurements'}</h2>
        <button class="btn-primary bs-add-btn" data-action="bs:edit">
          ${ru ? 'Обновить' : 'Update'}
        </button>
      </div>
      <div class="bs-last-date">
        ${latest
          ? `${ru ? 'последний замер' : 'last measured'} · ${esc(fmtDate(latest.date))}`
          : (ru ? 'ещё нет замеров' : 'no measurements yet')}
      </div>
      <div class="bs-grid">${entries.length ? gridHtml(entries, latestMetric, sex, ru) : ''}</div>
      ${entries.length
        ? `<div class="bs-section-title">${ru ? 'История' : 'History'}</div>
           <div class="bs-history">${historyHtml(entries, ru)}</div>`
        : emptyHtml(ru)}
    </div>`;
}

function emptyHtml(ru) {
  return `
    <div class="bs-empty">
      <svg class="bs-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" width="40" height="40">
        <path d="M3 8h18M3 8v8a2 2 0 002 2h14a2 2 0 002-2V8M3 8V6a2 2 0 012-2h14a2 2 0 012 2v2"/>
        <path d="M7 8v3M11 8v5M15 8v3M19 8v5"/>
      </svg>
      <p class="bs-empty-title">${ru ? 'Пока пусто' : 'Nothing yet'}</p>
      <p class="bs-empty-sub">${ru
        ? 'Один замер — это точка. Два — уже тренд: рост рук, уход талии, динамика жира.'
        : 'One entry is a dot. Two make a trend — arm growth, waist loss, fat direction.'}</p>
      <button class="btn-primary bs-add-btn" data-action="bs:edit">${ru ? 'Первый замер' : 'First entry'}</button>
    </div>`;
}

/** Six tiles: value, change since the previous entry that had it, trend line. */
function gridHtml(entries, latestMetric, sex, ru) {
  return BS_BENTO.map((cell) => {
    const points = cellSeries(entries, cell);
    // The newest entry the metric appears in, not the newest entry outright: a
    // user who logs only waist today must not blank out every other tile.
    let val = points.length ? points[points.length - 1].v : null;
    // Weight also lives in the encrypted metrics store (profile/BMI); prefer it
    // when the measurement log has no weight of its own.
    if (cell.id === 'weight' && val == null && latestMetric?.weight) val = latestMetric.weight;

    const delta = cellDelta(entries, cell);
    const pts = sparkPoints(points.map((p) => p.v), SPARK_W, SPARK_H);

    let sub = '';
    if (cell.id === 'body_fat' && val != null) {
      const cat = bodyFatCategory(val, sex);
      sub = `<div class="bs-stat-sub" style="color:${cat.color}">${ru ? cat.ru : cat.label}</div>`;
    } else if (cell.id === 'weight' && latestMetric?.bmi) {
      sub = `<div class="bs-stat-sub">BMI ${esc(String(latestMetric.bmi))}</div>`;
    }

    return `
      <div class="bs-stat-card" style="--bs-accent:${cell.color}"
           data-action="bs:edit" data-focus="${cellFocusField(cell.id)}">
        <div class="bs-stat-top">
          <span class="bs-stat-label">${ru ? cell.ru : cell.label}</span>
          ${delta ? `<span class="bs-delta bs-delta-${delta.tone}">${fmtDelta(delta.diff)}</span>` : ''}
        </div>
        <div class="bs-stat-value">${fmtNum(val)}<span class="bs-stat-unit">${cell.unit}</span></div>
        ${sub}
        ${pts
          ? `<svg class="bs-spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none" aria-hidden="true">
               <polyline points="${pts}" fill="none" stroke="var(--bs-accent)" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
             </svg>`
          : `<div class="bs-spark-empty">${ru ? 'нужен ещё замер' : 'one more entry'}</div>`}
      </div>`;
  }).join('');
}

/** Collapsed by date; opened it shows every field with its own change. */
function historyHtml(entries, ru) {
  return entries.slice(0, 12).map((e, i) => {
    const rows = BS_FIELDS.filter((f) => e[f.id] != null).map((f) => {
      const d = fieldDeltaAt(entries, f.id, i);
      return `
        <div class="bs-hist-cell">
          <span class="bs-hist-lbl">${label(f)}</span>
          ${d ? `<span class="bs-delta bs-delta-${d.tone}">${fmtDelta(d.diff)}</span>` : ''}
          <span class="bs-hist-val">${fmtNum(e[f.id])} ${f.unit}</span>
        </div>`;
    }).join('');

    const w = e.weight != null ? `${fmtNum(e.weight)} kg` : '';
    return `
      <div class="bs-hist-entry">
        <div class="bs-hist-head" data-action="bs:histToggle">
          <span class="bs-hist-date">${esc(fmtDate(e.date))}</span>
          <span class="bs-hist-weight">${w}</span>
          <span class="bs-hist-chev">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><path d="M9 6l6 6-6 6"/></svg>
          </span>
        </div>
        <div class="bs-hist-body">
          ${rows}
          <button class="bs-del-btn" data-action="bs:delete" data-date="${esc(e.date)}">
            ${ru ? 'Удалить запись' : 'Delete entry'}
          </button>
        </div>
      </div>`;
  }).join('');
}

/* ── Form ───────────────────────────────────────────────────────────────── */

/**
 * One sheet for every field, prefilled from the latest entry. `focusId` is the
 * field the user tapped — it gets focus and selection, so the tile tap still
 * feels like "edit this one" while the rest stays one scroll away.
 * @param {string|null} focusId
 */
function openForm(focusId) {
  const ru = isRu();
  const today = new Date().toISOString().split('T')[0];
  const latest = latestValues(bsLoad());

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay bs-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet bs-sheet">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <span class="modal-title">${ru ? 'Замеры' : 'Measurements'}</span>
        <button class="btn-icon-sm bs-close-x" aria-label="${ru ? 'Закрыть' : 'Close'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="bs-date-row">
        <label class="bs-field-label" for="bsf-date">${ru ? 'Дата' : 'Date'}</label>
        <input type="date" id="bsf-date" class="bs-date-inp" value="${today}" max="${today}">
      </div>
      <div class="bs-fields-scroll">
        ${BS_FORM_SECTIONS.map((sec) => `
          <div class="bs-form-sec">${ru ? sec.ru : sec.label}</div>
          ${sec.fields.map((id) => {
            const f = BS_INPUT_FIELDS.find((x) => x.id === id);
            if (!f) return '';
            const v = latest[f.id] != null ? fmtNum(latest[f.id]) : '';
            return `
              <div class="bs-field">
                <label class="bs-field-label" for="bsf-${f.id}">${label(f)}</label>
                <div class="bs-field-inp-wrap">
                  <input type="number" inputmode="decimal" step="0.1" min="0" class="bs-field-inp"
                         id="bsf-${f.id}" value="${v}" placeholder="—">
                  <span class="bs-field-unit">${f.unit}</span>
                </div>
              </div>`;
          }).join('')}
        `).join('')}
        <p class="bs-form-note">${ru
          ? 'Процент жира считается по формуле ВМФ США из талии, шеи и роста — вводить его не нужно.'
          : 'Body fat is derived from waist, neck and height (U.S. Navy formula) — no need to enter it.'}</p>
      </div>
      <div class="bs-form-actions">
        <button class="btn-primary bs-save-btn" id="bsf-save">${ru ? 'Сохранить' : 'Save'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const sheet = /** @type {HTMLElement} */ (overlay.querySelector('.bs-sheet'));
  sheet.style.transform = 'translateY(100%)';
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    Spring.animate({
      from: 100, to: 0, stiffness: 200, damping: 20,
      onUpdate: (v) => { sheet.style.transform = `translateY(${v}%)`; },
    });
    const target = /** @type {HTMLInputElement|null} */ (
      focusId ? overlay.querySelector('#bsf-' + focusId) : null);
    if (target) { target.focus(); target.select(); target.scrollIntoView({ block: 'center' }); }
  });

  const close = () => {
    overlay.classList.remove('visible');
    Spring.animate({
      from: 0, to: 100, stiffness: 250, damping: 25,
      onUpdate: (v) => { sheet.style.transform = `translateY(${v}%)`; },
      onComplete: () => overlay.remove(),
    });
  };
  /** @type {HTMLElement} */ (overlay.querySelector('.bs-close-x')).onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  // Prefilled values are a convenience, not a measurement: saving them all would
  // stamp today's date onto numbers the user never re-measured, and every metric
  // would then report a "0" change. Only what the user actually touched is saved.
  overlay.addEventListener('input', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.classList.contains('bs-field-inp')) t.dataset.dirty = '1';
  });

  /** @type {HTMLElement} */ (overlay.querySelector('#bsf-save')).onclick = async () => {
    const date = /** @type {HTMLInputElement} */ (overlay.querySelector('#bsf-date')).value;
    if (!date) return;

    const stored = bsLoad();
    const existing = stored.find((e) => e.date === date);
    const entry = existing || { date };

    let changed = 0;
    for (const f of BS_INPUT_FIELDS) {
      const inp = /** @type {HTMLInputElement|null} */ (overlay.querySelector('#bsf-' + f.id));
      if (!inp || inp.dataset.dirty !== '1') continue;
      const raw = inp.value.trim();
      // Empty means "leave as is", not "erase" — clearing a prefilled field must
      // not delete a measurement the user only meant to skip.
      if (raw === '') continue;
      const v = parseFloat(raw);
      if (!Number.isFinite(v) || v <= 0) continue;
      if (entry[f.id] !== v) changed++;
      entry[f.id] = v;
    }

    // Nothing touched → nothing written. An entry with no measurements would
    // still show up in the history as a dated, empty card.
    if (changed) {
      if (!existing) stored.push(entry);
      bsSave(stored);
    }

    if (changed && entry.weight) {
      const m = await DB.Metrics.latest();
      if (m?.weight !== entry.weight) await DB.Metrics.save(entry.weight, m?.height || 180);
    }

    close();
    await renderBodyStats();
    Toast.show(
      isRu() ? (changed ? 'Замеры сохранены' : 'Без изменений') : (changed ? 'Measurements saved' : 'No changes'),
      changed ? 'success' : 'info'
    );
  };
}

async function deleteEntry(dateIso) {
  const ru = isRu();
  const ok = await confirmDialog({
    title: ru ? 'Удалить запись?' : 'Delete entry?',
    message: (ru ? 'Замеры за ' : 'Measurements for ') + fmtDate(dateIso) + (ru ? ' будут удалены.' : ' will be removed.'),
    confirmLabel: ru ? 'Удалить' : 'Delete',
    danger: true,
  });
  if (!ok) return;
  bsSave(bsLoad().filter((e) => e.date !== dateIso));
  await renderBodyStats();
}
