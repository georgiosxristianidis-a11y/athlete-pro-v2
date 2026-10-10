/**
 * Guard: DICT.en and DICT.ru must carry the same keys (LAUNCH-5 / F-2).
 *
 * A hardcoded count would go stale the moment a key is added. Both sets are
 * read from the dictionaries themselves; the assertion is set-equality.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'js', 'locale.store.js'), 'utf8');

/** Pull quoted keys out of one language block of `const DICT`. */
function dictKeys(lang) {
  const marker = `\n  ${lang}: {`;
  const start = SRC.indexOf(marker);
  assert.ok(start !== -1, `DICT.${lang} не найден в locale.store.js`);
  const from = start + marker.length;
  const end = SRC.indexOf('\n  }', from);
  assert.ok(end !== -1, `DICT.${lang} не закрыт`);
  const body = SRC.slice(from, end);
  const keys = [];
  const re = /^\s+'([^']+)':/gm;
  let m;
  while ((m = re.exec(body))) keys.push(m[1]);
  assert.ok(keys.length > 0, `DICT.${lang} пуст — парсер сломался`);
  return keys;
}

test('DICT.en и DICT.ru несут одно множество ключей', () => {
  const en = dictKeys('en');
  const ru = dictKeys('ru');
  const enSet = new Set(en);
  const ruSet = new Set(ru);
  const onlyEn = en.filter((k) => !ruSet.has(k));
  const onlyRu = ru.filter((k) => !enSet.has(k));
  assert.deepEqual(onlyEn, [], `ключи только в en: ${onlyEn.join(', ')}`);
  assert.deepEqual(onlyRu, [], `ключи только в ru: ${onlyRu.join(', ')}`);
});

test('DICT.el (js/locale.el.js) несёт ключи en и те же {плейсхолдеры}', async () => {
  const { EL } = await import('../js/locale.el.js');
  const en = dictKeys('en');
  const elKeys = Object.keys(EL);
  const elSet = new Set(elKeys);
  const enSet = new Set(en);
  assert.deepEqual(en.filter((k) => !elSet.has(k)), [], 'ключи en без перевода на el');
  assert.deepEqual(elKeys.filter((k) => !enSet.has(k)), [], 'ключи только в el');
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  const enStart = SRC.indexOf('\n  en: {');
  const enBody = SRC.slice(enStart, SRC.indexOf('\n  ru: {'));
  for (const k of en) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = enBody.match(new RegExp(String.raw`'${esc}':\s*(['"])((?:\\.|(?!\1).)*)\1`));
    assert.ok(m, `en-значение ${k} не распарсилось`);
    assert.equal(ph(EL[k]), ph(m[2]), `плейсхолдеры el расходятся с en: ${k}`);
  }
});
