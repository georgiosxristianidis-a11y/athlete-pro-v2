/**
 * AVA-1b: флаг 'avatar-ring' — тумблер в Лаборатории и светлая тема кольца.
 * Дефолт ON с 22.11 (решение Gio), тумблер без подписи рендерил бы сырой ключ lab.*.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flag, LAB_FLAGS } from '../js/flags.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('avatar-ring: в Лаборатории, дефолт ON (решение Gio 22.11)', () => {
  assert.ok(LAB_FLAGS.includes('avatar-ring'));
  assert.equal(flag('avatar-ring'), true);
});

test('avatar-ring: подписи тумблера в en, ru, el', () => {
  const store = read('js/locale.store.js');
  assert.equal(store.split("'lab.avatar-ring'").length - 1, 2, 'en + ru');
  assert.equal(store.split("'lab.avatar-ring_sub'").length - 1, 2, 'en + ru');
  const el = read('js/locale.el.js');
  assert.ok(el.includes("'lab.avatar-ring'") && el.includes("'lab.avatar-ring_sub'"));
});

test('avatar-ring: светлая тема — зазор токеном --c-bg-1, оба слоя через --ava-gap-c', () => {
  const room = read('css/athlete-room.css');
  assert.match(room, /:root\[data-theme='light'\] \.ava-ring \{ --ava-gap-c: var\(--c-bg-1\); \}/);
  assert.ok(room.includes('linear-gradient(var(--ava-gap-c), var(--ava-gap-c)) padding-box'));
  // hero профиля повторяет слои — без переменной светлый зазор там бы не сработал
  assert.ok(read('css/profile.css').includes('var(--ava-gap-c, var(--c-bg))'));
});
