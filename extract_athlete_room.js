const fs = require('fs');
const path = require('path');

const bundlePath = 'c:/PROJECTS/athlete-pro/dist/assets/index-CUe0Zp0h.js';
if (!fs.existsSync(bundlePath)) {
  console.error('Bundle not found!');
  process.exit(1);
}

const content = fs.readFileSync(bundlePath, 'utf8');

// 1. Extract AthleteRoom (At)
// Starts with: var At=(()=>{
// Ends with: })();async function jt()
const atStartStr = 'var At=(()=>{';
const atEndStr = '})();async function jt()';

const startIdx = content.indexOf(atStartStr);
const endIdx = content.indexOf(atEndStr, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  let atCode = content.slice(startIdx + atStartStr.length, endIdx);
  // Reconstruct the ES Module
  // Inside the IIFE: return {open:t,close:n,editName:i,cancelEdit:a,saveName:o,cycleColor:s,selectColor:c,initAvatar:u,triggerPhotoUpload:d,handlePhotoSelected:f,removePhoto:p}
  // Let's wrap it nicely
  fs.mkdirSync('js/shared', { recursive: true });
  fs.writeFileSync('js/shared/athlete-room.js', `// @ts-check
import { DB } from '../db.js';
import { dotsScore } from '../strength-engine.js';

// Extracted from compiled bundle
export const AthleteRoom = (() => {
  ${atCode}
})();
`, 'utf8');
  console.log('Extracted athlete-room.js!');
} else {
  console.error('Failed to locate AthleteRoom in bundle!', { startIdx, endIdx });
}

// 2. Extract DynamicIsland (which might be defined earlier or imported from another chunk)
// Wait! Let's check if there is dynamic-island-B8MZaHAs.js in dist/assets!
// Yes, we saw: dist/assets/dynamic-island-B8MZaHAs.js (4,846 bytes)
// Let's read that file!
const diBundlePath = 'c:/PROJECTS/athlete-pro/dist/assets/dynamic-island-B8MZaHAs.js';
if (fs.existsSync(diBundlePath)) {
  const diContent = fs.readFileSync(diBundlePath, 'utf8');
  fs.writeFileSync('js/shared/dynamic-island.js', diContent, 'utf8');
  console.log('Restored dynamic-island.js directly from its chunk!');
} else {
  console.error('Dynamic Island chunk not found!');
}
