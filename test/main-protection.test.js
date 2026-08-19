/**
 * Гейт для вердикта о защите `main` (scripts/main-protection.mjs).
 *
 * Правка делает проверку МЯГЧЕ в одном месте: снятый потолок `enforce_admins`
 * перестал быть FAIL. Смягчённое правило без теста протухает молча — завтра кто-то
 * «упростит» ветку, и preflight начнёт отвечать OK на дырявую защиту. Поэтому здесь
 * пришпилены обе границы: что именно стало WARN и что осталось FAIL.
 *
 * Красный baseline: до правки случай «чеки на месте, потолок снят» давал FAIL —
 * тест «потолок снят намеренно» это фиксирует.
 *
 * Сети не требует: вердикт — чистая функция от тела ответа GitHub.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { judgeProtection, REQUIRED_CHECKS } from '../scripts/main-protection.mjs';

/** Тело ответа GitHub в той форме, в какой его читает preflight. */
const body = ({ contexts = REQUIRED_CHECKS, admins = true }) =>
  JSON.stringify({
    required_status_checks: { strict: false, contexts },
    enforce_admins: { enabled: admins },
  });

test('защиты нет вообще — FAIL', () => {
  const v = judgeProtection(null);
  assert.equal(v.level, 'FAIL');
  assert.match(v.msg, /ОТКЛЮЧЕНА/);
  assert.ok(v.hint, 'FAIL без действия — половина гарда');
});

test('потолок снят намеренно — WARN, а не FAIL', () => {
  const v = judgeProtection(body({ admins: false }));
  assert.equal(v.level, 'WARN', 'baseline: здесь был вечный FAIL, и отчёт переставали читать');
  assert.match(v.msg, /enforce_admins/, 'WARN обязан назвать, чего именно нет');
});

test('WARN про потолок называет цену обхода, а не только факт', () => {
  const v = judgeProtection(body({ admins: false }));
  assert.match(`${v.msg} ${v.hint ?? ''}`, /сторож/i, 'иначе снятый потолок читается как «можно всё»');
});

test('нет обязательного чека — FAIL, даже если потолок стоит', () => {
  const v = judgeProtection(body({ contexts: ['test'], admins: true }));
  assert.equal(v.level, 'FAIL');
  assert.match(v.msg, /e2e/, 'FAIL обязан назвать недостающий чек поимённо');
  assert.doesNotMatch(v.msg, /(^|\W)test(\W|$)/, 'присутствующий чек в недостающие не пишем');
});

test('нет ни одного чека — FAIL перечисляет все', () => {
  const v = judgeProtection(body({ contexts: [], admins: true }));
  assert.equal(v.level, 'FAIL');
  for (const c of REQUIRED_CHECKS) assert.match(v.msg, new RegExp(c));
});

test('чеки на месте и потолок стоит — OK', () => {
  const v = judgeProtection(body({ admins: true }));
  assert.equal(v.level, 'OK');
});

test('лишние чеки сверх обязательных не мешают', () => {
  const v = judgeProtection(body({ contexts: ['drift', ...REQUIRED_CHECKS], admins: true }));
  assert.equal(v.level, 'OK', 'список — минимум, а не точное совпадение');
});

test('мусор вместо JSON — WARN, а не падение', () => {
  const v = judgeProtection('<html>502</html>');
  assert.equal(v.level, 'WARN');
});

test('обязательные чеки — непустой список', () => {
  assert.ok(REQUIRED_CHECKS.length >= 1, 'пустой список превращает проверку в декорацию');
});
