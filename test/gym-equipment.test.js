// FIELD-6 — чек-лист снарядов: отсев упражнений и строка коуча.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const {
  EQUIPMENT_KINDS, COACH_EQUIPMENT_CAP, normalizeOff, kindOf, splitByEquipment, coachEquipment,
  pickFromLibrary, equipLabelKey,
} = await import('../js/shared/gym-equipment.js');

const LIB = JSON.parse(fs.readFileSync(new URL('../exercises-library.json', import.meta.url), 'utf8')).exercises;

test('EQUIPMENT_KINDS — ровно множество значений equipment библиотеки', () => {
  const lib = [...new Set(LIB.map((e) => e.equipment))].sort();
  assert.deepEqual([...EQUIPMENT_KINDS].sort(), lib);
});

test('normalizeOff: мусор отброшен, дубли схлопнуты, порядок канонический', () => {
  assert.deepEqual(normalizeOff(null), []);
  assert.deepEqual(normalizeOff('barbell'), []);
  assert.deepEqual(normalizeOff(['cable', 'nope', 'barbell', 'cable']), ['barbell', 'cable']);
});

test('kindOf: без разметки — other', () => {
  assert.equal(kindOf({ equipment: 'Barbell ' }), 'barbell');
  assert.equal(kindOf({}), 'other');
  assert.equal(kindOf({ equipment: 'trx' }), 'other');
});

test('splitByEquipment: пустой чек-лист ничего не прячет', () => {
  const { kept, hidden } = splitByEquipment(LIB, []);
  assert.equal(kept.length, LIB.length);
  assert.equal(hidden.length, 0);
});

test('splitByEquipment: выключенный вид уходит в hidden целиком, сумма сохраняется', () => {
  const { kept, hidden } = splitByEquipment(LIB, ['barbell', 'cable']);
  assert.ok(hidden.length > 0);
  assert.equal(kept.length + hidden.length, LIB.length);
  assert.ok(kept.every((e) => e.equipment !== 'barbell' && e.equipment !== 'cable'));
  assert.ok(hidden.every((e) => e.equipment === 'barbell' || e.equipment === 'cable'));
});

test('splitByEquipment: всё выключено — kept пуст, причина видна по hidden', () => {
  const { kept, hidden } = splitByEquipment(LIB, EQUIPMENT_KINDS);
  assert.equal(kept.length, 0);
  assert.equal(hidden.length, LIB.length);
});

test('coachEquipment: пусто → "gym" байт в байт, как старый пресет', () => {
  assert.equal(coachEquipment([]), 'gym');
  assert.equal(coachEquipment(undefined), 'gym');
});

test('coachEquipment: перечень видов', () => {
  assert.equal(coachEquipment(['cable', 'barbell']), 'gym, no barbell, cable');
});

test('coachEquipment: любое подмножество из 10 видов влезает в cap 40', () => {
  for (let mask = 1; mask < 1 << EQUIPMENT_KINDS.length; mask++) {
    const off = EQUIPMENT_KINDS.filter((_, i) => mask & (1 << i));
    const s = coachEquipment(off);
    assert.ok(s.length <= COACH_EQUIPMENT_CAP, `${s} (${s.length})`);
    assert.ok(s.startsWith('gym, no '), s);
  }
  assert.match(coachEquipment(EQUIPMENT_KINDS), /\+\d+$/);
});

test('pickFromLibrary: пустой чек-лист — отбор как без FIELD-6, порядок тот же', () => {
  const match = (e) => e.category === 'push';
  const r = pickFromLibrary(LIB, [], match);
  assert.deepEqual(r.shown, LIB.filter(match));
  assert.equal(r.hiddenCount, 0);
  assert.equal(r.emptyByEquipment, false);
});

test('pickFromLibrary: снаряды отсеваются до фильтра экрана, скрытое считается по нему же', () => {
  const match = (e) => e.category === 'push';
  const r = pickFromLibrary(LIB, ['barbell'], match);
  assert.ok(r.shown.every((e) => kindOf(e) !== 'barbell'));
  assert.equal(r.hiddenCount, LIB.filter((e) => match(e) && kindOf(e) === 'barbell').length);
  assert.ok(r.hiddenCount > 0);
});

test('pickFromLibrary: пусто из-за снарядов отличается от пустого поиска', () => {
  const all = [...EQUIPMENT_KINDS];
  const r = pickFromLibrary(LIB, all, () => true);
  assert.equal(r.shown.length, 0);
  assert.equal(r.emptyByEquipment, true);
  const miss = pickFromLibrary(LIB, ['barbell'], () => false);
  assert.equal(miss.shown.length, 0);
  assert.equal(miss.emptyByEquipment, false, 'поиск без совпадений — не причина «снаряды»');
});

test('equipLabelKey: у каждого вида есть подпись в ru/en/el', async () => {
  assert.equal(equipLabelKey('smith machine'), 'equip.kind.smith-machine');
  const src = fs.readFileSync(new URL('../js/locale.store.js', import.meta.url), 'utf8')
    + fs.readFileSync(new URL('../js/locale.el.js', import.meta.url), 'utf8');
  for (const k of EQUIPMENT_KINDS) {
    const hits = src.split(`'${equipLabelKey(k)}'`).length - 1;
    assert.equal(hits, 3, `${k}: ${hits} словаря из 3`);
  }
});
