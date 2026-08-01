// @ts-check
/* PANDA-1 — драматургия маскота как чистая логика.
   Мимики нарезаются из assets/panda-voice.mp4 по тайм-кодам, поэтому кривая
   таблица сегментов = панда молча показывает не ту эмоцию. Это тихий баг:
   ничего не падает, просто персонаж врёт. Отсюда гард на саму таблицу. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  MOODS, PANDA_CLIPS, BASE_MOOD, OVERRUN_JUDGE_SEC, IDLE_GUILT_DAYS,
  restOverrunMood, ledgerVerdictKey, entryGreeting,
} from '../js/shared/panda-mood.js';

/** Фактическая длительность каждого клипа-источника, в секундах. */
const CLIP_SEC = { voice: 10.0, drop: 3.04 };
/** Короче этого сегмент читается как дёрганье, а не как эмоция. */
const MIN_SEGMENT_SEC = 0.8;

test('MOODS: каждый сегмент лежит внутри своего клипа и не вывернут', () => {
  const names = Object.keys(MOODS);
  assert.ok(names.length >= 6, 'мимик должно быть не меньше шести');

  for (const name of names) {
    const seg = MOODS[name];
    assert.ok(PANDA_CLIPS[seg.clip], `${name}: ссылается на несуществующий клип «${seg.clip}»`);
    assert.ok(typeof seg.in === 'number' && typeof seg.out === 'number', `${name}: границы должны быть числами`);
    assert.ok(seg.in < seg.out, `${name}: in должен быть строго меньше out`);
    assert.ok(seg.in >= 0, `${name}: in вылез до начала клипа`);
    assert.ok(seg.out <= CLIP_SEC[seg.clip], `${name}: out вылез за конец клипа «${seg.clip}»`);
    assert.ok(seg.out - seg.in >= MIN_SEGMENT_SEC, `${name}: сегмент короче ${MIN_SEGMENT_SEC}с — это дёрганье, не мимика`);
  }
});

test('PANDA_CLIPS: каждый источник реально лежит на диске', () => {
  // Опечатка в пути = маскот молча показывает poster вместо мимики: ничего
  // не падает, персонаж просто перестаёт играть. Ловим это здесь.
  for (const [key, path] of Object.entries(PANDA_CLIPS)) {
    const abs = new URL('../' + path, import.meta.url);
    assert.ok(existsSync(abs), `клип «${key}» объявлен как ${path}, но файла нет`);
  }
});

test('MOODS: одноразовая сцена не лупится', () => {
  // 'drop' на второй итерации телепортировал бы бамбук обратно в лапы —
  // панчлайн рекорда ломается. Флаг once обязателен.
  assert.equal(MOODS.drop.once, true, 'мимика drop обязана быть once');
  assert.equal(MOODS.drop.clip, 'drop', 'drop нарезать из voice невозможно — там бамбук не выпадает');
});

test('MOODS: базовая мимика существует и это еда', () => {
  assert.ok(MOODS[BASE_MOOD], 'BASE_MOOD обязан быть ключом MOODS');
  assert.equal(BASE_MOOD, 'chew', 'закон персонажа: пока ты работаешь — он ест');
});

test('MOODS: judge не упирается в конец ролика', () => {
  // На 10.0с браузер сам заворачивает loop в ноль и на кадр показывает
  // чужую мимику — поэтому запас у последнего лупящегося сегмента обязателен.
  assert.ok(MOODS.judge.out < CLIP_SEC.voice, 'у judge должен остаться запас до конца ролика');
});

test('restOverrunMood: лестница осуждения', () => {
  assert.equal(restOverrunMood(0), 'watch', 'отдых только что истёк — панда перестаёт жевать и смотрит');
  assert.equal(restOverrunMood(OVERRUN_JUDGE_SEC - 1), 'watch', 'до порога всё ещё только наблюдение');
  assert.equal(restOverrunMood(OVERRUN_JUDGE_SEC), 'judge', 'на пороге включается осуждение');
  assert.equal(restOverrunMood(OVERRUN_JUDGE_SEC + 300), 'judge', 'выше осуждения эскалации нет');
});

test('restOverrunMood: без перебора осуждать не за что', () => {
  assert.equal(restOverrunMood(-1), null);
  assert.equal(restOverrunMood(NaN), null);
  assert.equal(restOverrunMood(undefined), null);
});

test('restOverrunMood: возвращает только существующие мимики', () => {
  for (const sec of [0, 5, 29, 30, 120]) {
    const m = restOverrunMood(sec);
    assert.ok(MOODS[m], `restOverrunMood(${sec}) вернул несуществующую мимику: ${m}`);
  }
});

test('ledgerVerdictKey: счёт всегда равный, обойти можно только рекордом', () => {
  assert.equal(ledgerVerdictKey(0), 'mascot.draw');
  assert.equal(ledgerVerdictKey(1), 'mascot.you_won');
  assert.equal(ledgerVerdictKey(4), 'mascot.you_won');
});

/* ── PANDA-3: приветствие на входе ──────────────────────────────────── */

const DAY = { hour: 14 };

test('entryGreeting: молчит, когда упрекнуть не в чем', () => {
  assert.equal(entryGreeting({ daysSinceLast: 0, ...DAY }), null);
  assert.equal(entryGreeting({ daysSinceLast: IDLE_GUILT_DAYS - 1, ...DAY }), null);
});

test('entryGreeting: простой — «я съел твой прогресс»', () => {
  const g = entryGreeting({ daysSinceLast: IDLE_GUILT_DAYS, ...DAY });
  assert.deepEqual(g, { mood: 'judge', key: 'mascot.ate_progress' });
  assert.equal(entryGreeting({ daysSinceLast: 40, ...DAY }).mood, 'judge');
});

test('entryGreeting: время суток бьёт вину', () => {
  // Пришёл в два ночи после месяца простоя — он всё-таки пришёл. Упрекать
  // пропуском именно в этот момент мелочно, поэтому ночь выигрывает.
  const night = entryGreeting({ daysSinceLast: 40, hour: 2 });
  assert.equal(night.key, 'mascot.night_shift');
  const late = entryGreeting({ daysSinceLast: 40, hour: 23 });
  assert.equal(late.key, 'mascot.night_shift');
  const early = entryGreeting({ daysSinceLast: 40, hour: 6 });
  assert.equal(early.key, 'mascot.early_bird');
});

test('entryGreeting: границы окон времени', () => {
  assert.equal(entryGreeting({ daysSinceLast: 0, hour: 22 }), null, '22:00 — ещё не ночь');
  assert.equal(entryGreeting({ daysSinceLast: 0, hour: 23 }).key, 'mascot.night_shift');
  assert.equal(entryGreeting({ daysSinceLast: 0, hour: 4 }).key, 'mascot.night_shift');
  assert.equal(entryGreeting({ daysSinceLast: 0, hour: 5 }).key, 'mascot.early_bird');
  assert.equal(entryGreeting({ daysSinceLast: 0, hour: 7 }), null, '7:00 — обычное утро');
});

test('entryGreeting: новичок без единой тренировки не получает упрёка', () => {
  assert.equal(entryGreeting({ daysSinceLast: null, ...DAY }), null);
  // но ночью здоровается — ему ещё нечего было пропускать
  assert.equal(entryGreeting({ daysSinceLast: null, hour: 1 }).key, 'mascot.night_shift');
});

test('entryGreeting: мусор на входе не роняет и не выдумывает мимику', () => {
  assert.equal(entryGreeting({ daysSinceLast: 5, hour: NaN }), null);
  assert.equal(entryGreeting({ daysSinceLast: 5, hour: 24 }), null);
  assert.equal(entryGreeting({}), null);
});

/* ── PANDA-4: FAB не имеет права висеть над полем ввода ──────────────── */

test('FAB маскота скрыт на экране тренировки', () => {
  // Полевой скриншот 2026-07-31: панда висела ровно над барабаном веса.
  // Это решение легко «прибрать» при следующем рефакторе видимости FAB,
  // поэтому оно под гардом, а не только в комментарии.
  const src = readFileSync(new URL('../js/claude.view.js', import.meta.url), 'utf8');
  assert.match(src, /screenId === 's-train'/,
    'claude.view.js должен прятать FAB на s-train — иначе маскот перекрывает ввод веса');
});

test('entryGreeting: возвращает только существующие мимики', () => {
  for (let h = 0; h <= 23; h++) {
    const g = entryGreeting({ daysSinceLast: 99, hour: h });
    if (g) assert.ok(MOODS[g.mood], `час ${h}: несуществующая мимика ${g.mood}`);
  }
});
