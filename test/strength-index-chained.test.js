import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { buildIndexSeries, strengthIndexPlot, renderStrengthHero } = await import(
  '../js/analytics.strength-curves.js'
);

// ANL-3: индекс силы цепной по e1RM. reps=1 даёт e1RM == вес — числа в тестах точные.
const lift = (mo, name, sets, day = 10) => ({
  type: 'push',
  timestamp: new Date(2026, mo, day, 12).getTime(),
  duration: 0,
  tonnage: 0,
  exercises: [{ name, sets }],
});
const one = (weight) => [{ weight, reps: 1, done: true }];
const score = (workouts) => Math.round(buildIndexSeries(workouts).idx.at(-1) * 100);

/** Две сессии в один день могут нести разные лифты: склеиваем упражнения в одну запись. */
const session = (mo, lifts, day = 10) => ({
  type: 'push',
  timestamp: new Date(2026, mo, day, 12).getTime(),
  duration: 0,
  tonnage: 0,
  exercises: lifts.map(([name, sets]) => ({ name, sets })),
});

describe('buildIndexSeries — цепной индекс по e1RM', () => {
  test('(а) новый лифт в середине истории не двигает индекс', () => {
    const history = [
      session(0, [['Bench Press', one(100)]]),
      session(1, [['Bench Press', one(100)], ['Row', one(40)]]),
      session(2, [['Bench Press', one(100)], ['Row', one(40)]]),
      session(3, [['Bench Press', one(100)], ['Row', one(40)]]),
    ];
    const { idx } = buildIndexSeries(history);
    assert.equal(idx.length, 4);
    for (const v of idx) assert.ok(Math.abs(v - 1) < 1e-9, `индекс сдвинулся: ${v}`);
  });

  test('(б) +50% и −33% дают 100, а не +8.5%', () => {
    const history = [
      session(0, [['Bench Press', one(90)], ['Row', one(90)]]),
      session(1, [['Bench Press', one(135)], ['Row', one(60)]]),
    ];
    assert.equal(score(history), 100);
  });

  test('(в) рост повторов при том же весе поднимает индекс', () => {
    const history = [
      lift(0, 'Bench Press', [{ weight: 80, reps: 5, done: true }]),
      lift(1, 'Bench Press', [{ weight: 80, reps: 10, done: true }]),
    ];
    // e1RM 93 → 107
    assert.equal(score(history), 115);
  });

  test('(г) пропуск месяца: сравнение с последним виденным, прирост считается один раз', () => {
    const history = [
      session(0, [['Bench Press', one(100)], ['Squat', one(100)]]),
      session(1, [['Squat', one(100)]]),
      session(2, [['Bench Press', one(110)], ['Squat', one(100)]]),
      session(3, [['Bench Press', one(110)], ['Squat', one(100)]]),
    ];
    const { idx } = buildIndexSeries(history);
    assert.equal(idx.length, 4);
    assert.ok(Math.abs(idx[1] - 1) < 1e-9, 'месяц без жима: только присед, ноль роста');
    // март: жим 110/100 (последний виденный — январь) и присед 1.0 → √1.1
    assert.ok(Math.abs(idx[2] - Math.sqrt(1.1)) < 1e-9, `март: ${idx[2]}`);
    assert.ok(Math.abs(idx[3] - idx[2]) < 1e-9, 'апрель: прирост жима не засчитан дважды');
  });

  test('(д) регистр, пробелы и alias — один лифт', () => {
    const history = [
      lift(0, 'Cable Row', one(60)),
      lift(1, ' seated cable row ', one(66)),
      lift(2, 'Seated Cable Row', one(66)),
    ];
    const { idx } = buildIndexSeries(history);
    assert.equal(idx.length, 3, 'один лифт, три месяца — а не две серии по одному месяцу');
    assert.equal(Math.round(idx[2] * 100), 110);

    const caseOnly = [lift(0, 'Bench Press', one(100)), lift(1, 'bench press ', one(110))];
    assert.equal(score(caseOnly), 110);
  });

  test('(е) неподнятые подходы (done:false) не попадают в e1RM', () => {
    const history = [
      lift(0, 'Bench Press', one(100)),
      lift(1, 'Bench Press', [
        { weight: 100, reps: 1, done: true },
        { weight: 120, reps: 1, done: false },
      ]),
    ];
    assert.equal(score(history), 100);
  });

  test('лифт с одним месяцем истории в индекс не входит', () => {
    const history = [
      session(0, [['Bench Press', one(100)]]),
      session(1, [['Bench Press', one(100)], ['Deadlift', one(200)]]),
      session(2, [['Bench Press', one(100)]]),
    ];
    assert.equal(score(history), 100);
    assert.equal(buildIndexSeries(history).months.length, 3);
  });

  test('история короче двух месяцев — пустой индекс', () => {
    assert.deepEqual(buildIndexSeries([lift(0, 'Bench Press', one(100))]), { months: [], idx: [] });
    assert.deepEqual(buildIndexSeries([]), { months: [], idx: [] });
    assert.deepEqual(buildIndexSeries(null), { months: [], idx: [] });
  });

  test('лифтов больше шести — в индексе все (лимит 6 относится только к карточкам)', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const history = [
      session(0, names.map((n) => [n, one(100)])),
      // растёт только восьмой по алфавиту лифт
      session(1, names.map((n) => [n, one(n === 'H' ? 121 : 100)])),
    ];
    // geomean(1,…,1, 1.21) по 8 лифтам = 1.21^(1/8)
    assert.equal(score(history), Math.round(Math.pow(1.21, 1 / 8) * 100));
  });

  test('повреждённые записи не роняют расчёт', () => {
    const history = [
      null,
      { timestamp: 'x', exercises: [] },
      { timestamp: new Date(2026, 0, 5).getTime(), exercises: [null, { name: 5, sets: one(10) }, { name: 'Bench Press' }] },
      { _deleted: true, timestamp: new Date(2026, 1, 5).getTime(), exercises: [{ name: 'Bench Press', sets: one(500) }] },
      lift(0, 'Bench Press', [{ weight: 0, reps: 5, done: true }, { weight: 100, reps: 0, done: true }]),
    ];
    assert.deepEqual(buildIndexSeries(history), { months: [], idx: [] });
  });
});

describe('Индекс силы — витрина', () => {
  const history = [
    lift(0, 'Bench Press', one(100)),
    lift(1, 'Bench Press', one(110)),
    lift(3, 'Bench Press', one(121)),
  ];

  test('шторка: score и gain берутся из цепного индекса', () => {
    const plot = strengthIndexPlot(history);
    assert.ok(plot);
    assert.equal(plot.score, 121);
    assert.equal(plot.gain, 21);
    assert.equal(plot.pts.length, 3);
  });

  test('hero показывается уже с двух месяцев истории лифта', () => {
    const mount = { innerHTML: '' };
    renderStrengthHero([lift(0, 'Bench Press', one(100)), lift(1, 'Bench Press', one(110))], mount);
    assert.match(mount.innerHTML, /data-action="analytics:openIndex"/);
    assert.match(mount.innerHTML, />110</);
  });

  test('спарк в hero ставит точки по времени: пропущенный месяц виден как зазор', () => {
    const mount = { innerHTML: '' };
    renderStrengthHero(history, mount);
    const d = mount.innerHTML.match(/<path d="([^"]+)"[^>]*class="sh-spark-stroke"/)[1];
    // путь «M x,y C c1 c2 x,y C …»: узлы — каждая третья пара координат
    const xs = d.match(/\d+\.\d(?=,)/g).map(Number);
    const nodes = xs.filter((_, i) => i % 3 === 0);
    assert.equal(nodes.length, 3, `не разобрал путь: ${d}`);
    // янв, фев, апр: шаги 1 и 2 месяца → второй зазор вдвое шире (с допуском на месяц разной длины)
    const gap1 = nodes[1] - nodes[0];
    const gap2 = nodes[2] - nodes[1];
    assert.ok(gap2 > gap1 * 1.5, `зазоры ${gap1} и ${gap2}`);
  });

  test('подпись говорит про силу, а не про веса', () => {
    const mount = { innerHTML: '' };
    renderStrengthHero(history, mount);
    assert.match(mount.innerHTML, /avg strength gain since start|средний рост силы с начала/);
    assert.doesNotMatch(mount.innerHTML, /avg weight gain|рост весов/);
  });
});
