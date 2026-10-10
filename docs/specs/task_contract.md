# Contract: Progression Curves Analytics with IndexedDB Cache

## 1. Overview
Добавление модуля расчета кривых прогрессии нагрузок (Progression Curves / Strength Progression Series) с кэшированием вычисленных агрегатов в IndexedDB (`progressionCurvesCache` / store в DB facade).

## 2. Interface Specifications

### 2.1 Module: `js/analytics.progression-curves.js`

```javascript
/**
 * @typedef {{
 *   t: number,           // epoch ms (mid-month timestamp or session timestamp)
 *   v: number,           // top working weight in kg
 *   est1RM?: number,     // estimated 1RM for this point
 *   volume?: number      // total volume for this point
 * }} ProgressionPoint
 *
 * @typedef {{
 *   name: string,
 *   pts: ProgressionPoint[],
 *   type: 'push'|'pull'|'legs'|'other',
 *   n: number,           // session count
 *   delta: number,       // current weight - first weight
 *   bestWeight: number,
 *   currentWeight: number
 * }} ExerciseProgressionCurve
 *
 * @typedef {{
 *   id: string,          // cache key: e.g. 'all' or exercise normalized name
 *   version: number,     // schema version (1)
 *   timestamp: number,   // last computed epoch ms
 *   workoutCount: number,// number of workouts included
 *   curves: ExerciseProgressionCurve[]
 * }} ProgressionCurveCacheRecord
 */
```

#### Functions:
- `calculateProgressionCurves(workouts, options = { minMonths: 1, limit: 6 }): ExerciseProgressionCurve[]`
  - Чистая детерминированная функция без сайд-эффектов и DOM.
  - Устойчива к `null`, `undefined`, пустым тренировкам, невалидным сетам (`done === false`, отрицательный вес).
- `computeProgressionCacheKey(workouts): string`
  - Возвращает сигнатуру данных (напр., `count:maxTimestamp`).

### 2.2 Storage & Caching: `js/db/progression-cache.js` & `js/analytics.store.js`

#### Storage API (`ProgressionCache`):
- `getProgressionCurvesCache(key: string): Promise<ProgressionCurveCacheRecord | null>`
- `setProgressionCurvesCache(record: ProgressionCurveCacheRecord): Promise<void>`
- `clearProgressionCurvesCache(): Promise<void>`

#### Facade Integration (`analytics.store.js`):
- `getCachedOrComputeProgressionCurves(workouts, options?): Promise<ExerciseProgressionCurve[]>`
  - Читает из IDB. Если кэш валиден (по версии и количеству/хешу тренировок), возвращает кэшированные данные.
  - Если кэш отсутствует или устарел, производит расчет через `calculateProgressionCurves`, асинхронно обновляет кэш в IDB и возвращает результат.
  - Инвалидация: при несоответствии workoutCount / maxTimestamp или принудительно.

## 3. Worker Invariants & Division
- **Worker 1 (Implementation)**:
  - Реализует `js/analytics.progression-curves.js` и интеграцию с кэшем `js/analytics.store.js` / `js/db/progression-cache.js`.
  - Обязательно соблюдает offline-first, версионирование кэша (`version: 1`), изоляцию логики от DOM.
- **Worker 2 (Stress Tests & Verification)**:
  - Создает `test/analytics-progression-curves.test.js`.
  - Покрывает граничные случаи: 0 тренировок, пропуски месяцев, отрицательные веса, NaN веса, поврежденный кэш в IDB, параллельные вызовы (гонки чтения/записи), инвалидация.
