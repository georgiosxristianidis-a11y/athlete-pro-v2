import fs from 'fs';
import path from 'path';

const action = process.argv[2] || 'patch'; // 'patch' or 'minor'
const pkgPath = path.resolve('package.json');
const manifestPath = path.resolve('manifest.json');
const jsVersionPath = path.resolve('js/version.js');

function bump(version, type) {
  let [major, minor, patch] = version.split('.').map(Number);
  if (type === 'minor') {
    minor++;
    patch = 0;
  } else {
    patch = (patch || 0) + 1;
  }
  return `${major}.${minor}.${patch}`;
}

function updateFile(filePath, type) {
  if (!fs.existsSync(filePath)) return null;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const oldVersion = data.version || '1.0.0';
  const newVersion = bump(oldVersion, type);
  data.version = newVersion;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  return { oldVersion, newVersion };
}

function updateJsVersion(filePath, newVersion) {
  fs.writeFileSync(filePath, `export const VERSION = '${newVersion}';\n`);
}

const pkgUpdate = updateFile(pkgPath, action);
const manifestUpdate = updateFile(manifestPath, action);
if (pkgUpdate) updateJsVersion(jsVersionPath, pkgUpdate.newVersion);

if (pkgUpdate) {
  console.log(`Version bumped: ${pkgUpdate.oldVersion} -> ${pkgUpdate.newVersion}`);
  if (action === 'minor') {
    console.log('--- COMMIT_TRIGGER ---');
  }
}
