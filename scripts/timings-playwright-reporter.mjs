// A Playwright reporter that writes how long each spec file's tests took, file to milliseconds, as
// JSON to its `outputFile`: CI's e2e shards write it to .tmp/timings/e2e-<index>of<count>.json for
// `node scripts/shard.mjs refresh` (.github/workflows/ci.yml, playwright.config.ts). A file's time is
// the sum of its tests' in every project and attempt: what a shard spends on it across its workers.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";

export default class TimingsReporter {
  #times = {};
  #outputFile;

  constructor({ outputFile } = {}) {
    this.#outputFile = outputFile;
  }

  onTestEnd(test, result) {
    const file = relative(process.cwd(), test.location.file).split("\\").join("/");
    this.#times[file] = Math.round((this.#times[file] ?? 0) + result.duration);
  }

  onEnd() {
    if (!this.#outputFile) return;
    mkdirSync(dirname(this.#outputFile), { recursive: true });
    const sorted = Object.fromEntries(Object.entries(this.#times).sort(([a], [b]) => (a < b ? -1 : 1)));
    writeFileSync(this.#outputFile, `${JSON.stringify(sorted, null, 2)}\n`);
  }

  printsToStdio() {
    return false;
  }
}
