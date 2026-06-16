// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test/e2e/report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 412, height: 915 }, // Pixel 7 — mobile form factor
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: 'node server.js',
    env: { PORT: '3000' }, // e2e stays isolated on 3000; dev/phone default is 3001
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
