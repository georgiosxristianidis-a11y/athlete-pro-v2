// @ts-check
/**
 * DATA-4 хвосты (07.11).
 * (б) `_tierPct` радара получал объект `exrxTier` вместо строки уровня и всегда отдавал 8 %:
 *     оси силы с данными рисовались как «без данных». Гард — реальная вершина полигона радара
 *     при флаге OFF (дефект жил в легаси-пути, не за `muscles-ui`) и ON.
 * (а) «График» из карточки оси радара ведёт на карточку семейства в Stats.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = /** @type {any} */ ({
  addEventListener() {}, removeEventListener() {}, body: { style: {} },
  getElementById: () => null, querySelector: () => null,
});
Object.defineProperty(globalThis, 'window', {
  value: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
  writable: true, configurable: true,
});
/** @type {Map<string, string>} */
const store = new Map();
globalThis.localStorage = /** @type {any} */ ({ getItem: (/** @type {string} */ k) => store.get(k) ?? null });

const { renderHexagonRadar } = await import('../js/profile.view/hexagon-radar.js');
const { exrxTier } = await import('../js/strength-engine.js');

const CX = 120, CY = 120, R = 75;
/** Проценты уровней — те же, что рисует радар (R * pct / 100 от центра). */
const PCT = { untrained: 8, novice: 28, intermediate: 52, advanced: 76, elite: 96 };

/** Расстояние вершин полигона данных от центра → процент оси.
 * @param {string} html @returns {number[]} */
function axisPcts(html) {
  const m = /<polygon points="([^"]+)" fill="var\(--c-accent-bg\)"/.exec(html);
  assert.ok(m, 'полигон данных найден');
  return m[1].split(' ').map((p) => {
    const [x, y] = p.split(',').map(Number);
    return Math.round((Math.hypot(x - CX, y - CY) / R) * 100);
  });
}

/** @param {boolean} on */
function radar(on) {
  store.clear();
  if (on) store.set('ap-flag-muscles-ui', '1');
  const html = renderHexagonRadar({ bench: 110, squat: 200, deadlift: 60 }, 80, 'm', 30, [], 'ru');
  store.clear();
  return html;
}

describe('DATA-4 хвост (б): ось силы с данными стоит на проценте своего уровня', () => {
  const expected = (/** @type {string} */ lift, /** @type {number} */ rm) => {
    const t = exrxTier({ lift: /** @type {any} */ (lift), sex: 'm', bodyweight: 80, oneRM: rm, age: 30 });
    assert.ok(t, `${lift}: уровень посчитан`);
    return PCT[/** @type {keyof typeof PCT} */ (t.tier)];
  };

  for (const on of [false, true]) {
    test(`флаг muscles-ui ${on ? 'ON' : 'OFF'}: вершины жим/присед/тяга = процент уровня, без данных = 4`, () => {
      const p = axisPcts(radar(on));
      assert.equal(p[0], expected('bench', 110), 'жим');
      assert.equal(p[1], 4, 'жим стоя — данных нет');
      assert.equal(p[2], expected('deadlift', 60), 'тяга');
      assert.equal(p[3], expected('squat', 200), 'присед');
    });
  }

  test('хотя бы одна ось с данными выше «без данных» — иначе гард ничего не ловит', () => {
    const p = axisPcts(radar(false));
    assert.ok(p[0] > 8 || p[3] > 8, 'жим или присед выше 8 %');
  });
});

describe('DATA-4 хвост (а): «График» несёт семейство в Stats', async () => {
  const { axisCardHtml } = await import('../js/profile.view/radar-axis-card.js');
  const { buildRecords } = await import('../js/shared/exercise-records.js');
  const { findExercise } = await import('../js/shared/exercise-registry.js');
  const { renderStrengthCurves } = await import('../js/analytics.strength-curves.js');
  const { setStatsFocus, takeStatsFocus, findFamilyCard } = await import('../js/shared/stats-focus.js');

  const workouts = [{
    timestamp: Date.now() - 86400000, tonnage: 500,
    exercises: [{ name: 'Bench Press', sets: [{ weight: 100, reps: 5, done: true }] }],
  }];
  const ctx = {
    oneRMs: { bench: 110 }, bw: 80, sex: /** @type {'m'} */ ('m'), age: 30,
    records: buildRecords(workouts), monthVol: 500, sessions30d: 1,
  };

  test('кнопка «График» оси жима несёт family:<id> реестра', () => {
    const fam = findExercise('Bench Press')?.family;
    assert.ok(fam, 'жим в реестре');
    const html = axisCardHtml({ key: 'bench', label: 'Bench' }, ctx);
    assert.ok(html.includes(`data-action="radar-open-stats" data-family="family:${fam}"`), html);
  });

  test('карточка Stats семейства несёт тот же data-family; без family — атрибута нет', () => {
    const pts = [{ t: 1, v: 90 }, { t: 2, v: 100 }];
    const base = { name: 'Bench Press', pts, type: 'push', n: 3, delta: 10, bestWeight: 100, currentWeight: 100 };
    /** @param {any} curve */
    const render = (curve) => {
      const mount = /** @type {any} */ ({ innerHTML: '', querySelectorAll: () => [] });
      renderStrengthCurves([curve], mount);
      return mount.innerHTML;
    };
    assert.ok(render({ ...base, family: 'family:bench-press' }).includes('data-family="family:bench-press"'));
    assert.ok(!render(base).includes('data-family'));
  });

  test('фокус одноразовый: take забирает и сбрасывает', () => {
    setStatsFocus('family:squat');
    assert.equal(takeStatsFocus(), 'family:squat');
    assert.equal(takeStatsFocus(), null);
    setStatsFocus('');
    assert.equal(takeStatsFocus(), null);
  });

  test('findFamilyCard: находит карточку по семейству, иначе null', () => {
    const nodes = [{ dataset: { family: 'family:a' } }, { dataset: {} }, { dataset: { family: 'family:b' } }];
    assert.equal(findFamilyCard(nodes, 'family:b'), nodes[2]);
    assert.equal(findFamilyCard(nodes, 'family:zzz'), null);
    assert.equal(findFamilyCard(nodes, null), null);
  });

  test('проводка: радар кладёт фокус перед Nav.go, load() Stats забирает один раз', async () => {
    const { readFileSync } = await import('node:fs');
    const rd = (/** @type {string} */ p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const radar = rd('js/profile.view/hexagon-radar.js');
    assert.match(radar, /setStatsFocus\([\s\S]*?dataset\?\.family\);\s*window\.Nav\?\.go\('s-stats'\)/);
    const view = rd('js/analytics.view.js');
    assert.match(view, /export async function load\(\) \{\n\s*const focusFamily = takeStatsFocus\(\)/);
    assert.match(view, /_focusFamilyCard\(focusFamily\)/);
  });
});
