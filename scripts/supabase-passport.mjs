#!/usr/bin/env node
/**
 * Паспорт проекта Supabase (`supabase/project.json`) — единственный источник
 * ref, региона и GitHub-репо. 01.11 секреты keep-alive дважды ушли не туда:
 * ключ в поле URL и пара секретов в архивный репо athlete-pro вместо -v2.
 * У Gio два Free-проекта с keepalive_ping и URL одной длины, так что зелёный
 * прогон сам по себе не доказывает, что пингуется нужный проект.
 *
 *   npm run supabase:passport            — команды `gh secret set` с --repo и URL из паспорта
 *   npm run supabase:passport -- --prod  — сверить ref прода (/api/supabase-status) с паспортом
 *
 * Ключ скрипт не видит и не печатает: `gh secret set` без --body спросит его сам.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROD_URL = 'https://athlete-pro-v7.vercel.app';

const passport = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'supabase/project.json'), 'utf8'));
const { name, ref, region, githubRepo } = passport;
const url = `https://${ref}.supabase.co`;

async function checkProd(base) {
  const res = await fetch(`${base}/api/supabase-status`, { signal: AbortSignal.timeout(15000) });
  const body = await res.json();
  const prodRef = String(body.url ?? '').split('.')[0];
  if (!body.available) {
    console.error(`Прод ${base}: Supabase не настроен или не отвечает (${body.reason ?? 'причина не названа'}).`);
    process.exit(1);
  }
  if (prodRef !== ref) {
    console.error(`Прод ${base} смотрит в ref ${prodRef}, паспорт — ${ref} (${name}). Поправить SUPABASE_URL в Vercel.`);
    process.exit(2);
  }
  console.log(`Прод ${base}: ref ${prodRef} совпадает с паспортом (${name}).`);
}

if (process.argv.includes('--prod')) {
  const i = process.argv.indexOf('--prod');
  const base = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : PROD_URL;
  await checkProd(base.replace(/\/$/, ''));
} else {
  console.log(`Паспорт: ${name} · ref ${ref} · ${region} · GitHub ${githubRepo}`);
  console.log('');
  console.log('Секреты keep-alive (ключ: Supabase Dashboard этого ref → Settings → API Keys → anon):');
  console.log(`  gh secret set SUPABASE_URL --repo ${githubRepo} --body "${url}"`);
  console.log(`  gh secret set SUPABASE_ANON_KEY --repo ${githubRepo}`);
  console.log('');
  console.log('Проверка:');
  console.log(`  gh workflow run supabase-keepalive.yml --repo ${githubRepo}`);
}
