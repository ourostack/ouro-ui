// How CI shards the browser tests (`vitest run --shard=<index>/<count>`, .github/workflows/ci.yml).
// Each test file runs in one shard, chosen by its measured time (scripts/shard.mjs) so the shards
// take about as long as each other, except the sliced suites: each runs in every shard, over that
// shard's slice of the stories or pages it iterates (test/slice.ts). Vitest's own split counts files,
// and one of these files alone took longer than a whole shard should.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { BaseSequencer, type Reporter, type TestModule, type TestSpecification, type Vitest } from "vitest/node";
import { readTimings, shardKeys, slicedSuites } from "./shard.mjs";

export { slicedSuites };

/** The `<index>/<count>` of a `--shard` argument in a command line, or null. */
export function shardArgument(argv: readonly string[]): string | null {
  for (const [position, arg] of argv.entries()) {
    if (arg.startsWith("--shard=")) return arg.slice("--shard=".length);
    if (arg === "--shard") return argv[position + 1] ?? null;
  }
  return null;
}

const posix = (path: string) => path.split(sep).join("/");

/** A test file's key in scripts/shard-timings.json: `<project> <path>`, the project as Vitest names it (`ouro-chromium (chromium)`). */
export const timingKey = (project: string, root: string, moduleId: string) => `${project} ${posix(relative(root, moduleId))}`;

/** Picks each shard's files by measured time, and gives every shard the sliced suites. */
export class TimedSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { config } = this.ctx;
    const { index, count } = config.shard!;
    const path = (spec: TestSpecification) => posix(relative(config.root, spec.moduleId));
    const key = (spec: TestSpecification) => timingKey(spec.project.name, config.root, spec.moduleId);
    const sliced = files.filter((spec) => slicedSuites.includes(path(spec)));
    const rest = files.filter((spec) => !slicedSuites.includes(path(spec)));
    const mine = new Set(shardKeys(rest.map(key), { index, count }, readTimings("vitest")));
    return [...sliced, ...rest.filter((spec) => mine.has(key(spec)))];
  }
}

/**
 * Writes how long each test file took, `<project> <path>` to milliseconds, to
 * .tmp/timings/vitest-<index>of<count>.json, which `node scripts/shard.mjs refresh` reads.
 */
export class TimingsReporter implements Reporter {
  #vitest: Vitest | undefined;

  onInit(vitest: Vitest): void {
    this.#vitest = vitest;
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const vitest = this.#vitest;
    if (!vitest || testModules.length === 0) return;
    const { root } = vitest.config;
    const shard = vitest.config.shard ?? { index: 1, count: 1 };
    const times = Object.fromEntries(testModules.map((module) => [timingKey(module.project.name, root, module.moduleId), Math.round(module.diagnostic().duration)]));
    const dir = join(root, ".tmp/timings");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `vitest-${shard.index}of${shard.count}.json`), `${JSON.stringify(times, null, 2)}\n`);
  }
}
