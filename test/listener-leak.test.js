// @ts-check
/**
 * LEAK-1 — слушатели на долгоживущей цели не должны копиться.
 *
 * Куплено разбором аудита Gemini (`docs/handoff/HANDOFF_gemini_audit_triage.md`).
 * Сырое соотношение «144 addEventListener против 13 removeEventListener» обманывает:
 * слушатель на узле оверлея уходит вместе с `node.remove()`. Утечка живёт ровно
 * там, где сходятся три условия — **долгоживущая цель** (`window`/`document`),
 * **повторно вызываемая функция** и **анонимный обработчик**:
 *
 *   1. `js/dashboard.js` `_initMascotDrag()` — зовётся из `load()` на каждый заход
 *      на s-home: +2 слушателя за заход, каждый держит узел маскота;
 *   2. `js/claude.view.js` `renderFAB()` — гард по контейнеру не спасает, потому что
 *      `dismissFAB()` контейнер удаляет, а `renderFAB()` зовётся заново из четырёх
 *      мест `js/profile.js`: +3 слушателя и один отсоединённый узел за цикл
 *      «скрыл / показал панду».
 *
 * Паттерн воспроизвёлся дважды независимо — значит вернётся третий раз. Отсюда три
 * слоя проверки: примитив (`listenerGroup` держит счётчик на месте под N циклов),
 * замок на обоих адресах (сырой `window.addEventListener` туда больше не вернётся)
 * и потолок на весь `js/` (новый сырой адрес обязан быть осознанным).
 *
 * **Heap snapshot сюда не берём.** Куча зависит от GC, а не от кода; программа LOAD
 * прямым замером показала, что абсолютным браузерным метрикам в этом проекте верить
 * нельзя. Считаем сущности — счётчик слушателей детерминирован.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listenerGroup } from '../js/shared/utils.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

/** Цель, которая честно считает живые слушатели — как это делает браузер. */
function countingTarget() {
  /** @type {Map<string, Set<any>>} */
  const live = new Map();
  const key = (type, options) => `${type}|${typeof options === 'object' ? !!options.capture : !!options}`;
  return {
    addEventListener(type, handler, options) {
      const k = key(type, options);
      if (!live.has(k)) live.set(k, new Set());
      live.get(k).add(handler);
    },
    removeEventListener(type, handler, options) {
      live.get(key(type, options))?.delete(handler);
    },
    /** Сколько слушателей висит прямо сейчас. */
    get size() {
      let n = 0;
      for (const set of live.values()) n += set.size;
      return n;
    },
    dispatch(type) {
      for (const [k, set] of live) {
        if (k.split('|')[0] === type) for (const h of set) h({ type });
      }
    },
  };
}

/* ════════════════════════════════════════════════════════
   1. Примитив: счётчик не растёт под циклами
   ════════════════════════════════════════════════════════ */
describe('listenerGroup — снятие такое же дешёвое, как навешивание', () => {
  test('N циклов «навесил / снял» не сдвигают счётчик слушателей', () => {
    const target = countingTarget();
    // Форма обоих адресов сразу: три слушателя FAB + два слушателя драга маскота.
    const types = ['resize', 'ap-nav-change', 'ap-mascot-video', 'pointermove', 'pointerup'];

    for (let cycle = 0; cycle < 50; cycle++) {
      const group = listenerGroup(/** @type {any} */ (target));
      // Анонимки — намеренно: ссылку на снятие держит группа, а не автор кода.
      for (const type of types) group.add(type, () => {});
      assert.equal(target.size, types.length, `цикл ${cycle}: группа обязана держать ровно ${types.length}`);
      group.release();
      assert.equal(target.size, 0, `цикл ${cycle}: после release() на цели не должно остаться ничего`);
    }
  });

  test('без release() слушатели копятся — базовая линия воспроизводит баг', () => {
    // Контрольный прогон: если бы этот тест был зелёным и без снятия, он ничего
    // не доказывал бы. Здесь видно ту самую линейную аккрецию из карточки.
    const target = countingTarget();
    for (let cycle = 0; cycle < 10; cycle++) {
      const group = listenerGroup(/** @type {any} */ (target));
      group.add('resize', () => {});
    }
    assert.equal(target.size, 10, 'десять циклов без release() обязаны дать десять слушателей');
  });

  test('release() идемпотентен и не роняет группу', () => {
    const target = countingTarget();
    const group = listenerGroup(/** @type {any} */ (target));
    group.add('resize', () => {});
    group.release();
    group.release();
    assert.equal(target.size, 0);
    assert.equal(group.size, 0);
  });

  test('снятие попадает в ту же пару «тип + capture», что и навешивание', () => {
    // Промах по capture — тихий: addEventListener отработал, removeEventListener
    // молча ничего не снял, и слушатель остался жить.
    const target = countingTarget();
    const group = listenerGroup(/** @type {any} */ (target));
    group.add('pointermove', () => {}, { capture: true });
    group.add('pointerup', () => {}, true);
    group.release();
    assert.equal(target.size, 0, 'capture-слушатели обязаны сниматься так же чисто');
  });

  test('обработчики группы продолжают работать до release()', () => {
    const target = countingTarget();
    const group = listenerGroup(/** @type {any} */ (target));
    let hits = 0;
    group.add('resize', () => { hits++; });
    target.dispatch('resize');
    group.release();
    target.dispatch('resize');
    assert.equal(hits, 1, 'снятие обязано глушить обработчик, а до него — не мешать ему');
  });

  test('вне браузера группа молчит, а не падает', () => {
    // utils.js грузится и в node (тесты, SSR-подобные прогоны) — дефолтная цель там null.
    const group = listenerGroup(undefined);
    group.add('resize', () => {});
    group.release();
    assert.equal(group.size, 0);
  });
});

/* ════════════════════════════════════════════════════════
   2. Замок на обоих адресах карточки
   ════════════════════════════════════════════════════════ */

/**
 * Тело функции внутри IIFE-модуля: от заголовка до следующей функции того же уровня.
 * @param {string} src
 * @param {string} header
 */
function fnRegion(src, header) {
  const start = src.indexOf(header);
  assert.ok(start >= 0, `в файле не нашлось «${header}» — тест смотрит не туда, а не код починился`);
  const rest = src.slice(start + header.length);
  const next = rest.search(/\n {2}(?:async )?function [A-Za-z_$]/);
  return rest.slice(0, next < 0 ? rest.length : next);
}

describe('LEAK-1: адреса утечек закрыты и заперты', () => {
  const dashboard = read('js/dashboard.js');
  const claudeView = read('js/claude.view.js');

  test('_initMascotDrag снимает прошлую пару и вешает новую через группу', () => {
    const body = fnRegion(dashboard, 'function _initMascotDrag()');
    assert.match(body, /_mascotDragOn\?\.release\(\)/, 'прошлые слушатели обязаны сниматься при каждом вызове');
    assert.match(body, /_mascotDragOn = listenerGroup\(\)/, 'новые обязаны идти через группу');
    assert.match(body, /_mascotDragOn\.add\('pointermove'/, 'слепок тела — проверка, что регион вырезан верно');
    assert.match(body, /_mascotDragOn\.add\('pointerup'/, 'слепок тела — проверка, что регион вырезан верно');
    assert.doesNotMatch(body, /window\.addEventListener/, 'сырой слушатель на window вернулся в повторно вызываемую функцию');
  });

  test('_initMascotDrag снимает слушатели ДО early-return по отсутствию маскота', () => {
    // Порядок здесь — не стиль: когда маскота на экране больше нет, ранний выход
    // выше release() оставлял бы старую пару держать отсоединённый узел навсегда.
    const body = fnRegion(dashboard, 'function _initMascotDrag()');
    const release = body.indexOf('_mascotDragOn?.release()');
    const earlyReturn = body.indexOf('if (!el) return;');
    assert.ok(release >= 0 && earlyReturn >= 0, 'слепок тела не найден — тест смотрит не туда');
    assert.ok(release < earlyReturn, 'release() обязан стоять выше выхода по отсутствию элемента');
  });

  test('renderFAB вешает свои три слушателя через группу', () => {
    const body = fnRegion(claudeView, 'async function renderFAB()');
    assert.match(body, /_fabOn\?\.release\(\)/, 'прошлые слушатели обязаны сниматься перед перевешиванием');
    assert.match(body, /_fabOn = listenerGroup\(\)/, 'новые обязаны идти через группу');
    for (const type of ['resize', 'ap-nav-change', 'ap-mascot-video']) {
      assert.match(body, new RegExp(`_fabOn\\.add\\('${type}'`), `слушатель ${type} обязан жить в группе`);
    }
    assert.doesNotMatch(body, /window\.addEventListener/, 'сырой слушатель на window вернулся в renderFAB');
  });

  test('dismissFAB снимает слушатели вместе с контейнером', () => {
    const body = fnRegion(claudeView, 'async function dismissFAB()');
    assert.match(body, /_fabOn\?\.release\(\)/, 'удаление контейнера обязано снимать слушатели, которые его замыкают');
    assert.match(body, /claude-fab-container/, 'слепок тела — проверка, что регион вырезан верно');
  });
});

/* ════════════════════════════════════════════════════════
   3. Потолок на сырые слушатели долгоживущих целей
   ════════════════════════════════════════════════════════ */

/**
 * Замороженная инвентаризация, а не запрет. Каждый из этих адресов на 2026-08-19
 * разобран поимённо и вешается один раз за жизнь страницы: модульный top-level
 * (`js/app.js`, `js/boot.js`, `js/shell.js`, `js/sync.js`, `js/timer.js`,
 * `js/profile.js`), одноразовая инициализация под собственным гардом
 * (`js/shared/dynamic-island.js` — гард по `#dynamic-island`, `js/intel.view.js` —
 * гард по `window._intelListenersActive`) или колбэк регистрации SW.
 *
 * Новый сырой адрес роняет тест. Это и есть вопрос, который тест задаёт автору:
 * «твоя функция зовётся один раз за жизнь страницы — точно?». Если да — поднять
 * число строкой ниже и назвать причину в коммите; если нет — взять `listenerGroup`.
 */
const MAX_RAW_LONGLIVED_LISTENERS = 36;

describe('Класс утечки: сырые слушатели window/document под счётом', () => {
  /** @param {string} dir @returns {string[]} */
  function jsFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...jsFiles(full));
      else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
  }

  test(`сырых window/document.addEventListener в js/ не больше ${MAX_RAW_LONGLIVED_LISTENERS}`, () => {
    let total = 0;
    /** @type {string[]} */
    const perFile = [];
    for (const file of jsFiles(path.join(REPO_ROOT, 'js'))) {
      const hits = (fs.readFileSync(file, 'utf8').match(/\b(?:window|document)\.addEventListener\s*\(/g) || []).length;
      if (hits) {
        total += hits;
        perFile.push(`${path.relative(REPO_ROOT, file).replace(/\\/g, '/')}: ${hits}`);
      }
    }
    assert.ok(
      total <= MAX_RAW_LONGLIVED_LISTENERS,
      `сырых слушателей стало ${total} при потолке ${MAX_RAW_LONGLIVED_LISTENERS}.\n` +
      'Вешается ли новый адрес повторно? Тогда это LEAK-1 в третий раз — брать listenerGroup ' +
      'из js/shared/utils.js. Если адрес действительно одноразовый — поднять потолок и назвать причину.\n' +
      perFile.join('\n')
    );
  });

  test('в двух починенных файлах сырых слушателей на window остался только модульный top-level', () => {
    // dashboard.js:35 — регистрация уровня модуля, живёт всю сессию и снятию не подлежит.
    const dashboardHits = (read('js/dashboard.js').match(/\bwindow\.addEventListener\s*\(/g) || []).length;
    const claudeHits = (read('js/claude.view.js').match(/\bwindow\.addEventListener\s*\(/g) || []).length;
    assert.equal(dashboardHits, 1, 'в dashboard.js допустим ровно один сырой слушатель — модульный ap-nav-change');
    assert.equal(claudeHits, 0, 'в claude.view.js сырых слушателей на window быть не должно');
  });
});
