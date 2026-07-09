import fs from 'node:fs';
import path from 'node:path';

function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

const rootFiles = ['index.html', 'manifest.json', 'exercises-library.json'];
const dirsToScan = ['js', 'css', 'icons', 'assets', 'fonts'];

let allFiles = [...rootFiles];

dirsToScan.forEach(dir => {
  if (fs.existsSync(dir)) {
    const files = walkDir(dir);
    allFiles = allFiles.concat(files);
  }
});

// Clean paths to be web-friendly (forward slash) and filter out non-web files
const assetsArray = allFiles
  .map(f => '/' + f.replace(/\\/g, '/'))
  .filter(f => !f.includes('.DS_Store') && !f.endsWith('.map') && !f.endsWith('.md'));

const newAssetsString = 'const ASSETS = [\n  ' + assetsArray.map(f => `'${f}'`).join(',\n  ') + '\n];';

const swPath = 'sw.js';
let swContent = fs.readFileSync(swPath, 'utf8');

// Replace the ASSETS array in sw.js
swContent = swContent.replace(/const ASSETS = \[[\s\S]*?\];/, newAssetsString);

fs.writeFileSync(swPath, swContent);

console.log(`[SW Build] Successfully injected ${assetsArray.length} assets into sw.js.`);
