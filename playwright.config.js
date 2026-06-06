// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
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
