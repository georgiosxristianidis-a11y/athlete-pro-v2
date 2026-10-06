// @ts-check
// FIELD-2 (поле, Gio): после паузы автопрогресс встречал вернувшегося прежним
// рабочим весом плюс шаг — предложение веса не читало timestamp вообще, и
// двухмесячной давности сессия с взятой целью давала «+2.5». Gio правил вес
// руками прямо в зале.
//
// Контракт: давность последней сессии с упражнением ≥ RETURN_NO_BUMP_DAYS —
// без добавки; ≥ RETURN_REDUCE_DAYS — мягкий возврат на RETURN_FACTOR
// прежнего топ-веса. Любой результат — на сетке упражнения (snapWeight с
// weightStep, см. test/weight-grid.test.js). Моложе порога — побайтно прежнее.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSession, nextWeightFor, weightStep, snapWeight,
  RETURN_NO_BUMP_DAYS, RETURN_REDUCE_DAYS, RETURN_FACTOR, breakReason,
} from '../js/workout.store.js';
import { getNextSessionRecs } from '../js/dashboard.store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 6, 20, 0, 0);

function mockStorage() {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

beforeEach(mockStorage);

const BENCH = { name: 'Bench Press', sets: 3, reps: 8, weight: 0 };
const DB_PRESS = { name: 'Incline DB Press', sets: 3, reps: 10, weight: 0, isUnilateral: true };

/** Одна сессия `daysAgo` дней назад: топ-сет `w`×`reps` при rpe 7 — цель взята. */
function history(name, w, reps, daysAgo, now = NOW) {
  return [{
    type: 'push',
    timestamp: now - daysAgo * DAY,
    exercises: [{
      name,
      sets: [
        { weight: w, reps, rpe: 7, done: true },
        { weight: w, reps, rpe: 7, done: true },
      ],
    }],
  }];
}

test('полевой случай: 56 дней с взятой целью — вес НИЖЕ прежнего, без автобампа', () => {
  const next = nextWeightFor(BENCH, history('Bench Press', 100, 8, 56), NOW);
  assert.ok(next, 'история есть — расчёт обязан быть');
  assert.ok(next.weight < 100, `ждали ниже 100, получили ${next.weight}`);
  assert.equal(next.autoBumped, false);
  assert.equal(next.weight, snapWeight(100 * RETURN_FACTOR, weightStep(BENCH)));
  assert.equal(next.lastWeight, 100);
  assert.deepEqual(next.returnBreak, { mode: 'reduce', days: 56 });
});

test('buildSession: полевой случай доходит до барабана и несёт причину', () => {
  const session = buildSession('push', { workouts: history('Bench Press', 100, 8, 56), now: NOW });
  const bench = session.find((e) => e.name === 'Bench Press');
  assert.ok(bench, 'Bench Press есть в сид-плане');
  assert.equal(bench.autoBumped, false);
  assert.equal(bench.sets[0].weight, 80);
  assert.deepEqual(bench.returnBreak, { mode: 'reduce', days: 56 });
});

test('давность 28-41 день — вес равен прежнему, без добавки', () => {
  for (const days of [RETURN_NO_BUMP_DAYS, 35, RETURN_REDUCE_DAYS - 1]) {
    const next = nextWeightFor(BENCH, history('Bench Press', 100, 8, days), NOW);
    assert.equal(next?.weight, 100, `${days} дн.`);
    assert.equal(next?.autoBumped, false, `${days} дн.`);
    assert.deepEqual(next?.returnBreak, { mode: 'hold', days }, `${days} дн.`);
  }
});

test('моложе 28 дней — поведение прежнее: бамп работает, поле причины не появляется', () => {
  for (const days of [1, 10, RETURN_NO_BUMP_DAYS - 1]) {
    const next = nextWeightFor(BENCH, history('Bench Press', 100, 8, days), NOW);
    assert.deepEqual(next, { weight: 102.5, autoBumped: true, lastWeight: 100 }, `${days} дн.`);
  }
  const session = buildSession('push', { workouts: history('Bench Press', 100, 8, 3), now: NOW });
  const bench = session.find((e) => e.name === 'Bench Press');
  assert.equal(bench?.autoBumped, true);
  assert.equal(bench?.sets[0].weight, 102.5);
  assert.equal('returnBreak' in (bench || {}), false);
});

test('без timestamp давность неизвестна — прежнее поведение', () => {
  const [w] = history('Bench Press', 100, 8, 0);
  delete w.timestamp;
  const next = nextWeightFor(BENCH, [w], NOW);
  assert.deepEqual(next, { weight: 102.5, autoBumped: true, lastWeight: 100 });
});

test('сетка: любой результат после паузы лежит на шаге упражнения', () => {
  const cases = [
    [BENCH, 'Bench Press', [100, 97.5, 61, 20, 2.5]],
    [DB_PRESS, 'Incline DB Press', [31, 24, 22, 9, 2]],
  ];
  for (const [ex, name, weights] of cases) {
    const step = weightStep(ex);
    for (const w of weights) {
      for (const days of [RETURN_NO_BUMP_DAYS, RETURN_REDUCE_DAYS, 120]) {
        const next = nextWeightFor(ex, history(name, w, 1, days), NOW);
        assert.ok(next, `${name} ${w} ${days}`);
        assert.equal(next.weight, snapWeight(next.weight, step), `вне сетки: ${name} ${w} кг, ${days} дн. → ${next.weight}`);
        assert.ok(next.weight >= step, `ниже одного шага: ${next.weight}`);
        assert.ok(next.weight <= snapWeight(w, step), `выше прежнего: ${w} → ${next.weight}`);
      }
    }
  }
});

test('гантели: мягкий возврат на сетке 2 кг', () => {
  const next = nextWeightFor(DB_PRESS, history('Incline DB Press', 30, 10, 60), NOW);
  assert.equal(next?.weight, 24);
  assert.equal(next?.autoBumped, false);
});

test('Home: после паузы рекомендации не показывают «добавь шаг»', () => {
  const plan = { push: [BENCH] };
  const now = Date.now();
  for (const days of [RETURN_NO_BUMP_DAYS, 56]) {
    assert.deepEqual(getNextSessionRecs(history('Bench Press', 100, 8, days, now), 'push', plan), [], `${days} дн.`);
  }
  assert.deepEqual(
    getNextSessionRecs(history('Bench Press', 100, 8, 2, now), 'push', plan),
    [{ name: 'Bench Press', from: 100, to: 102.5 }],
  );
});

/** Строка ключа из блока DICT.<lang> исходника локали. */
function dictLine(lang, key) {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'locale.store.js'), 'utf8');
  const start = src.indexOf(`\n  ${lang}: {`);
  const end = src.indexOf('\n  }', start);
  const body = src.slice(start, end);
  const m = body.match(new RegExp(`'${key.replace('.', '\\.')}':\\s*'([^']*)'`));
  assert.ok(m, `ключ ${key} не найден в DICT.${lang}`);
  return m[1];
}

test('причина словами: ru и en, пороги различимы, процент из константы, без обвинения', () => {
  const hold = breakReason({ mode: 'hold', days: 30 });
  const reduce = breakReason({ mode: 'reduce', days: 56 });
  assert.notEqual(hold.key, reduce.key);
  assert.equal(reduce.params.weeks, 8);
  assert.equal(reduce.params.pct, Math.round(RETURN_FACTOR * 100));
  for (const lang of ['ru', 'en']) {
    const h = dictLine(lang, hold.key);
    const r = dictLine(lang, reduce.key);
    assert.notEqual(h, r, `${lang}: формулировки порогов совпали`);
    assert.match(h, /\{weeks\}/);
    assert.match(r, /\{weeks\}/);
    assert.match(r, /\{pct\}/, `${lang}: процент обязан идти из константы`);
    assert.doesNotMatch(r + h, /\d+\s*%/, `${lang}: процент вшит в строку`);
    assert.doesNotMatch(r + h, /не трен|пропуст|забросил|didn.t train|skipped|missed|lazy/i, `${lang}: обвинение`);
  }
});
