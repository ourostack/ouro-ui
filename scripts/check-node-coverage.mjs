// Ouro check's Node side (scripts/check/*.test.mts) under Node's own coverage, in parallel pieces.
//
//   node scripts/check-node-coverage.mjs run <group>   runs one group's tests, keeping V8's raw coverage of the included files in .tmp/check-coverage/<group>/
//   node scripts/check-node-coverage.mjs merge <dir>   has Node's own test runner merge every group's raw coverage in <dir> and hold it to 100%
//   node scripts/check-node-coverage.mjs groups        lists the groups, for CI's matrix
//
// One `node --test` run of all twelve files took over six minutes on a runner with four cores, alone on its
// shard. The groups below run as separate CI jobs. `merge` feeds their raw V8 coverage to the runner that
// computes the report (scripts/check-node-coverage-merge.mjs puts it where the runner reads it), so the merged
// report is Node's own, held to the same 100% of lines, branches and functions the single run was.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The source files whose coverage is held to 100%. */
export const included = ["run", "serve", "fades", "base-check", "watch", "first-run-judges", "first-run-eyes", "first-run-machine", "first-run-network", "first-run-session", "first-run-detours", "first-run-system", "first-run-windows", "first-run-sso"].map((name) => `registry/ouro/check/${name}.ts`);

/** Titles of check-pages' tests that run in the `pages-a` group; every other title is skipped by `pages-a`'s complement `pages-b`, so a new test is never dropped. */
export const pagesA = ["names a page by site", "draws a screen wider", "never waives a blurry", "names a picture's file", "dark-art:", "judges a page once", "leaves the page behind", "reads an open tooltip", "checks a state a page reaches", "photographs a finding", "checks long lines only"];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pagesPattern = `(?:${pagesA.map(escape).join("|")})`;

/** check.test.mjs's two longest tests, each in a group of its own; every other title runs in `check`. */
export const checkAlone = ["finds each rule on its fail page", "a sharded run, merged"];
const small = ["fades", "base-check", "ax-hooks", "first-run-units", "first-run-session", "first-run-uia-order", "first-run-windows", "first-run-sso"].map((name) => `scripts/check/${name}.test.mts`);

/** Each group: the test files it runs and, for a file split by title, the pattern of the titles it runs. */
export const groups = {
  "pages-a": { files: ["scripts/check/check-pages.test.mts"], pattern: pagesPattern },
  "pages-b": { files: ["scripts/check/check-pages.test.mts"], skip: pagesPattern },
  "rules-command": { files: ["scripts/check/check-rules.test.mts", "scripts/check/check-command.test.mts"] },
  "watch-small": { files: ["scripts/check/check-watch.test.mts", ...small] },
  "check-rules": { files: ["scripts/check/check.test.mts"], pattern: escape(checkAlone[0]) },
  "check-shards": { files: ["scripts/check/check.test.mts"], pattern: escape(checkAlone[1]) },
  check: { files: ["scripts/check/check.test.mts"], skip: `(?:${checkAlone.map(escape).join("|")})` },
};


/** The flags that pick which tests of a group's files run. A lookahead in --test-name-pattern still matches the describe's own name, which runs every test inside it; skipping by title does not. */
export function selectionFlags(group) {
  return [...(group.pattern ? [`--test-name-pattern=${group.pattern}`] : []), ...(group.skip ? [`--test-skip-pattern=${group.skip}`] : [])];
}

/** V8's raw coverage `report` with only the included files' scripts left, which is all the merged report reads. */
export function onlyIncluded(report) {
  const urls = included.map((file) => pathToFileURL(join(root, file)).href);
  return { ...report, result: report.result.filter((script) => urls.includes(script.url)) };
}

const thresholds = ["lines", "branches", "functions"].map((kind) => `--test-coverage-${kind}=100`);
const includeFlags = included.map((file) => `--test-coverage-include=${file}`);
// NODE_TEST_CONTEXT would make the child report to a parent runner instead of printing its report.
const nodeEnv = (extra) => ({ ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT")), ...extra });

function run(name) {
  const group = groups[name];
  if (!group) {
    console.error(`No group ${name}. Groups: ${Object.keys(groups).join(", ")}.`);
    return 1;
  }
  const out = join(root, ".tmp/check-coverage", name);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const args = ["--test", "--test-reporter=tap", "--experimental-test-coverage", ...includeFlags];
  args.push(...selectionFlags(group));
  const result = spawnSync(process.execPath, [...args, ...group.files], { cwd: root, stdio: "inherit", env: nodeEnv({ NODE_V8_COVERAGE: out }) });
  for (const file of readdirSync(out)) {
    const path = join(out, file);
    writeFileSync(path, JSON.stringify(onlyIncluded(JSON.parse(readFileSync(path, "utf8")))));
  }
  return result.status ?? 1;
}

function merge(dir) {
  const folder = resolve(root, dir);
  const missing = Object.keys(groups).filter((name) => !existsSync(join(folder, name)));
  if (missing.length > 0) {
    console.error(`No coverage from group ${missing.join(", ")} in ${dir}.`);
    return 1;
  }
  const result = spawnSync(process.execPath, ["--test", "--experimental-test-coverage", ...includeFlags, ...thresholds, join(root, "scripts/check-node-coverage-merge.mjs")], {
    cwd: root,
    stdio: "inherit",
    env: nodeEnv({ OURO_CHECK_COVERAGE_DIR: folder }),
  });
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2);
  if (command === "run") process.exitCode = run(arg);
  else if (command === "merge") process.exitCode = merge(arg ?? ".tmp/check-coverage");
  else if (command === "groups") console.log(JSON.stringify(Object.keys(groups)));
  else {
    console.error("Usage: check-node-coverage.mjs run <group> | merge <dir> | groups");
    process.exitCode = 1;
  }
}
