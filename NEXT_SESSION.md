# NEXT SESSION — Athlete Pro

> Читать первым. **Роутер, а не состояние:** здесь указатель на карточку, контекст — в самом хендоффе.
> Обновлено 2026-08-14 (горячий путь доков урезан и загейчен, `npm run docs:budget`).

## Правило файла

**Числа и SHA здесь не хранятся** — они протухают от собственного мёржа. Добывать командой:

```bash
git fetch origin && git rev-parse --short origin/main   # где main
npm run preflight      # старт сессии
npm run inventory      # ревизия веток
npm run smoke:prod     # доехал ли релиз до прода
npm run docs:budget    # цена системных доков в токенах
```

Версия — `js/version.js`. Done — `CHANGELOG.md`. Правила — `CLAUDE.md`, дизайн — `.claude/rules/design.md`;
здесь они не дублируются: две копии = одна протухшая. **Строка роутера ≤200 символов** — разрослась
в пересказ, значит её место в хендоффе.

## Барьеры репозитория

- **Branch-protection на `main` нет** (приватный репо на free-плане). Держит `.githooks/pre-push`:
  блокирует пуш с целью `refs/heads/main`, обход `MAIN_PUSH_OK=1`. Пуш из одних удалений
  (`git push origin --delete`) выходит нулём до всех гардов — кода в нём нет.
- **Решение 2026-08-06, переоткрывать не нужно:** GitHub Pro не берём, публичным репо не делаем.
  Вместо запрета — видимость: `.github/workflows/main-watchdog.yml` заводит issue на коммит
  в `main` без зелёного CI или без связанного PR.
- **Зелёная галочка ≠ чеки прошли:** `combined status` бывает `success` от одного Vercel при нуле
  check-runs. Считать: `gh api repos/:owner/:repo/commits/<sha>/check-runs`.
- `delete_branch_on_merge` включён 2026-08-14 — мёржить `gh pr merge --rebase --delete-branch`.

## Куда идти за работой

| Хендофф | Следующая карточка |
|---|---|
| `docs/handoff/HANDOFF_boot_brand.md` → **SPLASH-1** | Активная фаза: запуск и знак. Дальше MOTION-1, порядок утверждён Gio. Не параллелить — три карточки из четырёх трогают `index.html` |
| `docs/handoff/HANDOFF_panda_core.md` | HUD-1..4 закрыты (1.27.56). Активных карточек нет — программа готова к полевому чеку Gio (радар и тон коуча на iPhone). |
| `docs/handoff/HANDOFF_intel_readiness.md` → **INTEL-1** | Session RPE. Порядок INTEL-1 → INTEL-3 → INTEL-4 не переставлять. Вход в следующую калибровку весов — в хендоффе |
| `docs/handoff/HANDOFF_gemini_audit_triage.md` → **PERF-1** | Разведка: сколько дадут бандл и 725 мс Style & Layout. Следом LEAK-1, SCAF-1, NOISE-1, PII-1. 🔴 За Gio: снести сервис на Render и отозвать `ANTHROPIC_API_KEY` |
| `docs/handoff/HANDOFF_light_theme.md` → **THEME-6** | 🟡 P2. Единственная контраст-проба слепа к теме по построению — нужна считающая фактический контраст в обеих темах |
| `docs/handoff/HANDOFF_design_system.md` → **SPACE-1 хвост → SCALE-1** | Хвост инлайнов в `js/`, затем гард шкал `--fs-*`/`--fw-*` в CI. Дальше NAV-BACK-1 + DEAD-1 |
| `docs/handoff/HANDOFF_field_check.md` | **За Gio, один заход.** Код на проде ждёт подписи по DoD-5. Флаги `fab-video` и `drum-window` включить заранее |
| `docs/handoff/HANDOFF_next_cards.md` → **DRUM-TOUCH-1** | **За Gio, один тап.** Барабан на iPhone: фикс на проде с 1.27.13, WebKit-половину закроет только телефон |
| `docs/handoff/HANDOFF_next_cards.md` | Стек карточек, открытый бэклог, DATA-SAFETY, решения за Gio |
| `docs/handoff/HANDOFF_gym_grade.md` | Программа GYM-GRADE, DoD из 5 пунктов |
| `docs/handoff/HANDOFF_isl_tail.md` | Островные хвосты, задачи Sonnet |
| `docs/handoff/HANDOFF_orchestration.md` | Роли LEAD/worker/verifier, DoD-лестница, правило прополки веток |
| `docs/handoff/HANDOFF_air_refactor.md` | AIR-хвост |

Вне хендоффов, заведено 2026-08-14 по программе DOCS:

- **DOCS-2 закрыта 2026-08-14** (вне репо) — хуки ≤62 симв. Сирот по индексу 49, реальных (с `[[wiki]]`) 9 — решение за Gio.
- **DOCS-3** — перевод горячего пути на английский. Условие: `docs/RULES.md` пересобрать человеческим договором (словарь, шаблон задачи, «Грабли»), а не зеркалом правил.
- **WEED-2** — прополка 253 локальных веток, 121 remote и 31 ворктри по порогу 30 дней.
- **FLOW-4** — TTL памяти, старт ≤7500 ток (сейчас 8955). FLOW-1/2/3 закрыты, гард — `docs/RULES.md`.

## Порядок взятия

- **Дизайн:** NAV-BACK-1 + DEAD-1 не параллелить со SPACE-1/SCALE-1 — общий `css/base.css`.
- **Аналитика:** **AN-2** (разрез по упражнению) → AN-3 (время в зале, `periodRange()` уже есть) → OVW-1. После стека — роадмап CRDT foundation.
- **Вне очереди:** NAV-1 (потеря тапа в быстрой серии), NAV-2 (`s-intel` мимо конвенции выхода).

## Технические заметки

- **Запуск:** `npm run dev` → :3000 (порт 3000 = Gio, 3001 = Claude preview). Телеметрия — `scripts/telemetry-server.mjs --lan`; `server.js` отладочными стабами не подменять.
- **Тесты:** `npm test` = unit+integration; `npx playwright test` — e2e отдельно и **на тёплом сервере** (холодный или зомби на :3000 → флаки goto-таймаутов).
- **SW:** `ASSETS` и `CACHE_NAME` только через `npm run build:sw`, ручной `vNNN` не нужен. Хеш платформо-независим: повторный прогон на любой ОС обязан давать пустой дифф. Забыть пересборку молча нельзя — краснеет `test/sw-cache-name.test.js`.
- **lhci гонять ТОЛЬКО из worktree** — корневой чекаут даёт фейковые цифры.
- **Прод:** Vercel-проект `gio-g7/athlete-pro-v7` (алиас athlete-pro-v7.vercel.app), git-репо athlete-pro-v2, деплой с `main`.
- **Git в worktree:** после убитой по таймауту команды git может висеть (pager держит tty) — `GIT_PAGER=cat` и `</dev/null`.
