# Changelog

All notable changes to Fit Elite (Athlete Pro) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.17.0] — 2026-06-08

### Phase 5: Smart UX & Micro-interactions — COMPLETE

#### Added

**Phase 5.1: Core Scenario Optimization**
- **Workout Creation Flow:** Staggered entry animations for Training Hub sections.
- **Profile Update UX:** Responsive feedback loop for stat/name updates (toast + auto-refresh).
- **Spring Progress Bar:** Dynamic animation for active plan progress in Training Hub.

**Phase 5.2: Elite Micro-interactions**
- **Staggered Animations:** Applied `stagger-item` globally for smoother screen transitions.
- **Progress Bar Polish:** Integrated `Spring` physics for Dashboard 1RM bars and Analytics progress bars.
- **View Transitions API:** Verified and optimized native cross-fade transitions.

**Phase 5.3: Feedback & Empty States**
- **Elite Empty States:** Upgraded Analytics screen with helpful guidance and calls-to-action for new users.
- **Skeleton Loaders:** Multi-line shimmering skeletons for AI responses (Claude Coach, Workout AI) and heavy stats cards.

#### Technical Details

**Modified Files (Phase 5):**
- `js/workout.view/render.js` — Added Training Hub animations and Spring progress bar.
- `js/dashboard.js` — Added Spring physics to 1RM bars.
- `js/analytics.view.js` — Added elite empty states and animated ORM bars.
- `js/shared/athlete-room.js` — Improved stat saving responsiveness with toasts and auto-refresh.
- `js/claude.view.js` — Replaced dots with multi-line skeleton loaders.
- `js/workout-ai.view.js` — Integrated proactive skeleton loaders for AI messages.
- `css/base.css` — Centralized global skeleton (`.sk`, `.sk-lines`) and shimmer animation.
- `css/dashboard.css` — Cleaned up redundant skeleton styles.

#### Verified
- ✅ All Phase 5 requirements met.
- ✅ GIO Standards (Minimalism & Air, No System Emojis) applied.
- ✅ Animations verified at 60fps.

---

## [1.0.0] — 2026-03-29

### 🎉 Milestone 1.0 — Elite Foundation — COMPLETE

#### Added

**Phase 1: Architecture Foundation**
- Store/View separation for workout, analytics, claude modules
- ES Modules migration (removed global namespace pollution)
- JSDoc type annotations on all public APIs
- Server refactor: routes/ + lib/ structure

**Phase 2: Performance & Reliability**
- Conditional Firebase SDK load (100KB savings)
- DB coalescing: 1 IndexedDB transaction instead of 4
- Lazy initialization for analytics + AI modules
- Service Worker: all JS files cached for offline use
- **Lighthouse Score: 97/100**

**Phase 3: Design System**
- css/base.css with unified components
- WCAG AA contrast compliance (#9ca3af for --c-text-3)
- focus-visible indicators on all inputs
- aria-labels on all icon buttons
- 44px minimum touch targets for streak dots
- Breakpoint system (<360px, 768px tablet)

**Phase 4: AI Autopilot**
- **AI-1:** AI-powered PPL program generation
  - Auto-generation for new users
  - On-demand regeneration via Claude panel
  - Preview modal with Accept/Regenerate buttons
- **AI-2:** Adaptive load recommendations
  - Post-workout summary modal
  - Dashboard card with next-session weights
  - localStorage persistence (7-day expiry)
- **AI-3:** In-workout AI dialog
  - Floating AI bubble (proactive visibility)
  - Mini chat overlay with quick actions
  - SSE streaming for real-time responses
- **AI-4:** Progressive overload engine
  - Inline suggestions in set cards
  - Color-coded indicators (🟢 PR / 🔵 Recommended / ⚪ Normal)
  - Plateau detection (3+ sessions without progress)
  - Weekly summary modal with PRs and alerts

#### Changed

- Updated CLAUDE.md with Phase 4 features
- Updated STATE.md with final milestone status
- All verification tests passing (21/21, 100%)

#### Technical Details

**New Files Created (Phase 4):**
- `js/workout-ai.view.js` — In-workout AI bubble and chat
- `js/progressive-overload.js` — Overload calculation and plateau detection
- `test/phase4-verification.js` — Automated verification tests
- `.planning/phases/04-ai-autopilot/*.md` — Planning documentation

**Modified Files (Phase 4):**
- `routes/coach.js` — Added POST /generate-plan endpoint
- `js/workout.store.js` — Added program generation functions
- `js/claude.store.js` — Added generatedPlan property
- `js/claude.view.js` — Added plan preview modal functions
- `js/app.js` — Added new user onboarding logic
- `js/workout.view.js` — Integrated AI features + inline suggestions
- `js/dashboard.js` — Added weekly summary modal
- `index.html` — Added plan preview modal DOM
- `css/claude.css` — Added plan preview styles
- `css/workout.css` — Added AI bubble, chat, and progression styles

#### Verified

- ✅ 21 automated verification tests (100% pass rate)
- ✅ All Phase 4 requirements met (AI-1, AI-2, AI-3, AI-4)
- ✅ Milestone 1.0 complete (4/4 phases)

---

## [0.9.0] — 2026-03-23

### Added

- Initial v0 feature-complete release
- PPL workout logging
- 1RM estimation
- Muscle fatigue heatmap
- AI chat via Claude Opus (SSE streaming)
- Dashboard/analytics/body stats/profile screens
- Offline PWA with Service Worker
- Rest timer
- Plate calculator
- Optional cloud sync (Supabase + Firebase)

---

## Pre-release — Before 2026-03-15

### Foundation

- Initial project setup
- Basic workout tracking
- IndexedDB storage
- Express server with Claude AI integration

---

## Future (v2.0 - TBD)

Potential features for next milestone:

- Cloud sync enhancements
- Advanced analytics and insights
- Mobile app (React Native?)
- Social features (workout sharing)
- Exercise video library
- Periodization programming
- Deload week auto-scheduling
- Integration with wearables (Fitbit, Garmin)
