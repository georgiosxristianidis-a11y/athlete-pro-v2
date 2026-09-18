// @ts-check
/**
 * A13 — контракт `js/profile.store.js` после переноса IDB с экрана профиля.
 *
 * Тумблеры, границы и парные записи переехали из `js/profile.js` в стор
 * (baseline A15 39 → 0). Гард `test/import-guard.test.js` считает вызовы, но
 * не проверяет, что при переносе не потерялись дефолт, clamp и вторая запись
 * пары — это делает здесь, на реальной базе (fake-indexeddb), без моков.
 *
 * DOM здесь не поднимается намеренно: стор обязан работать без него. Появится
 * в сторе `document` — файл упадёт на импорте, а не на ассерте.
 */
import { test, describe, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const { DB } = await import('../js/db.js');
const { K_LAST_EXPORT } = await import('../js/db/backup.js');
const store = await import('../js/profile.store.js');

before(async () => {
  await DB.clearAll();
});
afterEach(async () => {
  await DB.clearAll();
});

describe('A13 profile.store — настройки экрана', () => {
  test('язык: фолбэк en, иначе то, что в базе', async () => {
    assert.equal(await store.getStoredLang(), 'en');
    await DB.Settings.set('lang', 'ru');
    assert.equal(await store.getStoredLang(), 'ru');
  });

  test('отдых: дефолт 90 и границы 15..300 держит стор, а не кнопки', async () => {
    assert.equal(await store.adjustRestDuration(15), 105);
    await DB.Settings.set('rest-duration', 20);
    assert.equal(await store.adjustRestDuration(-30), 15, 'нижняя граница 15 с');
    await DB.Settings.set('rest-duration', 290);
    assert.equal(await store.adjustRestDuration(30), 300, 'верхняя граница 300 с');
    assert.equal(await DB.Settings.get('rest-duration'), 300, 'значение записано, не только возвращено');
  });

  test('on/off тумблеры: дефолт ON, первый тап выключает', async () => {
    for (const [toggle, key] of [
      [store.toggleHapticPref, 'haptic'],
      [store.toggleAutoProgressPref, 'auto-progress'],
      [store.toggleKeepAwakePref, 'keep-awake'],
    ]) {
      assert.equal(await toggle(), 'off', `${key}: дефолт ON, тап обязан выключить`);
      assert.equal(await DB.Settings.get(key), 'off');
      assert.equal(await toggle(), 'on');
    }
  });

  test('сигнал об отдыхе: дефолт off — иначе тумблер горел бы без разрешения', async () => {
    assert.equal(await store.getNotifyRest(), 'off');
    await store.setNotifyRest('on');
    assert.equal(await store.getNotifyRest(), 'on');
  });

  test('единица веса пишется в тот же ключ, что читает экран тренировки', async () => {
    await store.setWeightUnit('lb');
    assert.equal(await DB.Settings.get('weight-unit'), 'lb');
  });
});

describe('A13 profile.store — маскот', () => {
  test('скрытие панды меняет пару ключей вместе', async () => {
    assert.equal(await store.togglePandaHidden(), true);
    assert.equal(await DB.Settings.get('ai-panda-hidden'), true);
    assert.equal(await DB.Settings.get('show-mascot'), 'off', 'пустой Home читает show-mascot');

    assert.equal(await store.togglePandaHidden(), false);
    assert.equal(await DB.Settings.get('show-mascot'), 'on');
  });

  test('revealMascot возвращает видимость — живая панда не включается «в пустоту»', async () => {
    await DB.Settings.set('ai-panda-hidden', true);
    await DB.Settings.set('show-mascot', 'off');
    await store.revealMascot();
    assert.equal(await DB.Settings.get('ai-panda-hidden'), false);
    assert.equal(await DB.Settings.get('show-mascot'), 'on');
  });
});

describe('A13 profile.store — данные', () => {
  test('дата бэкапа пишется в ключ, который читает напоминалка', async () => {
    await store.saveLastExportAt(1758000000000);
    assert.equal(await DB.Settings.get(K_LAST_EXPORT), 1758000000000);
  });

  test('место тренировок: пустое по умолчанию, round-trip без undefined', async () => {
    assert.deepEqual(await store.getGymPlace(), { gym: '', country: '' });
    await store.saveGymPlace({ gym: 'Iron Temple' });
    assert.deepEqual(await store.getGymPlace(), { gym: 'Iron Temple', country: '' });
  });

  test('источники TXT-журнала: пустая база не роняет выгрузку', async () => {
    const src = await store.loadTxtExportSources();
    assert.deepEqual(src.workouts, []);
    assert.deepEqual(src.orms, []);
    assert.equal(src.customName, '');
    assert.equal(src.profile?.name, '', 'профиль читается, а не падает в null на чистой базе');
  });

  test('аватар: индекс палитры — число, мусор даёт 0', async () => {
    assert.deepEqual(await store.getAvatarAppearance(), { photo: null, colorIdx: 0 });
    await DB.Settings.set('avatar-color', '3');
    assert.equal((await store.getAvatarAppearance()).colorIdx, 3);
  });

  test('паспорт: один заход отдаёт все четыре источника', async () => {
    const src = await store.loadPassportSources();
    assert.deepEqual(Object.keys(src).sort(), ['latestMetrics', 'oneRMsRaw', 'profile', 'workouts']);
    assert.equal(src.profile.sex, 'm', 'дефолт профиля на чистой базе');
  });
});
