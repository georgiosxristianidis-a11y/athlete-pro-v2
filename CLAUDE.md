# CLAUDE.md — Athlete Pro

> Основной активный проект. Разработка ведётся мультиагентно: Claude Code + Gemini Pro + Antigravity.
> Дочерний проект: FIT ELITE (`C:\projects\fit-elite`).

## Multi-Agent Protocol

- **База — только `origin/main`.** Долгоживущий trunk упразднён (O-3, 2026-07-25): он был второй точкой интеграции и стоил потери влитого PR#9. Перед стартом: `git fetch origin && git checkout -b <ветка> origin/main`.
- **Handoff между сессиями/агентами:** `NEXT_SESSION.md` в корне (правило GIO Context Integrity) — читать первым.
- Незакоммиченные диффы могут быть живым WIP другого агента — сверяйся с NEXT_SESSION.md, не откатывай вслепую.
- **Вывод инфраструктуры из эксплуатации = чеклист всех мест прошивки:** правила/доки · локальные ветки и worktree · remote-ветка · настройки GitHub (default branch, protection) · Vercel. Закрыть три из четырёх = мина. Дефолт-ветку сторожит `npm run preflight`.
- **Дрейф базы сторожит `scripts/check-branch-drift.mjs`** — в pre-push и job `drift` в CI. Блокирует пересечение (файлы, которые ты правил, переписаны в main), а не отставание само по себе. Обход осознанный: `DRIFT_OK=1 git push`.
- **Правила и гарды, живущие в чекауте, дрейфуют вместе с чекаутом.** `core.hooksPath` абсолютный и смотрит в КОРНЕВОЙ чекаут: протух корень — хуки мертвы у всех worktree, молча. Протухший `CLAUDE.md` = протухшие правила. Единственный недрейфующий слой — CI и настройки GitHub, поэтому дубль гарда в CI обязателен. Агент ведёт себя странно → сперва `git log origin/main -- CLAUDE.md` и сверка его базы.
- **Зелёный гейт отвечает только на свой вопрос.** SCA — «нет уязвимостей», SAST — «стиль цел», тесты — «эта сюита прошла». Ни один не отвечает «код написан по сегодняшнему main». **Число в гейте сверять с базой:** зелёный на неполной сюите — не зелёный.
- **Ожидаемого кода нет на месте → `git log origin/main -- <файл>`, а не гипотеза.** «Странно, тут этого нет» почти всегда значит «влито в main, а у тебя старая база».
- **Аномалия в фоновом шуме — проговорить вслух, не игнорить.** Увидел странное в статусе или выводе — один раз спроси или заведи карточку.
- Разборы инцидентов, купивших эти правила (PP-6, csp-soft-delete, оркестрация, гигиена H-1) — `docs/_archive/INCIDENTS.md`. Здесь только правила: `CLAUDE.md` — поведенческий контракт, не журнал.
- Antigravity-артефакты (task/plan/walkthrough): `~/.gemini/antigravity/brain/<uuid>/`.
- Стандарты GIO: `~/.gemini/GEMINI.md` (глобальный) + `GEMINI.md` в корне (Karpathy guidelines). Аудиты — слэш-команды `/audit_core` / `/audit_cyber` / `/audit_speed`.

## Где что лежит (закон структуры, H-3)

Проверяется тестом `test/repo-hygiene.test.js` — не декларация, а гейт.

| Место | Что |
|-------|-----|
| Корень | только entry-точки (`server.js`, `sw.js`, `index.html`), конфиги и 5 доков: `README` · `CLAUDE.md` · `GEMINI.md` · `NEXT_SESSION.md` · `CHANGELOG` |
| `docs/` | `RULES`, `CONTRIBUTING`, `DEPLOYMENT`, `THREAT_MODEL`, `ROADMAP_*` |
| `docs/handoff/` | активные `HANDOFF_*.md` |
| `docs/_archive/` | закрытые хендоффы и протухшие спеки |
| `scripts/` | инструментарий; одноразовые скрипты не коммитить вообще |

- `CLAUDE.md` и `GEMINI.md` остаются в корне вынужденно: CLI обоих агентов читает их только оттуда.
- **Жизненный цикл хендоффа:** живёт, пока в нём есть невзятая карточка. Все взяты и влиты → переезд в `docs/_archive/` тем же PR, что и последняя карточка.
- Новый док в корне = красный `npm test`. Это осознанно: 15 доков в корне выросли именно из «положу пока сюда».

## Session Protocol (ассистент)

> Полный гайд для человека — `docs/RULES.md`. Здесь — что ассистент ОБЯЗАН делать каждую сессию.

- **Старт:** прогнать `npm run preflight` (git-email, node_modules, свежесть базы, свои невлитые ветки; ненулевой exit = чинить до работы). Затем спросить «одна цель на сессию?»; расплывчато («по уму») → переспросить, не угадывать. Принять формат: ЦЕЛЬ / ГДЕ СТОП / НЕ ТРОГАТЬ.
- **В процессе:** самому напоминать «Коммит?» / «Чекпоинт?» после каждого готового куска; длинно → предложить чекпоинт + новую сессию ДО compact.
- **Финиш:** самому собрать короткий хендофф (узкий файл под фазу, не god-object) + обновить память.
- **Verify-over-trust:** любое «готово» (вкл. Gemini) — гипотеза, пока gate-команда != 0.
- **Изоляция:** агенты пишут только в свой worktree; вливает только LEAD после гейта.
- **Влитие только через PR в `main`:** ветка от свежего `origin/main` → гейт → `gh pr create --base main` → зелёные чеки → `gh pr merge --rebase`. Отставание от main = не ошибка, а сигнал: `git rebase origin/main` → перегнать гейт (в main могли приехать новые тесты) → снова PR. Вливать сразу после зелёного гейта, не копить.
- **«Влито» = ancestry, не слова:** `git merge-base --is-ancestor <sha> origin/main` вернул 0. Не «PR создан», не «ветка запушена». Для ревизии веток целиком — `npm run inventory` (сравнивает патчи: rebase-merge переписывает SHA, и ancestry врёт про давно выкаченное).
- **Рекомендация, не меню:** при выборе советовать лучший для проекта вариант + 1 строка «почему»; решает человек.
- Один разговор = одна цель; длинные ресёрчи — субагентом, в main только итог.

## Ритуал агента

Шаблон брифа (ЦЕЛЬ / ГДЕ СТОП / НЕ ТРОГАТЬ + старт-финиш ритуал + правила коммита и дрейфа) — скилл `agent-brief` (`.claude/skills/agent-brief/SKILL.md`). Вызывать при постановке задачи субагенту или новой сессии; копировать в бриф целиком, не пересказывать.

## Run

```bash
# Полевое тестирование на телефоне (НЕ заменяй server.js!):
node scripts/telemetry-server.mjs --lan
```

## Architecture

**Store/View pattern** — каждый модуль разделён:
- `*.store.js` — state, data, business logic (ноль обращений к DOM)
- `*.view.js` — DOM, events, UI

**Backend**: `server.js` (helmet+CSP, compression, rate-limit, zod) → `routes/coach.js` + `routes/integrations.js` → `lib/aiOrchestrator.js`

**Navigation**: `shell.js` → `Nav.go('s-home')` переключает экраны

## Key Files

| File | What |
|------|------|
| `js/app.js` | Frontend entry, lazy loading, Integrity.check |
| `js/shared/utils.js` | `esc()` — XSS escape, Haptic Gate |
| `js/shared/integrity.js` | Contract-First Integrity guard |
| `js/privacy.store.js` | Режимы cloud / anon / airgap (default: airgap) |
| `lib/aiOrchestrator.js` | Мульти-движок AI (anthropic/gemini, BYOK) |
| `NEXT_SESSION.md` | Кросс-агентный handoff |

## Design

Полный спек (палитра BRAND/SEMANTIC, PPL-закон, шкала `--fs-*`/`--fw-*`, glass-hairlines, breakpoint) — `.claude/rules/design.md`, грузится автоматически при работе с `css/**`, `*.view.js`, `index.html`. Железное: цвета и типографика только через токены `css/base.css :root`, сырые hex/px/веса запрещены.

## Rules

- Vanilla JS only — no React/Vue/jQuery
- **Нижняя навигация — ровно четыре вкладки** (Home · Train · Stats · Profile). Закон, не вкусовщина: `.nav-btn` — `flex:1`, пятая кнопка ничего не ломает визуально и проходит незамеченной (так и вышло в первом заходе LOG-1). Новый экран получает вход из того контента, который расширяет — паттерн «section-header + `.btn-text`» (Журнал открывается кнопкой «All» в заголовке Recent). Экран вне таб-бара ОБЯЗАН нести `data-action="nav:back"`, иначе тупик: живой пример — `s-body`, зарегистрирован в `Nav.on` и недостижим ниоткуда. Сторожит `test/nav-law.test.js`
- API keys через backend proxy, никогда на фронте
- `esc()` из `js/shared/utils.js` для ВСЕХ innerHTML с данными
- Эмодзи в UI/коде запрещены — только SVG (правило DESIGN_DNA)
- Вибрация — только через Haptic Gate (`js/shared/utils.js`), не напрямую
- Canvas: multiply by `devicePixelRatio`
- Animations: GPU-only (`transform`/`opacity`), Spring Physics из `shared/spring.js`
- Route files: suffix only (`/coach` not `/api/coach`)
- `sw.js`: ASSETS генерить через `npm run build:sw` (НЕ руками), затем бамп `CACHE_NAME`
- **Версия:** при каждом стабильном мёрже в main бампить `VERSION` в `js/version.js` (показывается в профайл-меню) + синхронно `version` в `package.json` + `package-lock.json` (проще всего `npm install` — он перепишет оба поля lock сам). Отстал lock = каждый `npm install` в чистом чекауте плодит незакоммиченный diff у всех агентов. Сторожит `test/version-sync.test.js`
- `server.js` никогда не заменять отладочными стабами — для телеметрии есть `scripts/telemetry-server.mjs`
- **Миграция планов:** при смене сид/дефолт-плана новые имена упражнений ОБЯЗАНЫ нести `alias: [старые имена]` — префилл истории ищет по имени, без алиасов веса пользователя отвязываются (кейс 0кг 2026-07-08)
- **Анти-хрупкость:** рискованный код — за флагом `js/flags.js` (Strangler-Fig); ветки < 24ч, от свежего `origin/main`; застрял → `git checkout .` и дроби. Дефолты флагов OFF; легаси не сносим — новый код рядом за флагом, переключаем по микро-элементу, коммитим зелёным. Перед крупным — тег `checkpoint-<date>`

## Tests

```bash
npm test                # node --test (unit + integration)
npx playwright test     # e2e (отдельно, не через node --test)

# После мёржа в main — подтвердить, что релиз ДОЕХАЛ до прода (DoD ступень 4):
npm run smoke:prod              # VERSION + CACHE_NAME + кеш-заголовки; exit != 0 = не доехал
npm run smoke:prod -- --wait 180  # поллить, пока Vercel докатывает
```

- **Счёт тестов не хардкодить — добывать командой.** Любое число в доке протухает от следующего теста и начинает врать про «устаревшую базу»:

```bash
git fetch origin -q
# тесты, которые есть в main, а у тебя их нет (пусто = сюита полная):
git diff --diff-filter=A --name-only HEAD origin/main -- test/
```

  Непусто = ветка не содержит части сюиты, и зелёный прогон ничего не доказывает. Лечение — `git rebase origin/main` и перегнать гейт заново.

## Status

Текущее состояние и очередь — `NEXT_SESSION.md`; роадмап — `docs/ROADMAP_elite_athlete-pro.md`; выкаченное — `CHANGELOG.md`. Здесь не дублируется намеренно: третья копия статуса протухает первой.
