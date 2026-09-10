/**
 * Гард ночного прогона (AGENT-9): хук `beforeShellExecution` Cursor.
 *
 * Зачем: в `.cursor/cli.json` `Shell(git)` разрешён целиком — иначе исполнитель не
 * сможет ни ветку завести, ни закоммитить. Вместе с этим разрешением приезжает
 * `git push`, а репозиторий публичный: ночь без человека не имеет права публиковать.
 * Права по имени бинаря такое не режут — режет разбор самой строки, то есть хук.
 *
 * Контракт Cursor: на stdin JSON с полем `command`, на stdout
 * `{"permission":"allow"|"deny"|"ask"}`. Ненулевой выход 2 равен `deny`.
 *
 * Fail-closed: строку не удалось разобрать — запрет. Ночь, вставшая на разборе,
 * чинится утром; ветка, уехавшая в публичный remote, — нет. Падение самого хука
 * закрывает `failClosed` в `.cursor/hooks.json`: по умолчанию Cursor пропускает.
 *
 * Граница: хук видит только внешнюю строку. `Shell(node)`/`Shell(npm)` разрешены, значит
 * интерпретатор дотянется до git в обход разбора — это защита от случайной публикации,
 * не песочница. Инлайн `node -e` закрыт, чужой `npm run <script>` — нет.
 */

/**
 * Текст в кавычках — данные, а не команда. В этом репозитории `push` — тип тренировки,
 * поэтому `git commit -m "feat(push): …"` обязан проходить, а `git push` — нет.
 */
function stripQuoted(command) {
  return command.replace(/'[^']*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""');
}

/** Каждая команда судится отдельно: `git stash push && git push` — две разные строки. */
function segments(command) {
  return stripQuoted(command).split(/&&|\|\||[;|\n]/);
}

/** Опции git, которые несут значение отдельным токеном: в `git -C dir push` подкоманда третья. */
const GIT_OPTS_WITH_VALUE = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--exec-path',
  '--namespace',
]);

/** Токены команды: подстановки и группировка шелла — пробелы, иначе `$(git push)` не виден. */
function tokens(segment) {
  return segment
    .replace(/[$()`{}]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Подкоманда git, а не слово в строке. Разница видна только на токенах: `git stash push` —
 * не публикация, а `git -c x.y=stash push` — публикация. Два круга ревью ушли на попытки
 * выразить это регэкспом с исключением: каждое исключение оказывалось дыркой.
 */
function gitSubcommands(segment) {
  const list = tokens(segment);
  const found = [];
  for (let i = 0; i < list.length; i += 1) {
    if (!/(?:^|[/\\])git(?:\.exe)?$/.test(list[i])) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      if (GIT_OPTS_WITH_VALUE.has(list[j])) {
        j += 1;
        continue;
      }
      if (list[j].startsWith('-')) continue;
      found.push(list[j]);
      break;
    }
  }
  return found;
}

const PUBLISHES = new Set(['push', 'send-pack']);

/** Формы, которые ночь не выполняет. Проверяются по каждой команде строки. */
const FORBIDDEN = [
  {
    // Имя бинаря в кавычках срезается вместе с кавычками, git не опознаётся — тогда
    // судим по голому токену: fail-closed важнее, чем `push` в чужом аргументе.
    hit: (segment) => {
      const subcommands = gitSubcommands(segment);
      if (subcommands.length > 0) return subcommands.some((name) => PUBLISHES.has(name));
      return tokens(segment).some((token) => PUBLISHES.has(token));
    },
    why: 'пуш делает LEAD утром, после приёмки',
  },
  { re: /\bgh\b\s+pr\b/, why: 'PR заводит человек, не ночной прогон' },
  { re: /--no-verify\b/, why: 'обход хуков прячет красный гейт' },
  {
    re: /\bgit\b[^\n]*\bcommit\b[^\n]*(?:^|\s)-[a-z]*n/,
    why: 'короткий -n это тот же обход хуков',
  },
  {
    // Любой короткий кластер, где есть `e` или `p`: `-e`, `-pe`, `-ep`, `-epi`. Длинные
    // опции (`--test`, `--wait`) не задевает — у них второй дефис.
    re: /\bnode\b[^\n]*(?:^|\s)-(?:[a-z]*[ep][a-z]*|-eval|-print)\b/,
    why: 'инлайн-скрипт минует разбор строки',
  },
  { re: /\bgit\b[^\n]*\breset\b[^\n]*--hard\b/, why: 'снос незакоммиченной работы' },
  { re: /\bgit\b[^\n]*\bclean\b[^\n]*-[a-z]*f/, why: 'снос неотслеживаемых файлов' },
  { re: /\bgit\b[^\n]*\bworktree\b[^\n]*\bremove\b/, why: 'рабочие копии трогает только человек' },
  { re: /\bgit\b[^\n]*\bbranch\b[^\n]*\s-D\b/, why: 'удаление ветки необратимо без рефлога' },
  {
    re: /\bgit\b[^\n]*\b(checkout|switch)\b\s+(main|origin\/main)\b/,
    why: 'корень остаётся на своей ветке',
  },
];

function decide(command) {
  if (typeof command !== 'string' || command.length === 0) {
    return {
      permission: 'deny',
      userMessage: 'ночной гард: команда не прочитана, отказ по умолчанию',
    };
  }
  for (const segment of segments(command)) {
    const hit = FORBIDDEN.find((rule) => (rule.re ? rule.re.test(segment) : rule.hit(segment)));
    if (hit) {
      return { permission: 'deny', userMessage: `ночной гард: ${hit.why}` };
    }
  }
  return { permission: 'allow' };
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let verdict;
  try {
    verdict = decide(JSON.parse(raw).command);
  } catch {
    verdict = {
      permission: 'deny',
      userMessage: 'ночной гард: вход не разобран, отказ по умолчанию',
    };
  }
  process.stdout.write(JSON.stringify(verdict));
});
