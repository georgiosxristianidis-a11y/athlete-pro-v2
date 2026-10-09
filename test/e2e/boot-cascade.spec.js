// @ts-check
/**
 * BOOT-1 «Контент» — лесенка Home на --stagger-i и барабан разницы на чипах.
 * Чистая функция барабана — test/digit-roll.test.js, здесь — что видит экран:
 * порядок входа карточек, прод при выключенном флаге, когда число крутится,
 * когда стоит, и что reduce не прячет ничего.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';

async function waitForBoot(page) {
  await page.waitForFunction(
    () => {
      const nav = document.getElementById('nav');
      return (
        (nav && nav.offsetHeight > 0) ||
        document.getElementById('loading')?.classList.contains('hidden')
      );
    },
    { timeout: 12000 }
  );
}

/** Три тренировки за сегодня по 4000 кг: чипы «неделя» и «месяц» 12.0k, сессий 3. */
async function seedWeek(page) {
  await page.evaluate(async () => {
    const { DB } = await import('/js/db.js');
    await DB.Settings.set('onboarding-complete', true);
    const now = Date.now();
    const types = ['push', 'pull', 'legs'];
    for (let i = 0; i < 3; i++) {
      await DB.Workouts.save({
        type: types[i],
        timestamp: now - (3 - i) * 60000,
        duration: 3000,
        tonnage: 4000,
        exercises: [{ name: 'Bench Press', sets: [{ weight: 60, reps: 8, done: true }] }],
      });
    }
  });
}

/**
 * Холодный старт Home с данными. Засев идёт при ВЫКЛЮЧЕННОМ флаге: события
 * сохранения тренировки перерисовывают Home, и при включённом флаге база
 * ap-dash-seen писалась бы на полпути (webkit успевал, chromium нет).
 * cascade — включает boot-cascade перед перезагрузкой: это и есть
 * «первый старт после включения» — данные есть, базы нет.
 */
async function openHome(page, { cascade }) {
  await page.goto(BASE);
  await waitForBoot(page);
  await seedWeek(page);
  await page.evaluate((on) => {
    if (on) localStorage.setItem('ap-flag-boot-cascade', '1');
    localStorage.removeItem('ap-dash-seen');
  }, cascade);
  await page.reload();
  await waitForBoot(page);
  await expect(page.locator('#dash-sessions')).toHaveText('3', { timeout: 10000 });
}

/**
 * Дождаться конца всех анимаций. Только под reduce: там iteration-count 1
 * !important, бесконечных нет и `finished` резолвится. Фиксированная пауза
 * не годится — webkit заводит таймлайн позже 150 мс (currentTime 0, running).
 */
const settle = (page) =>
  page.evaluate(() =>
    Promise.race([
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
      new Promise((r) => setTimeout(r, 3000)),
    ])
  );

async function goTab(page, id) {
  await page.locator(`button[data-s="${id}"]`).click();
  await expect(page.locator(`#${id}`)).toHaveClass(/active/, { timeout: 5000 });
}

/** Заход на Home заново — load() зовёт Nav-обработчик, Home к этому моменту уже active. */
async function reenterHome(page) {
  await goTab(page, 's-stats');
  await goTab(page, 's-home');
}

const setSeen = (page, seen) =>
  page.evaluate((v) => localStorage.setItem('ap-dash-seen', JSON.stringify(v)), seen);
const getSeen = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('ap-dash-seen') || 'null'));

/** Прямые дети #s-home с лесенкой: класс, имя анимации, задержка в секундах. */
const staggerOf = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#s-home > .stagger-item')].map((el) => {
      const cs = getComputedStyle(el);
      return {
        cls: el.className,
        name: cs.animationName,
        delay: parseFloat(cs.animationDelay),
        op: cs.opacity,
      };
    })
  );

test.describe('BOOT-1: лесенка', () => {
  test('флаг ON: карточки входят по порядку, гейдж строго после своего заголовка', async ({
    page,
  }) => {
    await openHome(page, { cascade: true });
    await expect(page.locator('#s-home')).toHaveClass(/boot-cascade/);

    const items = await staggerOf(page);
    expect(items).toHaveLength(7);
    for (const it of items) expect(it.name).toBe('boot-rise');

    const delays = items.map((it) => it.delay);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i], `карточка ${i} не раньше предыдущей`).toBeGreaterThan(delays[i - 1]);
    }
    expect(delays[0], 'старт hero как на проде — 50 мс').toBeCloseTo(0.05, 3);
    const header = items.findIndex((it) => it.cls.includes('section-header'));
    const gauge = items.findIndex((it) => it.cls.includes('ppl-gauge-card'));
    expect(gauge, 'гейдж идёт сразу за заголовком').toBe(header + 1);
    expect(delays[gauge]).toBeGreaterThan(delays[header]);
  });

  test('флаг OFF: прод без изменений — DESIGN-3 и nth-child на месте', async ({ page }) => {
    await openHome(page, { cascade: false });
    await expect(page.locator('#s-home')).not.toHaveClass(/boot-cascade/);

    const items = await staggerOf(page);
    expect(items).toHaveLength(7);
    for (const it of items) expect(it.name).toBe('fadeSlideUp');
    // nth-child(1-6) из base.css + 0.18 с гейджа из DESIGN-3: гейдж до своего заголовка (0.30).
    // Это прод, а не норма — PR снятия флага перепишет строку сознательно.
    expect(items.map((it) => it.delay)).toEqual([0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.18]);

    expect(await page.locator('.dig-roll').count()).toBe(0);
    expect(await getSeen(page)).toBeNull();
  });
});

test.describe('BOOT-1: барабан разницы', () => {
  test('первый старт после включения стоит и пишет базу', async ({ page }) => {
    await openHome(page, { cascade: true });
    expect(await page.locator('.dig-roll').count()).toBe(0);
    await expect(page.locator('#dash-vol-week')).toHaveText('12.0kkg');
    expect(await getSeen(page)).toEqual({ w: '12.0k', m: '12.0k', s: '3' });
  });

  test('рост: крутятся изменившиеся разряды, textContent — новое число; повторный заход стоит', async ({
    page,
  }) => {
    await openHome(page, { cascade: true });
    await setSeen(page, { w: '11.0k', m: '11.0k', s: '2' });
    await reenterHome(page);

    // 11.0k → 12.0k: одна цифра на чип (десятки тысяч не менялись), сессий 2 → 3
    await expect(page.locator('.dig-roll')).toHaveCount(3);
    await expect(page.locator('#dash-vol-week')).toHaveText('12.0kkg');
    await expect(page.locator('#dash-vol-month')).toHaveText('12.0kkg');
    await expect(page.locator('#dash-sessions')).toHaveText('3');

    const delays = await page.evaluate(() =>
      [...document.querySelectorAll('.dig-roll-col')].map((c) =>
        parseFloat(getComputedStyle(c).animationDelay)
      )
    );
    expect(delays[0]).toBeCloseTo(0, 3);
    expect(delays[1]).toBeCloseTo(0.06, 3); // чип «месяц» на 60 мс позже
    expect(delays[2]).toBeCloseTo(0.12, 3);

    expect(await getSeen(page)).toEqual({ w: '12.0k', m: '12.0k', s: '3' });
    await reenterHome(page);
    await expect(page.locator('#dash-sessions')).toHaveText('3');
    await expect(page.locator('.dig-roll')).toHaveCount(0);
  });

  test('число не выросло или сменился формат — стоит статично', async ({ page }) => {
    await openHome(page, { cascade: true });

    await setSeen(page, { w: '15.1k', m: '15.1k', s: '9' }); // неделя сменилась: меньше
    await reenterHome(page);
    await expect(page.locator('#dash-sessions')).toHaveText('3');
    await expect(page.locator('.dig-roll')).toHaveCount(0);

    await setSeen(page, { w: '988', m: '988', s: '3' }); // 988 → 12.0k: другая маска
    await reenterHome(page);
    await expect(page.locator('#dash-vol-week')).toHaveText('12.0kkg');
    await expect(page.locator('.dig-roll')).toHaveCount(0);
  });

  test('load() при скрытом Home базу не жжёт: барабан отыгрывает на заходе', async ({ page }) => {
    await openHome(page, { cascade: true });
    await goTab(page, 's-stats');
    await setSeen(page, { w: '11.0k', m: '11.0k', s: '2' });
    await page.evaluate(() => window.Dashboard.load());
    await page.waitForTimeout(300);
    expect(await getSeen(page), 'скрытый Home базу не трогает').toEqual({
      w: '11.0k',
      m: '11.0k',
      s: '2',
    });

    await goTab(page, 's-home');
    await expect(page.locator('.dig-roll')).toHaveCount(3);
  });

  test('импорт бэкапа сбрасывает базу', async ({ page }) => {
    await openHome(page, { cascade: true });
    expect(await getSeen(page)).not.toBeNull();
    const json = await page.evaluate(async () => (await import('/js/db.js')).DB.Backup.export());

    await goTab(page, 's-profile');
    await page.waitForFunction(() => typeof window.Profile?._onImportFile === 'function');
    await page.evaluate(
      (text) => window.Profile._onImportFile({ target: { files: [{ text: async () => text }] } }),
      json
    );
    await expect.poll(() => getSeen(page)).toBeNull();
  });
});

test.describe('BOOT-1: reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('после данных ни одной карточки с opacity 0, задержек нет, барабан на конечной позиции', async ({
    page,
  }) => {
    await openHome(page, { cascade: true });
    await setSeen(page, { w: '11.0k', m: '11.0k', s: '2' });
    await reenterHome(page);
    await expect(page.locator('.dig-roll')).toHaveCount(3);
    await settle(page);

    for (const it of await staggerOf(page)) {
      expect(it.delay, 'reduce гасит задержку лесенки').toBe(0);
      expect(it.op, 'карточка не прячется до задержки').toBe('1');
    }
    const cols = await page.evaluate(() =>
      [...document.querySelectorAll('.dig-roll-col')].map((c) => {
        const cs = getComputedStyle(c);
        const ty = Number(cs.transform.replace(/^matrix\(|\)$/g, '').split(',')[5]);
        return {
          ty,
          want: -Number(c.style.getPropertyValue('--roll-n')) * parseFloat(cs.fontSize),
          delay: cs.animationDelay,
        };
      })
    );
    for (const c of cols) {
      expect(c.delay).toBe('0s');
      expect(c.ty).toBeCloseTo(c.want, 1);
    }
  });

  test('глобальное правило: на всех четырёх вкладках ни одной задержки анимации', async ({
    page,
  }) => {
    await openHome(page, { cascade: false });
    for (const id of ['s-home', 's-train', 's-stats', 's-profile']) {
      await goTab(page, id);
      await settle(page);
      const stuck = await page.evaluate((screen) => {
        const bad = [];
        for (const el of document.querySelectorAll(`#${screen}, #${screen} *`)) {
          const cs = getComputedStyle(el);
          if (cs.animationName === 'none') continue;
          const delays = cs.animationDelay.split(',').map((d) => parseFloat(d));
          if (delays.some((d) => d !== 0))
            bad.push(`${el.tagName}.${String(el.className)} ${cs.animationDelay}`);
          const opacity = Number(cs.opacity);
          if (opacity === 0 && cs.animationIterationCount === '1')
            bad.push(`${el.tagName}.${String(el.className)} opacity 0`);
        }
        return bad;
      }, id);
      expect(stuck, `${id}: reduce оставил задержку или невидимую карточку`).toEqual([]);
    }
  });
});
