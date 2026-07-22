# NEXT SESSION — Athlete Pro · Канонический хэндофф

> Обновлено: 2026-07-19 (Fable 5 — поезда v111+v112 ВЫКАЧЕНЫ).
> **Trunk: `claude/csp-soft-delete`. Релиз 1.25.1 = `ddeef96` НА ПРОДЕ** (origin main == trunk, Vercel Production success, прод curl-верифай: VERSION 1.25.1, SW v112). Состав v111+v112: **FAB-VIDEO** за флагом `fab-video` (дефолт **OFF**) — живая панда с озвучкой (звук в mp4-дорожке = синхрон) в Claude FAB + интро в маскоте пустого дашборда (`js/shared/panda-video.js`, `assets/panda-voice.mp4`); **тумблер «Живой маскот»** в Профиль→AI (полевой чек без консоли); **SW-UX** — версия-поллинг на старте/возврате из фона + action-тост Update (авто-релоад посреди тренировки запрещён); `assets/**` в vercel.json includeFiles.
> Гейт: unit **308/308** (41 сьют) · lint **0 err** (stylelint warnings ~36). Lighthouse из worktree: perf **95-96** / a11y 100 / bp 100. SW **`athlete-pro-v112`** (следующий свободный v113), VERSION `1.25.1`.
> ⚠️ lhci гонять ТОЛЬКО из worktree — корень репо на протухшем main, даёт фейковые цифры (кейс perf 61 2026-07-18).
> Активная программа: **GYM-GRADE** — `HANDOFF_gym_grade.md` (DoD из 5 пунктов, журнал полевых тренировок = 3/10). Стек карточек: `HANDOFF_next_cards.md`. Остров + Sonnet-задачи: `HANDOFF_isl_tail.md`. AIR-хвост: `HANDOFF_air_refactor.md` (§ AIR-4).
> Done-история — в `CHANGELOG.md`. Этот файл — только актуальное состояние и остаток.

---

## 🎯 АКТУАЛЬНАЯ ОЧЕРЕДЬ (2026-07-17, по критичности)

1. ~~BACKUP~~ — ✅ `22f7638`, выкачен в 1.24.3. Остаток DoD-5 — полевой DS1 + полевой чек экспорта/напоминалки за Gio (можно на проде).
2. ~~DRUM-PERF-2~~ — ✅ код НА ПРОДЕ (1.24.4), флаг `drum-window` **OFF**. Остаток — полевой чек за Gio на проде: включить флаг (`Flags.setFlag('drum-window', true)`), покрутить барабан, при ОК — дефолт ON.
2-bis. ~~FAB-VIDEO~~ — ✅ НА ПРОДЕ (1.25.1), флаг `fab-video` **OFF**. Остаток — полевой чек за Gio на проде: Профиль → AI → тумблер «Живой маскот» — звук/синхрон/уши/батарея/маскот-интро на телефоне, при ОК — дефолт ON. Гоча поля 2026-07-19: телефон Gio залип на 1.24.1 (старый cache-first SW v107) — лечение: Chrome → Данные сайтов → удалить `athlete-pro-v7.vercel.app` → зайти заново (данные в облаке); с v111+ network-first, повторов быть не должно. Отдельная карточка: island-сцена «осуждающий взгляд за 5с до конца отдыха» (блокер — нет кадра «взгляда»; механика: событие ap-rest-warning из dynamic-island.js:411 + seek панды по тайм-коду).
3. **P-1 ISL-REST-BTN** (gym_grade, полиш) — визуально легче rest-кнопки.
4. **AIR-4** (air_refactor) — sweep + тест-гард backdrop-filter + DESIGN.md sync; защищает DoD-2.
5. **AIR-2b** (next_cards) — body-stats таб-каскад, хвост DoD-2.
6. Островные хвосты — `HANDOFF_isl_tail.md` (ISL-REST-NEXT, ISL-SEG-FILL, 2 «проверить»).

---

## 📦 ОТКРЫТЫЙ БЭКЛОГ (вне очереди; перед взятием перепроверить grep'ом)

- **Phase D 🟩** spacing sweep: hardcoded `padding:`/`margin:` → `--sp-*` (расширить stylelint-конфиг или ручной свип).
- **Phase E** Cool Steel residuals: E-1 декор `--c-accent`→`--c-chrome` · E-3 `#000`→`--c-bg*` · E-4 rgba в `workout.css`/`athlete-room.css` (stylelint-warnings = карта) · E-5 🟦 ревью.
- **Sonnet residuals 🟦:** 2-7 тесты форматтера · 3-3 метафоры иконок · 4-2 Edit Plan→фабрики · 4-3 CORE-унификация.
- **SET-STALE 🟦** — карточка в next_cards (низкий: одна вкладка в поле).
- **S0 (опц.)** gitleaks detect read-only.
- **D3 (опц.)** гард на pending `startViewTransition` в `shell.js` (benign VT-abort глушится boundary; всё ещё виден в консоли превью 2026-07-17).
- UI-кнопка «назад» (Apple-паттерн, top-left шеврон на сабэкранах) — микро-карточка, обсудить дизайн с Gio.
- **Отложено осознанно (НЕ тащить):** zod на ответах AI · Signals/Proxy state (YAGNI) · выпил `unsafe-inline` целиком (XL-хвост Strangler после `` html`` ``-тега, D2) · ISL-CUSTOM (фаза 2, только при подтверждённой нужде) · роадмап Фаза 5 полиш.

После стека: роадмап CRDT foundation (UUID вместо autoIncrement) — `ROADMAP_elite_athlete-pro.md`.

### 🩸 DATA-SAFETY (срочное поле, за пользователем + LEAD)
- **DS1 🔴** поле-тест IDB v3→v4 миграции на живых данных (workouts/metrics/1RM целы). Пара к карточке BACKUP.
- **DS2 🔴** CRDT 2-девайс конвергенция в cloud ДО merge CRDT-ветки.

### 🧭 Решения пользователя (не код)
- **D1** Capacitor go/no-go (локскрин-таймер = боль №1?).
- **D2** Декаплинг инкрементально за флагами; 1-й strangler-таргет = safe-by-default рендер `` html`...` `` с авто-`esc()` в `js/shared/utils.js`.

---

## 🔴 ЗА ПОЛЬЗОВАТЕЛЕМ

- Полевые DS1 (миграция на живых данных) + DS2 (CRDT 2-девайс) — с телефонами.
- Журнал DoD-1: серия 3/10 — писать заметки-раздражения после каждой тренировки (POLISH-LOOP).
- Ревизия правил CLAUDE.md (вторая половина карточки W) — вместе с LEAD: какое правило ни разу не срабатывало → в заметку/удалить.
- Гигиена (актуально на 2026-07-18): `.gitignore` не-UTF8 (UTF-16 → git может молча игнорить правила); `gitleaks.exe` в корневом чекауте — добавить в `.gitignore`. (~~shell.js не-UTF8~~ — закрыто 1.24.3: это был NUL в dedup-ключе тоста.)

---

## 🛡️ АНТИ-ХРУПКИЙ WORKFLOW (обязателен для всех агентов)

1. **Feature Flags (рубильник).** Рискованный/недописанный путь — за флагом `js/flags.js`:
   `import { flag } from './flags.js'; if (flag('v2-x')) renderV2(); else renderLegacy();`
   Дефолты OFF. Сломалось на устройстве → `Flags.setFlag('v2-x', false)` в консоли, без отката Git.
2. **Strangler-Fig.** Легаси не сносим. Новый код рядом за флагом, переключаем по микро-элементу, коммитим зелёным.
3. **Trunk-based (ветки < 24ч).** Задача дня = микро. Застрял > 24ч → `git checkout .`, дроби на два.
4. **Safety net:** перед крупным — тег `checkpoint-<date>`; CI (`.github/workflows/ci.yml`) + pre-push hook — зелёный гейт обязателен. SW-манифест только `npm run build:sw` + бамп `CACHE_NAME`.
5. **FF-only в trunk.** Влитие = `git merge --ff-only <ветка>`. Отказ FF → `git rebase <trunk>` у себя → гейт → FF. Старт от свежего trunk, влитие сразу после гейта, push пакетом. История — одна прямая линия, ноль развилок.

---

## 🤝 МУЛЬТИ-АГЕНТНЫЙ ПРОТОКОЛ

Проект ведут параллельно: **Claude (LEAD)** · **Antigravity·Sonnet** · **Antigravity·Gemini**.

1. Перед задачей — проверь владельца: `🔒 LEAD` не брать (цена ошибки высока).
2. Взял — поставь маркер `🚧 <agent>@<branch>`; закончил — `✅ <hash>`.
3. Чужой незакоммиченный WIP не откатывать (GIO Context Integrity). Один агент = один worktree; в trunk мёржит LEAD после гейта.

| Метка | Кто | Брать | НЕ брать |
|:--:|---|---|---|
| 🔒 LEAD | Claude Opus/Fable | data correctness · schema · security · кросс-секущее · design-DNA | grep+replace, тесты по готовому спеку |
| 🟦 SONNET | Sonnet | scoped рефактор · тесты · компонент по спеку | новая архитектура |
| 🟩 GEMINI | Gemini | массовый CSS/SVG sweep · find/replace | логика с условиями · дизайн |

Sonnet сейчас: **S1 TEST-ISL-GUARD** в полёте (`HANDOFF_isl_tail.md`).

---

## 🌬 ФИЛОСОФИЯ «AIR» — инварианты (нарушение = регрессия)

1. Воздух вместо линий: никаких `<hr>`/нижних бордеров — только padding/margin и сдвиг поверхности.
2. Hairlines только через `var(--c-border)` (6%) / `var(--c-border-h)` (12%); rgba не хардкодить (stylelint ловит). Цветные подсветки rgba ≤20% — точечно.
3. Отступы карточек/модалок 24/32px (`--sp-3`/`--sp-4`).
4. Safe-area всегда (`--safe-top`/`--safe-bottom`).
5. Mobile-first, брейк 600px; десктоп-колонка 412px, никаких `position:fixed` к окну.
6. Без эмодзи в UI и коде — только SVG. Типографика `→ ✓ ·` — не эмодзи.
7. `island-set-pulse` — НЕ ТРОГАТЬ (жёсткий запрет пользователя).

Полная дизайн-система: секция Design в `CLAUDE.md` (палитра BRAND/SEMANTIC, PPL-закон, Cool Steel B, 4 камеры ▣▥◆○, i18n через `getLang()`/`isRu()`). Старый `DESIGN.md` (Vantablack, протух) заархивирован → `docs/_archive/DESIGN-vantablack-DEPRECATED.md`.

---

## 🔧 ТЕХНИЧЕСКИЕ ЗАМЕТКИ

- **Запуск:** `npm run dev` → :3000 (порт 3000 = пользователь, 3001 = Claude preview). Телеметрия — `scripts/telemetry-server.mjs --lan`, `server.js` не подменять.
- **Тесты:** `npm test` = unit+integration (**273**, тёплый прогон ~1с, холодный ~23с). `npx playwright test` — e2e отдельно, **на тёплом сервере** (холодный/зомби :3000 → флаки goto-таймаутов).
- **SW:** `athlete-pro-v109`; ASSETS только через `npm run build:sw`, затем бамп `CACHE_NAME`.
- **Билд:** dev = source, prod = `dist` (esbuild content-hash, immutable) — см. memory cache-hash.
- **Версия:** стабильный мёрж в main = бамп `VERSION` в `js/version.js` + `version` в `package.json` (+package-lock через `npm version --no-git-tag-version`).
- **Прод:** Vercel-проект `gio-g7/athlete-pro-v7` (алиас athlete-pro-v7.vercel.app), git-репо athlete-pro-v2, деплой с `main`. Локальный `main` в корневом чекауте протух — релиз пушить `git push origin <trunk>:main`, корень не трогать.
- **Git в worktree:** после убитой по таймауту команды git может висеть (pager держит tty) — использовать `GIT_PAGER=cat` и `</dev/null`.
