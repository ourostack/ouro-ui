// The Vitest reporter that writes the motion evidence: for each project a run touched, one
// partition file, .tmp/motion/<project>.<index>of<count>.<worker>.json, holding every test id it
// ran (`<file>::<full test name>`) and the motion records (test/motion.ts) of the tests that
// passed, each with its test id. `<worker>` is random per run, so partitions CI downloads from
// several jobs never overwrite one another; scripts/motion-coverage.mts merges them and fails when
// one is missing or appears twice. A run replaces the partitions an earlier run on this machine
// left for the same project. vitest.config.ts adds it beside the default reporters.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Reporter, TestModule, Vitest } from "vitest/node";

/** A motion record with the id of the test that made it. */
export type EvidenceRecord = Record<string, unknown> & { kind: string; stem: string; testId: string };

/** What one project and shard of one run proved. */
export interface MotionPartition {
  project: string;
  shard: { index: number; count: number };
  /** A random id for the process that wrote it. */
  worker: string;
  /** Every test the run collected, passed or not, sorted. */
  tests: string[];
  /** The records of the tests that passed, sorted and de-duplicated. */
  records: EvidenceRecord[];
}

/** One test as the reporter sees it. */
export interface MotionCase {
  testId: string;
  /** Vitest's result state: `passed`, `failed`, `skipped`, `pending`. */
  state: string;
  records: Array<Record<string, unknown>>;
}

/** A record with its keys sorted and its property list sorted, so equal records serialize equally. */
export function canonicalRecord(record: Record<string, unknown>): EvidenceRecord {
  const sorted = Object.fromEntries(Object.keys(record).sort().map((key) => [key, key === "properties" ? [...(record[key] as string[])].sort() : record[key]]));
  return sorted as EvidenceRecord;
}

/** Sorts records and drops exact duplicates. */
export function sortRecords(records: Array<Record<string, unknown>>): EvidenceRecord[] {
  const byText = new Map(records.map((record) => canonicalRecord(record)).map((record) => [JSON.stringify(record), record]));
  return [...byText.keys()].sort().map((text) => byText.get(text)!);
}

/** The partition of one project and shard, from the tests it ran. */
export function partitionOf({ project, shard, worker, cases }: { project: string; shard: { index: number; count: number }; worker: string; cases: MotionCase[] }): MotionPartition {
  return {
    project,
    shard,
    worker,
    tests: [...new Set(cases.map((entry) => entry.testId))].sort(),
    records: sortRecords(cases.filter((entry) => entry.state === "passed").flatMap((entry) => entry.records.map((record) => ({ ...record, testId: entry.testId })))),
  };
}

/** `<project>.<index>of<count>.<worker>.json`. */
export const partitionFile = (partition: Pick<MotionPartition, "project" | "shard" | "worker">): string =>
  `${partition.project}.${partition.shard.index}of${partition.shard.count}.${partition.worker}.json`;

/** Writes a partition into `dir`, replacing any partition of the same project an earlier run left there. */
export function writePartition(dir: string, partition: MotionPartition): string {
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) {
    if (name.startsWith(`${partition.project}.`) && /^[\w-]+\.\d+of\d+\.[\w-]+\.json$/.test(name)) unlinkSync(join(dir, name));
  }
  const file = join(dir, partitionFile(partition));
  writeFileSync(file, JSON.stringify(partition, null, 2) + "\n");
  return file;
}

/**
 * The partition name of each Vitest project: a browser project's instance (`ouro-chromium
 * (chromium)`) by its project's name (`ouro-chromium`), or by `<name>-<browser>` when the run has
 * several instances of one project.
 */
export function projectNames(names: string[]): Map<string, string> {
  const base = (name: string) => name.replace(/ \(([\w-]+)\)$/, "");
  return new Map(
    names.map((name) => {
      const shared = names.filter((other) => base(other) === base(name)).length > 1;
      const browser = / \(([\w-]+)\)$/.exec(name)?.[1];
      return [name, (shared && browser ? `${base(name)}-${browser}` : base(name)).replace(/[^\w-]+/g, "-")];
    }),
  );
}

/** Collects every project's motion records at the end of a run and writes their partitions. */
export class MotionReporter implements Reporter {
  #vitest: Vitest | undefined;
  readonly #dir: string | undefined;

  constructor(options: { dir?: string } = {}) {
    this.#dir = options.dir;
  }

  onInit(vitest: Vitest): void {
    this.#vitest = vitest;
  }

  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const vitest = this.#vitest;
    if (!vitest) return;
    const root = vitest.config.root;
    const shard = vitest.config.shard ?? { index: 1, count: 1 };
    const worker = randomBytes(4).toString("hex");
    const byProject = new Map<string, MotionCase[]>();
    for (const module of testModules) {
      const file = relative(root, module.moduleId);
      const cases = byProject.get(module.project.name) ?? [];
      for (const test of module.children.allTests()) {
        const meta = test.meta() as { motion?: Array<Record<string, unknown>> };
        cases.push({ testId: `${file}::${test.fullName}`, state: test.result().state, records: meta.motion ?? [] });
      }
      byProject.set(module.project.name, cases);
    }
    const dir = this.#dir ?? join(root, ".tmp/motion");
    const names = projectNames([...byProject.keys()]);
    for (const [project, cases] of byProject) writePartition(dir, partitionOf({ project: names.get(project)!, shard: { index: shard.index, count: shard.count }, worker, cases }));
    if (byProject.size > 0 && existsSync(dir)) vitest.logger.log(`Motion evidence: ${byProject.size} partition${byProject.size === 1 ? "" : "s"} in ${relative(root, dir)}/`);
  }
}
