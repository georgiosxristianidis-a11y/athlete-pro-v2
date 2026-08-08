// @ts-check
// SINGLE-ENGINE — до 2026-08-08 рядом с пресетами редактора жил второй движок
// плана (карусель «Structured Programs»). Он ставил ключ ap-active-plan, после
// чего buildSession перехватывал ЛЮБОЙ выбор дня и собирал сессию по счётчику
// программы: тап по PUSH отдавал день с Deadlift. Кнопки выхода не было —
// resetActivePlan() не вызывался ниоткуда, и первый же тап отрезал человека от
// его собственного плана навсегда.
// Гард держит инвариант: источник сессии ровно один — план в PLAN_KEY_A/B
// (дефолт PPL | GIO), и никакой посторонний ключ его не перебивает.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/** Minimal Map-backed localStorage — стор пишет туда при загрузке модуля. */
function mockStorage() {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
  return m;
}

let store = mockStorage();
beforeEach(() => { store = mockStorage(); });

const { buildSession, loadPlan, ACTIVE_PLAN_KEY, PPL_GIO_PLAN } =
  await import('../js/workout.store.js');

test('buildSession — выбранный день уважается даже с залипшим ap-active-plan', () => {
  // Ровно то состояние, в котором оставался пользователь после тапа по карусели.
  localStorage.setItem(ACTIVE_PLAN_KEY, JSON.stringify({
    id: '5x5-power', type: 'strength', currentWeek: 1, currentDay: 1,
  }));

  for (const day of /** @type {const} */ (['push', 'pull', 'legs'])) {
    const session = buildSession(day);
    assert.deepEqual(
      session.map((e) => e.name),
      PPL_GIO_PLAN.weekA[day].map((e) => e.name),
      `${day}: сессия собрана не из плана пользователя — второй движок вернулся`,
    );
  }
});

test('push никогда не содержит становую — она есть только в снесённых программах', () => {
  // Тот самый симптом: 5x5 стоит на дне B (Squat / OHP / Deadlift), человек
  // жмёт PUSH — и получает становую.
  localStorage.setItem(ACTIVE_PLAN_KEY, JSON.stringify({
    id: '5x5-power', type: 'strength', currentWeek: 1, currentDay: 1,
  }));
  const names = buildSession('push').map((e) => String(e.name).toLowerCase());
  assert.ok(
    !names.some((n) => n.includes('deadlift')),
    `в push приехало ${names.filter((n) => n.includes('deadlift')).join(', ')}`,
  );
});

test('ap-active-plan вычищается при загрузке стора — залипшее состояние не переживает релиз', async () => {
  localStorage.setItem(ACTIVE_PLAN_KEY, JSON.stringify({ id: '5x5-power', currentDay: 1 }));
  // Свежий импорт = загрузка приложения у человека, который уже тапнул карусель.
  await import(`../js/workout.store.js?purge=${Date.now()}`);
  assert.equal(store.get(ACTIVE_PLAN_KEY), undefined, 'ключ мёртвого движка пережил загрузку');
  assert.equal(loadPlan('A').push[0].name, PPL_GIO_PLAN.weekA.push[0].name);
});
