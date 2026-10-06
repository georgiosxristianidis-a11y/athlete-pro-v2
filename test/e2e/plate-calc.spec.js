// @ts-check
/**
 * PLATE-1b — вход в калькулятор блинов с карточки упражнения и лист на `.sd-overlay`.
 * Арифметику держит test/plate-math.test.js, здесь — что лист открывается с веса
 * подхода, называет не собираемый вес, закрывается и НИЧЕГО не пишет в подход.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';

async function waitForBoot(page) {
  await page.waitForFunction(
    () => {
      const nav = document.getElementById('nav');
      return (nav && nav.offsetHeight > 0) || document.getElementById('loading')?.classList.contains('hidden');
    },
    { timeout: 12000 }
  );
}

async function openApp(page) {
  await page.goto(BASE);
  await waitForBoot(page);
  const flagged = await page.evaluate(async () => {
    const { DB } = await import('/js/db.js');
    if (await DB.Settings.get('onboarding-complete', false)) return false;
    await DB.Settings.set('onboarding-complete', true);
    return true;
  });
  if (flagged) {
    await page.reload();
    await waitForBoot(page);
  }
  await page.waitForFunction(() => !document.getElementById('onboarding-overlay'), { timeout: 8000 });
}

async function startWorkout(page) {
  await page.locator('button[data-s="s-train"]').click();
  await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 5000 });
  await page.waitForFunction(() => typeof window.Workout?.selectType === 'function', { timeout: 10000 });
  await expect(async () => {
    // push: первое упражнение — Bench Press на штанге. У pull-дня первое — Pull-up
    // со своим весом, и кнопки блинов там по замыслу нет.
    await page.evaluate(() => window.Workout.selectType('push'));
    await page.waitForSelector('.set-row', { state: 'visible', timeout: 6000 });
  }).toPass({ timeout: 20000 });
}

/** Вес первого подхода первого упражнения в State, без барабана. */
const setWeight = (page, kg) =>
  page.evaluate(async (w) => {
    const { State } = await import('/js/workout.store.js');
    State.plan[0].sets[0].weight = w;
  }, kg);

const stateWeight = (page) =>
  page.evaluate(async () => {
    const { State } = await import('/js/workout.store.js');
    return State.plan[0].sets[0].weight;
  });

test.describe('PLATE-1b — калькулятор блинов', () => {
  test.use({ locale: 'en-US' });

  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await startWorkout(page);
  });

  const plateBtn = (page) => page.locator('#ex-card-0 [data-action="wo:plates"]');
  const sheet = (page) => page.locator('.pc-overlay:not([data-closing]) .pc-sheet');

  test('кнопка есть на карточке и открывает лист с веса подхода', async ({ page }) => {
    await setWeight(page, 100);
    await expect(plateBtn(page)).toBeVisible();
    await plateBtn(page).tap();
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page).locator('.pc-weight-num')).toHaveText('100');
    // 100 при грифе 20: на сторону 25 + 15 — по диску с каждой стороны от грифа, четыре диска
    await expect(sheet(page).locator('.pc-plate')).toHaveCount(4);
    await expect(sheet(page).locator('.pc-text')).toContainText('1×25 + 1×15 kg');
  });

  test('22 кг не собирается: лист так и говорит и называет ближайший вверх', async ({ page }) => {
    await setWeight(page, 22);
    await plateBtn(page).tap();
    await expect(sheet(page).locator('.pc-weight-num')).toHaveText('22');
    await expect(sheet(page).locator('.pc-text')).toContainText('22 kg can’t be loaded');
    await expect(sheet(page).locator('.pc-text')).toContainText('+0.5 kg to 22.5 kg');

    await sheet(page).locator('[data-pc="up"]').tap();
    await expect(sheet(page).locator('.pc-weight-num')).toHaveText('22.5');
    await expect(sheet(page).locator('.pc-plate')).toHaveCount(2);
    await expect(sheet(page).locator('.pc-text')).not.toContainText('can’t be loaded');
  });

  test('ниже грифа: честное сообщение, блинов нет, вес не подменён', async ({ page }) => {
    await setWeight(page, 15);
    await plateBtn(page).tap();
    await expect(sheet(page).locator('.pc-weight-num')).toHaveText('15');
    await expect(sheet(page).locator('.pc-text')).toContainText('Below the bar (20 kg)');
    await expect(sheet(page).locator('.pc-plate')).toHaveCount(0);
  });

  test('крестик и тап по фону закрывают лист, он уходит из DOM, открывается снова', async ({ page }) => {
    await setWeight(page, 60);
    await plateBtn(page).tap();
    await expect(sheet(page)).toBeVisible();

    await sheet(page).locator('[data-pc="close"]').tap();
    await expect(page.locator('.pc-overlay')).toHaveCount(0, { timeout: 3000 });

    await plateBtn(page).tap();
    await expect(sheet(page)).toBeVisible();
    // фон над листом: левый верхний угол оверлея
    await page.locator('.pc-overlay').tap({ position: { x: 8, y: 8 } });
    await expect(page.locator('.pc-overlay')).toHaveCount(0, { timeout: 3000 });
  });

  test('системная «назад» и Escape закрывают лист, экран тренировки остаётся', async ({ page }) => {
    await setWeight(page, 60);
    await plateBtn(page).tap();
    await expect(sheet(page)).toBeVisible();
    await page.goBack();
    await expect(page.locator('.pc-overlay')).toHaveCount(0, { timeout: 3000 });
    await expect(page.locator('#s-train')).toHaveClass(/active/);

    await plateBtn(page).tap();
    await expect(sheet(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.pc-overlay')).toHaveCount(0, { timeout: 3000 });
    await expect(page.locator('#s-train')).toHaveClass(/active/);

    // закрытие кнопкой не оставляет в history лишней записи: один «назад» уводит с экрана, а не в пустоту
    await plateBtn(page).tap();
    await sheet(page).locator('[data-pc="close"]').tap();
    await expect(page.locator('.pc-overlay')).toHaveCount(0, { timeout: 3000 });
    await expect.poll(() => page.evaluate(() => history.state?.overlay ?? null)).toBeNull();
  });

  test('лист только показывает: вес подхода после шагов и закрытия прежний', async ({ page }) => {
    await setWeight(page, 22);
    await plateBtn(page).tap();
    await sheet(page).locator('[data-pc="up"]').tap();
    await sheet(page).locator('[data-pc="up"]').tap();
    await sheet(page).locator('.pc-bar-opt[data-bar="15"]').tap();
    await sheet(page).locator('[data-pc="close"]').tap();
    await expect(page.locator('.pc-overlay')).toHaveCount(0, { timeout: 3000 });
    expect(await stateWeight(page)).toBe(22);
  });

  test('гриф запоминается и мусор в хранилище не ломает лист', async ({ page }) => {
    await setWeight(page, 60);
    await plateBtn(page).tap();
    await sheet(page).locator('.pc-bar-opt[data-bar="15"]').tap();
    await expect(sheet(page).locator('.pc-bar-opt[data-bar="15"]')).toHaveAttribute('aria-pressed', 'true');
    await sheet(page).locator('[data-pc="close"]').tap();
    await expect(page.locator('.pc-overlay')).toHaveCount(0, { timeout: 3000 });

    await plateBtn(page).tap();
    await expect(sheet(page).locator('.pc-bar-opt[data-bar="15"]')).toHaveAttribute('aria-pressed', 'true');
    await sheet(page).locator('[data-pc="close"]').tap();
    await expect(page.locator('.pc-overlay')).toHaveCount(0, { timeout: 3000 });

    await page.evaluate(() => localStorage.setItem('ap-bar-weight', '-5'));
    await plateBtn(page).tap();
    await expect(sheet(page).locator('.pc-bar-opt[data-bar="20"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

/**
 * PLATE-1c — кинетика листа. Движение целиком в CSS, поэтому проверяем то, что
 * видно браузеру: хост грифа и живые блины не пересоздаются рендером, ретриггер
 * не копит анимации, reduced-motion гасит отскок.
 */
test.describe('PLATE-1c — кинетика грифа', () => {
  test.use({ locale: 'en-US' });

  const plateBtn = (page) => page.locator('#ex-card-0 [data-action="wo:plates"]');
  const sheet = (page) => page.locator('.pc-overlay:not([data-closing]) .pc-sheet');
  const host = (page) => sheet(page).locator('[data-pc="barbell"]');

  async function openAt(page, kg) {
    await setWeight(page, kg);
    await plateBtn(page).tap();
    await expect(sheet(page)).toBeVisible();
  }

  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await startWorkout(page);
  });

  test('первый показ листа без отскока и каскада', async ({ page }) => {
    await openAt(page, 100);
    await expect(sheet(page).locator('.pc-plate')).toHaveCount(4);
    await expect(sheet(page).locator('.pc-plate-in')).toHaveCount(0);
    await expect(host(page)).not.toHaveClass(/pc-kick/);
  });

  test('шаг веса: хост и живые блины те же узлы, новые входят каскадом', async ({ page }) => {
    await openAt(page, 100);
    await page.evaluate(() => {
      const h = document.querySelector('[data-pc="barbell"]');
      // @ts-ignore
      window.__host = h;
      // @ts-ignore
      window.__inner = h.querySelector('.pc-side-r .pc-plate');
    });
    await sheet(page).locator('[data-pc="up"]').tap(); // 100 -> 102.5: к 25+15 добавился 1.25
    await expect(sheet(page).locator('.pc-plate')).toHaveCount(6);
    const same = await page.evaluate(() => {
      const h = document.querySelector('[data-pc="barbell"]');
      return {
        host: h === /** @type {any} */ (window).__host,
        inner: h.querySelector('.pc-side-r .pc-plate') === /** @type {any} */ (window).__inner,
        animated: h.querySelectorAll('.pc-plate-in').length,
        innerAnimated: h.querySelector('.pc-side-r .pc-plate').classList.contains('pc-plate-in'),
      };
    });
    expect(same.host).toBe(true);
    expect(same.inner).toBe(true);
    expect(same.innerAnimated).toBe(false);
    expect(same.animated).toBe(2); // по одному новому блину на сторону
  });

  test('отскок: один CSS-драйвер на гриф, и перезапускается после конца', async ({ page }) => {
    await openAt(page, 100);
    await sheet(page).locator('[data-pc="up"]').tap();
    await expect
      .poll(() => host(page).evaluate((el) => el.getAnimations().map((a) => /** @type {any} */ (a).animationName)))
      .toEqual(['pc-kick']);

    await expect
      .poll(() => host(page).evaluate((el) => el.getAnimations()[0].playState), { timeout: 3000 })
      .toBe('finished');
    await sheet(page).locator('[data-pc="down"]').tap();
    await expect
      .poll(() => host(page).evaluate((el) => el.getAnimations()[0].playState))
      .toBe('running');
  });

  test('быстрая серия тапов: анимации не копятся, блинов ровно по весу', async ({ page }) => {
    await openAt(page, 100);
    const up = sheet(page).locator('[data-pc="up"]');
    for (let i = 0; i < 6; i++) await up.tap(); // 100 -> 115
    const probe = await page.evaluate(() => {
      const h = document.querySelector('[data-pc="barbell"]');
      return {
        hostAnims: h.getAnimations().length,
        // входящих анимаций не больше, чем блинов с классом входа: у каждого узла по одной
        plateAnims: h.getAnimations({ subtree: true }).length - h.getAnimations().length,
        animatedPlates: h.querySelectorAll('.pc-plate-in').length,
      };
    });
    expect(probe.hostAnims).toBe(1);
    expect(probe.plateAnims).toBeLessThanOrEqual(probe.animatedPlates);
    // 115 при грифе 20: на сторону 47.5 = 25 + 20 + 2.5 -> 3 диска, всего 6
    await expect(sheet(page).locator('.pc-plate')).toHaveCount(6);
    await expect(sheet(page).locator('.pc-weight-num')).toHaveText('115');
  });

  test('лист без reflow на горячем пути и без своего rAF', async ({ page }) => {
    await openAt(page, 100);
    const calls = await page.evaluate(async () => {
      let raf = 0;
      const orig = window.requestAnimationFrame;
      window.requestAnimationFrame = (cb) => {
        raf++;
        return orig.call(window, cb);
      };
      const btn = document.querySelector('[data-pc="up"]');
      /** @type {HTMLElement} */ (btn).click();
      /** @type {HTMLElement} */ (btn).click();
      window.requestAnimationFrame = orig;
      return raf;
    });
    expect(calls).toBe(0);
  });

  test('reduced-motion: отскока нет, блины встают сразу', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openAt(page, 100);
    await sheet(page).locator('[data-pc="up"]').tap();
    await expect(sheet(page).locator('.pc-plate')).toHaveCount(6);
    const probe = await page.evaluate(() => {
      const h = document.querySelector('[data-pc="barbell"]');
      const plate = h.querySelector('.pc-plate-in');
      const dur = (el) => parseFloat(getComputedStyle(el).animationDuration);
      return { host: dur(h), plate: dur(plate), delay: getComputedStyle(plate).animationDelay };
    });
    expect(probe.host).toBeLessThanOrEqual(0.001);
    expect(probe.plate).toBeLessThanOrEqual(0.001);
    expect(parseFloat(probe.delay)).toBe(0);
    await expect
      .poll(() => host(page).evaluate((el) => getComputedStyle(el.querySelector('.pc-plate-in') ?? el).opacity))
      .toBe('1');
  });

  test('ниже грифа: скелет жив, но спрятан, отскока нет', async ({ page }) => {
    await openAt(page, 15);
    await expect(host(page)).toHaveAttribute('data-state', 'below');
    await expect(sheet(page).locator('.pc-plate')).toHaveCount(0);
    await expect(host(page)).not.toHaveClass(/pc-kick/);
    await expect(host(page).locator('.pc-shaft')).toBeHidden();
  });
});
