/**
 * Guard for the body-measurement screen (card BS-1).
 *
 * Three things the audit found broken and this test keeps fixed:
 *   1. the bento is six tiles, not thirteen — left/right pairs collapse;
 *   2. every tile carries a change against the previous entry that had the
 *      metric, coloured by whether it is progress (waist down is good, arms up
 *      is good, weight alone is neither);
 *   3. a tap on a tile opens the full form focused on that field, so updating a
 *      whole set is one sheet — not thirteen open/save/re-render cycles.
 *
 * The view is DOM, so the logic under it lives in js/body-stats.core.js and is
 * tested here; the single-form wiring is checked against the view source.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = await import('../js/body-stats.core.js');

/** Entry fixture — date plus whatever fields the case needs. */
const e = (date, fields) => ({ date, ...fields });

describe('bento', () => {
  test('is six tiles, and every tile maps to real input fields', () => {
    assert.equal(C.BS_BENTO.length, 6, 'бенто — шесть плиток (BS-1), не тринадцать');
    const known = new Set(C.BS_FIELDS.map((f) => f.id));
    for (const cell of C.BS_BENTO) {
      assert.ok(cell.source.length > 0, `${cell.id}: пустой source`);
      for (const id of cell.source) assert.ok(known.has(id), `${cell.id}: нет поля ${id}`);
    }
  });

  test('left/right pairs collapse into one averaged value', () => {
    const arms = C.BS_BENTO.find((c) => c.id === 'arms');
    assert.deepEqual(arms.source, ['arm_l', 'arm_r']);
    assert.equal(C.cellValue({ arm_l: 40, arm_r: 41 }, arms), 40.5);
  });

  test('a half-filled entry still reads — one side is enough', () => {
    const arms = C.BS_BENTO.find((c) => c.id === 'arms');
    assert.equal(C.cellValue({ arm_l: 40 }, arms), 40);
    assert.equal(C.cellValue({}, arms), null);
    assert.equal(C.cellValue(null, arms), null);
  });

  test('every tile sends the tap to a field the form can focus', () => {
    const inputs = new Set(C.BS_INPUT_FIELDS.map((f) => f.id));
    for (const cell of C.BS_BENTO) {
      const target = C.cellFocusField(cell.id);
      assert.ok(inputs.has(target), `${cell.id} → ${target}: такого поля нет в форме`);
    }
  });

  test('the derived body-fat tile sends the user to its inputs, not to itself', () => {
    // body_fat is computed and has no input — focusing it would open the sheet
    // with nothing selected.
    assert.notEqual(C.cellFocusField('body_fat'), 'body_fat');
  });
});

describe('form', () => {
  test('every input field appears in exactly one section', () => {
    const listed = C.BS_FORM_SECTIONS.flatMap((s) => s.fields);
    assert.equal(new Set(listed).size, listed.length, 'поле продублировано в секциях');
    assert.deepEqual(
      [...listed].sort(),
      C.BS_INPUT_FIELDS.map((f) => f.id).sort(),
      'форма обязана покрывать все вводимые поля — иначе метрика недостижима'
    );
  });

  test('prefill reaches back past the newest entry', () => {
    // Hips were last measured two entries ago; coming up empty would mean
    // retyping a number that has not changed.
    const entries = [e('2026-07-20', { waist: 82 }), e('2026-07-01', { waist: 86, hips: 97 })];
    assert.deepEqual(C.latestValues(entries), { waist: 82, hips: 97 });
  });

  test('body fat is derived, never typed', () => {
    assert.ok(!C.BS_INPUT_FIELDS.some((f) => f.id === 'body_fat'));
    assert.ok(C.BS_FIELDS.find((f) => f.id === 'body_fat').computed);
  });
});

describe('trend', () => {
  const entries = [
    e('2026-07-20', { waist: 82, arm_l: 41, arm_r: 41, weight: 78 }),
    e('2026-07-10', { waist: 84 }), // no arms this time
    e('2026-07-01', { waist: 86, arm_l: 40, arm_r: 40, weight: 80 }),
  ];
  const waist = C.BS_BENTO.find((c) => c.id === 'waist');
  const arms = C.BS_BENTO.find((c) => c.id === 'arms');
  const weight = C.BS_BENTO.find((c) => c.id === 'weight');

  test('delta compares against the previous entry that HAD the metric', () => {
    // Arms were skipped on 2026-07-10; the change must still be +1 vs 07-01,
    // not "no data".
    assert.deepEqual(C.cellDelta(entries, arms), { diff: 1, tone: 'good', since: '2026-07-01' });
  });

  test('colour answers "is this progress", not "is this up"', () => {
    assert.equal(C.cellDelta(entries, waist).diff, -2);
    assert.equal(C.cellDelta(entries, waist).tone, 'good', 'талия вниз — прогресс');
    assert.equal(C.cellDelta(entries, arms).tone, 'good', 'руки вверх — прогресс');
    assert.equal(C.toneFor('down', 3), 'warn');
    assert.equal(C.toneFor('up', -3), 'warn');
  });

  test('weight alone is neither good nor bad', () => {
    assert.equal(C.cellDelta(entries, weight).diff, -2);
    assert.equal(C.cellDelta(entries, weight).tone, 'flat');
  });

  test('a single entry has no trend', () => {
    assert.equal(C.cellDelta([entries[0]], waist), null);
    assert.equal(C.sparkPoints([84], 100, 38), '');
  });

  test('history rows carry their own change, per position', () => {
    assert.equal(C.fieldDeltaAt(entries, 'waist', 0).diff, -2);
    assert.equal(C.fieldDeltaAt(entries, 'waist', 1).diff, -2);
    assert.equal(
      C.fieldDeltaAt(entries, 'waist', 2),
      null,
      'у самой старой записи не с чем сравнивать'
    );
  });

  test('series runs oldest → newest, so the sparkline reads left to right', () => {
    assert.deepEqual(
      C.cellSeries(entries, waist).map((p) => p.v),
      [86, 84, 82]
    );
  });

  test('entries are sorted defensively — storage order is not trusted', () => {
    const shuffled = [entries[1], entries[2], entries[0]];
    assert.deepEqual(
      C.sortEntries(shuffled).map((x) => x.date),
      entries.map((x) => x.date)
    );
  });
});

describe('sparkline', () => {
  test('points stay inside the box, flat series included', () => {
    const pts = C.sparkPoints([80, 82, 81], 100, 38)
      .split(' ')
      .map((p) => p.split(',').map(Number));
    assert.equal(pts.length, 3);
    assert.equal(pts[0][0], 0);
    assert.equal(pts[2][0], 100);
    for (const [, y] of pts) assert.ok(y >= 0 && y <= 38, `y=${y} вне бокса`);
    // A flat series must not divide by zero.
    for (const [, y] of C.sparkPoints([80, 80], 100, 38)
      .split(' ')
      .map((p) => p.split(',').map(Number))) {
      assert.ok(Number.isFinite(y));
    }
  });
});

describe('body fat', () => {
  test('Navy formula answers only when it has the inputs', () => {
    assert.equal(C.bodyFatNavy({ sex: 'm', heightCm: 180, waistCm: 84, neckCm: 38 }) > 0, true);
    assert.equal(C.bodyFatNavy({ sex: 'm', heightCm: null, waistCm: 84, neckCm: 38 }), null);
    assert.equal(
      C.bodyFatNavy({ sex: 'f', heightCm: 170, waistCm: 74, neckCm: 32 }),
      null,
      'женская формула требует бёдра'
    );
  });

  test('enrich fills the derived value so the tile can show a trend', () => {
    const rows = C.enrichEntries(
      [e('2026-07-01', { waist: 86, neck: 38 }), e('2026-07-20', { waist: 82, neck: 38 })],
      { sex: 'm', heightCm: 180 }
    );
    assert.equal(rows[0].date, '2026-07-20');
    assert.ok(
      rows[0].body_fat > 0 && rows[1].body_fat > rows[0].body_fat,
      'уже талия — ниже процент жира'
    );
    const bf = C.BS_BENTO.find((c) => c.id === 'body_fat');
    assert.equal(C.cellDelta(rows, bf).tone, 'good');
  });

  test('enrich does not invent a value it cannot compute', () => {
    const rows = C.enrichEntries([e('2026-07-01', { waist: 86 })], { sex: 'm', heightCm: 180 });
    assert.equal(rows[0].body_fat, undefined);
  });
});

describe('view wiring', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'js', 'body-stats.js'), 'utf8');

  test('a tile opens the whole form, focused — not a one-field modal', () => {
    assert.match(
      src,
      /data-action="bs:edit" data-focus="\$\{cellFocusField\(cell\.id\)\}"/,
      'плитка обязана открывать общую форму с фокусом на поле (BS-1)'
    );
    assert.match(src, /on\('bs:edit',\s*\(el\)\s*=>\s*openForm\(el\.dataset\.focus/);
  });

  test('a partial update does not blank the other tiles', () => {
    // Logging only waist today must not turn Chest/Arms/Thighs into "--" while
    // their delta pill still claims a change.
    assert.match(
      src,
      /points\[points\.length - 1\]\.v/,
      'плитка обязана показывать последнее известное значение, а не значение последней записи'
    );
  });

  test('the re-render after save keeps the host it was mounted into', () => {
    // The athlete room passes its own node; a bare renderBodyStats() used to
    // fall back to #body-stats-root and silently leave stale values on screen.
    assert.match(
      src,
      /_root = root/,
      'хост не запоминается — ре-рендер в комнате атлета потеряет цель'
    );
    assert.match(src, /targetEl \|\| _root \|\| document\.getElementById/);
  });

  test('an empty input means "leave as is", not "erase"', () => {
    assert.match(
      src,
      /if \(raw === ''\) continue;/,
      'форма предзаполнена — очищенное поле не должно стирать историю'
    );
  });

  test('only touched fields are saved, and an untouched save writes nothing', () => {
    // Prefill reaches back through the log; writing it all back would stamp
    // today onto numbers nobody re-measured and flatten every delta to zero.
    assert.match(src, /inp\.dataset\.dirty !== '1'/, 'сохраняются только тронутые поля');
    assert.match(src, /t\.dataset\.dirty = '1'/, 'некому пометить поле тронутым');
    assert.match(
      src,
      /if \(changed\) \{\s*\n\s*if \(!existing\) stored\.push\(entry\);/,
      'пустая запись не должна попадать в историю'
    );
  });

  test('the form sheet is CSS-driven — a JS spring must not fight the transition', () => {
    assert.doesNotMatch(
      src,
      /from '\.\/shared\/spring\.js'/,
      'Spring на этом шите снова введёт dual-driver с CSS transition'
    );
    assert.doesNotMatch(
      src,
      /sheet\.style\.transform/,
      'инлайн transform перебивает transition и возвращает дёрганье'
    );
    const css = fs.readFileSync(path.join(REPO_ROOT, 'css', 'body-stats.css'), 'utf8');
    assert.match(
      css,
      /\.modal-overlay\.bs-overlay \{[\s\S]*?backdrop-filter:\s*none/,
      'оверлей не должен наследовать blur(8px) поверх комнаты атлета'
    );
    assert.match(
      css,
      /\.modal-overlay\.bs-overlay \.modal-sheet \{[\s\S]*?transition:\s*transform 0\.26s var\(--ease-decel\)/,
      'шит едет как .ar-sheet / .claude-sheet, одним драйвером'
    );
  });
});
