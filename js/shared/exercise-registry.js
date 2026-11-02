// @ts-check
/* ════════════════════════════════════════════════════════
   exercise-registry.js — реестр упражнений (DATA-1, аудит логики данных 01.11)

   Ключ упражнения в истории — его название, а названий у одного движения
   несколько (`Dips` / `Dips (Chest Focus)`, `Pullover DB` / `Dumbbell Pullover`).
   Реестр даёт стабильный id, семейство, вариант, мышцы и алиасы. Данные —
   таблица семейств из docs/handoff/HANDOFF_data_logic.md (утверждена Gio 01.11),
   строки пронумерованы полем `row`. Добавлять строки в таблицу — только решением Gio.

   Чистое чтение: ни флагов, ни DOM, ни IDB, ничего не пишет. Имена в сохранённых
   сессиях не меняются — реестр отвечает на вопрос «что это за движение».
   Флаг `exercise-registry` стоит у потребителей (lift-map, exercise-identity).

   Рекорды («Мой максимум») ведутся по варианту, не по семейству: смысл веса у
   вариантов разный. Поэтому id — это вариант (`bench.barbell`), семейство — группа.
   ════════════════════════════════════════════════════════ */

/**
 * @typedef {'bench'|'squat'|'deadlift'|'ohp'} LiftKey
 * @typedef {Object} ExerciseEntry
 * @property {string} id            стабильный id варианта: `<семейство>.<вариант>`
 * @property {number} row           номер строки таблицы семейств
 * @property {string} family        id семейства
 * @property {string} familyRu      семейство по-русски (как в таблице)
 * @property {string} variant       id варианта
 * @property {string} variantRu     вариант по-русски (пусто — таблица варианта не называет)
 * @property {ReadonlyArray<string>} muscles  id мышц, главные первыми
 * @property {ReadonlyArray<string>} names    имена в истории; первое — каноническое
 * @property {LiftKey} [lift]       базовое движение для lift-map/DOTS; нет — в нормы не входит
 */

/** id мышцы → подпись (формулировки таблицы семейств). */
export const MUSCLE_RU = Object.freeze({
  chest: 'грудь',
  'chest-upper': 'грудь (верх)',
  triceps: 'трицепс',
  biceps: 'бицепс',
  brachialis: 'брахиалис',
  shoulders: 'плечи',
  'delts-side': 'средняя дельта',
  'delts-rear': 'задняя дельта',
  traps: 'трапеция',
  lats: 'широчайшие',
  back: 'спина',
  'lower-back': 'поясница',
  quads: 'квадрицепс',
  glutes: 'ягодицы',
  hamstrings: 'бицепс бедра',
  adductors: 'приводящие',
  calves: 'икры',
  legs: 'ноги',
  abs: 'пресс',
});

/**
 * @param {number} row
 * @param {string} family
 * @param {string} familyRu
 * @param {string} variant
 * @param {string} variantRu
 * @param {string[]} muscles
 * @param {string[]} names
 * @param {LiftKey} [lift]
 * @returns {Readonly<ExerciseEntry>}
 */
function ex(row, family, familyRu, variant, variantRu, muscles, names, lift) {
  /** @type {ExerciseEntry} */
  const e = {
    id: `${family}.${variant}`,
    row,
    family,
    familyRu,
    variant,
    variantRu,
    muscles: Object.freeze(muscles),
    names: Object.freeze(names),
  };
  if (lift) e.lift = lift;
  return Object.freeze(e);
}

/**
 * Русские алиасы у «жима» и «жима стоя» — из прежних регэкспов lift-map
 * (`/жим лёжа/`, `/жим штанги лёжа/`, `/жим стоя/`) и карточки DATA-1.
 * Английские `Overhead Press` / `OHP` — оттуда же (`/overhead press/`, `/\bohp\b/`).
 * @type {ReadonlyArray<Readonly<ExerciseEntry>>}
 */
export const EXERCISES = Object.freeze([
  ex(1, 'bench', 'жим лёжа', 'barbell', 'штанга', ['chest'],
    ['Bench Press', 'Barbell Bench Press', 'Жим лёжа', 'Жим штанги лёжа'], 'bench'),
  ex(2, 'bench', 'жим лёжа', 'dumbbell', 'гантели', ['chest'], ['Dumbbell Bench Press']),
  ex(3, 'incline-press', 'жим на наклонной', 'dumbbell', 'гантели', ['chest-upper'],
    ['Incline DB Press', 'Incline Dumbbell Bench Press']),
  ex(4, 'chest-press', 'жим от груди', 'machine', 'тренажёр', ['chest'], ['Machine Chest Press']),
  ex(5, 'fly', 'сведение', 'machine', 'тренажёр', ['chest'], ['Pec Deck Fly', 'Butterfly Machine']),
  ex(6, 'dips', 'брусья', 'bodyweight', 'свой вес/отягощение', ['chest', 'triceps'],
    ['Chest Dip', 'Dips', 'Dips (Chest Focus)', 'Tricep Dip']),
  // Второй вариант строки 6: в истории под этим именем пока ничего нет — вес = стек.
  ex(6, 'dips', 'брусья', 'machine', 'тренажёр dips (стек)', ['chest', 'triceps'], []),
  ex(7, 'pullover', 'пуловер', 'base', '', ['chest'], ['Dumbbell Pullover', 'Pullover DB']),
  ex(8, 'leg-press', 'жим ногами 45°', 'base', '', ['quads', 'glutes'], ['Leg Press']),
  // Не DOTS: присед в тренажёре считается своим вариантом, `lift` не задан.
  ex(9, 'squat', 'присед', 'machine', 'тренажёр (не DOTS)', ['quads', 'glutes'],
    ['Hack Squat (Machine)', 'Squat machine']),
  ex(10, 'leg-extension', 'разгибание ног', 'base', '', ['quads'], ['Leg Extension', 'Leg Extensions']),
  ex(11, 'leg-curl', 'сгибание ног', 'base', '', ['hamstrings'], ['Lying Leg Curl', 'Leg Curl']),
  ex(12, 'lunge', 'выпады', 'base', '', ['legs', 'glutes'], ['Walking Lunge', 'Reverse Lunge']),
  ex(13, 'hip-thrust', 'ягодичный мост', 'base', '', ['glutes'], ['Barbell Hip Thrust']),
  ex(14, 'hip-abduction', 'отведение бедра', 'base', '', ['glutes'], ['Hip Abduction Machine']),
  ex(15, 'hip-adduction', 'приведение бедра', 'base', '', ['adductors'], ['Hip Adduction Machine']),
  ex(16, 'calf-raise', 'подъём на носки', 'base', '', ['calves'], ['Calf Raise', 'Standing Calf Raise']),
  ex(17, 'pulldown', 'тяга верхнего блока', 'base', '', ['lats'], ['Lat Pulldown']),
  // `Pull-Up` и `Pull-up` (две записи таблицы) различаются только регистром — реестр их не различает.
  ex(18, 'pull-up', 'подтягивания', 'base', '', ['lats'], ['Pull-Up']),
  ex(19, 'cable-row', 'тяга нижнего блока', 'base', '', ['back'],
    ['Seated Cable Row', 'Cable Row', 'Low Block Cable Row']),
  ex(20, 'lever-row', 'рычажная тяга сидя', 'base', '', ['back'], ['Iso-Lateral Seated Row']),
  ex(21, 't-bar-row', 'Т-тяга', 'supported', 'с упором', ['back'], ['Chest-Supported T-Bar Row']),
  ex(21, 't-bar-row', 'Т-тяга', 'bent', 'в наклоне', ['back'], ['T-Bar Row']),
  ex(22, 'back-extension', 'гиперэкстензия', 'base', '', ['lower-back'], ['Back Extension (Hyperextension)']),
  ex(23, 'shrug', 'шраги', 'base', '', ['traps'], ['Dumbbell Shrugs']),
  ex(24, 'ohp', 'жим над головой', 'barbell', 'штанга стоя', ['shoulders'],
    ['Overhead Press (OHP)', 'Overhead Press', 'OHP', 'Жим штанги стоя', 'Жим стоя'], 'ohp'),
  // Аналог на оси OHP ромба (решение Gio 01.11), но в нормах ExRx для штанги его нет: `lift` не задан.
  ex(25, 'ohp', 'жим над головой', 'dumbbell-seated', 'гантели сидя', ['shoulders'],
    ['Seated Dumbbell Shoulder Press']),
  ex(26, 'lateral-raise', 'махи в стороны', 'base', '', ['delts-side'],
    ['Dumbbell Lateral Raise', 'Lateral Raise']),
  ex(27, 'rear-fly', 'обратное сведение', 'base', '', ['delts-rear'], ['Reverse Pec Deck']),
  ex(28, 'upright-row', 'тяга к подбородку', 'base', '', ['shoulders', 'traps'], ['Wide-Grip Upright Row']),
  ex(29, 'pushdown', 'разгибание на блоке', 'base', '', ['triceps'], ['Tricep Pushdown', 'Rope Pushdown']),
  ex(30, 'skull-crusher', 'французский жим', 'base', '', ['triceps'],
    ['Skull Crusher (Lying Tricep Extension)']),
  ex(31, 'overhead-extension', 'разгибание из-за головы', 'base', '', ['triceps'], ['Overhead Tricep Ext.']),
  ex(32, 'cable-curl', 'сгибание на блоке', 'base', '', ['biceps'], ['Cable Curl']),
  ex(33, 'barbell-curl', 'сгибание со штангой', 'base', '', ['biceps'], ['Barbell Curl', 'EZ-Bar Curl']),
  ex(34, 'dumbbell-curl', 'сгибание гантелей', 'base', '', ['biceps'],
    ['Alternating Curls DB', 'Alternating Dumbbell Curls']),
  ex(35, 'hammer-curl', 'молотки', 'base', '', ['biceps', 'brachialis'], ['Hammer Curl']),
  ex(36, 'preacher-curl', 'Скотт', 'base', '', ['biceps'], ['Preacher Curls (Scot-seated)']),
  ex(37, 'crunch', 'скручивания', 'base', '', ['abs'], ['Crunch']),
]);

/**
 * Ключ сравнения имени: обрезка, нижний регистр, «ё» = «е», схлопнутые пробелы.
 * Дефисы и скобки не трогаем — `Pull-Up` и `Pull Up` остаются разными именами.
 * @param {unknown} name
 * @returns {string}
 */
export function normalizeName(name) {
  return String(name ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

/** @type {Map<string, Readonly<ExerciseEntry>>} нормализованное имя → запись */
const BY_NAME = new Map();
/** @type {Map<string, Readonly<ExerciseEntry>>} */
const BY_ID = new Map();
for (const e of EXERCISES) {
  BY_ID.set(e.id, e);
  for (const n of e.names) BY_NAME.set(normalizeName(n), e);
}

/**
 * Запись реестра по любому из имён. Неизвестное имя — `null` (не угадываем).
 * @param {unknown} name
 * @returns {Readonly<ExerciseEntry>|null}
 */
export function findExercise(name) {
  return BY_NAME.get(normalizeName(name)) ?? null;
}

/**
 * @param {string} id
 * @returns {Readonly<ExerciseEntry>|null}
 */
export function getExercise(id) {
  return BY_ID.get(id) ?? null;
}

/**
 * Все варианты семейства (порядок таблицы).
 * @param {string} family id семейства
 * @returns {Array<Readonly<ExerciseEntry>>}
 */
export function variantsOfFamily(family) {
  return EXERCISES.filter((e) => e.family === family);
}

/**
 * Каноническое имя варианта: первое из таблицы; у варианта без имён в истории — null.
 * @param {Readonly<ExerciseEntry>} entry
 * @returns {string|null}
 */
export function canonicalNameOf(entry) {
  return entry.names[0] ?? null;
}
