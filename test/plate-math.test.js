// PLATE-1a: расчёт блинов честен.
//
// Старый `_calc` в js/plate-calc.js врал в трёх местах: «add 1.25 kg plates» при
// том, что 1.25 уже в наборе; `Math.max(_barWeight, weight)` молча поднимал вес
// ниже грифа; вес с барабана (шаг 2) часто не собирается, а об этом молчали.
// Здесь держим новое поведение: не подменять вес, называть, сколько не хватает.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PLATE_SPEC,
  BAR_OPTIONS,
  DEFAULT_BAR,
  LOAD_STEP,
  loadPlates,
  stepLoadable,
  normalizeBar,
} from '../js/shared/plate-math.js';

/** Вес блинов на одну сторону по списку {kg, n}. */
const sideKg = (plates) => plates.reduce((s, p) => s + p.kg * p.n, 0);
const count = (plates) => plates.reduce((s, p) => s + p.n, 0);

describe('PLATE_SPEC', () => {
  test('от крупного к мелкому, номиналы положительные и без повторов', () => {
    const kgs = PLATE_SPEC.map((p) => p.kg);
    assert.ok(kgs.every((k) => k > 0));
    for (let i = 1; i < kgs.length; i++) assert.ok(kgs[i - 1] > kgs[i], `${kgs[i - 1]} не больше ${kgs[i]}`);
  });

  test('каждый номинал кратен самому мелкому: на этом стоят сетка и жадность', () => {
    const smallest = Math.min(...PLATE_SPEC.map((p) => p.kg));
    for (const { kg } of PLATE_SPEC) {
      assert.equal(Math.round((kg / smallest) * 1000) % 1000, 0, `${kg} не кратен ${smallest}`);
    }
  });

  test('шаг собираемых весов — пара самых мелких блинов, 2.5 кг', () => {
    assert.equal(LOAD_STEP, 2.5);
  });

  test('у каждого блина есть цвет, подпись, размеры', () => {
    for (const p of PLATE_SPEC) {
      assert.match(p.bg, /^#[0-9a-f]{3,6}$/i);
      assert.match(p.fg, /^#[0-9a-f]{3,6}$/i);
      assert.ok(p.h > 0 && p.w > 0);
    }
  });
});

describe('loadPlates — собираемый вес', () => {
  test('100 при грифе 20: на сторону 25 + 15', () => {
    const r = loadPlates(100, 20);
    assert.equal(r.status, 'exact');
    assert.deepEqual(r.plates, [
      { kg: 25, n: 1 },
      { kg: 15, n: 1 },
    ]);
    assert.equal(r.loaded, 100);
    assert.equal(r.perSide, 40);
    assert.equal(r.up, null);
  });

  test('вес равен грифу — пустой гриф, не «ниже грифа»', () => {
    for (const bar of BAR_OPTIONS) {
      const r = loadPlates(bar, bar);
      assert.equal(r.status, 'exact');
      assert.deepEqual(r.plates, []);
      assert.equal(r.loaded, bar);
      assert.equal(r.perSide, 0);
    }
  });

  test('1.25 — самый мелкий блин: 22.5 при грифе 20 собирается одной парой', () => {
    const r = loadPlates(22.5, 20);
    assert.equal(r.status, 'exact');
    assert.deepEqual(r.plates, [{ kg: 1.25, n: 1 }]);
    assert.equal(r.perSide, 1.25);
  });

  test('несколько одинаковых блинов складываются в n: 150 -> 25 x2 + 15', () => {
    const r = loadPlates(150, 20); // 65 на сторону
    assert.deepEqual(r.plates, [
      { kg: 25, n: 2 },
      { kg: 15, n: 1 },
    ]);
  });

  test('гриф 10, 15, 20: один и тот же вес даёт свой набор', () => {
    // 60 кг: на сторону 20 / 22.5 / 25
    assert.deepEqual(loadPlates(60, 20).plates, [{ kg: 20, n: 1 }]);
    assert.deepEqual(loadPlates(60, 15).plates, [
      { kg: 20, n: 1 },
      { kg: 2.5, n: 1 },
    ]);
    assert.deepEqual(loadPlates(60, 10).plates, [{ kg: 25, n: 1 }]);
    for (const bar of BAR_OPTIONS) assert.equal(loadPlates(60, bar).loaded, 60);
  });

  test('гриф по умолчанию — 20', () => {
    assert.deepEqual(loadPlates(100), loadPlates(100, DEFAULT_BAR));
    assert.equal(DEFAULT_BAR, 20);
  });
});

describe('loadPlates — не собирается', () => {
  test('22 при грифе 20: не собирается, до 22.5 ещё 0.5 кг', () => {
    const r = loadPlates(22, 20);
    assert.equal(r.status, 'unreachable');
    assert.deepEqual(r.plates, []);
    assert.equal(r.loaded, 20);
    assert.deepEqual(r.up, { total: 22.5, delta: 0.5, plates: [{ kg: 1.25, n: 1 }] });
  });

  test('101 при грифе 20: на грифе 100, до 102.5 ещё 1.5 кг', () => {
    const r = loadPlates(101, 20);
    assert.equal(r.status, 'unreachable');
    assert.equal(r.loaded, 100);
    assert.equal(r.perSide, 40);
    assert.deepEqual(r.plates, [
      { kg: 25, n: 1 },
      { kg: 15, n: 1 },
    ]);
    assert.equal(r.up.total, 102.5);
    assert.equal(r.up.delta, 1.5);
    assert.equal(sideKg(r.up.plates), 41.25);
  });

  test('дробь без ошибки float: 101.1 -> до 102.5 ровно 1.4', () => {
    const r = loadPlates(101.1, 20);
    assert.equal(r.status, 'unreachable');
    assert.equal(r.up.total, 102.5);
    assert.equal(r.up.delta, 1.4);
  });

  test('«add 1.25 kg plates» больше не звучит: 1.25 уже в наборе, остаток — число до цели', () => {
    const r = loadPlates(21.25, 20);
    assert.equal(r.status, 'unreachable');
    assert.equal(r.up.delta, 1.25);
    assert.equal(r.up.total, 22.5);
  });

  test('при другом грифе сетка сдвигается вместе с ним: 22 при грифе 10 -> 22.5', () => {
    const r = loadPlates(22, 10);
    assert.equal(r.status, 'unreachable');
    assert.equal(r.loaded, 20);
    assert.equal(r.up.total, 22.5);
    assert.equal(r.up.delta, 0.5);
  });

  test('вес на барабане с шагом 2 собирается не всегда: 20, 22, 24, 26 при грифе 20', () => {
    const got = [20, 22, 24, 26].map((w) => loadPlates(w, 20).status);
    assert.deepEqual(got, ['exact', 'unreachable', 'unreachable', 'unreachable']);
  });
});

describe('loadPlates — ниже грифа', () => {
  test('15 при грифе 20: «ниже грифа», пустой гриф, вес не подменяется', () => {
    const r = loadPlates(15, 20);
    assert.equal(r.status, 'below-bar');
    assert.deepEqual(r.plates, []);
    assert.equal(r.loaded, 20);
    assert.equal(r.perSide, 0);
    assert.equal(r.up, null);
  });

  test('тот же 15 при грифе 10 или 15 собирается — «ниже грифа» зависит от грифа', () => {
    assert.equal(loadPlates(15, 15).status, 'exact');
    const r = loadPlates(15, 10);
    assert.equal(r.status, 'exact');
    assert.deepEqual(r.plates, [{ kg: 2.5, n: 1 }]);
  });

  test('1.25 как вес — ниже любого грифа, а не «один блин»', () => {
    for (const bar of BAR_OPTIONS) assert.equal(loadPlates(1.25, bar).status, 'below-bar');
  });

  test('ноль, отрицательный, не число — ниже грифа, без падения', () => {
    for (const bad of [0, -5, NaN, undefined, null, 'abc', Infinity]) {
      assert.equal(loadPlates(/** @type {any} */ (bad), 20).status, 'below-bar', String(bad));
    }
  });

  test('число строкой из поля ввода читается как число', () => {
    assert.equal(loadPlates(/** @type {any} */ ('100'), 20).status, 'exact');
  });
});

describe('loadPlates — гриф-конфиг, а не пользовательский ввод', () => {
  test('битый гриф — RangeError, а не молча NaN', () => {
    for (const bad of [NaN, -1, Infinity, null]) {
      assert.throws(() => loadPlates(100, /** @type {any} */ (bad)), RangeError, String(bad));
    }
  });
});

describe('loadPlates — инварианты по всей сетке весов', () => {
  /**
   * Минимум блинов на сторону для суммы `units` x 1.25 кг, динамикой.
   * Жадность обязана с ним совпадать: иначе на гриф лезет лишний диск,
   * который в телефоне виден как «странный набор», а в зале — как лишний
   * подход к стойке.
   */
  function minCoins(maxUnits) {
    const coins = PLATE_SPEC.map((p) => Math.round(p.kg / 1.25));
    const best = new Array(maxUnits + 1).fill(Infinity);
    best[0] = 0;
    for (let u = 1; u <= maxUnits; u++) {
      for (const c of coins) if (c <= u && best[u - c] + 1 < best[u]) best[u] = best[u - c] + 1;
    }
    return best;
  }

  test('жадный подбор минимален по числу блинов (до 300 кг на сторону)', () => {
    const best = minCoins(240); // 240 x 1.25 = 300 кг
    for (let u = 0; u <= 240; u++) {
      const total = 20 + u * 2.5; // гриф 20, на сторону u x 1.25
      const r = loadPlates(total, 20);
      assert.equal(r.status, 'exact', `${total}`);
      assert.equal(count(r.plates), best[u], `на сторону ${u * 1.25} кг: ${count(r.plates)} блинов, минимум ${best[u]}`);
    }
  });

  test('exact <=> вес на сетке; loaded = гриф + 2 x блины; up строго выше и тоже собирается', () => {
    for (const bar of BAR_OPTIONS) {
      for (let w = 0; w <= 400; w += 0.25) {
        const r = loadPlates(w, bar);
        const onGrid = w >= bar && Math.abs((w - bar) / LOAD_STEP - Math.round((w - bar) / LOAD_STEP)) < 1e-9;
        const tag = `${w} / ${bar}`;

        if (w < bar) {
          assert.equal(r.status, 'below-bar', tag);
          continue;
        }
        assert.equal(r.status === 'exact', onGrid, tag);
        assert.equal(r.loaded, bar + 2 * sideKg(r.plates), tag);
        assert.equal(r.perSide, sideKg(r.plates), tag);
        assert.ok(r.loaded <= w, `${tag}: на грифе ${r.loaded} больше цели`);
        assert.ok(r.loaded > w - LOAD_STEP, `${tag}: ближайший снизу ушёл дальше шага`);

        if (r.status === 'exact') {
          assert.equal(r.loaded, w, tag);
          assert.equal(r.up, null, tag);
        } else {
          assert.ok(r.up.total > w, tag);
          assert.ok(r.up.delta > 0 && r.up.delta < LOAD_STEP, tag);
          assert.equal(r.up.total, Math.round((w + r.up.delta) * 100) / 100, tag);
          const again = loadPlates(r.up.total, bar);
          assert.equal(again.status, 'exact', tag);
          assert.deepEqual(again.plates, r.up.plates, tag);
        }
      }
    }
  });
});

describe('stepLoadable — шаг ±2.5 по собираемым весам', () => {
  test('со собираемого веса — ровно на 2.5', () => {
    assert.equal(stepLoadable(100, 20, 1), 102.5);
    assert.equal(stepLoadable(100, 20, -1), 97.5);
  });

  test('с не собираемого — на ближайший собираемый в свою сторону', () => {
    assert.equal(stepLoadable(22, 20, 1), 22.5);
    assert.equal(stepLoadable(22, 20, -1), 20);
    assert.equal(stepLoadable(101, 20, 1), 102.5);
    assert.equal(stepLoadable(101, 20, -1), 100);
  });

  test('на грифе вниз не идёт; ниже грифа вверх — к грифу, вниз — на месте', () => {
    assert.equal(stepLoadable(20, 20, -1), 20);
    assert.equal(stepLoadable(15, 20, 1), 20);
    assert.equal(stepLoadable(15, 20, -1), 15);
    assert.equal(stepLoadable(10, 10, -1), 10);
  });

  test('без float-дрожи после длинной серии шагов', () => {
    let w = 20;
    for (let i = 0; i < 400; i++) w = stepLoadable(w, 20, 1);
    assert.equal(w, 1020);
    for (let i = 0; i < 400; i++) w = stepLoadable(w, 20, -1);
    assert.equal(w, 20);
  });

  test('любой шаг приземляется на собираемый вес и строго сдвигается', () => {
    for (const bar of BAR_OPTIONS) {
      for (let w = bar; w <= 200; w += 0.25) {
        const up = stepLoadable(w, bar, 1);
        assert.equal(loadPlates(up, bar).status, 'exact', `${w}/${bar} вверх -> ${up}`);
        assert.ok(up > w, `${w}/${bar}`);
        const down = stepLoadable(w, bar, -1);
        assert.equal(loadPlates(down, bar).status, 'exact', `${w}/${bar} вниз -> ${down}`);
        assert.ok(down < w || w === bar, `${w}/${bar}`);
      }
    }
  });

  test('битый гриф — RangeError', () => {
    assert.throws(() => stepLoadable(100, NaN, 1), RangeError);
  });
});

describe('normalizeBar — гриф из хранилища', () => {
  test('допустимый гриф проходит и строкой, и числом', () => {
    for (const bar of BAR_OPTIONS) {
      assert.equal(normalizeBar(bar), bar);
      assert.equal(normalizeBar(String(bar)), bar);
    }
  });

  test('всё прочее — 20: пусто, мусор, отрицательный, не из списка', () => {
    for (const bad of [null, undefined, '', 'abc', '20kg', -5, 0, 7, 25, NaN, Infinity, {}, []]) {
      assert.equal(normalizeBar(bad), DEFAULT_BAR, String(bad));
    }
  });
});
