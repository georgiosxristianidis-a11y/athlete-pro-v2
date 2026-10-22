// Фикстура GATE-DESCRIBE: тело сюиты бросает ДО первого it(). node --test на ней:
// `not ok 1 - boom`, `# tests 0`, `# fail 0`, exit 0. С it() перед броском node
// краснеет сам (`# cancelled 1`) — молча теряется только такая сюита.
// Расширение .fixture.js — мимо юнит-глоба test/*.test.js.
import { describe } from 'node:test';

describe('boom', () => {
  throw new Error('describe body threw');
});
