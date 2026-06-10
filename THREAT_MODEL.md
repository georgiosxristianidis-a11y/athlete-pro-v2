# Модель Угроз (Threat Model) Athlete Pro

## 1. Контекст Архитектуры
Athlete Pro — это **Offline-first** PWA приложение, использующее:
- **Frontend**: Vanilla JS (ESM), Service Workers, IndexedDB.
- **Backend**: Node.js (Express) с ограниченным API (в основном для связи с AI и интеграциями).
- **Storage**: IndexedDB (клиент), Supabase / Firebase (для опциональной облачной синхронизации).

## 2. Поверхность Атаки (Attack Surface)
1. **DOM и Пользовательский Ввод**: инъекции через вредоносные названия тренировок или ответы от AI.
2. **Локальное Хранилище (IndexedDB)**: кража PII (метрик, веса) при физическом доступе к разблокированному устройству или вредоносными расширениями браузера.
3. **API Endpoints**: DDoS-атаки или исчерпание лимитов (Billing Exhaustion) на эндпоинтах взаимодействия с Claude/Gemini.
4. **Service Worker**: Web Cache Poisoning.
5. **Цепочка Поставок (Supply Chain)**: уязвимости в сторонних NPM пакетах.

## 3. Идентифицированные Угрозы и Меры Противодействия

| Угроза | Описание | Вектор | Принятые Меры (Mitigation) |
| :--- | :--- | :--- | :--- |
| **XSS (Cross-Site Scripting)** | Внедрение зловредных скриптов в интерфейс | DOM `innerHTML`, Markdown Parsing | 1. Использование утилиты `esc()` для экранирования.<br>2. Строгий CSP (запрет `unsafe-inline` скриптов).<br>3. Линтер `eslint-plugin-security`. |
| **Prototype Pollution** | Внедрение вредоносных прототипов при слиянии данных | JS Objects | Использование `safeDeepMerge`, блокирующего ключи `__proto__`, `constructor`. |
| **Data Exposure (Data at Rest)** | Кража метрик из IndexedDB | Physical Access, Browser Exploits | AES-256-GCM шифрование PII-данных (Metrics) через фоновый Web Worker перед записью в IndexedDB. |
| **API Abuse (DDoS / Billing)** | Массовые запросы к API с целью исчерпания баланса LLM | Network | Внедрен `express-rate-limit` на глобальные `/api/` и жесткие лимиты на маршруты `/api/coach/`. |
| **Web Cache Poisoning** | Внедрение вредоносных ответов в кэш Service Worker | Network / Proxy | Service Worker настроен не кэшировать запросы с заголовками `set-cookie` или `no-store`. |
| **Supply Chain Attacks** | Использование уязвимых NPM зависимостей | Build | Интеграция `npm audit` в pre-commit или CI/CD пайплайны. |

## 4. Остаточные Риски (Residual Risks)
- **Компрометация AI Провайдера**: если API Claude/Gemini будет взломано и начнет присылать вредоносные Markdown блоки, система полагается исключительно на нашу локальную санацию (`esc()`). Необходимо постоянно поддерживать актуальность санации.
- **Physical Device Takeover**: Полный захват разблокированного телефона. AES-ключ хранится сессионно или в устройстве, поэтому полный дамп памяти может его скомпрометировать (принятый риск для PWA).

*Документ обновляется по мере появления новых фич.*
