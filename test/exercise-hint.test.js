// @ts-check
/**
 * HINT-1 — подсказка техники (флаг exercise-hint): данные подсказок покрывают сид-планы,
 * ссылки lib живы, каждая мышца библиотеки ложится на зону силуэта, счётчик сессий,
 * флаг/тумблер/локали, CSS-блок только на токенах.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.localStorage = /** @type {any} */ ({ getItem: () => null, setItem() {}, removeItem() {} });

const read = (/** @type {string} */ p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const { flag, LAB_FLAGS } = await import('../js/flags.js');
const { PPL_GIO_PLAN, PPL_HYBRID_PLAN, DEFAULT_PLAN } = await import('../js/workout.store.js');
const { HINTS } = await import('../js/shared/exercise-hints.js');
const { MUSCLE_ZONES, BODY, NEUTRAL, muscleZones } = await import('../js/shared/body-map.js');
const { resolveHint, sessionsDone, HINT_HIDE_AFTER } = await import('../js/shared/hint-resolve.js');

const library = JSON.parse(read('exercises-library.json')).exercises;

/** Все имена упражнений сид-плана, на любой глубине вложенности. */
function planNames(/** @type {any} */ node, /** @type {Set<string>} */ out = new Set()) {
  if (Array.isArray(node)) node.forEach((x) => planNames(x, out));
  else if (node && typeof node === 'object') {
    if (typeof node.name === 'string' && 'sets' in node) out.add(node.name);
    else Object.values(node).forEach((x) => planNames(x, out));
  }
  return out;
}

describe('HINT-1: данные подсказок', () => {
  const names = [...planNames([PPL_GIO_PLAN, PPL_HYBRID_PLAN, DEFAULT_PLAN])];
  const low = (/** @type {string} */ s) => s.toLowerCase();

  test('каждое упражнение сид-планов имеет запись в HINTS', () => {
    assert.ok(names.length >= 40, `имён в планах: ${names.length}`);
    const keys = new Set(Object.keys(HINTS).map(low));
    const miss = names.filter((n) => !keys.has(low(n)));
    assert.deepEqual(miss, []);
  });

  test('lib и same ведут на живые цели; у записи есть ru/en/el', () => {
    const ids = new Set(library.map((/** @type {any} */ e) => e.id));
    for (const [k, h] of Object.entries(HINTS)) {
      if (h.same) {
        assert.ok(HINTS[h.same] && !HINTS[h.same].same, `${k}: same → ${h.same}`);
        continue;
      }
      if (h.lib) assert.ok(ids.has(h.lib), `${k}: lib ${h.lib} нет в exercises-library.json`);
      for (const lang of ['ru', 'en', 'el']) assert.ok(h[lang]?.line, `${k}: нет ${lang}.line`);
    }
  });

  test('каждая мышца библиотеки ложится на существующую зону силуэта', () => {
    const zones = new Set([...Object.keys(BODY.a), ...Object.keys(BODY.p)]);
    const muscles = new Set(
      library.flatMap((/** @type {any} */ e) => [...(e.primaryMuscles || []), ...(e.secondaryMuscles || [])]).map(low),
    );
    for (const m of muscles) assert.ok(MUSCLE_ZONES[m], `мышца «${m}» без зоны в MUSCLE_ZONES`);
    for (const z of Object.values(MUSCLE_ZONES).flat()) assert.ok(zones.has(z), `зона ${z} без контуров`);
    for (const z of NEUTRAL) assert.ok(zones.has(z), `нейтральная ${z} без контуров`);
  });

  test('muscleZones: основная зона не дублируется во вспомогательных', () => {
    const z = muscleZones({ primaryMuscles: ['Latissimus Dorsi'], secondaryMuscles: ['Rhomboids', 'Biceps'] });
    assert.deepEqual(z, { primary: ['upper_back'], secondary: ['biceps'] });
  });

  test('resolveHint: язык, алиас same, запасной путь по имени библиотеки, null для неизвестного', () => {
    const ru = resolveHint('bench press', HINTS, library, 'ru');
    assert.ok(ru && ru.line && ru.zones.primary.includes('chest'));
    assert.notEqual(resolveHint('Bench Press', HINTS, library, 'en')?.line, ru.line);
    assert.ok(resolveHint('Hanging Leg Raise', HINTS, library, 'en')?.line);
    const plain = library.find((/** @type {any} */ e) => !Object.keys(HINTS).some((k) => low(k) === low(e.name)));
    const viaLib = resolveHint(plain.name, HINTS, library, 'en');
    assert.ok(viaLib && viaLib.line === '' && viaLib.cat === plain.category);
    assert.equal(resolveHint('Nonexistent Lift 9000', HINTS, library, 'en'), null);
  });
});

describe('HINT-1: счётчик сессий', () => {
  const w = (/** @type {any[]} */ sets, name = 'Bench Press') => ({ exercises: [{ name, sets }] });
  test('засчитан закрытый подход с повторами; done:false и reps 0 не в счёт', () => {
    const hist = [w([{ reps: 8 }]), w([{ reps: 8, done: false }]), w([{ reps: 0 }]), w([{ reps: 5 }], 'Squat')];
    assert.equal(sessionsDone(hist, 'Bench Press'), 1);
    assert.equal(sessionsDone([], 'Bench Press'), 0);
    assert.equal(HINT_HIDE_AFTER, 3);
  });
});

describe('HINT-1: флаг, локали, CSS', () => {
  test('флаг exercise-hint: дефолт OFF, тумблер в Лаборатории', () => {
    assert.equal(flag('exercise-hint'), false);
    assert.ok(LAB_FLAGS.includes('exercise-hint'));
  });
  test('локали: lab.exercise-hint(+_sub) в en, ru, el', () => {
    const store = read('js/locale.store.js');
    assert.equal(store.split("'lab.exercise-hint'").length - 1, 2, 'en + ru');
    assert.equal(store.split("'lab.exercise-hint_sub'").length - 1, 2, 'en + ru');
    assert.ok(read('js/locale.el.js').includes("'lab.exercise-hint'"));
    assert.ok(read('js/locale.el.js').includes("'lab.exercise-hint_sub'"));
  });
  test('рендер и меню зовут модуль подсказки; данные грузятся лениво', () => {
    assert.match(read('js/workout.view/render.js'), /hintStripHtml\(/);
    assert.match(read('js/workout.view/handlers.js'), /hintMenuItems\(/);
    const mod = read('js/workout.view/exercise-hint.js');
    assert.match(mod, /flag\('exercise-hint'\)/);
    assert.doesNotMatch(mod, /^import .*exercise-hints\.js/m, 'HINTS только через import()');
    assert.doesNotMatch(mod, /\bDB\./);
  });
  test('CSS блока HINT-1 только на токенах: без hex и rgba', () => {
    const css = read('css/workout.css');
    const i = css.indexOf('HINT-1');
    assert.ok(i >= 0, 'блок HINT-1 в css/workout.css');
    const end = css.indexOf('\n/* ', i + 10);
    const block = css.slice(i, end > 0 ? end : undefined);
    assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(block, /rgba?\(/);
  });
});
