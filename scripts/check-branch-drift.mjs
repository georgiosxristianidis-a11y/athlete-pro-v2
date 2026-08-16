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
//
// Здесь же живёт вторая, независимая проверка — ОТВЕРГНУТЫЕ ЛИНИИ (BASE-1):
// база не должна содержать код линии, по которой вынесен вердикт «не вливать».
// Она попала в этот файл не по смыслу, а по слоям: скрипт уже вызывается и из
// pre-push, и из job `drift` в CI, то есть одной правкой закрывает и раннюю
// локальную ловлю, и слой, которому протухший чекаут не страшен. У неё свой
// блок, свой обход (DONOR_OK) и свой выход — см. комментарий у самой проверки.

import { execFileSync } from 'node:child_process';

// Вычисления живут в `drift-core.mjs` — тот же модуль зовёт PreToolUse-хук
// (FLOW-2). Здесь остались только политика (что блокирует, что обходится) и
// вывод: две копии формулы «что считать пересечением» разъехались бы на первой
// же правке, и гард был бы зелёным ровно там, где смотрят.
import {
  MAIN,
  commitsInMainFor,
  currentBranch,
  behindCount,
  mainKnown,
  mergeBase,
  overlapFiles,
  tryGit,
} from './drift-core.mjs';
import { scanBase } from './rejected-lines.mjs';

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/* Отвергнутые линии (BASE-1). Идёт ПЕРВОЙ — раньше DRIFT_OK, раньше выхода на
   main и раньше сетевых шагов. Причины по порядку важности:

   1. Обход у неё свой, DONOR_OK. Рутинный DRIFT_OK=1 («знаю, что отстал»)
      набирается на автомате, и разделить его с «под тобой лежит отвергнутый код
      с утечкой ключа» — не педантизм: инцидент O-9 куплен ровно тем, что один
      обход снял один гард, а второй остался стоять.
   2. Проверка чисто локальная (merge-base по объектам), сети не требует —
      значит не должна зависеть от шагов, которые её требуют.
   3. Ветка `main` в локальном чекауте с донорской линией внутри — не «нечего
      проверять», а худший из возможных случаев.

   Молчит, когда линия влита в origin/main, и когда объекта нет в хранилище:
   см. `scripts/rejected-lines.mjs`, там разобрано почему. */
const donor = scanBase({ mainRef: MAIN });
if (donor.hits.length && process.env.DONOR_OK === '1') {
  console.log(yellow('⚠️  [Donor] Проверка отвергнутых линий отключена через DONOR_OK=1.'));
} else if (donor.hits.length) {
  console.log(red(bold('\n❌ [Donor Block] База содержит отвергнутую линию.\n')));
  for (const { sha, name, why } of donor.hits) {
    console.log(`   ${sha.slice(0, 7)} (${name}) — ${why}`);
  }
  if (!donor.mainKnown) console.log(yellow('   origin/main недоступен — влитость линии не проверена.'));
  console.log('\n   Ветку резать от свежего origin/main, а не от этой базы:');
  console.log('   git fetch origin && git rebase --onto origin/main <линия> <ветка>');
  console.log('\n   Осознанный обход (например, пуш самой донорской ветки в архив):');
  console.log('   DONOR_OK=1 git push\n');
  process.exit(1);
}

if (process.env.DRIFT_OK === '1') {
  console.log(yellow('⚠️  [Drift] Проверка дрейфа отключена через DRIFT_OK=1.'));
  process.exit(0);
}

const branch = currentBranch();

/* Detached HEAD локально — это обычно середина rebase/bisect, там проверять
   нечего. В CI же detached — НОРМА: actions/checkout по ref даёт именно его.
   Пропускать там значит превратить job в пустышку — что и случилось при первом
   заходе: job «прошёл» с сообщением про detached, не проверив ничего. */
const inCI = process.env.CI === 'true' || process.env.CI === '1';
if ((!branch || branch === 'HEAD') && !inCI) {
  console.log(green('✅ [Drift] Detached HEAD вне CI — проверка пропущена.'));
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

if (!mainKnown()) {
  console.log(yellow('⚠️  [Drift] origin/main недоступен — проверка пропущена.'));
  process.exit(0);
}

const base = mergeBase();
if (!base) {
  console.log(yellow('⚠️  [Drift] Общий предок с origin/main не найден — проверка пропущена.'));
  process.exit(0);
}

const behind = behindCount();
if (behind === 0) {
  console.log(green('✅ [Drift] Ветка отросла от свежего origin/main.'));
  process.exit(0);
}

const overlap = overlapFiles(base);

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
  const commits = commitsInMainFor(base, f);
  console.error(`     ${red('•')} ${f}  ${yellow(`(${commits.length} коммит(ов) в main)`)}`);
  for (const line of commits.slice(0, 3)) console.error(`         ${line}`);
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
