import { commonTokens, declareClassPlugin, declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";
import { DryRunStatus, MutantRunStatus, TestStatus } from "@stryker-mutator/api/test-runner";
import { clearTimeout, setTimeout } from "node:timers";
import { createVitest } from "vitest/node";

// The Stryker plugins `pnpm mutation` (scripts/mutation.mjs) runs with. Stryker's own Vitest runner
// does not support browser mode, and every test here runs in a browser, so:
//
// - `vitest-browser`, a test runner: one Vitest instance in this process (the `ouro-chromium`
//   project, over the test files scripts/mutation.mjs names), rerun once per mutant, stopping at
//   its first failing test (`bail`): the changed file's own tests first, then, only for a mutant
//   they let survive, the tests of what imports it. Stryker
//   writes every mutant into the source at once (mutant schemata), each behind a check of
//   `globalThis.__stryker__.activeMutant`; scripts/mutation/setup.ts sets that in the browser from
//   the `ouroMutant` command (vitest.config.ts), which reads `globalThis.__ouroMutant` here.
// - `ouro-classes`, an ignorer: a string that is only Tailwind classes changes how a part looks,
//   which the screenshot tests (CI's `visual` job) hold, not what it does, so its mutants are left
//   out; so is the `process.env.NODE_ENV` check that strips development messages, which no test
//   (they all run in development) can tell apart from its mutant.

/**
 * The test files to run, from scripts/mutation.mjs: `own`, the changed file's own tests, which
 * run first and kill most mutants at once, and `wider`, the tests of what imports it, which run
 * only for a mutant the own tests let survive.
 */
const testFiles = () => JSON.parse(process.env["OURO_MUTATION_TESTS"] ?? '{"own":[],"wider":[]}');

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
    const { own, wider } = testFiles();
    this.own = own.length > 0 ? await this.vitest.globTestSpecifications(own) : [];
    this.wider = wider.length > 0 ? await this.vitest.globTestSpecifications(wider) : [];
    if (this.own.length + this.wider.length === 0) throw new Error(`no test file matches ${[...own, ...wider].join(", ")}`);
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
    const run = await this.run(timeout, [...this.own, ...this.wider]);
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
      for (const specifications of [this.own, this.wider]) {
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

/** Why Stryker leaves a node's mutants out, or undefined to mutate it. */
export function ignoreReason(path) {
  const literal = path.isStringLiteral() && isClassList(path.node.value);
  const quasis = path.isTemplateLiteral() ? path.node.quasis.map((quasi) => quasi.value.cooked ?? "").filter((text) => text.trim() !== "") : [];
  if (literal || (quasis.length > 0 && isClassList(quasis.join(" ")))) return "Tailwind classes: how a part looks, which the screenshot tests hold";
  if (inDevelopmentCheck(path)) return "the development check: every test runs in development";
  return undefined;
}

export const strykerPlugins = [declareClassPlugin(PluginKind.TestRunner, "vitest-browser", VitestBrowserRunner), declareValuePlugin(PluginKind.Ignore, "ouro-classes", { shouldIgnore: ignoreReason })];
