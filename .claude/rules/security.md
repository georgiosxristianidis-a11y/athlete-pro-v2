---
description: Протокол security-auditor — уязвимости, секреты, зависимости, соответствие модели угроз.
---

# Security auditor

Когда просят аудит, `/review-security`, или открывают это правило — сначала
`docs/THREAT_MODEL.md`, затем этот файл. Конвенции кода (`esc()`, helmet+CSP,
ключи только через бэкенд) — `.claude/rules/architecture.md`. Процесс — `CLAUDE.md`.

## Scope

По умолчанию — diff к `origin/main` (коммиты ветки + рабочее дерево). Полную
поверхность — только если явно попросили. Не чинить находки и не писать эксплойты,
пока не попросили отдельно.

## Что смотреть (OWASP × этот репозиторий)

| Класс | Где в Athlete Pro |
|---|---|
| XSS (A03) | любой `innerHTML` с данными без `esc()` / `html()` из `js/shared/utils.js`. `t()` подставляет `{param}` сырьём — результат в DOM тоже экранировать |
| Access (A01) | `routes/`, `lib/aiOrchestrator.js` — объект по id из запроса без проверки владельца |
| Crypto (A02) | секреты в репо, слабый hash, `Math.random` для токенов, BYOK на фронте |
| Injection (A03) | `child_process` / шаблон SQL в `scripts/`, `server.js`, `routes/` |
| Design (A04) | дорогой маршрут без лимитера: `express-rate-limit` стоит в `server.js`, `routes/coach.js`, `routes/integrations.js` — новый ИИ- или verify-эндпоинт без него это находка. `trust proxy` = 1 обязателен, иначе лимитер считает IP балансировщика, а не клиента |
| Misconfig (A05) | CSP/helmet в `server.js`, CORS `*`, debug в проде |
| Deps (A06) | `npm audit --omit=dev` — блок только High/Critical production (как pre-push) |
| Auth (A07) | ключи провайдеров, пароль в query, JWT `alg=none` |
| Integrity (A08) | импорт бэкапа `js/db/backup.js`, merge `js/shared/sync-merge.js` (prototype pollution — структурно, не фильтром), политика кэша `sw.js` |
| Logging (A09) | password/token/weight в логах |
| SSRF (A10) | URL из пользователя в `fetch` в обход `safeFetch()` из `js/privacy.store.js` |
| GDPR | экспорт/`openDataPassport`, удаление/`DB.clearAll`, согласие, дефолт airgap в `js/privacy.store.js` |
| SW cache | не кэшировать `set-cookie` / `no-store`; `legal/` не в прекеше |

Секреты этого стека, а не из шаблона: `ANTHROPIC_API_KEY` (`sk-ant-…`),
`GOOGLE_GENERATIVE_AI_API_KEY` и `FIREBASE_API_KEY` (`AIza…`), `SUPABASE_ANON_KEY` (JWT
`eyJ…`), PEM. Читать их можно только на бэкенде — `lib/geminiClient.js`, `routes/coach.js`,
`routes/integrations.js`; значение в `js/` или в тесте = находка. Исключение —
`SUPABASE_ANON_KEY`: публичен по дизайну, критичен на его месте `service_role`.
Сканера секретов в CI нет, поэтому по диффу смотреть глазами.

## Отчёт

Таблица: Severity · Location (`file:line`) · Finding. Сверху вниз: critical → high →
medium → low. У каждой строки — одно предложение «как закрыть», без PoC.

Ложные срабатывания отсекать: словарь `t('key')` без params — не XSS, пока ключ
из кода; `innerHTML` с литералом SVG — не XSS. Нарушение закона `esc()` при
данных всё равно фиксировать.

Гейт не заменяет аудит: `eslint-plugin-security` на warn, `test/security-utils.test.js`
кроет хелпер, не все вызовы.
