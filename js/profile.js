// @ts-check
/* ════════════════════════════════════════════════════════
   profile.js — Athlete Pro  |  Profile: settings, metrics, data management
   ════════════════════════════════════════════════════════ */

import {
  getAllSettings,
  getStoredLang,
  adjustRestDuration,
  setWeightUnit,
  toggleHapticPref,
  toggleAutoProgressPref,
  toggleKeepAwakePref,
  getNotifyRest,
  setNotifyRest,
  togglePandaHidden,
  revealMascot,
  exportBackupJson,
  saveLastExportAt,
  importBackupJson,
  deleteAllUserData,
  getAllWorkouts,
  deduplicateWorkouts,
  getGymPlace,
  saveGymPlace,
  loadTxtExportSources,
  computeAge,
} from './profile.store.js';
import { t, getLang } from './locale.store.js';
import { renderProfile } from './profile.view.js';
import { renderSettings, backupSubLabel, backupMetaLabel } from './profile.view/settings.js';
import { VERSION } from './version.js';
import { Toast } from './shell.js';
import { on, onChange } from './events.js';
import { haptic, esc } from './shared/utils.js';
import { forceUpdate } from './shared/sw-update.js';

on('profile:clearData', () => window.Profile.clearAllData());
onChange('profile:importFile', (el, e) => window.Profile._onImportFile(e));

export const Profile = (() => {
  /* ══════════════════════════════════════════════
     MAIN LOAD
     ══════════════════════════════════════════════ */
  /**
   * Load and render the profile screen.
   * @returns {Promise<void>}
   */
  /* PP-6: full load() rebuilds the whole screen, including #profile-passport —
     which then refills itself from IndexedDB asynchronously. Every settings
     toggle used to go through here, so the passport was destroyed and rebuilt
     ~20 times a session, and the layout collapsed and re-grew under the user's
     finger each time. load() is now reserved for entering the screen and for
     import (which can rewrite everything); toggles go to the scoped refreshers
     below. */
  async function load() {
    const screen = document.getElementById('s-profile');
    if (!screen) return;

    try {
      const [syncStatus, settings] = await Promise.all([_syncStatus(), getAllSettings()]);
      const lang = getLang() || 'en';

      screen.innerHTML = `
      <div class="screen-header">
        <div>
          <div class="screen-title" id="profile-title">${esc(t('profile.title'))}</div>
          <div class="screen-sub" id="profile-sub">${esc(t('profile.sub'))}</div>
        </div>
      </div>

      <!-- ── Passport UI ── -->
      <div id="profile-passport"></div>

      <!-- Кнопка бэкапа переехала в секцию DATA настроек (PROF-1): она
           дублировала тамошний «Экспорт JSON» — одно действие в двух местах
           экрана. Одно-тапность сохранена, подпись с датой последнего
           бэкапа тоже. -->

      <!-- ── APP SETTINGS (MODULAR) ── -->
      <!-- PP-6: wrapper exists so _refreshSettings() can swap the settings
           markup alone. Plain div, no styling of its own: .screen is padding
           only (no flex/gap), so it doesn't disturb the vertical rhythm. -->
      <div id="profile-settings-block">${renderSettings(settings, lang, syncStatus)}</div>

      <!-- ── DANGER ZONE ── -->
      <div class="section-label-alt" id="profile-danger-label" style="color:var(--c-red); opacity:0.8">${esc(t('profile.danger_zone'))}</div>
      <button class="danger-btn" id="clear-data-btn" data-action="profile:clearData">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        <span id="clear-data-label">${esc(t('profile.clear_all'))}</span>
      </button>

      <!-- ── Version (Subtle Elite) ── -->
      <!-- padding-bottom: 120px — не ритм, а клиренс таб-бара, тот же, что у .screen. -->
      <div id="app-build-stamp" style="margin-top: var(--sp-6); padding-bottom: 120px; text-align: center; opacity: 0.25; font-size: var(--fs-1); font-weight: var(--fw-black); letter-spacing: 0.15em; color: var(--c-text-2); text-transform: uppercase;">
        Athlete Pro v${VERSION} · Elite Edition
      </div>
      <input type="file" id="import-file-input" accept=".json" style="display:none" data-change="profile:importFile">
    `;

      _refreshPassport(lang);
      _appendBuildStamp();
      _wireVersionTap();
    } catch (err) {
      console.error('Profile load error', err);
      screen.innerHTML = `<div style="padding:var(--sp-3);">${esc(t('profile.load_error'))}</div>`;
    }
  }

  /* ══════════════════════════════════════════════
     PP-6 — SCOPED REFRESHERS
     Same idea as privacy.view.js:_setMode — touch the node that actually
     changed, leave the rest of the screen (and the scroll position) alone.
     Handlers are delegated on `document` (events.js), so swapping innerHTML
     never loses a listener and nothing needs re-binding.
     ══════════════════════════════════════════════ */

  async function _syncStatus() {
    try {
      const { SyncManager } = await import('./sync.js');
      return SyncManager.getStatus();
    } catch (e) {
      console.warn('Offline mode: sync.js failed to load', e.message);
      return 'offline';
    }
  }

  /** Re-render the settings block only. Every toggle lands here. */
  async function _refreshSettings() {
    const block = document.getElementById('profile-settings-block');
    if (!block) return;
    const [syncStatus, settings, lang] = await Promise.all([
      _syncStatus(),
      getAllSettings(),
      getStoredLang(),
    ]);
    block.innerHTML = renderSettings(settings, lang, syncStatus);
  }

  /** Re-render the passport only — for actions that change workouts, not settings. */
  function _refreshPassport(lang) {
    const el = document.getElementById('profile-passport');
    if (!el) return Promise.resolve();
    const done = lang
      ? renderProfile(el, lang)
      : getStoredLang().then((l) => renderProfile(el, l));
    return done.catch(console.error);
  }

  /* Language touches text everywhere, so this is the widest refresher — but it
     still updates blocks in place instead of replacing the screen, which is
     what kept the passport alive. */
  async function _refreshLangDependent() {
    const lang = await getStoredLang();

    const title = document.getElementById('profile-title');
    if (title) title.textContent = t('profile.title');
    const sub = document.getElementById('profile-sub');
    if (sub) sub.textContent = t('profile.sub');

    /* Кнопка бэкапа больше не правится здесь поимённо: она внутри
       #profile-settings-block, который _refreshSettings() ниже перерисовывает
       целиком — уже на новом языке. */

    const dangerLabel = document.getElementById('profile-danger-label');
    if (dangerLabel) dangerLabel.textContent = t('profile.danger_zone');

    const clearLabel = document.getElementById('clear-data-label');
    if (clearLabel) clearLabel.textContent = t('profile.clear_all');

    await _refreshSettings();
    await _refreshPassport(lang);
  }

  /* Field-check identity: the dev/LAN server exposes /__build (branch+hash of
     the tree it serves). VERSION alone can't distinguish builds — the 0kg-fix
     retest silently ran an old worktree with the same version string.
     LOAD-8: prod has no such endpoint, so every profile visit there logged a
     404 and left a dead request in the network panel. The endpoint only ever
     exists on localhost or a LAN IP (scripts/telemetry-server.mjs --lan) —
     gate on that instead of eating the failure, so prod stays silent and the
     stamp still works on stands. textContent only — no markup injection
     surface. */
  function _isLocalHost() {
    const h = location.hostname;
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)
    );
  }

  async function _appendBuildStamp() {
    if (!_isLocalHost()) return;
    try {
      const res = await fetch('/__build', { cache: 'no-store' });
      if (!res.ok) return;
      const b = await res.json();
      if (!b || !b.hash) return;
      const el = document.getElementById('app-build-stamp');
      if (!el) return;
      el.textContent = el.textContent.trim() + ` · ${b.branch}@${b.hash}${b.dirty ? '+' : ''}`;
    } catch {
      /* offline — no stamp */
    }
  }

  /* Manual escape hatch: 5 taps on the version stamp within ~3s force a clean
     SW re-install (unregister + drop Cache Storage) — un-sticks a stubborn
     Service Worker without "clear site data", which would also wipe IndexedDB
     (workouts). Workouts survive here. */
  function _wireVersionTap() {
    const el = document.getElementById('app-build-stamp');
    if (!el || el._tapWired) return;
    el._tapWired = true;
    let taps = 0;
    let timer = null;
    el.addEventListener('click', () => {
      taps += 1;
      haptic(8);
      clearTimeout(timer);
      timer = setTimeout(() => {
        taps = 0;
      }, 3000);
      if (taps >= 5) {
        taps = 0;
        clearTimeout(timer);
        Toast.show(getLang() === 'ru' ? 'Обновление…' : 'Updating…', 'info');
        forceUpdate();
      }
    });
  }

  async function adjustRest(delta) {
    await adjustRestDuration(delta);
    _refreshSettings();
  }

  async function setUnit(unit) {
    await setWeightUnit(unit);
    _refreshSettings();
  }

  async function toggleHaptic() {
    await toggleHapticPref();
    _refreshSettings();
  }

  async function toggleAutoProgress() {
    await toggleAutoProgressPref();
    _refreshSettings();
  }

  async function togglePanda() {
    const next = await togglePandaHidden();

    const { Claude } = await import('./claude.view.js');
    if (next) {
      const fabContainer = document.getElementById('claude-fab-container');
      if (fabContainer) fabContainer.remove();
    } else {
      Claude.renderFAB();
    }
    _refreshSettings();
  }

  /** Тумблер живой панды (флаг 'fab-video' на устройстве) — полевой чек без консоли. */
  async function toggleFabVideo() {
    const { flag, setFlag } = await import('./flags.js');
    const next = !flag('fab-video');
    setFlag('fab-video', next);
    if (next) {
      // маскот/FAB должны быть видимы, иначе включение «в пустоту»
      await revealMascot();
    }
    // применить вживую: пересобрать FAB под новый флаг
    const { Claude } = await import('./claude.view.js');
    document.getElementById('claude-fab-container')?.remove();
    await Claude.renderFAB();
    Toast.show(next ? t('profile.mascot_live_on') : t('profile.mascot_live_off'), 'success');
    _refreshSettings();
  }

  /**
   * PANDA-1 — тумблер реакций маскота (флаг 'panda-moods' на устройстве).
   * Мимики рендерятся в видео-FAB, поэтому включение тянет за собой 'fab-video':
   * иначе тумблер включал бы невидимое.
   */
  async function togglePandaMoods() {
    const { flag, setFlag } = await import('./flags.js');
    const next = !flag('panda-moods');
    setFlag('panda-moods', next);
    if (next) {
      setFlag('fab-video', true);
      await revealMascot();
    }
    const { Claude } = await import('./claude.view.js');
    document.getElementById('claude-fab-container')?.remove();
    await Claude.renderFAB();
    Toast.show(next ? t('profile.panda_mood_on') : t('profile.panda_mood_off'), 'success');
    _refreshSettings();
  }

  async function exportData() {
    const json = await exportBackupJson();
    const { downloadText, exportFilename } = await import('./shared/download.js');
    downloadText(json, exportFilename('backup', 'json'), 'application/json');
    const now = Date.now();
    await saveLastExportAt(now);
    Toast.show(t('backup.done'), 'success');
    // Refresh the date in place — no full re-render (export can be triggered
    // from the reminder toast while another screen is active). Дата живёт в
    // двух узлах сразу: видимая мета в шапке карточки и длинная подпись в
    // title кнопки (hover на десктопе) — патчим оба, иначе тултип соврёт.
    const meta = document.getElementById('backup-meta');
    if (meta) meta.textContent = backupMetaLabel(now);
    const cta = document.querySelector('[data-action="settings:exportData"]');
    if (cta) cta.setAttribute('title', backupSubLabel(now));
  }

  function importData() {
    document.getElementById('import-file-input')?.click();
  }

  async function _onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importBackupJson(text);
      Toast.show(t('profile.import_ok'), 'success');
      // Import can rewrite everything — settings, workouts, language. This is
      // the one case where a full rebuild is the honest answer; it's rare and
      // heavy by nature, so the re-render cost doesn't matter.
      load();
    } catch {
      Toast.show(t('profile.import_fail'), 'error');
    }
  }

  let _deleteTapTimer = null;
  async function clearAllData() {
    const btn = document.getElementById('clear-data-btn');
    if (!btn) return;
    if (_deleteTapTimer) {
      clearTimeout(_deleteTapTimer);
      _deleteTapTimer = null;
      btn.classList.add('slide-out');
      setTimeout(async () => {
        await deleteAllUserData();
        window.location.reload();
      }, 400);
    } else {
      haptic(40);
      btn.classList.add('armed');
      _deleteTapTimer = setTimeout(() => {
        _deleteTapTimer = null;
        btn.classList.remove('armed');
      }, 3000);
    }
  }

  async function toggleKeepAwake() {
    await toggleKeepAwakePref(); // BG-1: default ON (opt-out)
    _refreshSettings();
  }

  /**
   * Сигнал об окончании отдыха. Разрешение у браузера просим ЗДЕСЬ и только
   * здесь — по осознанному тапу, а не посреди первого отдыха, как делал
   * rest-timer.js до 1.26. Правило простое: системный диалог показывается
   * ровно тогда, когда пользователь сам попросил включить.
   *
   * Отказ не прячем: тумблер откатывается назад, и тост объясняет, что
   * чинить надо в настройках сайта — само приложение уже ничего не может.
   */
  async function toggleNotify() {
    const supported = typeof Notification !== 'undefined';
    const isOn =
      (await getNotifyRest()) === 'on' && supported && Notification.permission === 'granted';

    if (isOn) {
      await setNotifyRest('off');
      Toast.show(t('settings.notify_off'), 'info');
      return _refreshSettings();
    }

    if (!supported) {
      Toast.show(t('settings.notify_denied'), 'error');
      return;
    }

    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission().catch(() => 'denied');
    if (perm !== 'granted') {
      // Настройку не включаем: иначе тумблер горел бы при глухом разрешении.
      await setNotifyRest('off');
      Toast.show(t('settings.notify_denied'), 'error');
      return _refreshSettings();
    }

    await setNotifyRest('on');
    haptic(10);
    Toast.show(t('settings.notify_on'), 'success');
    return _refreshSettings();
  }

  async function setLang(lang) {
    const { setLang: setLocaleLang } = await import('./locale.store.js');
    await setLocaleLang(lang);
    _refreshLangDependent();
  }

  async function exportCsv() {
    const { workoutsToCsv, downloadCsv } = await import('./shared/csv-export.js');
    const { exportFilename } = await import('./shared/download.js');
    const workouts = await getAllWorkouts();
    downloadCsv(workoutsToCsv(workouts), exportFilename('workouts', 'csv'));
  }

  /* TXT — выгрузка «для человека»: журнал текстом, читаемый без приложения.
     Дату последнего бэкапа НЕ обновляет: вернуть данные назад импортом умеет
     только JSON, и напоминалка про бэкап обязана считать именно его.

     Шапку собираем здесь, а не в txt-export.js: та функция чистая и про базу
     ничего не знает — ей передают готовый паспорт. Зал и страну спрашиваем
     один раз (дальше подставляются молча из настроек), потому что журнал
     обычно уезжает тренеру, и «где это было» — часть ответа. */
  async function exportTxt() {
    const { gym: gymSaved, country: countrySaved } = await getGymPlace();

    // Спрашиваем, пока место не заполнено. Заполнено — не мешаем: менять
    // можно, стерев значение (следующий экспорт снова спросит).
    let place = { gym: gymSaved || '', country: countrySaved || '' };
    if (!gymSaved && !countrySaved) {
      const { promptFieldsDialog } = await import('./shared/confirm.js');
      const res = await promptFieldsDialog({
        title: t('data.place_title'),
        message: t('data.place_msg'),
        fields: [
          { key: 'gym', label: t('data.place_gym'), placeholder: t('data.place_gym') },
          { key: 'country', label: t('data.place_country'), placeholder: t('data.place_country') },
        ],
        confirmLabel: t('data.place_save'),
        cancelLabel: getLang() === 'ru' ? 'Отмена' : 'Cancel',
      });
      if (!res) return; // отмена — файл не создаём
      place = res;
      await saveGymPlace(place);
    }

    const { workoutsToTxt } = await import('./shared/txt-export.js');
    const { downloadText, exportFilename } = await import('./shared/download.js');

    const { workouts, orms, customName, profile, metrics } = await loadTxtExportSources();

    const lang = getLang() === 'ru' ? 'ru' : 'en';
    const txt = workoutsToTxt(workouts, {
      lang,
      athlete: {
        name: customName || profile?.name || '',
        age: computeAge(profile?.dob),
        weight: metrics?.weight || null,
        gym: place.gym,
        country: place.country,
      },
      records: orms.map((r) => ({ name: r.id, value: Number(r.value) || 0 })),
    });
    downloadText(txt, exportFilename('log', 'txt'));
    Toast.show(t('data.export_txt_done'), 'success');
  }

  /**
   * Тема оформления: dark | light | auto.
   * @param {'dark'|'light'|'auto'} pref
   */
  async function setTheme(pref) {
    const { setThemePref } = await import('./shared/theme.js');
    setThemePref(pref);
    haptic(10);
    _refreshSettings();
  }

  async function deduplicateDB() {
    const { t } = await import('./locale.store.js');
    const removed = await deduplicateWorkouts();
    Toast.show(t('data.dedup_done', { n: removed }), removed > 0 ? 'success' : 'info');
    // Dedup changes workouts, not settings — only the passport is stale.
    _refreshPassport();
  }

  async function syncConnect() {
    try {
      const { SyncManager } = await import('./sync.js');
      const user = await SyncManager.signIn();
      const { t } = await import('./locale.store.js');
      if (user) {
        Toast.show(t('sync.status.idle'), 'success');
      } else {
        Toast.show(t('sync.status.error'), 'error');
      }
    } catch (e) {
      Toast.show(t('sync.you_offline'), 'error');
    }
  }

  async function syncDisconnect() {
    try {
      const { SyncManager } = await import('./sync.js');
      await SyncManager.signOut();
      _refreshSettings();
    } catch (e) {
      Toast.show(t('sync.you_offline'), 'error');
    }
  }

  /* ── Events ── */
  if (typeof window !== 'undefined') {
    window.addEventListener('ap-sync-status', (e) => {
      const status = e.detail?.status || 'idle';
      const el = document.getElementById('profile-sync-status');
      if (el) {
        const color =
          status === 'syncing'
            ? 'var(--c-blue)'
            : status === 'error'
              ? 'var(--c-red)'
              : status === 'offline'
                ? 'var(--c-text-3)'
                : 'var(--c-accent)';
        el.innerHTML = `
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${color}; box-shadow:0 0 8px ${status === 'offline' ? 'transparent' : color};"></span>
          <span style="font-size:var(--fs-1); font-weight:var(--fw-black); color:var(--c-text-3); text-transform:uppercase;">${status}</span>
        `;
      }
    });
  }

  return {
    load,
    adjustRest,
    setUnit,
    toggleHaptic,
    toggleKeepAwake,
    toggleAutoProgress,
    togglePanda,
    toggleFabVideo,
    togglePandaMoods,
    setLang,
    exportData,
    exportCsv,
    exportTxt,
    importData,
    setTheme,
    toggleNotify,
    _onImportFile,
    clearAllData,
    syncConnect,
    syncDisconnect,
    deduplicateDB,
  };
})();
