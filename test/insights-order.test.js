/**
 * CORE-4 (сопутствующий) — порядок записей в insights.engine.
 *
 * `DB.Workouts.getAll()` отдаёт записи NEWEST FIRST (`js/db/workouts.js`,
 * `list.reverse()`). Движок читал их как «по возрастанию»: «последняя сессия»
 * для 'Streak paused' была самой старой, а правило '5 sessions in <5 days'
 * брало `slice(-5)` (самые старые 5) и считало span как last − first — при
 * порядке newest-first это отрицательное число, то есть правило срабатывало
 * у КАЖДОГО, у кого ≥5 тренировок. Инсайты уезжают в снимок для коуча
 * (top-3), поэтому ошибка доезжала до модели.
 *
 * Тест гоняет реальный generateInsights() на подменённом DB — вход в порядке
 * контракта стора, плюс проверка, что результат не зависит от порядка входа.
 */
import { describe, test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { DB } from '../js/db.js';
import { generateInsights } from '../js/insights.engine.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

const w = (daysAgo, type = 'push') => ({ id: `w${daysAgo}`, type, timestamp: NOW - daysAgo * DAY });

const newestFirst = (list) => [...list].sort((a, b) => b.timestamp - a.timestamp);
const oldestFirst = (list) => [...list].sort((a, b) => a.timestamp - b.timestamp);

/** Подменяет чтение стора: `workouts` отдаётся в том порядке, что передан. */
function stubDb(workouts) {
  mock.method(DB.Workouts, 'getAll', async () => workouts);
  mock.method(DB.OneRM, 'getAll', async () => []);
  mock.method(DB.Metrics, 'getAll', async () => []);
  mock.method(DB.Settings, 'getAll', async () => ({}));
}

const byTitle = (insights, re) => insights.find((i) => re.test(i.title));

beforeEach(() => {
  mock.method(Date, 'now', () => NOW);
});
afterEach(() => {
  mock.restoreAll();
});

describe('Streak paused — «последняя сессия» это самая свежая', () => {
  // Свежая 5 дн. назад, старые — 30 и 40. Streak = 0, lastDays должно быть 5.
  const set = [w(5), w(30), w(40)];

  test('вход newest-first (контракт DB.Workouts.getAll)', async () => {
    stubDb(newestFirst(set));
    const paused = byTitle(await generateInsights(), /Streak paused/);
    assert.ok(paused, 'инсайт должен быть');
    assert.match(paused.body, /^5 days since/, 'считать от самой свежей, не от самой старой (40)');
  });

  test('порядок входа не важен', async () => {
    stubDb(oldestFirst(set));
    const paused = byTitle(await generateInsights(), /Streak paused/);
    assert.match(paused.body, /^5 days since/);
  });

  test('свежая сессия 2 дня назад — паузы нет, даже если хвост истории древний', async () => {
    stubDb(newestFirst([w(2), w(60), w(90)]));
    assert.equal(byTitle(await generateInsights(), /Streak paused/), undefined);
  });
});

describe("Rest reminder — '5 sessions in <5 days'", () => {
  // Свежие 5 уложены в 3.5 дня, за ними — три древние сессии.
  const burst = [w(0.5), w(1), w(2), w(3), w(4), w(60), w(61), w(62)];

  test('пять свежих сессий за <5 дней — срабатывает', async () => {
    stubDb(newestFirst(burst));
    assert.ok(byTitle(await generateInsights(), /5 sessions in <5 days/));
  });

  test('порядок входа не важен', async () => {
    stubDb(oldestFirst(burst));
    assert.ok(byTitle(await generateInsights(), /5 sessions in <5 days/));
  });

  test('свежие 5 растянуты на 12 дней, а старые 5 сбиты в кучу — НЕ срабатывает', async () => {
    const spread = [w(0), w(3), w(6), w(9), w(12), w(90), w(90.5), w(91), w(91.5), w(92)];
    stubDb(newestFirst(spread));
    assert.equal(byTitle(await generateInsights(), /5 sessions in <5 days/), undefined);
  });

  test('ровно 5 сессий, размазанных на 20 дней — НЕ срабатывает (span не отрицательный)', async () => {
    stubDb(newestFirst([w(0), w(5), w(10), w(15), w(20)]));
    assert.equal(byTitle(await generateInsights(), /5 sessions in <5 days/), undefined);
  });

  test('меньше 5 сессий — правило молчит', async () => {
    stubDb(newestFirst([w(0.5), w(1), w(2), w(3)]));
    assert.equal(byTitle(await generateInsights(), /5 sessions in <5 days/), undefined);
  });
});
