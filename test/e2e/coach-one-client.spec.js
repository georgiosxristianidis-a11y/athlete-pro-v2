/**
 * CORE-5 — «Спросить коуча» из недельной сводки открывает Core, в живом браузере.
 *
 * Юнит-гард (`test/coach-one-client.test.js`) держит клиент и статику, но не
 * отвечает на вопрос карточки: доходит ли тап по кнопке шторки до экрана Core
 * и уходит ли вопрос тем же клиентом, с той же памятью. До CORE-5 кнопка звала
 * второй клиент без контекста — на экране был только тост с ошибкой.
 *
 * Ключ провайдера не нужен: `/api/coach` подменяется на уровне сети.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';

/* Воркер проксирует `/api/*` своим fetch(), куда page.route не достаёт. */
test.use({ serviceWorkers: 'block' });

/* `serviceWorkers: 'block'` в WebKit не действует — стаб молча не сработал бы,
   и запрос ушёл бы на живой сервер без ключа. Клиент один на оба движка, так
   что Chromium отвечает на вопрос карточки целиком. */
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'page.route не видит запросы воркера в WebKit — стаб /api/coach недостижим'
);

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

test('CORE-5: «Спросить коуча» из сводки открывает Core, вопрос идёт с памятью', async ({ page }) => {
  /** @type {any[]} */
  const bodies = [];
  await page.route('**/api/coach', (route) => {
    bodies.push(route.request().postDataJSON());
    const text = `Coach reply ${bodies.length}.`;
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: `data: ${JSON.stringify({ text })}\n\ndata: [DONE]\n\n`,
    });
  });

  await page.goto(BASE);
  await waitForBoot(page);
  // Одна тренировка — чтобы дашборд показал чип сводки; облако и ИИ — иначе
  // privacy-гейт рубит запрос до сети (дефолт новой установки — airgap).
  await page.evaluate(async () => {
    const { DB } = await import('/js/db.js');
    await DB.Settings.set('onboarding-complete', true);
    await DB.Workouts.save({
      type: 'push',
      tonnage: 1234,
      exercises: [{ name: 'Bench Press', sets: [{ weight: 80, reps: 5, done: true }] }],
    });
    const P = await import('/js/privacy.store.js');
    await P.setPrivacyMode('cloud');
    await P.setAiEnabled(true);
  });
  await page.reload();
  await waitForBoot(page);

  await page.locator('[data-action="dash:weeklySummary"]').first().click();
  await page.locator('[data-action="dash:askAI"]').click();

  await expect(page.locator('#s-intel')).toHaveClass(/active/, { timeout: 10000 });
  await expect(page.locator('.modal-overlay'), 'шторка сводки осталась поверх Core').toHaveCount(0);
  await expect(page.locator('#intel-feedback-feed')).toContainText('Coach reply 1.', { timeout: 10000 });

  expect(bodies).toHaveLength(1);
  expect(bodies[0].snapshot.door).toBe('intel');
  expect(bodies[0].messages).toHaveLength(1);
  expect(bodies[0].messages[0].content).toMatch(/^Analyze my week/);

  // Второй вопрос уже в Core — тот же клиент помнит первый обмен.
  await page.locator('#intel-input').fill('And tomorrow?');
  await page.locator('[data-action="intel:submit"]').click();
  await expect(page.locator('#intel-feedback-feed')).toContainText('Coach reply 2.', { timeout: 10000 });

  expect(bodies).toHaveLength(2);
  expect(bodies[1].messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  expect(bodies[1].messages[1].content).toBe('Coach reply 1.');
  expect(bodies[1].messages[2].content).toBe('And tomorrow?');
});
