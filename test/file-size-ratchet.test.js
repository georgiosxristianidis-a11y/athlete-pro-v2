// Храповик размера js-файлов (AUD-4).
//
// Есть гарды на число файлов, слушатели и цвета, на размер модуля не было: JS рос
// без тормоза. Здесь потолок = текущее число строк (`wc -l`, то есть число '\n').
//  - Гиганты (>1000 строк) держат поимённый потолок и не растут.
//  - Остальные отслеживаемые js/**/*.js делят общий потолок: новый файл не рождается гигантом.
// Резать гиганты — отдельные карточки, по одному файлу. После нарезки потолок ОПУСКАТЬ
// (тест подскажет), поднимать нельзя: не влезло — выносить в модуль.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Поимённые потолки гигантов (пути сверены по `git ls-files`).
const GIANT_CEILINGS = {
  'js/workout.store.js': 1651,
  'js/locale.store.js': 1306,
  'js/dashboard.js': 1303,
  'js/intel.view.js': 1179,
  'js/shared/athlete-room.js': 1166,
  'js/workout.view/handlers.js': 1042,
};

// Общий потолок = максимум среди не-гигантов на момент ввода (js/workout.view/modals.js).
const DEFAULT_CEILING = 895;
const GIANT_THRESHOLD = 1000;

// Оба паттерна: `js/**/*.js` один пропускает top-level (js/dashboard.js).
function trackedJs() {
  const out = execFileSync('git', ['ls-files', 'js/*.js', 'js/**/*.js'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return [
    ...new Set(
      out
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ].sort();
}

// Как `wc -l`: число '\n'; '\r' не считаем, CRLF-чекаут на Windows не влияет.
function countLines(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r/g, '');
  let n = 0;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
  return n;
}

test('потолки гигантов: файл существует (удалён/переименован — обновить список)', () => {
  const tracked = new Set(trackedJs());
  for (const name of Object.keys(GIANT_CEILINGS)) {
    assert.ok(
      tracked.has(name),
      `${name} в GIANT_CEILINGS, но не отслеживается git: файл удалён или переименован — ` +
        'обновить test/file-size-ratchet.test.js (перенести потолок на новое имя или убрать запись)'
    );
  }
});

test('гиганты не растут (потолок поимённо)', (t) => {
  for (const [name, ceiling] of Object.entries(GIANT_CEILINGS)) {
    const lines = countLines(name);
    assert.ok(
      lines <= ceiling,
      `${name}: ${lines} строк > потолка ${ceiling}. Не раздувать гигант — вынести в модуль.`
    );
    if (lines < ceiling) {
      t.diagnostic(`${name}: ${lines} < потолка ${ceiling} — опустить потолок до ${lines}`);
    }
  }
});

test(`остальные js-файлы не длиннее ${DEFAULT_CEILING} строк`, () => {
  const over = [];
  for (const rel of trackedJs()) {
    if (rel in GIANT_CEILINGS) continue;
    const lines = countLines(rel);
    if (lines > DEFAULT_CEILING) over.push(`${rel}: ${lines}`);
  }
  assert.deepEqual(
    over,
    [],
    `Файл(ы) выше общего потолка ${DEFAULT_CEILING}: новый файл не рождается гигантом, ` +
      'существующий не растёт сверх. Резать модуль, а не поднимать потолок. ' +
      `Больше ${GIANT_THRESHOLD} строк — только поимённый потолок отдельным PR.`
  );
});

test('поимённый потолок только у настоящих гигантов', () => {
  for (const [name, ceiling] of Object.entries(GIANT_CEILINGS)) {
    assert.ok(
      ceiling > GIANT_THRESHOLD,
      `${name}: потолок ${ceiling} ≤ ${GIANT_THRESHOLD} — запись лишняя, файл попадает под общий потолок`
    );
  }
});
