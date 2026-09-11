// @ts-check
/* VOICE-2 — живая волна на озвучке тренера.
   Две половины наряда проверяются по-разному: расчёт высот — чистой логикой,
   а всё, что живёт в DOM и Web Audio, — по исходнику. Второе не прихоть:
   ровно там лежат обе мины, из-за которых код из `f7fdb95` нельзя было влить
   как есть — угон чужого класса `.intel-wave-bar` и обмен голоса на картинку
   при неподнятом AudioContext. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANDS,
  BAND_EDGES_HZ,
  BAND_GAIN,
  BAR_COUNT,
  MIN_SCALE,
  bandsForRate,
  barOpacity,
  barScale,
  waveScales,
} from '../js/intel.voice-wave.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Гарды смотрят на код, а не на рассказ о коде: сам модуль обязан объяснять
   обе мины в шапке, и без вычистки комментариев проверка порядка вызовов
   ловила бы слова из этого объяснения. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const WAVE_SRC = stripComments(
  fs.readFileSync(path.join(ROOT, 'js', 'intel.voice-wave.js'), 'utf8')
);
const VIEW_SRC = stripComments(fs.readFileSync(path.join(ROOT, 'js', 'intel.view.js'), 'utf8'));
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'intel.css'), 'utf8');

/* ── Расчёт высот ── */

test('barScale: тишина и мусор дают минимум, полная шкала — единицу', () => {
  assert.equal(barScale(0), MIN_SCALE);
  assert.equal(barScale(255), 1);
  assert.equal(barScale(NaN), MIN_SCALE);
  assert.equal(barScale(undefined), MIN_SCALE);
  assert.equal(
    barScale(-40),
    MIN_SCALE,
    'отрицательный байт спектра не должен переворачивать столбик'
  );
  assert.equal(barScale(1e6), 1, 'усиление полосы не имеет права выгнать столбик за единицу');
});

test('barScale: монотонна по громкости', () => {
  const quiet = barScale(40);
  const mid = barScale(120);
  const loud = barScale(240);
  assert.ok(MIN_SCALE < quiet && quiet < mid && mid < loud, `${quiet} < ${mid} < ${loud} нарушено`);
});

test('barOpacity: низкий столбик бледный, полный — сплошной', () => {
  assert.equal(barOpacity(MIN_SCALE), 0.35);
  assert.equal(barOpacity(1), 1);
  assert.equal(barOpacity(NaN), 0.35);
  assert.ok(barOpacity(0.6) > barOpacity(0.3), 'прозрачность обязана расти вместе с высотой');
});

test('waveScales: длина волны совпадает с числом столбиков в разметке', () => {
  assert.equal(BANDS.length, BAR_COUNT, 'полос спектра должно быть столько же, сколько столбиков');
  assert.equal(BAND_GAIN.length, BAR_COUNT, 'усиление задано не для всех полос');
  assert.equal(waveScales(new Uint8Array(32)).length, BAR_COUNT);
});

test('waveScales: тишина кладёт все столбики на минимум', () => {
  const silent = waveScales(new Uint8Array(32));
  assert.deepEqual(silent, Array(BAR_COUNT).fill(MIN_SCALE));
});

test('waveScales: пустой вход не роняет и не даёт NaN', () => {
  for (const bad of [null, undefined, [], {}]) {
    const out = waveScales(/** @type {any} */ (bad));
    assert.equal(out.length, BAR_COUNT);
    assert.ok(
      out.every((v) => Number.isFinite(v) && v >= MIN_SCALE),
      `вход ${JSON.stringify(bad)} дал ${JSON.stringify(out)}`
    );
  }
});

/* Речь живёт в нижних бинах. Полосы обязаны быть разными: при одном среднем
   по спектру пять столбиков ходили бы одним телом — это анимация «сигнал
   есть», а не визуализация голоса. */
test('waveScales: низкий тон поднимает первую полосу, но не последнюю', () => {
  const bins = new Uint8Array(32);
  bins[0] = 220;
  bins[1] = 200;
  const out = waveScales(bins);
  assert.ok(out[0] > 0.7, `первая полоса должна отозваться, получено ${out[0]}`);
  assert.equal(out[BAR_COUNT - 1], MIN_SCALE, 'верхняя полоса на низком тоне обязана молчать');
});

test('waveScales: верхняя полоса всё-таки достижима — усиление её вытягивает', () => {
  const bins = new Uint8Array(32);
  for (let i = 11; i < 16; i++) bins[i] = 120;
  const out = waveScales(bins);
  assert.equal(out[0], MIN_SCALE, 'нижняя полоса на верхнем тоне обязана молчать');
  assert.ok(out[BAR_COUNT - 1] > 0.7, `верхняя полоса недобирает: ${out[BAR_COUNT - 1]}`);
});

/* ── Мина 3: ширина бина идёт от контекста, а не от файла ──
   Бин анализатора = `AudioContext.sampleRate / fftSize`. WAV с TTS приходит на
   24 кГц, но контекст почти везде 44.1/48 кГц: полосы, посчитанные «по файлу»,
   уезжают выше речи, и верхние столбики стоят на минимуме при живом графе. */

test('bandsForRate: на 24 кГц раскладка та же, что была прошита числами', () => {
  assert.deepEqual(
    bandsForRate(24000, 64).map(([a, b]) => [a, b]),
    BANDS.map(([a, b]) => [a, b])
  );
  assert.equal(BAND_EDGES_HZ.length, BAR_COUNT, 'полос в герцах должно быть по числу столбиков');
});

test('bandsForRate: на 44.1 и 48 кГц полосы непустые и в пределах бинов', () => {
  for (const rate of [44100, 48000]) {
    const bands = bandsForRate(rate, 64);
    assert.equal(bands.length, BAR_COUNT, `${rate}: полос не по числу столбиков`);
    for (const [from, to] of bands) {
      assert.ok(to > from, `${rate}: пустая полоса [${from}, ${to}) — столбик мёртв`);
      assert.ok(from >= 0 && to <= 32, `${rate}: полоса [${from}, ${to}) вне 32 бинов`);
    }
  }
});

test('bandsForRate: мусор на входе не роняет и даёт непустые полосы', () => {
  for (const bad of [NaN, 0, -1, undefined]) {
    const bands = bandsForRate(/** @type {any} */ (bad), 64);
    assert.equal(bands.length, BAR_COUNT);
    assert.ok(bands.every(([from, to]) => to > from));
  }
});

/* Регрессия в числах: речь укладывается в нижние бины, и на 48 кГц их всего восемь.
   По раскладке «для 24 кГц» верхние два столбика на этом же спектре стоят мёртвые. */
test('на 48 кГц верхние столбики отзываются на речь, а по старой раскладке — нет', () => {
  const bins = new Uint8Array(32);
  for (let i = 0; i < 8; i++) bins[i] = 150;

  const byRate = waveScales(bins, bandsForRate(48000, 64));
  assert.ok(
    byRate[BAR_COUNT - 1] > 0.7,
    `верхний столбик обязан ожить на живом голосе, получено ${byRate[BAR_COUNT - 1]}`
  );

  const byFile = waveScales(bins);
  assert.ok(
    byFile[BAR_COUNT - 1] <= MIN_SCALE + 0.01,
    'раскладка «по частоте файла» обязана оставаться доказательством бага, иначе тест ничего не стережёт'
  );
});

test('полосы для графа снимаются с sampleRate контекста, а не с числа в коде', () => {
  assert.match(
    WAVE_SRC,
    /bandsForRate\(\s*_ctx\.sampleRate/,
    'визуализатор снова считает бины по частоте файла: верхние столбики встанут'
  );
});

/* ── Мина 1: чужой класс ── */

test('волна озвучки не трогает `.intel-wave-bar` — это волна кнопки отправки', () => {
  assert.doesNotMatch(
    WAVE_SRC,
    /['"`.]intel-wave-bar/,
    'селектор волны кнопки отправки вернулся в визуализатор: инлайновый transform останется на её столбиках'
  );
  assert.match(WAVE_SRC, /intel-voice-wave-bar/, 'у волны озвучки должно быть своё имя класса');
  assert.match(CSS, /\.intel-voice-wave-bar\s*\{/, 'класс волны озвучки не описан в css/intel.css');
  assert.match(
    CSS,
    /\.intel-wave-bar\s*\{[\s\S]*?animation:\s*intel-wave-bounce/,
    'волна кнопки отправки потеряла собственную анимацию'
  );
});

/* ── Мина 2: голос в обмен на картинку ── */

test('createMediaElementSource не вызывается, пока контекст не running', () => {
  const guard = WAVE_SRC.indexOf("state !== 'running'");
  const reroute = WAVE_SRC.indexOf('createMediaElementSource');
  assert.ok(guard !== -1, 'исчезла проверка состояния AudioContext перед уводом звука в граф');
  assert.ok(reroute !== -1, 'визуализатор перестал снимать спектр с элемента');
  assert.ok(
    guard < reroute,
    'увод звука в граф оказался выше проверки состояния: на заблокированном автоплее голос пропадёт совсем'
  );
});

test('сбой графа возвращает звук напрямую в destination, а не в тишину', () => {
  const catchBlock = WAVE_SRC.slice(WAVE_SRC.indexOf('createMediaElementSource'));
  assert.match(
    catchBlock,
    /catch[\s\S]{0,400}_source\.connect\(_ctx\.destination\)/,
    'в ветке ошибки нет прямого подключения источника: элемент останется отвязанным от колонок'
  );
});

test('цикл кадров гасится без разбора графа, когда хост уехал с оверлея', () => {
  assert.match(
    WAVE_SRC,
    /isConnected[\s\S]{0,240}_raf = 0;\s*\n\s*return;/,
    'потеря хоста обязана гасить только кадры: stopVoiceWave() тут оборвал бы реплику на середине'
  );
});

test('движение отключается при prefers-reduced-motion', () => {
  assert.match(
    WAVE_SRC,
    /prefers-reduced-motion: reduce/,
    'визуализатор игнорирует запрос «без движения»'
  );
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,260}intel-voice-wave-bar/);
});

/* ── Проводка в экране ── */

test('speakText снимает волну и отзывает блоб на КАЖДОМ выходе', () => {
  const start = VIEW_SRC.indexOf('async function speakText');
  const end = VIEW_SRC.indexOf('function pcmToWav');
  assert.ok(start !== -1 && end > start, 'якоря speakText / pcmToWav пропали');
  const speak = VIEW_SRC.slice(start, end);

  assert.match(speak, /startVoiceWave\(audio,/, 'волна больше не стартует вместе с озвучкой');

  /* Порядок, а не только наличие. `createMediaElementSource` уводит элемент из колонок
     в граф; на УЖЕ играющем элементе WebKit на этом регулярно теряет вывод — и вместо
     волны выходит тишина, ровно та, ради которой заведена VOICE-1. */
  const wave = speak.indexOf('startVoiceWave(audio,');
  const play = speak.indexOf('audio.play()');
  assert.ok(play !== -1, 'речь перестала запускаться');
  assert.ok(wave < play, 'граф поднимается после play(): на WebKit это меняет голос на тишину');
  assert.match(
    speak.slice(wave - 12, wave),
    /await\s*$/,
    'startVoiceWave не ждут: play() успеет стартовать до подключения графа'
  );
  assert.match(
    speak,
    /audio\.onerror\s*=/,
    'битый ответ снова оставит _isSpeaking взведённым навсегда'
  );
  assert.equal(
    (speak.match(/stopVoiceWave\(\)/g) || []).length >= 2,
    true,
    'выходов у речи два (release и catch) — волну обязаны снимать оба'
  );
  const tail = speak.slice(speak.indexOf('} catch'));
  assert.match(
    tail,
    /revokeObjectURL/,
    'путь ошибки не отзывает blob: URL — утечка на каждой неудачной озвучке'
  );
});

test('волна монтируется в слот своей карточки, а не в первый попавшийся', () => {
  assert.match(
    VIEW_SRC,
    /<span class="intel-voice-slot"><\/span>/,
    'в разметке нет слота под волну'
  );
  assert.match(
    VIEW_SRC,
    /speakText\(textToSpeak, feedbackEl\.querySelector\('\.intel-voice-slot'\)\)/,
    'автоозвучка обязана брать слот своей карточки: лента растёт сверху'
  );
  assert.match(
    VIEW_SRC,
    /speakText\(\s*textToSpeak,\s*container\.querySelector\('\.intel-voice-slot'\)\s*\)/,
    'кнопка «Озвучить» обязана давать слот той карточки, на которой её нажали'
  );
});
