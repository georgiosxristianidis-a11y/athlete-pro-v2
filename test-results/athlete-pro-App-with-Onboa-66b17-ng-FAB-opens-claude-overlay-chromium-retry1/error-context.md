# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: athlete-pro.spec.js >> App with Onboarding Bypassed >> Claude AI Coach FAB >> clicking FAB opens claude-overlay
- Location: test\e2e\athlete-pro.spec.js:343:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('#claude-overlay')
Expected: attached
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 10000ms
  - waiting for locator('#claude-overlay')

```

```yaml
- img "AP"
- img "AP"
- text: Athlete Pro
- img
- text: 02:51
- button "A"
- button "Close mascot":
  - img
- text: Ready to crush it? Your training log is empty. Time to fix that.
- button "Start First Workout":
  - img
  - text: Start First Workout
- banner:
  - heading "P.A.N.D.A. Core" [level=1]
  - text: system secure | SYSTEM STANDBY
  - button "×"
- button:
  - img
- textbox "Command or vision query..."
- button:
  - img
- button "Weekly":
  - img
  - text: Weekly
- button "Create":
  - img
  - text: Create
- button "Анализ":
  - img
  - text: Анализ
- heading "STREAMING_LOGS" [level=3]
- text: ONLINE
- navigation:
  - button:
    - img
  - button:
    - img
  - button:
    - img
  - button:
    - img
- status: 00:00 ONLINE
- status
```

# Test source

```ts
  249 |       await expect(trainBtn).toHaveClass(/active/, { timeout: 5000 });
  250 |     });
  251 |   });
  252 | 
  253 |   // ─── 3. DYNAMIC ISLAND ────────────────────────────────────────────────────
  254 |   test.describe('Dynamic Island', () => {
  255 |     test.beforeEach(async ({ page }) => {
  256 |       await page.goto(BASE);
  257 |       await waitForBoot(page);
  258 |     });
  259 | 
  260 |     test('FIX-2: #dynamic-island created in DOM on boot', async ({ page }) => {
  261 |       await page.waitForSelector('#dynamic-island', { timeout: 5000 });
  262 |       const island = page.locator('#dynamic-island');
  263 |       await expect(island).toBeAttached();
  264 |     });
  265 | 
  266 |     test('#dynamic-island has network dot element', async ({ page }) => {
  267 |       await page.waitForSelector('#dynamic-island', { timeout: 5000 });
  268 |       const dot = page.locator('#dynamic-island .island-dot');
  269 |       await expect(dot).toBeAttached();
  270 |     });
  271 | 
  272 |     test('#dynamic-island is inside #app or body', async ({ page }) => {
  273 |       await page.waitForSelector('#dynamic-island', { timeout: 5000 });
  274 |       const isInAppOrBody = await page.evaluate(() => {
  275 |         const island = document.getElementById('dynamic-island');
  276 |         const app = document.getElementById('app') || document.body;
  277 |         return app?.contains(island) ?? false;
  278 |       });
  279 |       expect(isInAppOrBody).toBe(true);
  280 |     });
  281 |   });
  282 | 
  283 |   // ─── 4. DASHBOARD ─────────────────────────────────────────────────────────
  284 |   test.describe('Dashboard', () => {
  285 |     test.beforeEach(async ({ page }) => {
  286 |       await page.goto(BASE);
  287 |       await waitForBoot(page);
  288 |       await skipOnboarding(page);
  289 |       const homeActive = await page.locator('#s-home.active').count();
  290 |       if (!homeActive) {
  291 |         await page.locator('button[data-s="s-home"]').click();
  292 |         await expect(page.locator('#s-home')).toHaveClass(/active/, { timeout: 2000 });
  293 |       }
  294 |       await page.waitForTimeout(1200);
  295 |     });
  296 | 
  297 |     test('dashboard has content after load', async ({ page }) => {
  298 |       const homeHTML = await page.locator('#s-home').innerHTML();
  299 |       expect(homeHTML.length).toBeGreaterThan(200);
  300 |     });
  301 | 
  302 |     test('dashboard renders without visible error states', async ({ page }) => {
  303 |       const errCount = await page.locator('#s-home .error, #s-home [class*="error"]').count();
  304 |       expect(errCount).toBe(0);
  305 |     });
  306 |   });
  307 | 
  308 |   // ─── 5. WORKOUT SCREEN ────────────────────────────────────────────────────
  309 |   test.describe('Workout Screen', () => {
  310 |     test.beforeEach(async ({ page }) => {
  311 |       await page.goto(BASE);
  312 |       await waitForBoot(page);
  313 |       await skipOnboarding(page);
  314 |       await page.locator('button[data-s="s-train"]').click();
  315 |       await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 3000 });
  316 |       await page.waitForTimeout(1000);
  317 |     });
  318 | 
  319 |     test('workout screen renders content', async ({ page }) => {
  320 |       const html = await page.locator('#s-train').innerHTML();
  321 |       expect(html.length).toBeGreaterThan(100);
  322 |     });
  323 | 
  324 |     test('workout screen has no JS crash', async ({ page }) => {
  325 |       const html = await page.locator('#s-train').innerHTML();
  326 |       expect(html).not.toContain('undefined');
  327 |     });
  328 |   });
  329 | 
  330 |   // ─── 6. CLAUDE AI FAB ─────────────────────────────────────────────────────
  331 |   test.describe('Claude AI Coach FAB', () => {
  332 |     test.beforeEach(async ({ page }) => {
  333 |       await page.goto(BASE);
  334 |       await waitForBoot(page);
  335 |       await skipOnboarding(page);
  336 |       await page.waitForSelector('#claude-fab', { timeout: 8000 });
  337 |     });
  338 | 
  339 |     test('Claude FAB is rendered and visible', async ({ page }) => {
  340 |       await expect(page.locator('#claude-fab')).toBeVisible();
  341 |     });
  342 | 
  343 |     test('clicking FAB opens claude-overlay', async ({ page }) => {
  344 |       const mode = await page.evaluate(() => typeof window.__privacyMode !== 'undefined' ? window.__privacyMode() : 'missing');
  345 |       const ai = await page.evaluate(() => typeof window.__privacyAi !== 'undefined' ? window.__privacyAi() : 'missing');
  346 |       console.log(`Privacy mode: ${mode}, AI: ${ai}`);
  347 |       
  348 |       await page.locator('#claude-fab').click({ force: true });
> 349 |       await expect(page.locator('#claude-overlay')).toBeAttached({ timeout: 10000 });
      |                                                     ^ Error: expect(locator).toBeAttached() failed
  350 |     });
  351 | 
  352 |     test('claude-overlay has close button', async ({ page }) => {
  353 |       await page.locator('#claude-fab').click({ force: true });
  354 |       await page.locator('#claude-overlay').waitFor({ timeout: 10000 });
  355 |       await expect(page.locator('[aria-label="Close AI Coach"]')).toBeVisible();
  356 |     });
  357 | 
  358 |     test('close button dismisses overlay', async ({ page }) => {
  359 |       await page.locator('#claude-fab').click({ force: true });
  360 |       await page.locator('#claude-overlay').waitFor({ timeout: 10000 });
  361 |       await page.locator('[aria-label="Close AI Coach"]').click();
  362 |       await expect(page.locator('#claude-overlay')).not.toBeAttached({ timeout: 2000 });
  363 |     });
  364 | 
  365 |     test('FIX-4: AI error is a DOM node (not innerHTML injection)', async ({ page }) => {
  366 |       await page.locator('#claude-fab').click({ force: true });
  367 |       await page.locator('#claude-overlay').waitFor({ timeout: 10000 });
  368 |       await page.waitForTimeout(5000);
  369 |       const vulnerable = await page.evaluate(() => {
  370 |         for (const el of document.querySelectorAll('.ai-error')) {
  371 |           if (el.querySelector('script')) return true;
  372 |         }
  373 |         return false;
  374 |       });
  375 |       expect(vulnerable).toBe(false);
  376 |     });
  377 |   });
  378 | 
  379 |   // ─── 7. ANALYTICS SCREEN ──────────────────────────────────────────────────
  380 |   test.describe('Analytics Screen', () => {
  381 |     test('stats screen renders after nav', async ({ page }) => {
  382 |       await page.goto(BASE);
  383 |       await waitForBoot(page);
  384 |       await skipOnboarding(page);
  385 |       await page.locator('button[data-s="s-stats"]').click();
  386 |       await expect(page.locator('#s-stats')).toHaveClass(/active/, { timeout: 3000 });
  387 |       await page.waitForTimeout(1000);
  388 |       const html = await page.locator('#s-stats').innerHTML();
  389 |       expect(html.length).toBeGreaterThan(50);
  390 |     });
  391 |   });
  392 | 
  393 |   // ─── 8. PROFILE SCREEN ────────────────────────────────────────────────────
  394 |   test.describe('Profile Screen', () => {
  395 |     test('profile screen renders after nav', async ({ page }) => {
  396 |       await page.goto(BASE);
  397 |       await waitForBoot(page);
  398 |       await skipOnboarding(page);
  399 |       await page.locator('button[data-s="s-profile"]').click();
  400 |       await expect(page.locator('#s-profile')).toHaveClass(/active/, { timeout: 3000 });
  401 |       await page.waitForTimeout(1200);
  402 |       const html = await page.locator('#s-profile').innerHTML();
  403 |       expect(html.length).toBeGreaterThan(50);
  404 |     });
  405 |   });
  406 | 
  407 |   // ─── 9. SERVICE WORKER & PWA ──────────────────────────────────────────────
  408 |   test.describe('PWA & Service Worker', () => {
  409 |     test('manifest.json is served with correct fields', async ({ page }) => {
  410 |       const res = await page.request.get(`${BASE}/manifest.json`);
  411 |       expect(res.status()).toBe(200);
  412 |       const body = await res.json();
  413 |       expect(body.name).toBeTruthy();
  414 |       expect(body.start_url).toBeTruthy();
  415 |       expect(Array.isArray(body.icons)).toBe(true);
  416 |     });
  417 | 
  418 |     test('sw.js is served and contains v38 cache name', async ({ page, request }) => {
  419 |       const res = await request.get('/sw.js');
  420 |       expect(res.status()).toBe(200);
  421 |       const text = await res.text();
  422 |       expect(text).toContain('athlete-pro-v38');
  423 |     });
  424 | 
  425 |     test('FIX-3: service worker registers (not nuked on boot)', async ({ page }) => {
  426 |       await page.goto(BASE);
  427 |       await waitForBoot(page);
  428 |       await page.waitForTimeout(2000);
  429 |       const swState = await page.evaluate(async () => {
  430 |         if (!('serviceWorker' in navigator)) return 'unsupported';
  431 |         const reg = await navigator.serviceWorker.getRegistration();
  432 |         return reg ? 'registered' : 'not-registered';
  433 |       });
  434 |       expect(swState).toBe('registered');
  435 |     });
  436 |   });
  437 | });
  438 | 
```