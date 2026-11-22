// The Vitest reporter that holds each test to half its timeout (scripts/headroom.mjs). It reads every
// finished test's measured time and its own timeout (the test's, else the project's), prints each
// problem and fails the run. On a pull request, HEADROOM_CHANGED lists the files it changes and only
// tests in those files are judged; main judges every test.
import { relative, sep } from "node:path";
import type { Reporter, TestModule, Vitest } from "vitest/node";
import { changedFiles, headroomProblems, readExemptions, staleExemptions } from "./headroom.mjs";

export class HeadroomReporter implements Reporter {
  #vitest: Vitest | undefined;

  onInit(vitest: Vitest): void {
    this.#vitest = vitest;
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const root = this.#vitest?.config.root;
    if (!root) return;
    const changed = changedFiles(process.env.HEADROOM_CHANGED);
    const tests = [];
    for (const module of testModules) {
      const file = relative(root, module.moduleId).split(sep).join("/");
      if (changed && !changed.has(file)) continue;
      for (const test of module.children.allTests()) {
        const durationMs = test.result().state === "skipped" ? undefined : test.diagnostic()?.duration;
        if (durationMs === undefined) continue;
        const timeoutMs = test.options.timeout ?? module.project.config.testTimeout;
        tests.push({ name: `${module.project.name} ${file} > ${test.fullName}`, durationMs, timeoutMs });
      }
    }
    const problems = [...headroomProblems(tests, readExemptions()), ...staleExemptions(readExemptions())];
    for (const problem of problems) process.stderr.write(`${problem}\n`);
    if (problems.length > 0) process.exitCode = 1;
  }
}
