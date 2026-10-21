// Mutation testing of what a change touched (`pnpm mutation [<base>] [<head>] [--only <file>]`,
// CI's `mutation` job on a pull request; without a head, the working tree against the base): Stryker changes each line the diff added or changed in the runtime source
// (`registry/ouro/components/` and `registry/ouro/lib/ouro/`, not tests, stories or the test kit)
// in every way it knows, one change (a mutant) at a time, and runs the tests of the components
// those files belong to (the folders scripts/test-impact.mjs maps them to, and for a lib/ file its
// own tests and those of the components that import it). A mutant no test fails on (it survived)
// is a line the tests do not hold: the run fails and names each one. Fix it with a test that fails
// on that change; when the change cannot alter behaviour, say why on the line before it:
// `// Stryker disable next-line <Mutator>: <why>`.
//
// The tests run in Chromium through scripts/mutation/plugins.mjs (Stryker's own Vitest runner has
// no browser mode). Tailwind class strings and the development check are left out (see there).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  // `--only <path>` mutates one file's changed lines, while you work on it.
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
  const [base = "origin/main", head] = args.filter((arg, index) => arg !== "--only" && args[index - 1] !== "--only");
  const diff = spawnSync("git", ["diff", "-U0", "--no-renames", head ? `${base}...${head}` : base, "--", ...(only ? [only] : [componentsDir, libDir])], { cwd: root, encoding: "utf8" });
  if (diff.status !== 0) throw new Error(`git diff failed: ${diff.stderr}`);
  const changes = changedLines(diff.stdout);
  const mutate = mutateRanges(changes);
  if (mutate.length === 0) {
    console.log("No runtime source line changed: nothing to mutate.");
    return 0;
  }
  const tests = testFilesFor(Object.keys(changes).filter(runtimeSource));
  console.log(`Mutating ${mutate.length} changed range(s), against ${tests.own.length} test file(s), then ${tests.wider.length} more for a mutant they miss:\n${mutate.map((range) => `- ${range}`).join("\n")}`);
  process.env["OURO_MUTATION_TESTS"] = JSON.stringify(tests);
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
