# Fit Elite

## Vision

Персональный PWA-трекер тренировок с AI-коучем нового поколения. Не конкурент Strong или Hevy — свой уровень выше. Приложение для себя, без компромиссов: правильная архитектура, elite дизайн, AI который реально управляет тренировочным процессом.

**Суть:** AI-коуч строит программу, адаптирует нагрузку и ведёт диалог прямо во время тренировки. Человек только тренируется.

## Stack

- **Frontend:** Vanilla JS PWA (намеренно без фреймворков — усложнять только когда оправдано)
- **Backend:** Node.js + Express
- **AI:** Claude API (Opus) — SSE streaming
- **Storage:** IndexedDB (primary) + опциональный Supabase/Firebase
- **система тренировок:** PPL (Push / Pull / Legs)

## Goals

### Текущее состояние (v0 — working app)
- PPL-трекер с логированием сетов, тоннажем, 1RM (Epley)
- AI-коуч через Claude Opus — рекомендации + чат
- Muscle heatmap (72h fatigue decay)
- PWA: offline, installable, iOS-ready
- Dashboard, Analytics, Body Stats, Profile

### Целевое состояние (v1 — elite)
- Архитектура: Store/View разделение, ES Modules, JSDoc-контракты
- Performance: lazy init, DB coalescing, Lighthouse 90+
- Design system: единые компоненты, WCAG AA, консистентность
- AI автопилот: строит программу → адаптирует нагрузку → ведёт диалог во время тренировки

## Requirements

### Validated (существует в коде)

- ✓ PPL workout logging — sets, reps, weight, RPE, tonnage
- ✓ 1RM estimation (Epley formula)
- ✓ Muscle fatigue heatmap (72h decay, front/back SVG)
- ✓ AI coach chat via Claude Opus (SSE streaming)
- ✓ Dashboard — weekly/monthly stats, PPL balance, streak
- ✓ Analytics — volume trends, 1RM leaderboard, calendar
- ✓ Body metrics — weight, height, BMI history
- ✓ Profile — backup/restore JSON, settings
- ✓ PWA — offline, installable, iOS safe area
- ✓ Rest timer with audio
- ✓ Plate calculator
- ✓ Session restore (interrupted workout recovery)
- ✓ Optional cloud sync (Supabase + Firebase)

### Active (строим в v1)

- [ ] Store/View разделение в крупных модулях (workout, analytics, claude)
- [ ] ES Modules — убрать глобальный namespace
- [ ] JSDoc-контракты на все публичные API модулей
- [ ] server.js → routes/ + lib/ структура
- [ ] DB coalescing на Dashboard (1 getAll вместо 4)
- [ ] Lazy init тяжёлых модулей (analytics, AI)
- [ ] Conditional Firebase SDK load
- [ ] css/base.css — единые компоненты
- [ ] WCAG AA контраст + focus-visible на inputs
- [ ] aria-label на иконочные кнопки
- [ ] Lighthouse baseline + score 90+
- [ ] AI генерирует PPL-программу под пользователя
- [ ] AI адаптирует нагрузку на основе прогресса и усталости
- [ ] AI ведёт диалог прямо во время тренировки (in-workout chat)

### Out of Scope (v1)

- Социальные фичи (шеринг, лидерборды) — не личный трекер
- Видео-инструкции упражнений — сложность без ценности
- Платная подписка / монетизация — личный проект
- Светлая тема — приоритет dark mode

## Key Decisions

| Решение | Обоснование | Статус |
|---------|-------------|--------|
| Vanilla JS без фреймворка | Намеренно — усложнять только когда оправдано | Зафиксировано |
| ES Modules вместо глобалов | Изоляция, tree-shaking, явные зависимости | Фаза 1 |
| Store/View без фреймворка | Паттерн без оверинжиниринга | Фаза 1 |
| JSDoc вместо TypeScript | Минимальный барьер входа, максимальная польза | Фаза 1 |
| AI автопилот как долгосрочная цель | Главная дифференцирующая фича | Фаза 4 |

## Метрики успеха

- Architecture: Store/View разделение во всех крупных модулях
- Performance: Lighthouse score ≥ 90, 1 DB транзакция на Dashboard load
- Design: WCAG AA, консистентные компоненты во всех 5 экранах
- AI: программа генерируется автоматически, адаптируется после каждой тренировки

---
*Last updated: 2026-03-16 после инициализации проекта*
