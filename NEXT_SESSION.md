# NEXT SESSION — Athlete Pro

> Читать первым. Это **роутер**, а не свалка состояния: здесь только точка входа и указатели.
> Обновлено 2026-08-04 (PR #129: гейт длины CLAUDE.md, root-cause-first, запрет пуша в main — см. ниже правку про branch-protection).

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
бэкап линии — тег `backup-trunk-6b4f80b`. **Branch-protection на main НЕТ** — проверено
2026-08-04: `gh api repos/.../branches/main` отдаёт `protected: false` (`.../protection`
даёт 403, приватный репо на бесплатном плане её не поддерживает). Единственный барьер —
`.githooks/pre-push` (блокирует push на ветку `main`, обход `MAIN_PUSH_OK=1`) плюс
дисциплина: `gh pr create --base main` → зелёные чеки → `gh pr merge --rebase`. Хук живёт
в корневом чекауте (`core.hooksPath` абсолютный) — протухший корень его молча выключает
у всех worktree разом, см. CLAUDE.md § Multi-Agent Protocol.

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
| `docs/_archive/HANDOFF_load_perf.md` | Закрыта — программа LOAD, все 8 карточек взяты (1.27.2–1.27.6): ленивый CSS · modulepreload · логотип статус-бара · сжатие иконок · фильтр прекеша (`.d.ts` + неиспользуемые шрифтовые подмножества) · `/__build` только на localhost/LAN |

## Порядок взятия (утверждён Gio — минимум конфликтов по файлам)

**PP-3 ✅ и SPACE-1 заход №1 (`profile.css`) ✅ взяты (1.25.55/1.25.56).** TYPE-2 доехала
до `dashboard.css`, `analytics.css` и `workout.css` (1.25.54/1.25.57/1.27.7) — детали и
статус по файлам в `docs/handoff/HANDOFF_design_system.md`, эта строка их не дублирует,
чтобы не повторить протухание 2026-08-04 (карточки уже закрыты, а роутер ещё звал их
«следующими»).

**TYPE-2 заходы №5 и №6 взяты** (`athlete-room.css`; затем `privacy`/`summary`/`dynamic-island`/`claude` одним заходом).
Осталось довести один заход.

Следующая — **TYPE-2 заход №7** (`css/intel.css` + инлайны в `js/`, ни с чем не дерётся; в карточке
уже лежит снятый объём и три ловушки — разведку не переделывать) → SPACE-1 заход №2
(`css/dashboard.css`, свободен параллельно — разные файлы) → **NAV-BACK-1 + DEAD-1**
(одно окно на двоих: общий `base.css`, отдельные коммиты) → GUARD-1 (закрывающая, только
после того как TYPE-2 и SPACE-1 пройдут все файлы).

Отдельно и вне этой очереди — **O-8** (`HANDOFF_orchestration.md` § 5a): гарда на протухший
`CACHE_NAME` нет вообще (`grep -rln CACHE_NAME test/` пуст), и ни гейт, ни прод-смоук эту
протухшесть не ловят по построению. Инфраструктурная, с дизайн-очередью не конфликтует.

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
