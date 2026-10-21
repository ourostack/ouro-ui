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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ignoreReason } from "./mutation/plugins.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const componentsDir = "registry/ouro/components/ouro/";
const libDir = "registry/ouro/lib/ouro/";

/** Whether a path is runtime source the mutation run mutates: component and lib code, not tests, stories, types or the test kit. */
export function runtimeSource(path) {
  if (!/\.(ts|tsx)$/.test(path) || /\.(test|test-d|stories)\.tsx?$|\.d\.ts$|\.touch\.test\./.test(path)) return false;
  if (path.startsWith(componentsDir)) return true;
  return path.startsWith(libDir) && !path.startsWith(`${libDir}testing/`);
}

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

/**
 * What a file costs a shard: its estimated mutants times the tests in `testFiles` (its own), as
 * each mutant runs that whole set (coverage analysis is off). Dialog's tests take far longer than a
 * style file's, so counting mutants alone left one shard four times as long as another.
 */
export function mutantWeight(mutants, testFiles, rootDir = root) {
  const its = testFiles.reduce((total, file) => total + (readFileSync(join(rootDir, file), "utf8").match(/^\s*it\(/gm)?.length ?? 0), 0);
  return mutants * Math.max(1, its);
}

/**
 * Files split across `count` shards by weight (`mutantWeight`), largest first into the
 * lightest shard, so the shards finish close together.
 */
export function balanceShards(weights, count) {
  const shards = Array.from({ length: count }, () => ({ files: [], total: 0 }));
  for (const [file, weight] of Object.entries(weights).sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))) {
    const lightest = shards.reduce((best, shard) => (shard.total < best.total ? shard : best));
    lightest.files.push(file);
    lightest.total += weight;
  }
  return shards.map((shard) => shard.files.sort());
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

/** A folder's test files, for the ouro-chromium and ouro-touch projects. */
function testsIn(dir) {
  return existsSync(join(root, dir))
    ? readdirSync(join(root, dir))
        .filter((file) => /\.test\.tsx?$/.test(file) && !/\.visual\.test\./.test(file))
        .map((file) => `${dir}${file}`)
    : [];
}

/** The component folders whose runtime code imports a lib/ file (`lib/ouro/<name>`), directly. */
function importersOf(libFile, rootDir = root) {
  const name = libFile.slice(libDir.length).replace(/\.tsx?$/, "");
  const pattern = new RegExp(`from "@/registry/ouro/lib/ouro/${name}"`);
  const folders = readdirSync(join(rootDir, componentsDir)).filter((folder) =>
    readdirSync(join(rootDir, componentsDir, folder)).some((file) => runtimeSource(`${componentsDir}${folder}/${file}`) && pattern.test(readFileSync(join(rootDir, componentsDir, folder, file), "utf8"))),
  );
  return folders.sort();
}

/**
 * The test files that can kill a mutant in these runtime files: `own`, each component file's
 * folder's tests and each lib/ file's own tests, and `wider`, the tests of the folders whose code
 * imports a changed lib/ file (a helper some branch of which only a component's tests reach).
 */
export function testFilesFor(paths, rootDir = root) {
  const own = new Set();
  const wider = new Set();
  for (const path of paths) {
    if (path.startsWith(componentsDir)) {
      for (const file of testsIn(`${componentsDir}${path.slice(componentsDir.length).split("/")[0]}/`)) own.add(file);
    } else {
      const stem = path.replace(/\.tsx?$/, "");
      for (const extension of [".test.ts", ".test.tsx"]) if (existsSync(join(rootDir, `${stem}${extension}`))) own.add(`${stem}${extension}`);
      for (const folder of importersOf(path, rootDir)) for (const file of testsIn(`${componentsDir}${folder}/`)) wider.add(file);
    }
  }
  return { own: [...own].sort(), wider: [...wider].filter((file) => !own.has(file)).sort() };
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
  // mutates the ith of n groups of the changed files, balanced by their estimated mutants times
  // their tests (CI).
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
    const mutants = Object.fromEntries(Object.entries(changed).filter(([path]) => runtimeSource(path)).map(([path, ranges]) => [path, estimateMutants(readFileSync(join(root, path), "utf8"), path, ranges)]));
    const weights = Object.fromEntries(Object.entries(mutants).map(([path, count]) => [path, mutantWeight(count, testFilesFor([path]).own)]));
    const shards = balanceShards(weights, shard.count);
    const totals = shards.map((files) => files.reduce((total, file) => total + weights[file], 0));
    console.log(
      `Shard ${shard.index}/${shard.count} of the changed files, by estimated mutants times their tests:\n${shards.map((files, index) => `${index + 1} (${totals[index]}): ${files.map((file) => `${file} (~${mutants[file]} x ${weights[file] / Math.max(1, mutants[file])})`).join(", ") || "none"}`).join("\n")}`,
    );
    changes = Object.fromEntries(shards[shard.index - 1].map((file) => [file, changed[file]]));
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
  const { Stryker } = await import("@stryker-mutator/core");
  const results = await new Stryker({
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
    // Results kept from the last run (CI restores them per shard): a mutant whose code and tests
    // have not changed since is not run again.
    incremental: true,
    incrementalFile: `.tmp/stryker-incremental${shard ? `-${shard.index}` : ""}.json`,
    timeoutMS: 10_000,
    thresholds: { high: 100, low: 100, break: null },
  }).runMutationTest();
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

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
