const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\Zephyrus\\.gemini\\antigravity\\brain\\83eec661-da42-4292-aaee-b07ed94c2745\\.system_generated\\logs\\transcript.jsonl';

if (!fs.existsSync(logPath)) {
  console.error('Log file not found at:', logPath);
  process.exit(1);
}

const lines = fs.readFileSync(logPath, 'utf8').split('\n');
console.log(`Read ${lines.length} lines from log.`);

let files = {};

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const step = JSON.parse(line);
    
    // Check tool_calls in MODEL responses
    if (step.tool_calls) {
      for (const call of step.tool_calls) {
        processCall(call);
      }
    }
    
    // Check inside nested structure if any
    if (step.content && typeof step.content === 'string' && step.content.includes('tool_calls')) {
      // try to parse nested step content if it has JSON stringified tool_calls
      const matches = step.content.match(/"tool_calls":\s*(\[.*?\])/s);
      if (matches) {
        const nestedCalls = JSON.parse(matches[1]);
        for (const call of nestedCalls) {
          processCall(call);
        }
      }
    }
  } catch (e) {
    // Ignore JSON parsing errors
  }
}

function processCall(call) {
  if (call.name === 'write_to_file') {
    const args = call.args;
    const targetFile = getArg(args, 'TargetFile');
    const content = getArg(args, 'CodeContent');
    if (targetFile && content && (targetFile.includes('dynamic-island') || targetFile.includes('athlete-room'))) {
      const base = path.basename(targetFile).replace(/\\/g, '/').replace(/"/g, '');
      console.log(`Found write_to_file for ${base}`);
      files[base] = {
        type: 'write',
        content: cleanContent(content)
      };
    }
  } else if (call.name === 'replace_file_content' || call.name === 'multi_replace_file_content') {
    // Note edits to apply if needed, but usually the last write contains the full file or we can log them
    const args = call.args;
    const targetFile = getArg(args, 'TargetFile');
    if (targetFile && (targetFile.includes('dynamic-island') || targetFile.includes('athlete-room'))) {
      const base = path.basename(targetFile).replace(/\\/g, '/').replace(/"/g, '');
      console.log(`Found edit call (${call.name}) for ${base}`);
      // Log edit details to help us manually apply them if needed
      if (!files[base]) files[base] = { type: 'edit_only', edits: [] };
      if (!files[base].edits) files[base].edits = [];
      files[base].edits.push(call);
    }
  }
}

function getArg(args, key) {
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch (e) {
      return null;
    }
  }
  return args[key];
}

function cleanContent(content) {
  if (typeof content !== 'string') return content;
  if (content.startsWith('"') && content.endsWith('"')) {
    try {
      return JSON.parse(content);
    } catch (e) {
      return content.slice(1, -1);
    }
  }
  return content;
}

// Ensure js/shared/ directory exists
fs.mkdirSync('js/shared', { recursive: true });

for (const [filename, fileData] of Object.entries(files)) {
  const targetPath = path.join('js/shared', filename);
  if (fileData.type === 'write') {
    fs.writeFileSync(targetPath, fileData.content, 'utf8');
    console.log(`Successfully restored ${targetPath} (${fileData.content.length} bytes)`);
  } else {
    console.log(`File ${filename} only has edits, no base write found:`, fileData.edits.length);
  }
}
