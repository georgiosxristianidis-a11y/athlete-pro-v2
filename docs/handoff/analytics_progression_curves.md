# Handoff: Progression Curves Analytics with IDB Cache & Onboarding UI

- **Цель**: Расчет кривых прогрессии нагрузок в аналитике с IDB-кэшированием и онбордингом ранних сессий (Push/Pull).
- **Статус**: Gatekeeper DoD пройден (exit code 0).
- **Архитектура**:
  - `js/analytics.progression-curves.js`: чистый детерминированный расчет кривых (PPL-доминанта, агрегация по месяцам).
  - `js/db/progression-cache.js`: персистентный версионированный IDB-кэш со схемой `v1` и автоинвалидацией.
  - `js/analytics.store.js`: метод `getCachedOrComputeProgressionCurves` с in-flight дедупликацией промисов.
  - `js/analytics.strength-curves.js`: карточки с поддержкой 1-точечной базовой отметки (пунктир, центрированная точка, скраб без NaN) и онбординг-подсказки.
  - `js/analytics.view.js`: асинхронный вызов IDB-кэша с `minMonths: 1` и надежным fallback.
- **Тесты**:
  - `test/analytics-progression-curves.test.js`: 25/25 pass (краевые случаи, гонки, стресс-тест 1000 тренировок).
  - `test/strength-curves-ui.test.js`: 6/6 pass (базовая отметка, мультимесячные кривые, пустые состояния).
  - `test/strength-hero-duration.test.js`: 4/4 pass (сохранение контракта скрытия Hero при <3 месяцах).
  - `test/sw-cache-name.test.js` & `test/version-bump-required.test.js`: 8/8 pass.
- **Версия**: `1.27.163` (манифест `sw.js` синхронизирован).
