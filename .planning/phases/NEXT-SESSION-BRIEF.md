# Next Session Brief — Phase 2+3 (Profile Passport UI)

> Session #1 done: Foundation (Phase 0) + Privacy (Phase 1).
> Next: Profile Passport — Fast Mode + Strength UI surface.

---

## HARD CONSTRAINTS (apply to ALL new code)

### Core
- **Diffs only.** No boilerplate, no re-explaining what's there.
- **Vanilla JS (ES Modules).** No frameworks, no jQuery, no build step.
- **Strict Store → View 1-way flow.** View NEVER touches DB directly.
  - Store modules own `DB.*` calls and state.
  - View modules import from Store, render HTML, attach handlers.
  - User action → handler → Store mutation → Store notifies → View re-renders.

### UI
- **Vantablack Glassmorphism.** `--c-bg = #08080c`, surfaces are alpha-shifted whites with `backdrop-filter: blur(...) saturate(...)`.
- **4-nav bottom bar is MANDATORY** on every screen (Home / Train / Stats / Profile).
- **NO 1px borders.** Depth comes from surface alpha shifts + backdrop-blur + soft shadows.
- **Touch targets: 44px minimum.** No exceptions for tappable elements.

### Typography
- **Manrope** global (already wired).
- **Metrics: 32px / 900 / `letter-spacing: -0.02em` / `font-variant-numeric: tabular-nums`**.
- **Metric system only**: kg, cm. Never lbs/in/ft.

### Colors
- **CSS vars STRICTLY.** Use `--c-*`, `--bg-card`, `--glow-*`. **No HEX literals in new code.**
- **NO RED** in new code. Use `--c-amber` (yellow/orange) or `--c-red` only if existing pink tone (`#e8848c`). For warnings/danger prefer amber-orange-pink palette.
- Day colors: `--c-accent` (push/green), `--c-purple` (pull), `--c-blue` (legs).

### Locale
- **RU toggle logic required.** Add `js/locale.store.js` with `setLocale('en'|'ru')` + `t(key)` lookup. All new strings via `t()`. Persist choice in `DB.Settings` under `locale`.

---

## Already on disk (Phase 0 + 1)

```
js/profile.store.js       schema + computed (BMI, FFMI, age, sealed envelope)
js/privacy.store.js       tri-state mode + safeFetch + audit log
js/privacy.view.js        toggle UI + Data Passport + Audit modal
js/strength-engine.js     ExRx + DOTS + McCulloch + IPF/IWF + symmetry + translator
js/insights.engine.js     rule-based offline coach (7 insight types)
css/privacy.css           tri-state UI + status bar lock + passport + audit
sw.js                     privacy-aware, never caches /api/*, airgap = synthetic 503
```

safeFetch wired at 4 sites: `claude.store.js` ×2, `workout.store.js`, `supabase-check.js`.

---

## Session #2 — Profile Passport · Fast Mode + Strength UI (~81k)

### Files to create

```
js/profile.view.js                       barrel + renderProfile()
js/profile.view/passport-hero.js         avatar + name + tier pill + stats strip
js/profile.view/bento.js                 2×2: DOTS / Streak / Volume / Hours
js/profile.view/hexagon-radar.js         6-axis pure SVG, animated polygon
js/profile.view/lift-bars.js             4 lifts with tier-dot positions
js/locale.store.js                       en/ru dict + t() + toggle
css/profile.css                          EXTEND (do not replace)
```

### Files to update

```
js/profile.js                            delegate to renderProfile() (keep legacy fallback)
js/app.js                                register window.ProfileView + initLocale()
```

### Done criteria

- [ ] Profile screen renders Fast Mode: hero / bento / radar / lift bars / Privacy card / "Custom mode ↓"
- [ ] All metrics styled 32px/900 with tabular-nums
- [ ] Hexagon radar animates fill on first paint
- [ ] Lift bars show tier dot at correct position (computed via `exrxTier`)
- [ ] Day-color tints applied via `data-day` attr or category class
- [ ] Bottom 4-nav still visible and functional
- [ ] No 1px borders anywhere in new CSS
- [ ] No HEX literals in new JS/CSS (`#fff` permitted in existing files only)
- [ ] No `--c-red` used for new states (use amber/orange)
- [ ] EN/RU toggle works — switches all strings in Profile screen
- [ ] `node --check` passes on all touched files
- [ ] View modules never call `DB.*` directly — Store handles persistence

### What NOT to do

- Don't refactor existing `body-stats.js` — keep Body screen as-is (separate tab `s-body`)
- Don't touch Workout screens
- Don't replace `css/profile.css` — extend
- Don't break legacy `Profile.load()` API — keep window.Profile pointing to delegated implementation
- Avatar implementation deferred to Session #4

---

## Session #3 — Profile Custom Mode (~76k)

Inline-expand accordion below Fast Mode. Cards:
identity-edit · body comp · 6-week volume chart · IPF+IWF · strength translator · symmetry · settings · data ops.

## Session #4 — Avatar + Gym Passport (~47k)

DB v2 migration for avatars store · canvas crop 256×256 · initials fallback · sharable Gym Passport PNG export.

## Session #5 — Conversational Onboarding (~66k)

10-step swipe flow · privacy choice first · sealed envelope · animated radar reveal.

## Session #6 — Polish (~35k)

Sealed envelope reveal · tier-up notif · legacy user privacy prompt · ghost mode · MODULES.md.

---

## Locale dict scaffold (Session #2 must implement)

```js
// js/locale.store.js
const DICT = {
  en: {
    'profile.title': 'Profile',
    'profile.wilks': 'DOTS',
    'profile.streak': 'Streak',
    'profile.volume30d': '30d Volume',
    'profile.hours30d': '30d Hours',
    'profile.customMode': 'Custom mode',
    'privacy.title': 'Privacy',
    'privacy.cloud': 'Cloud',
    'privacy.anon': 'Anonymous',
    'privacy.airgap': 'Air-Gapped',
    // ...
  },
  ru: {
    'profile.title': 'Профиль',
    'profile.wilks': 'DOTS',
    'profile.streak': 'Серия',
    'profile.volume30d': 'Объём 30 дней',
    'profile.hours30d': 'Часы 30 дней',
    'profile.customMode': 'Расширенный режим',
    'privacy.title': 'Приватность',
    'privacy.cloud': 'Облако',
    'privacy.anon': 'Аноним',
    'privacy.airgap': 'Без сети',
    // ...
  },
};
```

Toggle UI: chip in Profile header `[EN][RU]`.

---

## Recap of Phase 1 behavior (so #2 doesn't re-discover)

- `getPrivacyMode()` and `getAiEnabled()` are synchronous (cached after `initPrivacy()` which runs at boot).
- `safeFetch(url, opts, kind)` — `kind ∈ {'ai', 'sync', 'static'}`.
- `PrivacyBlockedError` thrown when blocked; existing AI call sites already handle gracefully.
- `renderPrivacyCard()` from `privacy.view.js` is a string — drop into HTML template.
- Status bar `#privacy-indicator` updates automatically via `onPrivacyChange()`.
- Insights fallback already wired into `fetchCoach` — when AI off, generates local text from `insights.engine.js`.

---

## Files to read first (Session #2)

1. **This brief**
2. `js/profile.store.js` — schema you'll bind to
3. `js/strength-engine.js` — math you'll surface in UI
4. `js/privacy.view.js` — pattern for view module + window-bridge
5. `css/privacy.css` — extend with same aesthetic (glass + glow tokens)
