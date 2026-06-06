const fs = require('fs');
const path = require('path');

const filePath = 'C:/PROJECTS/athlete-pro/js/athlete-room.js';
let content = fs.readFileSync(filePath, 'utf8');

// Replace the top comment block and define AVATAR_COLORS
content = content.replace(/\/\* ════════════════════════════════════════════════════════[\s\S]+?const ACHIEVEMENTS = \[/, `/* ════════════════════════════════════════════════════════
   athlete-room.js — Athlete Room: личный кабинет атлета
════════════════════════════════════════════════════════ */

const AVATAR_COLORS = [
  ['#4f46e5', '#06b6d4'], // Indigo -> Cyan
  ['#10b981', '#059669'], // Emerald -> Green
  ['#f59e0b', '#d97706'], // Amber -> Yellow
  ['#ec4899', '#be185d'], // Pink -> Rose
  ['#8b5cf6', '#6d28d9']  // Violet -> Purple
];

const ACHIEVEMENTS = [`);

// Replace the duplicate definition of achievements
content = content.replace(/\],[\s\S]+?check: \(w\) => w\.some\(s => s\.tonnage >= 1000\) \},\s+\{ id: 'push_master'[\s\S]+?\];/, `];`);

fs.writeFileSync(filePath, content, 'utf8');
console.log('athlete-room.js cleaned successfully');
