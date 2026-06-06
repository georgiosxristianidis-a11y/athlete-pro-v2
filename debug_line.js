const fs = require('fs');
const logPath = 'C:\\Users\\Zephyrus\\.gemini\\antigravity\\brain\\a21ba75f-2d4a-4875-8d06-ebf0b2384d9d\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');
const line = lines[632]; // line 633 (0-indexed 632)
const step = JSON.parse(line);
console.log('--- TYPE ---', step.type);
console.log('--- CONTENT ---');
console.log(step.content.slice(0, 1000));
console.log('--- END ---');
