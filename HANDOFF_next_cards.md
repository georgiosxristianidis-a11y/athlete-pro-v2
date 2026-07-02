# HANDOFF — стек карточек (после Air Cleanup 1-3/5/6)

> Обновлено 2026-07-02. Правило: 1 карточка = 1 сессия, сверху вниз.
> Гейт перед коммитом: `npm test` (214) + `npm run lint` (0 err). Перед рискованным — тег `checkpoint-<date>`.
> База: trunk `claude/csp-soft-delete` @ 488fe96 (локально, НЕ запушено).

---

## Карточка R — RELEASE 1.19.0: мёрж в main + деплой (первая — полевой фикс BUG-NAV должен доехать до телефона)

- **ЦЕЛЬ:** выровнять версии (package.json 1.17.0 → 1.19.0, js/version.js 1.18.2 → 1.19.0), запушить trunk, FF main, дождаться Vercel-деплоя (прод = **athlete-pro-v7**, чек через gh api — см. memory reference-vercel-deploy).
- **ГДЕ СТОП:** main == trunk на remote, прод отвечает, профайл-меню показывает v1.19.0. Ручной тест «назад» на телефоне — за Gio после деплоя.
- **НЕ ТРОГАТЬ:** код приложения — только version-бамп и git.

## Карточка 4b — DB-SPLIT: мелкие сторы (Metrics + Events + NutritionLogs + PlannedWorkouts)

- **ЦЕЛЬ:** вынести 4 простых CRUD-стора в `js/db/{metrics,events,nutrition,planned}.js` по паттерну settings.js; `js/db.js` — тонкий re-export, публичный API не меняется. После — `npm run build:sw` + бамп `CACHE_NAME`.
- **ГДЕ СТОП:** гейт зелёный, приложение грузится offline. Если 4 за сессию тяжело — стоп после любого целого стора.
- **НЕ ТРОГАТЬ:** сигнатуры API, миграции v3→v4, sync.js, Workouts/Backup.
- Тег `checkpoint-<date>` перед стартом.

## Карточка 4c — DB-SPLIT: Workouts (самый нагруженный)

- **ЦЕЛЬ:** вынести Workouts в `js/db/workouts.js` (внимание: `_triggerSync`, тумбстоуны `delete`/`deleteById`, `_putRaw`/`_delRaw`). build:sw + бамп CACHE_NAME.
- **ГДЕ СТОП:** гейт + e2e + превью-смоук (старт тренировки, сет, финиш, история).
- **НЕ ТРОГАТЬ:** API, миграции, sync.js.

## Карточка 4d — DB-SPLIT: Backup + финализация

- **ЦЕЛЬ:** вынести Backup (import/export, withMeta-штамп) в `js/db/backup.js`; `js/db.js` остаётся чистым фасадом. build:sw + бамп. Карточка 4 закрыта целиком → отметить в HANDOFF_air_cleanup.md.
- **ГДЕ СТОП:** гейт + смоук export→import в превью.
- **НЕ ТРОГАТЬ:** формат бэкап-JSON (совместимость со старыми экспортами и import-ETL).

## Карточка Q2 — PII console.log sweep (мелкая, можно делегировать)

- **ЦЕЛЬ:** убрать логирование чувствительного: `routes/integrations.js:69` (длины ключей G=/A=) + grep `console.log` по routes/lib/js на ключи/имена/веса → почистить или перевести на lib/logger.js.
- **ГДЕ СТОП:** grep не находит PII/ключей в логах. Функциональные логи не трогать.
- **НЕ ТРОГАТЬ:** логику; только лог-строки.

## Карточка A-4 — тест видимости drum после Add Set 🟦

- **ЦЕЛЬ:** unit/e2e: после «+ add set» новый ряд имеет `.drum-item--active` с видимым числом (регресс BUG-7/drum-fix fd99a2e).
- **ГДЕ СТОП:** тест падает на ревёрте фикса, зелёный на текущем коде.
- **НЕ ТРОГАТЬ:** сам set-logger.

---

После стека: роадмап CRDT foundation + полевые DS1 (миграция v3→v4 на живых данных) / DS2 (2-девайс конвергенция) — за Gio с телефонами.
