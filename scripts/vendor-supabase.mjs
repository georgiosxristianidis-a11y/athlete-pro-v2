// CORE-S: копирует официальный UMD-бандл @supabase/supabase-js в js/vendor/,
// чтобы фронт грузил SDK с того же origin вместо cdn.jsdelivr.net (снимает
// домен из CSP script-src/connect-src). Перегонять после бампа версии пакета:
//   npm run vendor:supabase
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.join(ROOT, 'node_modules/@supabase/supabase-js');
const src = path.join(pkgDir, 'dist/umd/supabase.js');
const dest = path.join(ROOT, 'js/vendor/supabase.umd.js');

const { version } = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const banner =
  `/* Vendored from @supabase/supabase-js@${version} (dist/umd/supabase.js).\n` +
  `   Regenerate with \`npm run vendor:supabase\` after bumping the dependency — do not hand-edit. */\n`;

writeFileSync(dest, banner + readFileSync(src, 'utf8'));
console.log(`[vendor-supabase] @supabase/supabase-js@${version} -> js/vendor/supabase.umd.js`);
