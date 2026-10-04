# DEPLOYMENT — Athlete Pro

> Как проект попадает на прод и как убедиться, что он туда доехал.
> Версии, числа тестов и SHA здесь не хранятся — протухают от собственного мёржа.
> Актуальная версия — `js/version.js`, история — `CHANGELOG.md`.

## Прод

Единственная площадка — **Vercel**, проект `gio-g7/athlete-pro-v7`,
адрес `https://athlete-pro-v7.vercel.app`.

Деплой автоматический: мёрж в `main` → Vercel собирает и выкатывает сам.
Ручных шагов нет, CLI не нужен.

Конфигурация — `vercel.json`. Устроена нестандартно, и это осознанно: **весь трафик,
включая статику, идёт через `server.js`** (`routes: [{ src: "/(.*)", dest: "/server.js" }]`),
а фронтовые файлы едут в лямбду списком `includeFiles`. Причина — заголовки кеша:
`index.html` и `js/version.js` обязаны отдаваться без валидаторов, иначе клиенты
морозятся на 304 (разбор — `docs/_archive/HANDOFF_releases_1.25.x.md`).

Фронтового билд-степа нет вообще: vanilla ESM едет как есть. `npm run build` — это
только `build:sw` (генерация списка прекеша в `sw.js`), и его гоняют **до** коммита,
а не на Vercel.

Других площадок нет. Render не используется (манифест удалён карточкой WEED-1),
Railway и self-hosted никогда не заводились.

## Переменные окружения

Задаются в дашборде Vercel, в репозитории не хранятся. Полный список с комментариями —
`.env.example`; он же источник правды, здесь не дублируется.

Минимум для боевого режима: `ANTHROPIC_API_KEY` **или** `GOOGLE_GENERATIVE_AI_API_KEY` —
приложение работает и без них, просто без AI-коуча. `NODE_ENV=production` Vercel
проставляет сам.

**Ключи в код не попадают никогда** — фронт ходит только в свой бэкенд-прокси
(`routes/coach.js`), BYOK-ключ пользователя живёт в его браузере и не синкается
(`js/shared/sync-secrets.js`).

## ИИ-тренер

Без серверного ключа приложение живое, но облачный коуч молчит. Чтобы он отвечал
на проде:

1. Vercel → проект `athlete-pro-v7` → Settings → Environment Variables →
   Production: `ANTHROPIC_API_KEY` **или** `GOOGLE_GENERATIVE_AI_API_KEY`.
   Значения в репозиторий не класть. После сохранения — Redeploy, иначе лямбда
   держит старое окружение.
2. Проверка **не из airgap**. Новая установка по умолчанию в airgap: service
   worker отвечает на `/api/*` кодом 503 с телом `{"code":"airgap"}`. Это не
   «ключей нет», это сеть закрыта. Переключить приватность на Cloud (или
   открыть `/api/ai-status` в инкогнито без установленного SW).
3. Ожидаемый ответ: HTTP 200 и JSON `{"anthropic":true}` либо `{"gemini":true}`.
   Оба `false` при 200 — переменная не подхватилась или это placeholder
   `your-…`.
4. В приложении движок по умолчанию — Gemini (`gemini-3.6-flash`). Профиль →
   индикатор Gemini зелёный, либо локальный BYOK в том же экране. Приватность
   Cloud (новичок в airgap). Тап по панде на пустом доме открывает P.A.N.D.A. Core.

Render не используется (манифест снят карточкой WEED-1). Старый ключ с Render,
если он ещё жив в кабинете Anthropic, отозвать отдельно — это не шаг деплоя.

## Supabase keep-alive

Free-проект Supabase паузится, если за неделю получил мало активности базы
([Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing)).
Клиент тут не поможет: дефолт приватности airgap. Активность держит
`.github/workflows/supabase-keepalive.yml`: два прогона в сутки, в каждом три
записи сердцебиения через `POST /rest/v1/rpc/keepalive_ping` с anon-ключом.
Секреты репозитория: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

Функция и таблица создаются руками, один раз (миграций Supabase в репо нет):

1. Supabase Dashboard → проект → SQL Editor → New query → вставить
   `supabase/keepalive.sql` целиком → Run. Повторный запуск безопасен.
2. GitHub → Actions → Supabase keep-alive → Run workflow (или
   `gh workflow run supabase-keepalive.yml --ref main`).
3. Успех в логе шага «Пинг Supabase»: `роль anon` и три строки
   `Пинг N/3: HTTP 200, ответ ~35 байт`. Открытый issue «Supabase keep-alive: …»
   закроется сам.

Провал краснит прогон и заводит issue с диагнозом одной строкой:

- «SQL ещё не применён» (HTTP 404) — шаг 1 не сделан или откатан.
- «проект, вероятно, уснул» (HTTP 000/5xx) — Dashboard → проект → Resume project,
  затем шаг 2.
- «отверг вызов» (HTTP 401/403) — сверить `SUPABASE_ANON_KEY` с Settings → API Keys
  и повторить шаг 1 (grant для anon).

Откат — два `drop` из шапки `supabase/keepalive.sql`; workflow после этого
вернуть к прежней версии или выключить, иначе он краснеет с 404.

## Перед мёржем

```bash
npm run preflight    # git-email, node_modules, свежесть базы, свои невлитые ветки
npm test             # unit + integration
npm run lint         # eslint + stylelint, 0 errors
npx playwright test  # e2e, отдельно — не через node --test
```

Бамп версии при стабильном мёрже: `js/version.js` + `package.json` + `package-lock.json`
синхронно (проще всего `npm install` — перепишет lock сам), затем **обязательно**
`npm run build:sw`. Сторожат `test/version-sync.test.js` и гард `sw.js`.

Вливать только через PR в `main` — прямой пуш блокирует `.githooks/pre-push`.

## После мёржа — доехало ли

```bash
npm run smoke:prod                 # exit != 0 = не доехал
npm run smoke:prod -- --wait 180   # поллить, пока Vercel докатывает
```

Проверяет пять вещей: `VERSION` на проде совпал с репом · `js/version.js` отдаётся
без ETag/Last-Modified · `/` без валидаторов · `/assets/*` наоборот кешируются и дают
304 · `CACHE_NAME` в `sw.js` совпал.

**Гнать только из ветки с бампом.** Скрипт сравнивает прод с **локальным** `js/version.js`,
а не с `main`: из старого чекаута даст ложное «не доехал», из непобампленного — ложное
«доехал». Смотреть строку `local:` в выводе.

Другой адрес — первым аргументом: `node scripts/smoke-prod.mjs https://staging.example.app`.

## Откат

Vercel → Deployments → выбрать предыдущий → Promote to Production.
Через git — revert-коммит и обычный PR; прямой force-push в `main` запрещён.
