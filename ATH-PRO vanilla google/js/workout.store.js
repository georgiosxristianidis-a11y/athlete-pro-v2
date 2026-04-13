export const State = {
  type: null,
  plan: [],
  phase: 'select',
  startedAt: null,
  stepDebounce: {}
};

export const SESSION_KEY = 'ap-active-session';

export const EXERCISE_LIBRARY = [
  { name: 'Bench Press', category: 'push', muscleGroup: 'chest', equipment: 'barbell', mechanic: 'compound' },
  { name: 'Squat', category: 'legs', muscleGroup: 'legs', equipment: 'barbell', mechanic: 'compound' },
  { name: 'Deadlift', category: 'pull', muscleGroup: 'back', equipment: 'barbell', mechanic: 'compound' },
  { name: 'Pull Up', category: 'pull', muscleGroup: 'back', equipment: 'bodyweight', mechanic: 'compound' },
  { name: 'Overhead Press', category: 'push', muscleGroup: 'shoulders', equipment: 'barbell', mechanic: 'compound' },
  { name: 'Bicep Curl', category: 'pull', muscleGroup: 'arms', equipment: 'dumbbell', mechanic: 'isolation' },
  { name: 'Tricep Extension', category: 'push', muscleGroup: 'arms', equipment: 'cable', mechanic: 'isolation' },
  { name: 'Leg Press', category: 'legs', muscleGroup: 'legs', equipment: 'machine', mechanic: 'compound' },
  { name: 'Calf Raise', category: 'legs', muscleGroup: 'calves', equipment: 'machine', mechanic: 'isolation' },
  { name: 'Crunch', category: 'core', muscleGroup: 'core', equipment: 'bodyweight', mechanic: 'isolation' }
];

export function getExerciseLibrary() {
  return Promise.resolve(EXERCISE_LIBRARY);
}

export function filterExercises(category) {
  if (category === 'all') return EXERCISE_LIBRARY;
  return EXERCISE_LIBRARY.filter(ex => ex.category === category);
}

export function getUniqueValues(field) {
  return [...new Set(EXERCISE_LIBRARY.map(ex => ex[field]))];
}

export function loadPlan() {
  const defaultPlan = {
    push: [
      { name: 'Bench Press', sets: 3, reps: 10, weight: 60 },
      { name: 'Overhead Press', sets: 3, reps: 10, weight: 40 },
      { name: 'Tricep Extension', sets: 3, reps: 12, weight: 20 }
    ],
    pull: [
      { name: 'Deadlift', sets: 3, reps: 5, weight: 100 },
      { name: 'Pull Up', sets: 3, reps: 8, weight: 0 },
      { name: 'Bicep Curl', sets: 3, reps: 12, weight: 15 }
    ],
    legs: [
      { name: 'Squat', sets: 3, reps: 8, weight: 80 },
      { name: 'Leg Press', sets: 3, reps: 10, weight: 150 },
      { name: 'Calf Raise', sets: 3, reps: 15, weight: 50 }
    ]
  };
  const saved = localStorage.getItem('ap-plan');
  return saved ? JSON.parse(saved) : defaultPlan;
}

export function savePlan(plan) {
  localStorage.setItem('ap-plan', JSON.stringify(plan));
}

export function buildSession(type) {
  const plan = loadPlan();
  const exercises = plan[type] || [];
  return exercises.map(ex => ({
    name: ex.name,
    sets: Array.from({ length: ex.sets }, () => ({ weight: ex.weight, reps: ex.reps, rpe: null, done: false }))
  }));
}

export function persistSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    type: State.type,
    plan: State.plan,
    startedAt: State.startedAt
  }));
}

export function tryRestoreSession() {
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved) {
    const data = JSON.parse(saved);
    State.type = data.type;
    State.plan = data.plan;
    State.startedAt = data.startedAt;
    State.phase = 'active';
    return true;
  }
  return false;
}

export function getCustomWorkouts() {
  const saved = localStorage.getItem('ap-custom-workouts');
  return saved ? JSON.parse(saved) : [];
}

export function saveCustomWorkout(workout) {
  const workouts = getCustomWorkouts();
  const index = workouts.findIndex(w => w.id === workout.id);
  if (index >= 0) {
    workouts[index] = workout;
  } else {
    workouts.push(workout);
  }
  localStorage.setItem('ap-custom-workouts', JSON.stringify(workouts));
}

export function deleteCustomWorkout(id) {
  let workouts = getCustomWorkouts();
  workouts = workouts.filter(w => w.id !== id);
  localStorage.setItem('ap-custom-workouts', JSON.stringify(workouts));
}
