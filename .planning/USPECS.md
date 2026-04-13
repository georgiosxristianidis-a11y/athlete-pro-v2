# USPECS.md — User Specifications

> **Проект:** PWA Workout Tracker  
> **Автор:** Gio  
> **Версия:** 1.0  
> **Дата:** 2026-04-09  
> **Статус:** В разработке  

---

## 1. ОБЗОР ПРОЕКТА

### 1.1 Что это
Мобильное PWA-приложение для трекинга силовых и фитнес-тренировок. Работает полностью offline, local-first. Устанавливается на домашний экран Android как нативное приложение.

### 1.2 Для кого
- Первичный пользователь: автор (Gio, 37 лет, регулярные тренировки)
- Вторичная аудитория: люди, которым нужен минималистичный трекер без подписок, рекламы и обязательной регистрации

### 1.3 Ключевая философия
- **Local-First** — все данные хранятся на устройстве (IndexedDB), сервер не нужен
- **Offline-capable** — полная работоспособность без интернета
- **Zero BS UI** — никаких лишних экранов, максимум 2 тапа до начала тренировки
- **Vantablack aesthetic** — тёмная тема, Glassmorphism, минимализм

---

## 2. ТЕХНОЛОГИЧЕСКИЙ СТЕК

| Компонент | Технология | Обоснование |
|---|---|---|
| Фронтенд | Vanilla JS (ES modules) | Нет зависимостей, быстрый старт, полный контроль |
| Хранение | IndexedDB (через idb-keyval или raw API) | Local-first, персистентный, не зависит от localStorage лимитов |
| Оффлайн | Service Worker + Cache API | PWA-стандарт, precache shell + runtime cache |
| Стилизация | CSS custom properties + Glassmorphism | Единый дизайн-токен, dark-mode native |
| Сборка | Без сборщика (нативные ES modules) или Vite (при необходимости) | Минимум инфраструктуры |
| Уведомления | Notification API + navigator.vibrate | Таймеры отдыха, напоминания |
| PiP (Phase 5+) | Canvas → captureStream → Video → requestPictureInPicture | Android PiP hack для таймера отдыха поверх всех окон |

---

## 3. АРХИТЕКТУРА

### 3.1 Паттерн: Store → View

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  IndexedDB   │◄───►│    Store      │◄───►│    View      │
│  (persist)   │     │  (state mgr)  │     │  (DOM render) │
└─────────────┘     └──────────────┘     └─────────────┘
                          │
                    ┌─────┴──────┐
                    │  Actions    │
                    │  (user ops) │
                    └────────────┘
```

- **Store** — единственный источник правды. Читает/пишет в IndexedDB. Эмитит события при изменении стейта.
- **View** — подписывается на Store, рендерит DOM. Никогда не обращается к IndexedDB напрямую.
- **Actions** — чистые функции, вызываемые из View. Трансформируют стейт через Store.

### 3.2 Файловая структура

```
/
├── index.html
├── manifest.json
├── sw.js                    # Service Worker
├── css/
│   ├── tokens.css           # Design tokens (цвета, радиусы, тени)
│   └── app.css              # Компонентные стили
├── js/
│   ├── app.js               # Entry point, router
│   ├── store/
│   │   ├── db.js            # IndexedDB wrapper
│   │   ├── workout.store.js # Стейт тренировок
│   │   ├── exercise.store.js# Библиотека упражнений
│   │   └── settings.store.js# Настройки пользователя
│   ├── views/
│   │   ├── home.view.js     # Главный экран
│   │   ├── workout.view.js  # Активная тренировка
│   │   ├── history.view.js  # История тренировок
│   │   ├── exercise.view.js # Каталог упражнений
│   │   └── stats.view.js    # Статистика/прогресс
│   ├── components/
│   │   ├── timer.js         # Таймер отдыха
│   │   ├── set-input.js     # Ввод подхода (вес × повторения)
│   │   └── nav.js           # Нижняя навигация
│   └── utils/
│       ├── pip.js           # Canvas-Video PiP hack
│       ├── notify.js        # Уведомления + вибрация
│       └── date.js          # Хелперы дат
└── assets/
    └── icons/               # PWA-иконки 192×192, 512×512
```

---

## 4. КЛЮЧЕВЫЕ ЭКРАНЫ (VIEWS)

### 4.1 Home (Главная)
- Быстрый старт тренировки (1 тап)
- Последняя тренировка (краткая сводка)
- Streak / серия тренировок
- Текущая неделя (визуально: точки по дням)

### 4.2 Workout (Активная тренировка)
- Название тренировки (ввод/выбор шаблона)
- Список упражнений с подходами
- Для каждого подхода: вес (kg) × повторения
- Кнопка "Добавить подход"
- Таймер отдыха между подходами (настраиваемый: 60/90/120/180 сек)
- Кнопка "Завершить тренировку"
- Длительность тренировки (автоматически)

### 4.3 History (История)
- Календарный вид или список
- Фильтр по упражнению / мышечной группе
- Детали каждой тренировки при тапе
- Удаление / редактирование записей

### 4.4 Exercise Library (Каталог)
- Предустановленные упражнения по группам мышц
- Возможность добавить своё упражнение
- Поиск
- Теги: грудь, спина, ноги, плечи, руки, кор, кардио

### 4.5 Stats (Статистика)
- Прогресс по конкретному упражнению (1RM, объём)
- Частота тренировок по неделям
- Распределение по мышечным группам
- Общий объём за период

---

## 5. МОДЕЛЬ ДАННЫХ (IndexedDB)

### 5.1 Object Stores

#### `workouts`
```js
{
  id: "w_1712600000000_a1b2c",   // timestamp + random
  name: "Push Day",
  date: "2026-04-09",
  startedAt: "2026-04-09T10:30:00Z",
  finishedAt: "2026-04-09T11:45:00Z",
  exercises: [
    {
      exerciseId: "ex_bench_press",
      name: "Bench Press",
      sets: [
        { weight: 80, reps: 8, completed: true, restSec: 120 },
        { weight: 85, reps: 6, completed: true, restSec: 120 },
        { weight: 85, reps: 5, completed: true, restSec: 0 },
      ]
    },
    {
      exerciseId: "ex_incline_db",
      name: "Incline Dumbbell Press",
      sets: [
        { weight: 30, reps: 10, completed: true, restSec: 90 },
        { weight: 30, reps: 9, completed: true, restSec: 90 },
      ]
    }
  ],
  notes: "Felt strong today",
  totalVolume: 2350,        // auto-calculated: Σ(weight × reps)
  durationMin: 75,          // auto-calculated
}
```

#### `exercises`
```js
{
  id: "ex_bench_press",
  name: "Bench Press",
  muscleGroup: "chest",     // primary
  secondary: ["triceps", "shoulders"],
  equipment: "barbell",
  isCustom: false,
  createdAt: "2026-01-01T00:00:00Z",
}
```

#### `templates`
```js
{
  id: "tpl_push_day",
  name: "Push Day",
  exercises: [
    { exerciseId: "ex_bench_press", defaultSets: 3, defaultReps: 8 },
    { exerciseId: "ex_incline_db", defaultSets: 3, defaultReps: 10 },
    { exerciseId: "ex_ohp", defaultSets: 3, defaultReps: 8 },
  ],
  lastUsed: "2026-04-07",
}
```

#### `settings`
```js
{
  id: "user_settings",
  restTimerDefault: 120,    // секунд
  weightUnit: "kg",         // kg | lbs
  theme: "vantablack",      // vantablack | midnight
  vibrationEnabled: true,
  notificationsEnabled: true,
  pipEnabled: false,        // Phase 5+
}
```

---

## 6. ДИЗАЙН-СИСТЕМА

### 6.1 Визуальный стиль: Vantablack Glassmorphism

| Token | Значение | Назначение |
|---|---|---|
| `--bg` | `#0a0a0f` | Основной фон |
| `--bg-card` | `rgba(255,255,255,0.04)` | Фон карточки |
| `--bg-card-hover` | `rgba(255,255,255,0.07)` | Hover карточки |
| `--border` | `rgba(255,255,255,0.08)` | Границы |
| `--border-focus` | `rgba(255,255,255,0.16)` | Фокус инпутов |
| `--text-1` | `#ffffff` | Основной текст |
| `--text-2` | `rgba(255,255,255,0.55)` | Вторичный |
| `--text-3` | `rgba(255,255,255,0.28)` | Приглушённый |
| `--accent` | `#a78bfa` | Основной акцент (пурпурный) |
| `--success` | `#34d399` | Завершённый подход |
| `--warning` | `#fbbf24` | Таймер / предупреждение |
| `--danger` | `#f87171` | Удаление / ошибка |
| `--blur` | `blur(20px)` | Backdrop blur |
| `--radius` | `16px` | Карточки |
| `--radius-sm` | `8px` | Кнопки, инпуты |

### 6.2 Типографика

| Элемент | Шрифт | Размер | Вес |
|---|---|---|---|
| Заголовки | Syne | 18–24px | 600–700 |
| Основной текст | DM Sans | 14px | 400 |
| Числа (вес, повторения) | JetBrains Mono | 16–28px | 500–700 |
| Метки, подписи | DM Sans | 11–12px | 400 |

### 6.3 Компоненты

- **Карточки** — полупрозрачные glass-карты с backdrop-blur, 1px border
- **Кнопки** — gradient fill для primary, ghost для secondary
- **Инпуты** — тёмные, borderless, с focus-glow
- **Таймер** — большие моноширинные цифры, круговой progress ring (SVG)
- **Bottom Nav** — 4 таба, фиксированная, glass-bg, active-dot сверху
- **Анимации** — fade-in при загрузке, stagger 50ms между элементами

---

## 7. ROADMAP (ФАЗЫ РАЗРАБОТКИ)

### Phase 1 — Foundation
- [ ] Project scaffold (index.html, manifest.json, файловая структура)
- [ ] Design tokens CSS
- [ ] IndexedDB wrapper (db.js)
- [ ] Service Worker (precache shell)
- [ ] PWA manifest + иконки

### Phase 2 — Core Stores
- [ ] workout.store.js — CRUD тренировок
- [ ] exercise.store.js — библиотека упражнений + предустановки
- [ ] settings.store.js — настройки пользователя
- [ ] templates.store.js — шаблоны тренировок

### Phase 3 — Local-First DB
- [ ] IndexedDB schema versioning (onupgradeneeded)
- [ ] Индексы для быстрого поиска (по дате, упражнению)
- [ ] Экспорт/импорт данных (JSON backup)
- [ ] Data integrity checks при загрузке

### Phase 4 — Views (Store → View Wiring)
- [ ] home.view.js — dashboard, быстрый старт
- [ ] workout.view.js — активная тренировка с set-input
- [ ] history.view.js — список/календарь прошлых тренировок
- [ ] exercise.view.js — каталог + добавление своих
- [ ] stats.view.js — графики прогресса
- [ ] nav.js — bottom navigation + routing

### Phase 5 — Timer & Notifications
- [ ] timer.js — таймер отдыха с круговым progress ring
- [ ] Notification API — push при завершении таймера
- [ ] navigator.vibrate — тактильная обратная связь
- [ ] visibilitychange handler — корректная работа в фоне
- [ ] navigator.mediaSession — инфо на lockscreen

### Phase 6 — PiP (Nice-to-have)
- [ ] pip.js — Canvas-Video hack для Android PiP
- [ ] Отображение: таймер + текущее упражнение + следующий подход
- [ ] 1 FPS captureStream (экономия батареи)
- [ ] mediaSession action handlers (play/pause → skip rest / next set)
- [ ] leavepictureinpicture cleanup

### Phase 7 — Polish & Extras
- [ ] Onboarding (первый запуск — выбор единиц, создание первого шаблона)
- [ ] Анимации перехода между views
- [ ] Haptic feedback на ключевых действиях
- [ ] Dark/darker theme toggle
- [ ] Performance audit (Lighthouse 95+)

---

## 8. НЕФУНКЦИОНАЛЬНЫЕ ТРЕБОВАНИЯ

| Требование | Цель | Метрика |
|---|---|---|
| Offline First | 100% функциональность без сети | 0 сетевых запросов при работе |
| Производительность | Мгновенный отклик | FCP < 1.5s, TTI < 2s |
| Размер | Лёгкое приложение | < 500KB total (без шрифтов) |
| Хранение | Данные в безопасности | IndexedDB persist, backup/restore |
| Батарея | Минимальный расход | Нет фоновых процессов (кроме таймера) |
| Совместимость | Основная платформа | Chrome Android 90+, Samsung Internet |
| Доступность | Базовая a11y | Touch targets 44×44, contrast 4.5:1 |

---

## 9. КРИТИЧЕСКИЕ РЕШЕНИЯ И TRADE-OFFS

### 9.1 Vanilla JS vs Framework
**Решение:** Vanilla JS  
**Почему:** Нет bundle size, нет build step, полный контроль. Для single-user PWA фреймворк — overkill. Если проект вырастет — миграция на Preact/Lit за пару дней.

### 9.2 IndexedDB vs localStorage
**Решение:** IndexedDB  
**Почему:** localStorage ограничен 5–10MB, синхронный, не поддерживает структурированные данные. IndexedDB — асинхронный, персистентный, индексируемый, подходит для тысяч записей.

### 9.3 PiP: Canvas Hack vs Notifications
**Решение:** Notification + vibrate в приоритете, PiP как Phase 6 nice-to-have  
**Почему:** PiP на Android = read-only, нет интерактивности, нестабильная поддержка. Notification + vibrate покрывает 90% юзкейса при 10% сложности. PiP добавим если реально нужен.

### 9.4 Сборщик: Vite vs None
**Решение:** Начинаем без сборщика (нативные ES modules)  
**Почему:** Проще деплой, нет node_modules. Переход на Vite тривиален если понадобится HMR или import CSS modules.

---

## 10. ДЕПЛОЙ

| Вариант | Плюсы | Минусы |
|---|---|---|
| **GitHub Pages** | Бесплатно, HTTPS, CI/CD через Actions | Нет серверной логики (не нужна) |
| **Netlify** | Бесплатно, HTTPS, redirects, preview deploys | Привязка к Netlify |
| **Локальный файл** | Максимальная приватность | Нет auto-update, нет HTTPS для SW |

**Рекомендация:** GitHub Pages или Netlify. Оба варианта бесплатны для статических PWA. У тебя уже подключён Netlify connector.

---

## 11. МЕТРИКИ УСПЕХА

| Метрика | Цель |
|---|---|
| Тренировок в неделю | Полное покрытие всех реальных тренировок |
| Время до начала записи | < 5 секунд от открытия до первого подхода |
| Сбоев / потерь данных | 0 |
| Lighthouse PWA score | 95+ |
| Размер приложения | < 500KB |
| Время на добавление подхода | < 3 секунды (вес + повторения + тап) |

---

## CHANGELOG

| Версия | Дата | Изменения |
|---|---|---|
| 1.0 | 2026-04-09 | Первая версия USPECS |
