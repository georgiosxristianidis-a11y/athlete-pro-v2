# WIP flow-token-diet (04.10) — живые куски, не влиты

> Незакоммиченный хвост ворктри `C:/PROJECTS/ap-token-diet` (ветка `claude/flow-token-diet`,
> база `7d24a21c`), разбор /devil + грилинг расхода токенов 04.10. Ворктри снесён 21.10 решением
> Gio, сюда сохранено то, чего нет в `origin/main` на `6378601f`. Применять не `git apply`
> вслепую — база ушла на 118+ коммитов, брать идеи карточкой.

## Что было в WIP и где оно сейчас

| Кусок | Статус на 21.10 |
|---|---|
| `paths:` в `.claude/rules/security.md` | влито другим путём |
| Перенос закрытых карточек `HANDOFF_launch_track.md` в архив | не влито; патч протух (хендофф 696 → 1402 строк), текст и так в main — не сохраняется |
| Роутер: «защиты main нет» вместо PROT-1 | **ложно с 14.10** (защита включена) — не сохраняется |
| Гард бюджета видит правила `.claude/rules/*.md` без `paths:` | влито 22.10, PR #567 |
| deny `gh pr merge *--auto*` в `.claude/settings.json` | влито 22.10, PR #567 |
| `--match-head-commit <sha>` вместо `--delete-branch` в CLAUDE.md | влито 22.10, PR #567 (без резки, 2992/3000) |

**Все куски разобраны — живого в файле не осталось.** Патч ниже — только история.

Мотив гарда (из черновика CHANGELOG): правило без `paths:` Claude Code грузит в каждую
сессию, а `check-docs-budget` считал только `HOT_FILES` — `security.md` (~1500 ток) ехал мимо
счёта, гард показывал «в норме». Учтите: `CLAUDE.md` стоит на потолке ~3000 ток, правка правила
мёржа — через резку.

## Патч (относительно `7d24a21c`)

```diff
diff --git a/.claude/settings.json b/.claude/settings.json
index 6b8abe26..50505b04 100644
--- a/.claude/settings.json
+++ b/.claude/settings.json
@@ -48,7 +48,8 @@
       "Bash(sudo *)",
       "Bash(curl *secret*)",
       "Bash(curl *api_key*)",
-      "Bash(cat *.env*)"
+      "Bash(cat *.env*)",
+      "Bash(gh pr merge *--auto*)"
     ]
   },
   "model": "claude-opus-4.6"
diff --git a/CLAUDE.md b/CLAUDE.md
index b37def35..f8322520 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -41,7 +41,7 @@
 - **Verify-over-trust:** «готово» (вкл. Gemini) — гипотеза, пока gate-команда не даёт 0; показывать фактический вывод.
 - **Причина, потом ошибка:** сперва root cause, потом фикс.
 - **Изоляция:** агенты пишут только в свой worktree; вливает LEAD после гейта.
-- **Влитие только через PR:** свежий `origin/main` → гейт → `gh pr create --base main` → зелёные чеки → `gh pr merge --rebase --delete-branch`. Отстала — `git rebase origin/main`, перегнать гейт, снова PR.
+- **Влитие только через PR:** свежий `origin/main` → гейт → `gh pr create --base main` → зелёные чеки → `gh pr merge --rebase --match-head-commit <sha>`, без `--auto`. Отстала — `git rebase origin/main`, перегнать гейт, снова PR.
 - **«Влито» = ancestry:** `git merge-base --is-ancestor <sha> origin/main` = 0, не «PR создан». Ревизия веток — `npm run inventory`.
 - **Влитая ветка умирает с мёржем** вместе со своим worktree — не информация. Тегом держим только отвергнутые линии.
 - **Рекомендация, не меню:** советовать лучший вариант + 1 строка «почему»; решает человек.
diff --git a/scripts/check-docs-budget.mjs b/scripts/check-docs-budget.mjs
index abc7515f..642f2a90 100644
--- a/scripts/check-docs-budget.mjs
+++ b/scripts/check-docs-budget.mjs
@@ -79,8 +79,29 @@ export function measureFile(absPath) {
   };
 }
 
+// Правило из `.claude/rules/` без `paths:` во фронтматтере Claude Code грузит в
+// КАЖДУЮ сессию — это тот же горячий путь, что CLAUDE.md, только невидимый для
+// счёта по HOT_FILES. 2026-10-04: security.md (~1500 ток) ехал так в каждую
+// сессию, а гард показывал «в норме». Своего потолка у такого правила нет — оно
+// ложится в общий TOTAL, которого хватает лишь на крохи.
+export function hasPathsScope(text) {
+  const m = normalize(text).match(/^---\n([\s\S]*?)\n---/);
+  return Boolean(m) && /^paths:/m.test(m[1]);
+}
+
+export function unscopedRules(root = ROOT) {
+  const dir = path.join(root, '.claude', 'rules');
+  if (!fs.existsSync(dir)) return [];
+  return fs
+    .readdirSync(dir)
+    .filter((f) => f.endsWith('.md'))
+    .filter((f) => !hasPathsScope(fs.readFileSync(path.join(dir, f), 'utf8')))
+    .map((f) => path.posix.join('.claude', 'rules', f));
+}
+
 export function measureHotPath(root = ROOT) {
-  const files = HOT_FILES.map((f) => ({ file: f, ...measureFile(path.join(root, f)) }));
+  const names = [...HOT_FILES, ...unscopedRules(root)];
+  const files = names.map((f) => ({ file: f, ...measureFile(path.join(root, f)) }));
   return { files, total: files.reduce((a, f) => a + f.tokens, 0) };
 }
 
diff --git a/test/docs-budget.test.js b/test/docs-budget.test.js
index 67f787cf..bacc1faf 100644
--- a/test/docs-budget.test.js
+++ b/test/docs-budget.test.js
@@ -21,6 +21,8 @@ import {
   measureHotPath,
   measureFile,
   estimateTokens,
+  hasPathsScope,
+  unscopedRules,
 } from '../scripts/check-docs-budget.mjs';
 
 const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
@@ -90,8 +92,7 @@ test('оценка токенов: markdown-разметка/цифры счит
 
 test('каждый файл горячего пути влезает в свой потолок', () => {
   const { files } = measureHotPath(ROOT);
-  assert.equal(files.length, HOT_FILES.length);
-  for (const f of files) {
+  for (const f of files.filter((x) => HOT_FILES.includes(x.file))) {
     const cap = BUDGETS[f.file];
     assert.ok(cap, `для ${f.file} не назначен потолок`);
     assert.ok(
@@ -109,3 +110,34 @@ test('сумма горячего пути влезает в общий пото
     `горячий путь ~${total} токенов при потолке ${BUDGETS.TOTAL} — стартовая нагрузка каждой сессии`,
   );
 });
+
+// Правило без `paths:` грузится в каждую сессию — значит, оно в горячем пути.
+// 2026-10-04: security.md ехал так ~1500 токенов на сессию при «бюджет в норме».
+test('фронтматтер: paths: распознаётся, без него — нет (CRLF тоже)', () => {
+  assert.equal(hasPathsScope('---\ndescription: x\npaths:\n  - "js/**"\n---\n# T'), true);
+  assert.equal(hasPathsScope('---\r\ndescription: x\r\npaths:\r\n  - "js/**"\r\n---\r\n# T'), true);
+  assert.equal(hasPathsScope('---\ndescription: x\n---\n# T'), false);
+  assert.equal(hasPathsScope('# без фронтматтера\npaths: в тексте не считается'), false);
+});
+
+test('правило без paths: ложится в горячий путь и в общий итог', () => {
+  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-budget-rules-'));
+  try {
+    for (const f of HOT_FILES) fs.writeFileSync(path.join(dir, f), 'строка');
+    fs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true });
+    const before = measureHotPath(dir).total;
+
+    const scoped = '---\ndescription: s\npaths:\n  - "js/**"\n---\n' + 'а'.repeat(400);
+    fs.writeFileSync(path.join(dir, '.claude', 'rules', 'scoped.md'), scoped);
+    assert.equal(measureHotPath(dir).total, before, 'правило с paths: грузится лениво — в итог не идёт');
+
+    const unscoped = '---\ndescription: u\n---\n' + 'а'.repeat(400);
+    fs.writeFileSync(path.join(dir, '.claude', 'rules', 'always.md'), unscoped);
+    const { files, total } = measureHotPath(dir);
+    assert.deepEqual(unscopedRules(dir), ['.claude/rules/always.md']);
+    assert.ok(files.some((f) => f.file === '.claude/rules/always.md'), 'правило без paths: не попало в горячий путь');
+    assert.ok(total >= before + 200, `итог не вырос на правило без paths: ${before} -> ${total}`);
+  } finally {
+    fs.rmSync(dir, { recursive: true, force: true });
+  }
+});
```
