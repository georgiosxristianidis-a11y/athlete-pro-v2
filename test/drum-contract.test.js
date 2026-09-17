// DRUM-PERF-2 contract: the scrollTop ↔ index ↔ value math is the load-bearing
// core of the set logger — every field «0 kg» incident traced back to a
// position that stopped mapping to the value State believed. This file pins
// the mapping on EVERY render path BEFORE any of them is allowed to change:
//
//   idx    = round(scrollTop / ITEM_H)
//   value  = min + idx * step
//   commit = value                            (absolute, never a delta)
//   height = count * ITEM_H                   (items + spacers → snap grid intact)
//
// BUG-DRUM-OFFGRID (поле 2026-09-16) перевёл коммит с дельты на абсолютное
// значение: дельта верна только когда State уже лежит на сетке барабана, а
// вне-сеточный вес (13 кг при шаге 2) барабан рисует соседним узлом — прокрутка
// «на 20» прибавляла шаги к 13 и логировала 19. Абсолютное значение делает
// «показано = записано» тождеством и гасит прежний сдвиг первой прокруткой.
//
// A new render mode may only ship once this whole suite is green for it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_H, buildDrum, countItems } from './drum-harness.js';

const MODES = ['legacy', 'virtual', 'window'];
const BASE = { legacy: 0, virtual: 100, window: 200 };

for (const mode of MODES) {
  const ei = (n) => BASE[mode] + n;

  test(`[${mode}] contract: built value lands at scrollTop = idx*ITEM_H (0 / 180 / 400 kg)`, async () => {
    const a = await buildDrum(ei(0), { mode, value: '0' });
    assert.equal(a.track.scrollTop, 0);
    const b = await buildDrum(ei(1), { mode, value: '180' });
    assert.equal(b.track.scrollTop, 72 * ITEM_H);
    const c = await buildDrum(ei(2), { mode, value: '400' });
    assert.equal(c.track.scrollTop, 160 * ITEM_H);
  });

  test(`[${mode}] contract: settle commits the absolute value of the rest index`, async () => {
    const { track, setWeight, stepWeight } = await buildDrum(ei(3), { mode }); // 180 kg = idx 72
    track.userScrollTo(80 * ITEM_H);
    track.fire('scrollend');
    assert.deepEqual(setWeight.calls, [[ei(3), 0, 200]]);            // 80 × 2.5
    track.userScrollTo(60 * ITEM_H);
    track.fire('scrollend');
    assert.deepEqual(setWeight.calls.at(-1), [ei(3), 0, 150]);       // 60 × 2.5
    assert.deepEqual(stepWeight.calls, []);                          // дельт больше нет
  });

  test(`[${mode}] contract: misaligned rest position rounds to the nearest index`, async () => {
    const { track, setWeight } = await buildDrum(ei(4), { mode });    // idx 72
    track.userScrollTo(75 * ITEM_H + 10);                             // 75.28 → 75
    track.fire('scrollend');
    assert.deepEqual(setWeight.calls, [[ei(4), 0, 187.5]]);
  });

  test(`[${mode}] contract: syncDrumUI seeks the position without committing`, async () => {
    const { track, setWeight, syncDrumUI } = await buildDrum(ei(5), { mode });
    syncDrumUI('w', ei(5), 0, 100);
    assert.equal(track.scrollTop, 40 * ITEM_H);
    syncDrumUI('w', ei(5), 0, 9999); // clamps to the top of the range
    assert.equal(track.scrollTop, 160 * ITEM_H);
    assert.deepEqual(setWeight.calls, []);
  });

  test(`[${mode}] contract: total scroll height stays count*ITEM_H (snap grid intact)`, async () => {
    const { track } = await buildDrum(ei(6), { mode });
    const itemsPx = countItems(track) * ITEM_H;
    const spacerPx = track.children
      .filter((el) => el.className === 'drum-spacer')
      .reduce((s, el) => s + (parseInt(el.style.height) || 0), 0);
    assert.equal(itemsPx + spacerPx, 161 * ITEM_H);
  });

  test(`[${mode}] contract: flushDrum commits the in-flight position once, rounded`, async () => {
    const { track, setWeight, flushDrum } = await buildDrum(ei(7), { mode });
    track.userScrollTo(74 * ITEM_H + 8); // 74.2 → 74
    flushDrum('w', ei(7), 0);
    assert.deepEqual(setWeight.calls, [[ei(7), 0, 185]]);
    flushDrum('w', ei(7), 0);            // one-shot
    assert.deepEqual(setWeight.calls, [[ei(7), 0, 185]]);
  });

  test(`[${mode}] contract: reps drum maps value with the min=1 offset`, async () => {
    const { track, setReps } = await buildDrum(ei(8), { mode, type: 'r', value: '10' });
    assert.equal(track.scrollTop, 9 * ITEM_H); // idx = (10−1)/1
    track.userScrollTo(14 * ITEM_H);           // 15 reps
    track.fire('scrollend');
    assert.deepEqual(setReps.calls, [[ei(8), 0, 15]]);
  });

  /* BUG-DRUM-OFFGRID — регрессия «выставил 20, записалось 19». Барабан построен
     на весе МИМО своей сетки (19 кг при шаге 2.5 → ближайший узел 20). Прежний
     дельта-коммит прибавлял шаги к 19 и уносил State дальше от показанного;
     абсолютный коммит обязан отдать ровно то число, что стоит в окне. */
  test(`[${mode}] contract: off-grid start commits the shown node, not shown+offset`, async () => {
    const { track, setWeight } = await buildDrum(ei(9), { mode, value: '19' });
    assert.equal(track.scrollTop, 8 * ITEM_H);   // 19/2.5 = 7.6 → узел 8 = «20»
    track.userScrollTo(10 * ITEM_H);             // пользователь крутит на «25»
    track.fire('scrollend');
    assert.deepEqual(setWeight.calls, [[ei(9), 0, 25]]); // дельта дала бы 19+5 = 24
  });
}

/* ── DRUM-PERF-2: drum-window specifics — the contract that distinguishes it
      from the field-failed drum-virtual path ──────────────────────────────── */

test('[window] DOM is capped at the 41-item window (161 → 41)', async () => {
  const { track } = await buildDrum(300, { mode: 'window' });
  assert.equal(countItems(track), 41);
});

test('[window] scroll ticks NEVER mutate the DOM — mid-scroll re-centre is the drum-virtual failure mode', async () => {
  const { track } = await buildDrum(301, { mode: 'window' }); // idx 72, window [52..92]
  const before = track.children.slice();
  // long drag from 180 kg down past the window edge into spacer territory
  for (let idx = 71; idx >= 45; idx--) track.userScrollTo(idx * ITEM_H);
  assert.equal(track.children.length, before.length);
  before.forEach((el, i) => assert.equal(track.children[i], el, `child ${i} was replaced mid-scroll`));
});

test('[window] scrollend re-centres the window on the committed index without moving scrollTop', async () => {
  const { track, setWeight } = await buildDrum(302, { mode: 'window' }); // idx 72, window [52..92]
  track.userScrollTo(55 * ITEM_H);
  track.fire('scrollend');
  assert.deepEqual(setWeight.calls, [[302, 0, 137.5]]);        // 55 × 2.5
  assert.equal(track.scrollTop, 55 * ITEM_H);                  // rebuild must not yank the position
  const spacerTop = parseInt(track.children[0].style.height);
  assert.equal(spacerTop / ITEM_H, 35);                        // window now [35..75], centred on 55
  assert.equal(countItems(track), 41);
  // the rebuild created fresh nodes after the last scroll tick — the active
  // highlight must be re-applied to the committed value (found live 2026-07-18)
  const active = track.children.find((el) => el.classList.contains('drum-item--active'));
  assert.equal(active?.textContent, '137.5');
});

test('[window] rest position inside a spacer heals back to State instead of committing garbage', async () => {
  // Mandatory snap only lands on rendered items, so a rest inside a spacer is
  // corruption by definition (the BUG-DRUM-0 tripwire, now on the new path).
  const { track, setWeight } = await buildDrum(303, { mode: 'window' }); // idx 72, window [52..92]
  track.userScrollTo(30 * ITEM_H);
  track.fire('scrollend');
  assert.deepEqual(setWeight.calls, []);
  assert.equal(track.scrollTop, 72 * ITEM_H); // healed to the value State holds
});

test('[window] consecutive flings chain across re-centres to reach any value', async () => {
  const { track, setWeight } = await buildDrum(304, { mode: 'window' }); // 180 kg, idx 72
  track.userScrollTo(52 * ITEM_H); // fling 1 stops at the window edge (130 kg)
  track.fire('scrollend');
  track.userScrollTo(32 * ITEM_H); // window re-centred [32..72] → fling 2 reaches 80 kg
  track.fire('scrollend');
  assert.deepEqual(setWeight.calls,
    [[304, 0, 130], [304, 0, 80]]); // 180 → 130 → 80
});
