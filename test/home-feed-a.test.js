// @ts-check
/**
 * HOME-2 вариант A (флаг home-feed-a): Главная — «Сегодня» + «Эта неделя» + CTA.
 * DOM-библиотеки в сюите нет — скрытие легаси-блоков проверяем по контракту
 * шаблона и CSS: при ON видны только .dash-feed, всё остальное прячет правило
 * #s-home.home-feed-a > :not(.dash-feed). Данные «Сегодня» — чистый getTodayPreview.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTodayPreview } from '../js/dashboard.store.js';
import { PPL_GIO_PLAN } from '../js/workout.store.js';
import { LAB_FLAGS, allFlags } from '../js/flags.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

beforeEach(() => {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
});

const DAY = 86400000;
const sets = (weight, reps) => [1, 2, 3].map(() => ({ weight, reps, done: true }));

test('флаг OFF по умолчанию и выведен в Лабораторию', () => {
  assert.equal(allFlags()['home-feed-a'], false);
  assert.ok(LAB_FLAGS.includes('home-feed-a'));
});

test('CSS при ON прячет всё, кроме .dash-feed', () => {
  const css = read('css/dashboard.css');
  assert.match(css, /#s-home\.home-feed-a\s*>\s*:not\(\.dash-feed\)\s*\{\s*display:\s*none;/);
});

test('шаблон: при ON ровно три .dash-feed — Сегодня, неделя (вход в сводку), CTA', () => {
  const js = read('js/dashboard.js');
  const feedBlocks = js.match(/class="(?:[^"]* )?dash-feed(?: [^"]*)?"/g) || [];
  assert.deepEqual(
    feedBlocks.map((c) => c.match(/dash-today|streak-card|dash-feed-cta/)?.[0]),
    ['dash-today', 'dash-feed-cta', 'streak-card']
  );
  assert.match(js, /streak-card dash-feed[^']*data-action="dash:weeklySummary"/);
  // Легаси-блоки не удалены (Strangler-Fig).
  for (const id of ['dash-vol-week', 'spark-container', 'ppl-gauge-home', 'dash-orm-list', 'recent-list']) {
    assert.ok(js.includes(`id="${id}"`), `легаси-блок ${id} пропал из шаблона`);
  }
});

test('Сегодня: два силовых с историей, вес и шаг как у Train', () => {
  const workouts = [
    {
      type: 'legs',
      timestamp: Date.now() - DAY,
      exercises: [],
    },
    {
      type: 'push',
      timestamp: Date.now() - 3 * DAY,
      exercises: [
        { name: 'Bench Press', sets: sets(72.5, 8) },
        { name: 'Incline DB Press', sets: sets(26, 8) }, // недобор 8 из 10 — вес держим
        { name: 'Butterfly Machine', sets: sets(40, 12) },
      ],
    },
  ];
  const r = getTodayPreview(workouts, 'push', PPL_GIO_PLAN.weekA);
  assert.equal(r.total, PPL_GIO_PLAN.weekA.push.length);
  assert.deepEqual(
    r.items.map((x) => [x.name, x.weight, x.last, x.step]),
    [
      ['Bench Press', 75, 72.5, 2.5],
      ['Incline DB Press', 26, 26, 0],
    ]
  );
});

test('Сегодня без истории: первые силовые плана без веса, вес тела и кор мимо', () => {
  const r = getTodayPreview([], 'pull', PPL_GIO_PLAN.weekA);
  assert.equal(r.items.length, 2);
  for (const x of r.items) {
    assert.equal(x.weight, null);
    const ex = PPL_GIO_PLAN.weekA.pull.find((e) => e.name === x.name);
    assert.ok(ex && !ex.isBW && !ex.noDb, `${x.name} — вес тела/кор`);
  }
});
