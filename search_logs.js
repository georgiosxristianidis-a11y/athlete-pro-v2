const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\Zephyrus\\.gemini\\antigravity\\brain';

if (!fs.existsSync(brainDir)) {
  console.error('Brain directory not found!');
  process.exit(1);
}

// Function to recursively find transcript.jsonl files
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
    // Ignore permissions or read errors
  }
  return results;
}

const transcripts = findTranscripts(brainDir);
console.log(`Found ${transcripts.length} transcript.jsonl files.`);

for (const transcript of transcripts) {
  try {
    const lines = fs.readFileSync(transcript, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      if (line.includes('athlete-room.js') || line.includes('dynamic-island.js')) {
        const step = JSON.parse(line);
        processStep(step, transcript);
      }
    }
  } catch (e) {
    // Ignore line parse errors
  }
}

function processStep(step, transcriptPath) {
  let calls = [];
  if (step.tool_calls) {
    calls = step.tool_calls;
  }
  
  // check stringified tool_calls
  if (step.content && typeof step.content === 'string' && step.content.includes('tool_calls')) {
    const matches = step.content.match(/"tool_calls":\s*(\[.*?\])/s);
    if (matches) {
      try {
        calls = JSON.parse(matches[1]);
      } catch (e) {}
    }
  }
  
  for (const call of calls) {
    const name = call.name;
    const args = call.args || {};
    const targetFile = args.TargetFile || '';
    
    if (name === 'write_to_file' && (targetFile.includes('dynamic-island') || targetFile.includes('athlete-room'))) {
      const base = path.basename(targetFile).replace(/"/g, '');
      const content = args.CodeContent || '';
      console.log(`[WRITE] Found in: ${transcriptPath}`);
      console.log(`Target: ${targetFile}`);
      console.log(`Content length: ${content.length} chars`);
      
      const outDir = 'recovered_code';
      fs.mkdirSync(outDir, { recursive: true });
      
      let clean = content;
      if (clean.startsWith('"') && clean.endsWith('"')) {
        try { clean = JSON.parse(clean); } catch (e) {}
      }
      
      // Write it to recovered_code folder
      const outPath = path.join(outDir, `${Date.now()}_${base}`);
      fs.writeFileSync(outPath, clean, 'utf8');
      console.log(`Saved to ${outPath}`);
    }
  }
}
