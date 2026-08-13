/**
 * INTEL-2 — движок индекса готовности.
 *
 * Гейт на две вещи: (1) слагаемые считаются по своим формулам и на
 * граничных значениях не «уезжают», (2) индекс детерминирован и честно
 * молчит при нехватке данных вместо того, чтобы выдать 0 (ноль читается
 * как «ты в яме», а не как «данных нет» — это и был режим до INTEL-2,
 * когда числа виджета приезжали из ответа LLM).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WEIGHTS, CNS, WINDOWS,
  sessionLoad, loadInWindow, dailyLoads,
  acwr, acwrScore,
  bestE1RM, isCnsHeavy, recovery, cnsLoad,
  monotony, monotonyScore, strain,
  trend, trendScore,
  readiness,
} from '../js/intel.engine.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 7, 13, 12, 0, 0);

/** Тренировка с готовым тоннажем — обычный путь (поле пишет workout.store). */
function w(daysAgo, tonnage, extra = {}) {
  return { id: daysAgo, type: 'push', timestamp: NOW - daysAgo * DAY, duration: 3600000, tonnage, exercises: [], ...extra };
}

/** Тренировка с подходами — путь ЦНС (нужны вес и повторы). */
function wSets(daysAgo, sets, name = 'Bench Press') {
  return {
    id: 1000 + daysAgo,
    type: 'push',
    timestamp: NOW - daysAgo * DAY,
    duration: 3600000,
    tonnage: sets.reduce((s, x) => s + x.weight * x.reps, 0),
    exercises: [{ name, sets: sets.map(s => ({ done: true, ...s })) }],
  };
}

describe('sessionLoad', () => {
  test('берёт готовый tonnage', () => {
    assert.equal(sessionLoad(w(0, 5000)), 5000);
  });

  test('считает по подходам, когда tonnage отсутствует (старый бэкап)', () => {
    const rec = { exercises: [{ name: 'Squat', sets: [{ weight: 100, reps: 5, done: true }, { weight: 100, reps: 5, done: true }] }] };
    assert.equal(sessionLoad(rec), 1000);
  });

  test('незакрытые подходы в нагрузку не идут', () => {
    const rec = { exercises: [{ name: 'Squat', sets: [{ weight: 100, reps: 5, done: true }, { weight: 100, reps: 5, done: false }] }] };
    assert.equal(sessionLoad(rec), 500);
  });

  test('пустая запись даёт 0, а не NaN', () => {
    assert.equal(sessionLoad({}), 0);
  });
});

describe('loadInWindow', () => {
  const list = [w(0, 100), w(3, 200), w(8, 400), w(20, 800)];

  test('семидневное окно берёт только своих', () => {
    assert.equal(loadInWindow(list, NOW, 7), 300);
  });

  test('28-дневное окно берёт всех', () => {
    assert.equal(loadInWindow(list, NOW, 28), 1500);
  });

  test('сдвиг окна даёт предыдущую неделю', () => {
    assert.equal(loadInWindow(list, NOW, 7, 7), 400);
  });

  test('будущие записи игнорируются', () => {
    assert.equal(loadInWindow([w(-2, 999)], NOW, 7), 0);
  });
});

describe('dailyLoads', () => {
  test('возвращает ровно N корзин, включая нулевые дни', () => {
    const loads = dailyLoads([w(0, 100), w(2, 300)], NOW, 7);
    assert.equal(loads.length, 7);
    assert.deepEqual(loads, [0, 0, 0, 0, 300, 0, 100]);
  });

  test('две сессии в одни сутки складываются', () => {
    const loads = dailyLoads([w(0, 100), { ...w(0, 50), timestamp: NOW - 5 * HOUR }], NOW, 7);
    assert.equal(loads[6], 150);
  });
});

describe('ACWR', () => {
  test('пустая история — null, а не деление на ноль', () => {
    assert.equal(acwr([], NOW), null);
  });

  test('ровная нагрузка каждую неделю даёт 1.0', () => {
    const list = [];
    for (let d = 0; d < 28; d += 7) list.push(w(d, 1000));
    assert.equal(acwr(list, NOW), 1);
  });

  test('удвоенная неделя даёт ~1.7', () => {
    const list = [w(0, 2000), w(7, 1000), w(14, 1000), w(21, 1000)];
    assert.ok(Math.abs(acwr(list, NOW) - 1.6) < 0.05, `acwr=${acwr(list, NOW)}`);
  });

  test('sweet spot 0.8–1.3 — плато 100', () => {
    assert.equal(acwrScore(0.8), 100);
    assert.equal(acwrScore(1.0), 100);
    assert.equal(acwrScore(1.3), 100);
  });

  test('перегруз наказывается сильнее недогруза на равном удалении от плато', () => {
    assert.ok(acwrScore(1.8) < acwrScore(0.3), 'ACWR 1.8 должен быть хуже, чем 0.3');
  });

  test('края шкалы не выходят за 0–100', () => {
    assert.equal(acwrScore(3), 0);
    assert.equal(acwrScore(0), 40);
    assert.equal(acwrScore(null), null);
  });
});

describe('ЦНС', () => {
  const heavy = wSets(1, [{ weight: 100, reps: 5 }, { weight: 115, reps: 1 }]);
  const light = wSets(1, [{ weight: 60, reps: 10 }]);

  test('лучший расчётный 1ПМ берётся из истории', () => {
    const best = bestE1RM([heavy]);
    assert.equal(best.get('bench press'), 117); // Epley: 100×(1+5/30)=117 > 115
  });

  test('подход на ≥85% лучшего 1ПМ помечает сессию как тяжёлую для ЦНС', () => {
    const best = bestE1RM([heavy]);
    assert.equal(isCnsHeavy(heavy, best), true);
  });

  test('лёгкая сессия ЦНС не грузит', () => {
    const best = bestE1RM([heavy, light]);
    assert.equal(isCnsHeavy(light, best), false);
  });

  test('порог именно 85%, а не «около»', () => {
    const best = new Map([['bench press', 100]]);
    assert.equal(isCnsHeavy(wSets(0, [{ weight: 85, reps: 1 }]), best), true);
    assert.equal(isCnsHeavy(wSets(0, [{ weight: 84, reps: 1 }]), best), false);
  });

  test('нагрузка ЦНС гаснет за 72 часа', () => {
    const list = [wSets(0, [{ weight: 100, reps: 5 }, { weight: 115, reps: 1 }])];
    assert.equal(cnsLoad(list, NOW), 100);
    assert.equal(cnsLoad(list, NOW + 36 * HOUR), 50);
    assert.equal(cnsLoad(list, NOW + CNS.hours * HOUR), 0);
  });
});

describe('восстановление', () => {
  test('без истории — null и никакого 0', () => {
    assert.equal(recovery([], NOW).score, null);
  });

  test('обычной сессии нужно 48 часов', () => {
    const r = recovery([wSets(0, [{ weight: 60, reps: 10 }])], NOW + 24 * HOUR);
    assert.equal(r.needHours, CNS.baseHours);
    assert.equal(r.score, 50);
  });

  test('после тяжёлой для ЦНС окно растягивается до 72 часов', () => {
    const heavy = wSets(0, [{ weight: 100, reps: 5 }, { weight: 115, reps: 1 }]);
    const r = recovery([heavy], NOW + 36 * HOUR);
    assert.equal(r.needHours, CNS.hours);
    assert.equal(r.cnsHeavy, true);
    assert.equal(r.score, 50);
  });

  test('давняя тренировка — 100, а не больше', () => {
    assert.equal(recovery([w(10, 5000)], NOW).score, 100);
  });
});

describe('монотонность (Foster)', () => {
  test('неделя без нагрузки — null', () => {
    assert.equal(monotony([w(20, 5000)], NOW), null);
  });

  test('семь одинаковых дней упираются в потолок шкалы, а не в бесконечность', () => {
    const list = [];
    for (let d = 0; d < 7; d++) list.push(w(d, 1000));
    assert.equal(monotony(list, NOW), 99);
    assert.equal(monotonyScore(monotony(list, NOW)), 0);
  });

  test('три тренировки и четыре дня отдыха дают безопасную монотонность', () => {
    const list = [w(0, 1000), w(2, 1400), w(4, 800)];
    const m = monotony(list, NOW);
    assert.ok(m < 1.5, `monotony=${m}`);
    assert.equal(monotonyScore(m), 100);
  });

  test('красная зона Foster (2.5) — ноль баллов', () => {
    assert.equal(monotonyScore(2.5), 0);
    assert.equal(monotonyScore(2.0), 50);
    assert.equal(monotonyScore(null), null);
  });

  test('strain = недельная нагрузка × монотонность', () => {
    const list = [w(0, 1000), w(2, 1400), w(4, 800)];
    assert.equal(Math.round(strain(list, NOW)), Math.round(3200 * monotony(list, NOW)));
  });
});

describe('тренд', () => {
  test('без прошлой недели — null', () => {
    assert.equal(trend([w(0, 1000)], NOW), null);
  });

  test('+5% к прошлой неделе', () => {
    const t = trend([w(1, 1050), w(8, 1000)], NOW);
    assert.ok(Math.abs(t - 0.05) < 1e-9, `trend=${t}`);
  });

  test('умеренный рост — 100, обвал и скачок — плохо', () => {
    assert.equal(trendScore(0.05), 100);
    assert.ok(trendScore(-0.35) < 15, 'обвал на треть должен быть красным');
    assert.ok(trendScore(0.45) < 15, 'скачок в полтора раза должен быть красным');
    assert.equal(trendScore(null), null);
  });
});

describe('индекс готовности', () => {
  test('пустая история: index null, confidence none — а не 0', () => {
    const r = readiness([], { now: NOW });
    assert.equal(r.index, null);
    assert.equal(r.confidence, 'none');
    assert.equal(r.cns, 0);
  });

  test('детерминирован: тот же вход — то же число', () => {
    const list = [w(0, 1000), w(2, 1200), w(4, 900), w(9, 1100), w(16, 1000), w(23, 1000)];
    const a = readiness(list, { now: NOW });
    const b = readiness(list, { now: NOW });
    assert.equal(a.index, b.index);
    assert.deepEqual(a.parts, b.parts);
  });

  test('индекс — взвешенная сумма своих слагаемых', () => {
    const list = [w(0, 1000), w(2, 1200), w(4, 900), w(9, 1100), w(16, 1000), w(23, 1000)];
    const r = readiness(list, { now: NOW });
    let sum = 0;
    let wSum = 0;
    for (const k of Object.keys(WEIGHTS)) {
      if (r.parts[k] === null) continue;
      sum += r.parts[k] * WEIGHTS[k];
      wSum += WEIGHTS[k];
    }
    assert.equal(r.index, Math.round(sum / wSum));
  });

  test('веса перенормируются, когда слагаемого нет: одинокая неделя судится по доступным', () => {
    const r = readiness([w(1, 1000)], { now: NOW });
    assert.equal(r.parts.trend, null, 'прошлой недели нет — тренд не считается');
    assert.ok(r.index !== null && r.index >= 0 && r.index <= 100);
    assert.equal(r.confidence, 'low');
  });

  test('сумма весов равна единице', () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `сумма весов = ${total}`);
  });

  test('ровный режим с разгрузкой оценивается выше семи дней подряд', () => {
    const sane = [w(1, 1000), w(3, 1100), w(5, 900), w(8, 1000), w(10, 1000), w(12, 1000), w(15, 1000), w(17, 1000), w(19, 1000), w(22, 1000), w(24, 1000), w(26, 1000)];
    const grind = [];
    for (let d = 0; d < 28; d++) grind.push(w(d, 1000));
    const a = readiness(sane, { now: NOW });
    const b = readiness(grind, { now: NOW });
    assert.ok(a.index > b.index, `sane=${a.index} grind=${b.index}`);
  });

  test('индекс всегда в 0–100 и каждое слагаемое тоже', () => {
    const list = [w(0, 50000), w(1, 40000), w(2, 45000), w(15, 100)];
    const r = readiness(list, { now: NOW });
    assert.ok(r.index >= 0 && r.index <= 100, `index=${r.index}`);
    for (const [k, v] of Object.entries(r.parts)) {
      if (v === null) continue;
      assert.ok(v >= 0 && v <= 100, `${k}=${v}`);
    }
    assert.ok(r.cns >= 0 && r.cns <= 100);
  });

  test('confidence: меньше шести сессий за 28 дней — low', () => {
    const few = [w(1, 1000), w(4, 1000), w(9, 1000)];
    assert.equal(readiness(few, { now: NOW }).confidence, 'low');
    const many = [w(1, 1000), w(3, 1000), w(5, 1000), w(8, 1000), w(11, 1000), w(14, 1000), w(18, 1000)];
    assert.equal(readiness(many, { now: NOW }).confidence, 'ok');
  });

  test('битые записи не роняют движок', () => {
    const r = readiness([null, {}, { timestamp: 'вчера' }, w(1, 1000)], { now: NOW });
    assert.ok(r.index !== null);
  });

  test('raw отдаёт сырьё для отчёта (окна, часы, ЦНС)', () => {
    const list = [wSets(1, [{ weight: 100, reps: 5 }, { weight: 115, reps: 1 }]), w(9, 1000)];
    const r = readiness(list, { now: NOW });
    assert.equal(r.raw.hoursSinceLast, 24);
    assert.equal(r.raw.needHours, CNS.hours);
    assert.equal(r.raw.cnsHeavy, true);
    assert.equal(r.raw.sessions28d, 2);
    assert.equal(r.raw.acuteLoad, sessionLoad(list[0]));
    assert.equal(r.weights, WEIGHTS);
  });

  test('окна ACWR — 7 и 28 дней', () => {
    assert.equal(WINDOWS.acuteDays, 7);
    assert.equal(WINDOWS.chronicDays, 28);
  });
});
