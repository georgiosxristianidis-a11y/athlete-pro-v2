// @ts-check
import { IntelStore } from './intel.store.js';
import { esc, haptic } from './shared/utils.js';
import { formatAirMarkdown } from './shared/air-markdown.js';
import { toUserMessage } from './shared/errors-ui.js';
import { isRu } from './locale.store.js';
import { stripSecrets } from './shared/sync-secrets.js';
import { DB } from './db.js';
import { on, onChange, onKeydown } from './events.js';
import { probeAiStatus } from './shared/ai-status.js';
import { getTone, aiAuth } from './ai-settings.store.js';
import { openAiSettings, closeAiSettings } from './ai-settings.view.js';
import { safeFetch } from './privacy.store.js';
import { appendSseChunk, parseSseDataLine } from './shared/sse.js';

on('intel:close', () => window.Nav.go('s-home'));
on('intel:replayVoice', () => window.IntelView.replayVoice());
on('intel:camera', () => window.IntelView.handleCamera());
on('intel:submit', () => window.IntelView.submit());
on('intel:weekly', () => window.IntelView.generateWeekly());
on('intel:createWorkout', () => window.IntelView.createWorkout());
on('intel:analyzeStats', () => window.IntelView.analyzeStats());
on('intel:biometrics', () => window.IntelView.checkBiometrics());
on('intel:clearImage', () => {
  const w = document.getElementById('intel-vision-preview-wrap');
  if (w) w.innerHTML = '';
  window.IntelView._clearImage();
});
on('intel:playAudio', (el) => window.IntelView.playAudio(el));
on('intel:closeReport', (el) => el.closest('.intel-report-overlay')?.remove());
on('intel:openSettings', () => openAiSettings());
on('intel:saveSettings', () => closeAiSettings());
on('intel:saveActionCard', (el) => window.IntelView.saveActionCard(el));
on('intel:closeOverlay', (el) => {
  const o = document.getElementById(el.dataset.overlay);
  if (o) o.remove();
});
onChange('intel:fileSelected', (el, e) => window.IntelView.onFileSelected(e));
onKeydown('intel:submitEnter', (el, e) => {
  if (e.key === 'Enter') window.IntelView.submit();
});

/** Debug log panel lives in AI settings; IntelView.load() no longer mounts it. */
export function renderIntelLogs() {
  IntelStore.init();
  const container = document.getElementById('intel-logs-container');
  if (!container) return;
  const logs = IntelStore.getLogs();
  container.innerHTML = logs
    .map(
      (l) => `
      <div class="intel-log-entry">
        <span class="intel-log-time">[${l.time}]</span>
        <span class="intel-log-type ${l.type.toLowerCase()}">${l.type}</span>
        <span class="intel-log-msg">${esc(l.text)}</span>
      </div>
    `
    )
    .join('');
  container.scrollTop = 0;
}

/**
 * IntelView — Athlete Pro
 * UI Renderer for the Neural Command Center.
 */
export const IntelView = (() => {
  let _initialized = false;
  let _hasValidKey = false;
  /** @type {string} */
  let _keySource = 'offline';
  let _lastSpokenText = '';
  let _isSpeaking = false;

  /**
   * Строки экрана. Язык — только через isRu() (правило i18n проекта):
   * до этого подписи модулей были прошиты по-русски, а плейсхолдер — по-английски.
   */
  function _copy() {
    return isRu()
      ? {
          keyOk: 'система защищена',
          keyMissing: 'нет ключа',
          keyAirgap: 'режим airgap',
          summary: 'СВОДКА',
          generate: 'ГЕНЕРАЦИЯ',
          analyze: 'АНАЛИЗ',
          biometrics: 'БИОМЕТРИЯ',
          input: 'Команда или запрос по фото…',
          close: 'Закрыть',
          camera: 'Прикрепить фото',
          send: 'Отправить',
          logs: 'Журнал потока',
          speak: 'Озвучить',
          clearImage: 'Убрать фото',
          feedback: 'Ответ ИИ',
          waiting: 'Анализирую…',
          failed: 'Сбой',
          streaming: 'Ответ печатается',
          empty: 'Ответ пришёл пустым',
          settings: 'Настройки ИИ',
          settingsTitle: 'Настройки ИИ',
          save: 'Сохранить',
          toneLabel: 'Тон тренера',
          toneTherapist: 'Психолог',
          toneNeutral: 'Нейтрально',
          toneGoggins: 'Гоггинс',
          saveWorkout: 'Сохранить в план',
          saved: 'Сохранено',
          scanning: 'СКАНИРОВАНИЕ',
          scanFailed: 'Сбой сканирования',
          scanCns: 'СКАН ЦНС…',
          scanVolume: 'СБОР ДАННЫХ О НАГРУЗКЕ…',
          scanSleep: 'АНАЛИЗ СНА…',
          scanRpe: 'РАСЧЁТ RPE-УТОМЛЕНИЯ…',
          scanAcwr: 'РАСЧЁТ ACWR…',
          cnsFatigue: 'УТОМЛЕНИЕ ЦНС',
          muscleDamage: 'МЫШЕЧНЫЕ ПОВРЕЖДЕНИЯ',
          readiness: 'ГОТОВНОСТЬ',
          voiceLabel: 'ACTIVE VOICE',
          voiceSpeaking: 'SPEAKING…',
          voiceReplay: 'Воспроизвести вердикт коуча',
        }
      : {
          keyOk: 'system secure',
          keyMissing: 'key missing',
          keyAirgap: 'air-gapped',
          summary: 'SUMMARY',
          generate: 'GENERATE',
          analyze: 'ANALYZE',
          biometrics: 'BIOMETRICS',
          input: 'Command or vision query…',
          close: 'Close',
          camera: 'Attach photo',
          send: 'Send',
          logs: 'Streaming logs',
          speak: 'Speak',
          clearImage: 'Clear photo',
          feedback: 'AI Feedback',
          waiting: 'Analysing…',
          failed: 'Failed',
          streaming: 'Response is typing',
          empty: 'The response came back empty',
          settings: 'AI Settings',
          settingsTitle: 'AI Settings',
          save: 'Save',
          toneLabel: 'Coach tone',
          toneTherapist: 'Therapist',
          toneNeutral: 'Neutral',
          toneGoggins: 'Goggins',
          saveWorkout: 'Save to plan',
          saved: 'Saved',
          scanning: 'SCANNING',
          scanFailed: 'Scan failed',
          scanCns: 'CNS SCAN…',
          scanVolume: 'GATHERING VOLUME DATA…',
          scanSleep: 'ANALYSING SLEEP…',
          scanRpe: 'COMPUTING RPE FATIGUE…',
          scanAcwr: 'COMPUTING ACWR…',
          cnsFatigue: 'CNS FATIGUE',
          muscleDamage: 'MUSCLE DAMAGE',
          readiness: 'READINESS',
          voiceLabel: 'ACTIVE VOICE',
          voiceSpeaking: 'SPEAKING…',
          voiceReplay: 'Replay coach verdict',
        };
  }

  async function _checkApiKey() {
    const { engine, customKey } = await aiAuth();
    _hasValidKey = !!customKey && customKey.trim().length > 10;
    _keySource = 'local';

    if (_hasValidKey) return;

    const probed = await probeAiStatus();
    _keySource = probed.source;
    if (probed.source === 'server') {
      _hasValidKey = engine === 'gemini' ? !!probed.gemini : !!probed.anthropic;
    }
  }

  /** Патч индикатора в шапке без IntelView.load() — load() стирает ленту ответов. */
  async function refreshKeyBadge() {
    await _checkApiKey();
    const header = document.querySelector('#s-intel .intel-header');
    if (!header) return;
    const L = _copy();
    const dot = header.querySelector('.ai-indicator');
    const label = header.querySelector('.intel-key-state');
    if (dot) dot.className = `ai-indicator ${_hasValidKey ? 'active' : 'missing'}`;
    if (label) {
      label.className = `intel-key-state ${_hasValidKey ? 'is-ok' : 'is-missing'}`;
      label.textContent = _hasValidKey
        ? L.keyOk
        : _keySource === 'airgap'
          ? L.keyAirgap
          : L.keyMissing;
    }
  }

  async function load() {
    const screen = document.getElementById('s-intel');
    if (!screen) return;

    if (!_initialized) {
      IntelStore.init();
      _initialized = true;
    }

    await _checkApiKey();
    const L = _copy();

    screen.innerHTML = `
      <header class="intel-header">
        <div>
          <h1 class="intel-title">P.A.N.D.A. Core</h1>
          <div class="intel-sub">
            <span class="ai-indicator ${_hasValidKey ? 'active' : 'missing'}"></span>
            <span class="intel-key-state ${_hasValidKey ? 'is-ok' : 'is-missing'}">${esc(_hasValidKey ? L.keyOk : _keySource === 'airgap' ? L.keyAirgap : L.keyMissing)}</span>
            <span class="intel-sub-sep">·</span>
            <span id="intel-status-text" class="intel-status-text">${esc(IntelStore.getStatus())}</span>
          </div>
        </div>
        <div class="intel-header-actions">
          <button class="intel-btn-close" data-action="intel:openSettings" aria-label="${L.settings}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button class="intel-btn-close" data-action="intel:close" aria-label="${L.close}">&times;</button>
        </div>
      </header>

      <div class="intel-body">
        <div id="intel-feedback-feed"></div>

        <div id="intel-vision-preview-wrap"></div>

        <div class="intel-modules-grid">
          <button class="intel-module-card" data-action="intel:weekly">
            <span class="intel-module-icon intel-module-icon--intel">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            </span>
            <span class="intel-module-label">${L.summary}</span>
          </button>
          <button class="intel-module-card" data-action="intel:createWorkout">
            <span class="intel-module-icon intel-module-icon--accent">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </span>
            <span class="intel-module-label">${L.generate}</span>
          </button>
          <button class="intel-module-card" data-action="intel:analyzeStats">
            <span class="intel-module-icon intel-module-icon--blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            </span>
            <span class="intel-module-label">${L.analyze}</span>
          </button>
          <button class="intel-module-card" data-action="intel:biometrics">
            <span class="intel-module-icon intel-module-icon--red">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </span>
            <span class="intel-module-label">${L.biometrics}</span>
          </button>
        </div>
      </div>

      <div class="intel-voice-center-wrap">
        <button type="button" class="intel-voice-hud talk" data-action="intel:replayVoice" aria-label="${L.voiceReplay}">
          <div class="talk-wave" aria-hidden="true">
            <i></i><i></i><i></i><i></i><i></i>
          </div>
          <span class="intel-voice-hud-label" id="intel-voice-hud-label">${esc(L.voiceLabel)}</span>
        </button>
      </div>

      <div class="intel-cmd-wrap">
        <div class="intel-cmd-bar">
          <button class="intel-btn-icon" id="intel-btn-camera" data-action="intel:camera" aria-label="${L.camera}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
          <input type="text" id="intel-input" class="intel-cmd-input" placeholder="${L.input}" data-keydown="intel:submitEnter" autocomplete="off" spellcheck="false">
          <button class="intel-btn-icon intel-btn-send" id="intel-btn-send" data-action="intel:submit" aria-label="${L.send}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            ${_waveHtml()}
          </button>
        </div>
        <input type="file" id="intel-file-input" accept="image/*" style="display:none" data-change="intel:fileSelected">
      </div>
    `;

    _listen();
    // Разметку экрана load() пересобирает целиком, а запрос мог остаться в
    // полёте (ушёл с экрана и вернулся) — иначе кнопка выглядит свободной,
    // но submit() молча выходит по флагу.
    _setBusy(_streaming);
  }

  function renderLogs() {
    renderIntelLogs();
  }

  function _listen() {
    // Avoid double listeners
    // @ts-ignore
    if (window._intelListenersActive) return;
    // @ts-ignore
    window._intelListenersActive = true;

    window.addEventListener('ap-intel-log', renderLogs);
    window.addEventListener('ap-intel-status', () => {
      const statusText = IntelStore.getStatus();
      const el = document.getElementById('intel-status-text');
      if (el) el.textContent = statusText;
    });
  }

  function handleCamera() {
    document.getElementById('intel-file-input')?.click();
  }

  let _pendingImage = null;

  async function onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    IntelStore.addLog('SYS', `Packet formed: ${file.name} (${Math.round(file.size / 1024)}KB)`);

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      _pendingImage = base64;
      _showVisionPreview(base64);
    };
    reader.readAsDataURL(file);
  }

  function _showVisionPreview(base64) {
    const wrap = document.getElementById('intel-vision-preview-wrap');
    if (!wrap) return;
    const L = _copy();
    wrap.innerHTML = `
      <div class="intel-vision-preview animate-in zoom-in">
        <img src="${base64}" class="intel-vision-img" alt="Vision Input">
        <div class="intel-scanner-bar"></div>
        <button class="intel-vision-clear" data-action="intel:clearImage" aria-label="${L.clearImage}">&times;</button>
      </div>
    `;
    IntelStore.setStatus('VISION READY');
  }

  /* ── Стриминг: три состояния, три разных места экрана (HUD-2) ──
     Скелетон — в ленте, пока не пришёл первый токен;
     точки — хвостом текста, пока он растёт;
     волна — в кнопке отправки, пока запрос в полёте.
     Один индикатор на зону: два «занято» в одной карточке читаются как шум. */

  /** Стеклянный скелетон ответа — держит высоту карточки до первого токена. */
  function _skeletonHtml(L) {
    return `
      <div class="intel-skeleton" role="status" aria-label="${L.waiting}">
        <div class="intel-skeleton-head">
          <span class="intel-skeleton-avatar"></span>
          <span class="intel-skeleton-line is-half"></span>
        </div>
        <span class="intel-skeleton-line is-full"></span>
        <span class="intel-skeleton-line is-wide"></span>
      </div>`;
  }

  /** Хвостовые точки — «текст ещё идёт». Вставляются в конец последнего блока. */
  function _typingHtml(L) {
    return (
      `<span class="intel-typing" role="status" aria-label="${L.streaming}">` +
      '<span class="intel-typing-dot"></span><span class="intel-typing-dot"></span><span class="intel-typing-dot"></span>' +
      '</span>'
    );
  }

  /** Волна в кнопке отправки. Живёт в разметке всегда, показывается классом is-busy. */
  function _waveHtml() {
    return (
      '<span class="intel-wave" aria-hidden="true">' +
      '<span class="intel-wave-bar"></span>'.repeat(4) +
      '</span>'
    );
  }

  /**
   * Запрос в полёте. Второй запрос поверх первого плодил параллельные карточки
   * и гонку за одну и ту же ленту — теперь кнопка занята, submit() выходит сразу.
   */
  let _streaming = false;

  function _setBusy(on) {
    _streaming = on;
    const btn = /** @type {HTMLButtonElement|null} */ (document.getElementById('intel-btn-send'));
    if (!btn) return;
    btn.classList.toggle('is-busy', on);
    btn.disabled = on;
    btn.setAttribute('aria-busy', String(on));
  }

  /** Перерисовка ответа целиком: форматтер чистый, дешевле держать одну ветку кода. */
  function _renderStream(feedbackText, fullText, L, withTail) {
    feedbackText.innerHTML = formatAirMarkdown(fullText, _buildReadinessWidget, _buildWorkoutCard);
    if (!withTail) return;
    const body = feedbackText.querySelector('.intel-md-body');
    let anchor = body?.lastElementChild || body || feedbackText;
    // В <ul> может лежать только <li> — точки уезжают внутрь последнего пункта.
    if (anchor.tagName === 'UL') anchor = anchor.lastElementChild || anchor;
    anchor.insertAdjacentHTML('beforeend', _typingHtml(L));
  }

  async function submit() {
    if (_streaming) return;
    const input = /** @type {HTMLInputElement} */ (document.getElementById('intel-input'));
    if (!input || (!input.value.trim() && !_pendingImage)) return;

    const text = input.value.trim() || 'Analyze this photo';
    const image = _pendingImage;

    IntelStore.addLog('USER', text);
    if (image) IntelStore.addLog('SYS', 'Attaching vision packet...');

    input.value = '';
    _pendingImage = null;
    const previewWrap = document.getElementById('intel-vision-preview-wrap');
    if (previewWrap) previewWrap.innerHTML = '';

    IntelStore.setStatus('AI SCANNING...');

    const L = _copy();
    const feedbackFeed = document.getElementById('intel-feedback-feed');
    const feedbackEl = document.createElement('div');
    feedbackEl.className = 'intel-feedback';
    feedbackEl.innerHTML = `
      <div class="intel-feedback-head">
        <div class="intel-feedback-label">${L.feedback}</div>
        <button class="intel-btn-icon intel-feedback-speak" title="${L.speak}" aria-label="${L.speak}" data-action="intel:playAudio">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
          </svg>
        </button>
      </div>
      <div class="intel-feedback-text">
        ${_skeletonHtml(L)}
      </div>
    `;
    feedbackFeed?.prepend(feedbackEl);
    const feedbackText = feedbackEl.querySelector('.intel-feedback-text');
    _setBusy(true);

    try {
      const { DB } = await import('./db.js');
      const workouts = await DB.Workouts.getLast(5);
      const profile = stripSecrets(await DB.Settings.getAll());
      const topLifts = await DB.OneRM.getAll();

      const response = await safeFetch(
        '/api/coach',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: text }],
            images: image ? [image] : [],
            workouts,
            profile,
            topLifts,
            ...(await aiAuth()),
            tone: await getTone(),
          }),
        },
        'ai'
      );

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let sseBuf = '';
      let fullText = '';

      if (reader) {
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (sseBuf) {
              const flushed = appendSseChunk(sseBuf, '\n');
              sseBuf = '';
              for (const line of flushed.lines) {
                const ev = parseSseDataLine(line);
                if (!ev) continue;
                if (ev.done) break outer;
                if (ev.error) throw new Error(ev.error);
                if (ev.text) {
                  if (!fullText) haptic(2);
                  fullText += ev.text;
                }
              }
            }
            break;
          }

          const { buffer, lines } = appendSseChunk(sseBuf, decoder.decode(value, { stream: true }));
          sseBuf = buffer;

          for (const line of lines) {
            const ev = parseSseDataLine(line);
            if (!ev) continue;
            if (ev.done) break outer;
            if (ev.error) throw new Error(ev.error);
            if (ev.text) {
              // Тычок — один, на первом токене. Вибрация на КАЖДЫЙ чанк
              // (так было раньше) — это сотни вызовов navigator.vibrate
              // за ответ, и каждый из них синхронный.
              if (!fullText) haptic(2);
              fullText += ev.text;
              if (feedbackText) _renderStream(feedbackText, fullText, L, true);
            }
          }
        }
      }

      // Хвостовые точки снимаем вместе с последней перерисовкой.
      if (feedbackText) {
        if (fullText.trim()) _renderStream(feedbackText, fullText, L, false);
        // Пустой поток оставлял скелетон крутиться вечно — до HUD-2 это был
        // единственный сценарий, где экран не выходил из ожидания.
        else feedbackText.textContent = L.empty;
      }

      IntelStore.addLog('AI', 'Insight received.');
      IntelStore.setStatus('SYSTEM STANDBY');

      // Auto-Speech
      const autoSpeech = await DB.Settings.get('ai-auto-speech', true);
      if (autoSpeech && feedbackText) {
        const textToSpeak = feedbackText.innerText.trim();
        if (textToSpeak) speakText(textToSpeak);
      }
    } catch (err) {
      console.error(err);
      IntelStore.addLog('ERROR', err?.message || 'Connection failed');
      IntelStore.setStatus('ERROR');
      // Классификацию (401/429/500/офлайн) и локализацию уже делает toUserMessage —
      // второй набор строк рядом с ним разошёлся бы с ним на первой же правке.
      feedbackEl.classList.add('is-error');
      const label = feedbackEl.querySelector('.intel-feedback-label');
      if (label) label.textContent = L.failed;
      feedbackEl.querySelector('.intel-feedback-speak')?.remove();
      if (feedbackText) feedbackText.textContent = toUserMessage(err);
    } finally {
      _setBusy(false);
    }
  }

  function _clearImage() {
    _pendingImage = null;
  }

  async function generateWeekly() {
    IntelStore.addLog('SYS', 'Computing weekly intelligence...');
    IntelStore.setStatus('COMPUTING INTEL...');

    try {
      const { DB } = await import('./db.js');
      const workouts = await DB.Workouts.getAll();
      // Filter for last 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentWorkouts = workouts.filter((w) => new Date(w.date).getTime() > sevenDaysAgo);
      const profile = stripSecrets(await DB.Settings.getAll());

      const response = await safeFetch(
        '/api/coach/weekly-report',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workouts: recentWorkouts,
            profile,
            ...(await aiAuth()),
          }),
        },
        'ai'
      );

      if (!response.ok) throw new Error('Report generation failed');

      const { report } = await response.json();

      IntelStore.addLog('AI', `Weekly report generated. Performance Score: ${report.score}`);
      IntelStore.setStatus('SYSTEM STANDBY');

      _renderReportOverlay(report);
      speakText(`Твой прогресс за неделю: ${report.score} баллов. ${report.summary}`);
    } catch (err) {
      IntelStore.addLog('ERROR', 'Failed to generate weekly intel');
      IntelStore.setStatus('ERROR');
    }
  }

  function _renderReportOverlay(report) {
    const overlay = document.createElement('div');
    overlay.className = 'intel-report-overlay animate-in fade-in duration-500';
    /* Гуттер до края экрана, а не ритм блока: --side-padding — узаконенное
       off-grid исключение (base.css:128), снапить его к 16/24 нельзя. */
    overlay.style.cssText =
      'position:fixed; inset:0; z-index:9999; background:rgba(5,5,7,0.95); backdrop-filter:blur(20px); display:flex; align-items:center; justify-content:center; padding:var(--side-padding);';

    overlay.innerHTML = `
      <div style="background:var(--c-bg-1); width:100%; max-width:500px; border-radius:32px; border:1px solid var(--c-border-h); padding:var(--sp-5); position:relative; max-height:90vh; overflow-y:auto;">
        <button data-action="intel:closeReport" style="position:absolute; top:24px; right:24px; background:none; border:none; color:var(--c-text-3); font-size:var(--fs-5); cursor:pointer;">&times;</button>
        <div style="text-align:center; margin-bottom:var(--sp-4);">
           <h2 style="font-family:var(--font-intel); font-size:var(--fs-5); font-style:italic; color:var(--c-text-1); text-transform:uppercase; margin-bottom:var(--sp-2);">Weekly Intel</h2>
           <div style="display:flex; flex-direction:column; align-items:center;">
             <span style="font-size:var(--fs-6); font-weight:var(--fw-black); color:var(--c-intel); text-shadow:0 0 20px rgba(0,209,255,0.4); line-height:1;">${report.score}</span>
             <span style="font-size:var(--fs-1); font-weight:var(--fw-black); color:var(--c-text-3); text-transform:uppercase; letter-spacing:0.5em; margin-top:var(--sp-1);">Performance Score</span>
           </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:var(--sp-3);">
          <section style="background:var(--c-surface-h); padding:var(--sp-3); border-radius:24px; border:1px solid var(--c-border);">
            <p style="font-size:var(--fs-3); font-style:italic; color:var(--c-text-2); line-height:1.6; font-weight:var(--fw-md);">"${esc(report.summary)}"</p>
          </section>
          <!-- Инсет плиток ушёл вниз к --sp-2: в двухколоночной сетке он
               отнимается у строки четырежды, и на --sp-3 карточка отчёта
               начинала переполняться (348 против 334 доступных). -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--sp-2);">
            <div style="background:rgba(0,230,118,0.05); padding:var(--sp-2); border-radius:24px; border:1px solid rgba(0,230,118,0.1);">
               <h4 style="font-size:var(--fs-1); font-weight:var(--fw-black); text-transform:uppercase; color:var(--c-accent); margin-bottom:var(--sp-1-5); letter-spacing:0.2em;">Wins</h4>
               <ul style="font-size:var(--fs-2); color:var(--c-text-3); list-style:none; display:flex; flex-direction:column; gap:var(--sp-1);">
                 ${report.pros.map((p) => `<li style="display:flex; gap:var(--sp-1);"><span style="color:var(--c-accent)">+</span>${esc(p)}</li>`).join('')}
               </ul>
            </div>
            <div style="background:rgba(255,77,136,0.05); padding:var(--sp-2); border-radius:24px; border:1px solid rgba(255,77,136,0.1);">
               <h4 style="font-size:var(--fs-1); font-weight:var(--fw-black); text-transform:uppercase; color:var(--c-red); margin-bottom:var(--sp-1-5); letter-spacing:0.2em;">Leaks</h4>
               <ul style="font-size:var(--fs-2); color:var(--c-text-3); list-style:none; display:flex; flex-direction:column; gap:var(--sp-1);">
                 ${report.cons.map((c) => `<li style="display:flex; gap:var(--sp-1);"><span style="color:var(--c-red)">-</span>${esc(c)}</li>`).join('')}
               </ul>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function createWorkout() {
    haptic(10);
    IntelStore.addLog('SYS', 'Ready to generate workout plan');
    IntelStore.setStatus('WAITING FOR PROMPT');
    const input = document.getElementById('intel-input');
    if (input) {
      input.value = '';
      input.focus();
      // @ts-ignore
      input.placeholder = 'Какую группу мышц тренируем сегодня?';
    }
  }

  function analyzeStats() {
    haptic(10);
    IntelStore.addLog('SYS', 'Ready to analyze stats');
    const input = document.getElementById('intel-input');
    if (input) {
      input.value =
        'Проведи глубокий разбор последней тренировки. Сгенерируй readiness-виджет (_widget: readiness) с оценкой 0-100. Напиши пару строк о главном успехе и слабом месте.';
      submit();
    }
  }

  /** Биометрический радар (HUD-3): полноэкранный скан → отчёт ЦНС/готовности. */
  async function checkBiometrics() {
    haptic(10);
    const L = _copy();
    IntelStore.addLog('SYS', 'Init biometric scan...');

    const overlay = document.createElement('div');
    overlay.className = 'intel-radar-overlay';
    overlay.id = 'intel-radar-overlay';
    overlay.innerHTML = `
      <div class="intel-radar-ring" role="status" aria-label="${L.scanning}">
        <span class="intel-radar-ring-dash"></span>
        <span class="intel-radar-ring-sweep"></span>
        <span class="intel-radar-ring-text">${L.scanning}</span>
      </div>
      <div class="intel-radar-log" id="intel-radar-log"></div>
    `;
    document.body.appendChild(overlay);

    const logLines = [L.scanCns, L.scanVolume, L.scanSleep, L.scanRpe, L.scanAcwr];
    let logIndex = 0;
    const logEl = overlay.querySelector('#intel-radar-log');
    const logInterval = setInterval(() => {
      const line =
        logIndex < logLines.length
          ? logLines[logIndex++]
          : Math.random().toString(36).slice(2, 10).toUpperCase();
      const row = document.createElement('div');
      row.className = 'intel-radar-log-row';
      row.textContent = `> ${line}`;
      logEl?.appendChild(row);
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
    }, 400);

    try {
      const workouts = await DB.Workouts.getLast(10);
      const profile = stripSecrets(await DB.Settings.getAll());

      const response = await safeFetch(
        '/api/coach/biometrics-scan',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workouts,
            profile,
            ...(await aiAuth()),
          }),
        },
        'ai'
      );

      clearInterval(logInterval);
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const { report } = await response.json();
      const readiness = Math.max(
        0,
        100 - Math.round((report.cnsFatigue + report.muscleDamage) / 2)
      );

      overlay.innerHTML = _buildBiometricReport(report, readiness, L);
      haptic(50);
    } catch (err) {
      clearInterval(logInterval);
      // Урок отвергнутой линии: ошибка сети шла в innerHTML сырой строкой
      // (`SCAN FAILED: ${err.message}` без esc()) — здесь err.message с сервера
      // могло быть значением из чужого ключа BYOK.
      overlay.innerHTML = `
        <div class="intel-radar-error">
          <p class="intel-radar-error-text">${esc(toUserMessage(err))}</p>
          <button class="btn btn-ghost" data-action="intel:closeOverlay" data-overlay="intel-radar-overlay">${L.close}</button>
        </div>
      `;
    }
  }

  function _buildBiometricReport(report, readiness, L) {
    const bar = (label, val) => `
      <div class="intel-radar-metric">
        <div class="intel-radar-metric-label">${esc(label)}</div>
        <div class="intel-radar-metric-row">
          <div class="intel-radar-metric-val ${val > 70 ? 'is-high' : ''}">${esc(String(val))}%</div>
          <div class="intel-radar-metric-track">
            <div class="intel-radar-metric-fill ${val > 70 ? 'is-high' : ''}" style="width:${Math.max(0, Math.min(100, val))}%"></div>
          </div>
        </div>
      </div>
    `;

    return `
      <div class="intel-radar-report">
        <button class="intel-btn-close intel-radar-report-close" data-action="intel:closeOverlay" data-overlay="intel-radar-overlay" aria-label="${L.close}">&times;</button>
        <h2 class="intel-radar-report-title">BIOMETRIC HUD</h2>
        <div class="intel-radar-metrics">
          ${bar(L.cnsFatigue, report.cnsFatigue)}
          ${bar(L.muscleDamage, report.muscleDamage)}
          ${bar(L.readiness, readiness)}
        </div>
        <div class="intel-radar-report-summary">${esc(report.summary || '')}</div>
      </div>
    `;
  }

  /* ── Настройки ИИ: движок, ключ, тон — js/ai-settings.view.js.
     Язык живёт в isRu(), голос маскота отдельной картой PANDA-C. ── */
  const openSettings = openAiSettings;
  const saveSettings = closeAiSettings;

  function _buildReadinessWidget(data) {
    const getColor = (val) => {
      if (val >= 90) return 'var(--c-accent)'; // Green (Отлично)
      if (val >= 70) return 'var(--c-warning)'; // Yellow (Хорошо)
      if (val >= 50) return '#f97316'; // Orange (Удовлетворительно)
      return 'var(--c-red)'; // Red (Внимание)
    };

    const hbar = (val, label) => {
      const c = getColor(val);
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sp-1-5);">
          <div style="font-size:var(--fs-2); font-weight:var(--fw-md); color:var(--c-text-2);">${label}</div>
          <div style="display:flex; align-items:center; gap:var(--sp-1); width:55%;">
            <div style="flex:1; height:6px; background:var(--c-surface-h); border-radius:3px; overflow:hidden;">
              <div style="width:${val}%; height:100%; background:${c}; border-radius:3px; transition: width 1s ease-out;"></div>
            </div>
            <span style="font-size:var(--fs-2); font-weight:var(--fw-black); color:${c}; width:28px; text-align:right;">${val}</span>
          </div>
        </div>
      `;
    };

    const mainColor = getColor(data.index);
    const indexLabel =
      data.index >= 90
        ? 'отлично'
        : data.index >= 70
          ? 'хорошо'
          : data.index >= 50
            ? 'удовл'
            : 'внимание';

    return `
      <div class="intel-readiness-widget animate-in" style="background:rgba(139,92,246,0.03); border:1px solid rgba(139,92,246,0.1); border-radius:24px; padding:var(--sp-3); margin:var(--sp-2) 0; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--sp-3);">
          <div style="font-size:var(--fs-3); font-weight:var(--fw-md); color:var(--c-text-1);">Индекс готовности</div>
          <div style="width:24px; height:24px; border-radius:50%; background:var(--c-border-h); display:flex; align-items:center; justify-content:center; font-size:var(--fs-2); color:var(--c-text-3);">?</div>
        </div>
        
        <div style="display:flex; align-items:flex-end; gap:var(--sp-2); margin-bottom:var(--sp-4);">
          <div style="font-size:var(--fs-6); font-weight:var(--fw-black); color:${mainColor}; line-height:1; font-family:'Instrument Sans', sans-serif;">${data.index}</div>
          <div style="flex:1; padding-bottom:var(--sp-1);">
            <div style="height:6px; background:var(--c-border-h); border-radius:3px; overflow:hidden;">
              <div style="height:100%; width:${data.index}%; background:${mainColor}; border-radius:3px; transition: width 1s ease-out;"></div>
            </div>
            <div style="font-size:var(--fs-2); color:var(--c-text-3); margin-top:var(--sp-1); text-transform:uppercase; font-weight:var(--fw-bold);">${indexLabel}</div>
          </div>
        </div>

        <div style="margin-bottom:var(--sp-4);">
          ${hbar(data.recovery, 'Восстановление')}
          ${hbar(data.acwr, 'Нагрузка ACWR')}
          ${hbar(data.sleep, 'Качество сна')}
          ${hbar(data.monotony, 'Монотонность')}
          ${hbar(data.density, 'Тренд нагрузки')}
          ${hbar(data.density, 'Плотность и ритм')}
        </div>

        <div style="border-top:1px solid var(--c-border); padding-top:var(--sp-3);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--sp-2);">
            <div style="font-size:var(--fs-1); font-weight:var(--fw-black); letter-spacing:0.1em; color:var(--c-text-3); text-transform:uppercase;">Цель на сегодня</div>
            <div style="display:flex; align-items:center; gap:var(--sp-1);">
              <span style="color:var(--c-red); font-size:var(--fs-2);">ЦНС</span>
              <div style="width:40px; height:4px; background:var(--c-border-h); border-radius:2px;"><div style="width:${data.cns}%; height:100%; background:var(--c-red); border-radius:2px; transition: width 1s ease-out;"></div></div>
              <span style="font-size:var(--fs-2); font-weight:var(--fw-bold); color:var(--c-red);">${data.cns}%</span>
            </div>
          </div>
          <div style="border-left:2px solid ${mainColor}; padding-left:var(--sp-1-5);">
            <div style="font-size:var(--fs-3); font-weight:var(--fw-md); color:var(--c-text-1); margin-bottom:var(--sp-0-5);">${data.goal}</div>
          </div>
        </div>
      </div>
    `;
  }

  function _setVoiceLabel(text) {
    const label = document.getElementById('intel-voice-hud-label');
    if (label) label.textContent = text;
  }

  function _stopVoiceVisualizer() {
    document
      .querySelectorAll('.intel-voice-hud.talk')
      .forEach((el) => el.classList.remove('live', 'talk'));
    _setVoiceLabel(_copy().voiceLabel);
  }

  function replayVoice() {
    haptic(15);
    if (_lastSpokenText) {
      speakText(_lastSpokenText);
      return;
    }
    speakText(
      isRu()
        ? 'Голосовой модуль готов. Запустите анализ или тренировку.'
        : 'Voice module ready. Run an analysis or workout.'
    );
  }

  function _speakNativeSpeech(textToSpeak, toneVal) {
    if (!('speechSynthesis' in window)) {
      _isSpeaking = false;
      _stopVoiceVisualizer();
      return;
    }

    _isSpeaking = true;
    window.speechSynthesis.cancel();
    const cleanText = textToSpeak.replace(/[*_#`~[\]()]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = isRu() ? 'ru-RU' : 'en-US';

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => v.lang.startsWith(utterance.lang.slice(0, 2)));
    if (preferred) utterance.voice = preferred;

    if (toneVal < 35) {
      utterance.pitch = 1.1;
      utterance.rate = 0.95;
    } else if (toneVal > 70) {
      utterance.pitch = 0.85;
      utterance.rate = 1.05;
    } else {
      utterance.pitch = 0.95;
      utterance.rate = 1;
    }

    utterance.onstart = () => {
      document.querySelector('.intel-voice-hud')?.classList.add('talk', 'live');
      _setVoiceLabel(_copy().voiceSpeaking);
    };
    utterance.onend = () => {
      _isSpeaking = false;
      _stopVoiceVisualizer();
    };
    utterance.onerror = () => {
      _isSpeaking = false;
      _stopVoiceVisualizer();
    };

    window.speechSynthesis.speak(utterance);
  }

  async function speakText(textToSpeak) {
    if (!textToSpeak || _isSpeaking) return;
    _lastSpokenText = textToSpeak;
    _isSpeaking = true;
    IntelStore.addLog('SYS', 'Synthesizing coach voice...');
    _setVoiceLabel(_copy().voiceSpeaking);
    document.querySelector('.intel-voice-hud')?.classList.add('talk', 'live');

    let toneVal = 50;
    try {
      toneVal = await getTone();
      const geminiKey = await DB.Settings.get('gemini-key');
      const response = await fetch('/api/coach/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          customKey: geminiKey ? String(geminiKey) : undefined,
        }),
      });

      if (!response.ok) throw new Error('Voice sync failed');

      const result = await response.json();
      const pcmData = result.audioBase64;
      if (!pcmData) throw new Error('Audio data not found');

      const audioBlob = pcmToWav(pcmData, 24000);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        _isSpeaking = false;
        _stopVoiceVisualizer();
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        _isSpeaking = false;
        _stopVoiceVisualizer();
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
    } catch (err) {
      IntelStore.addLog('INFO', 'Local speech synthesis active');
      _isSpeaking = false;
      _speakNativeSpeech(textToSpeak, toneVal);
    }
  }

  function pcmToWav(base64Pcm, sampleRate) {
    const pcmBuffer = Uint8Array.from(atob(base64Pcm), (c) => c.charCodeAt(0)).buffer;
    const wavBuffer = new ArrayBuffer(44 + pcmBuffer.byteLength);
    const view = new DataView(wavBuffer);
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcmBuffer.byteLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, pcmBuffer.byteLength, true);
    new Uint8Array(wavBuffer).set(new Uint8Array(pcmBuffer), 44);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  }

  function playAudio(btn) {
    const container = btn.closest('.intel-feedback');
    if (!container) return;
    const textEl = container.querySelector('.intel-feedback-text');
    if (!textEl) return;

    // We only want the text, ignoring HTML structure like the readiness widget
    const textToSpeak = textEl.innerText.trim();
    if (textToSpeak) {
      speakText(textToSpeak);
    }
  }

  /* ── Карточка тренировки в потоке (HUD-3) ──
     Данные держим в Map по своему id, а НЕ в data-атрибуте JSON-блобом —
     events.js прямо предупреждает: JSON пользовательских строк в атрибуте —
     вектор атрибутной инъекции. id — наш собственный примитив. */
  const _workoutCards = new Map();

  function _cardId(rawJson) {
    let h = 0;
    for (let i = 0; i < rawJson.length; i++) h = (h * 31 + rawJson.charCodeAt(i)) | 0;
    return 'wc' + (h >>> 0);
  }

  /** Сборщик карточки для formatAirMarkdown — esc() тут на нас, форматтер не защищает. */
  function _buildWorkoutCard(data) {
    const L = _copy();
    const id = _cardId(JSON.stringify(data));
    _workoutCards.set(id, data);
    const exercises = Array.isArray(data.exercises) ? data.exercises : [];

    return `
      <div class="intel-workout-card">
        <div class="intel-workout-head">
          <h4 class="intel-workout-title">${esc(data.title || 'Workout')}</h4>
          <span class="intel-workout-type">${esc(data.type || 'Custom')}</span>
        </div>
        <ul class="intel-workout-list">
          ${exercises
            .map(
              (ex) => `
            <li class="intel-workout-item">
              <span class="intel-workout-ex-name">${esc(ex?.name || '')}</span>
              <span class="intel-workout-ex-sets">${esc(String(ex?.sets ?? ''))}×${esc(String(ex?.reps ?? ''))}</span>
            </li>
          `
            )
            .join('')}
        </ul>
        <button class="btn btn-ghost intel-workout-save" data-action="intel:saveActionCard" data-workout-id="${id}">${L.saveWorkout}</button>
      </div>
    `;
  }

  async function saveActionCard(btn) {
    const id = btn.dataset.workoutId;
    const data = id && _workoutCards.get(id);
    if (!data) return;
    haptic(10);
    await DB.PlannedWorkouts.save(data.title || 'Workout', data);
    IntelStore.addLog('SYS', `Workout saved: ${data.title || 'Workout'}`);
    btn.disabled = true;
    btn.textContent = _copy().saved;
  }

  return {
    load,
    handleCamera,
    onFileSelected,
    submit,
    generateWeekly,
    createWorkout,
    analyzeStats,
    checkBiometrics,
    playAudio,
    replayVoice,
    renderLogs,
    _clearImage,
    openSettings,
    saveSettings,
    saveActionCard,
    refreshKeyBadge,
  };
})();

// Expose to window for onclick
// @ts-ignore
window.IntelView = IntelView;
