# CLAUDE.md — Athlete Pro

> Основной активный проект. Мультиагентная разработка: Claude Code + Gemini Pro + Antigravity.

## Multi-Agent Protocol

- **База — только `origin/main`.** `git fetch origin && git checkout -b <ветка> origin/main`; долгоживущего trunk нет (O-3).
- **Хендофф** — `NEXT_SESSION.md`, читать первым. Незакоммиченные диффы — возможно живой WIP другого агента, сверяться, не откатывать вслепую.
- **Декомиссия инфры = чеклист 4 мест:** правила/доки · ветки/worktree · remote · GitHub · Vercel. Закрыть 3 из 4 = мина. Дефолт-ветку сторожит `preflight`.
- **Дрейф базы** — `scripts/check-branch-drift.mjs` (pre-push + job `drift` в CI), блокирует пересечение по файлам, не отставание. Обход: `DRIFT_OK=1 git push`.
- **«Линию не вливать» = строка в `REJECTED_LINES`** (`scripts/rejected-lines.mjs`) тем же PR, якорь SHA, не имя ветки. Гоняется в preflight/pre-push/CI. Обход: `DONOR_OK=1 git push`.
- **Правила в чекауте дрейфуют вместе с ним** — недрейфующий слой только CI и настройки GitHub, дубль гарда в CI обязателен. Странное поведение → `git log origin/main -- CLAUDE.md`, сверить базу.
- **Зелёный гейт отвечает только на свой вопрос** (SCA/SAST/тесты — каждый про своё). Число в гейте сверять с базой репо.
- **Кода нет на месте → `git log origin/main -- <файл>`**, не гипотеза: почти всегда «влито в main, у тебя старая база».
- **Аномалия в фоновом шуме — проговорить вслух, не игнорить.**
- Разборы инцидентов — `docs/_archive/INCIDENTS.md`; здесь только правила.
- Antigravity: `~/.gemini/antigravity/brain/<uuid>/`. GIO-стандарты: `~/.gemini/GEMINI.md` + корневой `GEMINI.md`. Аудиты: `/audit_core` · `/audit_cyber` · `/audit_speed`.

## Где что лежит (закон структуры, H-3)

Проверяется тестом `test/repo-hygiene.test.js` — не декларация, а гейт.

- **Корень** — только entry-точки (`server.js`, `sw.js`, `index.html`), конфиги и 5 доков: `README` · `CLAUDE.md` · `GEMINI.md` · `NEXT_SESSION.md` · `CHANGELOG`.
- **`docs/`** — `RULES`, `CONTRIBUTING`, `DEPLOYMENT`, `THREAT_MODEL`, `ROADMAP_*`.
- **`docs/handoff/`** — активные `HANDOFF_*.md`. До LAUNCH-10 там один трек запуска; линии заморожены в архиве живыми, брать оттуда — решением Gio.
- **`docs/_archive/`** — закрытые хендоффы, замороженные линии, протухшие спеки.
- **`scripts/`** — инструментарий; одноразовые скрипты не коммитить.

`CLAUDE.md`/`GEMINI.md` в корне вынужденно — CLI обоих агентов читает их только оттуда. Хендофф живёт, пока есть невзятая карточка — все взяты и влиты → переезд в `docs/_archive/` тем же PR. Новый док в корне = красный `npm test`.

**Бюджет горячего пути:** `CLAUDE.md` ≤3000 ток, `NEXT_SESSION.md` ≤2000, сумма ≤5000. Сторожит `test/docs-budget.test.js` (`npm run docs:budget`). Не влезло → резать, не поднимать потолок: детали в `.claude/rules/*.md` или `docs/RULES.md`.

## Session Protocol (ассистент)

> Гайд для человека — `docs/RULES.md`. Здесь — что ассистент ОБЯЗАН делать каждую сессию.

- **Старт:** `npm run preflight` (ненулевой exit — чинить до работы). Спросить «одна цель на сессию?»; расплывчато → переспросить.
- **В процессе:** напоминать «Коммит?» / «Чекпоинт?» после куска; длинно → чекпоинт + новая сессия до compact.
- **Финиш:** короткий хендофф (узкий, не god-object) + обновить память.
- **Закрытая карточка сжимается, не дописывается** — 3-5 строк, детали в CHANGELOG и память.
- **Verify-over-trust:** «готово» (вкл. Gemini) — гипотеза, пока gate-команда не даёт 0; показывать фактический вывод.
- **Причина, потом ошибка:** сперва root cause, потом фикс.
- **Изоляция:** агенты пишут только в свой worktree; вливает LEAD после гейта.
- **Влитие только через PR:** свежий `origin/main` → гейт → `gh pr create --base main` → зелёные чеки → `gh pr merge --rebase --delete-branch`. Отстала — `git rebase origin/main`, перегнать гейт, снова PR.
- **«Влито» = ancestry:** `git merge-base --is-ancestor <sha> origin/main` = 0, не «PR создан». Ревизия веток — `npm run inventory`.
- **Влитая ветка умирает с мёржем** вместе со своим worktree — не информация. Тегом держим только отвергнутые линии.
- **Рекомендация, не меню:** советовать лучший вариант + 1 строка «почему»; решает человек.
- Один разговор = одна цель; ресёрч — субагентом, в main только итог.
- **Бриф агенту или новой сессии** — скилл `agent-brief` (ЦЕЛЬ / ГДЕ СТОП / НЕ ТРОГАТЬ + ритуал + коммит/дрейф): копировать целиком, не пересказывать.

## Architecture · Design

Оба спека — в `.claude/rules/`, грузятся по путям (Cursor — указателем `.cursor/rules/*.mdc`):

- **`architecture.md`** — Store/View, бэкенд-цепочка, навигация, ключевые файлы, конвенции кода.
- **`design.md`** — палитра BRAND/SEMANTIC, PPL-закон, шкала `--fs-*`/`--fw-*`, glass-hairlines. Железное: цвета и типографика только через токены `css/base.css :root`, сырые hex/px/веса запрещены.

## Rules

> Конвенции правки кода (Vanilla JS · `esc()` · закон четырёх вкладок · Haptic Gate · `build:sw` · алиасы миграции планов) — `.claude/rules/architecture.md`, грузится по путям.

- **Версия:** при стабильном мёрже бампить `VERSION`/`js/version.js` + `package.json`+`package-lock.json` (`npm install`). Сторожит `test/version-sync.test.js`.
- **Анти-хрупкость:** риск — за флагом `js/flags.js` (Strangler-Fig); ветки <24ч от свежего main; застрял → `git checkout .` и дроби. Дефолты OFF, легаси не сносим — новый код рядом за флагом. Перед крупным — тег `checkpoint-<date>`.
- **Миграции — отдельным PR.**
- **Никогда не пушить в `main` напрямую** — только PR.

## Tests

```bash
npm test                # node --test (unit + integration)
npx playwright test     # e2e (отдельно)
npm run smoke:prod      # доехал ли релиз до прода; --wait 180 = поллить
```

**Счёт тестов не хардкодить** — добывать командой:

```bash
git fetch origin -q
git diff --diff-filter=A --name-only HEAD origin/main -- test/   # пусто = сюита полная
```

Непусто → ветка не содержит части сюиты, зелёный прогон ничего не доказывает: `git rebase origin/main`, перегнать гейт.

## Status

Очередь — `NEXT_SESSION.md`; роадмап — `docs/ROADMAP_elite_athlete-pro.md`; выкаченное — `CHANGELOG.md`. Третья копия статуса протухает первой.
