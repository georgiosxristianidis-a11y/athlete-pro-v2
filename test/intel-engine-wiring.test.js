// @ts-check
/**
 * Guard: P.A.N.D.A. Core text requests follow the selected engine (card PC-1).
 *
 * Until 2026-08-29 the sheet's Claude/Gemini toggle was a dummy — chat, weekly
 * summary and biometrics all sent engine:'gemini' and read only gemini-key.
 * TTS stays on Gemini on purpose (routes/coach.js is pinned to gemini-tts).
 * This file keeps the wiring from sliding back to those three literals.
 *
 * A9 (17.09): сеть и DB переехали из `intel.view.js` в `intel.store.js`.
 * Якоря идут за кодом — проверки те же, адрес другой; сверх них добавлена
 * та, что раньше была не нужна: view не имеет права трогать сеть вообще.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEW = fs.readFileSync(path.join(ROOT, 'js', 'intel.view.js'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'intel.store.js'), 'utf8');

const ttsStart = SRC.indexOf('export async function synthesizeSpeech');
const ttsEnd = SRC.indexOf('export function pcmToWav');
assert.ok(ttsStart !== -1 && ttsEnd > ttsStart, 'synthesizeSpeech / pcmToWav anchors missing');
const tts = SRC.slice(ttsStart, ttsEnd);
const rest = SRC.slice(0, ttsStart) + SRC.slice(ttsEnd) + VIEW;

test("intel.store.js has no literal engine: 'gemini' — requests go through aiAuth()", () => {
  assert.equal(
    /engine:\s*['"]gemini['"]/.test(SRC + VIEW),
    false,
    'литерал engine: gemini вернулся — выбранный движок снова не действует'
  );
});

/* Карточка VOICE-1. Сырое `customKey: await DB.Settings.get('gemini-key')`
   отправляло в тело null, когда ключ не сохранён, а ttsSchema принимает
   строку — запрос умирал 400-м, не дойдя до серверного ключа. Значение
   обязано схлопываться в undefined: JSON.stringify выбросит поле сам. */
test('TTS never sends a raw null customKey — no key means no field', () => {
  const line = tts.split('\n').find((l) => l.includes('customKey:'));
  assert.ok(line, 'поле customKey исчезло из тела запроса TTS');
  assert.doesNotMatch(
    line,
    /customKey:\s*await/,
    'сырое чтение ключа прямо в теле — вернулся null → 400 на пустом gemini-key'
  );
  assert.match(
    line,
    /undefined/,
    'отсутствующий ключ обязан становиться undefined, иначе схема режет запрос'
  );
});

test('P.A.N.D.A. Core coach requests go through safeFetch kind=ai, not raw fetch', () => {
  assert.match(
    SRC,
    /import\s*\{[^}]*\bsafeFetch\b[^}]*\}\s*from\s*['"]\.\/privacy\.store\.js['"]/,
    'intel.store.js must import safeFetch — raw fetch bypasses the AI privacy gate'
  );
  assert.equal(
    /(?<!safe)fetch\(\s*['"`]\/api\/coach/.test(SRC + VIEW),
    false,
    'raw fetch(/api/coach…) leaks workouts after the user turns AI off'
  );
  const calls = SRC.split('safeFetch(').slice(1);
  assert.equal(calls.length, 4, 'chat, tts, weekly, biometrics — each one safeFetch');
  const paths = [
    '/api/coach',
    '/api/coach/tts',
    '/api/coach/weekly-report',
    '/api/coach/biometrics-scan',
  ];
  for (const path of paths) {
    const hit = calls.find((c) => c.includes(`'${path}'`) || c.includes(`"${path}"`));
    assert.ok(hit, `${path} must go through safeFetch`);
    assert.match(hit, /['"]ai['"]/, `${path} must pass kind 'ai'`);
  }
});

/* A9: у экрана больше нет своего выхода в сеть. Проверка не про стиль —
   ровно этот путь (view со своим fetch) обходит и privacy-ворота, и
   единственное место, где тело запроса чистится stripSecrets. */
test('intel.view.js не ходит в сеть и в базу сам — только через стор', () => {
  assert.equal(
    /\bfetch\(/.test(VIEW),
    false,
    'в view вернулся сетевой вызов — privacy-ворота обходятся мимо стора'
  );
  assert.equal(
    /\bDB\.[A-Za-z]/.test(VIEW),
    false,
    'в view вернулся прямой DB.* — это долг A15, из которого A9 экран и вытащил'
  );
});

test('P.A.N.D.A. Core SSE uses the carry-buffer parser, not per-chunk split', () => {
  assert.match(SRC, /appendSseChunk/);
  assert.match(SRC, /parseSseDataLine/);
  const stream = SRC.slice(
    SRC.indexOf('export async function streamCoachReply'),
    SRC.indexOf('export async function getAutoSpeech')
  );
  assert.ok(stream.includes('streamCoachReply'), 'якорь streamCoachReply пропал');
  assert.equal(
    stream.includes("chunk.split('\\n')"),
    false,
    'naive per-chunk split вернулся — разорванный SSE-кадр снова теряет текст'
  );
});

test('weekly report window uses timestamp, not the missing w.date field', () => {
  const weekly = SRC.slice(
    SRC.indexOf('export async function fetchWeeklyReport'),
    SRC.indexOf('export async function fetchBiometricsScan')
  );
  assert.ok(weekly.includes('fetchWeeklyReport'), 'якорь fetchWeeklyReport пропал');
  assert.match(
    weekly,
    /Number\(w\.timestamp\)\s*>=\s*sevenDaysAgo/,
    'окно недели обязано сравнивать timestamp — иначе живая история не доезжает до коуча'
  );
  assert.equal(
    /new Date\(\s*w\.date\s*\)/.test(weekly),
    false,
    'w.date не существует на WorkoutRecord: NaN > since отсекает каждую сессию'
  );
});

test('WorkoutRecord has no date field — Date(undefined) drops the whole week', () => {
  const w = { type: 'push', timestamp: Date.now() };
  assert.equal(Number.isNaN(new Date(/** @type {any} */ (w).date).getTime()), true);
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  assert.equal(new Date(/** @type {any} */ (w).date).getTime() > since, false);
  assert.equal(Number(w.timestamp) >= since, true);
});

test("gemini-key is read only inside TTS — text requests use the selected engine's key", () => {
  assert.match(
    tts,
    /gemini-key/,
    'TTS обязан читать gemini-key: routes/coach.js прошит на gemini-tts'
  );
  assert.equal(
    rest.includes("'gemini-key'") || rest.includes('"gemini-key"'),
    false,
    'чтение gemini-key вне synthesizeSpeech — снова игнорируется ключ выбранного движка'
  );
});

/* Профиль уходит на сервер из трёх мест через одну функцию, _coachProfile().
   CORE-1 (23.09): сырой DB.Settings.getAll() отдавал стор целиком — вместе с
   BYOK-ключами (тогда закрывал stripSecrets), но и с athlete-photo, privacy.*,
   ap-*, которым в промпте делать нечего. Проверка держит две вещи разом:
   источник — белый список через loadProfile(), а не снимок стора, и что
   вызов ровно один — иначе три места на сервере снова разойдутся.
   CORE-4: чат перешёл на снимок движков и берёт профиль внутри него
   (`coach-snapshot.store.js` → `toCoachProfile`, тот же белый список), поэтому
   прямых вызовов `_coachProfile()` осталось определение + 2 (weekly/biometrics),
   а чат обязан слать `snapshot`, а не сырые `profile`/`workouts`/`topLifts`. */
test('профиль для коуча — белый список через loadProfile(), не снимок стора', () => {
  const raw = SRC.match(/DB\.Settings\.getAll\(\)/g) || [];
  assert.equal(raw.length, 0, 'вернулось чтение настроек целиком — снова уедет athlete-photo/privacy.*');
  const calls = SRC.match(/_coachProfile\(\)/g) || [];
  assert.equal(calls.length, 3, 'ожидаются определение + 2 места (weekly/biometrics); чат — через снимок');
  const chat = SRC.slice(SRC.indexOf('export async function streamCoachReply'), ttsStart);
  // CORE-5: клиент один на все двери, дверь — параметр; у Core она по умолчанию.
  assert.match(chat, /collectCoachSnapshot\(\{ door \}\)/, 'чат обязан собирать снимок, а не читать БД сам');
  assert.match(chat, /door = 'intel'/, 'Core зовёт клиент без двери — по умолчанию обязан быть intel');
  assert.equal(/\b(workouts|topLifts|profile),/.test(chat.slice(chat.indexOf('JSON.stringify'))), false,
    'сырые workouts/profile/topLifts снова уходят в /api/coach мимо снимка');
  const fn = SRC.slice(SRC.indexOf('async function _coachProfile'), SRC.indexOf('async function _coachProfile') + 400);
  assert.match(fn, /loadProfile\(\)/, '_coachProfile обязан читать через profile.store.js, не сырой Settings');
  for (const leak of ['athlete-photo', 'privacy.audit', 'ap-usage-queue']) {
    assert.equal(fn.includes(leak), false, `${leak} не должен упоминаться в белом списке`);
  }
});

/* CORE-6: виджет готовности больше не собирается из JSON, который модель
   кладёт в поток, — он читает fetchReadiness() (локальный движок) напрямую,
   независимо от ответа модели (`_widget`/air-markdown regex сняты).
   Инвариант сменился: не «эта строка от модели обязана идти через esc()»
   (строк от модели тут больше нет — goal убран вместе с контрактом), а
   «индекс без данных не красится числом» и «слагаемые — реальные parts
   readiness(), не смесь sleep/дублированного density из выдумки модели». */
test('_buildReadinessWidget не красит число без данных и читает parts движка (CORE-6)', () => {
  const start = VIEW.indexOf('function _buildReadinessWidget');
  const end = VIEW.indexOf('function playAudio');
  assert.ok(start !== -1 && end > start, 'якорь _buildReadinessWidget пропал');
  const fn = VIEW.slice(start, end);

  assert.match(
    fn,
    /confidence === 'none'/,
    'пустая история (INTEL-2b) обязана показывать текстовое состояние, не 0/100'
  );
  assert.match(fn, /clamp\(data\.index\)/, 'index обязан идти через clamp перед вставкой в inline-style width');
  for (const part of ['recovery', 'acwr', 'monotony', 'trend']) {
    assert.match(
      fn,
      new RegExp(`data\\.parts\\?\\.${part}`),
      `виджет обязан читать data.parts.${part} — реальное слагаемое readiness(), не поле из JSON модели`
    );
  }
  assert.equal(/rawData/.test(fn), false, 'виджет не должен ждать rawData от модели — источник только fetchReadiness()');
  assert.equal(/data\.sleep|data\.density/.test(fn), false, 'sleep и дубль density — снятые CORE-6 поля, их не должно быть в шаблоне');
});

/* report.score в оверлее недельного отчёта — до фикса единственное поле
   карточки без esc()/клэмпа: summary/pros/cons уже шли через esc(). Сервер
   теперь тоже валидирует (_parseWeeklyReport, routes/coach.js), но клиент не
   имеет права полагаться на чужую валидацию как на единственный барьер. */
test('_renderReportOverlay клэмпит report.score перед вставкой в innerHTML (CORE-1)', () => {
  const start = VIEW.indexOf('function _renderReportOverlay');
  const end = VIEW.indexOf('function createWorkout');
  assert.ok(start !== -1 && end > start, 'якорь _renderReportOverlay пропал');
  const fn = VIEW.slice(start, end);

  assert.match(fn, /const score = Math\.max\(0, Math\.min\(100,/, 'score обязан идти через клэмп 0-100');
  assert.equal(/\$\{report\.score\}/.test(fn), false, 'report.score снова вставляется в шаблон сырым');
  assert.match(fn, /\$\{score\}/, 'клэмпнутая переменная score не используется в шаблоне');
});
