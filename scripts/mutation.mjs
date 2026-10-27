// Mutation testing of what a change touched (`pnpm mutation [<base>] [<head>] [--only <file>]`,
// CI's `mutation` job on a pull request; without a head, the working tree against the base): Stryker changes each line the diff added or changed in the runtime source
// (`registry/ouro/components/` and `registry/ouro/lib/ouro/`, not tests, stories or the test kit)
// in every way it knows, one change (a mutant) at a time, and runs the tests of the component
// the mutated file belongs to (the folders scripts/test-impact.mjs maps them to, and for a lib/ file its
// own tests and those of the components that import it). A mutant no test fails on (it survived)
// is a line the tests do not hold: the run fails and names each one. Fix it with a test that fails
// on that change; when the change cannot alter behaviour, say why on the line before it:
// `// Stryker disable next-line <Mutator>: <why>`.
//
// The tests run in Chromium through scripts/mutation/plugins.mjs (Stryker's own Vitest runner has
// no browser mode). Tailwind class strings and the development check are left out (see there).
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { componentsDir, libDir, planShards, pruneChangedFiles, recordSources, runtimeSource, scopeReport, shardCost, testFilesFor, testSeconds } from "./mutation/cache.mjs";
import { ignoreReason } from "./mutation/plugins.mjs";

export { runtimeSource, testFilesFor };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The lines each file gained or changed in a unified diff with no context (`git diff -U0`), as
 * `{ path: [[start, end], ...] }` in the new file's line numbers. A hunk that only removed lines
 * changes no line of the new file.
 */
export function changedLines(diff) {
  const files = {};
  let path = null;
  for (const line of diff.split("\n")) {
    const file = /^\+\+\+ (?:b\/)?(.+)$/.exec(line);
    if (file) {
      path = file[1] === "/dev/null" ? null : file[1];
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && path) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count > 0) (files[path] ??= []).push([start, start + count - 1]);
    }
  }
  return files;
}

/** The node kinds Stryker's mutators change: operators, conditions, literals, blocks, collections. */
const mutable = new Set([
  "BinaryExpression",
  "LogicalExpression",
  "ConditionalExpression",
  "IfStatement",
  "UnaryExpression",
  "UpdateExpression",
  "AssignmentExpression",
  "BooleanLiteral",
  "StringLiteral",
  "TemplateLiteral",
  "BlockStatement",
  "ArrayExpression",
  "ObjectExpression",
  "OptionalMemberExpression",
  "OptionalCallExpression",
  "ArrowFunctionExpression",
]);

/**
 * About how many mutants Stryker makes of a file's changed lines (`ranges`, 1-based and
 * inclusive): the mutable nodes that start on them, leaving out the class strings the ouro-classes
 * ignorer drops. Only for balancing the CI shards; Stryker counts exactly.
 */
export function estimateMutants(text, path, ranges) {
  const ast = parse(text, { sourceType: "module", sourceFilename: path, errorRecovery: true, plugins: ["typescript", "jsx"] });
  const within = (line) => ranges.some(([start, end]) => line >= start && line <= end);
  let count = 0;
  (traverse.default ?? traverse)(ast, {
    enter(node) {
      if (!mutable.has(node.type) || !within(node.node.loc?.start.line ?? 0)) return;
      if ((node.isStringLiteral() || node.isTemplateLiteral()) && ignoreReason(node)?.startsWith("Tailwind")) return;
      count += 1;
    },
  });
  return count;
}

/** The mutants a unit of a long changed range gathers before the range may be cut after it (`splitRange`). */
export const UNIT_MUTANTS = 8;

/**
 * A changed range (1-based, inclusive) cut into parts of about `most` estimated mutants each, so
 * one long range of slow mutants spreads across shards. Stryker mutates a node only when one range
 * holds all of its lines, so the range is cut only after a line that no mutable node in it runs
 * past: a cut inside a node (a function's body) would leave that node's mutants untested.
 */
export function splitRange(text, path, range, most = UNIT_MUTANTS) {
  const ast = parse(text, { sourceType: "module", sourceFilename: path, errorRecovery: true, plugins: ["typescript", "jsx"] });
  const spans = [];
  (traverse.default ?? traverse)(ast, {
    enter(node) {
      const { start, end } = node.node.loc;
      if (!mutable.has(node.type) || start.line < range[0] || end.line > range[1]) return;
      if ((node.isStringLiteral() || node.isTemplateLiteral()) && ignoreReason(node)?.startsWith("Tailwind")) return;
      spans.push([start.line, end.line]);
    },
  });
  const parts = [];
  let from = range[0];
  let count = 0;
  let reach = 0;
  for (let line = range[0]; line < range[1]; line += 1) {
    for (const [start, end] of spans) {
      if (start !== line) continue;
      count += 1;
      reach = Math.max(reach, end);
    }
    if (count >= most && reach <= line) {
      parts.push([from, line]);
      from = line + 1;
      count = 0;
    }
  }
  parts.push([from, range[1]]);
  return parts;
}

/**
 * The units the CI shards share out: each changed range of runtime source, a long one cut into
 * parts (`splitRange`), with its estimated mutants and its file's tests (`own`, `wider`), keyed as
 * Stryker names it (`path:start-end`). A range, not a file, so one file with many slow mutants
 * (Sheet's parts, the Toaster's announcer) spreads across shards.
 */
export function shardUnits(changed, { read = (path) => readFileSync(join(root, path), "utf8"), testsFor = (path) => testFilesFor([path]) } = {}) {
  const units = {};
  for (const [path, ranges] of Object.entries(changed)) {
    if (!runtimeSource(path)) continue;
    const text = read(path);
    const tests = testsFor(path);
    for (const range of ranges) {
      for (const part of splitRange(text, path, range)) units[`${path}:${part[0]}-${part[1]}`] = { path, range: part, mutants: estimateMutants(text, path, [part]), ...tests };
    }
  }
  return units;
}

/** The changed lines of some units, by file, as `changedLines` gives them. */
export function unitChanges(ids, units) {
  const changes = {};
  for (const id of ids) (changes[units[id].path] ??= []).push(units[id].range);
  return changes;
}

/** `--shard 2/3` as a 1-based index and a count; null without one. */
export function parseShard(value) {
  if (value === undefined) return null;
  const match = /^(\d+)\/(\d+)$/.exec(value);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (!match || count < 1 || index < 1 || index > count) throw new Error(`--shard takes <index>/<count>, such as 2/3, not ${value}`);
  return { index, count };
}

/** A Stryker comment that turns mutation off for one line, naming the mutators and saying why. */
const reasonedDisable = /\/\/\s*Stryker disable next-line [A-Za-z]+(?:,[A-Za-z]+)*: \S/;

/**
 * Every Stryker comment a unified diff (`git diff -U0`) adds to runtime source that is not
 * `// Stryker disable next-line <Mutator>: <reason>`, as `path:line: comment`: `disable all`
 * would silence the rest of the file, and a disable with no reason hides why a mutant cannot
 * matter. (`restore` is never needed after a next-line disable.)
 */
export function disableProblems(diff) {
  const problems = [];
  let path = null;
  let line = 0;
  for (const text of diff.split("\n")) {
    const file = /^\+\+\+ (?:b\/)?(.+)$/.exec(text);
    if (file) {
      path = file[1] === "/dev/null" ? null : file[1];
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (!text.startsWith("+")) continue;
    const added = text.slice(1);
    if (path && runtimeSource(path) && /Stryker (?:disable|restore)/.test(added) && !reasonedDisable.test(added)) problems.push(`${path}:${line}: ${added.trim()}`);
    line += 1;
  }
  return problems;
}

/** How many Stryker disable comments a text holds. */
export function countDisables(text) {
  return (text.match(/Stryker disable/g) ?? []).length;
}

/** The Stryker disable comments in the runtime source at a ref, or in the working tree without one. */
function disablesAt(ref) {
  const found = spawnSync("git", ["grep", "-e", "Stryker disable", ...(ref ? [ref] : []), "--", componentsDir, libDir], { cwd: root, encoding: "utf8" });
  return found.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => (ref ? line.slice(ref.length + 1) : line))
    .filter((line) => runtimeSource(line.slice(0, line.indexOf(":"))))
    .reduce((total, line) => total + countDisables(line), 0);
}

/** Stryker's `mutate` patterns: each changed line range of each runtime file, `path:start-end`. */
export function mutateRanges(changes) {
  return Object.entries(changes)
    .filter(([path]) => runtimeSource(path))
    .flatMap(([path, ranges]) => ranges.map(([start, end]) => `${path}:${start}-${end}`));
}

/** The mutants that no test failed on: survived, or reached by no test. */
export function survivors(results) {
  return results.filter((mutant) => mutant.status === "Survived" || mutant.status === "NoCoverage");
}

/** One line per surviving mutant: where it is, what Stryker changed, and to what. */
export function describeSurvivor(mutant) {
  const { line, column } = mutant.location.start;
  return `${mutant.fileName}:${line}:${column + 1} ${mutant.mutatorName}: ${mutant.replacement ?? ""}`.trim();
}

async function main(args) {
  // `--only <path>` mutates one file's changed lines, while you work on it; `--shard <i>/<n>`
  // mutates the ith of n groups of the changed ranges, balanced by their estimated mutants and
  // their tests' measured time (CI).
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const only = option("--only");
  const shard = parseShard(option("--shard"));
  const [base = "origin/main", head] = args.filter((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));
  const range = head ? `${base}...${head}` : base;
  // A moved file (-M) keeps its lines: only what the move changed is mutated.
  const git = (paths) => spawnSync("git", ["diff", "-U0", "-M", range, "--", ...paths], { cwd: root, encoding: "utf8" });
  const whole = git([componentsDir, libDir]);
  if (whole.status !== 0) throw new Error(`git diff failed: ${whole.stderr}`);
  // Every Stryker comment the change adds says which mutator, for one line, and why; and the
  // count may only grow by the comments the change shows.
  const unreasoned = disableProblems(whole.stdout);
  const mergeBase = spawnSync("git", ["merge-base", base, head ?? "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  const [before, after] = [disablesAt(mergeBase), disablesAt(head)];
  const shown = whole.stdout.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).reduce((total, line) => total + countDisables(line), 0);
  console.log(`Stryker disable comments in the runtime source: ${before} at the base, ${after} now.`);
  if (unreasoned.length > 0 || after - before > shown) {
    console.error(
      [
        ...unreasoned.map((problem) => `${problem}: a Stryker comment must be // Stryker disable next-line <Mutator>: <why>, for one line with its reason.`),
        ...(after - before > shown ? [`${after - before - shown} Stryker disable comment(s) appeared that the change does not show.`] : []),
      ].join("\n"),
    );
    return 1;
  }
  const diff = only ? git([only]) : whole;
  if (diff.status !== 0) throw new Error(`git diff failed: ${diff.stderr}`);
  const changed = changedLines(diff.stdout);
  let changes = changed;
  if (shard) {
    const seconds = testSeconds();
    const units = shardUnits(changed);
    const shards = planShards(units, shard.count, seconds);
    console.log(
      `Shard ${shard.index}/${shard.count} of the changed ranges, by estimated mutants and their tests' measured time (scripts/mutation/test-seconds.json):\n${shards
        .map((ids, index) => `${index + 1} (~${Math.round(shardCost(ids, units, seconds))}s): ${ids.map((id) => `${id} (~${units[id].mutants})`).join(", ") || "none"}`)
        .join("\n")}`,
    );
    changes = unitChanges(shards[shard.index - 1], units);
  }
  const mutate = mutateRanges(changes);
  if (mutate.length === 0) {
    console.log("No runtime source line changed: nothing to mutate.");
    return 0;
  }
  const testsByFile = Object.fromEntries(Object.keys(changes).filter(runtimeSource).map((path) => [path, testFilesFor([path])]));
  console.log(
    `Mutating ${mutate.length} changed range(s), each mutant against its own file's tests, then its importers' for a mutant they miss:\n${Object.entries(testsByFile)
      .map(([path, { own, wider }]) => `- ${path}: ${own.length} + ${wider.length} test file(s), ${mutate.filter((range) => range.startsWith(`${path}:`)).map((range) => range.slice(path.length + 1)).join(", ")}`)
      .join("\n")}`,
  );
  process.env["OURO_MUTATION_TESTS"] = JSON.stringify(testsByFile);
  const incrementalFile = join(root, ".tmp/stryker-incremental.json");
  const kept = existsSync(incrementalFile) ? JSON.parse(readFileSync(incrementalFile, "utf8")) : null;
  // Every runtime file the pull request changes, a deletion-only change too: what pruneChangedFiles
  // follows imports to, and what each run records the digest of.
  const changedFiles = [...new Set(whole.stdout.split("\n").filter((line) => line.startsWith("+++ b/")).map((line) => line.slice(6)))].filter(runtimeSource);
  if (kept) writeFileSync(incrementalFile, JSON.stringify(pruneChangedFiles(kept, { changed: changedFiles })));
  const { Stryker } = await import("@stryker-mutator/core");
  const stryker = new Stryker({
    mutate,
    testRunner: "vitest-browser",
    plugins: [join(root, "scripts/mutation/plugins.mjs")],
    ignorers: ["ouro-classes"],
    coverageAnalysis: "off",
    inPlace: true,
    // Stryker touches only the files it mutates: no `// @ts-nocheck` written into the rest.
    ignorePatterns: ["**", ...Object.keys(changes).filter(runtimeSource).map((path) => `!${path}`)],
    disableTypeChecks: false,
    concurrency: 1,
    reporters: ["clear-text", "progress"],
    clearTextReporter: { reportTests: false, reportMutants: false, reportScoreTable: true },
    tempDirName: ".tmp/stryker",
    // Results kept from the last run (CI restores the shards' results, merged, under a key that
    // changes with the tests, the harness and what the mutated files import, and the results of a
    // file whose source changed are dropped above): a mutant whose file and tests have not changed
    // since is not run again.
    incremental: true,
    incrementalFile: ".tmp/stryker-incremental.json",
    timeoutMS: 10_000,
    thresholds: { high: 100, low: 100, break: null },
  });
  let results;
  try {
    results = await stryker.runMutationTest();
  } finally {
    // What this run owns, alone: Stryker also writes every kept mutant it did not run, with the
    // status it had, which another shard's fresh result must not meet in the merge.
    if (existsSync(incrementalFile)) writeFileSync(incrementalFile, JSON.stringify(recordSources(scopeReport(JSON.parse(readFileSync(incrementalFile, "utf8")), changes), changedFiles)));
  }
  results = results.filter((mutant) => inScope(mutant, changes));
  const surviving = survivors(results);
  if (surviving.length === 0) {
    console.log(`Every one of ${results.filter((mutant) => mutant.status !== "Ignored").length} mutants in the changed lines failed a test.`);
    return 0;
  }
  console.error(
    `${surviving.length} mutant(s) in the changed lines failed no test. Add a test that fails on each change, or, when it cannot alter behaviour, write the reason on the line before it: // Stryker disable next-line <Mutator>: <why>\n${surviving.map(describeSurvivor).join("\n")}`,
  );
  return 1;
}

/** Whether Stryker's result for a mutant lies in the changed ranges this run mutated (its file name may be absolute). */
export function inScope(mutant, changes) {
  const path = relative(root, resolvePath(root, mutant.fileName)).split("\\").join("/");
  return Object.keys(scopeReport({ files: { [path]: { mutants: [mutant] } } }, changes).files).length > 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
