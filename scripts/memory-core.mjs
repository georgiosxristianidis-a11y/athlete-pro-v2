// Логика TTL и неймспейсов памяти (карточка FLOW-4). Чистые функции — CLI и
// тесты вызывают одно и то же, чтобы вердикт TTL можно было проверить без
// диска и без реального ~/.claude.
//
// МОДЕЛЬ. Взята у claude-flow: `artifacts` живут вечно, `events` — 30 дней,
// `patterns` — 7, `shared` — 30 минут. У нас на диске лежат только первые две
// категории: reference/user/feedback — это artifacts (правило, роль, купленный
// урок), project — events (состояние программы, устаревает за ~месяц). Двух
// оставшихся у нас нет: patterns у нас нет как отдельного типа (feedback уже
// содержит и то и другое), shared — рантайм сессии, не файл.
//
// АРХИВ, НЕ УДАЛЕНИЕ. Стейл-запись переезжает в `_archive/YYYY-MM/`, а не
// стирается: файл памяти живёт, `[[wiki]]`-ссылки на него разрешаются как
// раньше, из горячего индекса исчезает только СТРОКА. Обратный ход дешёвый.

const DEFAULT_TTL_DAYS = {
  project: 30,
  // Остальные типы — ∞: правила, роль, купленные уроки не стареют по календарю.
  feedback: null,
  reference: null,
  user: null,
};

const MS_PER_DAY = 86_400_000;

// Минимальный парсер frontmatter: файлы памяти пишет наш агент, формат
// стабилен (`---` … `---`), тянуть js-yaml ради двух полей избыточно.
export function parseFrontmatter(text) {
  const src = String(text).replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---/.exec(src);
  if (!m) return { name: null, type: null, modified: null };
  const body = m[1];

  const nameMatch = /^name:\s*(.+)$/m.exec(body);
  const typeMatch = /^\s+type:\s*(\S+)/m.exec(body);
  const modMatch = /^\s+modified:\s*(\S+)/m.exec(body);

  return {
    name: nameMatch ? nameMatch[1].trim() : null,
    type: typeMatch ? typeMatch[1].trim() : null,
    modified: modMatch ? modMatch[1].trim() : null,
  };
}

// Возраст в днях. Приоритет — frontmatter.modified (агент обновляет его при
// правке, это и есть keep-alive); если нет — mtime файла. Отсутствие обоих
// трактуется как «неизвестно»: не архивируем, а не «архивируем на всякий».
export function ageDays(fm, mtimeMs, nowMs = Date.now()) {
  let ts = null;
  if (fm?.modified) {
    const parsed = Date.parse(fm.modified);
    if (!Number.isNaN(parsed)) ts = parsed;
  }
  if (ts === null && Number.isFinite(mtimeMs)) ts = mtimeMs;
  if (ts === null) return null;
  return (nowMs - ts) / MS_PER_DAY;
}

// Вердикт по одной записи. Отдельная функция ради тестируемости: политика
// меняется в одном месте, все вызывающие получают её одинаково.
export function shouldArchive({ type, ageDays: age }, policy = DEFAULT_TTL_DAYS) {
  if (age === null || age === undefined) return false;
  if (!type) return false;
  const ttl = policy[type];
  if (ttl === null || ttl === undefined) return false; // ∞
  return age > ttl;
}

// Удаляет из MEMORY.md строки, ссылающиеся на архивируемые файлы, и схлопывает
// пустые секции (заголовок без единой ссылки под ним). Идемпотентно: повторный
// прогон на уже вычищенном индексе меняет 0 строк.
export function rewriteIndex(text, archivedFilenames) {
  const src = String(text).replace(/\r\n/g, '\n');
  if (!archivedFilenames.length) return { text: src, removed: 0 };

  const set = new Set(archivedFilenames);
  const isVictim = (line) => {
    // Markdown-ссылка вида `[Title](file.md)` — берём то, что в скобках после `]`.
    const m = /\]\(([^)]+)\)/.exec(line);
    if (!m) return false;
    // Отбрасываем якорь и путь — сверяем по basename (архив живёт в подкаталоге).
    const bare = m[1].split('#')[0].split('/').pop();
    return set.has(bare);
  };

  const lines = src.split('\n');
  const kept = [];
  let removed = 0;
  for (const line of lines) {
    if (isVictim(line)) {
      removed++;
      continue;
    }
    kept.push(line);
  }

  // Проход второй: схлопываем секции без ссылок. Секция = `# заголовок` до
  // следующего заголовка того же или высшего уровня; если между ними не
  // осталось ни одной строки-пункта, заголовок и его пустые строки тоже режем.
  const out = [];
  for (let i = 0; i < kept.length; i++) {
    const line = kept[i];
    const h = /^(#+)\s/.exec(line);
    if (h) {
      const level = h[1].length;
      // Смотрим вперёд до следующего заголовка того же/меньшего уровня.
      let j = i + 1;
      let hasItem = false;
      for (; j < kept.length; j++) {
        const h2 = /^(#+)\s/.exec(kept[j]);
        if (h2 && h2[1].length <= level) break;
        if (/^\s*-\s/.test(kept[j])) {
          hasItem = true;
          break;
        }
      }
      if (!hasItem) {
        // Секция пустая — пропускаем заголовок и пустые строки до конца секции.
        i = j - 1;
        continue;
      }
    }
    out.push(line);
  }

  // Сжимаем более двух пустых строк подряд до двух — обычная гигиена после
  // удалений. Одну пустую между секциями и подряд идущими пунктами сохраняем.
  const compact = out.join('\n').replace(/\n{3,}/g, '\n\n');
  return { text: compact, removed };
}

export function computeVictims(entries, policy = DEFAULT_TTL_DAYS, nowMs = Date.now()) {
  const victims = [];
  for (const e of entries) {
    const age = ageDays(e.frontmatter, e.mtimeMs, nowMs);
    if (
      shouldArchive(
        { type: e.frontmatter?.type, ageDays: age },
        policy,
      )
    ) {
      victims.push({ ...e, ageDays: age });
    }
  }
  return victims;
}

export { DEFAULT_TTL_DAYS };
