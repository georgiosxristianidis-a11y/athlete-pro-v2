/**
 * Вердикт по secret scanning репозитория — вынесен из preflight, чтобы был тестируемым
 * (карточка AUD-17a; тот же приём, что `main-protection.mjs`).
 *
 * Репозиторий публичный. Push protection — единственный барьер, который не даёт секрету
 * провайдерского формата уехать в историю, и выключается он одной галкой в Settings без
 * следа в ежедневной работе. Поэтому preflight спрашивает сам GitHub каждую сессию:
 * `gh api repos/{owner}/{repo}` → `.security_and_analysis` (только GET).
 *
 * Уровни — как у соседнего сторожа дефолт-ветки:
 *   - сети/gh нет, запрос не прошёл, ответ не распарсился → WARN-пропуск (сессию не блокируем);
 *   - `security_and_analysis` в ответе нет → WARN: GitHub отдаёт поле только тем, у кого
 *     есть админ-права на репо, — это «не видно», а не «выключено»;
 *   - поле видно, но `secret_scanning` или `secret_scanning_push_protection` не `enabled`
 *     (в т.ч. подполя нет) → FAIL: настройку видим, и она не та.
 *
 * `non_provider_patterns` и `validity_checks` намеренно не требуются: на замере 2026-11-09
 * они disabled, включать — развилка Gio, а не побочный эффект сторожа.
 */

/** Подполя `security_and_analysis`, без которых preflight красный. */
export const REQUIRED_SECRET_SETTINGS = ['secret_scanning', 'secret_scanning_push_protection'];

/**
 * @typedef {{ level: 'OK'|'WARN'|'FAIL', msg: string, hint?: string }} Verdict
 */

/**
 * @param {string|null} raw — тело ответа GitHub на `repos/{owner}/{repo}`,
 *   либо null, если запрос не прошёл (оффлайн, нет прав, gh упал).
 * @returns {Verdict}
 */
export function judgeSecretScanning(raw) {
  if (!raw) {
    return { level: 'WARN', msg: 'GitHub не ответил — проверка пропущена' };
  }

  let repo;
  try {
    repo = JSON.parse(raw);
  } catch {
    return { level: 'WARN', msg: 'ответ GitHub не распарсился — проверить руками' };
  }

  const sa = repo?.security_and_analysis;
  if (!sa || typeof sa !== 'object') {
    return {
      level: 'WARN',
      msg: 'security_and_analysis не видно (нужны админ-права на репо) — проверка пропущена',
    };
  }

  const off = REQUIRED_SECRET_SETTINGS.filter((k) => sa[k]?.status !== 'enabled').map(
    (k) => `${k}=${sa[k]?.status ?? '(нет поля)'}`
  );
  if (off.length) {
    return {
      level: 'FAIL',
      msg: `защита от утечки секретов выключена: ${off.join(', ')}`,
      hint: 'Settings → Code security → Secret Protection + Push protection → Enable (репо публичный)',
    };
  }

  return { level: 'OK', msg: 'secret scanning + push protection включены' };
}
