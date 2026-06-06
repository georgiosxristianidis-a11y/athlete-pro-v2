const fs = require('fs');
const path = require('path');

const bundlePath = 'c:/PROJECTS/athlete-pro/dist/assets/index-CUe0Zp0h.js';
const diPath = 'js/shared/dynamic-island.js';
const arPath = 'js/shared/athlete-room.js';

// 1. Rebuild AthleteRoom (athlete-room.js)
const atStartStr = 'var At=(()=>{';
const atEndStr = '})();async function jt()';

const content = fs.readFileSync(bundlePath, 'utf8');
const startIdx = content.indexOf(atStartStr);
const endIdx = content.indexOf(atEndStr, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  const atCode = content.slice(startIdx + atStartStr.length, endIdx);
  
  const athleteRoomSource = `// @ts-check
import { DB } from '../db.js';
import { dotsScore } from '../strength-engine.js';
import { loadProfile, updateProfile } from '../profile.store.js';

// Helper variables and definitions extracted from compiled bundle
const S = DB;
const ut = loadProfile;
const dt = updateProfile;
const _t = dotsScore;

const $ = [
  ["#4f46e5", "#06b6d4"],
  ["#10b981", "#059669"],
  ["#f59e0b", "#d97706"],
  ["#ec4899", "#be185d"],
  ["#8b5cf6", "#6d28d9"]
];

function Ct(workouts) {
  if (!workouts.length) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = new Set(workouts.map(w => {
    const d = new Date(w.timestamp);
    return \`\${d.getFullYear()}-\${d.getMonth()}-\${d.getDate()}\`;
  }));
  let streak = 0;
  const current = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(current.getTime() - i * 86400000);
    const key = \`\${d.getFullYear()}-\${d.getMonth()}-\${d.getDate()}\`;
    if (dates.has(key)) {
      streak++;
    } else if (i === 0) {
      continue;
    } else {
      break;
    }
  }
  return streak;
}

function wt(workouts) {
  if (workouts.length < 9) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weeks = new Set(workouts.map(w => {
    const d = new Date(w.timestamp);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / (7 * 86400000));
  }));
  let activeWeeks = 0;
  for (let i = 0; i < 5; i++) {
    const weekKey = Math.floor(today.getTime() / (7 * 86400000)) - i;
    if (weeks.has(weekKey)) {
      activeWeeks++;
    } else if (i > 0) {
      break;
    }
  }
  return activeWeeks >= 3;
}

const TIER_COLOR = {
  Untrained: "#78909c",
  Novice: "#26a69a",
  Intermediate: "#f59e0b",
  Advanced: "#7c3aed",
  Elite: "#ff6d00"
};

const TIER_RU = {
  Untrained: "Новичок",
  Novice: "Начинающий",
  Intermediate: "Средний",
  Advanced: "Продвинутый",
  Elite: "Элита"
};

const Tt = TIER_COLOR;
const Et = TIER_RU;

function Dt(dots) {
  if (!dots || dots < 200) return "Untrained";
  if (dots < 300) return "Novice";
  if (dots < 380) return "Intermediate";
  if (dots < 470) return "Advanced";
  return "Elite";
}

const St = [
  { id: "first_workout", icon: "1st", ru: "Первая тренировка", en: "First Workout", check: w => w.length >= 1 },
  { id: "five_workouts", icon: "5x", ru: "5 тренировок", en: "5 Workouts", check: w => w.length >= 5 },
  { id: "ten_workouts", icon: "10x", ru: "10 тренировок", en: "10 Workouts", check: w => w.length >= 10 },
  { id: "fifty_workouts", icon: "50x", ru: "50 тренировок", en: "50 Workouts", check: w => w.length >= 50 },
  { id: "streak_7", icon: "7D", ru: "7 дней подряд", en: "7-Day Streak", check: w => Ct(w) >= 7 },
  { id: "tonne_club", icon: "1T", ru: "1 тонна за сессию", en: "1 Tonne Session", check: w => w.some(s => s.tonnage >= 1000) },
  { id: "push_master", icon: "PM", ru: "Мастер жима", en: "Push Master", check: w => w.filter(s => s.type === "push").length >= 10 },
  { id: "consistency", icon: "3W", ru: "3 недели без пропусков", en: "3 Weeks Consistent", check: w => wt(w) }
];

const Ot = [
  { key: "bench", tests: [/barbell bench press/i, /bench press/i] },
  { key: "squat", tests: [/barbell back squat/i, /back squat/i] },
  { key: "deadlift", tests: [/deadlift \\(conventional\\)/i, /deadlift/i] },
  { key: "ohp", tests: [/overhead press/i, /\\bohp\\b/i] }
];

function kt(oneRMs) {
  const best = {};
  for (const item of oneRMs) {
    for (const { key, tests } of Ot) {
      if (tests.some(t => t.test(item.id))) {
        if (!best[key] || item.value > best[key]) {
          best[key] = item.value;
        }
        break;
      }
    }
  }
  return best;
}

export const AthleteRoom = (() => {
  ${atCode}
})();
`;

  fs.mkdirSync('js/shared', { recursive: true });
  fs.writeFileSync(arPath, athleteRoomSource, 'utf8');
  console.log('Successfully rebuilt js/shared/athlete-room.js!');
} else {
  console.error('Could not find AthleteRoom markers in bundle!');
}

// 2. Rebuild DynamicIsland (dynamic-island.js)
if (fs.existsSync(diPath)) {
  let diContent = fs.readFileSync(diPath, 'utf8');
  
  // Replace the minified bundle import with source-level imports
  const minifiedImport = 'import{k as e,w as t,z as n}from"./index-CUe0Zp0h.js";';
  const sourceImports = `import { getWeekMode, State } from '../workout.store.js';
import { Timer } from '../timer.js';

const e = getWeekMode;
const t = State;
const n = Timer;`;

  if (diContent.includes(minifiedImport)) {
    diContent = diContent.replace(minifiedImport, sourceImports);
  }
  
  // Replace minified export
  const minifiedExport = 'export{r as t};';
  const sourceExport = 'export const DynamicIsland = r;';
  
  if (diContent.includes(minifiedExport)) {
    diContent = diContent.replace(minifiedExport, sourceExport);
  }
  
  fs.writeFileSync(diPath, diContent, 'utf8');
  console.log('Successfully rebuilt js/shared/dynamic-island.js!');
} else {
  console.error('dynamic-island.js file does not exist to rebuild!');
}
