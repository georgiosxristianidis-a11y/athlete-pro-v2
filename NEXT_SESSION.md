# NEXT SESSION — Athlete Pro · Канонический хэндофф

> Обновлено: 2026-07-25 (Opus 5 — программа гигиены H-1..H-5 + O-3/O-5).
>
> **Точка интеграции одна: `origin/main`.** Долгоживущий trunk `claude/csp-soft-delete` упразднён (карточка O-3) — он был рудиментом эпохи незащищённого main и стоил потери влитого PR#9. Ветка — всегда от свежего `origin/main`, влитие — только через PR. Бэкап линии: тег `backup-trunk-6b4f80b`.
> ⚠️ **main защищён branch-protection** — обяз. чеки `test`+`e2e` + enforce_admins; прямой `git push HEAD:main` отклоняется (GH006). Порядок: `gh pr create --base main` → чеки зелёные → `gh pr merge --rebase`.
>
> **SHA здесь не хранятся** — они протухают от собственного мёржа этого файла (корень R4). Добывать командой:
> `git fetch origin && git rev-parse --short origin/main` · состояние прода — `npm run smoke:prod` · ревизия веток — `npm run inventory` · старт сессии — `npm run preflight`.
>
> Инварианты: VERSION `1.25.7` (rest-HUD «далее: X»; смоук после мёржа) · гейт unit **332/332** · lint **0 err** (stylelint warnings ~36) · npm audit **0 vuln** · SW `CACHE_NAME` = **автобамп** контент-хешом манифеста (ручной vNNN не нужен). Lighthouse из worktree: perf 95-96 / a11y 100 / bp 100.
> ⚠️ lhci гонять ТОЛЬКО из worktree — корень репо на протухшем main, даёт фейковые цифры (кейс perf 61 2026-07-18).
> Активная программа: **GYM-GRADE** — `docs/handoff/HANDOFF_gym_grade.md` (DoD из 5 пунктов, журнал полевых тренировок = 3/10). Стек карточек: `docs/handoff/HANDOFF_next_cards.md`. Остров + Sonnet-задачи: `docs/handoff/HANDOFF_isl_tail.md`. AIR-хвост: `docs/handoff/HANDOFF_air_refactor.md` (§ AIR-4).
> Done-история — в `CHANGELOG.md`. Этот файл — только актуальное состояние и остаток.

---

## ✅ РЕЛИЗ 1.25.5 — ЛЕЧЕНИЕ 304-ЗАМОРОЗКИ (2026-07-24)

Корень полевого бага «телефон показывает 1.24.1 / 1.21 при проде 1.25.4»: Vercel нормализует mtime файлов в константу (окт 2018), а weak ETag Express строится из mtime+size → у любого файла с неизменным размером ETag **совпадает между релизами**. `version.js` всегда 35 байт (`'1.24.1'`→`'1.25.5'`) → возвращающийся клиент вечно получает 304 и крутит старый код. Доказано curl на живом проде: `ETag: W/"23-1668f272800"` — тот же mtime-компонент, что и у всех прочих файлов.

- `8d29651` — `express.static`: `etag:false, lastModified:false`; SPA-fallback `sendFile`: `no-store` + без валидатора.
- `9e162cb` — **обратно валидаторы для медиа**: блэнкетный `etag:false` целил в код, но ронял ассеты в дефолт `public, max-age=0` БЕЗ валидатора → `panda-voice.mp4` (327КБ) качался целиком на каждый промах кеша. Отдельный mount `/assets`: `etag:true, lastModified:false, max-age=1h` (бинарь не меняет размер на месте — его ETag честен).
- `a510d1f` — SW: честный skipWaiting-хендшейк + loop-guard + тап 5× по версии как аварийный форс-апдейт.

Верифай curl на сервере ветки: `/assets/panda-poster.jpg` + `If-None-Match` → **304, 0 байт**; `/js/version.js` + отравленный ETag прода → **200, 35 байт** (заморозка невозможна). Гейт 308/308, lint 0 err. SW `v114-2549f128`.

**Лечение уже залипших телефонов** (данные целы): Chrome → История → Очистить → Всё время → галочка ТОЛЬКО «Изображения и другие файлы в кеше» (cookie/данные сайтов НЕ трогать — там IndexedDB с тренировками) → закрыть Chrome и PWA полностью → открыть заново.

**✅ ПОЛЕВОЙ ЧЕК ЗЕЛЁНЫЙ (2026-07-25, Gio):** телефон обновился до 1.25.5 сам, SW подхватился. Карточка закрыта целиком.

---

## 🧭 ОРКЕСТРАЦИЯ — новая программа (2026-07-25)

Разбор трёх инцидентов сессии (потеря влитого PR#9 · прод-фикс провисел невлитым · битый git-email → 500 на create-PR) + карточки — **`docs/handoff/HANDOFF_orchestration.md`**. Там же DoD-лестница (готово = на проде, не «закоммичено») и роли LEAD/worker/verifier.

**Закрыто 2026-07-25 — все пять корней:** O-1 гард кеш-заголовков · O-2 `npm run smoke:prod` · O-4 `npm run preflight` · O-5 `npm run inventory` (вернул два зелёных потерянных теста + `FABLE5_FINDINGS.md`) · O-3 trunk упразднён · O-6 эта шапка без SHA. Плюс программа гигиены репо: 4492 → 270 отслеживаемых файлов и закон структуры под гардом (`CLAUDE.md` § «Где что лежит»).

Замер веток теперь снимается командой, а не записывается сюда: `npm run inventory`. Осталось: удалить 76 влитых веток (нужно снять ~40 worktree, подтверждение Gio пачками) и решить O-7 (контент-хеши ассетов, конфликт с no-build).

---

## ✅ АУДИТ-КОНСОЛИДАЦИЯ ВЫКАЧЕНА (2026-07-24, релиз 1.25.4)

Линейная ветка `a58ec9` (security `8fed1ae` + SW-автобамп `2654637` + handoff) сведена LEAD поверх trunk, бамп VERSION 1.25.4, релиз через **PR #10** (rebase-merge — main защищён, прямой push отклонён). Trunk переставлен на `cb9fbe2`; ветки `claude/app-professional-audit-b86b9a` и `claude/sonnet-5-audit-review-a58ec9` **удалены** (контент в main); их worktree-папки — сироты (Windows-лок, регистрация снята, дочистить вручную). Бэкап-тег `backup-35d2afd` остался.

**Session-close 2026-07-24 (после PR #10):** handoff актуализирован PR #11 → trunk `540f5a3` (== origin main). **Авто-мёрж вооружён:** правило `Bash(gh pr merge:*)` в `.claude/settings.local.json` (персональный, gitignored) — релиз/handoff-PR вливаются `gh pr merge --auto --rebase --delete-branch` без ручного подтверждения и без поллинга (main-защита = гейт). Условия — память `feedback-auto-merge-conditions`. **Дочистить вручную:** папки-сироты `.claude/worktrees/app-professional-audit-b86b9a` и `athlete-pro-design-audit-829571` (git-регистрация снята, физ. папки залочены Windows).

**DESIGN.md заархивирован (2026-07-24, PR #13):** повтор потерянной работы PR#9 (`e4685e9` откатился при пересборке trunk — НЕ ancestor origin/main, `DESIGN.md` Vantablack снова врал агентам из корня). Cherry-pick от свежего origin/main, merge `8a71516` → `DESIGN.md` → `docs/_archive/DESIGN-vantablack-DEPRECATED.md` (шапка DEPRECATED), ссылки README/CONTRIBUTING/RULES/NEXT_SESSION/`CLAUDE.md` § Key Files переведены на «`CLAUDE.md` § Design». Гоча: `user.email` в worktree был битый (`georgiosxristianidis.com` без @) → GitHub 500 на POST /pulls; починен глобальный git-email на `georgiosxristianidis@gmail.com`.

**Незакрытые residuals (опц.):**
- Ветка `claude/csp-soft-delete` (бывший trunk) — упразднена O-3, бэкап `backup-trunk-6b4f80b`; физическое удаление ветки и снятие worktree `focused-chaum-8a0fa6` ждут подтверждения Gio.
- stylelint цвето-правило `warning→error` — отложено осознанно: сначала чистка 84 rgba (Phase E), иначе гейт мгновенно красный.
- `profile.css:546` = 28px — единственный реальный сырой border-radius (токена 28px нет). Остальные «сырые px» из аудита = микро <6px (ниже `--r-xs`), легитимны.
- CORS `credentials:true` (`server.js`) — опц. чистка; origin-allowlist уже строгий, не открытая дыра.
- `.stylelintcache` не в `.gitignore` — pre-push плодит untracked-файл в каждом worktree (опц. добавить в ignore).

---

## 🎯 АКТУАЛЬНАЯ ОЧЕРЕДЬ (2026-07-17, по критичности)

1. ~~BACKUP~~ — ✅ `22f7638`, выкачен в 1.24.3. Остаток DoD-5 — полевой DS1 + полевой чек экспорта/напоминалки за Gio (можно на проде).
2. ~~DRUM-PERF-2~~ — ✅ код НА ПРОДЕ (1.24.4), флаг `drum-window` **OFF**. Остаток — полевой чек за Gio на проде: включить флаг (`Flags.setFlag('drum-window', true)`), покрутить барабан, при ОК — дефолт ON.
2-bis. ~~FAB-VIDEO~~ — ✅ НА ПРОДЕ (1.25.2, постер-кадр + запуск по тапу), флаг `fab-video` **OFF**. Остаток — полевой чек за Gio на проде: Профиль → AI → тумблер «Живой маскот» — звук/синхрон/уши/постер/батарея/маскот-интро на телефоне, при ОК — дефолт ON. Гоча поля 2026-07-19: телефон Gio залип на 1.24.1 (старый cache-first SW v107) — лечение: Chrome → Данные сайтов → удалить `athlete-pro-v7.vercel.app` → зайти заново (данные в облаке); с v111+ network-first, повторов быть не должно. Отдельная карточка: island-сцена «осуждающий взгляд за 5с до конца отдыха» (блокер — нет кадра «взгляда»; механика: событие ap-rest-warning из dynamic-island.js:411 + seek панды по тайм-коду).
3. ~~P-1 ISL-REST-BTN~~ — ✅ выкачен в 1.25.6 (кнопки 28×26, тач ≥40px). Остаток — полевой чек Gio: легче на глаз, попадание не хуже.
4. **AIR-4** (air_refactor) — sweep + тест-гард backdrop-filter; защищает DoD-2. (Подзадача «DESIGN.md sync» закрыта: файл заархивирован, живой спек — `CLAUDE.md` § Design.)
5. **AIR-2b** (next_cards) — body-stats таб-каскад, хвост DoD-2.
6. Островные хвосты — `docs/handoff/HANDOFF_isl_tail.md` (ISL-SEG-FILL, 2 «проверить»; ISL-REST-NEXT ✅ 1.25.7).

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

После стека: роадмап CRDT foundation (UUID вместо autoIncrement) — `docs/ROADMAP_elite_athlete-pro.md`.

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
3. **Короткие ветки от main (< 24ч).** Задача дня = микро. Застрял > 24ч → `git checkout .`, дроби на два.
4. **Safety net:** перед крупным — тег `checkpoint-<date>`; CI (`.github/workflows/ci.yml`) + pre-push hook — зелёный гейт обязателен. SW-манифест только `npm run build:sw` (после FF `2654637` — сам бампит `CACHE_NAME` контент-хешом, ручной бамп не нужен).
5. **Влитие только через PR в `main`** (O-3, 2026-07-25 — trunk упразднён). Старт от свежего `origin/main` → гейт → `gh pr create --base main` → зелёные чеки → `gh pr merge --rebase`. Отстал от main → `git rebase origin/main` у себя → **перегнать гейт** (в main могли приехать новые тесты) → снова PR. Влитие сразу после гейта, не копить. История — одна прямая линия, одна точка интеграции.

---

## 🤝 МУЛЬТИ-АГЕНТНЫЙ ПРОТОКОЛ

Проект ведут параллельно: **Claude (LEAD)** · **Antigravity·Sonnet** · **Antigravity·Gemini**.

1. Перед задачей — проверь владельца: `🔒 LEAD` не брать (цена ошибки высока).
2. Взял — поставь маркер `🚧 <agent>@<branch>`; закончил — `✅ <hash>`.
3. Чужой незакоммиченный WIP не откатывать (GIO Context Integrity). Один агент = один worktree; вливает LEAD после гейта, через PR в main.

| Метка | Кто | Брать | НЕ брать |
|:--:|---|---|---|
| 🔒 LEAD | Claude Opus/Fable | data correctness · schema · security · кросс-секущее · design-DNA | grep+replace, тесты по готовому спеку |
| 🟦 SONNET | Sonnet | scoped рефактор · тесты · компонент по спеку | новая архитектура |
| 🟩 GEMINI | Gemini | массовый CSS/SVG sweep · find/replace | логика с условиями · дизайн |

Sonnet сейчас: **S1 TEST-ISL-GUARD** в полёте (`docs/handoff/HANDOFF_isl_tail.md`).

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
- **SW:** `athlete-pro-v113`; ASSETS + `CACHE_NAME` через `npm run build:sw` (после FF `2654637` CACHE_NAME авто-бампится sha1-суффиксом манифеста; до мёржа в trunk — ручной бамп).
- **Билд:** dev = source, prod = `dist` (esbuild content-hash, immutable) — см. memory cache-hash.
- **Версия:** стабильный мёрж в main = бамп `VERSION` в `js/version.js` + `version` в `package.json` (+package-lock через `npm version --no-git-tag-version`).
- **Прод:** Vercel-проект `gio-g7/athlete-pro-v7` (алиас athlete-pro-v7.vercel.app), git-репо athlete-pro-v2, деплой с `main`. Локальный `main` в корневом чекауте протух — работать из worktree, релиз вливать через PR (прямой push в main отклоняется), корень не трогать.
- **Git в worktree:** после убитой по таймауту команды git может висеть (pager держит tty) — использовать `GIT_PAGER=cat` и `</dev/null`.
