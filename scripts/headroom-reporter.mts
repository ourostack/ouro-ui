// The Vitest reporter that holds each test to half its timeout (scripts/headroom.mjs). It reads every
// finished test's measured time and its own timeout (the test's, else the project's), prints each
// problem and fails the run.
import { relative, sep } from "node:path";
import type { Reporter, TestModule, Vitest } from "vitest/node";
import { headroomProblems, readExemptions } from "./headroom.mjs";

export class HeadroomReporter implements Reporter {
  #vitest: Vitest | undefined;

  onInit(vitest: Vitest): void {
    this.#vitest = vitest;
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const root = this.#vitest?.config.root;
    if (!root) return;
    const tests = [];
    for (const module of testModules) {
      const file = relative(root, module.moduleId).split(sep).join("/");
      for (const test of module.children.allTests()) {
        const durationMs = test.result().state === "skipped" ? undefined : test.diagnostic()?.duration;
        if (durationMs === undefined) continue;
        const timeoutMs = test.options.timeout ?? module.project.config.testTimeout;
        tests.push({ name: `${module.project.name} ${file} > ${test.fullName}`, durationMs, timeoutMs });
      }
    }
    const problems = headroomProblems(tests, readExemptions());
    for (const problem of problems) process.stderr.write(`${problem}\n`);
    if (problems.length > 0) process.exitCode = 1;
  }
}
