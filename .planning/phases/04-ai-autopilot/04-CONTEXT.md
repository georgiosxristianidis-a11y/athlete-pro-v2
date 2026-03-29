# Phase 4: AI Autopilot — Context

**Gathered:** 2026-03-28
**Status:** Discuss-Phase ✅ Complete, Ready for Planning
**UX Research:** Elite fitness apps (Hevy, Strong, Fitbod, JEFIT)

---

## Domain Boundary

Transform AI coach from reactive chat panel to proactive training partner that:
1. Generates personalized PPL programs onboarding
2. Adapts load/volume after every workout based on performance + fatigue
3. Provides real-time in-workout guidance via proactive AI bubble
4. Detects plateaus and suggests deloads/modifications

**Scope:**
- New endpoint: `POST /api/generate-plan` (Claude tool_use for structured JSON)
- Post-workout summary modal with AI recommendations
- Proactive AI bubble (visible only when AI has suggestions)
- Weekly summary with plateau detection
- Dashboard cards for next-session recommendations

**Out of Scope (Deferred):**
- Export to PDF / Google Sheets
- Voice interaction during workout
- Video form analysis

---

## Implementation Decisions (Fixed)

### Program Generation Flow
| Decision | Rationale |
|----------|-----------|
| **Trigger:** Auto for new users (no `ap-custom-plan`) + on-demand button | Zero-config onboarding + user control |
| **Input:** Workout history (1RM, volume, RPE, fatigue). New users → DEFAULT_PLAN | Data-driven personalization |
| **Output:** Structured JSON `{push:[...], pull:[...], legs:[...]}` | Reliable parsing, easy validation |
| **Endpoint:** `POST /api/generate-plan` with Claude tool_use | Structured output guarantee |
| **Confirmation:** Preview in AI panel + "Accept" button | User oversight before commit |
| **Regeneration:** Button in Claude panel | Iterative refinement via chat |

---

### Adaptive Load & Post-Workout
| Decision | Rationale |
|----------|-----------|
| **Timing:** After workout finish + next session preview | Contextual relevance |
| **Display:** Auto modal after "Finish Workout" + "View Summary" button | Immediate feedback + reaccessibility |
| **Content:** Volume %, PRs, RPE avg, rest time, next-session weights | Comprehensive summary |
| **Weight suggestions:** Inline in exercise cards based on 1RM calc | Actionable, contextual |
| **Persistence:** `localStorage.ap-recommendations-{type}` with 7-day expiry | Offline-first, auto-cleanup |

---

### In-Workout AI Access
| Decision | Rationale |
|----------|-----------|
| **Format:** Mini AI bubble (✨) floating button | Low visual footprint |
| **Visibility:** **Proactive only** — appears when AI has suggestion | Clean UI, no clutter |
| **Position:** Top-right corner of workout screen | Thumb-reachable, non-obstructive |
| **Actions:** "Ask about exercise", "Adjust weight", "Why this rep?", "Form tips" | Context-aware help |
| **Hidden state:** Fully transparent when not active | Zero distraction |

---

### Progressive Overload Display
| Decision | Rationale |
|----------|-----------|
| **Inline suggestions:** "Set 3: 102.5kg x 4-6 ↑" in set card | Immediate actionability |
| **Color coding:** 🟢 PR / 🔵 Recommended / ⚪ Normal | Instant visual recognition |
| **Plateau detection:** 3+ sessions without progress | Statistically significant |
| **Plateau alert:** **Weekly summary only** (not intrusive) | Contextual, not annoying |
| **Suggestion source:** Hybrid — simple progression (+2.5kg) baseline + AI notes | Cost-efficient, accurate |

---

## UX Flow Diagram

```
┌─────────────────────────────────────────────────────┐
│  WORKOUT SCREEN (AI bubble hidden by default)       │
│                                                     │
│  [Squat]                              [AI ✨] ← show │
│  Set 1: 100kg x 5 ✓                                  │
│  Set 2: 100kg x 5 ✓                                  │
│  Set 3: 102.5kg x 4-6 ↑                              │
│                                                     │
│  [Finish Workout]                                   │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│  POST-WORKOUT SUMMARY (auto after finish)           │
│                                                     │
│  🎉 Volume: +12% vs last week                       │
│  💪 New PR: Squat 505kg total                       │
│  ⏱️  RPE Avg: 7.2                                   │
│                                                     │
│  [Close] [Share]                                    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│  WEEKLY SUMMARY (plateau alerts if applicable)      │
│                                                     │
│  ⚠️  Bench Press: No progress in 2 weeks            │
│      "Consider deload or increase protein"          │
│                                                     │
│  [Ask AI] [Dismiss]                                 │
└─────────────────────────────────────────────────────┘
```

---

## Canonical References

**Downstream agents MUST read before planning:**

### Requirements
- `.planning/REQUIREMENTS.md` — AI-1 through AI-4 acceptance criteria
- `.planning/ROADMAP.md` — Phase 4 success criteria

### Existing Implementation
- `js/claude.js` / `js/claude.store.js` / `js/claude.view.js` — Current AI coach architecture
- `js/workout.store.js` — Workout data layer, 1RM calculation
- `routes/coach.js` — Existing `/api/coach` endpoint (SSE streaming)
- `lib/anthropicClient.js` — Claude SDK initialization

### Related Code
- `js/db.js` — IndexedDB layer (workouts, oneRM stores)
- `index.html` — AI panel DOM structure, navigation
- `css/claude.css` — AI panel styles

---

## Code Context

### Reusable Assets
- `fetchCoach()` function in `claude.store.js` — SSE streaming already implemented
- `ClaudeState` with getter/setter accessors — reactive-ready
- `window.claudeBridge` in `app.js` — onclick handler exposure
- Plate calculator (`js/plate-calc.js`) — weight suggestion logic reference
- Rest timer pattern (`js/rest-timer.js`) — modal + countdown reference

### Established Patterns
- Store/View split — state logic separate from DOM rendering
- Lazy module loading via dynamic `import()` in `shell.js`
- Modal pattern: `.modal-overlay` / `.modal-sheet` / `.modal-handle`
- Toast notifications: `Toast.show(msg, type, duration)`
- localStorage keys: `ap-recommendations-{type}` (from AI-2 implementation)

### Integration Points
- `sw.js` ASSETS list — must include new JS/CSS files
- `routes/coach.js` — extend or create new `/api/generate-plan`
- `index.html` — AI bubble DOM element, weekly summary container
- Dashboard load sequence — add recommendations card

---

## Specific Ideas (User Preferences)

| Feature | User Preference |
|---------|-----------------|
| **Post-workout summary** | Auto-show after Finish + "View Summary" button |
| **AI bubble visibility** | Proactive only (hide when no suggestion) |
| **Plateau alert frequency** | Weekly summary only (not per-session) |
| **AI cost optimization** | Hybrid: simple math + AI for notes/warnings |

---

## Deferred Ideas

- PDF / Google Sheets export — separate feature request
- Voice commands during workout — future enhancement
- Video form analysis — requires ML integration

---

## Research Insights (Elite Apps)

### Hevy
- Post-workout: Volume comparison, PR celebration with animation
- Progressive overload: Shows "Last workout" weights as reference
- Social features (not applicable to Fit Elite)

### Strong
- Minimalist UI, clean progression tracking
- Graph-based analytics (7d/30d/90d trends)
- No AI features — pure tracking

### Fitbod
- AI-generated workouts based on equipment/goals
- "Recommended Weight" per exercise (1RM-based)
- Recovery Score (fatigue indicator)
- No chat interface — static recommendations

### JEFIT
- Exercise database with GIF demonstrations
- Detailed analytics dashboard
- Community features

### Key Takeaways for Fit Elite
1. **Differentiation:** AI chat + proactive suggestions (no competitor has this)
2. **UX Standard:** Post-workout summary is expected pattern
3. **Inline Suggestions:** Fitbod's "Recommended Weight" is gold standard
4. **Clean UI:** Strong proves minimalism wins for workout logging

---

## Implementation Notes (AI-2 Already Done)

✅ **Adaptive Load (AI-2) — Completed:**
- Hybrid approach: simple progression (+2.5kg) + AI notes
- Post-workout modal shown immediately after completion
- Dashboard card displays recommendations (7-day expiry)
- localStorage persistence: `ap-recommendations-{type}`

**Remaining:**
- AI program generation (AI-1)
- In-workout AI dialog (AI-3)
- Progressive overload engine (AI-4)

---

*Phase: 04-ai-autopilot*
*Context gathered: 2026-03-28*
*Discuss-Phase: ✅ Complete*
