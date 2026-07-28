import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blockTicks, blockOrder } from '../js/shared/block-ticks.js';

test('blockOrder — уникальные блоки в порядке прохождения', async (t) => {
  await t.test('схлопывает повторы, порядок берёт по первому появлению', () => {
    const plan = [
      { block: 'power' }, { block: 'power' },
      { block: 'shape' }, { block: 'shape' }, { block: 'shape' },
      { block: 'arms' },
      { block: 'core' }, { block: 'core' },
    ];
    assert.deepEqual(blockOrder(plan), ['power', 'shape', 'arms', 'core']);
  });

  await t.test('упражнение без блока не создаёт этап', () => {
    assert.deepEqual(blockOrder([{ block: 'power' }, {}, { name: 'x' }]), ['power']);
  });

  await t.test('пустой и отсутствующий план дают пустой список', () => {
    assert.deepEqual(blockOrder([]), []);
    assert.deepEqual(blockOrder(undefined), []);
  });

  await t.test('блок, добавленный на лету последним, попадает в хвост', () => {
    // Пользователь дожал упражнение нового блока в конце сессии —
    // общее число этапов обязано вырасти, а не остаться прибитым к 4.
    const plan = [{ block: 'power' }, { block: 'core' }, { block: 'align' }];
    assert.equal(blockOrder(plan).length, 3);
  });
});

test('blockTicks — накопительная заливка', async (t) => {
  await t.test('горят все полоски до текущей включительно', () => {
    const html = blockTicks({ index: 2, total: 4 });
    assert.equal((html.match(/is-on/g) || []).length, 3);
  });

  await t.test('подсвечена ровно одна — текущая', () => {
    const html = blockTicks({ index: 2, total: 4 });
    assert.equal((html.match(/is-current/g) || []).length, 1);
  });

  await t.test('полосок ровно total', () => {
    const html = blockTicks({ index: 0, total: 5 });
    assert.equal((html.match(/<i class="blk-tick/g) || []).length, 5);
  });

  await t.test('первый блок зажигает одну полоску', () => {
    const html = blockTicks({ index: 0, total: 4 });
    assert.equal((html.match(/is-on/g) || []).length, 1);
  });

  await t.test('последний блок зажигает все', () => {
    const html = blockTicks({ index: 3, total: 4 });
    assert.equal((html.match(/is-on/g) || []).length, 4);
  });
});

test('blockTicks — варианты одной грамматики', async (t) => {
  await t.test('по умолчанию вертикальные засечки', () => {
    const html = blockTicks({ index: 0, total: 3 });
    assert.match(html, /class="blk-ticks"/);
  });

  await t.test('bar добавляет модификатор, не меняя разметку сегментов', () => {
    const bar = blockTicks({ index: 0, total: 3, variant: 'bar' });
    assert.match(bar, /class="blk-ticks blk-ticks--bar"/);
    // Сегменты те же: горизонталь — вопрос CSS, не второго шаблона.
    assert.equal(
      (bar.match(/<i class="blk-tick/g) || []).length,
      (blockTicks({ index: 0, total: 3 }).match(/<i class="blk-tick/g) || []).length,
    );
  });

  await t.test('шкала онбординга: шаг 1 из 6 — горит одна, светится она же', () => {
    const html = blockTicks({ index: 0, total: 6, variant: 'bar' });
    assert.equal((html.match(/is-on/g) || []).length, 1);
    assert.equal((html.match(/is-current/g) || []).length, 1);
  });
});

test('blockTicks — цвет и доступность', async (t) => {
  await t.test('цвет уезжает в переменную, а не в background каждой полоски', () => {
    const html = blockTicks({ index: 1, total: 3, color: 'var(--c-pull)' });
    assert.match(html, /--blk-on:var\(--c-pull\)/);
    assert.doesNotMatch(html, /background:/);
  });

  await t.test('aria-label несёт название блока и позицию', () => {
    const html = blockTicks({ index: 2, total: 4, label: 'CORE' });
    assert.match(html, /aria-label="CORE, 3 \/ 4"/);
  });

  await t.test('без названия остаётся только позиция', () => {
    assert.match(blockTicks({ index: 0, total: 2 }), /aria-label="1 \/ 2"/);
  });

  await t.test('название экранируется — оно приходит из плана пользователя', () => {
    const html = blockTicks({ index: 0, total: 1, label: '<img src=x onerror=alert(1)>' });
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
  });
});

test('blockTicks — вырожденный вход отдаёт пустую строку, не мусор', async (t) => {
  const cases = [
    ['нет блоков вовсе',      { index: 0,  total: 0 }],
    ['индекс за пределами',   { index: 4,  total: 4 }],
    ['отрицательный индекс',  { index: -1, total: 4 }],
    ['дробный индекс',        { index: 1.5, total: 4 }],
    ['total не число',        { index: 0,  total: NaN }],
  ];
  for (const [name, opts] of cases) {
    await t.test(name, () => assert.equal(blockTicks(opts), ''));
  }
});
