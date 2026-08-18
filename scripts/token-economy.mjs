#!/usr/bin/env node
/**
 * token-economy.mjs — цена работы агентов над проектом, в токенах и list-эквиваленте.
 *
 * Зачем: правила «1 сессия = 1 задача», «тихий терминал», «делегируй грязную работу»
 * до сих пор проверялись на глаз. Здесь они получают число. Карточка, которая
 * обещает сократить расход, обязана показать дельту этим скриптом — до и после.
 *
 * Число вызовов инструмента ≠ объём его вывода: Bash частый и тихий, Read редкий
 * и тяжёлый (см. HANDOFF_token_economy.md § «Труба — это Read, не Bash»). Поэтому
 * инструменты считаются в двух осях — по числу вызовов и по байтам tool_result —
 * и $/вызов печатается прямо в выводе, а не считается вручную по таблице.
 *
 * Источник — транскрипты Claude Code: ~/.claude/projects/<slug>/*.jsonl.
 * Каждая строка-ответ ассистента несёт `message.usage` с четырьмя счётчиками,
 * и это единственная запись расхода, которая не зависит от нашей памяти о сессии.
 *
 *   npm run tokens                 # весь период
 *   npm run tokens -- --days 14    # окно
 *   npm run tokens -- --json       # машинный вывод
 *
 * Деньги здесь — НЕ счёт (подписка списывает иначе), а list-цена по прайсу
 * Anthropic: единая линейка, чтобы операции можно было сравнивать между собой.
 */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

// $/1M токенов, list price. Cache write × 1.25, cache read × 0.1 — множители Anthropic.
const PRICE = {
  fable: [10, 50],
  opus: [5, 25],
  sonnet: [3, 15],
  haiku: [1, 5],
};
const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT = 0.1;
const DEFAULT_FALLBACK = 'sonnet';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const daysArg = Number((argv.find((a) => a.startsWith('--days')) || '').split(/[= ]/)[1] || argv[argv.indexOf('--days') + 1]);
const windowDays = Number.isFinite(daysArg) && daysArg > 0 ? daysArg : null;
const since = windowDays ? Date.now() - windowDays * 864e5 : null;

/** Slug каталога транскриптов: Claude Code кодирует путь проекта, заменяя разделители на `-`. */
function projectSlug() {
  // Из worktree поднимаемся к имени самого проекта: .../athlete-pro/.claude/worktrees/<wt>
  const parts = path.resolve(process.cwd()).split(path.sep).filter(Boolean);
  const i = parts.lastIndexOf('.claude');
  if (i > 0 && parts[i + 1] === 'worktrees') return parts[i - 1];
  return parts[parts.length - 1] || 'unknown';
}

function priceOf(model = '') {
  const m = model.toLowerCase();
  for (const key of Object.keys(PRICE)) if (m.includes(key)) return PRICE[key];
  return PRICE[DEFAULT_FALLBACK];
}

const empty = () => ({ in: 0, cw: 0, cr: 0, out: 0, calls: 0, cost: 0 });
function slot(map, key) {
  if (!map.has(key)) map.set(key, empty());
  return map.get(key);
}

/** Размер результата инструмента в байтах UTF-8: строка целиком, либо сумма text-блоков. */
function bytesOf(content) {
  if (typeof content === 'string') return Buffer.byteLength(content, 'utf8');
  if (Array.isArray(content)) {
    return content.reduce((s, c) => s + Buffer.byteLength(typeof c.text === 'string' ? c.text : JSON.stringify(c), 'utf8'), 0);
  }
  return Buffer.byteLength(JSON.stringify(content ?? ''), 'utf8');
}

async function collect(root, slug) {
  let dirs;
  try {
    dirs = fs.readdirSync(root).filter((d) => d.toLowerCase().includes(slug.toLowerCase()));
  } catch {
    return null;
  }
  const byDay = new Map();
  const bySession = new Map();
  const byModel = new Map();
  const tools = new Map();
  const toolBytes = new Map(); // name -> { calls, bytes } — объём РЕЗУЛЬТАТОВ, не число вызовов
  let files = 0;

  for (const d of dirs) {
    const dir = path.join(root, d);
    let list;
    try {
      list = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of list) {
      files++;
      const sid = f.slice(0, -6);
      const pendingToolUse = new Map(); // tool_use_id -> имя, живёт в пределах файла
      const rl = readline.createInterface({
        input: fs.createReadStream(path.join(dir, f)),
        crlfDelay: Infinity,
      });
      for await (const line of rl) {
        if (!line) continue;
        let o;
        try {
          o = JSON.parse(line);
        } catch {
          continue; // недописанная строка живой сессии — не повод падать
        }
        const msg = o.message;
        if (!msg) continue;
        const at = o.timestamp ? Date.parse(o.timestamp) : NaN;
        if (since && Number.isFinite(at) && at < since) continue;

        if (Array.isArray(msg.content)) {
          for (const c of msg.content) {
            if (c && c.type === 'tool_use' && c.name) {
              tools.set(c.name, (tools.get(c.name) || 0) + 1);
              if (c.id) pendingToolUse.set(c.id, c.name);
            }
            if (c && c.type === 'tool_result' && c.tool_use_id) {
              const name = pendingToolUse.get(c.tool_use_id) || 'unknown';
              if (!toolBytes.has(name)) toolBytes.set(name, { calls: 0, bytes: 0 });
              const e = toolBytes.get(name);
              e.calls++;
              e.bytes += bytesOf(c.content);
            }
          }
        }
        const u = msg.usage;
        if (!u || o.type !== 'assistant') continue;

        const [pIn, pOut] = priceOf(msg.model);
        const i = u.input_tokens || 0;
        const cw = u.cache_creation_input_tokens || 0;
        const cr = u.cache_read_input_tokens || 0;
        const out = u.output_tokens || 0;
        const cost = (i * pIn + cw * pIn * CACHE_WRITE_MULT + cr * pIn * CACHE_READ_MULT + out * pOut) / 1e6;

        const day = o.timestamp ? o.timestamp.slice(0, 10) : 'unknown';
        for (const [map, key] of [[byDay, day], [bySession, sid], [byModel, msg.model || 'unknown']]) {
          const e = slot(map, key);
          e.in += i; e.cw += cw; e.cr += cr; e.out += out; e.calls++; e.cost += cost;
        }
        const s = bySession.get(sid);
        s.dir = d;
        s.first = s.first ?? at;
        s.last = at;
      }
    }
  }
  return { dirs: dirs.length, files, byDay, bySession, byModel, tools, toolBytes };
}

const n = (x) => Math.round(x).toLocaleString('en-US');
const pct = (x, of) => (of ? ((x / of) * 100).toFixed(1) : '0.0') + '%';

function report(data) {
  const tot = empty();
  for (const e of data.byDay.values()) {
    tot.in += e.in; tot.cw += e.cw; tot.cr += e.cr; tot.out += e.out; tot.calls += e.calls; tot.cost += e.cost;
  }
  const tokens = tot.in + tot.cw + tot.cr + tot.out;
  if (!tot.calls) {
    console.log('Транскриптов за окно не найдено. Проверь ~/.claude/projects и флаг --days.');
    return;
  }

  // Доли стоимости считаем во «входных эквивалентах»: множители те же, что в биллинге.
  const parts = { read: tot.cr * CACHE_READ_MULT, write: tot.cw * CACHE_WRITE_MULT, out: tot.out * 5, input: tot.in };
  const partsSum = parts.read + parts.write + parts.out + parts.input;

  console.log(`\n=== ФОРМА РАСХОДА ===${windowDays ? `  (окно ${windowDays} дн)` : ''}`);
  console.log(`  токенов всего      ${n(tokens)}`);
  console.log(`  list-эквивалент    $${tot.cost.toFixed(0)}`);
  console.log(`  API-вызовов        ${n(tot.calls)}`);
  console.log(`  $/вызов            $${(tot.cost / tot.calls).toFixed(4)}`);
  console.log(`  контекст на вызов  ${n(tokens / tot.calls)}   <- главный рычаг`);
  console.log(`  выход на вызов     ${n(tot.out / tot.calls)}`);
  console.log(`  вход:выход         ${(((tot.in + tot.cw + tot.cr) / (tot.out || 1))).toFixed(0)}:1`);
  console.log(`  cache hit ratio    ${pct(tot.cr, tot.cr + tot.cw + tot.in)}`);

  console.log('\n=== ГДЕ ДЕНЬГИ ===');
  console.log(`  cache READ    ${pct(parts.read, partsSum).padStart(6)}  ${n(tot.cr)} ток`);
  console.log(`  cache WRITE   ${pct(parts.write, partsSum).padStart(6)}  ${n(tot.cw)} ток  <- перезапись префикса`);
  console.log(`  output        ${pct(parts.out, partsSum).padStart(6)}  ${n(tot.out)} ток`);
  console.log(`  uncached in   ${pct(parts.input, partsSum).padStart(6)}  ${n(tot.in)} ток`);

  const ses = [...data.bySession.values()].map((e) => ({
    ...e,
    tok: e.in + e.cw + e.cr + e.out,
    hrs: Number.isFinite(e.first) && Number.isFinite(e.last) ? (e.last - e.first) / 36e5 : 0,
  }));
  const costs = ses.map((s) => s.cost).sort((a, b) => a - b);
  const byCost = [...ses].sort((a, b) => b.cost - a.cost);
  const top10 = byCost.slice(0, Math.ceil(ses.length * 0.1));
  console.log('\n=== СЕССИИ ===');
  console.log(`  всего ${ses.length} | медиана $${(costs[costs.length >> 1] || 0).toFixed(2)} | среднее $${(tot.cost / ses.length).toFixed(2)}`);
  console.log(`  топ-10% сессий несут ${pct(top10.reduce((s, x) => s + x.cost, 0), tot.cost)} стоимости`);
  console.log('\n  по длительности:');
  for (const [lo, hi] of [[0, 1], [1, 4], [4, 12], [12, 24], [24, Infinity]]) {
    const g = ses.filter((s) => s.hrs >= lo && s.hrs < hi);
    if (!g.length) continue;
    const c = g.reduce((s, x) => s + x.cost, 0);
    const label = `${lo}-${hi === Infinity ? '∞' : hi}ч`;
    // Часы здесь астрономические: сессия >24ч — это открытая вкладка, а не сутки работы
    // (активной работы в них ~7%). Ярлык «марафон» приписывал времени то, что тянет
    // число вызовов — см. HANDOFF_token_economy.md § Опровергнуто перепроверкой.
    const flag = lo >= 24 ? '  <- открыто дольше суток (не «работал сутки»)' : '';
    const calls = g.reduce((s, x) => s + x.calls, 0);
    console.log(`    ${label.padEnd(7)} ${String(g.length).padStart(4)} сес  $${c.toFixed(0).padStart(5)}  ${pct(c, tot.cost).padStart(6)}  ср.вызовов ${Math.round(calls / g.length)}  $/вызов ${(c / calls).toFixed(4)}${flag}`);
  }

  const oneShot = new Map();
  for (const s of ses) oneShot.set(s.dir, (oneShot.get(s.dir) || 0) + 1);
  const single = [...oneShot].filter(([, c]) => c === 1).map(([d]) => d);
  const singleCost = ses.filter((s) => single.includes(s.dir)).reduce((s, x) => s + x.cost, 0);
  // «Цена холодного старта» была объяснением, а не замером: причинность не доказана.
  // Печатаем факт, гипотезу оставляем хендоффу.
  console.log(`\n  ворктри: ${oneShot.size} | одноразовых ${single.length} (${pct(single.length, oneShot.size)}) на $${singleCost.toFixed(0)}`);

  console.log('\n=== МОДЕЛИ ===');
  for (const [m, e] of [...data.byModel].sort((a, b) => b[1].cost - a[1].cost)) {
    console.log(`  ${m.padEnd(24)} $${e.cost.toFixed(0).padStart(5)}  ${String(e.calls).padStart(6)} выз  $/вызов ${(e.cost / e.calls).toFixed(4)}`);
  }

  const toolList = [...data.tools].sort((a, b) => b[1] - a[1]);
  const toolTotal = toolList.reduce((s, [, c]) => s + c, 0);
  console.log('\n=== ИНСТРУМЕНТЫ (топ-8 по числу вызовов) ===');
  for (const [name, c] of toolList.slice(0, 8)) {
    console.log(`  ${name.padEnd(26)} ${String(c).padStart(6)}  ${pct(c, toolTotal).padStart(6)}`);
  }
  console.log(`  всего ${n(toolTotal)} | на сессию ${Math.round(toolTotal / ses.length)}`);

  // Число вызовов и объём результатов — разные оси: Bash частый и тихий, Read редкий и тяжёлый.
  const byteList = [...data.toolBytes].sort((a, b) => b[1].bytes - a[1].bytes);
  const byteTotal = byteList.reduce((s, [, e]) => s + e.bytes, 0);
  console.log('\n=== ИНСТРУМЕНТЫ (топ-8 по байтам результата) ===');
  for (const [name, e] of byteList.slice(0, 8)) {
    console.log(`  ${name.padEnd(26)} ${(e.bytes / 1e6).toFixed(2).padStart(7)} МБ  ${pct(e.bytes, byteTotal).padStart(6)}  ${n(e.bytes / (e.calls || 1))} байт/выз`);
  }
  console.log(`  всего ${(byteTotal / 1e6).toFixed(1)} МБ`);

  const days = [...data.byDay.keys()].filter((d) => d !== 'unknown').length;
  if (days) console.log(`\nАктивных дней ${days} | средний день $${(tot.cost / days).toFixed(0)}\n`);
}

const root = path.join(os.homedir(), '.claude', 'projects');
const slug = projectSlug();
const data = await collect(root, slug);

if (!data) {
  console.log(`Каталог транскриптов не найден: ${root}`);
  process.exit(0); // не гейт — отсутствие данных не должно ронять чужой пайплайн
}
if (asJson) {
  const plain = (m) => Object.fromEntries(m);
  console.log(JSON.stringify({
    slug, dirs: data.dirs, files: data.files,
    byDay: plain(data.byDay), bySession: plain(data.bySession),
    byModel: plain(data.byModel), tools: plain(data.tools),
    toolBytes: plain(data.toolBytes),
  }));
} else {
  console.log(`Проект: ${slug} | каталогов ${data.dirs} | транскриптов ${data.files}`);
  report(data);
}
