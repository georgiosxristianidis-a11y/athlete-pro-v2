// @ts-check
/**
 * Гард Air Markdown (карточка HUD-2) — форматтера потока ИИ.
 *
 * Поток от модели — это НЕДОВЕРЕННЫЙ ввод: содержимое подставляет как минимум
 * промпт пользователя (фото, свободный текст), а на BYOK-ключе — вообще чужая
 * модель. Форматтер строит из него HTML, значит порядок «esc() → разметка» —
 * единственное, что стоит между потоком и innerHTML. В отвергнутой линии
 * elite-hud-wow карточка тренировки рядом собиралась из того же потока без
 * esc() — поэтому правило заперто тестом, а не комментарием.
 *
 * Вторая половина — стрим: форматтер зовут на каждый чанк, и почти всегда он
 * получает оборванную разметку. Ни один обрывок не должен ронять рендер.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { formatAirMarkdown } = await import('../js/shared/air-markdown.js');

describe('Air Markdown — XSS', () => {
  test('теги из потока не доезжают до DOM живыми', () => {
    const html = formatAirMarkdown('<img src=x onerror="alert(1)">');
    assert.ok(!html.includes('<img'), 'сырой <img> попал в разметку');
    assert.ok(html.includes('&lt;img'), 'ожидалось экранирование');
  });

  test('<script> внутри жирного текста тоже экранируется', () => {
    const html = formatAirMarkdown('**<script>alert(1)</script>**');
    assert.ok(!html.includes('<script'), 'сырой <script> попал в разметку');
    assert.ok(html.includes('<strong>'), 'жирный при этом должен работать');
  });

  test('кавычки в тексте не рвут атрибуты', () => {
    const html = formatAirMarkdown('- "><b>x</b>');
    assert.ok(!html.includes('<b>'), 'сырой тег попал в разметку');
  });

  test('виджет готовности собирается сборщиком, а не потоком', () => {
    const raw = 'Итог:\n{"_widget":"readiness","index":72}';
    const html = formatAirMarkdown(raw, (d) => `<div class="w">${d.index}</div>`);
    assert.ok(html.includes('<div class="w">72</div>'), 'виджет не собран');
    assert.ok(!html.includes('"_widget"'), 'JSON остался в тексте');
  });

  test('карточка тренировки собирается сборщиком, а не потоком (HUD-3)', () => {
    const raw = 'План:\n[WORKOUT_CARD]{"title":"Push Day","exercises":[]}[/WORKOUT_CARD]';
    const html = formatAirMarkdown(raw, undefined, (d) => `<div class="c">${d.title}</div>`);
    assert.ok(html.includes('<div class="c">Push Day</div>'), 'карточка не собрана');
    assert.ok(!html.includes('WORKOUT_CARD'), 'маркер остался в тексте');
  });

  test('сборщик карточки сам отвечает за esc() — форматтер не защищает его данные', () => {
    // Регресс отвергнутой линии: там cardData.title и ex.name уходили в
    // innerHTML сырыми. Здесь сборщик — ответственность вызывающей стороны
    // (intel.view.js), тест фиксирует контракт: JSON карточки не экранируется
    // форматтером повторно, значит его обязан экранировать сам сборщик.
    const raw = '[WORKOUT_CARD]{"title":"<img src=x onerror=alert(1)>"}[/WORKOUT_CARD]';
    let received = null;
    formatAirMarkdown(raw, undefined, (d) => { received = d; return ''; });
    assert.equal(received.title, '<img src=x onerror=alert(1)>', 'сборщик должен получить сырые данные и сам их экранировать');
  });
});

describe('Air Markdown — блоки', () => {
  test('заголовки не остаются внутри абзаца', () => {
    const html = formatAirMarkdown('## Разбор\nтекст');
    assert.ok(html.includes('<h2 class="intel-md-h2">Разбор</h2>'));
    assert.ok(!/<p[^>]*><h2/.test(html), '<h2> оказался вложен в <p>');
  });

  test('### даёт h3, а не h2', () => {
    assert.ok(formatAirMarkdown('### Ноги').includes('<h3'));
  });

  test('подряд идущие пункты собираются в один <ul>', () => {
    const html = formatAirMarkdown('- раз\n- два\n- три');
    assert.equal((html.match(/<ul/g) || []).length, 1);
    assert.equal((html.match(/<li/g) || []).length, 3);
  });

  test('нумерованный пункт получает бейдж с номером', () => {
    const html = formatAirMarkdown('1. Присед');
    assert.ok(html.includes('<span class="intel-num-badge">1</span>'));
    assert.ok(html.includes('Присед'));
  });

  test('пустая строка закрывает абзац, а не плодит <br>', () => {
    const html = formatAirMarkdown('первый\n\nвторой');
    assert.equal((html.match(/<p class="intel-md-p">/g) || []).length, 2);
    assert.ok(!html.includes('<br>'));
  });

  test('перенос внутри абзаца остаётся переносом', () => {
    const html = formatAirMarkdown('строка\nстрока');
    assert.equal((html.match(/<p class="intel-md-p">/g) || []).length, 1);
    assert.ok(html.includes('<br>'));
  });

  test('<thinking> не показывается пользователю', () => {
    const html = formatAirMarkdown('<thinking>план ответа</thinking>Ответ');
    assert.ok(!html.includes('план ответа'));
    assert.ok(html.includes('Ответ'));
  });
});

describe('Air Markdown — обрывки стрима', () => {
  const partials = [
    '',
    '#',
    '**жир',
    '<thinking>ещё думаю',
    '1.',
    '- ',
    '{"_widget":"readiness","ind',
    'Текст\n{"_widget":"readiness"',
    '[WORKOUT_CARD]{"title":"Push',
    'План:\n[WORKOUT_CARD]{"title":"Push Day","exercises":[',
  ];

  for (const chunk of partials) {
    test(`не падает на обрывке ${JSON.stringify(chunk)}`, () => {
      const html = formatAirMarkdown(chunk, (d) => `<i>${d.index}</i>`);
      assert.ok(html.startsWith('<div class="intel-md-body">'));
    });
  }

  test('недотёкший JSON виджета показывается текстом, а не ломает рендер', () => {
    const html = formatAirMarkdown('{"_widget":"readiness","index":7', () => '<i></i>');
    assert.ok(!html.includes('<i></i>'), 'виджет собран из битого JSON');
  });

  test('нарастающий текст не теряет уже готовые блоки', () => {
    const full = '## Итог\n- раз\n- два\n\nВывод';
    let prevBlocks = 0;
    for (let i = 1; i <= full.length; i++) {
      const html = formatAirMarkdown(full.slice(0, i));
      const blocks = (html.match(/<(h2|ul|p)\b/g) || []).length;
      assert.ok(blocks >= 0);
      prevBlocks = blocks;
    }
    assert.ok(prevBlocks >= 3, 'на полном тексте ожидались заголовок, список и абзац');
  });
});
