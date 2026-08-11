import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { workoutsToTxt } = await import('../js/shared/txt-export.js');

const NOW = new Date('2026-08-02T10:00:00.000Z');

const W = [
  {
    type: 'push',
    timestamp: Date.UTC(2026, 6, 30, 9, 0),
    duration: 58 * 60000,
    tonnage: 12450,
    exercises: [
      {
        name: 'Жим лёжа',
        sets: [
          { weight: 80, reps: 8, rpe: 8, done: true },
          { weight: 82.5, reps: 6, rpe: null, done: true },
          { weight: 85, reps: 5, rpe: null, done: false },
        ],
      },
    ],
  },
  {
    type: 'legs',
    timestamp: Date.UTC(2026, 7, 1, 9, 0),
    duration: 61 * 60000,
    tonnage: 9000,
    exercises: [],
  },
];

describe('workoutsToTxt', () => {
  test('свежие тренировки сверху', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.ok(txt.indexOf('2026-08-01') < txt.indexOf('2026-07-30'));
  });

  test('шапка: дата выгрузки, счёт и суммарный тоннаж', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.match(txt, /Выгружено: 2026-08-02/);
    assert.match(txt, /Тренировок: 2/);
    assert.match(txt, /Общий тоннаж: 21 450 кг/);
  });

  test('дробный вес не округляется до целого', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.match(txt, /82\.5 кг × 6/);
  });

  test('пропущенный подход помечен, а не выброшен', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.match(txt, /3\. — пропущен/);
    assert.match(txt, /\(2 подхода\)/, 'в счёт идут только выполненные');
  });

  // ABBR-1 доп.: Edit Plan tag сопровождает имя, не заменяет его — в TXT
  // читатель (тренер) не обязан знать личные сокращения атлета.
  test('tag печатается рядом с именем, не вместо него', () => {
    const tagged = [{
      type: 'push', timestamp: Date.UTC(2026, 6, 30, 9, 0), duration: 60 * 60000, tonnage: 100,
      exercises: [{ name: 'Incline DB Press', tag: 'DBI', sets: [{ weight: 20, reps: 10, done: true }] }],
    }];
    const txt = workoutsToTxt(tagged, { lang: 'en', now: NOW });
    assert.match(txt, /Incline DB Press · DBI {2}\(1 set\)/);
  });

  test('без tag — имя печатается как раньше, без "· "', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.match(txt, /Жим лёжа {2}\(2 подхода\)/);
    assert.ok(!txt.includes('Жим лёжа ·'));
  });

  test('RPE печатается только когда он есть', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.match(txt, /80 кг × 8 {2}RPE 8/);
    assert.ok(!/82\.5 кг × 6 {2}RPE/.test(txt));
  });

  test('английская локаль переводит подписи', () => {
    const txt = workoutsToTxt(W, { lang: 'en', now: NOW });
    assert.match(txt, /training log/);
    assert.match(txt, /Workouts: 2/);
    assert.match(txt, /80 kg × 8/);
  });

  test('пустая история — валидный текст, а не пустая строка', () => {
    const txt = workoutsToTxt([], { lang: 'ru', now: NOW });
    assert.match(txt, /Тренировок: 0/);
    assert.match(txt, /История пуста/);
  });

  test('мусор на входе не роняет: null, undefined, кривые записи', () => {
    assert.match(workoutsToTxt(null, { now: NOW }), /Workouts: 0/);
    assert.match(workoutsToTxt(undefined, { now: NOW }), /Workouts: 0/);
    const junk = [{ type: null, timestamp: NaN, exercises: [{ name: null, sets: null }] }];
    assert.doesNotThrow(() => workoutsToTxt(junk, { now: NOW }));
  });

  test('без эмодзи — правило DESIGN_DNA', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.ok(!/\p{Extended_Pictographic}/u.test(txt));
  });

  test('шапка: упражнения, подходы и время в зале', () => {
    const txt = workoutsToTxt(W, { lang: 'ru', now: NOW });
    assert.match(txt, /Упражнений: 1/);
    assert.match(txt, /Подходов: 2/, 'считаются выполненные, не запланированные');
    assert.match(txt, /Время в зале: 1 ч 59 мин/);
  });

  test('число подходов склоняется, а не «1 подходов»', () => {
    const one = [{ ...W[0], exercises: [{ name: 'Жим', sets: [{ weight: 80, reps: 8, done: true }] }] }];
    assert.match(workoutsToTxt(one, { lang: 'ru', now: NOW }), /\(1 подход\)/);
    assert.match(workoutsToTxt(one, { lang: 'en', now: NOW }), /\(1 set\)/);
  });

  test('время меньше часа печатается минутами', () => {
    const txt = workoutsToTxt([W[0]], { lang: 'ru', now: NOW });
    assert.match(txt, /Время в зале: 58 мин/);
  });
});

describe('workoutsToTxt — нетронутые упражнения', () => {
  const PLAN = [{
    type: 'legs',
    timestamp: Date.UTC(2026, 7, 2, 9, 0),
    duration: 60000,
    tonnage: 1300,
    exercises: [
      { name: 'Leg Press', sets: [{ weight: 65, reps: 10, done: true }, { weight: 65, reps: 10, done: false }] },
      { name: 'Leg Curl', sets: [{ done: false }, { done: false }, { done: false }] },
      { name: 'Calf Raise', sets: [{ done: false }] },
    ],
  }];

  test('упражнение без единого выполненного подхода в текст не попадает', () => {
    const txt = workoutsToTxt(PLAN, { lang: 'en', now: NOW });
    assert.match(txt, /Leg Press/);
    assert.ok(!txt.includes('Leg Curl'));
    assert.ok(!txt.includes('Calf Raise'));
  });

  test('пропуск не замалчивается — одна строка в шапке тренировки', () => {
    const txt = workoutsToTxt(PLAN, { lang: 'en', now: NOW });
    assert.match(txt, /done 1 of 3/);
  });

  test('частично сделанное упражнение сохраняет свои skipped-строки', () => {
    const txt = workoutsToTxt(PLAN, { lang: 'en', now: NOW });
    assert.match(txt, /2\. — skipped/);
  });

  test('всё сделано — строки «done x of y» нет', () => {
    const full = [{ ...PLAN[0], exercises: [PLAN[0].exercises[0]] }];
    assert.ok(!/done 1 of 1/.test(workoutsToTxt(full, { lang: 'en', now: NOW })));
  });
});

describe('workoutsToTxt — паспорт и рекорды', () => {
  const A = { name: 'Gio', age: 38, weight: 82.5, gym: 'Iron Temple', country: 'Greece' };

  test('атлет, место и рекорды в шапке', () => {
    const txt = workoutsToTxt(W, {
      lang: 'en', now: NOW, athlete: A,
      records: [{ name: 'Squat', value: 140 }, { name: 'Bench Press', value: 100 }],
    });
    assert.match(txt, /Athlete: Gio {2}· {2}38 y {2}· {2}82\.5 kg/);
    assert.match(txt, /Gym: Iron Temple {2}· {2}Greece/);
    assert.ok(txt.indexOf('Squat: 140 kg') < txt.indexOf('Bench Press: 100 kg'), 'рекорды по убыванию');
  });

  test('русские годы склоняются', () => {
    assert.match(workoutsToTxt(W, { lang: 'ru', now: NOW, athlete: { age: 38 } }), /Атлет: 38 лет/);
    assert.match(workoutsToTxt(W, { lang: 'ru', now: NOW, athlete: { age: 21 } }), /Атлет: 21 год/);
    assert.match(workoutsToTxt(W, { lang: 'ru', now: NOW, athlete: { age: 33 } }), /Атлет: 33 года/);
  });

  test('незаполненные поля молчат, а не печатают прочерк', () => {
    const txt = workoutsToTxt(W, { lang: 'en', now: NOW, athlete: { name: 'Gio' }, records: [] });
    assert.match(txt, /Athlete: Gio/);
    assert.ok(!/Gym:/.test(txt));
    assert.ok(!/RECORDS/.test(txt));
  });

  test('нулевые и безымянные рекорды отбрасываются', () => {
    const txt = workoutsToTxt(W, {
      lang: 'en', now: NOW,
      records: [{ name: 'Squat', value: 0 }, { name: '', value: 90 }],
    });
    assert.ok(!/RECORDS/.test(txt));
  });
});
