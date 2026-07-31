// @ts-check
/* PANDA-1 — драматургия маскота как чистая логика.
   Мимики нарезаются из assets/panda-voice.mp4 по тайм-кодам, поэтому кривая
   таблица сегментов = панда молча показывает не ту эмоцию. Это тихий баг:
   ничего не падает, просто персонаж врёт. Отсюда гард на саму таблицу. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOODS, BASE_MOOD, OVERRUN_JUDGE_SEC,
  restOverrunMood, ledgerVerdictKey,
} from '../js/shared/panda-mood.js';

/** Длительность ролика, из которого нарезаны все мимики. */
const CLIP_SEC = 10.0;
/** Короче этого сегмент читается как дёрганье, а не как эмоция. */
const MIN_SEGMENT_SEC = 0.8;

test('MOODS: каждый сегмент лежит внутри ролика и не вывернут', () => {
  const names = Object.keys(MOODS);
  assert.ok(names.length >= 5, 'мимик должно быть не меньше пяти');

  for (const name of names) {
    const seg = MOODS[name];
    assert.ok(typeof seg.in === 'number' && typeof seg.out === 'number', `${name}: границы должны быть числами`);
    assert.ok(seg.in < seg.out, `${name}: in должен быть строго меньше out`);
    assert.ok(seg.in >= 0, `${name}: in вылез до начала ролика`);
    assert.ok(seg.out <= CLIP_SEC, `${name}: out вылез за конец ролика`);
    assert.ok(seg.out - seg.in >= MIN_SEGMENT_SEC, `${name}: сегмент короче ${MIN_SEGMENT_SEC}с — это дёрганье, не мимика`);
  }
});

test('MOODS: базовая мимика существует и это еда', () => {
  assert.ok(MOODS[BASE_MOOD], 'BASE_MOOD обязан быть ключом MOODS');
  assert.equal(BASE_MOOD, 'chew', 'закон персонажа: пока ты работаешь — он ест');
});

test('MOODS: judge не упирается в конец ролика', () => {
  // На 10.0с браузер сам заворачивает loop в ноль и на кадр показывает
  // чужую мимику — поэтому запас у последнего сегмента обязателен.
  assert.ok(MOODS.judge.out < CLIP_SEC, 'у judge должен остаться запас до конца ролика');
});

test('restOverrunMood: лестница осуждения', () => {
  assert.equal(restOverrunMood(0), 'watch', 'отдых только что истёк — панда перестаёт жевать и смотрит');
  assert.equal(restOverrunMood(OVERRUN_JUDGE_SEC - 1), 'watch', 'до порога всё ещё только наблюдение');
  assert.equal(restOverrunMood(OVERRUN_JUDGE_SEC), 'judge', 'на пороге включается осуждение');
  assert.equal(restOverrunMood(OVERRUN_JUDGE_SEC + 300), 'judge', 'выше осуждения эскалации нет');
});

test('restOverrunMood: без перебора осуждать не за что', () => {
  assert.equal(restOverrunMood(-1), null);
  assert.equal(restOverrunMood(NaN), null);
  assert.equal(restOverrunMood(undefined), null);
});

test('restOverrunMood: возвращает только существующие мимики', () => {
  for (const sec of [0, 5, 29, 30, 120]) {
    const m = restOverrunMood(sec);
    assert.ok(MOODS[m], `restOverrunMood(${sec}) вернул несуществующую мимику: ${m}`);
  }
});

test('ledgerVerdictKey: счёт всегда равный, обойти можно только рекордом', () => {
  assert.equal(ledgerVerdictKey(0), 'mascot.draw');
  assert.equal(ledgerVerdictKey(1), 'mascot.you_won');
  assert.equal(ledgerVerdictKey(4), 'mascot.you_won');
});
