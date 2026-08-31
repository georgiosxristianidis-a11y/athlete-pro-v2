/**
 * `git` для синтетических репозиториев в тестах. Отличие от голого
 * `execFileSync` ровно одно: падение НАЗЫВАЕТ прерванный прогон, если это был он.
 *
 * ЗАЧЕМ. 2026-08-30 два прогона `npm test` подряд дали «падения» в
 * `session-guard`, `drift-donor-guard` и `preflight-base-guard` — каждый раз
 * РАЗНЫЙ набор кейсов, а те же файлы по отдельности зеленели. Читалось как
 * гонка за общим ресурсом: общий temp, общий чекаут, `.git/index.lock`.
 * Гонки не было. Прогон прерывали (Ctrl-C, таймаут инструмента, Esc), SIGINT
 * уходил всей группе процессов и убивал `git`, которого тест в этот момент
 * звал в setup. `git push` в песочнице отвечал на это `fatal: Could not read
 * from remote repository`, `execFileSync` бросал, и node:test честно рисовал
 * `not ok` — при `# cancelled 0` и внешне нормальной сводке. Отличить это от
 * настоящего падения по тексту было нельзя, и разбор стоил сессии.
 *
 * Красными эти файлы становятся первыми не случайно: они самые медленные в
 * сюите (клон, коммиты, push, у донорских — ещё и fetch всей истории проекта),
 * поэтому в момент прерывания почти всегда в полёте именно они.
 *
 * ЧТО ЗДЕСЬ НЕ ДЕЛАЕТСЯ. Ошибка не глушится и не превращается в skip: тест
 * остаётся красным. Меняется только текст — чтобы следующий, кто это увидит,
 * перегнал прогон целиком, а не искал гонку, которой нет.
 *
 * Заодно одна копия обёртки вместо пяти байт-в-байт одинаковых.
 */
import { execFileSync } from 'node:child_process';

/** Windows: код выхода консольного процесса, убитого Ctrl-C (STATUS_CONTROL_C_EXIT). */
const CONTROL_C_EXIT = 0xc000013a;

const HINT =
  'Прогон прерывали (Ctrl-C, таймаут инструмента, Esc)? Тогда это не падение теста:\n' +
  'сигнал уходит всей группе процессов и убивает git прямо в setup. Судить только по\n' +
  'завершённому прогону — перегнать файл целиком: node --test <файл>.';

/**
 * Тот же контракт, что у `execFileSync`: возвращает stdout без хвостовых
 * пробелов, бросает на ненулевом коде.
 * @param {string[]} args
 * @param {{ cwd?: string }} [opts]
 */
export function sandboxGit(args, opts = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    }).trim();
  } catch (err) {
    const killed = Boolean(err?.signal) || err?.status === CONTROL_C_EXIT;
    const where = opts.cwd ? ` (песочница ${opts.cwd})` : '';
    const stderr = String(err?.stderr || '').trim();
    throw new Error(
      `git ${args.join(' ')}${where} — код ${err?.status ?? '?'}${err?.signal ? `, сигнал ${err.signal}` : ''}\n` +
        (stderr ? `${stderr}\n\n` : '\n') +
        (killed ? 'Прогон прерван сигналом — это не падение теста, перегнать целиком.' : HINT),
      { cause: err },
    );
  }
}

/** Каррированная форма для песочницы: `const g = sandboxGitIn(work); g('add', '-A')`. */
export const sandboxGitIn =
  (cwd) =>
  (...args) =>
    sandboxGit(args, { cwd });
