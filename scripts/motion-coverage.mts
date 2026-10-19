// Holds every component.json `motion` map (scripts/components.mts, readMotion) complete against
// the evidence the browser tests wrote (scripts/motion-reporter.mts, test/motion.ts).
//
//   node scripts/motion-coverage.mts [--dir .tmp/motion] [--expect <project>:<shard count>,…] [--stems <stem>,…]
//
// It reads every partition under --dir, at any depth (CI downloads each job's artifact into a
// folder of its own), and merges them deterministically: records sorted and de-duplicated by exact
// record. With --expect, each named project must have exactly one partition for each of its
// shards, and no other partition may appear. Then, for each declared stem:
//
// - each test a state, transition or gesture names must have run (else stale) and recorded it
//   (else unexercised);
// - the properties recorded for a (stem, part, state, reduced) must union to the declared list
//   exactly, no missing and no extra property;
// - a `motion` state needs a reduced-motion record for every part (an empty one from
//   expectNoMotion when `reduced` is []), and a `none` state no recorded property;
// - a record that names a stem, state, part, transition or gesture no map declares fails.
//
// Components without `motion` are out of scope until they declare one. With --stems (a pull
// request's reduced run, scripts/test-impact.mjs, which ran only those components' tests), only
// those stems' maps must be complete; a record still may name no undeclared stem or state.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readMotion, type MotionComponent } from "./components.mts";
import { sortRecords, type EvidenceRecord, type MotionPartition } from "./motion-reporter.mts";

export interface Expected {
  project: string;
  count: number;
}

export interface Merged {
  records: EvidenceRecord[];
  tests: string[];
  problems: string[];
}

/** `ouro-chromium:2,ouro-webkit:1` to `[{ project, count }]`. */
export function parseExpect(text: string): Expected[] {
  const expected = text.split(",").map((entry) => {
    const match = /^([\w-]+):([1-9]\d*)$/.exec(entry.trim());
    if (!match) throw new Error(`--expect takes <project>:<shard count>,… (ouro-chromium:1,ouro-webkit:1), not "${entry}".`);
    return { project: match[1]!, count: Number(match[2]) };
  });
  const twice = expected.find((entry, index) => expected.findIndex((other) => other.project === entry.project) !== index);
  if (twice) throw new Error(`--expect names ${twice.project} twice.`);
  return expected;
}

/** Every partition file under `dir`, at any depth, with its path relative to `dir`, sorted. */
export function readPartitions(dir: string): Array<{ file: string; data: MotionPartition }> {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort()
    .map((file) => ({ file, data: JSON.parse(readFileSync(join(dir, file), "utf8")) as MotionPartition }));
}

const label = (data: MotionPartition) => `partition ${data.project} shard ${data.shard.index} of ${data.shard.count}`;

/** Merges partitions: the union of their tests and records, and what is wrong with the set. */
export function mergePartitions(files: Array<{ file: string; data: MotionPartition }>, expected?: Expected[]): Merged {
  const problems: string[] = [];
  if (files.length === 0) problems.push("no motion partitions found: run pnpm test first");
  const byShard = new Map<string, string[]>();
  for (const { file, data } of files) {
    if (!basename(file).startsWith(`${data.project}.${data.shard.index}of${data.shard.count}.`)) problems.push(`${file} holds ${label(data)}, which its name does not match`);
    const key = label(data);
    byShard.set(key, [...(byShard.get(key) ?? []), file]);
    if (expected && !expected.some((entry) => entry.project === data.project && entry.count === data.shard.count && data.shard.index <= entry.count)) problems.push(`${key} (${file}) is not expected`);
  }
  for (const [key, list] of byShard) if (list.length > 1) problems.push(`${key} appears twice: ${[...list].sort().join(", ")}`);
  for (const { project, count } of expected ?? []) {
    for (let index = 1; index <= count; index++) {
      const key = `partition ${project} shard ${index} of ${count}`;
      if (!byShard.has(key)) problems.push(`${key} is missing`);
    }
  }
  return {
    records: sortRecords(files.flatMap(({ data }) => data.records)),
    tests: [...new Set(files.flatMap(({ data }) => data.tests))].sort(),
    problems: [...new Set(problems)].sort(),
  };
}

const list = (names: Iterable<string>) => [...names].sort().join(", ") || "nothing";

/** The differences between a declared and a recorded property list, as `missing x, extra y`. */
function difference(declared: string[], recorded: string[]): string {
  const missing = declared.filter((name) => !recorded.includes(name));
  const extra = recorded.filter((name) => !declared.includes(name));
  return [missing.length > 0 && `missing ${list(missing)}`, extra.length > 0 && `extra ${list(extra)}`].filter(Boolean).join(", ");
}

/**
 * Every way the evidence falls short of the maps, one line each, sorted. With `only`, the maps of
 * other stems need not be complete (their tests did not run), but every record is still checked.
 */
export function checkCoverage(maps: MotionComponent[], merged: Pick<Merged, "records" | "tests">, only?: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const ran = new Set(merged.tests);
  const byStem = new Map(maps.map((entry) => [entry.stem, entry.motion]));
  const records = merged.records as Array<EvidenceRecord & Record<string, string & boolean & string[]>>;

  for (const record of records) {
    const motion = byStem.get(record.stem);
    const where =
      record.kind === "transition"
        ? `${record.stem} transition ${record.from} to ${record.to}`
        : record.kind === "gesture"
          ? `${record.stem} gesture ${record.gesture}`
          : `${record.stem} ${record.state}`;
    const from = `a record from "${record.testId}"`;
    if (!motion) {
      problems.push(`${where}: ${from} names a stem with no motion map (undeclared)`);
    } else if (record.kind === "transition") {
      if (!(motion.transitions ?? []).some((entry) => entry.from === record.from && entry.to === record.to && entry.interrupt === record.interrupt)) {
        problems.push(`${where}: ${from} names a transition the map does not declare (undeclared)`);
      }
    } else if (record.kind === "gesture") {
      if (!(motion.gestures ?? []).some((entry) => entry.name === record.gesture)) problems.push(`${where}: ${from} names a gesture the map does not declare (undeclared)`);
    } else {
      const state = motion.states[record.state];
      if (!state) problems.push(`${where}: ${from} names a state the map does not declare (undeclared)`);
      else if (state.kind !== "none" && !(record.part in (state.parts ?? {}))) problems.push(`${where} ${record.part}: ${from} names a part the state does not declare (undeclared)`);
    }
  }

  /** Stale and unexercised: each named test ran, and made a record that `matches`. */
  const exercised = (where: string, tests: string[], matches: (record: EvidenceRecord & Record<string, unknown>) => boolean) => {
    for (const testId of tests) {
      if (!ran.has(testId)) problems.push(`${where}: names test "${testId}", which no partition ran (stale)`);
      else if (!records.some((record) => record.testId === testId && matches(record))) problems.push(`${where}: test "${testId}" ran but made no record (unexercised)`);
    }
  };

  for (const { stem, motion } of maps.filter((entry) => !only || only.has(entry.stem))) {
    for (const [name, state] of Object.entries(motion.states)) {
      const where = `${stem} ${name}`;
      const ofState = records.filter((record) => record.kind === "state" && record.stem === stem && record.state === name);
      exercised(where, state.tests, (record) => record.kind === "state" && record.stem === stem && record.state === name);
      if (state.kind === "none") {
        for (const record of ofState) {
          if (record.properties.length > 0) problems.push(`${where}: declared no motion but "${record.testId}" recorded ${list(record.properties)} on ${record.part} (extra ${list(record.properties)})`);
        }
        continue;
      }
      for (const [part, declared] of Object.entries(state.parts ?? {})) {
        for (const reduced of state.kind === "motion" ? [false, true] : [false]) {
          const found = ofState.filter((record) => record.part === part && record.reduced === reduced);
          const expected = [...(reduced ? declared.reduced : declared.properties)].sort();
          if (found.length === 0) {
            problems.push(
              reduced
                ? `${where} ${part}: no reduced-motion record; prove it under reduced motion with expectMotion, or with expectNoMotion when "reduced" is []`
                : `${where} ${part}: no record; prove it with expectMotion in one of the state's tests`,
            );
            continue;
          }
          const union = [...new Set(found.flatMap((record) => record.properties))].sort();
          if (union.join() !== expected.join()) {
            problems.push(`${where} ${part}${reduced ? " with reduced motion" : ""}: declared ${list(expected)} but the tests recorded ${list(union)} (${difference(expected, union)})`);
          }
        }
      }
    }
    for (const transition of motion.transitions ?? []) {
      const where = `${stem} transition ${transition.from} to ${transition.to}${transition.interrupt ? " (interrupt)" : ""}`;
      exercised(where, transition.tests, (record) => record.kind === "transition" && record.stem === stem && record.from === transition.from && record.to === transition.to && record.interrupt === transition.interrupt);
    }
    for (const gesture of motion.gestures ?? []) {
      exercised(`${stem} gesture ${gesture.name}`, gesture.tests, (record) => record.kind === "gesture" && record.stem === stem && record.gesture === gesture.name);
    }
  }
  return [...new Set(problems)].sort();
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function main(argv: string[]): number {
  const dirIndex = argv.indexOf("--dir");
  const dir = resolve(dirIndex >= 0 ? argv[dirIndex + 1]! : join(repoRoot, ".tmp/motion"));
  const expectIndex = argv.indexOf("--expect");
  const expected = expectIndex >= 0 ? parseExpect(argv[expectIndex + 1] ?? "") : undefined;
  const stemsIndex = argv.indexOf("--stems");
  const only = stemsIndex >= 0 ? new Set((argv[stemsIndex + 1] ?? "").split(",").filter(Boolean)) : undefined;
  const files = existsSync(dir) ? readPartitions(dir) : [];
  const merged = mergePartitions(files, expected);
  const maps = readMotion(repoRoot);
  const problems = [...merged.problems, ...checkCoverage(maps, merged, only)];
  if (problems.length > 0) {
    process.stderr.write(`Motion coverage failed (${relative(process.cwd(), dir) || "."}):\n${problems.map((problem) => `- ${problem}`).join("\n")}\n`);
    return 1;
  }
  const checked = only ? maps.filter((entry) => only.has(entry.stem)).length : maps.length;
  process.stdout.write(`Motion coverage: ${checked} motion map${checked === 1 ? "" : "s"}${only ? ` (of ${maps.length}; this run's stems: ${[...only].sort().join(", ") || "none"})` : ""} complete against ${files.length} partitions (${merged.records.length} records from ${merged.tests.length} tests).\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
