# Handoff Report: Survey Explorer 3 — R3 (Motion Budget Optimization & Haptics)

## 1. Observation

### A. Layout Thrashing in `.intel-heat-bar` (`css/intel.css` & `js/intel.view.js`)
- **Location**: `css/intel.css`, lines 209-216:
  ```css
  .intel-heat-bar {
    height: 100%;
    width: calc(var(--heat-val, 0) * 100%);
    background: linear-gradient(90deg, #5b8def, #ff4d88);
    box-shadow: 0 0 8px currentColor;
    border-radius: 2px;
    transition: width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s linear;
  }
  ```
- **Location**: `js/intel.view.js`, lines 295-302 & line 554:
  ```javascript
  function decayHeat() {
    if (_heat > 0) {
      _heat = Math.max(0, _heat - 0.05);
      document.body.style.setProperty('--heat-val', _heat / 100);
    }
    requestAnimationFrame(decayHeat);
  }
  ```
- **Impact**: Updating `--heat-val` alters CSS `width`, which forces the rendering engine through **Recalculate Style → Layout (Reflow) → Paint → Composite** on every animation frame. `decayHeat()` executes inside `requestAnimationFrame` whenever `_heat > 0`, causing continuous Layout Thrashing and exceeding the 16ms motion budget.

---

### B. High-Frequency Stream Haptic Calls (`js/intel.view.js` & `js/shared/utils.js`)
- **Location**: `js/intel.view.js`, line 602:
  ```javascript
  if (parsed.text) {
    haptic(2);
    fullText += parsed.text;
    ...
  }
  ```
- **Location**: `js/shared/utils.js`, lines 66-87 (`haptic()` utility implementation):
  ```javascript
  export const haptic = (pattern = 10, elementToPulse = null) => {
    let vibrated = false;
    try {
      if (_hasInteracted && typeof navigator !== 'undefined' && navigator.vibrate) {
        vibrated = navigator.vibrate(pattern);
      }
    } catch (e) {}

    if (!vibrated && _hasInteracted) {
      const el = elementToPulse || document.activeElement || document.body;
      if (el && el !== document) {
        el.classList.remove('ios-haptic-pulse');
        void el.offsetWidth; // Forced synchronous layout reflow on iOS!
        el.classList.add('ios-haptic-pulse');
        setTimeout(() => el.classList.remove('ios-haptic-pulse'), 150);
      }
    }
  };
  ```
- **Impact**: During AI text streaming (`/api/coach` SSE stream), dozens to hundreds of `data:` chunks arrive per second. Calling `haptic(2)` on every chunk causes:
  1. Excessive `navigator.vibrate` calls on Android/desktop.
  2. Severe forced synchronous reflows via `void el.offsetWidth` on iOS fallback for every streaming chunk.
  3. High CPU overhead and battery drain.

---

## 2. Logic Chain

1. **GPU Acceleration for `.intel-heat-bar`**:
   - `width` changes trigger geometric reflows affecting parent containers (`.intel-heat-bar-wrap`, `.intel-cmd-wrap`).
   - By setting `.intel-heat-bar` width to `100%` and applying `transform: scaleX(var(--heat-val, 0))`, changes to `--heat-val` scale the element horizontally.
   - Using `transform-origin: left center` ensures scaling expands from left to right inside `.intel-heat-bar-wrap`.
   - CSS `will-change: transform` promotes `.intel-heat-bar` to a hardware-accelerated GPU layer.
   - Rendering pipeline is reduced from **Style → Layout → Paint → Composite** to **Style → Composite** (0ms Layout cost).

2. **Suppression of Stream Haptics**:
   - `haptic(2)` inside the SSE stream `for (const line of lines)` loop (line 602 in `js/intel.view.js`) serves no discrete user feedback purpose and degrades performance.
   - Removing `haptic(2)` from line 602 eliminates all per-token vibration requests and eliminates the `void el.offsetWidth` reflow chain during text streaming.
   - Single-tap user gesture haptics (e.g., `startVoice` `haptic(20)`, `stopVoice` `haptic(10)`, module card actions `haptic(10)`) remain completely untouched and responsive.

---

## 3. Caveats

- **Transform Anchor**: `transform-origin: left center` MUST be explicitly defined in CSS so `scaleX()` scales from left to right instead of the default center origin (`50% 50%`).
- **Border Radius with Scale**: At `scaleX(0)`, border-radius is scaled to 0, which is visually correct as the bar is invisible when heat value is 0.
- **Hardware Differences**: On devices without vibration hardware (or iOS Safari), `haptic()` triggers DOM class toggling. Removing stream `haptic(2)` is especially beneficial for iOS web apps.

---

## 4. Conclusion & Actionable Refactoring Diffs

### Diff 1: `css/intel.css` (GPU Acceleration for Heat Bar)

```diff
--- css/intel.css
+++ css/intel.css
@@ -209,9 +209,11 @@
 .intel-heat-bar {
   height: 100%;
-  width: calc(var(--heat-val, 0) * 100%);
+  width: 100%;
+  transform-origin: left center;
+  transform: scaleX(var(--heat-val, 0));
   background: linear-gradient(90deg, #5b8def, #ff4d88);
   box-shadow: 0 0 8px currentColor;
   border-radius: 2px;
-  transition: width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s linear;
+  will-change: transform;
+  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.3s linear;
 }
```

### Diff 2: `js/intel.view.js` (Stream Haptic Suppression)

```diff
--- js/intel.view.js
+++ js/intel.view.js
@@ -599,7 +599,6 @@
               try {
                 const parsed = JSON.parse(data);
                 if (parsed.text) {
-                  haptic(2);
                   fullText += parsed.text;
                   if (feedbackText) {
                     let renderText = fullText;
```

---

## 5. Verification Method

1. **CSS GPU Acceleration Verification**:
   - Inspect `.intel-heat-bar` in Chrome DevTools Elements panel.
   - Verify CSS rules: `width: 100%`, `transform-origin: left center`, `transform: scaleX(var(--heat-val, 0))`.
   - Open Chrome DevTools → Rendering panel → check "Paint flashing" and "Layout Shift Regions".
   - Trigger AI prompt in P.A.N.D.A. Core. Verify `.intel-heat-bar` updates without triggering green paint flashes or layout shifts on surrounding elements.

2. **Stream Haptic & Single-Tap Verification**:
   - Open `js/intel.view.js` and verify `haptic(2)` is removed from the streaming loop.
   - Run AI stream test. Confirm no console warnings/errors regarding `navigator.vibrate` or layout thrashing during streaming.
   - Tap mic button (`startVoice`), stop button (`stopVoice`), or action cards (`createWorkout`). Confirm `haptic(10)` / `haptic(20)` still trigger expected single-tap feedback.
