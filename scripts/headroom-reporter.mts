// The Vitest reporter that holds each test to half its timeout (scripts/headroom.mjs). It reads every
// finished test's measured time and its own timeout (the test's, else the project's) and judges them. On
// a pull request, HEADROOM_CHANGED lists the files it changes and only tests in those files fail the run.
// On main, in the merge queue and on a schedule a breach only annotates the run and lands in
// .tmp/headroom/breaches.txt, which the shard uploads and headroom-report.yml files in one issue.
import { mkdirSync, writeFileSync } from "node:fs";
import { relative, sep } from "node:path";
import type { Reporter, TestModule, Vitest } from "vitest/node";
import { changedFiles, judge, readExemptions } from "./headroom.mjs";

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
        tests.push({ name: `${module.project.name} ${file} > ${test.fullName}`, file, durationMs, timeoutMs });
      }
    }
    const { failures, warnings, breaches } = judge({ tests, exemptions: readExemptions(), event: process.env.GITHUB_EVENT_NAME, changed: changedFiles(process.env.HEADROOM_CHANGED) });
    for (const warning of warnings) process.stdout.write(`${warning}\n`);
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    if (breaches.length > 0) {
      mkdirSync(".tmp/headroom", { recursive: true });
      writeFileSync(".tmp/headroom/breaches.txt", `${breaches.map((breach) => breach.replace(/^\[ouro-ui\] Headroom: /, "").replace(/;.*$/, "")).join("\n")}\n`);
    }
    if (failures.length > 0) process.exitCode = 1;
  }
}
