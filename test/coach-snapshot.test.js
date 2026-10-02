// @ts-check
/**
 * CORE-4: коуч получает снимок движков, а не сырые записи БД.
 *
 * Гард держит четыре вещи:
 *  1. состав снимка — ровно `SNAPSHOT_KEYS`, ничего сверх (тот же класс, что
 *     `intel-engine-wiring.test.js` у CORE-1);
 *  2. сервер описывает те же ключи и принимает всё, что сборщик может выдать;
 *  3. промпт строится из снимка, а не из сырых полей;
 *  4. обе двери (`intel.store.js`, `claude.store.js`) идут через одну функцию.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SNAPSHOT_KEYS, PROFILE_KEYS, DOORS, LIMITS, CAPS,
  buildSnapshot, e1rmShift, compressSessions, fatiguePercent,
} from '../js/shared/coach-snapshot.js';
import { coachSnapshotSchema, coachSchema, _buildSystemPrompt } from '../routes/coach.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (/** @type {string} */ f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const H = 3600000;

/** @param {number} hoursAgo @param {string} name @param {number} weight @param {number} reps */
function session(hoursAgo, name, weight, reps, extra = {}) {
  return {
    timestamp: NOW - hoursAgo * H,
    type: 'push',
    tonnage: weight * reps * 3,
    duration: 45 * 60000,
    exercises: [{ name, sets: [1, 2, 3].map(() => ({ weight, reps, done: true })) }],
    ...extra,
  };
}

const HISTORY = [
  session(20, 'Bench Press', 100, 5),
  session(70, 'Squat', 140, 5),
  session(120, 'Deadlift', 180, 3),
  session(24 * 40, 'Bench Press', 90, 5),
  session(24 * 45, 'Squat', 120, 5),
];

const PROFILE = {
  name: 'Gio', age: 38, sex: 'm', goal: 'strength', equipment: 'gym',
  experienceYears: 6, injuries: ['knee'], limitationsText: 'no jumping', mode: 'strength', timeMin: 60,
  'athlete-photo': 'data:image/jpeg;base64,AAAA', 'privacy.audit': [{ x: 1 }], dob: '1988-01-01',
};

const full = () => buildSnapshot({
  workouts: HISTORY,
  fatigue: { chest: 0.4, quad: 0.02, lat: 0.9 },
  insights: [1, 2, 3, 4, 5].map((n) => ({ kind: 'pr', title: `t${n}`, body: `b${n}`, secret: 'x' })),
  profile: PROFILE,
  lang: 'ru',
  door: 'intel',
  now: NOW,
});

describe('состав снимка', () => {
  test('ключи верхнего уровня — ровно SNAPSHOT_KEYS', () => {
    assert.deepEqual(Object.keys(full()).sort(), [...SNAPSHOT_KEYS].sort());
  });

  test('профиль — ровно белый список, без фото, аудита и dob', () => {
    const p = full().profile;
    assert.deepEqual(Object.keys(p).sort(), [...PROFILE_KEYS].sort());
    const dump = JSON.stringify(full());
    for (const leak of ['athlete-photo', 'privacy.audit', 'base64', '1988-01-01']) {
      assert.equal(dump.includes(leak), false, `${leak} попал в снимок`);
    }
  });

  test('чужие поля инсайта не проходят, сверх трёх — отсекаются', () => {
    const { insights } = full();
    assert.equal(insights.length, LIMITS.insights);
    for (const i of insights) assert.deepEqual(Object.keys(i).sort(), ['body', 'kind', 'title']);
  });

  test('пустая история и пустой профиль — снимок валиден, готовность честно пуста', () => {
    const s = buildSnapshot({ workouts: [], now: NOW });
    assert.deepEqual(Object.keys(s).sort(), [...SNAPSHOT_KEYS].sort());
    assert.equal(s.readiness.index, null);
    assert.deepEqual(s.sessions, []);
    assert.deepEqual(s.e1rm, []);
    assert.equal(s.door, 'panel');
    assert.equal(s.lang, 'en');
  });

  test('неизвестная дверь → panel, язык не ru → en', () => {
    const s = buildSnapshot({ workouts: [], door: 'nope', lang: 'de', now: NOW });
    assert.equal(s.door, 'panel');
    assert.equal(s.lang, 'en');
    for (const d of DOORS) assert.equal(buildSnapshot({ workouts: [], door: d, now: NOW }).door, d);
  });
});

describe('части снимка', () => {
  test('сессии — три последние, по убыванию времени, пустые отброшены', () => {
    const list = compressSessions([...HISTORY, session(1, 'Abandoned', 0, 0, { tonnage: 0 })], NOW);
    assert.equal(list.length, LIMITS.sessions);
    assert.deepEqual(list.map((s) => s.hoursAgo), [20, 70, 120]);
    assert.deepEqual(Object.keys(list[0]).sort(), ['durationMin', 'exercises', 'hoursAgo', 'tonnageKg', 'type']);
    assert.equal(list[0].durationMin, 45);
  });

  test('e1RM: сдвиг за 4 недели — сейчас против лучшего до окна', () => {
    const bench = e1rmShift(HISTORY, NOW).find((e) => e.exercise === 'bench press');
    assert.ok(bench, 'bench press отсутствует');
    // 100x5 против 90x5 по Epley: разница положительна и не нулевая
    assert.ok(/** @type {number} */ (bench.shift4w) > 0);
  });

  test('e1RM: нет истории старше окна → shift4w null, а не 0', () => {
    const dl = e1rmShift(HISTORY, NOW).find((e) => e.exercise === 'deadlift');
    assert.ok(dl);
    assert.equal(dl.shift4w, null);
  });

  test('усталость: проценты, свежее 5% отсечено', () => {
    assert.deepEqual(fatiguePercent({ chest: 0.4, quad: 0.02, lat: 0.9 }), { chest: 40, lat: 90 });
  });
});

describe('сервер принимает снимок и режет всё лишнее', () => {
  test('ключи схемы == SNAPSHOT_KEYS, ключи профиля == PROFILE_KEYS', () => {
    assert.deepEqual(Object.keys(coachSnapshotSchema.shape).sort(), [...SNAPSHOT_KEYS].sort());
    assert.deepEqual(Object.keys(coachSnapshotSchema.shape.profile.shape).sort(), [...PROFILE_KEYS].sort());
  });

  test('настоящий снимок проходит схему', () => {
    assert.equal(coachSnapshotSchema.safeParse(full()).success, true);
  });

  test('худший вход сборщика (гигантские строки, тысячи ключей, безумные числа) всё равно проходит схему', () => {
    const big = 'я'.repeat(5000);
    const s = buildSnapshot({
      workouts: [{
        timestamp: NOW - H, type: big, tonnage: 1e12, duration: 1e15,
        exercises: Array.from({ length: 50 }, () => ({
          name: big, sets: Array.from({ length: 500 }, () => ({ weight: 1e6, reps: 1e6, done: true })),
        })),
      }],
      fatigue: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [big + i, 5])),
      insights: Array.from({ length: 50 }, () => ({ kind: big, title: big, body: big })),
      profile: {
        name: big, age: 1e9, sex: 'x', goal: big, equipment: big, experienceYears: -5,
        injuries: Array.from({ length: 200 }, () => big), limitationsText: big, mode: big, timeMin: 1e9,
      },
      lang: 'ru', door: 'workout', now: NOW,
    });
    const r = coachSnapshotSchema.safeParse(s);
    assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues.slice(0, 3)));
    assert.ok(Object.keys(s.fatigue).length <= CAPS.muscles);
  });

  test('лишние ключи внутри снимка срезаются схемой', () => {
    const dirty = { ...full(), workouts: [{ secret: 1 }], profile: { ...full().profile, 'athlete-photo': 'x' } };
    const r = coachSnapshotSchema.safeParse(dirty);
    assert.equal(r.success, true);
    assert.equal('workouts' in r.data, false);
    assert.equal('athlete-photo' in r.data.profile, false);
  });

  test('значение за потолком — 400, а не молчаливая подрезка', () => {
    const bad = { ...full(), cns: 500 };
    assert.equal(coachSchema.safeParse({ messages: [{ role: 'user', content: 'hi' }], snapshot: bad }).success, false);
  });
});

describe('промпт строится из снимка', () => {
  test('контекст несёт снимок и ситуацию двери, но не сырые записи', () => {
    const p = _buildSystemPrompt(full(), 50);
    assert.match(p, /Snapshot \(computed by the app's own engines/);
    assert.match(p, /P\.A\.N\.D\.A\. Core screen/);
    assert.match(p, /"door":"intel"/);
    assert.match(p, /Current Goal: strength/);
    for (const raw of ['History (last 5)', 'Current Fatigue', '1RMs:', 'User Profile']) {
      assert.equal(p.includes(raw), false, `«${raw}» — прежний сырой контекст вернулся`);
    }
  });

  test('без снимка — честное «данных нет», а не выдуманные нули', () => {
    const p = _buildSystemPrompt(undefined, 50);
    assert.match(p, /Snapshot: unavailable/);
    assert.match(p, /do not invent any/);
  });

  test('каждая дверь даёт свою ситуацию', () => {
    const marks = { intel: /Core screen/, panel: /coach panel/, workout: /mid-workout/ };
    for (const d of DOORS) {
      const s = buildSnapshot({ workouts: [], door: d, now: NOW });
      assert.match(_buildSystemPrompt(s, 50), marks[d]);
    }
  });
});

describe('двери идут через одну функцию', () => {
  const INTEL = read('js/intel.store.js');
  const COLLECTOR = read('js/coach-snapshot.store.js');

  // CORE-5: второй клиент удалён — все двери идут через `streamCoachReply`,
  // дверь приходит параметром. Гард единственности — `test/coach-one-client.test.js`.
  test('единственный клиент собирает снимок одним сборщиком и не шлёт сырые поля', () => {
    const start = INTEL.indexOf('export async function streamCoachReply');
    const body = INTEL.slice(start, INTEL.indexOf('export async function getAutoSpeech'));
    assert.ok(start !== -1 && body.length > 0, 'streamCoachReply / getAutoSpeech anchors missing');
    assert.match(body, /collectCoachSnapshot\(\{ door \}\)/);
    assert.equal(/workouts:|topLifts:|longTermStats|fatigue:\s*Object/.test(body), false,
      'клиент снова собирает сырой контекст мимо снимка');
    assert.match(body, /snapshot,/);
  });

  test('сборщик не читает настройки целиком', () => {
    assert.equal(/Settings\.getAll\(\)/.test(COLLECTOR), false);
    assert.match(COLLECTOR, /toCoachProfile/);
  });
});
