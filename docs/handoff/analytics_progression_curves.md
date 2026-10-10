# Handoff: Progression Curves Analytics with IDB Cache

- **Цель**: Расчет кривых прогрессии нагрузок в аналитике с кэшированием в IndexedDB.
- **Статус**: Полный Gatekeeper DoD пройден (exit code 0).
- **Новые модули**:
  - `js/analytics.progression-curves.js` — чистый расчет кривых, UTC-таймстемпы, дельта, сигнатуры.
  - `js/db/progression-cache.js` — изолированный версионированный кэш на базе IndexedDB `SETTINGS`.
  - `test/analytics-progression-curves.test.js` — 25 тестов (краевые случаи, гонки, стресс-тест 1000 тренировок).
- **Обновленные модули**:
  - `js/analytics.store.js` — метод `getCachedOrComputeProgressionCurves` с in-flight дедупликацией.
  - `sw.js` — актуализирован манифест Service Worker (`npm run build:sw`).
- **Верификация**:
  - `node --test test/analytics-progression-curves.test.js` (pass: 25, fail: 0)
  - `npm test -- --silent` (pass: 1612, fail: 0, suites: 227, exit code 0)
