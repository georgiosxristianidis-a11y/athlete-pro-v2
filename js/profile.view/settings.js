// @ts-check
import { esc } from '../shared/utils.js';
import { t, getLang } from '../locale.store.js';
import { on } from '../events.js';
import { flag } from '../flags.js';
import { K_LAST_EXPORT } from '../db/backup.js';
import { getThemePref } from '../shared/theme.js';
import '../ai-settings.view.js';

/**
 * Подпись под кнопкой бэкапа: «Последний бэкап: 18 июл» / «ни разу».
 * Живёт здесь, а не в `db/backup.js`: слою базы незачем знать про локаль.
 * @param {number|string|undefined} lastExportAt
 * @returns {string}
 */
export function backupSubLabel(lastExportAt) {
  const ts = Number(lastExportAt) || 0;
  if (!ts) return t('backup.save_sub_never');
  const d = new Date(ts).toLocaleDateString(getLang() === 'ru' ? 'ru' : 'en', {
    day: 'numeric',
    month: 'short',
  });
  return t('backup.save_sub_last', { d });
}

/**
 * Короткая форма той же даты — для шапки карточки бэкапа (DATA-1). Кнопка
 * стала однострочной, но дата обязана остаться на виду и на телефоне: она
 * якорь напоминалки «две недели без бэкапа», а hover на тач-экране не
 * существует. Длинная подпись при этом жива — она ушла в title кнопки.
 * @param {number|string|undefined} lastExportAt
 * @returns {string}
 */
export function backupMetaLabel(lastExportAt) {
  const ts = Number(lastExportAt) || 0;
  if (!ts) return t('backup.meta_never');
  const d = new Date(ts).toLocaleDateString(getLang() === 'ru' ? 'ru' : 'en', {
    day: 'numeric',
    month: 'short',
  });
  return t('backup.meta_last', { d });
}

const P = () => window.Profile;
on('settings:adjustRest', (el) => P().adjustRest(+el.dataset.amt));
on('settings:toggleHaptic', (el) => P().toggleHaptic());
on('settings:toggleKeepAwake', () => P().toggleKeepAwake());
on('settings:toggleNotify', () => P().toggleNotify());
on('settings:setLang', (el) => P().setLang(el.dataset.lang));
on('settings:toggleAutoProgress', () => P().toggleAutoProgress());
on('settings:setUnit', (el) => P().setUnit(el.dataset.unit));
on('settings:togglePanda', () => P().togglePanda());
on('settings:toggleFabVideo', () => P().toggleFabVideo());
on('settings:togglePandaMoods', () => P().togglePandaMoods());
on('settings:syncToggle', async (el) => {
  const icon = document.getElementById('sync-connect-icon');
  icon?.classList.add('is-spinning');
  try {
    await (el.dataset.sync === 'offline' ? P().syncConnect() : P().syncDisconnect());
  } finally {
    if (icon) {
      icon.classList.remove('is-spinning');
      icon.classList.add('is-settled');
      setTimeout(() => icon.classList.remove('is-settled'), 500);
    }
  }
});
on('settings:setTheme', (el) => P().setTheme(el.dataset.theme));
on('settings:exportData', () => P().exportData());
on('settings:exportCsv', () => P().exportCsv());
on('settings:exportTxt', () => P().exportTxt());
on('settings:importData', () => P().importData());
on('settings:dedup', () => P().deduplicateDB());

/**
 * Render the complete Application Settings for the Profile tab.
 * @param {Object} settings - All settings from DB.Settings.getAll()
 * @param {string} lang - Current language code ('en'|'ru')
 * @param {string} syncStatus - Current sync status
 * @returns {string}
 */
export function renderSettings(settings, lang, syncStatus = 'idle') {
  const themePref = getThemePref();
  // Тумблер уведомлений отражает ДВА состояния сразу: наше «хочу» из базы и
  // ответ браузера. Разрешение можно отозвать в настройках телефона, минуя
  // приложение, — тумблер, который об этом не знает, врал бы «включено».
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
  const notifyBlocked = perm === 'denied';
  const notifyOn = settings['notify-rest'] === 'on' && perm === 'granted';
  const syncStatusLabel = t(`sync.status.${syncStatus}`);
  const syncStatusColor =
    syncStatus === 'error'
      ? 'var(--c-red)'
      : syncStatus === 'syncing'
        ? 'var(--c-blue)'
        : syncStatus === 'offline'
          ? 'var(--c-text-3)'
          : 'var(--c-accent)';

  return `
    <!-- ── GENERAL SETTINGS ── -->
    <div class="section-label-alt">${t('settings.general')}</div>
    <div class="profile-card" style="padding:0">
      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:var(--c-surface-h)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${t('settings.rest')}</div>
          <div class="pref-sub">${settings['rest-duration'] || 90}s ${t('settings.rest_sub')}</div>
        </div>
        <div class="mini-stepper" style="background: var(--c-bg-3); border-radius: var(--r-m); padding: var(--sp-0-5); gap: var(--sp-1); display: flex; align-items: center;">
          <button data-action="settings:adjustRest" data-amt="-15" style="width: 28px; height: 28px; border-radius: var(--r-sm); background: var(--c-surface); border: 1px solid var(--c-border); color: var(--c-text-1);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="12" height="12"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button data-action="settings:adjustRest" data-amt="15" style="width: 28px; height: 28px; border-radius: var(--r-sm); background: var(--c-surface); border: 1px solid var(--c-border); color: var(--c-text-1);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
      
      <div class="pref-divider" style="margin:0 var(--sp-2)"></div>

      <!-- Сигнал об отдыхе. Тумблер стоит сразу под длительностью отдыха —
           это одна и та же мысль, «сколько ждать» и «как узнать, что дождался».
           До 1.26 тумблера не было вовсе: rest-timer.js дёргал системный запрос
           разрешения на первом же отдыхе, посреди подхода и без объяснения.
           Теперь запрос уходит только по тапу сюда (см. Profile.toggleNotify),
           а отказ браузера честно виден в подписи: сама подпись — единственное
           место, где пользователь узнает, что чинить надо в настройках
           браузера, а не в приложении. -->
      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:var(--c-surface-h)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${t('settings.notify')}</div>
          <div class="pref-sub">${t(notifyBlocked ? 'settings.notify_blocked' : 'settings.notify_sub')}</div>
        </div>
        <div class="switch-wrap" data-action="settings:toggleNotify">
          <div class="switch ${notifyOn ? 'on' : ''}" id="sw-notify">
            <div class="switch-thumb"></div>
          </div>
        </div>
      </div>

      <div class="pref-divider" style="margin:0 var(--sp-2)"></div>

      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:var(--c-accent-bg)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" stroke-width="2" width="18" height="18"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${t('settings.haptic')}</div>
          <div class="pref-sub">${t('settings.haptic_sub')}</div>
        </div>
        <div class="switch-wrap" data-action="settings:toggleHaptic">
          <div class="switch ${settings['haptic'] !== 'off' ? 'on' : ''}" id="sw-haptic">
            <div class="switch-thumb"></div>
          </div>
        </div>
      </div>

      <div class="pref-divider" style="margin:0 var(--sp-2)"></div>

      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:var(--c-blue-bg)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--c-blue)" stroke-width="2" width="18" height="18"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${t('settings.awake')}</div>
          <div class="pref-sub">${t('settings.awake_sub')}</div>
        </div>
        <div class="switch-wrap" data-action="settings:toggleKeepAwake">
          <div class="switch ${settings['keep-awake'] !== 'off' ? 'on' : ''}" id="sw-keep-awake">
            <div class="switch-thumb"></div>
          </div>
        </div>
      </div>

      <div class="pref-divider" style="margin:0 var(--sp-2)"></div>

      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:var(--c-surface-h)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${t('settings.lang')}</div>
          <div class="pref-sub">${t('settings.lang_sub')}</div>
        </div>
        <div class="toggle-group">
          <button class="toggle-btn ${lang !== 'ru' ? 'active' : ''}"
                  data-action="settings:setLang" data-lang="en">EN</button>
          <button class="toggle-btn ${lang === 'ru' ? 'active' : ''}"
                  data-action="settings:setLang" data-lang="ru">RU</button>
        </div>
      </div>

      <div class="pref-divider" style="margin:0 var(--sp-2)"></div>

      <!-- Тема. Три состояния не влезают в правую колонку на 375px, поэтому
           строка идёт колонкой (.pref-col) — сегмент во всю ширину под
           заголовком. Дефолт — тёмная; 'auto' следует системной настройке
           телефона и переключается на лету (matchMedia в shared/theme.js). -->
      <div class="pref-row-icon pref-col">
        <div style="display:flex; align-items:center; gap:var(--sp-2)">
          <div class="pref-icon-box" style="background:var(--c-surface-h)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/></svg></div>
          <div class="pref-info">
            <div class="pref-title">${t('settings.theme')}</div>
            <div class="pref-sub">${t(themePref === 'auto' ? 'settings.theme_sub_auto' : 'settings.theme_sub')}</div>
          </div>
        </div>
        <div class="toggle-group seg-full">
          <button class="toggle-btn seg-sm ${themePref === 'dark' ? 'active' : ''}"
                  data-action="settings:setTheme" data-theme="dark">${t('theme.dark')}</button>
          <button class="toggle-btn seg-sm ${themePref === 'light' ? 'active' : ''}"
                  data-action="settings:setTheme" data-theme="light">${t('theme.light')}</button>
          <button class="toggle-btn seg-sm ${themePref === 'auto' ? 'active' : ''}"
                  data-action="settings:setTheme" data-theme="auto">${t('theme.auto')}</button>
        </div>
      </div>
    </div>

    <!-- ── TRAINING SETTINGS ── -->
    <div class="section-label-alt">${t('settings.training')}</div>
    <div class="profile-card" style="padding:var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-2);">
      <div style="display:flex; align-items:center; justify-content:space-between">
        <div class="pref-info">
          <div class="pref-title">${t('settings.smart_progress')}</div>
          <div class="pref-sub">${t('settings.smart_progress_sub')}</div>
        </div>
        <div class="switch-wrap" data-action="settings:toggleAutoProgress">
          <div class="switch ${settings['auto-progress'] !== 'off' ? 'on' : ''}" id="sw-auto-progress">
            <div class="switch-thumb"></div>
          </div>
        </div>
      </div>

      <div class="pref-divider"></div>

      <div style="display:flex; align-items:center; justify-content:space-between">
        <div class="pref-info">
          <div class="pref-title">${t('settings.unit')}</div>
          <div class="pref-sub">${t('settings.unit_sub')}</div>
        </div>
        <div class="toggle-group">
          <button class="toggle-btn ${(settings['weight-unit'] || 'kg') === 'kg' ? 'active' : ''}"
                  data-action="settings:setUnit" data-unit="kg">kg</button>
          <button class="toggle-btn ${settings['weight-unit'] === 'lbs' ? 'active' : ''}"
                  data-action="settings:setUnit" data-unit="lbs">lbs</button>
        </div>
      </div>

      <!-- Здесь стояли «Режим тренировок», «Длительность сессии» и «Ограничения».
           Убраны как мёртвые (PROF-1): все три писались в IndexedDB и не читались
           никем — коуч отправляет только имя/возраст/пол/цель (claude.store.js),
           генератор планов их не смотрел вовсе. У «Ограничений» вдобавок расходились
           ключи: запись шла в limitations, чтение профиля — из coach.injuries.
           Ключи в базе не удаляем (старые бэкапы), но UI больше не обещает влияния,
           которого нет. Вернуть — когда коуч начнёт их реально читать. -->
    </div>

    <!-- ── AI ASSISTANT ── -->
    <div class="section-label-alt">${t('settings.ai')}</div>
    <div class="profile-card" style="padding:var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-2);">
        <div class="pref-row-icon" data-action="ai:openSettings">
          <div class="pref-icon-box" style="background:var(--c-surface-h)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0-.33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
          <div class="pref-info">
            <div class="pref-title">${t('settings.ai_core')}</div>
            <div class="pref-sub">${t('settings.ai_core_sub')}</div>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="color:var(--c-text-3); flex-shrink:0">
            <polyline points="9 6 15 12 9 18"/>
          </svg>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding: var(--sp-0-5) 0;">
          <div class="pref-info">
            <div class="pref-title">P.A.N.D.A Assistant</div>
            <div class="pref-sub">Floating AI Bubble</div>
          </div>
          <div class="switch-wrap" data-action="settings:togglePanda">
            <div class="switch ${settings['ai-panda-hidden'] ? '' : 'on'}" id="sw-panda">
              <div class="switch-thumb"></div>
            </div>
          </div>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding: var(--sp-0-5) 0;">
          <div class="pref-info">
            <div class="pref-title">${lang === 'ru' ? 'Живой маскот (бета)' : 'Live Mascot (beta)'}</div>
            <div class="pref-sub">${lang === 'ru' ? 'Видео-панда с озвучкой' : 'Panda video with voice'}</div>
          </div>
          <div class="switch-wrap" data-action="settings:toggleFabVideo">
            <div class="switch ${flag('fab-video') ? 'on' : ''}" id="sw-fab-video">
              <div class="switch-thumb"></div>
            </div>
          </div>
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; padding: var(--sp-0-5) 0;">
          <div class="pref-info">
            <div class="pref-title">${lang === 'ru' ? 'Реакции панды (бета)' : 'Panda Reactions (beta)'}</div>
            <div class="pref-sub">${lang === 'ru' ? 'Осуждает за долгий отдых, ведёт счёт' : 'Judges long rests, keeps score'}</div>
          </div>
          <div class="switch-wrap" data-action="settings:togglePandaMoods">
            <div class="switch ${flag('panda-moods') ? 'on' : ''}" id="sw-panda-moods">
              <div class="switch-thumb"></div>
            </div>
          </div>
        </div>
    </div>

    <!-- ── DATA & CLOUD SYNC ── -->
    ${_renderData(settings, syncStatus, syncStatusLabel, syncStatusColor)}
  `;
}

/**
 * DATA-1 — секция данных, разложенная на четыре карточки по смыслу.
 *
 * До этого всё жило в одной карточке: синк, бэкап, выгрузка наружу и починка
 * базы шли подряд через `.pref-divider`, а кнопок было четыре разных типа
 * подряд — глазу не за что зацепиться, какое действие здесь главное. Границы
 * между кусками настоящие (облако ≠ файл на диск ≠ файл наружу ≠ ремонт базы),
 * поэтому они и стали карточками — ровно тем же приёмом, каким уже разделены
 * GENERAL / TRAINING / AI выше по экрану. Один тип кнопки на карточку:
 * primary — только «Экспорт JSON», soft — вторичные действия, ghost — ремонт.
 *
 * Флага здесь нет намеренно. Первая версия правки держала прежнюю разметку
 * рядом под `data-block-v2` как аварийный откат — и эта копия увела прекеш за
 * бюджет карточки F-7 (1.5547 против 1.55 MB). Правка чисто презентационная,
 * логика экспорта/импорта не тронута, так что цена килобайтов на сотовой
 * установке выше цены тумблера: откат здесь — `git revert`.
 *
 * @param {Object} settings @param {string} syncStatus
 * @param {string} syncStatusLabel @param {string} syncStatusColor
 * @returns {string}
 */
function _renderData(settings, syncStatus, syncStatusLabel, syncStatusColor) {
  return `
    <div class="section-label-alt">${t('settings.cloud')}</div>
    <div class="profile-card" style="padding:0">
      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:var(--c-accent-bg); color:var(--c-accent)">
          <svg id="sync-connect-icon" class="icon-rotate" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        </div>
        <div class="pref-info">
          <div class="pref-title">${t('sync.connect')}</div>
          <div class="pref-sub" style="color:${syncStatusColor}; font-weight: var(--fw-bold);">${syncStatusLabel}</div>
        </div>
        <button class="btn-text"
                data-action="settings:syncToggle" data-sync="${syncStatus}"
                style="color: var(--c-accent); font-size: var(--fs-2); font-weight: var(--fw-bold);">
          ${syncStatus === 'offline' ? t('sync.connect_cta') : t('sync.disconnect')}
        </button>
      </div>
    </div>

    <!-- Резервная копия. Единственная primary-кнопка всей секции: это то
         действие, ради которого сюда заходят.

         Кнопка однострочная (заявка Gio 2026-08-21). Вторая строка с датой
         последнего бэкапа стояла ВНУТРИ кнопки и делала её двухэтажной — но
         сама дата нужна: без неё напоминалка «две недели без бэкапа» теряет
         якорь (GYM-GRADE DoD-5). Дата ушла в шапку карточки, а длинная подпись
         осталась в title — на десктопе она всплывает по наведению, тач её
         игнорирует и ничего не теряет, потому что дата и так на виду. -->
    <div class="section-label-alt">${t('data.backup')}</div>
    <div class="profile-card" style="padding:var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-1-5);">
      <div style="display: flex; align-items: center; gap: var(--sp-1-5);">
        <div class="pref-icon-box" style="background:var(--c-surface-h)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${t('data.backup')}</div>
        </div>
        <span id="backup-meta" style="font-size: var(--fs-1); font-weight: var(--fw-bold); color: var(--c-text-3); text-transform: uppercase; letter-spacing: 0.06em;">${esc(backupMetaLabel(settings[K_LAST_EXPORT]))}</span>
      </div>
      <button class="btn btn-primary" data-action="settings:exportData"
              title="${esc(backupSubLabel(settings[K_LAST_EXPORT]))}"
              style="width: 100%;">${t('backup.save')}</button>
      <button class="btn btn-soft" data-action="settings:importData" style="width: 100%;">${t('data.import')}</button>
    </div>

    <!-- Выгрузка наружу. Обе кнопки равны по весу — это не «главная и
         запасная», а два разных адресата: TXT = журнал человеку (тренеру, в
         заметки, на печать), CSV = таблица в Excel/Sheets. -->
    <div class="section-label-alt">${t('data.share_out')}</div>
    <div class="profile-card" style="padding:var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-1-5);">
      <div style="display: flex; align-items: center; gap: var(--sp-1-5);">
        <div class="pref-icon-box" style="background:var(--c-surface-h)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${t('data.share_out')}</div>
        </div>
      </div>
      <div style="display: flex; gap: var(--sp-1-5);">
        <button class="btn btn-soft" data-action="settings:exportTxt" style="flex: 1 1 50%;">${t('data.export_txt')}</button>
        <button class="btn btn-soft" data-action="settings:exportCsv" style="flex: 1 1 50%;">${t('data.export_csv')}</button>
      </div>
    </div>

    <!-- Обслуживание — не бэкап: чинит саму базу, а не спасает данные наружу.
         Отдельной карточкой именно поэтому: стоя внутри блока бэкапов, оно
         читалось как ещё один способ сохранить данные. -->
    <div class="section-label-alt">${t('data.maintenance')}</div>
    <div class="profile-card" style="padding:0">
      <div class="pref-row-icon">
        <div class="pref-icon-box" style="background:var(--c-surface-h)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg></div>
        <div class="pref-info">
          <div class="pref-title">${t('data.dedup')}</div>
          <div class="pref-sub">${t('data.dedup_sub')}</div>
        </div>
        <button class="btn btn-ghost" data-action="settings:dedup" style="min-width: 92px; height: 36px; font-size: var(--fs-2); color: var(--c-text-3);">${t('data.dedup_run')}</button>
      </div>
    </div>
  `;
}
