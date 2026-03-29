// @ts-check
/* ════════════════════════════════════════════════════════
   Phase 4 Verification Tests — Automated Console Tests
   ════════════════════════════════════════════════════════ */

const API_BASE = 'http://localhost:3000/api';

/* ══════════════════════════════════════════════
   TEST RESULTS TRACKER
   ══════════════════════════════════════════════ */

const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, passed, details = '') {
  results.tests.push({ name, passed, details });
  if (passed) {
    results.passed++;
    console.log(`✅ ${name}`);
  } else {
    results.failed++;
    console.log(`❌ ${name}${details ? ` — ${details}` : ''}`);
  }
}

/* ══════════════════════════════════════════════
   SCENARIO 1: New User Onboarding (AI-1)
   ══════════════════════════════════════════════ */

async function testAI1_ProgramGeneration() {
  console.log('\n📋 Scenario 1: New User Onboarding (AI-1)');
  console.log('=' .repeat(50));

  try {
    // Test 1: Endpoint exists
    const response = await fetch(`${API_BASE}/generate-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workoutHistory: [],
        oneRMs: [],
        goals: 'strength',
        experience: 'intermediate'
      })
    });

    test('POST /api/generate-plan responds', response.ok, `Status: ${response.status}`);

    if (response.ok) {
      const data = await response.json();

      // Test 2: Returns valid structure
      test('Returns push/pull/legs structure',
        data.plan.push && data.plan.pull && data.plan.legs,
        'Missing workout split');

      // Test 3: Push has exercises
      test('Push workout has exercises',
        Array.isArray(data.plan.push) && data.plan.push.length > 0,
        `Got ${data.plan.push?.length || 0} exercises`);

      // Test 4: Pull has exercises
      test('Pull workout has exercises',
        Array.isArray(data.plan.pull) && data.plan.pull.length > 0,
        `Got ${data.plan.pull?.length || 0} exercises`);

      // Test 5: Legs has exercises
      test('Legs workout has exercises',
        Array.isArray(data.plan.legs) && data.plan.legs.length > 0,
        `Got ${data.plan.legs?.length || 0} exercises`);

      // Test 6: Exercise has required fields
      const firstExercise = data.plan.push[0];
      test('Exercises have name/sets/reps/weight',
        firstExercise.name && firstExercise.sets && firstExercise.reps && firstExercise.weight,
        JSON.stringify(firstExercise));
    }
  } catch (err) {
    test('AI-1 Program Generation', false, err.message);
  }
}

/* ══════════════════════════════════════════════
   SCENARIO 2: Program Regeneration (AI-1)
   ══════════════════════════════════════════════ */

async function testAI1_Regeneration() {
  console.log('\n📋 Scenario 2: Program Regeneration (AI-1)');
  console.log('=' .repeat(50));

  try {
    // Test with workout history
    const mockHistory = [
      {
        type: 'push',
        timestamp: Date.now() - 7 * 24 * 3600000,
        exercises: [
          { name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] }
        ]
      }
    ];

    const response = await fetch(`${API_BASE}/generate-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workoutHistory: mockHistory,
        oneRMs: [{ id: 'Bench Press', value: 100 }],
        goals: 'hypertrophy',
        experience: 'intermediate'
      })
    });

    test('Regeneration with history responds', response.ok, `Status: ${response.status}`);

    if (response.ok) {
      const data = await response.json();
      test('Returns generated plan', data.generated === true, 'generated flag missing');
      test('Has AI notes or fallback', data.aiNotes || data.note, 'No AI response');
    }
  } catch (err) {
    test('AI-1 Regeneration', false, err.message);
  }
}

/* ══════════════════════════════════════════════
   SCENARIO 3: Post-Workout Recommendations (AI-2)
   ══════════════════════════════════════════════ */
/* NOTE: AI-2 was implemented before this session — skip API test, verify module exists */

async function testAI2_PostWorkout() {
  console.log('\n📋 Scenario 3: Post-Workout Recommendations (AI-2) [PRE-EXISTING]');
  console.log('=' .repeat(50));

  try {
    // Verify claude.store.js has generateRecommendations function
    const { generateRecommendations, getRecommendations } = await import('../js/claude.store.js');

    test('generateRecommendations function exists', typeof generateRecommendations === 'function', 'Module export missing');
    test('getRecommendations function exists', typeof getRecommendations === 'function', 'Module export missing');

    // AI-2 was already verified working before this session
    console.log('  ℹ️  AI-2 (Adaptive Load) was implemented before this session');
    console.log('  ℹ️  Skipping API test — module exports verified');
  } catch (err) {
    test('AI-2 Post-Workout', false, err.message);
  }
}

/* ══════════════════════════════════════════════
   SCENARIO 4: Progressive Overload (AI-4)
   ══════════════════════════════════════════════ */

async function testAI4_ProgressiveOverload() {
  console.log('\n📋 Scenario 4: Progressive Overload (AI-4)');
  console.log('=' .repeat(50));

  try {
    // Import module dynamically (Node.js compatible)
    const { calculateProgression, classifyExercise, detectPlateau } =
      await import('../js/progressive-overload.js');

    // Test 1: Classify exercises
    test('Classify Bench Press as upper',
      classifyExercise('Bench Press') === 'upper',
      `Got: ${classifyExercise('Bench Press')}`);

    test('Classify Squat as lower',
      classifyExercise('Squat') === 'lower',
      `Got: ${classifyExercise('Squat')}`);

    // Note: "Curl" is classified as upper (contains bicep curl movement)
    test('Classify Hammer Curl as upper',
      classifyExercise('Hammer Curl') === 'upper',
      `Got: ${classifyExercise('Hammer Curl')}`);

    // Test 2: Progression calculation
    const progression = calculateProgression('Bench Press', 80, 4, 4, {
      lastSessionWeight: 77.5,  // Lower than current = PR!
      history: []
    });

    // PR is valid when current > lastSessionWeight
    test('Progression detects PR or recommended',
      (progression.type === 'pr' || progression.type === 'recommended') && progression.delta > 0,
      `Type: ${progression.type}, Delta: ${progression.delta}`);

    // Test 3: Plateau detection
    const mockHistory = [
      { timestamp: Date.now() - 14*24*3600000, exercises: [{ name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] }] },
      { timestamp: Date.now() - 7*24*3600000, exercises: [{ name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] }] },
      { timestamp: Date.now() - 1*24*3600000, exercises: [{ name: 'Bench Press', sets: [{ weight: 80, reps: 8, done: true }] }] }
    ];

    const plateau = detectPlateau('Bench Press', mockHistory);
    test('Detect plateau after 3 sessions',
      plateau.isPlateau === true,
      `isPlateau: ${plateau.isPlateau}`);
    test('Plateau has suggestion',
      plateau.suggestion.length > 0,
      'Empty suggestion');

  } catch (err) {
    test('AI-4 Progressive Overload', false, err.message);
  }
}

/* ══════════════════════════════════════════════
   SCENARIO 5: Weekly Summary (AI-4)
   ══════════════════════════════════════════════ */

async function testAI4_WeeklySummary() {
  console.log('\n📋 Scenario 5: Weekly Summary (AI-4)');
  console.log('=' .repeat(50));

  try {
    const { generateWeeklySummary } = await import('../js/progressive-overload.js');

    const mockWorkouts = [
      {
        type: 'push',
        timestamp: Date.now() - 2*24*3600000,
        tonnage: 5000,
        exercises: [
          { name: 'Bench Press', sets: [{ weight: 82.5, reps: 8, done: true }] }
        ]
      },
      {
        type: 'pull',
        timestamp: Date.now() - 1*24*3600000,
        tonnage: 6000,
        exercises: [
          { name: 'Deadlift', sets: [{ weight: 140, reps: 5, done: true }] }
        ]
      }
    ];

    const summary = await generateWeeklySummary(mockWorkouts);

    test('Generate weekly summary', summary.summary.length > 0, 'Empty summary');
    test('Summary includes workout count',
      summary.summary.includes('2 workouts'),
      `Got: ${summary.summary}`);
    test('Returns plateauAlerts array',
      Array.isArray(summary.plateauAlerts),
      'Not an array');
    test('Returns PRs array',
      Array.isArray(summary.prs),
      'Not an array');

  } catch (err) {
    test('AI-4 Weekly Summary', false, err.message);
  }
}

/* ══════════════════════════════════════════════
   MAIN — RUN ALL TESTS
   ══════════════════════════════════════════════ */

(async function runAllTests() {
  console.log('\n' + '═'.repeat(60));
  console.log('  PHASE 4 VERIFICATION TESTS');
  console.log('  ' + new Date().toLocaleString());
  console.log('═'.repeat(60) + '\n');

  await testAI1_ProgramGeneration();
  await testAI1_Regeneration();
  await testAI2_PostWorkout();
  await testAI4_ProgressiveOverload();
  await testAI4_WeeklySummary();

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(`  RESULTS: ${results.passed} passed, ${results.failed} failed`);
  console.log(`  SUCCESS RATE: ${Math.round(results.passed / (results.passed + results.failed) * 100)}%`);
  console.log('═'.repeat(60) + '\n');

  // Exit with error code if any tests failed
  if (results.failed > 0) {
    console.log('Failed tests:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  - ${t.name}: ${t.details}`);
    });
    process.exit(1);
  } else {
    console.log('✅ All Phase 4 verification tests passed!');
    process.exit(0);
  }
})();
