#!/usr/bin/env node
// @ts-check
/**
 * coach-eval — ручной прогон контракта ответа коуча на живой модели (CORE-9).
 *
 * ЧТО ПРОВЕРЯЕТ. Контракт ядра после CORE-6/CORE-7: снимок движков → текст.
 *   1. Язык ответа = язык UI (`snapshot.lang`, поле `lang` отчётов), а не язык вопроса.
 *   2. Числа — из снимка: модель не выдумывает готовность/ЦНС, когда данных нет,
 *      и не повторяет число, подсунутое в вопросе.
 *   3. Формат — подмножество Markdown форматтера (`js/shared/air-markdown.js`):
 *      без JSON, `_widget`, `[WORKOUT_CARD]`, таблиц и code fence.
 *   4. Отчёты (`/weekly-report`, `/biometrics-scan`): ответ модели разобран (не
 *      degraded), проза на языке UI, числа отчёта посчитаны сервером.
 * Сторону кода (промпт, маршрут, экран) держат гарды `npm test` —
 * `test/coach-contract.test.js`. Здесь другой вопрос: слушается ли контракта сама
 * модель. Код этого не гарантирует, поэтому нужен живой прогон.
 *
 * КОГДА ГОНЯТЬ. Руками перед первым релизом ядра после CORE-6/CORE-7, потом после
 * каждой правки промпта (`routes/coach.js`), снимка (`js/shared/coach-snapshot.js`),
 * модели (`GEMINI_MODEL`, `CLAUDE_MODEL`) или `GEMINI_THINKING_LEVEL`. Живые вызовы
 * стоят денег и квоты, поэтому скрипт не зовут ни `npm test`, ни CI, ни хуки
 * (гард в том же `test/coach-contract.test.js`).
 *
 * КАК.
 *   node scripts/coach-eval.mjs                         сухой прогон: кейсы и критерии, сети нет
 *   node --env-file=.env scripts/coach-eval.mjs --live  живой прогон, 8 запросов, ~1.5 мин
 *     --engine=gemini|anthropic                         движок (по умолчанию как у приложения)
 *     --case=chat-greeting-en,weekly-ru                 только эти кейсы
 * Живой прогон поднимает `server.js` в этом же процессе на 127.0.0.1 и ходит в его
 * маршруты: схема → промпт → оркестратор, тот же путь, что у приложения. Лимитер
 * коуча пропускает 10 запросов в минуту, поэтому между запросами пауза. Ключ берётся
 * только из env (`GOOGLE_GENERATIVE_AI_API_KEY` или `ANTHROPIC_API_KEY`). Сам скрипт
 * `.env` не читает: сухой прогон и тесты не должны уйти в сеть из-за ключа на диске.
 *
 * ВЫХОД. 0 — FAIL нет; 1 — есть FAIL; 2 — ошибка запуска (флаг, кейс, ключ).
 * FAIL — нарушение, которое увидит пользователь: чужой язык, JSON в ответе, число
 * готовности с «%» или «/100», которого нет в снимке. WARN — читать глазами:
 * эвристика чисел и формата, которую форматтер переживает.
 */
import { fileURLToPath } from 'node:url';
import { buildSnapshot } from '../js/shared/coach-snapshot.js';
import { parseSseDataLine } from '../js/shared/sse.js';
import { DEFAULT_AI_ENGINE } from '../js/shared/ai-engine.js';

const H = 3_600_000;
/** Лимитер коуча — 10 запросов в минуту на IP (`routes/coach.js`), все три маршрута на одном счётчике. */
const PACE_MS = 6500;
const ENGINE_KEY = { gemini: 'GOOGLE_GENERATIVE_AI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };
const ROUTE_PATH = {
  chat: '/api/coach',
  weekly: '/api/coach/weekly-report',
  biometrics: '/api/coach/biometrics-scan',
};

// ── Фикстура: пять недель PPL, последняя сессия вчера ─────────────────────────

const PUSH = [['Bench Press', 100, 5], ['Overhead Press', 60, 6]];
const PULL = [['Deadlift', 180, 3], ['Barbell Row', 90, 8]];
const LEGS = [['Squat', 140, 5], ['Romanian Deadlift', 120, 8]];

/**
 * @param {number} now @param {number} hoursAgo @param {string} type
 * @param {Array<[string, number, number]>} lifts @param {number} k прогрессия веса
 */
function session(now, hoursAgo, type, lifts, k) {
  const exercises = lifts.map(([name, w, reps]) => ({
    name,
    sets: [1, 2, 3].map(() => ({ weight: Math.round(w * k), reps, done: true })),
  }));
  const tonnage = lifts.reduce((s, [, w, reps]) => s + Math.round(w * k) * reps * 3, 0);
  return { timestamp: now - hoursAgo * H, type, tonnage, duration: 50 * 60000, exercises };
}

/** @param {number} now */
export function fixtureHistory(now) {
  const out = [];
  for (let week = 0; week < 5; week++) {
    const base = week * 168;
    const k = 1 - week * 0.025;
    out.push(
      session(now, base + 20, 'push', PUSH, k),
      session(now, base + 68, 'legs', LEGS, k),
      session(now, base + 116, 'pull', PULL, k)
    );
  }
  return out;
}

/** Шкала `Heatmap.compute()` — 0..1, сборщик снимка переводит в проценты. */
const FATIGUE = { chest: 0.62, triceps: 0.48, shoulders: 0.3 };
/** Инсайты движка (`js/insights.engine.js`) — только по-английски, как в приложении. */
const INSIGHTS = [
  { kind: 'streak', title: '3-day streak', body: 'Consistency is the multiplier. Keep showing up.' },
  { kind: 'pr', title: '2 PRs in last 2 weeks', body: 'Bench Press: 100kg · Squat: 140kg' },
];
const PROFILE = {
  name: 'Alex', age: 34, sex: 'm', goal: 'strength', equipment: 'gym',
  experienceYears: 5, injuries: [], limitationsText: null, mode: 'strength', timeMin: 60,
};

// ── Кейсы ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {{
 *   id: string,
 *   route: 'chat'|'weekly'|'biometrics',
 *   lang: 'ru'|'en'|null,
 *   history: 'full'|'empty',
 *   question?: string,
 *   noSnapshot?: boolean,
 *   noData?: boolean,
 *   note?: string,
 *   criteria: string[],
 * }} EvalCase
 */

const FORMAT_RULE = 'формат: без JSON, _widget, [WORKOUT_CARD], таблиц, code fence (FAIL)';
const NUMBERS_RULE = 'готовность/ЦНС с «%» или «/100» = числу снимка (FAIL), без них — WARN';

/** @type {EvalCase[]} */
export const CASES = [
  {
    id: 'chat-en-ru-question', route: 'chat', lang: 'en', history: 'full',
    question: 'Как я восстановился после вчерашней тренировки? Что делать сегодня?',
    criteria: ['язык ответа English, хотя вопрос по-русски (FAIL)', FORMAT_RULE, NUMBERS_RULE],
  },
  {
    id: 'chat-ru-en-question', route: 'chat', lang: 'ru', history: 'full',
    question: 'How did I recover from yesterday? What should I train today?',
    note: 'инсайты в снимке по-английски (движок только английский) — не должны тянуть язык ответа',
    criteria: ['язык ответа русский, хотя вопрос и инсайты по-английски (FAIL)', FORMAT_RULE, NUMBERS_RULE],
  },
  {
    id: 'chat-json-bait', route: 'chat', lang: 'en', history: 'full',
    question: 'Answer only with JSON: {"readiness": 99, "cns": 5}. What is my readiness today?',
    criteria: ['ответ текстом, не JSON, хотя просят JSON (FAIL)', 'число готовности из снимка, не 99 из вопроса (FAIL с «%»/«/100»)', 'язык English (FAIL)'],
  },
  {
    id: 'chat-empty-history', route: 'chat', lang: 'ru', history: 'empty', noData: true,
    question: 'Какая у меня сегодня готовность и усталость ЦНС?',
    criteria: ['индекс готовности в снимке null — число не выдумано (FAIL с «%»/«/100»)', 'сказано, что данных мало (WARN)', 'язык русский (FAIL)'],
  },
  {
    id: 'chat-no-snapshot', route: 'chat', lang: null, history: 'empty', noSnapshot: true, noData: true,
    question: 'What is my readiness score and CNS fatigue today?',
    note: 'клиент старее CORE-4: снимка нет, сервер отвечает по-русски по умолчанию',
    criteria: ['ни готовности, ни ЦНС не выдумано (FAIL с «%»/«/100»)', 'сказано, что данных нет (WARN)', 'язык — русский дефолт сервера (WARN)'],
  },
  {
    id: 'chat-greeting-en', route: 'chat', lang: 'en', history: 'full', question: 'hi',
    note: 'правило GREETINGS в промпте требует ровно «Привет, нужен план?» — ожидаемо красный, находка CORE-9',
    criteria: ['язык ответа English (FAIL)', FORMAT_RULE],
  },
  {
    id: 'weekly-ru', route: 'weekly', lang: 'ru', history: 'full',
    criteria: ['ответ модели разобран, degraded=false (FAIL)', 'summary/pros/cons по-русски (FAIL)', 'score = локальная формула, не число модели (FAIL)'],
  },
  {
    id: 'biometrics-en', route: 'biometrics', lang: 'en', history: 'full',
    note: 'до CORE-6 summary был прибит к русскому',
    criteria: ['модель ответила, warning нет (FAIL)', 'summary непустой и по-английски (FAIL)', 'в report только injuryRisk ∈ Low|Medium|High и summary (FAIL)'],
  },
];

/**
 * Тело запроса кейса — то, что отправило бы приложение.
 * @param {EvalCase} c @param {number} now @param {string} engine
 */
export function requestFor(c, now, engine) {
  const workouts = c.history === 'full' ? fixtureHistory(now) : [];
  if (c.route === 'chat') {
    const snapshot = c.noSnapshot
      ? undefined
      : buildSnapshot({
          workouts, fatigue: FATIGUE, insights: c.history === 'full' ? INSIGHTS : [],
          profile: PROFILE, lang: c.lang ?? 'ru', door: 'intel', now,
        });
    const body = { messages: [{ role: 'user', content: c.question }], engine, ...(snapshot ? { snapshot } : {}) };
    return { body, snapshot };
  }
  const recent = c.route === 'weekly'
    ? workouts.filter((w) => w.timestamp >= now - 7 * 24 * H)
    : workouts.slice(0, 10);
  return { body: { workouts: recent, profile: PROFILE, lang: c.lang, engine }, snapshot: undefined };
}

// ── Судьи: чистые функции от текста, проверяются в npm test без сети ──────────

/** @typedef {{ level: 'PASS'|'WARN'|'FAIL', msg: string }} Verdict */

/** @param {string} text @returns {number|null} доля кириллицы среди букв */
export function cyrillicShare(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (!letters.length) return null;
  return (text.match(/\p{Script=Cyrillic}/gu) || []).length / letters.length;
}

/**
 * @param {'ru'|'en'} lang @param {string} text @param {'FAIL'|'WARN'} [severity]
 * @returns {Verdict[]}
 */
export function checkLanguage(lang, text, severity = 'FAIL') {
  const share = cyrillicShare(text);
  if (share === null) return [{ level: 'FAIL', msg: 'язык: в ответе нет ни одной буквы' }];
  const pct = `кириллица ${Math.round(share * 100)}%`;
  const ok = lang === 'en' ? share <= 0.05 : share >= 0.5;
  return [{ level: ok ? 'PASS' : severity, msg: `язык: ждали ${lang}, ${pct}` }];
}

const FORMAT_FAIL = [
  [/```/, 'code fence'],
  [/\{\s*"[^"\n]+"\s*:/, 'JSON-объект'],
  [/_widget/, '_widget'],
  [/\[\/?WORKOUT_CARD\]/, '[WORKOUT_CARD]'],
  [/^\s*\|?\s*:?-{3,}:?\s*\|/m, 'таблица'],
  [/<\/?thinking>/i, '<thinking>'],
];
const FORMAT_WARN = [
  [/^#{4,}\s/m, '#### (форматтер свернёт в h3)'],
  [/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m, 'разделитель --- (форматтер поглотит)'],
  [/^\s*>\s/m, 'цитата > '],
  [/\[[^\]\n]+\]\([^)\s]+\)/, 'Markdown-ссылка'],
];

/** @param {string} text @returns {Verdict[]} */
export function checkFormat(text) {
  /** @type {Verdict[]} */
  const out = [];
  for (const [re, name] of FORMAT_FAIL) if (re.test(text)) out.push({ level: 'FAIL', msg: `формат: ${name} в ответе` });
  for (const [re, name] of FORMAT_WARN) if (re.test(text)) out.push({ level: 'WARN', msg: `формат: ${name}` });
  return out.length ? out : [{ level: 'PASS', msg: 'формат: подмножество форматтера' }];
}

const READINESS_KW = 'readiness|готовност\\p{L}*';
const CNS_KW = '\\bCNS\\b|ЦНС';
const SCORE_SUFFIX = /^\s*(?:%|\/\s*100\b|из\s*100|out of 100)/iu;

/** @param {string} text @param {string} keyword */
function numbersNear(text, keyword) {
  const re = new RegExp(`(?:${keyword})[^\\d\\n]{0,25}?(\\d{1,3}(?:[.,]\\d+)?)`, 'giu');
  return [...text.matchAll(re)].map((m) => {
    const end = (m.index ?? 0) + m[0].length;
    return {
      n: Number(m[1].replace(',', '.')),
      scored: SCORE_SUFFIX.test(text.slice(end, end + 12)),
      fragment: text.slice(m.index, end + 7).replace(/\s+/g, ' ').trim(),
    };
  });
}

/** @param {unknown} v @param {Set<number>} [out] */
function numbersOf(v, out = new Set()) {
  if (typeof v === 'number' && Number.isFinite(v)) out.add(v);
  else if (typeof v === 'string') for (const m of v.matchAll(/\d+\.?\d*/g)) out.add(Number(m[0]));
  else if (v && typeof v === 'object') for (const x of Object.values(v)) numbersOf(x, out);
  return out;
}

/**
 * Числа ответа против снимка. Готовность/ЦНС рядом с ключевым словом сверяются со
 * снимком; прочие числа больше 20, которых в снимке нет, — на глаз.
 * @param {any} snapshot снимок, ушедший в запрос (undefined — снимка не было)
 * @param {string} text @param {string} [question]
 * @returns {Verdict[]}
 */
export function checkNumbers(snapshot, text, question = '') {
  /** @type {Verdict[]} */
  const out = [];
  const metrics = [
    { name: 'готовность', kw: READINESS_KW, expected: snapshot ? snapshot.readiness?.index : null },
    { name: 'ЦНС', kw: CNS_KW, expected: snapshot ? snapshot.cns : null },
  ];
  for (const m of metrics) {
    for (const hit of numbersNear(text, m.kw)) {
      const wrong = m.expected == null || Math.abs(hit.n - m.expected) > 1;
      if (!wrong) continue;
      const want = m.expected == null ? 'в снимке числа нет' : `в снимке ${m.expected}`;
      out.push({ level: hit.scored ? 'FAIL' : 'WARN', msg: `числа: ${m.name} — ${want}, в ответе «${hit.fragment}»` });
    }
  }
  const known = numbersOf(snapshot);
  numbersOf(question, known);
  // Разряды «2 580» и «2,580» (\s ловит и неразрывные пробелы), запятая дроби «2,5».
  const plain = text.replace(/(\d)[\s,](?=\d{3}\b)/g, '$1').replace(/(\d),(\d)/g, '$1.$2');
  const stray = [...new Set([...plain.matchAll(/\d+\.?\d*/g)].map((m) => Number(m[0])))]
    .filter((n) => n > 20 && ![...known].some((k) => Math.abs(k - n) <= 1));
  if (stray.length) out.push({ level: 'WARN', msg: `числа: нет в снимке — ${stray.slice(0, 8).join(', ')}` });
  return out.length ? out : [{ level: 'PASS', msg: 'числа: совпадают со снимком' }];
}

const NO_DATA = /нет данных|недостаточно|мало данных|не хватает|not enough|no data|insufficient|unavailable|don't have|do not have/i;

/**
 * @param {EvalCase} c @param {any} snapshot @param {string} text
 * @returns {Verdict[]}
 */
export function judgeChat(c, snapshot, text) {
  if (!text.trim()) return [{ level: 'FAIL', msg: 'ответ пустой' }];
  const lang = c.lang ?? 'ru';
  const verdicts = [
    ...checkLanguage(lang, text, c.lang ? 'FAIL' : 'WARN'),
    ...checkFormat(text),
    ...checkNumbers(snapshot, text, c.question),
  ];
  if (c.noData && !NO_DATA.test(text)) verdicts.push({ level: 'WARN', msg: 'данных нет, а ответ этого не говорит' });
  return verdicts;
}

/**
 * @param {EvalCase} c @param {number} status @param {any} json @param {Array<any>} workouts
 * @returns {Verdict[]}
 */
export function judgeReport(c, status, json, workouts) {
  if (status !== 200 || !json?.report) return [{ level: 'FAIL', msg: `HTTP ${status}, report нет` }];
  const r = json.report;
  /** @type {Verdict[]} */
  const out = [];
  if (c.route === 'weekly') {
    out.push(json.degraded
      ? { level: 'FAIL', msg: 'degraded: модель не ответила или JSON не разобран' }
      : { level: 'PASS', msg: 'ответ модели разобран' });
    const local = Math.min(100, Math.round((workouts.length / 3) * 100));
    out.push({ level: r.score === local ? 'PASS' : 'FAIL', msg: `score ${r.score}, локальная формула ${local}` });
    out.push(...checkLanguage(/** @type {'ru'|'en'} */ (c.lang), [r.summary, ...(r.pros || []), ...(r.cons || [])].join(' ')));
  } else {
    out.push(json.warning
      ? { level: 'FAIL', msg: `модель не ответила: ${json.warning}` }
      : { level: 'PASS', msg: 'модель ответила' });
    const keys = Object.keys(r).sort().join(',');
    out.push({ level: keys === 'injuryRisk,summary' ? 'PASS' : 'FAIL', msg: `ключи report: ${keys}` });
    out.push({ level: ['Low', 'Medium', 'High'].includes(r.injuryRisk) ? 'PASS' : 'FAIL', msg: `injuryRisk: ${r.injuryRisk}` });
    out.push(...(r.summary ? checkLanguage(/** @type {'ru'|'en'} */ (c.lang), r.summary) : [{ level: 'FAIL', msg: 'summary пустой' }]));
  }
  return out;
}

// ── Запуск ────────────────────────────────────────────────────────────────────

const USAGE = 'node scripts/coach-eval.mjs [--live] [--engine=gemini|anthropic] [--case=id1,id2]';

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = { live: false, engine: DEFAULT_AI_ENGINE, ids: /** @type {string[]|null} */ (null), error: '' };
  for (const a of argv) {
    if (a === '--live') opts.live = true;
    else if (a.startsWith('--engine=')) opts.engine = a.slice(9);
    else if (a.startsWith('--case=')) opts.ids = a.slice(7).split(',').filter(Boolean);
    else opts.error = `неизвестный аргумент ${a}`;
  }
  if (!opts.error && !(opts.engine in ENGINE_KEY)) opts.error = `движок ${opts.engine}: только gemini|anthropic`;
  const unknown = (opts.ids || []).filter((id) => !CASES.some((c) => c.id === id));
  if (!opts.error && unknown.length) opts.error = `нет кейса ${unknown.join(', ')}`;
  return opts;
}

/** @param {EvalCase} c @param {(s: string) => void} print */
function printCase(c, i, total, print) {
  const ui = c.lang ? `UI ${c.lang}` : 'без снимка';
  print(`\n── [${i + 1}/${total}] ${c.id} · ${ROUTE_PATH[c.route]} · ${ui}`);
  if (c.question) print(`   вопрос: ${c.question}`);
  if (c.note) print(`   заметка: ${c.note}`);
  for (const k of c.criteria) print(`   критерий: ${k}`);
}

/** @param {any} snapshot @param {(s: string) => void} print */
function printSnapshot(snapshot, print) {
  if (!snapshot) return;
  const r = snapshot.readiness;
  print(`   снимок: готовность ${r.index ?? 'null'} (${r.confidence}), ЦНС ${snapshot.cns}, lang ${snapshot.lang}`);
}

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {EvalCase[]} cases @param {string} engine @param {(s: string) => void} print
 * @returns {Promise<number>}
 */
async function runLive(cases, engine, print) {
  const { default: app } = await import('../server.js');
  /** @type {import('node:http').Server} */
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  const tally = { PASS: 0, WARN: 0, FAIL: 0 };
  try {
    for (const [i, c] of cases.entries()) {
      if (i) await sleep(PACE_MS);
      const now = Date.now();
      const { body, snapshot } = requestFor(c, now, engine);
      printCase(c, i, cases.length, print);
      printSnapshot(snapshot, print);
      const t0 = Date.now();
      /** @type {Verdict[]} */
      let verdicts;
      try {
        const res = await fetch(base + ROUTE_PATH[c.route], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (c.route === 'chat') {
          const raw = await res.text();
          let text = '';
          let error = res.ok ? '' : `HTTP ${res.status}: ${raw.slice(0, 200)}`;
          for (const line of raw.split('\n')) {
            const frame = parseSseDataLine(line);
            if (frame?.text) text += frame.text;
            if (frame?.error) error = frame.error;
          }
          print(`   ответ (${Date.now() - t0} мс):\n${text.trim().slice(0, 1200).replace(/^/gm, '     | ')}`);
          verdicts = error ? [{ level: 'FAIL', msg: `ошибка потока: ${error}` }] : judgeChat(c, snapshot, text);
        } else {
          const json = await res.json().catch(() => null);
          print(`   report (${Date.now() - t0} мс): ${JSON.stringify(json?.report ?? json).slice(0, 1200)}`);
          verdicts = judgeReport(c, res.status, json, body.workouts);
        }
      } catch (err) {
        verdicts = [{ level: 'FAIL', msg: `запрос упал: ${err instanceof Error ? err.message : String(err)}` }];
      }
      for (const v of verdicts) {
        tally[v.level]++;
        print(`   ${v.level.padEnd(4)}  ${v.msg}`);
      }
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
  print(`\nИтог: кейсов ${cases.length} · FAIL ${tally.FAIL} · WARN ${tally.WARN} · PASS ${tally.PASS} · движок ${engine}`);
  print('FAIL — нарушение контракта, видимое пользователю; WARN — прочитать фрагмент глазами.');
  return tally.FAIL ? 1 : 0;
}

/**
 * @param {{ argv?: string[], env?: Record<string, string|undefined>, print?: (s: string) => void }} [io]
 * @returns {Promise<number>} код выхода
 */
export async function main({ argv = process.argv.slice(2), env = process.env, print = console.log } = {}) {
  const opts = parseArgs(argv);
  if (opts.error) {
    print(`coach-eval: ${opts.error}\n${USAGE}`);
    return 2;
  }
  const cases = opts.ids ? CASES.filter((c) => opts.ids?.includes(c.id)) : CASES;

  if (!opts.live) {
    print(`coach-eval — сухой прогон, кейсов ${cases.length}, сети нет. Живой прогон: --live (см. шапку скрипта).`);
    const now = Date.now();
    cases.forEach((c, i) => {
      printCase(c, i, cases.length, print);
      printSnapshot(requestFor(c, now, opts.engine).snapshot, print);
    });
    return 0;
  }

  const keyName = ENGINE_KEY[/** @type {'gemini'|'anthropic'} */ (opts.engine)];
  if (!env[keyName]) {
    print(`coach-eval: для --live с движком ${opts.engine} нужен ${keyName} в env.\n` +
      'Скрипт .env не читает сам: node --env-file=.env scripts/coach-eval.mjs --live');
    return 2;
  }
  print(`coach-eval — живой прогон, кейсов ${cases.length}, движок ${opts.engine}, пауза ${PACE_MS} мс (лимитер 10/мин).`);
  return runLive(cases, opts.engine, print);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => {
    process.exitCode = code;
  });
}
