# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: athlete-pro.spec.js >> Onboarding Flow (Real) >> user can complete onboarding step-by-step
- Location: test\e2e\athlete-pro.spec.js:99:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button').filter({ hasText: 'Quick Start (Anonymous)' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('button').filter({ hasText: 'Quick Start (Anonymous)' })

```

```yaml
- img "AP"
- img "AP"
- text: Athlete Pro
- img
- text: 02:50
- button "A"
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
- heading "Tell us about you" [level=1]
- paragraph: For accurate strength tier comparisons.
- text: Sex
- button "Male"
- button "Female"
- text: Date of Birth
- combobox:
  - option "Year" [selected]
  - option "2026"
  - option "2025"
  - option "2024"
  - option "2023"
  - option "2022"
  - option "2021"
  - option "2020"
  - option "2019"
  - option "2018"
  - option "2017"
  - option "2016"
  - option "2015"
  - option "2014"
  - option "2013"
  - option "2012"
  - option "2011"
  - option "2010"
  - option "2009"
  - option "2008"
  - option "2007"
  - option "2006"
  - option "2005"
  - option "2004"
  - option "2003"
  - option "2002"
  - option "2001"
  - option "2000"
  - option "1999"
  - option "1998"
  - option "1997"
  - option "1996"
  - option "1995"
  - option "1994"
  - option "1993"
  - option "1992"
  - option "1991"
  - option "1990"
  - option "1989"
  - option "1988"
  - option "1987"
  - option "1986"
  - option "1985"
  - option "1984"
  - option "1983"
  - option "1982"
  - option "1981"
  - option "1980"
  - option "1979"
  - option "1978"
  - option "1977"
  - option "1976"
  - option "1975"
  - option "1974"
  - option "1973"
  - option "1972"
  - option "1971"
  - option "1970"
  - option "1969"
  - option "1968"
  - option "1967"
  - option "1966"
  - option "1965"
  - option "1964"
  - option "1963"
  - option "1962"
  - option "1961"
  - option "1960"
  - option "1959"
  - option "1958"
  - option "1957"
  - option "1956"
  - option "1955"
  - option "1954"
  - option "1953"
  - option "1952"
  - option "1951"
  - option "1950"
  - option "1949"
  - option "1948"
  - option "1947"
  - option "1946"
  - option "1945"
  - option "1944"
  - option "1943"
  - option "1942"
  - option "1941"
  - option "1940"
  - option "1939"
  - option "1938"
  - option "1937"
  - option "1936"
  - option "1935"
  - option "1934"
  - option "1933"
  - option "1932"
  - option "1931"
  - option "1930"
  - option "1929"
  - option "1928"
  - option "1927"
- combobox:
  - option "Month" [selected]
  - option "Jan"
  - option "Feb"
  - option "Mar"
  - option "Apr"
  - option "May"
  - option "Jun"
  - option "Jul"
  - option "Aug"
  - option "Sep"
  - option "Oct"
  - option "Nov"
  - option "Dec"
- combobox:
  - option "Day" [selected]
  - option "1"
  - option "2"
  - option "3"
  - option "4"
  - option "5"
  - option "6"
  - option "7"
  - option "8"
  - option "9"
  - option "10"
  - option "11"
  - option "12"
  - option "13"
  - option "14"
  - option "15"
  - option "16"
  - option "17"
  - option "18"
  - option "19"
  - option "20"
  - option "21"
  - option "22"
  - option "23"
  - option "24"
  - option "25"
  - option "26"
  - option "27"
  - option "28"
  - option "29"
  - option "30"
  - option "31"
- button:
  - img
- button "Continue" [disabled]
- img
- button "AI Assistant"
```

# Test source

```ts
  27  |       });
  28  | 
  29  |       req.addEventListener('success', (e) => {
  30  |         const db = req.result;
  31  |         if (db.objectStoreNames.contains('settings')) {
  32  |           const transaction = db.transaction('settings', 'readwrite');
  33  |             transaction.objectStore('settings').put({ key: 'onboarding-complete', value: true });
  34  |             transaction.objectStore('settings').put({ key: 'privacy.mode', value: 'cloud' });
  35  |             transaction.objectStore('settings').put({ key: 'privacy.aiEnabled', value: true });
  36  |           transaction.oncomplete = () => {
  37  |             if (appOnSuccess) appOnSuccess.call(req, e);
  38  |           };
  39  |           transaction.onerror = () => {
  40  |             if (appOnSuccess) appOnSuccess.call(req, e);
  41  |           };
  42  |         } else {
  43  |           if (appOnSuccess) appOnSuccess.call(req, e);
  44  |         }
  45  |       });
  46  | 
  47  |       return req;
  48  |     };
  49  |   });
  50  | }
  51  | 
  52  | /**
  53  |  * Wait for app to be interactive — either loading hidden OR nav visible.
  54  |  */
  55  | async function waitForBoot(page) {
  56  |   await page.waitForFunction(
  57  |     () => {
  58  |       // Option A: loading is hidden
  59  |       const loading = document.getElementById('loading');
  60  |       if (loading?.classList.contains('hidden')) return true;
  61  |       // Option B: nav bar is visible
  62  |       const nav = document.getElementById('nav');
  63  |       if (nav && nav.offsetHeight > 0) return true;
  64  |       // Option C: onboarding overlay is visible
  65  |       const onboarding = document.getElementById('onboarding-overlay');
  66  |       if (onboarding) return true;
  67  |       return false;
  68  |     },
  69  |     { timeout: 12000 }
  70  |   );
  71  | }
  72  | 
  73  | /** Legacy helper, click through steps if visible */
  74  | async function skipOnboarding(page) {
  75  |   const overlay = page.locator('#onboarding-overlay');
  76  |   if (await overlay.count() > 0 && await overlay.isVisible()) {
  77  |     const nextBtn = page.locator('#ob-next-btn');
  78  | 
  79  |     // Select Strength goal
  80  |     await page.locator('.ob-card[data-key="strength"]').click({ timeout: 3000 });
  81  |     await nextBtn.click({ timeout: 3000 });
  82  | 
  83  |     // Select Beginner experience
  84  |     await page.locator('.ob-card[data-key="beginner"]').click({ timeout: 3000 });
  85  |     await nextBtn.click({ timeout: 3000 });
  86  | 
  87  |     // Finish onboarding
  88  |     await page.locator('button', { hasText: 'Quick Start (Anonymous)' }).click({ timeout: 3000 });
  89  |     await page.locator('#ob-finish-btn').click({ timeout: 3000 });
  90  | 
  91  |     // Wait for overlay to disappear
  92  |     await expect(overlay).not.toBeAttached({ timeout: 4000 });
  93  |   }
  94  | }
  95  | 
  96  | // ─── ONBOARDING FLOW ────────────────────────────────────────────────────────
  97  | 
  98  | test.describe('Onboarding Flow (Real)', () => {
  99  |   test('user can complete onboarding step-by-step', async ({ page }) => {
  100 |     await page.goto(BASE);
  101 |     await waitForBoot(page);
  102 | 
  103 |     // Verify onboarding overlay is visible
  104 |     const overlay = page.locator('#onboarding-overlay');
  105 |     await expect(overlay).toBeVisible({ timeout: 5000 });
  106 | 
  107 |     // Step 1: Goal selection
  108 |     // Next button should be disabled initially
  109 |     const nextBtn = page.locator('#ob-next-btn');
  110 |     await expect(nextBtn).toBeDisabled();
  111 | 
  112 |     // Select Strength goal
  113 |     await page.locator('.ob-card[data-key="strength"]').click();
  114 |     await expect(nextBtn).toBeEnabled();
  115 |     await nextBtn.click();
  116 | 
  117 |     // Step 2: Experience selection
  118 |     await expect(nextBtn).toBeDisabled();
  119 | 
  120 |     // Select Beginner experience
  121 |     await page.locator('.ob-card[data-key="beginner"]').click();
  122 |     await expect(nextBtn).toBeEnabled();
  123 |     await nextBtn.click();
  124 | 
  125 |     // Step 3: Confirmation / Ready Screen
  126 |     const finishBtn = page.locator('button', { hasText: 'Quick Start (Anonymous)' });
> 127 |     await expect(finishBtn).toBeVisible();
      |                             ^ Error: expect(locator).toBeVisible() failed
  128 |     await finishBtn.click();
  129 |     
  130 |     const letsGoBtn = page.locator('#ob-finish-btn');
  131 |     await expect(letsGoBtn).toBeVisible();
  132 |     await letsGoBtn.click();
  133 | 
  134 |     // Onboarding should close and redirect to dashboard
  135 |     await expect(overlay).not.toBeAttached({ timeout: 3000 });
  136 |     await expect(page.locator('#s-home')).toHaveClass(/active/, { timeout: 3000 });
  137 |   });
  138 | });
  139 | 
  140 | // ─── BYPASSED ONBOARDING SUITES ─────────────────────────────────────────────
  141 | 
  142 | test.describe('App with Onboarding Bypassed', () => {
  143 |   test.beforeEach(async ({ page }) => {
  144 |     page.on('console', msg => {
  145 |       console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
  146 |     });
  147 |     page.on('pageerror', err => {
  148 |       console.error(`[BROWSER UNCAUGHT ERROR] ${err.stack || err.message}`);
  149 |     });
  150 |     page.on('requestfailed', request => {
  151 |       console.error(`[BROWSER REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText || 'unknown error'}`);
  152 |     });
  153 |     await bypassOnboarding(page);
  154 |   });
  155 | 
  156 |   // ─── 1. BOOT & VIEWPORT ───────────────────────────────────────────────────
  157 |   test.describe('Boot & Viewport', () => {
  158 |     test('app boots and nav bar is visible', async ({ page }) => {
  159 |       await page.goto(BASE);
  160 |       await waitForBoot(page);
  161 |       const nav = page.locator('#nav');
  162 |       await expect(nav).toBeVisible({ timeout: 10000 });
  163 |     });
  164 | 
  165 |     test('FIX-1: html element uses 100dvh (mobile viewport fix)', async ({ page }) => {
  166 |       await page.goto(BASE);
  167 |       // Check style block contains 100dvh
  168 |       const hasDvh = await page.evaluate(() => {
  169 |         const styles = Array.from(document.querySelectorAll('style'));
  170 |         return styles.some(s => s.textContent.includes('100dvh'));
  171 |       });
  172 |       expect(hasDvh).toBe(true);
  173 |     });
  174 | 
  175 |     test('status bar is present in DOM', async ({ page }) => {
  176 |       await page.goto(BASE);
  177 |       await expect(page.locator('#status-bar')).toBeAttached({ timeout: 5000 });
  178 |     });
  179 | 
  180 |     test('status bar logo is rendered', async ({ page }) => {
  181 |       await page.goto(BASE);
  182 |       await waitForBoot(page);
  183 |       const logoText = page.locator('.status-logo-text');
  184 |       await expect(logoText).toBeVisible({ timeout: 5000 });
  185 |     });
  186 | 
  187 |     test('clock shows time in status bar', async ({ page }) => {
  188 |       await page.goto(BASE);
  189 |       await waitForBoot(page);
  190 |       await page.waitForTimeout(500);
  191 |       const time = await page.locator('#status-time').textContent();
  192 |       expect(time).toMatch(/\d{2}:\d{2}/);
  193 |     });
  194 | 
  195 |     test('navigation bar has 4 buttons', async ({ page }) => {
  196 |       await page.goto(BASE);
  197 |       await waitForBoot(page);
  198 |       const navBtns = page.locator('#nav .nav-btn');
  199 |       await expect(navBtns).toHaveCount(4);
  200 |     });
  201 | 
  202 |     test('page has no critical JS errors on boot', async ({ page }) => {
  203 |       const errors = [];
  204 |       page.on('pageerror', (err) => {
  205 |         if (!err.message.includes('vibrate') &&
  206 |             !err.message.includes('Intervention') &&
  207 |             !err.message.includes('ServiceWorker')) {
  208 |           errors.push(err.message);
  209 |         }
  210 |       });
  211 |       await page.goto(BASE);
  212 |       await waitForBoot(page);
  213 |       await page.waitForTimeout(1500);
  214 |       expect(errors).toHaveLength(0);
  215 |     });
  216 |   });
  217 | 
  218 |   // ─── 2. NAVIGATION ────────────────────────────────────────────────────────
  219 |   test.describe('Navigation', () => {
  220 |     test.beforeEach(async ({ page }) => {
  221 |       await page.goto(BASE);
  222 |       await waitForBoot(page);
  223 |       await skipOnboarding(page);
  224 |       await page.waitForTimeout(400);
  225 |     });
  226 | 
  227 |     test('home screen is active by default', async ({ page }) => {
```