// @ts-check
/* ════════════════════════════════════════════════════════
   shared/txt-export.js — журнал тренировок обычным текстом
   ────────────────────────────────────────────────────────
   Третий формат выгрузки рядом с JSON и CSV, и у каждого своя работа:
     JSON — бэкап (единственный, который умеет вернуться назад импортом);
     CSV  — таблица под Excel/Sheets, разбор по подходам;
     TXT  — чтение человеком: скинуть тренеру, вклеить в заметки, распечатать.
   Отсюда решения формата: моноширинного выравнивания нет (в мессенджерах
   всё равно поедет), эмодзи нет (правило DESIGN_DNA), единицы подписаны.

   Шапка отвечает на вопрос «кто, где и сколько» до первой тренировки:
   паспорт (имя/возраст/вес), место (зал и страна) и блок ИТОГО. Без него
   получатель видел четыре разрозненные тренировки и ни одной суммы, кроме
   тоннажа.

   Нетронутые упражнения (ни одного выполненного подхода) в текст не
   попадают: в поле план почти всегда шире факта, и раньше 80% файла
   занимали строки «— пропущен». Факт не теряется — в шапке тренировки
   стоит «сделано 3 из 8».

   Функция чистая: ни DOM, ни базы, ни локали из глобалей — язык и паспорт
   передают параметрами. Сохранение файла — `shared/download.js`.
   ════════════════════════════════════════════════════════ */

const L = {
  ru: {
    title: 'ATHLETE PRO — журнал тренировок',
    exported: 'Выгружено',
    athlete: 'Атлет',
    place: 'Зал',
    summary: 'ИТОГО',
    records: 'РЕКОРДЫ (1ПМ)',
    total: 'Тренировок',
    exercises: 'Упражнений',
    setsTotal: 'Подходов',
    time: 'Время в зале',
    tonnage: 'Общий тоннаж',
    empty: 'История пуста — ни одной завершённой тренировки.',
    doneOf: 'сделано {a} из {b}',
    min: 'мин',
    hr: 'ч',
    kg: 'кг',
    skipped: 'пропущен',
    rpe: 'RPE',
    sets: ['подход', 'подхода', 'подходов'],
    years: ['год', 'года', 'лет'],
  },
  en: {
    title: 'ATHLETE PRO — training log',
    exported: 'Exported',
    athlete: 'Athlete',
    place: 'Gym',
    summary: 'SUMMARY',
    records: 'RECORDS (1RM)',
    total: 'Workouts',
    exercises: 'Exercises',
    setsTotal: 'Sets',
    time: 'Time in gym',
    tonnage: 'Total tonnage',
    empty: 'No history yet — not a single finished workout.',
    doneOf: 'done {a} of {b}',
    min: 'min',
    hr: 'h',
    kg: 'kg',
    skipped: 'skipped',
    rpe: 'RPE',
    sets: ['set', 'sets', 'sets'],
    years: ['y', 'y', 'y'],
  },
};

const RULE = '─'.repeat(46);

/**
 * Дата в локальном виде `2026-08-02, чт`.
 * @param {number} ts
 * @param {'ru'|'en'} lang
 */
function _day(ts, lang) {
  const d = new Date(ts);
  const iso = Number.isFinite(ts) ? d.toISOString().split('T')[0] : '—';
  const wd = Number.isFinite(ts)
    ? d.toLocaleDateString(lang === 'ru' ? 'ru' : 'en', { weekday: 'short' })
    : '';
  return wd ? `${iso}, ${wd}` : iso;
}

/** Разделители тысяч, чтобы 12450 читалось как 12 450. */
function _num(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  // Вес бывает дробным (2.5 кг) — округлять до целого нельзя.
  const r = Number.isInteger(v) ? v : Math.round(v * 100) / 100;
  const [int, frac] = String(r).split('.');
  // Группируем сами, не через toLocaleString: у Node без полного ICU
  // разделитель другой, и тест бы плавал от машины к машине.
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return frac ? `${grouped}.${frac}` : grouped;
}

/**
 * Форма числительного. Английский обходится двумя (1 set / 2 sets), русскому
 * нужны три, и правило не сводится к «последняя цифра»: 11 — «подходов»,
 * 21 — «подход».
 * @param {number} n
 * @param {string[]} forms — [один, два, пять]
 * @param {'ru'|'en'} lang
 */
function _plural(n, forms, lang) {
  if (lang !== 'ru') return Math.abs(n) === 1 ? forms[0] : forms[1];
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/**
 * Миллисекунды → «2 ч 03 мин» / «47 мин».
 * @param {number} ms
 * @param {typeof L.ru} d
 */
function _dur(ms, d) {
  const mins = Math.round((Number(ms) || 0) / 60000);
  if (mins < 60) return `${mins} ${d.min}`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} ${d.hr} ${String(m).padStart(2, '0')} ${d.min}`;
}

/** Подходы упражнения, безопасно к мусору на входе. */
const _sets = (ex) => (Array.isArray(ex?.sets) ? ex.sets : []);
/** `done !== false` — старые записи выполненный подход не помечали вовсе. */
const _doneCount = (ex) => _sets(ex).filter((s) => s?.done !== false).length;

/**
 * Тренировки → человекочитаемый текст.
 * @param {Array<any>} workouts — как отдаёт DB.Workouts.getAll()
 * @param {{
 *   lang?: 'ru'|'en',
 *   now?: Date,
 *   athlete?: { name?: string, age?: number|null, weight?: number|null, gym?: string, country?: string } | null,
 *   records?: Array<{ name: string, value: number }> | null,
 * }} [opts]
 * @returns {string}
 */
export function workoutsToTxt(workouts, { lang = 'en', now = new Date(), athlete = null, records = null } = {}) {
  const d = L[lang] || L.en;
  const list = (Array.isArray(workouts) ? workouts.slice() : [])
    .sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0)); // свежие сверху

  let totalTonnage = 0;
  let totalDuration = 0;
  let totalExercises = 0;
  let totalSets = 0;
  for (const w of list) {
    totalTonnage += Number(w?.tonnage) || 0;
    totalDuration += Number(w?.duration) || 0;
    for (const ex of (Array.isArray(w?.exercises) ? w.exercises : [])) {
      const done = _doneCount(ex);
      if (!done) continue;         // нетронутое в счёт не идёт — как и в тексте ниже
      totalExercises++;
      totalSets += done;
    }
  }

  const head = [d.title, RULE, `${d.exported}: ${now.toISOString().split('T')[0]}`];

  // Паспорт — только из того, что реально заполнено: пустые поля молчат,
  // а не печатают «Атлет: —».
  const who = [];
  if (athlete?.name) who.push(String(athlete.name));
  if (athlete?.age) who.push(`${athlete.age} ${_plural(athlete.age, d.years, lang)}`);
  if (athlete?.weight) who.push(`${_num(athlete.weight)} ${d.kg}`);
  if (who.length) head.push(`${d.athlete}: ${who.join('  ·  ')}`);

  const where = [athlete?.gym, athlete?.country].filter(Boolean).map(String);
  if (where.length) head.push(`${d.place}: ${where.join('  ·  ')}`);

  head.push(
    '',
    d.summary,
    `  ${d.total}: ${list.length}`,
    `  ${d.exercises}: ${totalExercises}`,
    `  ${d.setsTotal}: ${totalSets}`,
    `  ${d.time}: ${_dur(totalDuration, d)}`,
    `  ${d.tonnage}: ${_num(totalTonnage)} ${d.kg}`,
    '',
  );

  const prs = (Array.isArray(records) ? records : [])
    .filter((r) => r?.name && Number(r.value) > 0)
    .sort((a, b) => Number(b.value) - Number(a.value));
  if (prs.length) {
    head.push(d.records, ...prs.map((r) => `  ${r.name}: ${_num(r.value)} ${d.kg}`), '');
  }

  if (!list.length) return [...head, d.empty, ''].join('\n');

  const body = list.map((w) => {
    const planned = Array.isArray(w?.exercises) ? w.exercises : [];
    const performed = planned.filter((ex) => _doneCount(ex) > 0);

    const meta = [`${_dur(w?.duration, d)}`, `${_num(w?.tonnage)} ${d.kg}`];
    // Пропуск не замалчиваем — но одной строкой, а не тремя на упражнение.
    if (performed.length < planned.length) {
      meta.push(d.doneOf.replace('{a}', String(performed.length)).replace('{b}', String(planned.length)));
    }

    const lines = [
      RULE,
      `${_day(w?.timestamp, lang)}  ·  ${String(w?.type || '').toUpperCase()}`,
      meta.join('  ·  '),
      '',
    ];

    for (const ex of performed) {
      const n = _doneCount(ex);
      const label = ex?.tag ? `${ex?.name || '—'} · ${ex.tag}` : (ex?.name || '—');
      lines.push(`  ${label}  (${n} ${_plural(n, d.sets, lang)})`);
      _sets(ex).forEach((s, i) => {
        if (s?.done === false) {
          lines.push(`    ${i + 1}. — ${d.skipped}`);
          return;
        }
        const rpe = s?.rpe ? `  ${d.rpe} ${s.rpe}` : '';
        lines.push(`    ${i + 1}. ${_num(s?.weight)} ${d.kg} × ${_num(s?.reps)}${rpe}`);
      });
      lines.push('');
    }
    return lines.join('\n');
  });

  return [...head, ...body].join('\n');
}
