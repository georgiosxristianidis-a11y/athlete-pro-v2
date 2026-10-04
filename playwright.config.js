// @ts-check
import { defineConfig, devices } from '@playwright/test';

// E2E-1: один адрес на всё — и `page.goto(BASE)` в спеках, и `request.*` через
// `use.baseURL`. Тот же дефолт, что у `const BASE` в test/e2e/*.spec.js.
// 20.09 `request.get('/sw.js')` при `E2E_BASE=…:3001` ушёл на прибитый :3000
// и получил HTML чужого приложения.
const E2E_BASE = process.env.E2E_BASE || '';
const BASE_URL = E2E_BASE || 'http://localhost:3000';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test/e2e/report' }]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 412, height: 915 }, // Pixel 7 — mobile form factor
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
  },
  // `E2E_BASE` задан → сервер держит человек, свой не поднимаем вовсе.
  // Не задан → поднимаем СВОЙ на :3000. `reuseExistingServer: false`: занятый
  // порт = громкий отказ «http://localhost:3000 is already used», а не молчаливый
  // прогон против чужого (20.09 там сидел Work Tracker Pro — 25 красных из мусора).
  // `!process.env.CI` из доки Playwright здесь не годится: локально CI не задан →
  // true → тот самый реюз. В CI порт свободен, поведение прежнее.
  webServer: E2E_BASE ? undefined : {
    command: 'node server.js',
    env: { PORT: '3000' }, // e2e stays isolated on 3000; dev/phone default is 3001
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Pixel 7'] },
    },
    // LAUNCH-7: second engine, not a replacement. iPhone 13 is a mobile
    // WebKit profile (Safari UA, 390×664 chrome-aware viewport). Pixel 7
    // on WebKit would still be an Android UA and miss the iPhone layout.
    {
      name: 'webkit',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
