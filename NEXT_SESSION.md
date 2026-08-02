# NEXT SESSION — Athlete Pro

> Читать первым. Это **роутер**, а не свалка состояния: здесь только точка входа и указатели.
> Обновлено 2026-08-02 (разбор god-object: 184 строки → роутер).

## Правило файла

**Числа и SHA здесь не хранятся** — они протухают от собственного мёржа (корень R4).
Файл дважды поймали на лжи: заявлял VERSION 1.25.19 и «355 тестов» при 1.25.62 в main,
а в тех-заметках рядом лежало «273 теста» и `SW v113`. Добывать командой:

```bash
git fetch origin && git rev-parse --short origin/main   # где main
npm run preflight                                        # старт сессии
npm run inventory                                        # ревизия веток
npm run smoke:prod                                       # доехал ли релиз до прода
```

Актуальная версия — `js/version.js`. Done-история — `CHANGELOG.md`.

## Правила работы

Живут в `CLAUDE.md` (мульти-агентный протокол · закон структуры · Session Protocol ·
анти-хрупкий workflow · влитие через PR в main). Дизайн-спек и инварианты AIR —
`.claude/rules/design.md`, грузится автоматически при работе с `css/**` и `*.view.js`.
Здесь они больше не дублируются: две копии правил = одна из них протухшая.

**Точка интеграции одна: `origin/main`.** Долгоживущий trunk упразднён (O-3) и удалён;
бэкап линии — тег `backup-trunk-6b4f80b`. main защищён branch-protection (`test` + `e2e`
+ enforce_admins), прямой push отклоняется: `gh pr create --base main` → зелёные чеки →
`gh pr merge --rebase`.

## Куда идти за работой

| Хендофф | Что внутри |
|---|---|
| `docs/handoff/HANDOFF_field_check.md` | **За Gio, один заход.** Карточки с кодом на проде, ждут подписи по DoD-5. Список А — дома до зала, Б — в зале. Перед заходом включить флаги `fab-video` (Профиль → AI) и `drum-window` (консоль) |
| `docs/handoff/HANDOFF_next_cards.md` | Стек карточек + открытый бэклог + DATA-SAFETY + решения за Gio |
| `docs/handoff/HANDOFF_design_system.md` | Дизайн-система: иерархия · отступы · движение · отклик |
| `docs/handoff/HANDOFF_gym_grade.md` | Программа GYM-GRADE, DoD из 5 пунктов |
| `docs/handoff/HANDOFF_isl_tail.md` | Островные хвосты, задачи Sonnet |
| `docs/handoff/HANDOFF_orchestration.md` | Роли LEAD/worker/verifier, DoD-лестница, правило прополки веток |
| `docs/handoff/HANDOFF_air_refactor.md` | AIR-хвост |
| `docs/_archive/HANDOFF_releases_1.25.x.md` | Закрытые разборы релизов (304-заморозка, panda-idle, аудит-консолидация, серия F-*) |

## Порядок взятия (утверждён Gio — минимум конфликтов по файлам)

TYPE-2 (`dashboard.css`, ни с чем не дерётся) → **PP-3** (профиль + Athlete Room) →
**SPACE-1** (`profile.css`, вбирает profile-hero-spacing) → **NAV-BACK-1 + DEAD-1**
(одно окно на двоих: общий `base.css`, отдельные коммиты) → GUARD-1 (закрывающая).

PP-3 строго ДО SPACE-1: она меняет состав бенто, ритм выравнивается по финальному составу.
NAV-BACK-1 не параллелить с TYPE-2/SPACE-1 — общий `base.css`.

Дальше по очереди аналитики: **AN-2** (разрез по упражнению — тап открывает историю лифта),
затем AN-3 (время в зале; инфраструктура периода уже есть в `analytics.store.js` `periodRange()`),
OVW-1. После стека — роадмап CRDT foundation (`docs/ROADMAP_elite_athlete-pro.md`).

## Технические заметки

- **Запуск:** `npm run dev` → :3000 (порт 3000 = Gio, 3001 = Claude preview). Телеметрия — `scripts/telemetry-server.mjs --lan`; `server.js` отладочными стабами не подменять.
- **Тесты:** `npm test` = unit+integration; `npx playwright test` — e2e отдельно и **на тёплом сервере** (холодный или зомби на :3000 → флаки goto-таймаутов).
- **SW:** ASSETS и `CACHE_NAME` только через `npm run build:sw` — `CACHE_NAME` авто-бампится контент-хешом манифеста, ручной `vNNN` не нужен.
- **lhci гонять ТОЛЬКО из worktree** — корневой чекаут даёт фейковые цифры (кейс perf 61, 2026-07-18).
- **Прод:** Vercel-проект `gio-g7/athlete-pro-v7` (алиас athlete-pro-v7.vercel.app), git-репо athlete-pro-v2, деплой с `main`.
- **Git в worktree:** после убитой по таймауту команды git может висеть (pager держит tty) — `GIT_PAGER=cat` и `</dev/null`.
