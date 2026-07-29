# CLAUDE.md — Athlete Pro

> Основной активный проект. Разработка ведётся мультиагентно: Claude Code + Gemini Pro + Antigravity.
> Дочерний проект: FIT ELITE (`C:\projects\fit-elite`).

## Multi-Agent Protocol

- **База — только `origin/main`.** Долгоживущий trunk упразднён (O-3, 2026-07-25): он был второй точкой интеграции и стоил потери влитого PR#9. Перед стартом: `git fetch origin && git checkout -b <ветка> origin/main`.
- **Handoff между сессиями/агентами:** `NEXT_SESSION.md` в корне (правило GIO Context Integrity) — читать первым.
- Незакоммиченные диффы могут быть живым WIP другого агента — сверяйся с NEXT_SESSION.md, не откатывай вслепую.
- **Вывод инфраструктуры из эксплуатации = чеклист всех мест прошивки** (урок csp-soft-delete, 2026-07-26): правила/доки · локальные ветки и worktree · remote-ветка · настройки GitHub (default branch, protection) · Vercel. Закрыть три из четырёх = мина. Дефолт-ветку сторожит `npm run preflight`.
- **Дрейф базы сторожит `scripts/check-branch-drift.mjs` в pre-push** (кейс PP-6, 2026-07-29). Блокирует push, если файлы, которые ты правил, с момента твоей базы переписали в main. Отставание само по себе не блокирует — блокирует пересечение. Обход осознанный: `DRIFT_OK=1 git push`.
- **Зелёный гейт отвечает только на свой вопрос.** SCA отвечает «нет уязвимостей», SAST — «стиль цел», тесты — «эта сюита прошла». Ни один из них не отвечает «код написан по сегодняшнему main» — все три спокойно зеленеют на коде трёхнедельной давности. В PP-6 «pre-push SAST/SCA прошёл» прозвучало как «всё хорошо» при отставании в 233 коммита.
- **Число в гейте сверять с базой main, а не радоваться зелёному.** «211/211 зелёные» в PP-6 было сигналом тревоги: в main 385 тестов, то есть ветка не содержала половины сюиты. Зелёный на неполной сюите — не зелёный. Прогнал тесты — сравни счёт с `git show origin/main:package.json` / прогоном на main.
- **Ожидаемого кода нет на месте → сверься с `origin/main`, не строй теорию.** В PP-6 агент заметил отсутствие заплатки PP-5 и объяснил это «она на параллельной ветке» — а она была влита в main и просто отсутствовала в старой базе. Верная реакция на «странно, тут этого нет»: `git log origin/main -- <файл>`, а не гипотеза.
- **Аномалия в фоновом шуме — проговорить вслух, не игнорить:** строка вроде «Main branch: claude/csp-soft-delete» в статусе git неделю была видна всем агентам, и никто не спросил «почему». Увидел странное в статусе/выводе — один раз спроси или заведи карточку.
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

## Ритуал агента (копировать в бриф, не пересказывать)

> Агент не помнит правил между сессиями — значит ритуал живёт в брифе, а не в надежде на память. Шаблон ниже вставляется в задачу целиком.

```text
ЦЕЛЬ: <одна фраза, что должно работать после>
ГДЕ СТОП: <файлы/каталоги>
НЕ ТРОГАТЬ: <что рядом и соблазнительно, но вне карточки>

СТАРТ (первым делом, до чтения кода):
git fetch origin && git checkout -b claude/<карточка>-<2-3-слова> origin/main && npm run preflight

Перед первой правкой сверь, что ожидаемый код на месте (grep ключевых символов).
Нет его — git log origin/main -- <файл>. НЕ строй теорию, почему его нет.

ФИНИШ: npm test — сверь счёт с main (см. § Tests). Меньше = база устарела.
Затем git push -u origin HEAD. Гард дрейфа в pre-push решит, годится ли база.
```

- **Коммит по ходу:** `git add -A && git commit -m "<тип>(<область>): <что сделано>"`. Чекпоинт перед рискованным куском — тот же коммит с `checkpoint: <состояние> — до <что ломаю>`; откатываться потом дешевле.
- **База уехала — не спорить и не угадывать, спросить гард:** `node scripts/check-branch-drift.mjs`. Зелено («твои файлы в main не менялись») = отставание неважно, пушь. Блок = он перечислит файлы и коммиты, которые их переписали.
- **При блоке решает объём, а не принцип.** Конфликт мельче правки → `git rebase origin/main` и **перегнать гейт заново** (в main могли приехать новые тесты, старый зелёный не считается). Конфликт больше самой правки (кейс PP-6: 90 из 126 строк) → ветка от свежего `main` и переложить подход на актуальный файл. Идея переиспользуется, выбрасывается только приземление.

## Stack

- Frontend: Vanilla JS (ES Modules), no frameworks
- Backend: Express/Node.js (**ESM**, `"type": "module"`)
- DB: IndexedDB (offline-first) + optional Supabase
- AI: `lib/aiOrchestrator.js` — Anthropic + Gemini, BYOK, SSE via `POST /api/coach`
- PWA: Service Worker + manifest

## Run

```bash
npm install
cp .env.example .env   # заполни ANTHROPIC_API_KEY
npm run dev             # http://localhost:3000

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
| `server.js` | Express entry (ESM), helmet/CSP, static + API |
| `js/app.js` | Frontend entry, lazy loading, Integrity.check |
| `js/db.js` | IndexedDB layer (7 stores) |
| `js/shared/utils.js` | `esc()` — XSS escape, Haptic Gate |
| `js/shared/spring.js` | Spring Physics для анимаций |
| `js/shared/integrity.js` | Contract-First Integrity guard |
| `js/privacy.store.js` | Режимы cloud / anon / airgap (default: airgap) |
| `js/sync.js` | LWW Sync Engine V2.1 |
| `lib/aiOrchestrator.js` | Мульти-движок AI (anthropic/gemini, BYOK) |
| `exercises-library.json` | 170 exercises (85KB) |
| `NEXT_SESSION.md` | Кросс-агентный handoff |

## Design

- Палитра — двухуровневая (решение 1-2, 2026-06-14). Цвета только через токены `css/base.css :root`.
  - **BRAND (единственные декоративные акценты):** primary `--c-accent` (#00e676 green), secondary `--c-secondary` (#8b5cf6 violet, цвет лого). CTA/active/focus/бренд — только эти два.
  - **SEMANTIC (только по смыслу, не для декора):** PPL — `--c-push`(green)/`--c-pull`(cyan)/`--c-legs`(purple); статус — `--c-amber`(warning/PR)/`--c-red`(#ff4d88 error/danger/HR); achievement — `--c-gold` (PR/streak).
  - PPL-закон: Push=green · Pull=cyan · Legs=purple. В коде типа тренировки — `--c-push/--c-pull/--c-legs`, не сырые hue.
- Типографика — шкала `--fs-*` / `--fw-*` в `css/base.css :root` (решение TYPE-1, 2026-07-28). Сырые px в `font-size` и цифры в `font-weight` запрещены.
  - **Размер (6 ступеней, шаг ≈1.25):** `--fs-1` 10px микро-капс (подписи, единицы, пилюли) · `--fs-2` 13px вторичный текст · `--fs-3` 16px база (тело, заголовки строк, поля) · `--fs-4` 20px заголовок секции/значение · `--fs-5` 26px дисплей (имя в hero) · `--fs-6` 34px hero-число.
  - **Насыщенность (3 варианта):** `--fw-md` 600 тело · `--fw-bold` 700 акцент · `--fw-black` 800 капс/числа/hero. 500 и 600 глазом не различимы, 900 у Manrope клэмпится к 800 — оба упразднены.
  - Промежуточных ступеней не заводить: соседние разведены на ≥25%, иначе иерархия снова становится шумом. Нужен другой вес в макете — меняй ступень или цвет, не размер на 1px.
  - Анкер шкалы утверждён Gio 2026-07-28 (вариант A против более мелкого 9/12/15/19/24/32) — переизобретать не нужно. Переведён пилот (`css/profile.css` + `js/profile.view/*`); остальные экраны — по очереди программы, см. `docs/handoff/HANDOFF_design_system.md`.
- Glassmorphism: backdrop-filter, глубина через тени
- Borders: glass-hairlines узаконены (решение 2026-06-12) — только полупрозрачные через токены `var(--c-border)` (6%) / `var(--c-border-h)` (12%); НЕ хардкодить rgba, непрозрачные сплошные рамки запрещены. Акцентные подсветки (цветные rgba ≤20%) допустимы точечно
- Mobile-first, 600px breakpoint

## Rules

- Vanilla JS only — no React/Vue/jQuery
- API keys через backend proxy, никогда на фронте
- `esc()` из `js/shared/utils.js` для ВСЕХ innerHTML с данными
- Эмодзи в UI/коде запрещены — только SVG (правило DESIGN_DNA)
- Вибрация — только через Haptic Gate (`js/shared/utils.js`), не напрямую
- Canvas: multiply by `devicePixelRatio`
- Animations: GPU-only (`transform`/`opacity`), Spring Physics из `shared/spring.js`
- Route files: suffix only (`/coach` not `/api/coach`)
- `sw.js`: ASSETS генерить через `npm run build:sw` (НЕ руками), затем бамп `CACHE_NAME`
- **Версия:** при каждом стабильном мёрже в main бампить `VERSION` в `js/version.js` (показывается в профайл-меню) + синхронно `version` в `package.json`
- `server.js` никогда не заменять отладочными стабами — для телеметрии есть `scripts/telemetry-server.mjs`
- **Миграция планов:** при смене сид/дефолт-плана новые имена упражнений ОБЯЗАНЫ нести `alias: [старые имена]` — префилл истории ищет по имени, без алиасов веса пользователя отвязываются (кейс 0кг 2026-07-08)
- **Анти-хрупкость:** рискованный код — за флагом `js/flags.js` (Strangler-Fig); ветки < 24ч, от свежего `origin/main`; застрял → `git checkout .` и дроби. Детали — `NEXT_SESSION.md` § Анти-хрупкий workflow

## Tests

```bash
npm test                # node --test (unit + integration)
npx playwright test     # e2e (отдельно, не через node --test)

# После мёржа в main — подтвердить, что релиз ДОЕХАЛ до прода (DoD ступень 4):
npm run smoke:prod              # VERSION + CACHE_NAME + кеш-заголовки; exit != 0 = не доехал
npm run smoke:prod -- --wait 180  # поллить, пока Vercel докатывает
```

- **Счёт тестов на 1.25.33 — 385.** Прогнал и получил заметно меньше — это не «зелёный», это сигнал, что ветка не содержит половины сюиты (кейс PP-6: 211/211 на базе от 28 июня). Сверяться: `git show origin/main:package.json` + прогон на свежем `main`.

## Status

- Milestone 1.0 — COMPLETE (March 2026): архитектура, Lighthouse 97, WCAG AA, AI Autopilot
- v1.18.x — Bento Grid UI, Dynamic Island в статус-баре, privacy tri-state, LWW sync
- Текущий вектор: ремонт тестовой базы → SSE hardening → CRDT foundation (UUID вместо autoIncrement)
- См. `docs/ROADMAP_elite_athlete-pro.md` и `NEXT_SESSION.md`
