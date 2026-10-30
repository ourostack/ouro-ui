import { commonTokens, declareClassPlugin, declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";
import { DryRunStatus, MutantRunStatus, TestStatus } from "@stryker-mutator/api/test-runner";
import { clearTimeout, setTimeout } from "node:timers";
import { createVitest } from "vitest/node";

// The Stryker plugins `pnpm mutation` (scripts/mutation.mjs) runs with. Stryker's own Vitest runner
// does not support browser mode, and every test here runs in a browser, so:
//
// - `vitest-browser`, a test runner: one Vitest instance in this process (the `ouro-chromium`
//   project, over the test files scripts/mutation.mjs names for each mutated file), rerun once per
//   mutant, stopping at its first failing test (`bail`): the mutated file's own tests first, then,
//   only for a mutant they let survive, the tests of what imports it. Stryker
//   writes every mutant into the source at once (mutant schemata), each behind a check of
//   `globalThis.__stryker__.activeMutant`; scripts/mutation/setup.ts sets that in the browser from
//   the `ouroMutant` command (vitest.config.ts), which reads `globalThis.__ouroMutant` here.
// - `ouro-classes`, an ignorer: a string of Tailwind classes where only classes go (a `className`,
//   a `cn()` or `cva()` argument, a `*Class` constant) changes how a part looks, which the
//   screenshot tests (CI's `visual` job) hold, not what it does, so its mutants are left out; an
//   attribute name, a selector or a marker that looks like classes is still mutated. So is the
//   `process.env.NODE_ENV` check that strips development messages, which no test
//   (they all run in development) can tell apart from its mutant.

/**
 * The test files to run for each mutated file, from scripts/mutation.mjs (`testsByFile`): `own`,
 * the file's own tests, which run first and kill most mutants at once, and `wider`, the tests of
 * what imports it, which run only for a mutant the own tests let survive. A mutant runs only its
 * own file's tests, so a large change costs each mutant no more than a small one.
 */
const testFiles = () => JSON.parse(process.env["OURO_MUTATION_TESTS"] ?? "{}");

/** Test specifications, each module once. */
const unique = (specifications) => [...new Map(specifications.map((specification) => [specification.moduleId, specification])).values()];

/**
 * The test specifications a mutant in `file` (repository-relative) runs, in two phases: that
 * file's own, then its importers'. For a file `byFile` does not name, every file's, each once.
 * @param {Map<string, { own: { moduleId: string }[], wider: { moduleId: string }[] }>} byFile
 * @param {string} file
 */
export function testPhases(byFile, file) {
  const tests = byFile.get(file);
  if (tests) return [tests.own, tests.wider];
  const all = [...byFile.values()];
  const own = unique(all.flatMap((entry) => entry.own));
  const owned = new Set(own.map((specification) => specification.moduleId));
  return [own, unique(all.flatMap((entry) => entry.wider)).filter((specification) => !owned.has(specification.moduleId))];
}

/** The repository-relative path of a file Stryker names absolutely. */
const relative = (file, root) => (file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file);

/** Every test a run reported, as Stryker's results. */
export function results(modules) {
  const tests = [];
  for (const module of modules) {
    for (const test of module.children.allTests()) {
      const result = test.result();
      const base = { id: test.fullName, name: test.fullName, timeSpentMs: Math.round(test.diagnostic()?.duration ?? 0), fileName: module.moduleId };
      if (result.state === "failed") tests.push({ ...base, status: TestStatus.Failed, failureMessage: (result.errors ?? []).map((error) => error.message).join("\n") || "failed" });
      else if (result.state === "passed") tests.push({ ...base, status: TestStatus.Success });
      else tests.push({ ...base, status: TestStatus.Skipped });
    }
    // A file that failed to load has no tests; it still kills the mutant that broke it.
    for (const error of module.errors()) tests.push({ id: module.moduleId, name: module.moduleId, timeSpentMs: 0, status: TestStatus.Failed, failureMessage: error.message });
  }
  return tests;
}

class VitestBrowserRunner {
  static inject = [commonTokens.logger];

  constructor(logger) {
    this.logger = logger;
  }

  capabilities() {
    // Every test file runs in a fresh browser frame, which loads the source again.
    return { reloadEnvironment: true };
  }

  async init() {
    process.env["OURO_MUTATION"] = "1";
    this.vitest = await createVitest("test", { watch: false, project: ["ouro-chromium"], coverage: { enabled: false }, reporters: [], bail: 1 });
    const glob = async (files) => (files.length > 0 ? await this.vitest.globTestSpecifications(files) : []);
    this.byFile = new Map();
    for (const [file, { own, wider }] of Object.entries(testFiles())) {
      const tests = { own: await glob(own), wider: await glob(wider) };
      if (tests.own.length + tests.wider.length === 0) throw new Error(`no test file matches ${[...own, ...wider].join(", ")}, the tests of ${file}`);
      this.byFile.set(file, tests);
    }
    if (this.byFile.size === 0) throw new Error("OURO_MUTATION_TESTS names no mutated file");
  }

  phases(file) {
    return testPhases(this.byFile, relative(file, this.vitest.config.root));
  }

  async run(timeout, specifications) {
    let timer;
    const timedOut = new Promise((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeout);
    });
    try {
      const outcome = await Promise.race([this.vitest.runTestSpecifications(specifications, false), timedOut]);
      if (outcome === "timeout") return { timeout: true };
      return { tests: results(outcome.testModules), errors: outcome.unhandledErrors };
    } finally {
      clearTimeout(timer);
    }
  }

  async dryRun({ timeout }) {
    globalThis.__ouroMutant = undefined;
    const run = await this.run(timeout, unique(this.phases("").flat()));
    if (run.timeout) return { status: DryRunStatus.Timeout };
    const failed = run.tests.filter((test) => test.status === TestStatus.Failed);
    if (failed.length > 0 || run.errors.length > 0) {
      return { status: DryRunStatus.Error, errorMessage: [...failed.map((test) => `${test.name}: ${test.failureMessage}`), ...run.errors.map(String)].join("\n") };
    }
    return { status: DryRunStatus.Complete, tests: run.tests };
  }

  async mutantRun({ activeMutant, timeout }) {
    globalThis.__ouroMutant = activeMutant.id;
    try {
      let ran = 0;
      for (const specifications of this.phases(activeMutant.fileName)) {
        if (specifications.length === 0) continue;
        const run = await this.run(timeout, specifications);
        if (run.timeout) return { status: MutantRunStatus.Timeout };
        ran += run.tests.length;
        const failed = run.tests.filter((test) => test.status === TestStatus.Failed);
        if (failed.length > 0 || run.errors.length > 0) {
          return { status: MutantRunStatus.Killed, killedBy: failed.map((test) => test.id), failureMessage: failed[0]?.failureMessage ?? String(run.errors[0]), nrOfTests: ran };
        }
      }
      return { status: MutantRunStatus.Survived, nrOfTests: ran };
    } finally {
      globalThis.__ouroMutant = undefined;
    }
  }

  async dispose() {
    await this.vitest?.close();
  }
}

/**
 * Whether a string is only Tailwind classes: one or more tokens, each a utility with its variants
 * (letters, digits, `-`, `:`, `/`, `.`, `!` and bracketed values), at least one with a dash, a
 * colon or a bracket, so plain words ("Close", "menu") are not taken for classes.
 */
export function isClassList(text) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return tokens.every((token) => /^!?-?[a-z@*[][\w@*:./%&=>[\]()',#+!-]*$/.test(token)) && tokens.some((token) => /[-:[]/.test(token));
}

/** Whether a node is, or is inside, the development check `process.env.NODE_ENV !== "production"`. */
export function inDevelopmentCheck(path) {
  for (let node = path; node; node = node.parentPath) {
    if (node.isBinaryExpression?.() && /process\.env\.NODE_ENV/.test(node.toString())) return true;
    if (node.isStatement?.()) return false;
  }
  return false;
}

/** Functions whose arguments are class lists: Ouro's `cn`, and the class helpers apps use. */
const classFunctions = new Set(["cn", "cva", "clsx", "twMerge", "tv"]);

/** A name that holds classes: `className`, `iconClassName`, `rootClass`, `itemClasses`. */
const className = /^(?:class(?:Name)?|\w+(?:Class|Classes|ClassName))$/;

/** The name a node's key or identifier gives, if any. */
const nameOf = (node) => (node?.type === "Identifier" || node?.type === "JSXIdentifier" ? node.name : node?.type === "StringLiteral" ? node.value : undefined);

/**
 * Whether a string sits where only classes go: a `className` (or `*ClassName`) attribute or
 * property, an argument of `cn()` or `cva()`, or the value of a `*Class` constant, at any depth
 * of the expression there (a condition, a concatenation, a variants object). A string anywhere
 * else (an attribute name, a selector, a marker) is behaviour, so it is mutated even when it looks
 * like a class list.
 */
export function inClassPosition(path) {
  for (let node = path.parentPath; node; node = node.parentPath) {
    if (node.isJSXAttribute?.() && className.test(nameOf(node.node.name) ?? "")) return true;
    if (node.isObjectProperty?.() && className.test(nameOf(node.node.key) ?? "")) return true;
    if (node.isVariableDeclarator?.() && className.test(nameOf(node.node.id) ?? "")) return true;
    if (node.isCallExpression?.() && classFunctions.has(nameOf(node.node.callee) ?? "")) return true;
    if (node.isStatement?.() || node.isFunction?.() || node.isJSXElement?.()) return false;
  }
  return false;
}

/**
 * Whether a node lies wholly in lines another shard owns: `excluded` (repository-relative path to
 * 1-based line ranges, `unitExclusions` in scripts/mutation.mjs, by default from
 * `OURO_MUTATION_EXCLUDED`), the parts of a long range this run's spanning unit leaves to the
 * units that own them. Stryker names the file absolutely (its Babel file's `filename`).
 */
export function inOtherShard(path, excluded = excludedLines()) {
  const filename = path.hub?.file?.opts?.filename;
  const loc = path.node?.loc;
  if (!filename || !loc) return false;
  for (const [file, ranges] of Object.entries(excluded)) {
    if (filename !== file && !filename.endsWith(`/${file}`)) continue;
    if (ranges.some(([start, end]) => loc.start.line >= start && loc.end.line <= end)) return true;
  }
  return false;
}

const parsedExclusions = new Map();
/** `OURO_MUTATION_EXCLUDED` as it is now (scripts/mutation.mjs sets it only after it plans the shards), parsed once. */
function excludedLines() {
  const value = process.env["OURO_MUTATION_EXCLUDED"] ?? "{}";
  if (!parsedExclusions.has(value)) parsedExclusions.set(value, JSON.parse(value));
  return parsedExclusions.get(value);
}

/** Why Stryker leaves a node's mutants out, or undefined to mutate it. */
export function ignoreReason(path) {
  if (inOtherShard(path)) return "another shard's part of this range";
  const literal = path.isStringLiteral() && isClassList(path.node.value);
  const quasis = path.isTemplateLiteral() ? path.node.quasis.map((quasi) => quasi.value.cooked ?? "").filter((text) => text.trim() !== "") : [];
  if ((literal || (quasis.length > 0 && isClassList(quasis.join(" ")))) && inClassPosition(path)) return "Tailwind classes: how a part looks, which the screenshot tests hold";
  if (inDevelopmentCheck(path)) return "the development check: every test runs in development";
  return undefined;
}

export const strykerPlugins = [declareClassPlugin(PluginKind.TestRunner, "vitest-browser", VitestBrowserRunner), declareValuePlugin(PluginKind.Ignore, "ouro-classes", { shouldIgnore: ignoreReason })];
