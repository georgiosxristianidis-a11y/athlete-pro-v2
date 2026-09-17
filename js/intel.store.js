// @ts-check

import { DB } from './db.js';
import { readiness } from './intel.engine.js';
import { stripSecrets } from './shared/sync-secrets.js';
import { safeFetch } from './privacy.store.js';
import { aiAuth, getTone } from './ai-settings.store.js';
import { probeAiStatus } from './shared/ai-status.js';
import { appendSseChunk, parseSseDataLine } from './shared/sse.js';

/**
 * Индекс готовности по локальной истории (INTEL-2).
 * Тонкий адаптер: единственное место, где движок встречается с IndexedDB —
 * сам движок остаётся чистым и тестируется без базы.
 * Отказ базы — не повод падать экрану: возвращаем честный пустой индекс.
 * @param {{ now?: number }} [opts]
 * @returns {Promise<import('./intel.engine.js').Readiness>}
 */
export async function fetchReadiness(opts = {}) {
  const workouts = await DB.Workouts.getAll().catch(() => []);
  return readiness(workouts, opts);
}

/**
 * IntelStore — Athlete Pro
 * State management for the Neural Command Center.
 */
export const IntelStore = (() => {
  const LOGS_KEY = 'ap-intel-logs';
  let _logs = [];
  let _status = 'SYSTEM STANDBY';
  let _loading = false;

  function init() {
    try {
      _logs = JSON.parse(localStorage.getItem(LOGS_KEY) || '[]');
    } catch { _logs = []; }
  }

  /**
   * Add a log entry.
   * @param {'SYS'|'DB'|'AI'|'USER'} type
   * @param {string} text
   */
  function addLog(type, text) {
    const log = { type, text, time: new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
    _logs = [log, ..._logs].slice(0, 50);
    localStorage.setItem(LOGS_KEY, JSON.stringify(_logs));
    window.dispatchEvent(new CustomEvent('ap-intel-log', { detail: log }));
  }

  return {
    init,
    addLog,
    getLogs: () => _logs,
    getStatus: () => _status,
    setStatus: (s) => {
      _status = s;
      window.dispatchEvent(new CustomEvent('ap-intel-status'));
    },
    isLoading: () => _loading,
    setLoading: (l) => {
      _loading = l;
      window.dispatchEvent(new CustomEvent('ap-intel-loading'));
    }
  };
})();

/* ════════════════════════════════════════════════════════════════════
   A9 — сеть и IndexedDB экрана Intel.

   До 17.09 это жило в `intel.view.js`: экран сам читал историю, сам
   собирал тело запроса, сам разбирал кадры SSE — второй dashboard,
   ровно тот случай, ради которого заведён Store/View (A15). Здесь нет
   ни одного обращения к DOM: карточки, оверлеи и волна остаются за
   view, сюда приходит вопрос «дай данные» и уходит готовый ответ.
   ════════════════════════════════════════════════════════════════════ */

/**
 * Профиль для коуча — всегда через `stripSecrets`. Настройки лежат одной
 * пачкой вместе с BYOK-ключами, и сырой `Settings.getAll()` в теле запроса
 * отправил бы чужой ключ на сервер.
 * @returns {Promise<object>}
 */
async function _coachProfile() {
  return stripSecrets(await DB.Settings.getAll());
}

/**
 * Состояние ключа для индикатора в шапке: свой BYOK важнее серверного —
 * он виден сразу, без запроса в сеть.
 * @returns {Promise<{ hasValidKey: boolean, source: string }>}
 */
export async function probeKeyState() {
  const { engine, customKey } = await aiAuth();
  if (customKey && customKey.trim().length > 10) {
    return { hasValidKey: true, source: 'local' };
  }

  const probed = await probeAiStatus();
  const hasValidKey =
    probed.source === 'server'
      ? engine === 'gemini'
        ? !!probed.gemini
        : !!probed.anthropic
      : false;
  return { hasValidKey, source: probed.source };
}

/**
 * Поток ответа коуча. Текст отдаётся наружу кусками: рисует их view, здесь
 * только чтение сокета и разбор кадров SSE.
 *
 * @param {{ text: string, image?: string|null, onText?: (chunk: string, full: string) => void }} params
 * @returns {Promise<string>} полный текст ответа
 */
export async function streamCoachReply({ text, image = null, onText }) {
  const workouts = await DB.Workouts.getLast(5);
  const profile = await _coachProfile();
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
              fullText += ev.text;
              onText?.(ev.text, fullText);
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
          fullText += ev.text;
          onText?.(ev.text, fullText);
        }
      }
    }
  }

  return fullText;
}

/**
 * Озвучивать ли ответ сразу — настройка, а не состояние экрана.
 * @returns {Promise<boolean>}
 */
export async function getAutoSpeech() {
  return !!(await DB.Settings.get('ai-auto-speech', true));
}

/**
 * Синтез речи. Voice is Gemini-only: routes/coach.js pins
 * gemini-2.5-flash-preview-tts.
 *
 * Ключа может не быть вовсе (движок anthropic, BYOK не заведён) — тогда
 * DB.Settings.get отдаёт null, а ttsSchema валидирует customKey как строку:
 * null роняет запрос в 400 ещё до того, как сервер попробует свой ключ из
 * окружения. Нет ключа — поля в теле быть не должно, JSON.stringify
 * выбрасывает undefined сам.
 *
 * @param {string} text
 * @returns {Promise<Blob>} WAV; проигрывает его view — Audio сюда не заходит
 */
export async function synthesizeSpeech(text) {
  const geminiKey = await DB.Settings.get('gemini-key');

  const response = await safeFetch(
    '/api/coach/tts',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        customKey: geminiKey ? String(geminiKey) : undefined,
      }),
    },
    'ai'
  );

  if (!response.ok) throw new Error('Voice sync failed');

  const result = await response.json();
  const pcmData = result.audioBase64;
  if (!pcmData) throw new Error('Audio data not found');

  return pcmToWav(pcmData, 24000);
}

/**
 * PCM16 → WAV. Чистая арифметика над буфером: ни DOM, ни сети.
 * @param {string} base64Pcm
 * @param {number} sampleRate
 * @returns {Blob}
 */
export function pcmToWav(base64Pcm, sampleRate) {
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

/**
 * Недельная сводка. Окно недели считается здесь: WorkoutRecord несёт
 * `timestamp` (epoch ms), поля `w.date` на нём нет — `new Date(undefined)`
 * даёт NaN, и предикат отсекал бы каждую сессию.
 * @returns {Promise<any>} report
 */
export async function fetchWeeklyReport() {
  const workouts = await DB.Workouts.getAll();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentWorkouts = workouts.filter((w) => Number(w.timestamp) >= sevenDaysAgo);
  const profile = await _coachProfile();

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
  return report;
}

/**
 * Биометрический скан (HUD-3). Готовность — производная от отчёта, а не
 * вторая правда: считается один раз здесь, view только рисует число.
 * @returns {Promise<{ report: any, readiness: number }>}
 */
export async function fetchBiometricsScan() {
  const workouts = await DB.Workouts.getLast(10);
  const profile = await _coachProfile();

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

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.error || `HTTP ${response.status}`);
  }

  const { report } = await response.json();
  return {
    report,
    readiness: Math.max(0, 100 - Math.round((report.cnsFatigue + report.muscleDamage) / 2)),
  };
}

/**
 * Карточка тренировки из ответа ИИ — в план.
 * @param {{ title?: string }} data
 */
export async function savePlannedWorkout(data) {
  await DB.PlannedWorkouts.save(data.title || 'Workout', data);
}
