/**
 * Guard: SAST-конфиг снимает шум, но не границы доверия.
 *
 * `eslint-plugin-security` давал 344 предупреждения при нуле ошибок, из них
 * 240 — `detect-object-injection` на обычной индексации своими же ключами в
 * UI-коде. Такой гейт не читают, и в нём утонули 57 живых `no-unused-vars`.
 * Правило снято там, где срабатывание структурно ложное (js/**, test/**,
 * scripts/**), и оставлено там, где данные приходят извне.
 *
 * Отсюда риск, который сторожит этот файл: следующая правка конфига «чтобы
 * стало совсем тихо» снимет правило и с границ тоже — молча, потому что
 * `npm run lint` от этого только зеленее. THREAT_MODEL держит защиту от
 * Prototype Pollution структурной (Map + числовые индексы + IDB-ключи), и
 * линтер здесь — второй глаз, а не первый.
 *
 * Проверяем ЭФФЕКТИВНЫЙ конфиг через API ESLint, а не грепом по файлу:
 * во flat-config порядок блоков решает, и греп на это слеп.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Файлы, где обращение по строковому ключу обязано быть прочитано глазом. */
const TRUST_BOUNDARY = [
  'server.js',
  'routes/coach.js',
  'lib/aiOrchestrator.js',
  'js/shared/sync-merge.js',
  'js/shared/integrity.js',
  'js/db/backup.js',
];

/** Файлы, где правило — заведомый шум: индексация своими же ключами. */
const NOISE_ZONE = ['js/dashboard.js', 'js/workout.store.js', 'test/events.test.js'];

const severityOf = async (file, rule) => {
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const cfg = await eslint.calculateConfigForFile(path.join(REPO_ROOT, file));
  const entry = cfg.rules?.[rule];
  if (entry === undefined) return 'off';
  const level = Array.isArray(entry) ? entry[0] : entry;
  return typeof level === 'number' ? ['off', 'warn', 'error'][level] : level;
};

test('sast: detect-object-injection жив на границах доверия', async () => {
  for (const file of TRUST_BOUNDARY) {
    assert.ok(existsSync(path.join(REPO_ROOT, file)), `${file} нет — список границ протух`);

    const level = await severityOf(file, 'security/detect-object-injection');
    assert.notEqual(
      level,
      'off',
      `security/detect-object-injection выключен для ${file}. Это файл, куда данные приходят ` +
        `извне (реплики sync / импорт бэкапа / запрос клиента). Снимать правило здесь можно ` +
        `только вместе с правкой docs/THREAT_MODEL.md — иначе документ начнёт декларировать ` +
        `контроль, которого нет.`
    );
  }
});

test('sast: detect-object-injection снят там, где он шум', async () => {
  for (const file of NOISE_ZONE) {
    const level = await severityOf(file, 'security/detect-object-injection');
    assert.equal(
      level,
      'off',
      `security/detect-object-injection снова включён для ${file} — это возвращает ~240 ` +
        `предупреждений, в которых тонет сигнал.`
    );
  }
});

test('sast: у ESLint ровно один конфиг, без легаси-копии', () => {
  const legacy = ['.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yml'];

  assert.ok(existsSync(path.join(REPO_ROOT, 'eslint.config.js')), 'нет eslint.config.js');

  for (const name of legacy) {
    assert.equal(
      existsSync(path.join(REPO_ROOT, name)),
      false,
      `${name} — вторая копия правил линтера. ESLint 10 её не читает вообще, поэтому она ` +
        `не ломается, а тихо расходится с eslint.config.js и вводит в заблуждение. ` +
        `Тот же класс, что протухшая мета-CSP.`
    );
  }
});
