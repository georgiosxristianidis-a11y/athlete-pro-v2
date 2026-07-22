> **DEPRECATED / АРХИВ (2026-07-22).** Этот спек описывает несуществующий «Vantablack» (золото #F2CA50, Plus Jakarta, «границы запрещены») и противоречит живой Obsidian-палитре. Не источник правды. Актуальный дизайн-спек — `CLAUDE.md` § Design. Хранится только для истории.

# Design System: Vantablack Luxury & Performance

## 1. Overview & Creative North Star
**Creative North Star: "The Obsidian Sanctuary"**

This design system is not a utility; it is a private gallery for high-performance living. It rejects the cluttered "dashboard" aesthetic of common fitness apps in favor of an elite, editorial experience. We achieve this through **Vantablack Depth**: a UI that feels like it’s carved out of infinite space rather than built on a screen.

To move beyond the "template" look, we utilize **Asymmetric Quietude**. We don’t fill every corner. We use massive whitespace (the `24` and `20` spacing tokens) to frame content like high-end jewelry. By limiting borders to translucent glass hairlines (`--c-border` 6% / `--c-border-h` 12% — never opaque, never hardcoded) and avoiding traditional shadows, we force the user’s eye to follow tonal shifts and luminous glows, creating a sense of calm authority.

---

## 2. Colors & Surface Philosophy
The palette is rooted in the absence of light, using gold and emerald not as decorative colors, but as "signals of prestige."

### The "No-Line" Rule
**Explicit Instruction:** 1px solid borders for sectioning are strictly prohibited. 
Boundaries must be defined solely through background color shifts. If a section needs to end, transition from `surface-container-low` (#1C1B1B) to the primary `background` (#131313). Contrast is achieved through depth, not strokes.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked obsidian sheets. 
- **Base Layer:** `surface` (#131313) or `surface-container-lowest` (#0E0E0E).
- **Secondary Content:** `surface-container` (#201F1F).
- **Interaction Layers:** `surface-bright` (#3A3939) used only for hovering or active states.

### The "Glass & Gradient" Rule
For top-tier metrics or floating navigation, use the **Ultra-Thin Glass** specification:
- **Fill:** `rgba(255, 255, 255, 0.02)`
- **Backdrop Blur:** `40px+`
- **Inner Glow:** A subtle 0.5px top-edge highlight using `outline-variant` at 10% opacity to simulate a light catch on glass.

### Signature Accents
- **Champagne Gold (`primary` / #F2CA50):** Use only for primary calls to action or "Elite" status indicators.
- **Forest Emerald (`secondary_container` / #0B513D):** Use for "Success" states and performance gains. It should feel like a deep, glowing ember in the dark.

---

## 3. Typography
We use **Plus Jakarta Sans** to maintain a modern, geometric precision that feels engineered.

- **Display Scales (`display-lg` to `display-sm`):** These are your "Hero" moments. Use these for single, high-impact numbers (e.g., Heart Rate, Total Volume). Set these with tight tracking (-0.02em) to feel premium.
- **Headline Scales (`headline-lg` to `headline-sm`):** Used for workout titles. These should always sit on a clean `background` with maximum whitespace.
- **Body & Labels:** Use `on_surface_variant` (#D0C5AF) for secondary body text to reduce eye strain against the black background. Reserve `on_surface` (#E5E2E1) for active, readable content.

---

## 4. Elevation & Depth
In this system, elevation is not "up"; it is "light."

- **The Layering Principle:** To lift a card, do not add a shadow. Instead, move it from `surface-container-low` to `surface-container-high`.
- **Ambient Glows:** When a floating effect is required (e.g., a "Start Workout" button), use an outer glow instead of a shadow.
  - **Shadow Token:** 0px 10px 40px `rgba(212, 175, 55, 0.08)` (using a tinted version of the Champagne Gold).
- **The Ghost Border Fallback:** If a layout absolutely requires a container edge for accessibility, use the `outline-variant` (#4D4635) at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons
- **Primary:** Filled with `primary_container` (#D4AF37). Typography is `on_primary_container` (#554300). No border. Roundedness: `full`.
- **Secondary (Glass):** Ultra-thin glass fill with a `40px` blur. Text in `primary_fixed` (#FFE088).
- **Tertiary:** Ghost style. No background. `label-md` text with an arrow icon.

### Input Fields
- **Base:** `surface-container-lowest` (#0E0E0E).
- **Active State:** The bottom edge glows with a 1px transition to `primary`. No full box stroke.
- **Typography:** Placeholder text uses `outline` (#99907C).

### Cards & Lists
- **Rule:** Forbid the use of divider lines.
- **Spacing:** Use the `8` (2.75rem) or `10` (3.5rem) spacing tokens to separate list items.
- **Depth:** Use a `surface-container-low` background for the card, and `surface-container-highest` for a "nested" element inside that card (like a specific exercise tag).

### Specialized Fitness Components
- **Progress Rings:** Use `secondary` (#95D3BA) for the stroke, but give the stroke a subtle outer glow of the same color to make it look like a neon filament in a dark room.
- **The "Pulse" Metric:** Use a `display-lg` font size for the value, paired with a `label-sm` unit (e.g., BPM) shifted 4px up for an editorial, staggered look.

---

## 6. Do's and Don'ts

### Do:
- **Embrace the Dark:** Keep 90% of the screen at `#050505` or `#131313`.
- **Use Intentional Asymmetry:** Align text to the left but place key metrics on the far right of a different horizontal plane to create "visual breathing room."
- **Soft Transitions:** Use 300ms easings for all hover states to maintain the "Calm" vibe.

### Don't:
- **No Pure White:** Never use `#FFFFFF`. Use `on_surface` (#E5E2E1) to prevent "retina burn" against the Vantablack background.
- **No Sharp Corners:** Avoid the `none` roundedness. Use `xl` (0.75rem) for cards and `full` for buttons to maintain a soft, high-end feel.
- **No High-Opacity Borders:** Never use a 100% opaque border. It breaks the illusion of depth and makes the app look like a standard template.

---

## 7. GIO / Audit: Antigravity UI Secrets (Ultrathink)
*Triggered by `#Gio #audit` directives.*

- **Spring Physics (Antigravity Motion):** Never use standard `ease` or `linear` transitions for interactions. Use custom curves like `cubic-bezier(0.175, 0.885, 0.32, 1.275)` for overshoot and bounce. UI elements must feel like they have physical mass.
- **120Hz Hardware Acceleration:** Animate ONLY `transform` and `opacity`. Animating width, height, or margins causes Layout Thrashing and drops frames. Use `will-change: transform` intelligently.
- **Apple/Vision Pro Glass (Vibrancy):** True glass bends light. Combine `backdrop-filter: blur(20px) saturate(150%) brightness(1.1)` with a 1px inner rim (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.08)`) to create depth.
- **Haptic Synchronization:** Tie visual micro-animations directly to physical feedback via `navigator.vibrate` (using the `haptic()` module). A 10ms click vibration makes the UI feel infinitely more premium.
- **Subpixel "Squircle" Geometry:** Avoid harsh corner transitions by mathematically nesting border radii (Outer Radius = Inner Radius + Padding).