// DRUM-TOUCH-1: барабан set logger не крутился пальцем на iPhone 17, работая
// при этом безупречно на Android. Полевой репорт Gio, 2026-08-05.
//
// Механика бага. Скроллит не `.drum-wrap`, а вложенный `.drum-track`
// (`overflow-y:auto` + scroll-snap); собственных touch/pointer-обработчиков у
// барабана нет вообще — весь жест нативный. Движки расходятся в том, докуда
// идти по цепочке предков за `touch-action` для вложенного скроллера: Blink
// доходит только до самого скроллера, поэтому `touch-action:none` на обёртке
// для него no-op (проверено экспериментом: свайп скроллит трек при `none` на
// обёртке и блокируется при `none`/`pan-x` на самом треке). WebKit строже —
// жест умирал, не дойдя до трека, и барабан вставал колом на всех браузерах
// iOS разом, потому что в App Store у них общий движок.
//
// Инвариант здесь шире одного значения: НИ обёртка, ни трек не имеют права
// запрещать вертикальный тач-жест. Цена ошибки асимметрична — на Android такая
// регрессия невидима (свойство там no-op), и заметить её может только полевой
// заход с iPhone в руках.

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(__dirname, '..', 'css', 'workout.css'), 'utf8');

/** Тело правила по точному селектору, с вырезанными комментариями. */
function ruleBody(selector) {
  const re = new RegExp(`(^|\\})\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'm');
  const m = css.match(re);
  assert.ok(m, `правило ${selector} не найдено в css/workout.css`);
  return m[2].replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Последнее объявление touch-action в правиле, или null, если его там нет. */
function touchAction(selector) {
  const decls = [...ruleBody(selector).matchAll(/touch-action\s*:\s*([^;}]+)/g)];
  return decls.length ? decls[decls.length - 1][1].trim() : null;
}

// Значения, при которых вертикальный тач-жест по барабану не проходит.
const KILLS_VERTICAL_PAN = ['none', 'pan-x', 'pan-left', 'pan-right', 'manipulation'];

for (const selector of ['.drum-wrap', '.drum-track']) {
  test(`DRUM-TOUCH-1: ${selector} не запрещает вертикальный тач-жест`, () => {
    const ta = touchAction(selector);
    if (ta === null) return; // отсутствие = auto, вертикальный жест разрешён
    for (const bad of KILLS_VERTICAL_PAN) {
      assert.notEqual(
        ta, bad,
        `${selector} { touch-action: ${ta} } убивает барабан на iOS ` +
        `(на Android это no-op — регрессию поймает только поле). Нужен pan-y или auto.`,
      );
    }
  });
}

test('DRUM-TOUCH-1: .drum-wrap несёт именно pan-y — горизонтальный свайп и pinch по-прежнему заблокированы', () => {
  assert.equal(touchAction('.drum-wrap'), 'pan-y');
});

test('DRUM-TOUCH-1: скроллит по-прежнему .drum-track — если скроллер переедет, правило выше надо пересматривать', () => {
  assert.match(ruleBody('.drum-track'), /overflow-y\s*:\s*auto/, '.drum-track перестал быть скроллером');
  assert.match(ruleBody('.drum-wrap'), /overflow\s*:\s*hidden/, '.drum-wrap перестал быть непрокручиваемой обёрткой');
});
