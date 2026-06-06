# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: athlete-pro.spec.js >> App with Onboarding Bypassed >> Claude AI Coach FAB >> claude-overlay has close button
- Location: test\e2e\athlete-pro.spec.js:341:5

# Error details

```
TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('#claude-overlay') to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic:
    - generic:
      - img "Athlete Pro"
    - generic: Loading
  - generic [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - img "AP" [ref=e5]
        - generic [ref=e6]:
          - generic [ref=e7]: Athlete
          - generic [ref=e8]: Pro
      - generic [ref=e11]: Online
      - status "Privacy mode" [ref=e12]:
        - img [ref=e13]
      - generic [ref=e16]: 21:06
    - link "Skip to content" [ref=e17] [cursor=pointer]:
      - /url: "#screens"
    - generic [ref=e20]:
      - generic [ref=e22]: Ready to crush it?
      - generic [ref=e23]: Your training log is empty. Time to fix that.
      - button "Start First Workout" [ref=e24] [cursor=pointer]:
        - img [ref=e25]
        - text: Start First Workout
    - navigation [ref=e26]:
      - button "Home" [ref=e27] [cursor=pointer]:
        - img [ref=e28]
        - generic [ref=e31]: Home
      - button "Train" [ref=e32] [cursor=pointer]:
        - img [ref=e33]
        - generic [ref=e36]: Train
      - button "Stats" [ref=e37] [cursor=pointer]:
        - img [ref=e38]
        - generic [ref=e40]: Stats
      - button "Profile" [ref=e41] [cursor=pointer]:
        - img [ref=e42]
        - generic [ref=e45]: Profile
    - status [ref=e46]:
      - generic: 00:00
  - status
  - button "AI Coach" [ref=e50] [cursor=pointer]
```

# Test source

```ts
  243 |     });
  244 |   });
  245 | 
  246 |   // ─── 3. DYNAMIC ISLAND ────────────────────────────────────────────────────
  247 |   test.describe('Dynamic Island', () => {
  248 |     test.beforeEach(async ({ page }) => {
  249 |       await page.goto(BASE);
  250 |       await waitForBoot(page);
  251 |     });
  252 | 
  253 |     test('FIX-2: #dynamic-island created in DOM on boot', async ({ page }) => {
  254 |       await page.waitForSelector('#dynamic-island', { timeout: 5000 });
  255 |       const island = page.locator('#dynamic-island');
  256 |       await expect(island).toBeAttached();
  257 |     });
  258 | 
  259 |     test('#dynamic-island has network dot element', async ({ page }) => {
  260 |       await page.waitForSelector('#dynamic-island', { timeout: 5000 });
  261 |       const dot = page.locator('#dynamic-island .island-dot');
  262 |       await expect(dot).toBeAttached();
  263 |     });
  264 | 
  265 |     test('#dynamic-island is inside #app or body', async ({ page }) => {
  266 |       await page.waitForSelector('#dynamic-island', { timeout: 5000 });
  267 |       const isInAppOrBody = await page.evaluate(() => {
  268 |         const island = document.getElementById('dynamic-island');
  269 |         const app = document.getElementById('app') || document.body;
  270 |         return app?.contains(island) ?? false;
  271 |       });
  272 |       expect(isInAppOrBody).toBe(true);
  273 |     });
  274 |   });
  275 | 
  276 |   // ─── 4. DASHBOARD ─────────────────────────────────────────────────────────
  277 |   test.describe('Dashboard', () => {
  278 |     test.beforeEach(async ({ page }) => {
  279 |       await page.goto(BASE);
  280 |       await waitForBoot(page);
  281 |       await skipOnboarding(page);
  282 |       const homeActive = await page.locator('#s-home.active').count();
  283 |       if (!homeActive) {
  284 |         await page.locator('button[data-s="s-home"]').click();
  285 |         await expect(page.locator('#s-home')).toHaveClass(/active/, { timeout: 2000 });
  286 |       }
  287 |       await page.waitForTimeout(1200);
  288 |     });
  289 | 
  290 |     test('dashboard has content after load', async ({ page }) => {
  291 |       const homeHTML = await page.locator('#s-home').innerHTML();
  292 |       expect(homeHTML.length).toBeGreaterThan(200);
  293 |     });
  294 | 
  295 |     test('dashboard renders without visible error states', async ({ page }) => {
  296 |       const errCount = await page.locator('#s-home .error, #s-home [class*="error"]').count();
  297 |       expect(errCount).toBe(0);
  298 |     });
  299 |   });
  300 | 
  301 |   // ─── 5. WORKOUT SCREEN ────────────────────────────────────────────────────
  302 |   test.describe('Workout Screen', () => {
  303 |     test.beforeEach(async ({ page }) => {
  304 |       await page.goto(BASE);
  305 |       await waitForBoot(page);
  306 |       await skipOnboarding(page);
  307 |       await page.locator('button[data-s="s-train"]').click();
  308 |       await expect(page.locator('#s-train')).toHaveClass(/active/, { timeout: 3000 });
  309 |       await page.waitForTimeout(1000);
  310 |     });
  311 | 
  312 |     test('workout screen renders content', async ({ page }) => {
  313 |       const html = await page.locator('#s-train').innerHTML();
  314 |       expect(html.length).toBeGreaterThan(100);
  315 |     });
  316 | 
  317 |     test('workout screen has no JS crash', async ({ page }) => {
  318 |       const html = await page.locator('#s-train').innerHTML();
  319 |       expect(html).not.toContain('undefined');
  320 |     });
  321 |   });
  322 | 
  323 |   // ─── 6. CLAUDE AI FAB ─────────────────────────────────────────────────────
  324 |   test.describe('Claude AI Coach FAB', () => {
  325 |     test.beforeEach(async ({ page }) => {
  326 |       await page.goto(BASE);
  327 |       await waitForBoot(page);
  328 |       await skipOnboarding(page);
  329 |       await page.waitForSelector('#claude-fab', { timeout: 8000 });
  330 |     });
  331 | 
  332 |     test('Claude FAB is rendered and visible', async ({ page }) => {
  333 |       await expect(page.locator('#claude-fab')).toBeVisible();
  334 |     });
  335 | 
  336 |     test('clicking FAB opens claude-overlay', async ({ page }) => {
  337 |       await page.locator('#claude-fab').click({ force: true });
  338 |       await expect(page.locator('#claude-overlay')).toBeAttached({ timeout: 10000 });
  339 |     });
  340 | 
  341 |     test('claude-overlay has close button', async ({ page }) => {
  342 |       await page.locator('#claude-fab').click({ force: true });
> 343 |       await page.locator('#claude-overlay').waitFor({ timeout: 10000 });
      |                                             ^ TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
  344 |       await expect(page.locator('[aria-label="Close AI Coach"]')).toBeVisible();
  345 |     });
  346 | 
  347 |     test('close button dismisses overlay', async ({ page }) => {
  348 |       await page.locator('#claude-fab').click({ force: true });
  349 |       await page.locator('#claude-overlay').waitFor({ timeout: 10000 });
  350 |       await page.locator('[aria-label="Close AI Coach"]').click();
  351 |       await expect(page.locator('#claude-overlay')).not.toBeAttached({ timeout: 2000 });
  352 |     });
  353 | 
  354 |     test('FIX-4: AI error is a DOM node (not innerHTML injection)', async ({ page }) => {
  355 |       await page.locator('#claude-fab').click({ force: true });
  356 |       await page.locator('#claude-overlay').waitFor({ timeout: 10000 });
  357 |       await page.waitForTimeout(5000);
  358 |       const vulnerable = await page.evaluate(() => {
  359 |         for (const el of document.querySelectorAll('.ai-error')) {
  360 |           if (el.querySelector('script')) return true;
  361 |         }
  362 |         return false;
  363 |       });
  364 |       expect(vulnerable).toBe(false);
  365 |     });
  366 |   });
  367 | 
  368 |   // ─── 7. ANALYTICS SCREEN ──────────────────────────────────────────────────
  369 |   test.describe('Analytics Screen', () => {
  370 |     test('stats screen renders after nav', async ({ page }) => {
  371 |       await page.goto(BASE);
  372 |       await waitForBoot(page);
  373 |       await skipOnboarding(page);
  374 |       await page.locator('button[data-s="s-stats"]').click();
  375 |       await expect(page.locator('#s-stats')).toHaveClass(/active/, { timeout: 3000 });
  376 |       await page.waitForTimeout(1000);
  377 |       const html = await page.locator('#s-stats').innerHTML();
  378 |       expect(html.length).toBeGreaterThan(50);
  379 |     });
  380 |   });
  381 | 
  382 |   // ─── 8. PROFILE SCREEN ────────────────────────────────────────────────────
  383 |   test.describe('Profile Screen', () => {
  384 |     test('profile screen renders after nav', async ({ page }) => {
  385 |       await page.goto(BASE);
  386 |       await waitForBoot(page);
  387 |       await skipOnboarding(page);
  388 |       await page.locator('button[data-s="s-profile"]').click();
  389 |       await expect(page.locator('#s-profile')).toHaveClass(/active/, { timeout: 3000 });
  390 |       await page.waitForTimeout(1200);
  391 |       const html = await page.locator('#s-profile').innerHTML();
  392 |       expect(html.length).toBeGreaterThan(50);
  393 |     });
  394 |   });
  395 | 
  396 |   // ─── 9. SERVICE WORKER & PWA ──────────────────────────────────────────────
  397 |   test.describe('PWA & Service Worker', () => {
  398 |     test('manifest.json is served with correct fields', async ({ page }) => {
  399 |       const res = await page.request.get(`${BASE}/manifest.json`);
  400 |       expect(res.status()).toBe(200);
  401 |       const body = await res.json();
  402 |       expect(body.name).toBeTruthy();
  403 |       expect(body.start_url).toBeTruthy();
  404 |       expect(Array.isArray(body.icons)).toBe(true);
  405 |     });
  406 | 
  407 |     test('sw.js is served and contains v22 cache name', async ({ page }) => {
  408 |       const res = await page.request.get(`${BASE}/sw.js`);
  409 |       expect(res.status()).toBe(200);
  410 |       const text = await res.text();
  411 |       expect(text).toContain('athlete-pro-v22');
  412 |     });
  413 | 
  414 |     test('FIX-3: service worker registers (not nuked on boot)', async ({ page }) => {
  415 |       await page.goto(BASE);
  416 |       await waitForBoot(page);
  417 |       await page.waitForTimeout(2000);
  418 |       const swState = await page.evaluate(async () => {
  419 |         if (!('serviceWorker' in navigator)) return 'unsupported';
  420 |         const reg = await navigator.serviceWorker.getRegistration();
  421 |         return reg ? 'registered' : 'not-registered';
  422 |       });
  423 |       expect(swState).toBe('registered');
  424 |     });
  425 |   });
  426 | });
  427 | 
```