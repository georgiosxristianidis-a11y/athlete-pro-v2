/**
 * Вердикт по server-side защите `main` — вынесен из preflight, чтобы был тестируемым.
 *
 * До 2026-08-19 preflight знал два состояния: «защита есть и полная» или FAIL.
 * Третьего — «защита есть, но потолок `enforce_admins` снят сознательно» — не было,
 * и включение урезанного набора дало бы вечный красный FAIL. Вечный FAIL дороже
 * отсутствия проверки: отчёт перестают читать целиком (та же логика, что в ветке
 * `planGated` у вызывающего).
 *
 * Почему потолок снят намеренно, а не по забывчивости. 2026-08-19 с 13:12 до 15:49 UTC
 * ни один job не получал раннера: у всех `steps: []`, длительность 2-3 с, логов нет
 * (`log not found`), прогон 32260684425 провисел в очереди 74 минуты и отказал разом.
 * С `enforce_admins: true` обязательные чеки в такое окно не репортятся НИКОГДА —
 * значит `main` не мёржится вообще и обойти это некому. Потолок снят, чтобы у аварии
 * на стороне GitHub был выход; барьер при этом остаётся — красный чек по-прежнему
 * закрывает кнопку мёржа, админу нужно осознанно её переехать.
 *
 * Цена решения названа прямо: preflight больше НЕ кричит FAIL, если потолок снимут
 * молча. Этот сигнал не потерян, он переехал в `.github/workflows/main-watchdog.yml`,
 * который ловит уже случившийся мёрж мимо ворот и заводит issue. То есть сторож после
 * включения защиты нужнее, чем был: он и есть журнал использования админского обхода.
 *
 * ОБНОВЛЕНИЕ 2026-08-20: решением Gio потолок ВКЛЮЧЁН — корень той аварии (`push: ['**']`)
 * починен PR#229, и сценарий, ради которого оставляли обход, закрыт. Логика ниже не меняется:
 * WARN остаётся, но теперь означает не «так задумано», а регрессию — потолок кто-то снял.
 * Штатный путь снять его в новой аварии — руками и осознанно:
 * `gh api -X DELETE repos/:owner/:repo/branches/main/protection/enforce_admins`, вернуть POST-ом.
 *
 * Обязательные чеки остаются жёстким требованием (FAIL): именно их отсутствие пустило
 * 1.27.24 и 1.27.25 в main при нуле check-runs, когда `combined status` был `success`
 * от одного Vercel.
 */

/**
 * Чеки, без которых защита считается дырявой. `drift` сюда намеренно не добавлен:
 * список отвечает за то, что проверка ТЕСТИРУЕТ КОД, и расширять его — отдельное
 * решение, а не побочный эффект правки про потолок.
 */
export const REQUIRED_CHECKS = ['test', 'e2e'];

/**
 * @typedef {{ level: 'OK'|'WARN'|'FAIL', msg: string, hint?: string }} Verdict
 */

/**
 * @param {string|null} raw — тело ответа GitHub на `branches/main/protection`,
 *   либо null, если запрос не прошёл (404 «Branch not protected», нет прав, оффлайн).
 * @returns {Verdict}
 */
export function judgeProtection(raw) {
  if (!raw) {
    return {
      level: 'FAIL',
      msg: 'branch protection ОТКЛЮЧЕНА (или нет прав её видеть)',
      hint: `Settings → Branches → main: required checks ${REQUIRED_CHECKS.join('+')}`,
    };
  }

  let prot;
  try {
    prot = JSON.parse(raw);
  } catch {
    return { level: 'WARN', msg: 'ответ GitHub не распарсился — проверить руками' };
  }

  const checks = prot.required_status_checks?.contexts ?? [];
  const missing = REQUIRED_CHECKS.filter((c) => !checks.includes(c));
  if (missing.length) {
    return {
      level: 'FAIL',
      msg: `нет обязательных чеков: ${missing.join(', ')}`,
      hint: 'Settings → Branches → main — вернуть как было',
    };
  }

  if (!prot.enforce_admins?.enabled) {
    return {
      level: 'WARN',
      msg:
        `чеки [${checks.join(', ')}] на месте, потолок enforce_admins снят — ` +
        'админский обход оставлен как выход из аварии раннеров',
      hint: 'обход не бесплатный: сторож main заведёт issue на мёрж мимо зелёных чеков',
    };
  }

  return { level: 'OK', msg: `чеки [${checks.join(', ')}] + enforce_admins` };
}
