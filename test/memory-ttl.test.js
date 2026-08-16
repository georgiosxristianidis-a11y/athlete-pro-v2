// TTL памяти (карточка FLOW-4). Фикстура-каталог: реальная память живёт вне
// репо, тест не имеет права её трогать. Здесь проверяем ПОЛИТИКУ (что именно
// считается стейлом) и МЕХАНИКУ ПЕРЕЕЗДА (архив + переписанный индекс).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ageDays,
  computeVictims,
  parseFrontmatter,
  rewriteIndex,
  shouldArchive,
} from '../scripts/memory-core.mjs';
import { run } from '../scripts/memory-ttl.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mem-ttl-'));
}

function write(dir, name, body) {
  fs.writeFileSync(path.join(dir, name), body);
}

const fm = (type, modified) =>
  `---\nname: x\ndescription: y\nmetadata: \n  node_type: memory\n  type: ${type}\n  modified: ${modified}\n---\n\nтело\n`;

test('parseFrontmatter достаёт type и modified из вложенного metadata', () => {
  const out = parseFrontmatter(fm('project', '2026-01-01T00:00:00.000Z'));
  assert.equal(out.type, 'project');
  assert.equal(out.modified, '2026-01-01T00:00:00.000Z');
});

test('ageDays: modified из frontmatter побеждает mtime — это и есть keep-alive', () => {
  const now = Date.parse('2026-08-16T00:00:00Z');
  const front = { modified: '2026-08-10T00:00:00Z' }; // 6 дней
  const mtime = Date.parse('2026-01-01T00:00:00Z');   // 227 дней
  assert.equal(Math.round(ageDays(front, mtime, now)), 6);
});

test('shouldArchive: project старше 30 дней — да; feedback того же возраста — нет', () => {
  assert.equal(shouldArchive({ type: 'project', ageDays: 31 }), true);
  assert.equal(shouldArchive({ type: 'project', ageDays: 29 }), false);
  assert.equal(shouldArchive({ type: 'feedback', ageDays: 400 }), false);
  assert.equal(shouldArchive({ type: 'reference', ageDays: 999 }), false);
  assert.equal(shouldArchive({ type: 'user', ageDays: 999 }), false);
});

test('shouldArchive: неизвестный тип и отсутствующий возраст оставляют файл живым', () => {
  assert.equal(shouldArchive({ type: null, ageDays: 999 }), false);
  assert.equal(shouldArchive({ type: 'project', ageDays: null }), false);
});

test('rewriteIndex удаляет строки-ссылки на архивированные файлы', () => {
  const idx = [
    '# Состояние',
    '',
    '- [Живой](fresh.md) — актив',
    '- [Стейл](old.md) — закрыто',
    '',
    '# Как работать',
    '- [Правило](rule.md) — навсегда',
    '',
  ].join('\n');
  const { text, removed } = rewriteIndex(idx, ['old.md']);
  assert.equal(removed, 1);
  assert.ok(text.includes('fresh.md'));
  assert.ok(!text.includes('old.md'));
  assert.ok(text.includes('# Как работать'));
});

test('rewriteIndex схлопывает секцию, оставшуюся без единой ссылки', () => {
  const idx = ['# Состояние', '', '- [Только один](only.md) — уйдёт', '', '# Живая', '- [Есть](k.md) — тут'].join('\n');
  const { text } = rewriteIndex(idx, ['only.md']);
  assert.ok(!text.includes('# Состояние'), 'заголовок опустевшей секции должен исчезнуть');
  assert.ok(text.includes('# Живая'));
});

test('rewriteIndex идемпотентен — повторный прогон меняет 0 строк', () => {
  const idx = '# X\n- [A](a.md) — a\n- [B](b.md) — b\n';
  const once = rewriteIndex(idx, ['a.md']).text;
  const twice = rewriteIndex(once, ['a.md']);
  assert.equal(twice.removed, 0);
  assert.equal(twice.text, once);
});

test('computeVictims классифицирует по frontmatter + сейчас', () => {
  const now = Date.parse('2026-08-16T00:00:00Z');
  const entries = [
    { file: 'p-old.md', frontmatter: { type: 'project', modified: '2026-06-01T00:00:00Z' }, mtimeMs: 0 },
    { file: 'p-new.md', frontmatter: { type: 'project', modified: '2026-08-01T00:00:00Z' }, mtimeMs: 0 },
    { file: 'f-old.md', frontmatter: { type: 'feedback', modified: '2020-01-01T00:00:00Z' }, mtimeMs: 0 },
  ];
  const v = computeVictims(entries, undefined, now);
  assert.deepEqual(
    v.map((x) => x.file),
    ['p-old.md'],
  );
});

test('run --dry-run: ничего не двигает и печатает отчёт', () => {
  const dir = tmpDir();
  write(dir, 'MEMORY.md', '# Состояние\n- [Стейл](p-old.md) — старое\n- [Свежее](p-new.md) — новое\n');
  write(dir, 'p-old.md', fm('project', '2026-06-01T00:00:00Z'));
  write(dir, 'p-new.md', fm('project', '2026-08-10T00:00:00Z'));

  let buf = '';
  const stdout = { write: (s) => (buf += s) };
  const res = run({ dir, commit: false, nowIso: '2026-08-16T00:00:00Z', stdout });

  assert.equal(res.committed, false);
  assert.equal(res.victims.length, 1);
  assert.equal(res.victims[0].file, 'p-old.md');
  assert.ok(fs.existsSync(path.join(dir, 'p-old.md')), 'dry-run НЕ переносит файлы');
  assert.match(buf, /Кандидаты в архив/);
});

test('run --commit: переезд в _archive/YYYY-MM и переписанный индекс', () => {
  const dir = tmpDir();
  write(dir, 'MEMORY.md', '# Состояние\n- [Стейл](p-old.md) — старое\n- [Свежее](p-new.md) — новое\n');
  write(dir, 'p-old.md', fm('project', '2026-06-01T00:00:00Z'));
  write(dir, 'p-new.md', fm('project', '2026-08-10T00:00:00Z'));

  let buf = '';
  const stdout = { write: (s) => (buf += s) };
  run({ dir, commit: true, nowIso: '2026-08-16T00:00:00Z', stdout });

  assert.ok(!fs.existsSync(path.join(dir, 'p-old.md')), 'файл должен был уехать');
  assert.ok(fs.existsSync(path.join(dir, '_archive', '2026-06', 'p-old.md')), 'адрес архива — по дате modified');
  assert.ok(fs.existsSync(path.join(dir, 'p-new.md')), 'свежий не трогаем');

  const idx = fs.readFileSync(path.join(dir, 'MEMORY.md'), 'utf8');
  assert.ok(!idx.includes('p-old.md'));
  assert.ok(idx.includes('p-new.md'));
});

test('run: файлы в _archive/ игнорируются на повторных прогонах', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, '_archive', '2020-01'), { recursive: true });
  write(dir, '_archive/2020-01/ancient.md', fm('project', '2020-01-01T00:00:00Z'));
  write(dir, 'MEMORY.md', '# X\n- [Живое](live.md) — тут\n');
  write(dir, 'live.md', fm('feedback', '2020-01-01T00:00:00Z'));

  let buf = '';
  const stdout = { write: (s) => (buf += s) };
  const res = run({ dir, commit: false, nowIso: '2026-08-16T00:00:00Z', stdout });
  assert.equal(res.victims.length, 0, '_archive/ и feedback∞ не трогаем');
});
