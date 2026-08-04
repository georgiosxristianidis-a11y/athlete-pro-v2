// @ts-check
import { esc } from '../shared/utils.js';
import { t, getLang } from '../locale.store.js';
import { on, onInput, onBlur } from '../events.js';
import { flag } from '../flags.js';
import { K_LAST_EXPORT } from '../db/backup.js';
import { getThemePref } from '../shared/theme.js';

/**
 * Подпись под кнопкой бэкапа: «Последний бэкап: 18 июл» / «ни разу».
 * Живёт здесь, а не в `db/backup.js`: слою базы незачем знать про локаль.
 * @param {number|string|undefined} lastExportAt
 * @returns {string}
 */
export function backupSubLabel(lastExportAt) {
  const ts = Number(lastExportAt) || 0;
  if (!ts) return t('backup.save_sub_never');
  const d = new Date(ts).toLocaleDateString(getLang() === 'ru' ? 'ru' : 'en', { day: 'numeric', month: 'short' });
  return t('backup.save_sub_last', { d });
}

const P = () => window.Profile;
on('settings:adjustRest',  (el) => P().adjustRest(+el.dataset.amt));
on('settings:toggleHaptic',(el) => P().toggleHaptic());
on('settings:toggleKeepAwake', () => P().toggleKeepAwake());
on('settings:toggleNotify', () => P().toggleNotify());
on('settings:setLang',     (el) => P().setLang(el.dataset.lang));
on('settings:toggleAutoProgress', () => P().toggleAutoProgress());
on('settings:setUnit',     (el) => P().setUnit(el.dataset.unit));
on('settings:setEngine',   (el) => P().setEngine(el.dataset.engine));
on('settings:togglePanda', () => P().togglePanda());
on('settings:toggleFabVideo', () => P().toggleFabVideo());
on('settings:togglePandaMoods', () => P().togglePandaMoods());
on('settings:toggleKeyVis',() => P().toggleKeyVisibility());
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
on('settings:setTheme',    (el) => P().setTheme(el.dataset.theme));
on('settings:exportData',  () => P().exportData());
on('settings:exportCsv',   () => P().exportCsv());
on('settings:exportTxt',   () => P().exportTxt());
on('settings:importData',  () => P().importData());
on('settings:dedup',       () => P().deduplicateDB());
onInput('settings:keyInput',    (el) => el.dataset.engine === 'gemini' ? P().validateGeminiKey(el.value) : P().validateAnthropicKey(el.value));
onBlur('settings:keyBlur',      (el) => el.dataset.engine === 'gemini' ? P().setGeminiKey(el.value) : P().setAnthropicKey(el.value));

/**
 * Render the complete Application Settings for the Profile tab.
 * @param {Object} settings - All settings from DB.Settings.getAll()
 * @param {string} lang - Current language code ('en'|'ru')
 * @param {Object} serverStatus - AI server status
 * @param {string} syncStatus - Current sync status
 * @returns {string}
 */
export function renderSettings(settings, lang, serverStatus, syncStatus = 'idle') {
  const currentEngine = settings['ai-engine'] || 'anthropic';
  const hasLocalGemini = !!settings['gemini-key'];
  const hasLocalAnthropic = !!settings['anthropic-key'];
  const geminiActive = (serverStatus.gemini || hasLocalGemini);
  const anthropicActive = (serverStatus.anthropic || hasLocalAnthropic);

  const themePref = getThemePref();
  // Тумблер уведомлений отражает ДВА состояния сразу: наше «хочу» из базы и
  // ответ браузера. Разрешение можно отозвать в настройках телефона, минуя
  // приложение, — тумблер, который об этом не знает, врал бы «включено».
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
  const notifyBlocked = perm === 'denied';
  const notifyOn = settings['notify-rest'] === 'on' && perm === 'granted';
  const syncStatusLabel = t(`sync.status.${syncStatus}`);
  const syncStatusColor = syncStatus === 'error' ? 'var(--c-red)' : (syncStatus === 'syncing' ? 'var(--c-blue)' : (syncStatus === 'offline' ? 'var(--c-text-3)' : 'var(--c-accent)'));

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
        <div class="engine-toggle-grid">
          <button class="engine-toggle-btn claude-active ${currentEngine === 'anthropic' ? 'active' : ''}"
                  data-action="settings:setEngine" data-engine="anthropic">
            <span class="ai-indicator ${anthropicActive ? (currentEngine === 'anthropic' ? 'active' : 'ready') : 'missing'}" id="ai-status-anthropic"></span>
            ${t('settings.engine_claude')}
          </button>
          <button class="engine-toggle-btn gemini-active ${currentEngine === 'gemini' ? 'active' : ''} ${currentEngine === 'gemini' && !geminiActive ? 'ai-glow-error' : ''}"
                  id="engine-btn-gemini"
                  data-action="settings:setEngine" data-engine="gemini">
            <span class="ai-indicator ${geminiActive ? (currentEngine === 'gemini' ? 'active' : 'ready') : 'missing'}" id="ai-status-gemini"></span>
            ${t('settings.engine_gemini')}
          </button>
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

        ${(() => {
          // BYOK key field for the CURRENTLY selected engine — symmetric for both
          // Claude (sk-ant-) and Gemini (AIza). Makes the two engine buttons an
          // honest "activate with your own key" path.
          const isGem = currentEngine === 'gemini';
          const keyId = isGem ? 'gemini-key' : 'anthropic-key';
          const val = settings[keyId] || '';
          const prefix = isGem ? 'AIza' : 'sk-ant-';
          const ru = lang === 'ru';
          const label = isGem ? t('settings.gemini_key') : (ru ? 'Ключ Claude' : 'Claude Key');
          const getLbl = isGem ? t('settings.gemini_get_key') : (ru ? 'Получить ключ' : 'Get key');
          const getUrl = isGem ? 'https://aistudio.google.com/app/apikey' : 'https://console.anthropic.com/settings/keys';
          const serverHas = isGem ? serverStatus.gemini : serverStatus.anthropic;
          const placeholder = isGem
            ? (serverHas ? t('settings.gemini_placeholder_server') : t('settings.gemini_placeholder_opt'))
            : (serverHas ? (ru ? 'Серверный ключ активен' : 'Server key active') : (ru ? 'sk-ant-… (опционально)' : 'sk-ant-… (optional)'));
          const setFn = isGem ? 'setGeminiKey' : 'setAnthropicKey';
          const valFn = isGem ? 'validateGeminiKey' : 'validateAnthropicKey';
          return `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-0-5);">
            <div class="pref-sub" style="font-size: var(--fs-1); margin: 0; font-weight: var(--fw-bold);">${esc(label)}</div>
            <a href="${getUrl}" target="_blank" class="pref-sub"
               style="font-size: var(--fs-1); color: var(--c-blue); text-decoration: none; font-weight: var(--fw-black);">
               ${esc(getLbl)} ↗
            </a>
          </div>
          <div style="position: relative; display: flex; align-items: center;">
            <input type="password" id="ai-key-input" class="pref-textarea" style="height: 38px; padding: 0 70px 0 var(--sp-1-5); margin: 0; font-family: monospace; border-radius: var(--r-m); width: 100%; box-sizing: border-box;"
                   placeholder="${esc(placeholder)}"
                   value="${esc(val)}"
                   data-engine="${isGem ? 'gemini' : 'anthropic'}"
                   data-input="settings:keyInput"
                   data-blur="settings:keyBlur">
            <div style="position: absolute; right: 8px; display: flex; align-items: center; gap: var(--sp-1);">
              <button class="btn-text" data-action="settings:toggleKeyVis" style="padding: var(--sp-0-5); color: var(--c-text-3);">
                <svg id="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                   <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <svg id="key-valid-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16" style="color: ${val.trim().startsWith(prefix) ? 'var(--c-accent)' : 'var(--c-text-3)'}; transition: color 0.3s;">
                 <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
          </div>
        </div>`;
        })()}
    </div>

    <!-- ── DATA & CLOUD SYNC ── -->
    <div class="section-label-alt">${t('settings.data')}</div>
    <div class="profile-card" style="padding:var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-2);">
      
      <!-- Sync -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: var(--sp-1-5);">
          <div style="width: 32px; height: 32px; border-radius: var(--r-s); background: var(--c-accent-bg); color: var(--c-accent); display: flex; align-items: center; justify-content: center;">
             <svg id="sync-connect-icon" class="icon-rotate" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          </div>
          <div>
            <div style="font-size: var(--fs-3); font-weight: var(--fw-md);">${t('sync.connect')}</div>
            <div style="font-size: var(--fs-1); color: ${syncStatusColor}; font-weight: var(--fw-bold);">${syncStatusLabel}</div>
          </div>
        </div>
        <button class="btn-text"
                data-action="settings:syncToggle" data-sync="${syncStatus}"
                style="color: var(--c-accent); font-size: var(--fs-2); font-weight: var(--fw-bold);">
          ${syncStatus === 'offline' ? 'CONNECT' : 'DISCONNECT'}
        </button>
      </div>

      <div class="pref-divider"></div>

      <div class="pref-divider"></div>

      <!-- Два блока по формату, а не один список из четырёх кнопок (заявка Gio
           2026-08-03). Граница между ними — не «важное/неважное», а наличие
           обратной дороги: JSON уезжает и умеет вернуться импортом, поэтому
           экспорт и импорт стоят парой; TXT и CSV уходят наружу насовсем и
           живут отдельным блоком.

           Отдельной кнопки «Export JSON» рядом с зелёной НЕТ намеренно: это
           было бы одно действие в двух местах одного экрана — ровно тот дубль,
           который убрали в 1.26.0. Вместо этого зелёная кнопка и называется
           «Экспорт JSON», а дата последнего бэкапа осталась её подписью
           (GYM-GRADE DoD-5: напоминалка про бэкап должна иметь якорь). -->
      <div style="display: flex; flex-direction: column; gap: var(--sp-1-5);">
        <div style="display: flex; align-items: center; gap: var(--sp-1-5);">
          <div style="width: 32px; height: 32px; border-radius: var(--r-s); background: var(--c-surface-h); display: flex; align-items: center; justify-content: center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></div>
          <div style="font-size: var(--fs-3); font-weight: var(--fw-md);">${t('data.backup')}</div>
        </div>
        <button class="btn btn-primary" data-action="settings:exportData"
                style="width: 100%; height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-0-5);">
          <span id="backup-cta-title" style="font-size: var(--fs-2); font-weight: var(--fw-black);">${t('backup.save')}</span>
          <span id="backup-cta-sub" style="font-size: var(--fs-1); font-weight: var(--fw-md); opacity: 0.75;">${esc(backupSubLabel(settings[K_LAST_EXPORT]))}</span>
        </button>
        <button class="btn btn-soft" data-action="settings:importData" style="width: 100%;">${t('data.import')}</button>
      </div>

      <div class="pref-divider"></div>

      <!-- Выгрузка наружу. Обе кнопки равны по весу — это не «главная и
           запасная», а два разных адресата: TXT = журнал человеку (тренеру, в
           заметки, на печать), CSV = таблица в Excel/Sheets. -->
      <div style="display: flex; flex-direction: column; gap: var(--sp-1-5);">
        <div style="display: flex; align-items: center; gap: var(--sp-1-5);">
          <div style="width: 32px; height: 32px; border-radius: var(--r-s); background: var(--c-surface-h); display: flex; align-items: center; justify-content: center;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>
          <div style="font-size: var(--fs-3); font-weight: var(--fw-md);">${t('data.share_out')}</div>
        </div>
        <div style="display: flex; gap: var(--sp-1-5);">
          <button class="btn btn-soft" data-action="settings:exportTxt" style="flex: 1 1 50%;">${t('data.export_txt')}</button>
          <button class="btn btn-soft" data-action="settings:exportCsv" style="flex: 1 1 50%;">${t('data.export_csv')}</button>
        </div>
      </div>

      <div class="pref-divider"></div>

      <!-- Обслуживание — не бэкап: чинит саму базу, а не спасает данные наружу. -->
      <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--sp-1-5);">
        <div class="pref-info">
          <div class="pref-title" style="font-size: var(--fs-2);">${t('data.maintenance')}</div>
          <div class="pref-sub">${t('data.dedup_sub')}</div>
        </div>
        <button class="btn btn-ghost" data-action="settings:dedup" style="min-width: 110px; height: 36px; font-size: var(--fs-2); color: var(--c-text-3);">${t('data.dedup')}</button>
      </div>
    </div>
  `;
}
