// @ts-check
/**
 * CORE-11: в промпте чата нет текста, который тянет ответ не на язык UI.
 *
 * Правило LANGUAGE (CORE-6) велит отвечать на языке UI, но рядом с ним в том же
 * промпте стояли три противовеса: GREETINGS требовало ровно «Привет, нужен план?»
 * при любом языке UI, инструкция тона была написана по-русски и уходила в промпт
 * английского UI, а само правило LANGUAGE говорило про «JSON string values», хотя
 * формат чата JSON запрещает. Гарды здесь держат четыре вещи:
 *  1. промпт английского UI без кириллицы — при любом тоне и любой двери;
 *  2. приветствие идёт на языке ответа: у русского UI фраза Gio дословно, у
 *     английского — свой эквивалент, и одна в промпт другой не попадает;
 *  3. ступени тона (0-29 / 30-70 / 71-100) различимы и держат смысл;
 *  4. правило LANGUAGE без JSON, перебивает язык вопроса.
 *
 * Проверяется собранный промпт, а не исходник `routes/coach.js`: комментарий в
 * коде на результат не влияет. Сети нет — `_buildSystemPrompt` чистая функция.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { _buildSystemPrompt } from '../routes/coach.js';
import { buildSnapshot, DOORS } from '../js/shared/coach-snapshot.js';

const NOW = Date.UTC(2026, 9, 4, 12, 0, 0);
const H = 3600000;

/** Две недели PPL на английских названиях: кириллица в промпте может прийти только из кода. */
const HISTORY = Array.from({ length: 6 }, (_, i) => ({
  timestamp: NOW - (20 + i * 48) * H,
  type: ['push', 'legs', 'pull'][i % 3],
  tonnage: 1500,
  duration: 45 * 60000,
  exercises: [{ name: ['Bench Press', 'Squat', 'Deadlift'][i % 3], sets: [1, 2, 3].map(() => ({ weight: 100, reps: 5, done: true })) }],
}));

/** @param {'ru'|'en'} lang @param {string} [door] */
const snap = (lang, door = 'intel') =>
  buildSnapshot({ workouts: HISTORY, fatigue: { chest: 0.5 }, profile: { goal: 'strength' }, lang, door, now: NOW });

/** Обе границы каждой ступени тона и края слайдера. */
const TONES = [0, 29, 30, 50, 70, 71, 100];
const CYRILLIC = /[Ѐ-ӿ]/;
const RU_GREETING = 'Привет, нужен план?';

/** Строка правила из блока [CRITICAL RULES]. @param {string} prompt @param {string} name */
const rule = (prompt, name) => prompt.split('\n').find((l) => new RegExp(`^\\d+\\. ${name}:`).test(l)) || '';

/** Секция тона между [PERSONA / TONE] и [CONTEXT]. @param {string} prompt */
const toneSection = (prompt) => {
  const start = prompt.indexOf('[PERSONA / TONE]');
  const end = prompt.indexOf('[CONTEXT]');
  assert.ok(start !== -1 && end > start, 'секция [PERSONA / TONE] потерялась — гард тона пустой');
  return prompt.slice(start + '[PERSONA / TONE]'.length, end).trim();
};

/** Фраза в кавычках после «exactly …:» в правиле GREETINGS. @param {string} prompt */
const greetingPhrase = (prompt) => {
  const m = rule(prompt, 'GREETINGS').match(/exactly[^:"]*:\s*"([^"]+)"/);
  assert.ok(m, 'правило GREETINGS больше не задаёт фразу ответа — гард приветствия пустой');
  return m[1];
};

describe('CORE-11: промпт английского UI не тянет ответ в русский', () => {
  test('ни одного кириллического символа при любом тоне и любой двери', () => {
    for (const door of DOORS) {
      for (const tone of TONES) {
        const p = _buildSystemPrompt(snap('en', door), tone);
        assert.match(rule(p, 'LANGUAGE'), /Respond in English\b/, 'фикстура обязана давать английский UI');
        const hit = p.match(CYRILLIC);
        assert.equal(hit, null,
          `door=${door} tone=${tone}: кириллица «${hit?.[0]}» у «${p.slice(Math.max(0, (hit?.index ?? 0) - 30), (hit?.index ?? 0) + 30)}»`);
      }
    }
  });

  test('приветствие — английское, с предложением плана, без фразы русского UI', () => {
    const phrase = greetingPhrase(_buildSystemPrompt(snap('en'), 50));
    assert.doesNotMatch(phrase, CYRILLIC);
    assert.match(phrase, /\bplan\b/i, 'английское приветствие потеряло предложение плана');
    assert.notEqual(phrase, RU_GREETING);
  });
});

describe('CORE-11: промпт русского UI держит фразу Gio', () => {
  test('«Привет, нужен план?» дословно при любом тоне, и без снимка тоже', () => {
    const prompts = [
      ...TONES.map((tone) => _buildSystemPrompt(snap('ru'), tone)),
      // Клиент старее CORE-4 шлёт запрос без снимка — дефолт чата русский.
      _buildSystemPrompt(undefined, 50),
    ];
    for (const p of prompts) {
      assert.match(rule(p, 'LANGUAGE'), /Respond in Russian\b/, 'фикстура обязана давать русский UI');
      assert.equal(greetingPhrase(p), RU_GREETING, 'фраза приветствия русского UI изменилась');
    }
  });

  test('в русский промпт не попадает фиксированная английская фраза приветствия', () => {
    const en = greetingPhrase(_buildSystemPrompt(snap('en'), 50));
    for (const p of [_buildSystemPrompt(snap('ru'), 50), _buildSystemPrompt(undefined, 50)]) {
      assert.equal(p.includes(en), false, `«${en}» — английская фраза в промпте русского UI`);
    }
  });
});

describe('CORE-11: тон — три ступени, смысл прежний', () => {
  /** @param {number} tone */
  const tier = (tone) => toneSection(_buildSystemPrompt(snap('en'), tone));

  test('ступени различимы, границы 29|30 и 70|71 на месте', () => {
    assert.notEqual(tier(0), tier(50), 'эмпатичный и нейтральный тон слились');
    assert.notEqual(tier(50), tier(100), 'нейтральный и жёсткий тон слились');
    assert.notEqual(tier(0), tier(100), 'эмпатичный и жёсткий тон слились');
    assert.equal(tier(29), tier(0), 'граница 29|30 съехала вниз');
    assert.equal(tier(30), tier(50), 'граница 29|30 съехала вверх');
    assert.equal(tier(70), tier(50), 'граница 70|71 съехала вниз');
    assert.equal(tier(71), tier(100), 'граница 70|71 съехала вверх');
  });

  test('каждая ступень говорит своё: физиотерапевт / профессионал / Гоггинс', () => {
    assert.match(tier(0), /empath/i);
    assert.match(tier(0), /physiotherapist/i);
    assert.match(tier(50), /neutral/i);
    assert.match(tier(50), /professional/i);
    assert.match(tier(100), /Goggins/);
    for (const [tone, alien] of /** @type {Array<[number, RegExp]>} */ ([
      [0, /Goggins|neutral/i], [50, /Goggins|physiotherapist/i], [100, /physiotherapist|neutral/i],
    ])) {
      assert.doesNotMatch(tier(tone), alien, `tone=${tone}: в ступень попал чужой тон`);
    }
  });

  test('тон не зависит от языка UI — один и тот же текст в обоих промптах', () => {
    for (const tone of TONES) {
      assert.equal(toneSection(_buildSystemPrompt(snap('ru'), tone)), tier(tone), `tone=${tone}`);
    }
  });
});

describe('CORE-11: правило LANGUAGE', () => {
  test('без JSON, перебивает язык вопроса', () => {
    for (const p of [_buildSystemPrompt(snap('en'), 50), _buildSystemPrompt(snap('ru'), 50), _buildSystemPrompt(undefined, 50)]) {
      const line = rule(p, 'LANGUAGE');
      assert.ok(line, 'правило LANGUAGE пропало');
      assert.doesNotMatch(line, /JSON/i, 'правило LANGUAGE снова говорит про JSON — формат чата JSON запрещает');
      assert.match(line, /not the language the user typed in/, 'правило обязано перебивать язык вопроса');
    }
  });
});
