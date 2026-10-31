import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { changedLines, inScope, mutationRunners, SHARD_TARGET_SECONDS, shardUnits, spanningMutants, splitRange, unitChanges, unitExclusions, countDisables, describeSurvivor, disableProblems, estimateMutants, mutateRanges, parseShard, runtimeSource, survivors, testFilesFor } from "./mutation.mjs";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { ignoreReason, inOtherShard, isClassList, testPhases } from "./mutation/plugins.mjs";
import { dependencyFiles, dependencyHash, harnessFiles, mergeReports, parseTestSeconds, planShards, pruneChangedFiles, recordSources, scopeReport, shardCost, shardCount, strykerTimeout, testSeconds, timeoutRate, unmeasuredSeconds } from "./mutation/cache.mjs";

test("runtimeSource takes component and lib code, and leaves tests, stories, types and the test kit", () => {
  for (const path of ["registry/ouro/components/ouro/button/button.tsx", "registry/ouro/components/ouro/dialog/dialog-styles.ts", "registry/ouro/lib/ouro/cn.ts"]) assert.ok(runtimeSource(path), path);
  for (const path of [
    "registry/ouro/components/ouro/button/button.test.tsx",
    "registry/ouro/components/ouro/button/button.touch.test.tsx",
    "registry/ouro/components/ouro/button/button.test-d.ts",
    "registry/ouro/components/ouro/button/button.stories.tsx",
    "registry/ouro/components/ouro/button/component.json",
    "registry/ouro/lib/ouro/env.d.ts",
    "registry/ouro/lib/ouro/testing/act.ts",
    "registry/ouro/e2e/ouro/button.spec.ts",
    "test/stories.tsx",
  ]) {
    assert.ok(!runtimeSource(path), path);
  }
});

test("changedLines reads each hunk's new lines, and a hunk that only removed lines changes none", () => {
  const diff = [
    "diff --git a/registry/a.ts b/registry/a.ts",
    "--- a/registry/a.ts",
    "+++ b/registry/a.ts",
    "@@ -3,0 +4,2 @@ context",
    "+x",
    "+y",
    "@@ -10 +12 @@",
    "-old",
    "+new",
    "@@ -20,3 +22,0 @@",
    "-gone",
    "diff --git a/registry/b.ts b/registry/b.ts",
    "--- a/registry/b.ts",
    "+++ /dev/null",
    "@@ -1,2 +0,0 @@",
    "diff --git a/registry/c.tsx b/registry/c.tsx",
    "--- /dev/null",
    "+++ b/registry/c.tsx",
    "@@ -0,0 +1,5 @@",
  ].join("\n");
  assert.deepEqual(changedLines(diff), { "registry/a.ts": [[4, 5], [12, 12]], "registry/c.tsx": [[1, 5]] });
});

test("mutateRanges names each changed range of runtime source as Stryker's path:start-end", () => {
  assert.deepEqual(
    mutateRanges({
      "registry/ouro/components/ouro/button/button.tsx": [[4, 5], [12, 12]],
      "registry/ouro/components/ouro/button/button.test.tsx": [[1, 9]],
      "scripts/x.mjs": [[1, 1]],
    }),
    ["registry/ouro/components/ouro/button/button.tsx:4-5", "registry/ouro/components/ouro/button/button.tsx:12-12"],
  );
});

test("testFilesFor runs a component file's folder's tests, and a lib file's own tests, then its importers'", () => {
  const button = testFilesFor(["registry/ouro/components/ouro/button/button.tsx"]);
  assert.ok(button.own.includes("registry/ouro/components/ouro/button/button.test.tsx"));
  assert.ok(button.own.every((file) => file.startsWith("registry/ouro/components/ouro/button/")));
  assert.deepEqual(button.wider, []);
  const handoff = testFilesFor(["registry/ouro/lib/ouro/focus-handoff.ts"]);
  assert.deepEqual(handoff.own, ["registry/ouro/lib/ouro/focus-handoff.test.tsx"]);
  for (const folder of ["alert", "message", "toast"]) assert.ok(handoff.wider.some((file) => file.startsWith(`registry/ouro/components/ouro/${folder}/`)), folder);
  assert.ok(!handoff.wider.some((file) => file.startsWith("registry/ouro/components/ouro/button/")));
});

test("testFilesFor counts the lib tests that import a lib file as its own, as ouro-provider's tests do use-ouro's hook", () => {
  const useOuro = testFilesFor(["registry/ouro/lib/ouro/use-ouro.ts"]);
  assert.ok(useOuro.own.includes("registry/ouro/lib/ouro/ouro-provider.test.tsx"));
  assert.ok(useOuro.own.every((file) => file.startsWith("registry/ouro/lib/ouro/") && /\.test\.tsx?$/.test(file)));
});

test("survivors are the mutants that survived or that no test reached, described by place, mutator and replacement", () => {
  const results = [
    { status: "Killed", fileName: "a.ts", mutatorName: "BooleanLiteral", replacement: "false", location: { start: { line: 1, column: 0 } } },
    { status: "Survived", fileName: "a.ts", mutatorName: "ConditionalExpression", replacement: "true", location: { start: { line: 3, column: 4 } } },
    { status: "NoCoverage", fileName: "b.ts", mutatorName: "BlockStatement", replacement: "{}", location: { start: { line: 9, column: 0 } } },
    { status: "Ignored", fileName: "b.ts", mutatorName: "StringLiteral", replacement: '""', location: { start: { line: 2, column: 0 } } },
    { status: "Timeout", fileName: "b.ts", mutatorName: "UpdateOperator", replacement: "i--", location: { start: { line: 5, column: 0 } } },
  ];
  assert.deepEqual(survivors(results).map(describeSurvivor), ["a.ts:3:5 ConditionalExpression: true", "b.ts:9:1 BlockStatement: {}"]);
});

test("isClassList takes a string of Tailwind classes, and leaves words, sentences and markers", () => {
  for (const text of ["m-0 box-border flex", "forced-colors:border forced-colors:border-solid", "data-[orientation=vertical]:end-0 sm:pointer-fine:text-sm", "-translate-1/2", "[--ouro-x:calc(var(--spacing)*9)]", "!px-0"]) assert.ok(isClassList(text), text);
  for (const text of ["", "Close", "Remove menu.pdf", "is not a prop", "[ouro-ui] Button: x. Fix: y.", "menu", "sheet", "Character 1 of 6"]) assert.ok(!isClassList(text), text);
});

/** A stand-in for Babel's NodePath, enough for ignoreReason. */
function path(node, { binary, parent } = {}) {
  return {
    node,
    parentPath: parent ?? null,
    isStringLiteral: () => node.type === "StringLiteral",
    isTemplateLiteral: () => node.type === "TemplateLiteral",
    isBinaryExpression: () => node.type === "BinaryExpression",
    isStatement: () => node.type === "ExpressionStatement",
    toString: () => binary ?? "",
  };
}

test("the ouro-classes ignorer leaves out the development check, and mutates the rest", () => {
  assert.equal(ignoreReason(path({ type: "StringLiteral", value: "m-0 flex gap-2" })), undefined);
  assert.equal(ignoreReason(path({ type: "TemplateLiteral", quasis: [{ value: { cooked: "" } }, { value: { cooked: "" } }] })), undefined);
  assert.equal(ignoreReason(path({ type: "StringLiteral", value: "Close" })), undefined);
  const check = path({ type: "BinaryExpression" }, { binary: 'process.env.NODE_ENV !== "production"' });
  assert.match(ignoreReason(path({ type: "StringLiteral", value: "production" }, { parent: check })), /development check/);
  const statement = path({ type: "ExpressionStatement" });
  assert.equal(ignoreReason(path({ type: "Identifier" }, { parent: statement })), undefined);
  assert.equal(ignoreReason(path({ type: "BinaryExpression" }, { binary: "a !== b" })), undefined);
});

test("testPhases runs a mutant against its own file's tests, then its importers', and an unannounced file against every file's once", () => {
  const spec = (moduleId) => ({ moduleId });
  const byFile = new Map([
    ["registry/ouro/lib/ouro/focus-handoff.ts", { own: [spec("focus-handoff.test.tsx")], wider: [spec("alert.test.tsx"), spec("toaster.test.tsx")] }],
    ["registry/ouro/components/ouro/alert/alert.tsx", { own: [spec("alert.test.tsx")], wider: [] }],
  ]);
  assert.deepEqual(testPhases(byFile, "registry/ouro/components/ouro/alert/alert.tsx"), [[spec("alert.test.tsx")], []]);
  assert.deepEqual(testPhases(byFile, "registry/ouro/lib/ouro/focus-handoff.ts"), [[spec("focus-handoff.test.tsx")], [spec("alert.test.tsx"), spec("toaster.test.tsx")]]);
  assert.deepEqual(testPhases(byFile, ""), [[spec("focus-handoff.test.tsx"), spec("alert.test.tsx")], [spec("toaster.test.tsx")]]);
});

/** Each string in `source` (TSX) with whether the ouro-classes ignorer leaves it out. */
function strings(source) {
  const found = [];
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  (traverse.default ?? traverse)(ast, {
    "StringLiteral|TemplateLiteral"(path) {
      const text = path.isStringLiteral() ? path.node.value : path.node.quasis.map((quasi) => quasi.value.cooked).join("${}");
      found.push([text, ignoreReason(path) !== undefined]);
    },
  });
  return Object.fromEntries(found);
}

test("the ouro-classes ignorer leaves out only strings in class positions: className, cn() and cva() arguments, and *Class constants", () => {
  const found = strings(`
    const rootClass = "m-0 flex gap-2 " + "rounded-md";
    const sizes = { sm: "h-9 px-3" };
    const variants = cva("inline-flex items-center", { variants: { size: { sm: "h-8 px-2" } } });
    function Part({ open }) {
      const input = document.querySelector("a[href]");
      input.setAttribute("aria-invalid", "true");
      input.removeAttribute("aria-busy");
      input.closest("[inert]");
      return (
        <div className={cn("grid gap-1", open && "data-open:block")} data-ouro-part="thumb-label" iconClassName="size-4 shrink-0" aria-describedby="field-description">
          <span className={\`flex \${open ? "ring-2" : ""}\`} />
        </div>
      );
    }
  `);
  for (const text of ["m-0 flex gap-2 ", "rounded-md", "inline-flex items-center", "grid gap-1", "data-open:block", "size-4 shrink-0", "ring-2", "h-8 px-2"]) assert.equal(found[text], true, text);
  for (const text of ["a[href]", "aria-invalid", "aria-busy", "[inert]", "thumb-label", "field-description", "h-9 px-3"]) assert.equal(found[text], false, text);
});

test("disableProblems fails every Stryker comment a change adds to runtime source that is not next-line <Mutator>: <reason>", () => {
  const diff = [
    "+++ b/registry/ouro/components/ouro/button/button.tsx",
    "@@ -10,0 +11,6 @@",
    "+// Stryker disable all",
    "+// Stryker disable next-line ConditionalExpression: the server snapshot never changes",
    "+// Stryker disable next-line StringLiteral,ConditionalExpression: the label is decorative",
    "+// Stryker disable next-line ConditionalExpression",
    "+  // Stryker restore all",
    "+const plain = 1;",
    "+++ b/registry/ouro/components/ouro/button/button.test.tsx",
    "@@ -1,0 +1,1 @@",
    "+// Stryker disable all",
  ].join("\n");
  assert.deepEqual(disableProblems(diff), [
    "registry/ouro/components/ouro/button/button.tsx:11: // Stryker disable all",
    "registry/ouro/components/ouro/button/button.tsx:14: // Stryker disable next-line ConditionalExpression",
    "registry/ouro/components/ouro/button/button.tsx:15: // Stryker restore all",
  ]);
  assert.equal(countDisables("a // Stryker disable next-line X: y\nb /* Stryker disable all */\n"), 2);
});

test("estimateMutants counts what Stryker can change on the changed lines, leaving class strings out", () => {
  const text = [
    "export function f(a, b) {",
    '  const rootClass = "m-0 flex gap-2";',
    '  if (a > 1 && b) return "on";',
    "  return a ? b : !b;",
    "}",
  ].join("\n");
  assert.equal(estimateMutants(text, "f.tsx", [[2, 2]]), 0);
  assert.ok(estimateMutants(text, "f.tsx", [[3, 3]]) >= 4);
  assert.ok(estimateMutants(text, "f.tsx", [[1, 5]]) > estimateMutants(text, "f.tsx", [[3, 4]]));
});

test("parseShard reads --shard as a 1-based index and a count", () => {
  assert.deepEqual(parseShard("2/3"), { index: 2, count: 3 });
  assert.deepEqual(parseShard("5/5"), { index: 5, count: 5 });
  assert.equal(parseShard(undefined), null);
  assert.throws(() => parseShard("4/3"), /--shard/);
});

test("parseTestSeconds reads each ouro-chromium test file's time from a CI log, colour codes and timestamps dropped", () => {
  const log = [
    "2026-10-21T08:18:26.8450286Z  \x1b[32m✓\x1b[39m \x1b[30m\x1b[45m ouro-chromium (chromium) \x1b[49m\x1b[39m registry/ouro/components/ouro/select/select.test.tsx \x1b[2m(\x1b[22m\x1b[2m32 tests\x1b[22m\x1b[2m)\x1b[22m\x1b[33m 6886\x1b[2mms\x1b[22m\x1b[39m",
    "2026-10-21T08:18:35.0441612Z  ✓  ouro-webkit (webkit)  registry/ouro/components/ouro/select/select.test.tsx (32 tests) 8642ms",
    "2026-10-21T08:19:49.3768162Z  ✓  ouro-chromium (chromium)  registry/ouro/lib/ouro/focus-handoff.test.tsx (12 tests | 1 skipped) 30ms",
  ].join("\n");
  assert.deepEqual(parseTestSeconds(log), { "registry/ouro/components/ouro/select/select.test.tsx": 6.886, "registry/ouro/lib/ouro/focus-handoff.test.tsx": 0.03 });
});

test("planShards weighs each mutant by its own tests' measured time and each shard by its first run over every test file it needs", () => {
  const seconds = { "slow.test.tsx": 60, "fast.test.tsx": 1, "importer.test.tsx": 30 };
  const files = {
    "dialog.tsx": { mutants: 16, own: ["slow.test.tsx"], wider: [] },
    "sheet.tsx": { mutants: 16, own: ["slow.test.tsx"], wider: [] },
    "styles.ts": { mutants: 6, own: ["fast.test.tsx"], wider: [] },
    "handoff.ts": { mutants: 55, own: ["fast.test.tsx"], wider: ["importer.test.tsx"] },
  };
  // Each mutant may hang until Stryker's timeout, reckoned from every test file the shard needs.
  const hang = (mutants, testSeconds) => mutants * timeoutRate * strykerTimeout(testSeconds);
  // 16 mutants x (1 + 0.5 x 60) + 0.5 x 60: the two slow files are each a shard's worth.
  assert.equal(shardCost(["dialog.tsx"], files, seconds), 16 * 31 + 30 + hang(16, 60));
  // The importers' tests count once, in the first run, not per mutant, but in every mutant's timeout.
  assert.equal(shardCost(["handoff.ts"], files, seconds), 55 * 1.5 + 0.5 + 15 + hang(55, 31));
  assert.deepEqual(planShards(files, 3, seconds), [["dialog.tsx"], ["sheet.tsx"], ["handoff.ts", "styles.ts"]]);
  // A file whose tests were never timed counts as a few seconds of tests, not none.
  assert.equal(shardCost(["new.tsx"], { "new.tsx": { mutants: 2, own: ["new.test.tsx"], wider: [] } }, {}), 2 * (1 + 0.5 * unmeasuredSeconds) + 0.5 * unmeasuredSeconds + hang(2, unmeasuredSeconds));
});

test("shardCount takes the fewest shards from the minimum that plan each at the target or under, at most the maximum", () => {
  const seconds = { "a.test.tsx": 10, "b.test.tsx": 10, "c.test.tsx": 10, "d.test.tsx": 10 };
  const files = Object.fromEntries(["a", "b", "c", "d"].map((name) => [`${name}.tsx`, { mutants: 50, own: [`${name}.test.tsx`], wider: [] }]));
  const one = shardCost(["a.tsx"], files, seconds);
  // Each file alone is one shard's worth: four shards at that target, two at what two files cost together, and the minimum when that is more.
  assert.equal(shardCount(files, seconds, { min: 1, max: 16, target: one }), 4);
  assert.equal(shardCount(files, seconds, { min: 1, max: 16, target: shardCost(["a.tsx", "b.tsx"], files, seconds) }), 2);
  assert.equal(shardCount(files, seconds, { min: 5, max: 16, target: one }), 5);
  // A target no plan reaches stops at the maximum; a change with nothing to mutate takes the minimum.
  assert.equal(shardCount(files, seconds, { min: 1, max: 3, target: one }), 3);
  assert.equal(shardCount({}, seconds, { min: 3, max: 16, target: one }), 3);
});

test("the shard target leaves a shard about 20 minutes of the job's 30 at the worst ratio of measured time to estimate", () => {
  assert.equal(SHARD_TARGET_SECONDS, 900);
  assert.ok(SHARD_TARGET_SECONDS * 0.72 <= 20 * 60);
  assert.match(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../.github/workflows/ci.yml"), "utf8"), /node scripts\/mutation\.mjs HEAD\^1 --count "\$min\/24"/);
});

test("the committed test times cover the mutation runner's test files", () => {
  const seconds = testSeconds();
  assert.ok(Object.keys(seconds).length > 100);
  assert.ok(seconds["registry/ouro/components/ouro/dialog/dialog.test.tsx"] > seconds["registry/ouro/lib/ouro/focus-handoff.test.tsx"]);
});

test("dependencyFiles takes every lib file and what the changed files import, through each other; dependencyHash changes with any of them", () => {
  const sources = {
    "registry/ouro/components/ouro/a/a.tsx": 'import { b } from "./b-styles";\nimport { cn } from "@/registry/ouro/lib/ouro/cn";\nimport { C } from "@/registry/ouro/components/ouro/c/c";',
    "registry/ouro/components/ouro/a/b-styles.ts": 'import { d } from "../d/d";',
    "registry/ouro/components/ouro/c/c.tsx": "export const C = 1;",
    "registry/ouro/components/ouro/d/d.ts": "export const d = 1;",
    "registry/ouro/components/ouro/e/e.tsx": "export const e = 1;",
    "registry/ouro/lib/ouro/cn.ts": "export const cn = 1;",
    "registry/ouro/lib/ouro/spring.ts": "export const spring = 1;",
  };
  const options = { read: (path) => sources[path], exists: (path) => path in sources, list: () => ["registry/ouro/lib/ouro/cn.ts", "registry/ouro/lib/ouro/spring.ts"] };
  const files = dependencyFiles(["registry/ouro/components/ouro/a/a.tsx"], options);
  assert.deepEqual(files, [
    "registry/ouro/components/ouro/a/b-styles.ts",
    "registry/ouro/components/ouro/c/c.tsx",
    "registry/ouro/components/ouro/d/d.ts",
    "registry/ouro/lib/ouro/cn.ts",
    "registry/ouro/lib/ouro/spring.ts",
  ]);
  const hash = (changes) => dependencyHash(files, (path) => changes[path] ?? sources[path]);
  assert.equal(hash({}), hash({}));
  assert.notEqual(hash({ "registry/ouro/components/ouro/d/d.ts": "export const d = 2;" }), hash({}));
  assert.notEqual(hash({ "registry/ouro/lib/ouro/spring.ts": "export const spring = 2;" }), hash({}));
  // Not a dependency: the hash is the same.
  assert.equal(dependencyHash(files, (path) => ({ ...sources, "registry/ouro/components/ouro/e/e.tsx": "changed" })[path]), hash({}));
});

test("dependencyFiles also takes what decides an outcome beyond the source: the lockfile, the theme and app.css, the Vitest config and setup and what they import, the tests and what they import, but not the changed files themselves", () => {
  const sources = {
    "registry/ouro/components/ouro/a/a.tsx": "export const a = 1;",
    "registry/ouro/components/ouro/a/a.test.tsx": 'import { a } from "./a";\nimport { render } from "@/test/render";',
    "test/render.tsx": 'import { x } from "./x.mts";',
    "test/x.mts": "export const x = 1;",
    "vitest.config.ts": 'import { commands } from "./test/commands.ts";',
    "test/commands.ts": "export const commands = {};",
    "app.css": '@import "tailwindcss";\n@import "./registry/ouro/theme/ouro.css";',
    "registry/ouro/theme/ouro.css": ":root {}",
    "pnpm-lock.yaml": "lockfileVersion: 9",
  };
  const options = { read: (path) => sources[path], exists: (path) => path in sources, list: () => ["registry/ouro/theme/ouro.css"], harness: ["pnpm-lock.yaml", "app.css", "vitest.config.ts"], tests: ["registry/ouro/components/ouro/a/a.test.tsx"] };
  const files = dependencyFiles(["registry/ouro/components/ouro/a/a.tsx"], options);
  assert.deepEqual(files, ["app.css", "pnpm-lock.yaml", "registry/ouro/components/ouro/a/a.test.tsx", "registry/ouro/theme/ouro.css", "test/commands.ts", "test/render.tsx", "test/x.mts", "vitest.config.ts"]);
  for (const path of ["pnpm-lock.yaml", "app.css", "vitest.config.ts", "scripts/mutation/setup.ts", "scripts/mutation/plugins.mjs"]) assert.ok(harnessFiles.includes(path), path);
});

test("mergeReports makes one incremental report of the shards', renaming each test by its file and name so killedBy still names it", () => {
  const shard = (path, tests, killedBy) => ({
    schemaVersion: "2",
    files: { [path]: { language: "typescript", source: "", mutants: [{ id: "0", status: "Killed", killedBy, coveredBy: killedBy }] } },
    testFiles: { "dialog.test.tsx": { tests: tests.map((name, id) => ({ id: String(id), name })) } },
  });
  const merged = mergeReports([shard("dialog.tsx", ["opens", "closes"], ["1"]), shard("dialog-parts.tsx", ["closes", "traps focus"], ["1"])]);
  assert.deepEqual(Object.keys(merged.files), ["dialog.tsx", "dialog-parts.tsx"]);
  const names = Object.fromEntries(merged.testFiles["dialog.test.tsx"].tests.map(({ id, name }) => [id, name]));
  assert.deepEqual(Object.values(names), ["opens", "closes", "traps focus"]);
  assert.equal(names[merged.files["dialog.tsx"].mutants[0].killedBy[0]], "closes");
  assert.equal(names[merged.files["dialog-parts.tsx"].mutants[0].killedBy[0]], "traps focus");
  assert.equal(names[merged.files["dialog-parts.tsx"].mutants[0].coveredBy[0]], "traps focus");
});

test("mergeReports keeps every shard's mutants of a file whose changed ranges were split across shards", () => {
  const at = (line) => ({ start: { line, column: 1 }, end: { line, column: 9 } });
  const shard = (line, killedBy) => ({
    schemaVersion: "2",
    files: { "sheet-parts.tsx": { language: "typescript", source: "same", mutants: [{ id: "0", mutatorName: "StringLiteral", replacement: '""', location: at(line), status: "Killed", killedBy, coveredBy: killedBy }] } },
    testFiles: { "sheet.test.tsx": { tests: [{ id: "0", name: `line ${line}` }] } },
  });
  const merged = mergeReports([shard(216, ["0"]), shard(438, ["0"])]);
  const mutants = merged.files["sheet-parts.tsx"].mutants;
  assert.deepEqual(mutants.map((mutant) => mutant.location.start.line), [216, 438]);
  assert.equal(new Set(mutants.map((mutant) => mutant.id)).size, 2, "each mutant keeps an id of its own");
  const names = Object.fromEntries(merged.testFiles["sheet.test.tsx"].tests.map(({ id, name }) => [id, name]));
  assert.deepEqual(mutants.map((mutant) => names[mutant.killedBy[0]]), ["line 216", "line 438"]);
});

test("a shard's fresh Survived outlives another shard's carried-over Killed: each report is cut to its own ranges, and a merge keeps the undetected status", () => {
  const at = (line) => ({ start: { line, column: 4 }, end: { line, column: 30 } });
  const mutant = (line, status) => ({ id: "0", mutatorName: "StringLiteral", replacement: '""', location: at(line), status, killedBy: status === "Killed" ? ["0"] : [], coveredBy: ["0"] });
  const report = (mutants) => ({ schemaVersion: "2", files: { "pagination.tsx": { language: "typescript", source: "same", mutants } }, testFiles: { "pagination.test.tsx": { tests: [{ id: "0", name: "keeps each page's edge" }] } } });
  // Shard 1 owns line 135 and finds M survives; shard 2 owns line 290 and carries M as it was last time.
  const one = report([mutant(135, "Survived")]);
  const two = report([mutant(135, "Killed"), mutant(290, "Killed")]);
  const status = (merged) => merged.files["pagination.tsx"].mutants.find((m) => m.location.start.line === 135).status;
  assert.equal(status(mergeReports([one, two])), "Survived", "unscoped, the undetected status still wins");
  assert.equal(status(mergeReports([two, one])), "Survived");
  const scoped = scopeReport(two, { "pagination.tsx": [[290, 290]] });
  assert.deepEqual(scoped.files["pagination.tsx"].mutants.map((m) => m.location.start.line), [290]);
  assert.equal(status(mergeReports([scopeReport(one, { "pagination.tsx": [[135, 135]] }), scoped])), "Survived");
  // A mutant must lie wholly inside a range, as Stryker's own \`path:start-end\` reads it; a file outside the shard is dropped.
  assert.deepEqual(scopeReport(report([{ ...mutant(135, "Killed"), location: { start: { line: 134, column: 1 }, end: { line: 136, column: 2 } } }]), { "pagination.tsx": [[135, 136]] }).files, {});
  assert.deepEqual(scopeReport(two, { "other.tsx": [[1, 400]] }).files, {});
});

test("inScope keeps Stryker's results inside the run's own ranges, by a relative or an absolute file name", () => {
  const path = "registry/ouro/components/ouro/pagination/pagination.tsx";
  const at = (line) => ({ start: { line, column: 4 }, end: { line, column: 30 } });
  const changes = { [path]: [[135, 135]] };
  assert.ok(inScope({ fileName: path, location: at(135) }, changes));
  assert.ok(inScope({ fileName: join(dirname(fileURLToPath(import.meta.url)), "..", path), location: at(135) }, changes));
  assert.ok(!inScope({ fileName: path, location: at(290) }, changes));
});

test("pruneChangedFiles drops the kept mutants of a file whose source changed, since Stryker would reuse a Killed on a line the change left alone", () => {
  const report = { files: { "a.tsx": { source: "old", mutants: [{ id: "0" }] }, "b.tsx": { source: "same", mutants: [{ id: "1" }] }, "gone.tsx": { source: "x", mutants: [] } } };
  const sources = { "a.tsx": "new", "b.tsx": "same" };
  const pruned = pruneChangedFiles(report, {
    read: (path) => {
      if (!(path in sources)) throw new Error("ENOENT");
      return sources[path];
    },
    exists: (path) => path in sources,
  });
  assert.deepEqual(Object.keys(pruned.files), ["b.tsx"]);
});

test("pruneChangedFiles also drops a changed file's kept results when a changed file it imports, directly or through others, changed since: Stryker does not see an import change", () => {
  const dialog = "registry/ouro/components/ouro/dialog/dialog.tsx";
  const parts = "registry/ouro/components/ouro/dialog/dialog-parts.tsx";
  const styles = "registry/ouro/components/ouro/dialog/dialog-styles.ts";
  const sources = {
    [dialog]: 'import { Popup } from "@/registry/ouro/components/ouro/dialog/dialog-parts";\nexport const on = "on";',
    [parts]: 'import { popup } from "./dialog-styles";\nexport const Popup = 1;',
    [styles]: 'export const popup = "a";',
    "registry/ouro/components/ouro/other/other.tsx": 'export const other = "x";',
  };
  const options = (changes) => ({ changed: [dialog, parts, styles], read: (path) => changes[path] ?? sources[path], exists: (path) => path in sources });
  const found = recordSources(
    {
      files: {
        [dialog]: { source: sources[dialog], mutants: [{ id: "0", status: "Killed" }] },
        [parts]: { source: sources[parts], mutants: [{ id: "1", status: "Killed" }] },
        "registry/ouro/components/ouro/other/other.tsx": { source: sources["registry/ouro/components/ouro/other/other.tsx"], mutants: [{ id: "2", status: "Killed" }] },
      },
    },
    [dialog, parts, styles],
    (path) => sources[path],
  );
  const kept = (changes) => Object.keys(pruneChangedFiles(found, options(changes)).files).sort();
  assert.deepEqual(kept({}), [parts, dialog, "registry/ouro/components/ouro/other/other.tsx"].sort(), "nothing changed: everything kept");
  // dialog-parts edited: dialog imports it, so dialog's Killed may be stale too.
  assert.deepEqual(kept({ [parts]: sources[parts].replace("= 1", "= 2") }), ["registry/ouro/components/ouro/other/other.tsx"]);
  // dialog-styles has no mutants, so no source of its own in the report: its digest decides, and it reaches dialog through dialog-parts.
  assert.deepEqual(kept({ [styles]: 'export const popup = "b";' }), ["registry/ouro/components/ouro/other/other.tsx"]);
  // A changed file with no digest kept (a report from before) counts as changed.
  assert.deepEqual(Object.keys(pruneChangedFiles({ files: found.files }, options({})).files), ["registry/ouro/components/ouro/other/other.tsx"]);
  // dialog-styles reverted to main: no longer a changed file, but its recorded digest still differs, so dialog's results go.
  const reverted = { changed: [dialog, parts], read: (path) => ({ [styles]: 'export const popup = "main";' })[path] ?? sources[path], exists: (path) => path in sources };
  assert.deepEqual(Object.keys(pruneChangedFiles(found, reverted).files), ["registry/ouro/components/ouro/other/other.tsx"]);
  // The digests survive a merge.
  assert.deepEqual(mergeReports([found, { files: {}, testFiles: {}, ouroSources: { "x.tsx": "1" } }]).ouroSources, { ...found.ouroSources, "x.tsx": "1" });
});

test("splitRange cuts a long range into parts of about the given mutants, only where no node runs past the cut", () => {
  const text = [
    "export function one(a) {", // 1
    "  return a > 1 && a < 9;", // 2
    "}", // 3
    "export function two(b) {", // 4
    "  if (b) {", // 5
    '    return b === "x" || !b;', // 6
    "  }", // 7
    "  return [b, { b }];", // 8
    "}", // 9
    'const rootClass = "m-0 flex gap-2 p-4 text-sm";', // 10
  ].join("\n");
  // Each function's body is a block that spans it, so no cut falls inside a function.
  assert.deepEqual(splitRange(text, "f.tsx", [1, 10], 1), [[1, 3], [4, 9], [10, 10]]);
  // Nothing is cut before a part holds that many mutants.
  assert.deepEqual(splitRange(text, "f.tsx", [1, 10], 100), [[1, 10]]);
  assert.deepEqual(splitRange(text, "f.tsx", [1, 10], 5), [[1, 9], [10, 10]]);
  // A node that runs past the range's own end is not mutated, so it does not hold a cut back.
  assert.deepEqual(splitRange(text, "f.tsx", [1, 6], 1), [[1, 3], [4, 6]]);
  // Stryker deletes a whole call, and a call over several lines holds no mutable node of its own.
  const call = ["function f(a) {", "  warn(", '    "first",', '    "second",', "  );", '  return a && "x";', "}"].join("\n");
  assert.deepEqual(splitRange(call, "f.tsx", [2, 6], 1), [[2, 5], [6, 6]]);
});

test("shardUnits makes each changed range of runtime source a unit of its own, with its file's tests, so one large file's mutants can spread across shards", () => {
  const changed = { "registry/ouro/components/ouro/sheet/sheet-parts.tsx": [[216, 216], [438, 439]], "registry/ouro/components/ouro/sheet/sheet.stories.tsx": [[1, 3]] };
  const text = ["const a = 1;", ...Array.from({ length: 440 }, (_, index) => (index === 214 ? "const b = x > 1 && y;" : index === 436 ? 'const c = { on: true, label: "x" };' : ""))].join("\n");
  const units = shardUnits(changed, { read: () => text, testsFor: () => ({ own: ["sheet.test.tsx"], wider: [] }) });
  assert.deepEqual(Object.keys(units), ["registry/ouro/components/ouro/sheet/sheet-parts.tsx:216-216", "registry/ouro/components/ouro/sheet/sheet-parts.tsx:438-439"]);
  for (const unit of Object.values(units)) assert.deepEqual(unit.own, ["sheet.test.tsx"]);
  assert.ok(units["registry/ouro/components/ouro/sheet/sheet-parts.tsx:216-216"].mutants > 0);
  // Back to the changed lines Stryker mutates, by file.
  assert.deepEqual(unitChanges(["registry/ouro/components/ouro/sheet/sheet-parts.tsx:438-439"], units), { "registry/ouro/components/ouro/sheet/sheet-parts.tsx": [[438, 439]] });
});

test("splitRange cuts inside one long node once a part has gathered the long limit with no clean cut, and the nodes it crosses make a spanning unit", () => {
  const text = ["function big(a) {", "  const b = a > 1 && a < 9;", "  const c = a > 2 || a < 8;", "  const d = a >= 3 && !a;", "  return [b, c, d];", "}"].join("\n");
  // The function's body spans the range, so below the long limit nothing is cut.
  assert.deepEqual(splitRange(text, "f.tsx", [1, 6], 2), [[1, 6]]);
  // Past it, the body is cut at its statements; once the cut is made, the body no longer holds the next part back.
  const parts = splitRange(text, "f.tsx", [1, 6], 2, 4);
  assert.deepEqual(parts, [[1, 2], [3, 3], [4, 4], [5, 6]]);
  // Only the body's own mutant crosses a cut.
  assert.equal(spanningMutants(text, "f.tsx", [1, 6], parts), 1);
  assert.equal(spanningMutants(text, "f.tsx", [1, 6], [[1, 6]]), null);
});

test("shardUnits adds a spanning unit for a range cut across a node, and unitExclusions leaves its parts to the shards that hold them", () => {
  const file = "registry/ouro/components/ouro/big/big.tsx";
  const body = Array.from({ length: 40 }, (_, index) => `  const v${index} = a > ${index} && a < ${index + 9};`);
  const text = ["export function big(a) {", ...body, "  return a;", "}"].join("\n");
  const units = shardUnits({ [file]: [[1, 43]] }, { read: () => text, testsFor: () => ({ own: ["big.test.tsx"], wider: [] }) });
  const spanning = units[`${file}:1-43`];
  assert.ok(spanning, "a spanning unit keyed by the whole range");
  assert.ok(spanning.parts.length > 1);
  assert.deepEqual(spanning.own, ["big.test.tsx"]);
  const partIds = spanning.parts.map(([start, end]) => `${file}:${start}-${end}`);
  for (const id of partIds) assert.ok(units[id], id);
  // Alone, the spanning unit leaves every part out; with one part beside it, that part stays in.
  assert.deepEqual(unitExclusions([`${file}:1-43`], units), { [file]: spanning.parts });
  assert.deepEqual(unitExclusions([`${file}:1-43`, partIds[0]], units), { [file]: spanning.parts.slice(1) });
  assert.deepEqual(unitExclusions(partIds, units), {});
  assert.deepEqual(unitChanges([`${file}:1-43`], units), { [file]: [[1, 43]] });
});

test("scopeReport and inScope drop the mutants of lines another shard owns, so a spanning unit reports only its own", () => {
  const file = "registry/ouro/components/ouro/big/big.tsx";
  const at = (start, end) => ({ start: { line: start, column: 1 }, end: { line: end, column: 2 } });
  const report = { files: { [file]: { mutants: [{ id: "0", location: at(1, 43), status: "Killed" }, { id: "1", location: at(5, 5), status: "Ignored" }] } } };
  const scoped = scopeReport(report, { [file]: [[1, 43]] }, { [file]: [[2, 10]] });
  assert.deepEqual(scoped.files[file].mutants.map((mutant) => mutant.id), ["0"]);
  assert.ok(inScope({ fileName: file, location: at(1, 43) }, { [file]: [[1, 43]] }, { [file]: [[2, 10]] }));
  assert.ok(!inScope({ fileName: file, location: at(5, 5) }, { [file]: [[1, 43]] }, { [file]: [[2, 10]] }));
});

test("the parts ignorer leaves out a node wholly in another shard's lines of the same file, by Stryker's absolute file name", () => {
  const file = "registry/ouro/components/ouro/big/big.tsx";
  const node = (filename, start, end) => ({ hub: { file: { opts: { filename } } }, node: { loc: { start: { line: start }, end: { line: end } } } });
  const excluded = { [file]: [[2, 10]] };
  assert.ok(inOtherShard(node(`/work/ouro-ui/${file}`, 3, 4), excluded));
  assert.ok(inOtherShard(node(file, 2, 10), excluded));
  assert.ok(!inOtherShard(node(`/work/ouro-ui/${file}`, 1, 43), excluded), "a node that crosses the part is the spanning unit's");
  assert.ok(!inOtherShard(node("/work/ouro-ui/registry/ouro/components/ouro/other/big.tsx", 3, 4), excluded), "another file");
  assert.ok(!inOtherShard({ node: { loc: { start: { line: 3 }, end: { line: 4 } } } }, excluded), "no file name");
  assert.ok(!inOtherShard(node(file, 3, 4), {}));
  const before = process.env["OURO_MUTATION_EXCLUDED"];
  try {
    process.env["OURO_MUTATION_EXCLUDED"] = JSON.stringify(excluded);
    assert.match(ignoreReason({ ...node(file, 3, 4), isStringLiteral: () => false, isTemplateLiteral: () => false, parentPath: null }), /another shard/);
  } finally {
    if (before === undefined) delete process.env["OURO_MUTATION_EXCLUDED"];
    else process.env["OURO_MUTATION_EXCLUDED"] = before;
  }
});

test("mutationRunners starts two test runners on four cores or more, one below, and takes an override", () => {
  assert.equal(mutationRunners(4, undefined), 2);
  assert.equal(mutationRunners(12, ""), 2);
  assert.equal(mutationRunners(2, undefined), 1);
  assert.equal(mutationRunners(4, "3"), 3);
  assert.equal(mutationRunners(4, "0"), 1);
});
