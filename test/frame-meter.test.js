// @ts-check
/* FRAME-1 — чистая логика замера кадров + флаг OFF по умолчанию.
   Если сводка врёт, motion-карточки примут решение по неверной цифре. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, percentile, createFrameMeter, GAP_RESET_MS } from '../js/shared/frame-meter.js';

test('percentile: nearest-rank, пустой массив = 0', () => {
  assert.equal(percentile([], 0.95), 0);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 5);
});

test('summarize: ровные 60 Гц — ноль пропусков', () => {
  const s = summarize(Array(100).fill(16.67));
  assert.equal(s.missedFrames, 0);
  assert.equal(s.missedPct, 0);
  assert.equal(s.p95Ms, 16.67);
});

test('summarize: кадр в 50 мс при 16.67 = 2 съеденных кадра', () => {
  const s = summarize([...Array(99).fill(16.67), 50]);
  assert.equal(s.slowFrames, 1);
  assert.equal(s.missedFrames, 2);
  assert.equal(s.maxMs, 50);
  assert.ok(s.missedPct > 1.9 && s.missedPct < 2.0, String(s.missedPct));
});

test('summarize: 120 Гц не считается пропуском сам по себе', () => {
  assert.equal(summarize(Array(200).fill(8.33)).missedFrames, 0);
});

test('summarize: long tasks — только строго больше 50 мс', () => {
  const s = summarize([16, 16], [50, 51, 120]);
  assert.equal(s.longTasks, 2);
  assert.equal(s.longTaskMaxMs, 120);
});

test('createFrameMeter: сон страницы отбрасывается, а не врёт в p95', () => {
  const m = createFrameMeter();
  m.reset('workout');
  let ts = 1000;
  for (let i = 0; i < 10; i++) { m.frame(ts); ts += 16.67; }
  m.frame(ts + GAP_RESET_MS + 500);
  const r = m.report();
  assert.equal(r.label, 'workout');
  assert.equal(r.gapsDropped, 1);
  assert.equal(r.frames, 9);
  assert.ok(r.maxMs < 20);
});

test('флаг frame-meter заведён и OFF по умолчанию', async () => {
  const { flag, allFlags } = await import('../js/flags.js');
  assert.ok('frame-meter' in allFlags());
  assert.equal(flag('frame-meter'), false);
});
