import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';
import { KEEP_ON_WIPE } from '../js/db.js';
import { LOCAL_BACKUP_KEYS } from '../js/db/backup.js';
import {
  rollDiff,
  chipValueHtml,
  readSeen,
  writeSeen,
  clearSeen,
  DASH_SEEN_KEY,
} from '../js/shared/digit-roll.js';

/** Текст разметки без тегов — то, что увидит textContent и скринридер. */
const textOf = (h) => h.replace(/<[^>]*>/g, '');

describe('digit-roll: rollDiff (BOOT-1, решения 9-10)', () => {
  test('12.0k → 13.5k — два изменившихся разряда', () => {
    assert.deepEqual(rollDiff('12.0k', '13.5k'), [1, 3]);
  });

  test('12.9k → 13.1k — оба вперёд, девятка уходит через ноль', () => {
    assert.deepEqual(rollDiff('12.9k', '13.1k'), [1, 3]);
  });

  test('сессий 3 → 4 — один разряд', () => {
    assert.deepEqual(rollDiff('3', '4'), [0]);
  });

  test('крутится только изменившееся: 488 → 498', () => {
    assert.deepEqual(rollDiff('488', '498'), [1]);
  });

  test('15.1k → 0 — смена недели, число встаёт статично', () => {
    assert.equal(rollDiff('15.1k', '0'), null);
  });

  test('988 → 1.0k — переход fmtVol меняет маску', () => {
    assert.equal(rollDiff('988', '1.0k'), null);
  });

  test('9 → 10 — длина другая, маска другая', () => {
    assert.equal(rollDiff('9', '10'), null);
  });

  test('равные — стоят', () => {
    assert.equal(rollDiff('12.0k', '12.0k'), null);
  });

  test('число уменьшилось при равной маске — стоит', () => {
    assert.equal(rollDiff('13.5k', '12.0k'), null);
    assert.equal(rollDiff('498', '488'), null);
  });

  test('нет базы — стоит', () => {
    assert.equal(rollDiff(null, '12.0k'), null);
    assert.equal(rollDiff(undefined, '12.0k'), null);
    assert.equal(rollDiff('', '12'), null);
  });

  test('строка без цифр — стоит', () => {
    assert.equal(rollDiff('--', '-.'), null);
  });
});

describe('digit-roll: chipValueHtml', () => {
  test('нет роста — просто текст', () => {
    assert.equal(chipValueHtml('12.0k', '12.0k'), '12.0k');
    assert.equal(chipValueHtml(null, '12.0k'), '12.0k');
    assert.equal(chipValueHtml('15.1k', '0'), '0');
  });

  test('textContent разметки равен новому значению', () => {
    assert.equal(textOf(chipValueHtml('12.9k', '13.1k')), '13.1k');
    assert.equal(textOf(chipValueHtml('3', '4')), '4');
  });

  test('колонка только на изменившихся разрядах, остальные — голый текст', () => {
    const h = chipValueHtml('12.0k', '13.5k');
    assert.equal((h.match(/class="dig-roll"/g) || []).length, 2);
    assert.ok(h.startsWith('1<span'), 'первая цифра не менялась — стоит');
    assert.ok(h.includes('.<span') || h.includes('>.<'), 'точка и k не крутятся');
    assert.ok(h.endsWith('</span></span>k'), 'k остаётся хвостом');
  });

  test('девятка идёт вперёд через ноль: 19 → 21, хвост 9,0 и два шага', () => {
    const roll = chipValueHtml('19', '21');
    assert.ok(roll.includes('data-trail="1"') && roll.includes('--roll-n:1'));
    assert.ok(roll.includes('data-trail="9\n0"') && roll.includes('--roll-n:2'));
  });

  test('порядок разряда и чипа уходит в custom properties', () => {
    const h = chipValueHtml('12.0k', '13.5k', 2);
    assert.ok(h.includes('--roll-i:0') && h.includes('--roll-i:1'));
    assert.equal((h.match(/--roll-c:2/g) || []).length, 2);
  });

  test('шаги: 2 → 7 пять, 7 → 3 шесть (через 9 и 0)', () => {
    assert.ok(chipValueHtml('2', '7').includes('--roll-n:5'));
    assert.ok(chipValueHtml('17', '23').includes('--roll-n:6'));
  });

  test('чужая строка экранируется (esc-закон)', () => {
    assert.equal(chipValueHtml(null, '<b>'), '&lt;b&gt;');
  });
});

describe('digit-roll: база ap-dash-seen', () => {
  /** @type {Map<string, string>} */
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => void store.set(k, String(v)),
      removeItem: (k) => void store.delete(k),
    };
  });

  test('записал — прочитал', () => {
    writeSeen({ w: '12.0k', m: '45.3k', s: '3' });
    assert.deepEqual(readSeen(), { w: '12.0k', m: '45.3k', s: '3' });
    assert.ok(store.has(DASH_SEEN_KEY));
  });

  test('нет ключа — null', () => {
    assert.equal(readSeen(), null);
  });

  test('битый JSON и чужая форма — null, а не исключение', () => {
    store.set(DASH_SEEN_KEY, '{oops');
    assert.equal(readSeen(), null);
    store.set(DASH_SEEN_KEY, JSON.stringify({ w: 1, m: 2, s: 3 }));
    assert.equal(readSeen(), null);
    store.set(DASH_SEEN_KEY, 'null');
    assert.equal(readSeen(), null);
  });

  test('clearSeen снимает базу', () => {
    writeSeen({ w: '1', m: '2', s: '3' });
    clearSeen();
    assert.equal(readSeen(), null);
  });

  test('недоступный localStorage не роняет', () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    assert.equal(readSeen(), null);
    writeSeen({ w: '1', m: '2', s: '3' });
    clearSeen();
  });
});

describe('digit-roll: где живёт ключ ap-dash-seen (BOOT-1)', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  /** Исходник без комментариев — иначе гард зеленеет на закомментированной строке. */
  const code = (rel) =>
    readFileSync(path.join(ROOT, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  test('не в KEEP_ON_WIPE: удаление данных стирает базу само', () => {
    assert.ok(!KEEP_ON_WIPE.includes(DASH_SEEN_KEY));
  });

  test('не в LOCAL_BACKUP_KEYS: база производная, в бэкап не едет', () => {
    assert.ok(!LOCAL_BACKUP_KEYS.includes(DASH_SEEN_KEY));
  });

  test('импорт бэкапа сбрасывает базу, иначе барабан докрутит «до → после импорта»', () => {
    const src = code('js/profile.js');
    const at = src.indexOf('async function _onImportFile');
    assert.ok(at >= 0, '_onImportFile пропал');
    assert.match(
      src.slice(at, at + 600),
      /await importBackupJson\([^)]*\);\s*clearSeen\(\)/,
      'clearSeen() сразу после importBackupJson'
    );
  });

  test('база пишется только под флагом и при видимом Home', () => {
    const src = code('js/dashboard.js');
    assert.match(src, /const dr = bootOn \? await _loadDigitRoll\(\) : null/);
    assert.match(src, /const roll = !!dr && screen\.classList\.contains\('active'\)/);
    assert.match(src, /if \(roll\) dr\.writeSeen\(shown\)/);
    assert.equal(
      (src.match(/writeSeen\(/g) || []).length,
      1,
      'писать базу можно только в одном месте'
    );
  });

  test('модуль не в бут-графе: dashboard.js тянет его динамически, не статическим импортом', () => {
    const src = code('js/dashboard.js');
    assert.doesNotMatch(
      src,
      /^import[^;]*digit-roll/m,
      'статический импорт втянул бы модуль в бут-граф'
    );
    assert.match(src, /import\('\.\/shared\/digit-roll\.js'\)/);
    assert.doesNotMatch(
      readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
      /digit-roll/,
      'в modulepreload ему делать нечего'
    );
  });
});
