#!/usr/bin/env node
// Гард дрейфа базы — блокирует push ветки, написанной по коду, которого в main уже нет.
//
// Кейс PP-6 (2026-07-29): ветка отросла от main 28 июня и пролежала 233 коммита.
// За это время js/profile.js в main переписали 8 коммитов: приватность уехала в
// s-island-settings (ISL-SET), типографика переехала на токены (TYPE-1), появилась
// заплатка скролла (PP-5). Агент честно сделал работу, честно проверил в браузере и
// честно получил зелёный гейт — но всё это по июньскому файлу. Влитие откатило бы
// четыре влитых карточки.
//
// Почему не хватило существующих проверок:
//   - preflight ловит отставание, но это WARN, он не блокирует и тонет среди
//     80+ строк про невлитые ветки; к тому же он про старт сессии, а не про push;
//   - pre-push гонял SCA+SAST — обе зелёные, потому что смотрят на уязвимости и
//     стиль, а не на актуальность кода. «Гейт прошёл» звучало как «всё хорошо».
//   - npm test был зелёный на 211 тестах, когда в main их 385: половину сюиты
//     ветка просто не содержала. Зелёный на неполной сюите — не зелёный.
//
// Что проверяем: не расстояние до main (отставание само по себе безобидно), а
// ПЕРЕСЕЧЕНИЕ — файлы, которые правил ты И которые с тех пор изменились в main.
// Пустое пересечение = ребейз механический, пуш безопасен. Непустое = ты писал
// поверх кода, которого в main уже нет.
//
// Оффлайн — не блокирует (WARN на последнем известном origin/main).
// Осознанный обход: DRIFT_OK=1 git push.

import { execFileSync } from 'node:child_process';

const MAIN = 'origin/main';

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

if (process.env.DRIFT_OK === '1') {
  console.log(yellow('⚠️  [Drift] Проверка дрейфа отключена через DRIFT_OK=1.'));
  process.exit(0);
}

const branch = tryGit(['rev-parse', '--abbrev-ref', 'HEAD']);
if (!branch || branch === 'HEAD') {
  console.log(green('✅ [Drift] Detached HEAD — проверка пропущена.'));
  process.exit(0);
}
if (branch === 'main') {
  console.log(green('✅ [Drift] Сессия на main — проверять нечего.'));
  process.exit(0);
}

// Свежий origin/main. Оффлайн — работаем по последнему известному, но честно об этом говорим.
let offline = false;
try {
  execFileSync('git', ['fetch', '--quiet', 'origin', 'main'], {
    stdio: ['ignore', 'ignore', 'ignore'],
    timeout: 20_000,
  });
} catch {
  offline = true;
}

if (!tryGit(['rev-parse', '--verify', `${MAIN}^{commit}`])) {
  console.log(yellow('⚠️  [Drift] origin/main недоступен — проверка пропущена.'));
  process.exit(0);
}

const base = tryGit(['merge-base', 'HEAD', MAIN]);
if (!base) {
  console.log(yellow('⚠️  [Drift] Общий предок с origin/main не найден — проверка пропущена.'));
  process.exit(0);
}

const behind = Number(tryGit(['rev-list', '--count', `HEAD..${MAIN}`]) || 0);
if (behind === 0) {
  console.log(green('✅ [Drift] Ветка отросла от свежего origin/main.'));
  process.exit(0);
}

const list = (range) => {
  const out = tryGit(['diff', '--name-only', range]);
  return out ? out.split('\n').filter(Boolean) : [];
};

const mine = list(`${base}..HEAD`);
const theirs = new Set(list(`${base}..${MAIN}`));

// Пересечение считаем только там, где файл РЕАЛЬНО расходится с main.
// Если твоя версия файла уже байт-в-байт равна main — терять нечего: так выглядит
// уже влитая ветка (rebase-merge переписывает SHA, и ancestry врёт про выкаченное)
// или та же правка, сделанная параллельно другим агентом.
const stillDiffers = (f) => {
  try {
    git(['diff', '--quiet', MAIN, 'HEAD', '--', f]);
    return false;
  } catch {
    return true;
  }
};
const overlap = mine.filter((f) => theirs.has(f) && stillDiffers(f));

if (overlap.length === 0) {
  console.log(
    green(`✅ [Drift] Отставание ${behind} коммит(ов), но твои файлы в main не менялись.`),
  );
  if (offline) console.log(yellow('   (оффлайн — сверка по последнему известному origin/main)'));
  process.exit(0);
}

const baseDate = tryGit(['log', '-1', '--format=%ci', base]) || '?';

console.error('');
console.error(red(bold('❌ [Drift Block] Push отклонён: ветка написана по устаревшему коду.')));
console.error('');
console.error(`   База ветки:  ${base.slice(0, 7)} от ${baseDate.slice(0, 10)}`);
console.error(`   Отставание:  ${behind} коммит(ов) от origin/main`);
console.error('');
console.error(bold('   Эти файлы ты правил — и их же переписали в main:'));
for (const f of overlap.slice(0, 15)) {
  const commits = tryGit(['log', '--oneline', `${base}..${MAIN}`, '--', f]);
  const n = commits ? commits.split('\n').length : 0;
  console.error(`     ${red('•')} ${f}  ${yellow(`(${n} коммит(ов) в main)`)}`);
  if (commits) {
    for (const line of commits.split('\n').slice(0, 3)) console.error(`         ${line}`);
  }
}
if (overlap.length > 15) console.error(`     … и ещё ${overlap.length - 15}`);

console.error('');
console.error(bold('   Что это значит:'));
console.error('     Твоя работа и работа в main трогали одно место. Зелёный тест и');
console.error('     проверка в браузере тут ничего не доказывают — они прогонялись по');
console.error('     старому файлу. Влитие как есть откатит чужие влитые карточки.');
console.error('');
console.error(bold('   Что делать:'));
console.error(`     git rebase ${MAIN}      # затем ПЕРЕГНАТЬ гейт заново, не доверяя старому`);
console.error('     Конфликтов много или правка меньше конфликта — переложить подход');
console.error('     на свежий файл заново, это часто дешевле разбора конфликта.');
console.error('');
console.error(`   Осознанный обход:  DRIFT_OK=1 git push`);
console.error('');
if (offline) {
  console.error(yellow('   (оффлайн — сверка по последнему известному origin/main)'));
  console.error('');
}

process.exit(1);
