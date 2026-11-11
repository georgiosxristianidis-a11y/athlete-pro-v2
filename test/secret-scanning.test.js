/**
 * Гейт для сторожа secret scanning (scripts/secret-scanning.mjs, карточка AUD-17a).
 *
 * Репозиторий публичный, push protection выключается одной галкой без следа. Сторож —
 * правило в чекауте и умереть может так же молча, как умирали хуки, поэтому здесь
 * пришпилены обе границы: выключенная настройка = FAIL, включённая = OK, «не видно»
 * (нет сети, нет прав, мусор в ответе) = WARN-пропуск, как у сторожа дефолт-ветки.
 *
 * Сети не требует: вердикт — чистая функция от тела ответа `gh api repos/{owner}/{repo}`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { judgeSecretScanning, REQUIRED_SECRET_SETTINGS } from '../scripts/secret-scanning.mjs';

/** Тело ответа GitHub в форме замера 2026-11-09 (non_provider/validity — disabled). */
const body = ({ scanning = 'enabled', push = 'enabled', omit = [] } = {}) => {
  const sa = {
    secret_scanning: { status: scanning },
    secret_scanning_push_protection: { status: push },
    secret_scanning_non_provider_patterns: { status: 'disabled' },
    secret_scanning_validity_checks: { status: 'disabled' },
  };
  for (const k of omit) delete sa[k];
  return JSON.stringify({ full_name: 'o/r', security_and_analysis: sa });
};

test('обе настройки enabled — OK (необязательные disabled не мешают)', () => {
  assert.equal(judgeSecretScanning(body()).level, 'OK');
});

test('secret_scanning disabled — FAIL с подсказкой', () => {
  const v = judgeSecretScanning(body({ scanning: 'disabled' }));
  assert.equal(v.level, 'FAIL');
  assert.match(v.msg, /secret_scanning=disabled/);
  assert.ok(v.hint, 'FAIL без действия — половина гарда');
});

test('push protection disabled — FAIL', () => {
  const v = judgeSecretScanning(body({ push: 'disabled' }));
  assert.equal(v.level, 'FAIL');
  assert.match(v.msg, /secret_scanning_push_protection=disabled/);
});

test('обе выключены — FAIL называет обе', () => {
  const v = judgeSecretScanning(body({ scanning: 'disabled', push: 'disabled' }));
  assert.equal(v.level, 'FAIL');
  for (const k of REQUIRED_SECRET_SETTINGS) assert.ok(v.msg.includes(`${k}=`), k);
});

test('подполя нет при видимом security_and_analysis — FAIL, а не молчаливый OK', () => {
  const v = judgeSecretScanning(body({ omit: ['secret_scanning_push_protection'] }));
  assert.equal(v.level, 'FAIL');
  assert.match(v.msg, /нет поля/);
});

test('нет ответа (оффлайн / нет gh / нет прав) — WARN-пропуск', () => {
  assert.equal(judgeSecretScanning(null).level, 'WARN');
  assert.equal(judgeSecretScanning('').level, 'WARN');
});

test('security_and_analysis не отдан (не админ) — WARN, а не FAIL', () => {
  assert.equal(judgeSecretScanning(JSON.stringify({ full_name: 'o/r' })).level, 'WARN');
  assert.equal(judgeSecretScanning(JSON.stringify({ security_and_analysis: null })).level, 'WARN');
});

test('ответ не JSON — WARN', () => {
  assert.equal(judgeSecretScanning('<html>502</html>').level, 'WARN');
});
