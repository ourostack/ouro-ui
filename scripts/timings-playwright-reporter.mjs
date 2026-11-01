// A Playwright reporter that writes how long each spec file's tests took, file to milliseconds, as
// JSON to its `outputFile`: CI's e2e shards write it to .tmp/timings/e2e-<index>of<count>.json for
// `node scripts/shard.mjs refresh` (.github/workflows/ci.yml, playwright.config.ts). A file's time is
// the sum of its tests' in every project and attempt: what a shard spends on it across its workers.
//
// With `by: "test"`, each test's own time instead, keyed as `testKey` names it: CI's latency shards
// write .tmp/timings/latency-<index>of<count>.json (playwright.latency.config.ts), and the latency
// check reads which tests each shard ran from it (`node scripts/shard.mjs latency-check`).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";

/**
 * A test's key, as Playwright's --test-list reads it: its file relative to the config's rootDir, then
 * its describe titles and its own title, joined by " › ". The title path must not hold that
 * separator, or ">", which --test-list also splits on.
 */
export function testKey(rootDir, test) {
  const titles = [test.title];
  for (let suite = test.parent; suite && suite.type === "describe"; suite = suite.parent) titles.unshift(suite.title);
  for (const title of titles) if (/[›>]/.test(title) || title !== title.trim()) throw new Error(`A test list cannot name "${title}": it holds "›" or ">", or starts or ends with a space.`);
  return [relative(rootDir, test.location.file).split("\\").join("/"), ...titles].join(" › ");
}

export default class TimingsReporter {
  #times = {};
  #outputFile;
  #by;
  #rootDir = process.cwd();

  constructor({ outputFile, by = "file" } = {}) {
    this.#outputFile = outputFile;
    this.#by = by;
  }

  onBegin(config) {
    this.#rootDir = config.rootDir;
  }

  onTestEnd(test, result) {
    const key = this.#by === "test" ? testKey(this.#rootDir, test) : relative(process.cwd(), test.location.file).split("\\").join("/");
    this.#times[key] = Math.round((this.#times[key] ?? 0) + result.duration);
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
