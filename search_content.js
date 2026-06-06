const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\Zephyrus\\.gemini\\antigravity\\brain';

function findTranscripts(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        results = results.concat(findTranscripts(filePath));
      } else if (file === 'transcript.jsonl') {
        results.push(filePath);
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return results;
}

const transcripts = findTranscripts(brainDir);
console.log(`Found ${transcripts.length} transcript.jsonl files.`);

for (const transcript of transcripts) {
  try {
    const lines = fs.readFileSync(transcript, 'utf8').split('\n');
    let lineNum = 0;
    for (const line of lines) {
      lineNum++;
      if (!line.trim()) continue;
      
      const step = JSON.parse(line);
      const content = step.content || '';
      
      if (content.includes('class AthleteRoom') || content.includes('const AthleteRoom') || content.includes('AthleteRoom = (() =>')) {
        console.log(`Found AthleteRoom in content: ${transcript} (line ${lineNum})`);
        extractCodeBlocks(content, 'athlete-room');
      }
      if (content.includes('class DynamicIsland') || content.includes('const DynamicIsland') || content.includes('DynamicIsland = (() =>')) {
        console.log(`Found DynamicIsland in content: ${transcript} (line ${lineNum})`);
        extractCodeBlocks(content, 'dynamic-island');
      }
    }
  } catch (e) {
    // Ignore errors
  }
}

function extractCodeBlocks(text, prefix) {
  const regex = /```(?:javascript|js)?\s*([\s\S]*?)```/g;
  let match;
  let count = 0;
  while ((match = regex.exec(text)) !== null) {
    count++;
    const code = match[1];
    if (code.includes('AthleteRoom') || code.includes('DynamicIsland')) {
      const outDir = 'recovered_code';
      fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `content_${Date.now()}_${prefix}_${count}.js`);
      fs.writeFileSync(outPath, code, 'utf8');
      console.log(`  Saved code block to ${outPath} (${code.length} chars)`);
    }
  }
}
