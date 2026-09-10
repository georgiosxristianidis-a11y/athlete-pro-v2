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

/** Каждая команда судится отдельно: `git stash push && git push` — две разные строки. */
function segments(command) {
  return command.split(/&&|\|\||[;\n]/);
}

/**
 * Разбор на токены с памятью о кавычках. Ровно эта память и решает спор, на котором сломались
 * пять кругов ревью: `git commit -m "git push"` — данные (проход), `git "push"` — команда
 * (отказ), `git -c "x=y stash" push` — пуш, а не stash. Строковыми заменами это неразрешимо:
 * снимаешь кавычки — ломаешь сообщения коммитов, оставляешь — пропускаешь пуш в кавычках.
 *
 * Скобки и труба — разделители токенов: код в `$(git push)` виден, а не спрятан внутри
 * аргумента. `$`, backtick и `{}` в тексте токена ОСТАЮТСЯ: подстановку хук вычислить не может,
 * значит должен её увидеть и отказать.
 */
function tokenize(segment) {
  const out = [];
  let text = '';
  let quoted = false;
  let started = false;
  let quote = null;
  const flush = () => {
    if (started) out.push({ text, quoted });
    text = '';
    quoted = false;
    started = false;
  };
  for (const ch of segment) {
    if (quote) {
      if (ch === quote) quote = null;
      else text += ch;
      started = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      quoted = true;
      started = true;
      continue;
    }
    if (/\s/.test(ch) || '()|'.includes(ch)) {
      flush();
      continue;
    }
    text += ch;
    started = true;
  }
  flush();
  return out;
}

/** Код команды без данных: то, что стоит в кавычках, правилам-регэкспам не показывается. */
function unquotedCode(list) {
  return list
    .filter((token) => !token.quoted)
    .map((token) => token.text)
    .join(' ');
}

/** Опции git со значением отдельным токеном: в `git -C dir push` подкоманда третья. */
const GIT_OPTS_WITH_VALUE = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--exec-path',
  '--namespace',
  '--config-env',
  '--super-prefix',
  '--attr-source',
]);

/**
 * Подкоманда git, а не слово в строке: `git stash push` — не публикация, `git -c x.y=stash push` —
 * публикация. Опция со значением съедает свой аргумент целиком, поэтому квотированное
 * `-c "x=y stash"` не выдаёт себя за подкоманду.
 */
function gitSubcommands(list) {
  const found = [];
  for (let i = 0; i < list.length; i += 1) {
    if (!/(?:^|[/\\])git(?:\.exe)?$/.test(list[i].text)) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      if (GIT_OPTS_WITH_VALUE.has(list[j].text)) {
        j += 1;
        continue;
      }
      if (list[j].text.startsWith('-')) continue;
      found.push(list[j].text);
      break;
    }
  }
  return found;
}

/** Публикуют не только `push`: `http-push` и `send-pack` — та же ветка в публичном remote. */
const PUBLISHES = /(?:^|-)push$|^send-pack$/;

/** `git -c alias.x=push x` — публикация под чужим именем: подкоманда невинна, значение нет. */
const ALIAS_TO_PUSH = /alias\.[^=\s]*=\S*(?:push|send-pack)/;

/**
 * Формы, значение которых хук вычислить не может, а git может: подстановка шелла и конфиг из
 * окружения (`FOO=push git --config-env=alias.x=FOO x`, `GIT_CONFIG_KEY_*`). Разбор строки тут
 * бессилен по устройству, поэтому такая строка — отказ, а не догадка.
 */
function unevaluable(list) {
  const bare = (token) => !token.quoted;
  const configFromEnv = (token) =>
    /^--config-env(?:=|$)/.test(token.text) || /^GIT_CONFIG/.test(token.text);
  if (list.filter(bare).some(configFromEnv)) return true;

  const gitAt = list.findIndex((token) => /(?:^|[/\\])git(?:\.exe)?$/.test(token.text));
  // Присваивание перед самим git: `FOO=push git --config-env=alias.x=FOO x`.
  if (gitAt > 0 && list.slice(0, gitAt).some((t) => bare(t) && /^[A-Za-z_]\w*=/.test(t.text))) {
    return true;
  }
  // Подстановка ровно там, где решается судьба команды: на месте подкоманды…
  if (gitSubcommands(list).some((name) => /[$`]/.test(name))) return true;
  // …или в значении конфиг-опции (`-c alias.x=$FOO`). Аргумент вроде
  // `npx prettier --write $(git diff --name-only)` при этом остаётся рабочим.
  return list.some(
    (token, i) =>
      i > 0 && GIT_OPTS_WITH_VALUE.has(list[i - 1].text) && bare(token) && /[$`]/.test(token.text)
  );
}

/** Формы, которые ночь не выполняет. Проверяются по каждой команде строки. */
const FORBIDDEN = [
  {
    /*
     * Три вопроса на одном разборе токенов.
     *
     * 1. Подкоманда публикует? Ловит `git push`, `git "push"`, `git "-C" . push`,
     *    `git -c "x=y stash" push`.
     * 2. Значение `-c` переименовывает пуш в алиас? Смотрится по значению опции, где бы оно
     *    ни стояло, — подкоманда при этом невинна.
     * 3. Если подкоманду опознать не удалось (незнакомая опция со значением, алиас бинаря) —
     *    fail-closed по голому слову среди НЕквотированных токенов. Исключение одно: все
     *    найденные подкоманды это `stash`, `git stash push -m wip` ночь делает штатно.
     *
     * Третий вопрос и снимает зависимость от полноты `GIT_OPTS_WITH_VALUE`: незнакомая опция
     * уводит в отказ, а не в пропуск.
     */
    hit: (list) => {
      const subcommands = gitSubcommands(list);
      if (subcommands.some((name) => PUBLISHES.test(name))) return true;
      const optionValues = list.filter(
        (token, i) => i > 0 && GIT_OPTS_WITH_VALUE.has(list[i - 1].text)
      );
      if (optionValues.some((token) => ALIAS_TO_PUSH.test(token.text))) return true;
      if (subcommands.length > 0 && subcommands.every((name) => name === 'stash')) return false;
      return list.some((token) => !token.quoted && PUBLISHES.test(token.text));
    },
    why: 'пуш делает LEAD утром, после приёмки',
  },
  { hit: unevaluable, why: 'подстановку и конфиг из окружения хук не вычисляет — отказ' },
  { re: /\bgh\b\s+pr\b/, why: 'PR заводит человек, не ночной прогон' },
  { re: /--no-verify\b/, why: 'обход хуков прячет красный гейт' },
  {
    re: /\bgit\b[^\n]*\bcommit\b[^\n]*(?:^|\s)-[a-z]*n/,
    why: 'короткий -n это тот же обход хуков',
  },
  {
    // По токенам, включая квотированные: `node "-e"` — тот же инлайн-скрипт. Сообщение
    // коммита при этом безопасно — из кавычек приходит один токен, а не `node` плюс `-e`.
    // Кластер с `e`/`p` (`-e`, `-pe`, `-epi`) ловится, длинные `--test`/`--wait` — нет.
    hit: (list) =>
      list.some((token) => /(?:^|[/\\])node(?:\.exe)?$/.test(token.text)) &&
      list.some((token) => /^-(?:[a-z]*[ep][a-z]*|-eval|-print)(?:=|$)/.test(token.text)),
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
    // Регэкспы судят код без содержимого кавычек (сообщение коммита — данные), правило пуша
    // работает по токенам: ему нужно знать, что пришло из кавычек, а что нет.
    const list = tokenize(segment);
    const code = unquotedCode(list);
    const hit = FORBIDDEN.find((rule) => (rule.re ? rule.re.test(code) : rule.hit(list)));
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
