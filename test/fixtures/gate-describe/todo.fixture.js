// Фикстура GATE-DESCRIBE: падающий todo даёт `not ok ... # TODO`, skip — `ok ... # SKIP`.
// node их падением не считает, обёртка тоже не должна.
import { describe, it } from 'node:test';

describe('todo and skip', () => {
  it('fails, but marked todo', { todo: true }, () => {
    throw new Error('todo is allowed to fail');
  });
  it('skipped', { skip: true }, () => {
    throw new Error('never runs');
  });
  it('passes', () => {});
});
