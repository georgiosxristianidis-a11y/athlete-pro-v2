// VIS-1 TEST-GUARD: закон токенов из .claude/rules/design.md держится гейтом.
//
// Спек объявляет два запрета абсолютными: цвета — только через токены
// `css/base.css :root` (§ Палитра), размеры и веса — только через шкалу
// `--fs-*` / `--fw-*` (§ Типографика, решение TYPE-1). Спек при этом ссылается
// на stylelint как на исполнителя («rgba не хардкодить (ловит stylelint)»),
// а тот не ловил:
//
//   1. Правило в `.stylelintrc.json` объявлено со `severity: "warning"`,
//      поэтому `npm run lint` возвращает 0 при любом числе нарушений.
//   2. Паттерн `^rgba?\(` якорен на НАЧАЛО значения, так что сырой цвет внутри
//      составного значения — `box-shadow: 0 4px 12px rgba(...)`,
//      `border: 1px solid rgba(...)`, `linear-gradient(..., rgba(...))` —
//      не виден вовсе.
//
// Замер 2026-08-25 на f7f6c9b: в `css/` лежало 43 сырых цвета, stylelint
// показывал 18 из них и ничего не красил.
//
// Гард проводит границы ровно там, где их провёл спек, и не строже:
//
//   · Типографика — ноль. Сырых `font-size` с единицей длины и цифровых
//     `font-weight` вне base.css сейчас нет (аудит 2026-08-20 подтвердил это
//     же); тест не даёт им вернуться.
//   · Цветной hex вне base.css — ноль. Маски не в счёт: в
//     `mask-image: linear-gradient(..., #000 18px, ...)` хекс работает
//     альфа-каналом, а не цветом, и токен там бессмыслен.
//   · Цветные rgba/hsla — потолок, только вниз. Спек узаконил акцентные
//     подсветки («цветные rgba ≤20% допустимы точечно»), поэтому считаются
//     лишь те, что выше порога. Нейтральные (r=g=b) — это тени и вуали:
//     токенов глубины в `base.css` нет, требовать их было бы нечем.
//
// Область — `css/*.css`. Инлайн `<style>` в `index.html` объявляет токены
// критического пути (второй источник правды по палитре, отдельная карточка)
// и в область гарда не входит.

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, readdirSync } from 'fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSS_DIR = join(ROOT, 'css');

/** Единственный файл, которому сырые значения положены по роли: там их объявляют. */
const TOKEN_SOURCE = 'base.css';

/**
 * Потолок цветных rgba/hsla с альфой выше узаконенных 20%.
 *
 * Число только уменьшается. Починил один — опусти потолок этим же PR, иначе
 * освободившееся место молча займёт следующий сырой цвет. Тест падает и когда
 * нарушений стало БОЛЬШЕ (регресс), и когда меньше (защёлка не переставлена).
 */
const RAW_COLOR_CEILING = 14;

/** Выше этой альфы цвет перестаёт быть «точечной подсветкой» из спека. */
const ACCENT_ALPHA_MAX = 0.20;

/** Все css/*.css, кроме источника токенов. */
function cssFiles() {
  return readdirSync(CSS_DIR)
    .filter((f) => f.endsWith('.css') && f !== TOKEN_SOURCE)
    .sort();
}

/** Вырезает комментарии, сохраняя переносы — номера строк остаются честными. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Вырезает объявления масок целиком. `#000` в `mask-image` — альфа-канал
 * градиента, а не цвет; ловить его значило бы требовать токен там, где токена
 * не может быть.
 */
function stripMasks(css) {
  return css.replace(/[-\w]*mask[-\w]*\s*:[^;}]*/gi, (m) => m.replace(/[^\n]/g, ' '));
}

/** Читает файл в том виде, в котором его смотрит гард. */
function load(file) {
  const src = readFileSync(join(CSS_DIR, file), 'utf8');
  return stripMasks(stripComments(src)).split(/\r?\n/);
}

/** Альфа из четвёртого аргумента rgba/hsla: `0.3`, `30%`, либо её отсутствие. */
function alphaOf(raw) {
  if (raw === undefined) return 1;
  return raw.endsWith('%') ? parseFloat(raw) / 100 : Number(raw);
}

test('вне base.css нет сырых font-size и цифровых font-weight', () => {
  // Шкала --fs-* / --fw-* существует ради одного: размер меняется в одном месте.
  // Один `font-size: 15px`, вписанный мимо неё, шкалу не ломает заметно — он
  // ломает её тихо, и следующая правка ступени его не двигает.
  const offenders = [];

  for (const file of cssFiles()) {
    load(file).forEach((line, i) => {
      const size = line.match(/font-size\s*:\s*[^;]*?(?<![\w-])(\d*\.?\d+)(px|rem|em|pt)\b/i);
      if (size) offenders.push(`css/${file}:${i + 1} → font-size: ${size[1]}${size[2]} (бери ступень --fs-*)`);

      const weight = line.match(/font-weight\s*:\s*(\d+)/i);
      if (weight) offenders.push(`css/${file}:${i + 1} → font-weight: ${weight[1]} (бери --fw-md/--fw-bold/--fw-black)`);
    });
  }

  assert.deepEqual(
    offenders,
    [],
    'Типографика мимо шкалы из css/base.css :root ' +
    '(.claude/rules/design.md § Типографика):\n  ' + offenders.join('\n  '),
  );
});

test('вне base.css нет цветного hex — палитра живёт в токенах', () => {
  const offenders = [];

  for (const file of cssFiles()) {
    load(file).forEach((line, i) => {
      for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        offenders.push(`css/${file}:${i + 1} → ${m[0]}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    'Сырой хекс вне css/base.css. Цвет обязан приезжать токеном var(--c-*), ' +
    'иначе он не переживёт светлую тему (.claude/rules/design.md § Палитра):\n  ' +
    offenders.join('\n  '),
  );
});

test('цветные rgba выше 20% держатся под потолком и только снижаются', () => {
  // Спек разрешает акцентную подсветку цветным rgba ≤20% точечно. Всё, что
  // плотнее, — уже не подсветка, а цвет мимо палитры. Нейтральные (r=g=b)
  // не в счёт: это тени и вуали, токенов глубины в base.css нет.
  const offenders = [];

  for (const file of cssFiles()) {
    load(file).forEach((line, i) => {
      const re = /(rgb|hsl)a?\(\s*([\d.]+)[,\s]+([\d.]+%?)[,\s]+([\d.]+%?)(?:[,\s/]+([\d.]+%?))?\s*\)/gi;
      for (const m of line.matchAll(re)) {
        const [r, g, b] = [m[2], m[3], m[4]];
        if (m[1].toLowerCase() === 'rgb' && r === g && g === b) continue; // нейтраль: тень
        if (alphaOf(m[5]) <= ACCENT_ALPHA_MAX) continue;                  // узаконенная подсветка
        offenders.push(`css/${file}:${i + 1} → ${m[0]}`);
      }
    });
  }

  const count = offenders.length;

  assert.ok(
    count <= RAW_COLOR_CEILING,
    `Сырых цветных rgba выше ${ACCENT_ALPHA_MAX * 100}% стало ${count} при потолке ` +
    `${RAW_COLOR_CEILING}. Новый цвет заводится токеном в css/base.css :root, ` +
    `не значением по месту:\n  ${offenders.join('\n  ')}`,
  );

  assert.ok(
    count >= RAW_COLOR_CEILING,
    `Сырых цветных rgba осталось ${count} — меньше потолка ${RAW_COLOR_CEILING}. ` +
    `Опусти RAW_COLOR_CEILING до ${count} в этом же PR: потолок — защёлка, ` +
    'непереставленный он молча пускает назад ровно столько же.',
  );
});

test('правило запрета сырых цветов не исчезло из .stylelintrc.json', () => {
  // Гард и линтер отвечают на один вопрос с разных сторон, и слабое звено —
  // конфиг: снять из него правило дешевле, чем починить цвет. Тест не даёт
  // ослабить линтер молча, заодно фиксируя, что base.css в его ignoreFiles.
  const cfg = JSON.parse(readFileSync(join(ROOT, '.stylelintrc.json'), 'utf8'));
  const rule = cfg.rules?.['declaration-property-value-disallowed-list'];

  assert.ok(rule, 'declaration-property-value-disallowed-list пропал из .stylelintrc.json');

  const patterns = JSON.stringify(rule[0] ?? {});
  assert.match(patterns, /#\[0-9a-fA-F\]/, 'запрет сырого hex вымыт из .stylelintrc.json');
  assert.match(patterns, /rgba\?/, 'запрет сырого rgba вымыт из .stylelintrc.json');

  assert.ok(
    (cfg.ignoreFiles ?? []).includes('css/base.css'),
    'css/base.css обязан оставаться в ignoreFiles — там токены и объявляются',
  );
});
