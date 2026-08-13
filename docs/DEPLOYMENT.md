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
