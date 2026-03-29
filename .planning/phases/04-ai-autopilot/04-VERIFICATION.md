# Phase 4: AI Autopilot — Verification Plan

**Created:** 2026-03-28
**Status:** Ready for execution (after all plans complete)

---

## Goal

Verify all Phase 4 requirements (AI-1 through AI-4) are implemented correctly and work together as a cohesive AI Autopilot system.

---

## Verification Scope

**Requirements to Verify:**
- AI-1: AI generates PPL program based on user profile and goals
- AI-2: AI adapts load based on progress and fatigue scores ✅ (Already implemented)
- AI-3: In-workout AI dialog — real-time coaching during active session
- AI-4: Progressive overload recommendations

**Success Criteria (from ROADMAP.md):**
1. [x] ✅ Post-workout summary includes AI-generated load recommendations
2. [ ] New users receive a generated PPL program within their first session
3. [ ] AI chat is accessible from within the active workout screen
4. [ ] Progressive overload suggestions appear on exercise selection

---

## Test Scenarios

### Scenario 1: New User Onboarding (AI-1)

**Setup:**
```javascript
// Clear localStorage
localStorage.removeItem('ap-custom-plan');
localStorage.removeItem('ap-active-session');
```

**Steps:**
1. Load app (fresh session)
2. Navigate to Training screen
3. Observe: Plan preview modal appears
4. Click "Accept Plan"
5. Select Push workout
6. Observe: Exercises match generated plan

**Expected Results:**
- ✅ Plan preview modal shown within 5s of load
- ✅ Modal displays push/pull/legs sections
- ✅ "Accept" saves to localStorage
- ✅ Workout selector shows exercises from generated plan

**Test Command:**
```javascript
// In browser console
console.log('Custom plan:', localStorage.getItem('ap-custom-plan'));
// Should contain JSON with push:[], pull:[], legs:[]
```

---

### Scenario 2: Program Regeneration (AI-1)

**Setup:**
```javascript
// Ensure plan exists
const plan = JSON.parse(localStorage.getItem('ap-custom-plan'));
console.log('Has plan:', !!plan);
```

**Steps:**
1. Open Claude panel (AI chat)
2. Observe: 🔄 Regenerate button visible
3. Click Regenerate button
4. AI chat opens with context pre-loaded
5. Type: "Make it more hypertrophy-focused"
6. Observe: AI responds with modified plan

**Expected Results:**
- ✅ Regenerate button visible only when plan exists
- ✅ Click opens AI chat with current plan context
- ✅ AI provides modification suggestions

---

### Scenario 3: Post-Workout Summary (AI-2)

**Setup:**
```javascript
// Simulate completed workout
const workout = {
  type: 'push',
  timestamp: Date.now(),
  tonnage: 5000,
  duration: 3600000,
  exercises: [{
    name: 'Bench Press',
    sets: [{ weight: 80, reps: 8, done: true, rpe: 7 }]
  }]
};
localStorage.setItem('ap-active-session', JSON.stringify(workout));
```

**Steps:**
1. Complete a Push workout (log all sets)
2. Click "Finish Workout"
3. Observe: Post-workout modal appears automatically
4. Observe: Volume comparison, PRs, RPE displayed
5. Observe: Recommendations for next Push session shown
6. Navigate to Dashboard
7. Observe: Recommendations card visible

**Expected Results:**
- ✅ Modal auto-shows after "Finish"
- ✅ Volume % vs last week displayed
- ✅ PRs celebrated with animation
- ✅ Next-session weights recommended
- ✅ Dashboard card persists recommendations

---

### Scenario 4: In-Workout AI Bubble (AI-3)

**Setup:**
```javascript
// Start active workout
Nav.go('s-train');
Workout.startSession('push');
```

**Steps:**
1. Start active Push workout
2. Observe top-right corner for AI bubble
3. Complete first set of Bench Press
4. Observe: AI bubble appears (proactive trigger)
5. Click AI bubble
6. Mini chat overlay opens
7. Click "🏋️ Suggest weight" quick action
8. Observe: AI responds with weight suggestion

**Expected Results:**
- ✅ Bubble hidden initially (no suggestion)
- ✅ Bubble appears after first set completed
- ✅ Bubble pulses with gradient animation
- ✅ Click toggles mini chat overlay
- ✅ Quick actions send preset questions
- ✅ SSE streaming works in workout context

**Test Command:**
```javascript
// Check bubble visibility
const bubble = document.getElementById('workout-ai-bubble');
console.log('Bubble hidden:', bubble.hidden);
console.log('Bubble rect:', bubble.getBoundingClientRect());
```

---

### Scenario 5: Progressive Overload Inline (AI-4)

**Setup:**
```javascript
// Ensure workout history exists
const history = await DB.Workouts.getAll();
console.log('Workout count:', history.length);
```

**Steps:**
1. Navigate to Training screen
2. Select Push workout
3. Observe exercise cards
4. Look for inline suggestions under each exercise
5. Observe color coding:
   - 🟢 PR (new best weight)
   - 🔵 Recommended (standard progression)
   - ⚪ Normal (maintenance)

**Expected Results:**
- ✅ Inline suggestions visible in set cards
- ✅ Color coding matches progression type
- ✅ Delta shown (+2.5kg, 0kg, -5kg)
- ✅ Suggestions update after set completion

**Test Command:**
```javascript
// Check progression calculation
import('./js/progressive-overload.js').then(mod => {
  const result = mod.calculateProgression('Bench Press', 80, 4, 4, {
    lastSessionWeight: 77.5,
    history: []
  });
  console.log('Progression:', result);
  // Expected: { recommended: 82.5, delta: 2.5, type: 'recommended' }
});
```

---

### Scenario 6: Plateau Detection (AI-4)

**Setup:**
```javascript
// Create plateau scenario (3 sessions at same weight)
const plateauWorkouts = [
  { type: 'push', timestamp: Date.now() - 14*24*3600000, exercises: [{ name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] }] },
  { type: 'push', timestamp: Date.now() - 7*24*3600000, exercises: [{ name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] }] },
  { type: 'push', timestamp: Date.now() - 1*24*3600000, exercises: [{ name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] }] }
];
for (const w of plateauWorkouts) {
  await DB.Workouts.add(w);
}
```

**Steps:**
1. Ensure 3+ workouts at same weight exist
2. Navigate to Dashboard
3. Click Weekly Summary chip
4. Observe: Plateau alert displayed
5. Observe: Suggestion shown (deload/technique)
6. Click "🤖 Ask Coach"
7. AI chat opens with plateau context

**Expected Results:**
- ✅ Plateau detected after 3 sessions at same weight
- ✅ Alert shows in weekly summary
- ✅ Suggestion is exercise-specific
- ✅ "Ask Coach" opens AI with context

**Test Command:**
```javascript
// Check plateau detection
import('./js/progressive-overload.js').then(mod => {
  const history = await DB.Workouts.getAll();
  const plateau = mod.detectPlateau('Bench Press', history);
  console.log('Plateau:', plateau);
  // Expected: { isPlateau: true, sessions: 3, suggestion: '...' }
});
```

---

### Scenario 7: Weekly Summary (AI-4)

**Setup:**
```javascript
// Ensure varied workout week
const weekWorkouts = [
  { type: 'push', timestamp: Date.now() - 3*24*3600000, tonnage: 5000 },
  { type: 'pull', timestamp: Date.now() - 2*24*3600000, tonnage: 6000 },
  { type: 'legs', timestamp: Date.now() - 1*24*3600000, tonnage: 7000 }
];
```

**Steps:**
1. Navigate to Dashboard
2. Observe Weekly Summary chip
3. Click chip
4. Modal opens with:
   - Overview (workout count)
   - PRs section (green)
   - Plateau Alerts section (red)
5. Click "Close"

**Expected Results:**
- ✅ Chip shows on dashboard
- ✅ Chip color changes based on content:
  - Green if PRs
  - Red if plateaus
  - Default otherwise
- ✅ Modal renders all sections
- ✅ PRs listed with weight
- ✅ Plateau alerts show suggestions

---

## Integration Tests

### End-to-End: Full AI Autopilot Flow

**Steps:**
1. New user lands on app → AI generates plan (AI-1)
2. User accepts plan
3. User starts first Push workout
4. AI bubble appears after first set (AI-3)
5. User asks AI about weight
6. User completes workout
7. Post-workout modal shows recommendations (AI-2)
8. User navigates to Dashboard
9. Weekly summary shows progress (AI-4)

**Expected Flow:**
```
New User → Plan Generation → Workout Start → AI Bubble →
Set Completion → Post-Workout Modal → Dashboard → Weekly Summary
```

**Verification Points:**
- [ ] No console errors throughout flow
- [ ] All modals open/close smoothly
- [ ] AI responses stream without lag
- [ ] localStorage updated correctly
- [ ] Navigation works between all screens

---

## Performance Benchmarks

| Metric | Target | Measurement |
|--------|--------|-------------|
| Plan generation time | <10s | From load to modal display |
| AI bubble appearance | <500ms | From trigger to visible |
| SSE stream latency | <2s | From send to first token |
| Weekly summary render | <1s | From click to modal open |
| Plateau detection | <100ms | From call to result |

**Test Commands:**
```javascript
// Measure plan generation
console.time('plan-generation');
await WorkoutStore.fetchGeneratedPlan({});
console.timeEnd('plan-generation');

// Measure plateau detection
console.time('plateau-detect');
ProgressiveOverload.detectPlateau('Bench Press', history);
console.timeEnd('plateau-detect');
```

---

## Accessibility Checks

| Check | Target | Status |
|-------|--------|--------|
| AI bubble has aria-label | `aria-label="AI Coach suggestions"` | [ ] |
| Modal focus trap | Tab cycles within modal | [ ] |
| Keyboard navigation | All actions accessible via keyboard | [ ] |
| Color contrast | PR/Recommended meet WCAG AA | [ ] |
| Screen reader | Modal content announced | [ ] |

---

## Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome (Desktop) | Latest | [ ] |
| Firefox | Latest | [ ] |
| Safari | Latest | [ ] |
| Chrome (Mobile) | Latest | [ ] |
| Safari (iOS) | Latest | [ ] |

---

## Rollback Criteria

Phase 4 should be rolled back if:
1. AI-1 fails: New users cannot generate plans
2. AI-3 fails: In-workout AI crashes app
3. Performance regression: Lighthouse score drops below 90
4. Data loss: Workout history corrupted

---

## Sign-Off Checklist

**Before marking Phase 4 complete:**

- [ ] All 4 scenarios tested and passing
- [ ] Integration test completed end-to-end
- [ ] Performance benchmarks met
- [ ] No console errors in production build
- [ ] Accessibility checks passed
- [ ] Browser compatibility verified
- [ ] Documentation updated (CLAUDE.md, STATE.md)
- [ ] User验收 (user confirms AI Autopilot feels "elite")

---

*Verification: 04-VERIFICATION | Phase: 04-ai-autopilot | Created: 2026-03-28*
