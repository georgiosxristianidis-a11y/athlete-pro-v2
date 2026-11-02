// DATA-1: реестр упражнений. Таблица ниже — вторая, независимая запись таблицы семейств
// из HANDOFF_data_logic.md (утверждена Gio 01.11): строка реестра обязана с ней совпасть.
// Реестр — чистое чтение; потребители (lift-map, exercise-identity) за флагом
// `exercise-registry`: OFF — прежнее поведение, ON — через реестр.
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const flagStore = new Map();
globalThis.localStorage = { getItem: (k) => flagStore.get(k) ?? null };
const setRegistry = (on) => flagStore.set('ap-flag-exercise-registry', on ? '1' : '0');

const { EXERCISES, MUSCLE_RU, findExercise, getExercise, normalizeName, variantsOfFamily } =
  await import('../js/shared/exercise-registry.js');
const { mapOneRMs } = await import('../js/shared/lift-map.js');
const { canonicalName, canonicalKey } = await import('../js/shared/exercise-identity.js');

// [номер строки, названия в истории, семейство]
const TABLE = [
  [1, ['Bench Press', 'Barbell Bench Press'], 'жим лёжа'],
  [2, ['Dumbbell Bench Press'], 'жим лёжа'],
  [3, ['Incline DB Press', 'Incline Dumbbell Bench Press'], 'жим на наклонной'],
  [4, ['Machine Chest Press'], 'жим от груди'],
  [5, ['Pec Deck Fly', 'Butterfly Machine'], 'сведение'],
  [6, ['Chest Dip', 'Dips', 'Dips (Chest Focus)', 'Tricep Dip'], 'брусья'],
  [7, ['Dumbbell Pullover', 'Pullover DB'], 'пуловер'],
  [8, ['Leg Press'], 'жим ногами 45°'],
  [9, ['Hack Squat (Machine)', 'Squat machine'], 'присед'],
  [10, ['Leg Extension', 'Leg Extensions'], 'разгибание ног'],
  [11, ['Lying Leg Curl', 'Leg Curl'], 'сгибание ног'],
  [12, ['Walking Lunge', 'Reverse Lunge'], 'выпады'],
  [13, ['Barbell Hip Thrust'], 'ягодичный мост'],
  [14, ['Hip Abduction Machine'], 'отведение бедра'],
  [15, ['Hip Adduction Machine'], 'приведение бедра'],
  [16, ['Calf Raise', 'Standing Calf Raise'], 'подъём на носки'],
  [17, ['Lat Pulldown'], 'тяга верхнего блока'],
  [18, ['Pull-Up', 'Pull-up'], 'подтягивания'],
  [19, ['Seated Cable Row', 'Cable Row', 'Low Block Cable Row'], 'тяга нижнего блока'],
  [20, ['Iso-Lateral Seated Row'], 'рычажная тяга сидя'],
  [21, ['Chest-Supported T-Bar Row', 'T-Bar Row'], 'Т-тяга'],
  [22, ['Back Extension (Hyperextension)'], 'гиперэкстензия'],
  [23, ['Dumbbell Shrugs'], 'шраги'],
  [24, ['Overhead Press (OHP)'], 'жим над головой'],
  [25, ['Seated Dumbbell Shoulder Press'], 'жим над головой'],
  [26, ['Dumbbell Lateral Raise', 'Lateral Raise'], 'махи в стороны'],
  [27, ['Reverse Pec Deck'], 'обратное сведение'],
  [28, ['Wide-Grip Upright Row'], 'тяга к подбородку'],
  [29, ['Tricep Pushdown', 'Rope Pushdown'], 'разгибание на блоке'],
  [30, ['Skull Crusher (Lying Tricep Extension)'], 'французский жим'],
  [31, ['Overhead Tricep Ext.'], 'разгибание из-за головы'],
  [32, ['Cable Curl'], 'сгибание на блоке'],
  [33, ['Barbell Curl', 'EZ-Bar Curl'], 'сгибание со штангой'],
  [34, ['Alternating Curls DB', 'Alternating Dumbbell Curls'], 'сгибание гантелей'],
  [35, ['Hammer Curl'], 'молотки'],
  [36, ['Preacher Curls (Scot-seated)'], 'Скотт'],
  [37, ['Crunch'], 'скручивания'],
];

beforeEach(() => setRegistry(true));

describe('реестр: таблица семейств Gio', () => {
  test('37 строк, каждая — в реестре, ни одной лишней', () => {
    assert.equal(TABLE.length, 37);
    assert.deepEqual([...new Set(EXERCISES.map((e) => e.row))], TABLE.map(([n]) => n));
  });

  test('каждое имя каждой строки находится и ведёт в свою строку и семейство', () => {
    for (const [row, names, familyRu] of TABLE) {
      for (const n of names) {
        const e = findExercise(n);
        assert.ok(e, `${row}: «${n}» не найдено`);
        assert.equal(e.row, row, n);
        assert.equal(e.familyRu, familyRu, n);
      }
    }
  });

  test('id уникальны; имя принадлежит одной записи; id читается обратно', () => {
    const ids = EXERCISES.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
    const seen = new Map();
    for (const e of EXERCISES) {
      assert.equal(getExercise(e.id), e);
      for (const n of e.names) {
        const k = normalizeName(n);
        assert.ok(!seen.has(k), `«${n}» уже у ${seen.get(k)}`);
        seen.set(k, e.id);
      }
    }
  });

  test('мышцы — только из словаря; у каждой записи есть мышцы', () => {
    for (const e of EXERCISES) {
      assert.ok(e.muscles.length > 0, e.id);
      for (const m of e.muscles) assert.ok(m in MUSCLE_RU, `${e.id}: ${m}`);
    }
  });

  test('развилки таблицы: гантели и штанга — разные варианты; брусья и Т-тяга — два варианта', () => {
    assert.notEqual(findExercise('Dumbbell Bench Press').id, findExercise('Bench Press').id);
    assert.equal(findExercise('Dumbbell Bench Press').family, findExercise('Bench Press').family);
    assert.equal(variantsOfFamily('dips').length, 2);
    assert.notEqual(findExercise('T-Bar Row').id, findExercise('Chest-Supported T-Bar Row').id);
    assert.equal(findExercise('Dips').id, findExercise('Tricep Dip').id);
    assert.equal(findExercise('Hack Squat (Machine)').family, 'squat');
    assert.equal(findExercise('Hack Squat (Machine)').lift, undefined, 'тренажёр — не DOTS');
  });

  test('реестр заморожен, нормализация: регистр, ё/е, пробелы', () => {
    assert.ok(Object.isFrozen(EXERCISES) && Object.isFrozen(EXERCISES[0]));
    assert.equal(findExercise('  BENCH   press ').id, 'bench.barbell');
    assert.equal(findExercise('жим лежа').id, 'bench.barbell');
    assert.equal(findExercise('ЖИМ ЛЁЖА').id, 'bench.barbell');
    assert.equal(findExercise('Unknown Movement'), null);
    assert.equal(findExercise(undefined), null);
  });
});

describe('lift-map: флаг OFF — прежнее поведение, ON — через реестр', () => {
  const rm = (id) => mapOneRMs([{ id, value: 100 }]);

  test('OFF: гантели засчитаны штангой, «жим лежа» не распознан (легаси побитно)', () => {
    setRegistry(false);
    assert.equal(rm('Dumbbell Bench Press').bench, 100);
    assert.equal(rm('Incline Dumbbell Bench Press').bench, 100);
    assert.equal(rm('Жим лежа').bench, undefined);
    assert.equal(rm('Жим штанги стоя').ohp, undefined);
    assert.equal(rm('Жим лёжа').bench, 100);
    assert.equal(rm('Присед в тренажёре').squat, 100);
  });

  test('ON: гантели и тренажёр — не штанга; «лежа» и «штанги стоя» узнаны', () => {
    assert.equal(rm('Dumbbell Bench Press').bench, undefined);
    assert.equal(rm('Incline DB Press').bench, undefined);
    assert.equal(rm('Жим лежа').bench, 100);
    assert.equal(rm('Жим штанги лежа').bench, 100);
    assert.equal(rm('Жим штанги стоя').ohp, 100);
    assert.equal(rm('Seated Dumbbell Shoulder Press').ohp, undefined);
    assert.equal(rm('Hack Squat (Machine)').squat, undefined);
  });

  test('ON: штанга и имена вне реестра работают как раньше', () => {
    for (const [id, key] of [
      ['Barbell Bench Press', 'bench'], ['Bench Press', 'bench'], ['Overhead Press (OHP)', 'ohp'],
      ['Barbell Back Squat', 'squat'], ['Присед', 'squat'], ['Deadlift (Conventional)', 'deadlift'],
      ['Становая', 'deadlift'], ['Incline Barbell Bench Press', 'bench'],
    ]) assert.equal(rm(id)[key], 100, id);
    assert.deepEqual(rm('Lat Pulldown'), {});
    assert.deepEqual(rm('Хак-присед'), {}, 'хак вне реестра — тоже не DOTS');
  });

  test('максимум по ключу берётся и при ON', () => {
    const r = mapOneRMs([{ id: 'Bench Press', value: 90 }, { id: 'Barbell Bench Press', value: 100 },
      { id: 'Dumbbell Bench Press', value: 140 }]);
    assert.equal(r.bench, 100);
  });
});

describe('exercise-identity: флаг OFF — только SAME_MOVEMENT, ON — реестр', () => {
  test('OFF: расколы имён не склеены, остальное как раньше', () => {
    setRegistry(false);
    assert.equal(canonicalName('Dips (Chest Focus)'), 'Dips (Chest Focus)');
    assert.equal(canonicalName('Pullover DB'), 'Pullover DB');
    assert.equal(canonicalName(' Cable Row '), 'Seated Cable Row');
    assert.equal(canonicalKey('Жим ЛЁЖА'), 'жим лёжа');
  });

  test('ON: расколы из аудита склеены на чтении, имя — первое в строке таблицы', () => {
    assert.equal(canonicalName('Dips (Chest Focus)'), 'Chest Dip');
    assert.equal(canonicalKey('Dips'), canonicalKey('Chest Dip'));
    assert.equal(canonicalKey('Pullover DB'), canonicalKey('Dumbbell Pullover'));
    assert.equal(canonicalKey('Alternating Curls DB'), canonicalKey('Alternating Dumbbell Curls'));
    assert.equal(canonicalName('Cable Row'), 'Seated Cable Row');
    assert.equal(canonicalKey('жим лёжа'), canonicalKey('Жим лежа'));
  });

  test('ON: разные варианты не склеиваются; чужое имя — как есть', () => {
    assert.notEqual(canonicalKey('Dumbbell Bench Press'), canonicalKey('Bench Press'));
    assert.notEqual(canonicalKey('T-Bar Row'), canonicalKey('Chest-Supported T-Bar Row'));
    assert.equal(canonicalName('  Barbell Row '), 'Barbell Row');
    assert.equal(canonicalName(undefined), '');
  });
});
