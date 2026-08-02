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

   Функция чистая: ни DOM, ни базы, ни локали из глобалей — язык передают
   параметром. Сохранение файла — `shared/download.js`.
   ════════════════════════════════════════════════════════ */

const L = {
  ru: {
    title: 'ATHLETE PRO — журнал тренировок',
    exported: 'Выгружено',
    total: 'Тренировок',
    tonnage: 'Общий тоннаж',
    empty: 'История пуста — ни одной завершённой тренировки.',
    min: 'мин',
    kg: 'кг',
    skipped: 'пропущен',
    rpe: 'RPE',
    sets: 'подходов',
  },
  en: {
    title: 'ATHLETE PRO — training log',
    exported: 'Exported',
    total: 'Workouts',
    tonnage: 'Total tonnage',
    empty: 'No history yet — not a single finished workout.',
    min: 'min',
    kg: 'kg',
    skipped: 'skipped',
    rpe: 'RPE',
    sets: 'sets',
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
 * Тренировки → человекочитаемый текст.
 * @param {Array<any>} workouts — как отдаёт DB.Workouts.getAll()
 * @param {{ lang?: 'ru'|'en', now?: Date }} [opts]
 * @returns {string}
 */
export function workoutsToTxt(workouts, { lang = 'en', now = new Date() } = {}) {
  const d = L[lang] || L.en;
  const list = (Array.isArray(workouts) ? workouts.slice() : [])
    .sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0)); // свежие сверху

  const totalTonnage = list.reduce((s, w) => s + (Number(w?.tonnage) || 0), 0);

  const head = [
    d.title,
    RULE,
    `${d.exported}: ${now.toISOString().split('T')[0]}`,
    `${d.total}: ${list.length}`,
    `${d.tonnage}: ${_num(totalTonnage)} ${d.kg}`,
    '',
  ];

  if (!list.length) return [...head, d.empty, ''].join('\n');

  const body = list.map((w) => {
    const mins = Math.round((Number(w?.duration) || 0) / 60000);
    const lines = [
      RULE,
      `${_day(w?.timestamp, lang)}  ·  ${String(w?.type || '').toUpperCase()}`,
      `${mins} ${d.min}  ·  ${_num(w?.tonnage)} ${d.kg}`,
      '',
    ];

    for (const ex of (Array.isArray(w?.exercises) ? w.exercises : [])) {
      const sets = Array.isArray(ex?.sets) ? ex.sets : [];
      const doneCount = sets.filter((s) => s?.done !== false).length;
      lines.push(`  ${ex?.name || '—'}  (${doneCount} ${d.sets})`);
      sets.forEach((s, i) => {
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
