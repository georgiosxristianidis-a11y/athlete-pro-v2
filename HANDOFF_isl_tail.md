# HANDOFF — Island tail + программа острова (2026-07-09)

> Состояние: ветка `claude/isl-finish-exp-height-stabilize-077d20`, тег
> `checkpoint-2026-07-09-isl-tail-stabilized` (`3e556f2`) поверх 1.22.0 (`86bdd62`).
> Гейт **257/257**, lint **0 err**. НЕ запушено, НЕ влито.
> Хвост EXP-HEIGHT/FINISH пересобран cherry-pick'ом на прод-линию (без стейл-дрома
> `e4b2df6`); полевые баги **B** (тап-контрол тогглил expand) и **C** (точка `.online`
> невидима) закрыты и верифицированы в превью.
> Формат карточек: ЦЕЛЬ / ГДЕ СТОП / НЕ ТРОГАТЬ. 1 карточка = 1 сессия, по приоритету сверху.

## За Gio (не код)
- ~~Полевой чек хвоста на телефоне~~ ✅ 2026-07-11 (релиз 1.23.0, L1 закрыта).
- ~~Решение по карточке L3~~ ✅ 2026-07-15: **нейтральная точка в airgap, не прятать** — L3 разблокирована.

---

## 🟠 LEAD (Claude Opus/Fable) — data correctness · interaction · design-DNA · кросс-секущее

### L1 · ISL-TAIL-MERGE 🟠 P0 (разблокировано полевым чеком Gio)
**ЦЕЛЬ:** влить стабилизированный хвост в trunk и выкатить.
**Шаги:** от свежего trunk `csp-soft-delete` → `git rebase` ветки хвоста → гейт → `git merge --ff-only` → бамп VERSION (`js/version.js` + `package.json`) → SW bump (`npm run build:sw` + `CACHE_NAME`) → push пакетом → верифай Vercel Production (athlete-pro-v7).
**ГДЕ СТОП:** trunk == remote, одна прямая линия, прод отдаёт новую версию + остров стабилен.
**НЕ ТРОГАТЬ:** `island-set-pulse` (жёсткий запрет); порядок FF (сначала rebase, отказ FF = trunk уехал).

### L2 · GESTURE-MERGE 🟠 P1 — ЗАКРЫТА 2026-07-12 (линия isl-profile-next rebase→FF в trunk 3aee4aa, SW v106, гейт 263/263; мёртвый хэш timer-settings убит ещё в ISL-SET — long-press = Nav.go('s-island-settings'))
**ЦЕЛЬ:** свести островную программу — влить ISL-SET (`4cc1f14`) + ISL-PROFILE (`01d74ce`) в trunk-цепочку, убить мёртвый жест.
**Продумать:** long-press острова ставит мёртвый хэш `timer-settings` (нет обработчика, `js/shared/dynamic-island.js` ~L490) → унифицировать на `s-island-settings`; dbl-click → privacy (уже есть). Порядок влития: ISL-SET как база → ISL-PROFILE → (хвост уже влит в L1).
**ГДЕ СТОП:** long-press открывает island-настройки с селектором профиля; мёртвый хэш удалён; гейт зелёный.
**НЕ ТРОГАТЬ:** `island-set-pulse`; двухуровневую палитру.

### L3 · ISL-DOT-AIRGAP 🟠 P2 (решение Gio 2026-07-15: нейтральная точка)
**ЦЕЛЬ:** точка-индикатор видима ВСЕГДА: в airgap — нейтральная серая (chrome-токен), не скрытая; все пути (idle + workout) через `deriveDotState`.
**Продумать:** сейчас idle ставит класс напрямую (`dynamic-island.js` `_updateNetworkStatus`), в обход `deriveDotState`; в тренировке дефолт `airgap` прячет точку (`.island-dot.airgap{display:none}`). Убрать `display:none`, дать airgap нейтральный цвет через токен (`--c-chrome`-линия, не BRAND); единый источник правды — `deriveDotState`. Обоснование: отсутствие сигнала неотличимо от поломки (полевой баг C был прочитан именно так).
**ГДЕ СТОП:** точка видна и осмысленна во всех режимах и профилях (Minimal-DHL + Apple); семантика sync-состояний в `js/shared/sync-dot.js` цела; гейт зелёный.
**НЕ ТРОГАТЬ:** `deriveDotState` контракт (4+1 состояний); `island-set-pulse`.

### L4 · GESTURE-UNIFY 🟠 P2 (аудит idle-острова 2026-07-15)
**ЦЕЛЬ:** один жест = один смысл во всех режимах: long-press острова ВСЕГДА → `s-island-settings`.
**Продумать:** сейчас long-press в idle уходит в `PrivacyRapid.startLongPress` (`dynamic-island.js` `_onPointerDown`), а в тренировке → Island Settings — один жест, два исхода, ментальная модель ломается. Rapid-переключение privacy перенести: рекомендация — double-tap в idle (dbl-click → privacy уже существовал как паттерн) ИЛИ только через Island Settings (privacy-блок там уже живёт). Решить по месту, что дешевле и чище.
**ГДЕ СТОП:** long-press ведёт в настройки из любого режима; rapid-privacy доступен не дольше чем за 2 действия; ничего не отвалилось в idle-точке (L3).
**НЕ ТРОГАТЬ:** `island-set-pulse`; тап-гард expand/collapse (полевой фикс B — клики по `[data-action]` не тогглят).

---

## 🔵 SONNET (4.6/5) — scoped тесты · рефактор по спеку

### S1 · TEST-ISL-GUARD 🔵 P1 (замок на стабилизацию)
**ЦЕЛЬ:** регресс-тест на фиксы B/C, чтобы влитие не откатило их молча.
**Спек:** unit/DOM-тест — (1) клик по элементу с `[data-action]` внутри острова НЕ вызывает `toggleExpand`; клик по пустому телу пилюли — вызывает; (2) `.island-dot.online` имеет ненулевой `background`. Репро против `js/shared/dynamic-island.js:176` и `css/dynamic-island.css`.
**ГДЕ СТОП:** тесты зелёные и падают при откате гарда/CSS-правила.
**НЕ ТРОГАТЬ:** прод-логику острова — только тесты.

### S2 · A-4 DRUM-VISIBILITY 🔵 P2 (из бэклога)
**ЦЕЛЬ:** unit/visual тест видимости цифр барабана после Add Set (repro BUG-7).
**Спек:** после `addSet` активное число барабана не теряется/не 0 (drum-virtual OFF сейчас — тест должен держать инвариант независимо от флага).
**ГДЕ СТОП:** тест зелёный, ловит regression add-set rebuild.
**НЕ ТРОГАТЬ:** `js/ui/drum-picker.js` логику — только тест.

### S3 · Q2 PII-LOG-SWEEP 🔵 P2 (безопасность, scoped)
**ЦЕЛЬ:** выпилить логирование длин ключей.
**Спек:** `routes/integrations.js:69` логирует длины ключей (G=/A=) → убрать/заменить на структурный лог без PII (`lib/logger.js`).
**ГДЕ СТОП:** grep по `.length` в логах интеграций чист; тесты зелёные.
**НЕ ТРОГАТЬ:** контракт роутов (suffix-only).

### S4 · DB-SPLIT-4d 🔵 P3 (остаток фасада)
**ЦЕЛЬ:** вынести Backup-стор в `js/db/*` через фасад (последний кусок DB-SPLIT).
**Спек:** по паттерну уже вынесенных Settings/OneRM/Workouts; фасад `js/db.js` сохраняет API.
**ГДЕ СТОП:** `js/db.js` = тонкий фасад, Backup в отдельном модуле, гейт зелёный, SW-манифест перегенерён.
**НЕ ТРОГАТЬ:** схему IDB (версии миграций).
