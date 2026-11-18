// The Vitest reporter that fails a stalled browser shard in minutes, naming what hung (issue #671).
// A shard that hangs outside a test body (a browser tab, a worker, a hook or teardown) never lets a
// test time out, so the job ran into its hour with nothing in the log. This reporter watches the
// time since any test case last finished: after two minutes it names what is in flight once, and
// after five it exits the process, so the step fails and the log names what hung. What it names
// includes each file still loading, waiting to start or in a module hook, and the files no worker
// has started yet (issue #1814). vitest.config.ts adds it to CI's shard runs. OURO_VITEST_STALL_WARN_MS
// and OURO_VITEST_STALL_FAIL_MS change the two thresholds, for tests and local runs.
// A test that has run for half its timeout is named once, with the longest hold on Node's event loop
// while it ran (#2003): a browser command answered through a Node that was held up waits behind it, and
// a test that times out on a command names the command (registry/ouro/lib/ouro/testing/command-deadline.ts).
import { relative, sep } from "node:path";
import type { Reporter, ReportedHookContext, TestCase, TestModule, TestSpecification, TestSuite, Vitest } from "vitest/node";

/** Where a file is: loading its module, loaded and waiting for its tests to start, or running them. */
export type Phase = "collecting" | "waiting" | "running";

/** Something running now: a test case, or a file with no test running, in its phase or a module hook (`name` null). */
export interface InFlight {
  project: string;
  file: string;
  name: string | null;
  startedAt: number;
  phase?: Phase;
  /** The hook running with no test in flight: `beforeAll`, `afterAll`, or either of a suite (`afterAll of "Dialog"`). */
  hook?: string;
}

/** The run's files that have not started, and how many of its files have finished. */
export interface PendingRun {
  notStarted: { project: string; file: string }[];
  finished: number;
  total: number;
}

export interface StallOptions {
  warnAfter: number;
  failAfter: number;
}

export interface StallReport {
  level: "ok" | "warn" | "fail";
  text: string;
}

/** The files the stall names before it says how many more there are. */
const LISTED = 12;

/** A duration as the thresholds name it: `2 min`, `10 s` when it is not whole minutes, `500 ms` under a second. */
const threshold = (ms: number) => (ms >= 60_000 && ms % 60_000 === 0 ? `${ms / 60_000} min` : ms < 1000 ? `${ms} ms` : `${Math.round(ms / 1000)} s`);

/** An elapsed time as the in-flight list shows it: `45s`, then `2m 10s`. */
const elapsed = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

/** A file as the stall names it: its project, when it has one, then its path. */
const label = (project: string, file: string) => (project ? `${project} ${file}` : file);

/** A hold on Node's event loop at least this long is named; shorter ones are scheduling noise. */
const HOLD_MS = 50;

/** A hold at least this long is named when it ends, with the tests in flight. */
const LONG_HOLD_MS = 1000;

/** How often the reporter's ticker looks at Node's event loop: a tick that runs late was held up by the work before it. */
const LOOP_TICK_MS = 20;

/** A duration on the slow-test and hold lines: `120 ms` under a second, then as the in-flight list shows it. */
const spanOf = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : elapsed(ms));

/**
 * The line written when a hold of at least LONG_HOLD_MS ends: the hold, and what was in flight meanwhile. A browser
 * command Node answers in that time waits behind the hold, and a test that times out on one names the command.
 */
export function holdText(heldMs: number, inFlight: readonly InFlight[], now: number): string {
  const list = inFlight.length === 0 ? "No test in flight." : `In flight: ${inFlight.map((entry) => describeInFlight(entry, now)).join("; ")}.`;
  return `[ouro-ui] Vitest: Node's event loop was held up for ${spanOf(heldMs)}, and a browser command answered in that time waited behind it. ${list}`;
}

/**
 * The line written once a test case has run for half its timeout: how long it has run, and the longest hold on
 * Node's event loop while it ran (`heldMs`, 0 when no hold reached HOLD_MS). A hold is what a browser command's
 * answer waits behind, since Node answers every browser command. The reporter cannot see the browser command
 * a test awaits, so the line says so.
 */
export function slowTestText(entry: Pick<InFlight, "project" | "file" | "name">, runningMs: number, timeoutMs: number, heldMs: number): string {
  const loop =
    heldMs >= HOLD_MS
      ? `Node's event loop was held up for ${spanOf(heldMs)} while it ran, so an answer from Node may have waited behind it.`
      : `Node's event loop was not held up for ${HOLD_MS} ms or more while it ran, so the wait is not in Node.`;
  return `[ouro-ui] Vitest: ${label(entry.project, entry.file)} > ${entry.name} has run for ${spanOf(runningMs)} of its ${threshold(timeoutMs)} timeout. ${loop} The reporter cannot see the browser command a test awaits; a timeout names it.`;
}

/** One in-flight entry: a test case with its running time, or a file in the phase or hook it is in. */
const describeInFlight = ({ project, file, name, startedAt, phase = "running", hook }: InFlight, now: number): string => {
  const head = label(project, file);
  const time = elapsed(now - startedAt);
  if (name !== null) return `${head} > ${name} (running ${time})`;
  if (phase === "collecting") return `${head} (loading its module for ${time})`;
  if (phase === "waiting") return `${head} (loaded, not started for ${time})`;
  if (hook?.startsWith("afterAll")) return `${head} (in ${hook}: its teardown, for ${time})`;
  if (hook) return `${head} (in ${hook}: its setup, for ${time})`;
  return `${head} > (no test running: its setup, hooks or teardown) (running ${time})`;
};

/**
 * What the watchdog reports at `now`, given what is in flight, when a test case last finished, and
 * what has not started: ok while tests keep finishing, warn once none has finished for `warnAfter` ms,
 * and fail once none has for `failAfter` ms. The text names each thing in flight with its project,
 * file, test or phase and time, then the files not yet started and how many files have finished.
 */
export function stallReport(
  inFlight: readonly InFlight[],
  lastFinish: number,
  now: number,
  { warnAfter, failAfter }: StallOptions,
  pending: PendingRun = { notStarted: [], finished: 0, total: 0 },
): StallReport {
  const idle = now - lastFinish;
  const level = idle >= failAfter ? "fail" : idle >= warnAfter ? "warn" : "ok";
  if (level === "ok") return { level, text: "" };
  const parts = [
    inFlight.length === 0 ? "No test in flight: the run is between files or in teardown." : `In flight: ${inFlight.map((entry) => describeInFlight(entry, now)).join("; ")}.`,
  ];
  if (pending.notStarted.length > 0) {
    const listed = pending.notStarted.slice(0, LISTED).map(({ project, file }) => label(project, file));
    const more = pending.notStarted.length > LISTED ? `; and ${pending.notStarted.length - LISTED} more` : "";
    parts.push(`Not started: ${listed.join("; ")}${more}.`);
  }
  if (pending.total > 0) parts.push(`Finished ${pending.finished} of ${pending.total} files.`);
  const list = parts.join(" ");
  const text =
    level === "warn"
      ? `[ouro-ui] Vitest has had no test finish for ${threshold(warnAfter)}. ${list}`
      : `[ouro-ui] Vitest stalled for ${threshold(failAfter)}; failing the run so the shard names what hung. ${list}`;
  return { level, text };
}

const envMs = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
};

/** A file the run has started: its phase, when that began, and the module hook running, if any. */
interface ModuleEntry {
  project: string;
  file: string;
  phase: Phase;
  phaseAt: number;
  hook?: { name: string; startedAt: number };
}

/** Watches for a stall, and for a test that has run long, every second, from the run's start to its end (see the file's comment). */
export class StallReporter implements Reporter {
  readonly #options: StallOptions;
  readonly #intervalMs: number;
  readonly #modules = new Map<string, ModuleEntry>();
  readonly #cases = new Map<string, { moduleKey: string; entry: InFlight; timeout: number; due: boolean; named: boolean }>();
  readonly #pending = new Map<string, { project: string; file: string }>();
  readonly #holds: { endedAt: number; ms: number }[] = [];
  #finished = 0;
  #total = 0;
  #root = process.cwd();
  #lastFinish = Date.now();
  #warned = false;
  #timer: ReturnType<typeof setInterval> | undefined;
  #ticker: ReturnType<typeof setInterval> | undefined;
  #tickedAt = Date.now();

  constructor({ warnAfter = envMs("OURO_VITEST_STALL_WARN_MS", 120_000), failAfter = envMs("OURO_VITEST_STALL_FAIL_MS", 300_000), intervalMs = 1_000 } = {}) {
    this.#options = { warnAfter, failAfter };
    this.#intervalMs = intervalMs;
  }

  onInit(vitest: Vitest): void {
    this.#root = vitest.config.root;
  }

  onTestRunStart(specifications: ReadonlyArray<TestSpecification>): void {
    this.#lastFinish = Date.now();
    this.#modules.clear();
    this.#cases.clear();
    this.#pending.clear();
    this.#holds.length = 0;
    for (const { project, moduleId } of specifications) {
      this.#pending.set(`${project.name}\0${moduleId}`, { project: project.name, file: this.#file(moduleId) });
    }
    this.#finished = 0;
    this.#total = this.#pending.size;
    this.#tickedAt = Date.now();
    this.#ticker = setInterval(() => this.#tick(), LOOP_TICK_MS);
    this.#ticker.unref();
    this.#timer = setInterval(() => this.#check(), this.#intervalMs);
    this.#timer.unref();
  }

  onTestModuleQueued(testModule: TestModule): void {
    this.#module(testModule, "collecting");
  }

  onTestModuleCollected(testModule: TestModule): void {
    this.#module(testModule, "waiting");
  }

  onTestModuleStart(testModule: TestModule): void {
    this.#module(testModule, "running");
  }

  onTestModuleEnd(testModule: TestModule): void {
    this.#modules.delete(this.#moduleKey(testModule));
    this.#finished++;
  }

  onHookStart(hook: ReportedHookContext): void {
    const module = this.#hookModule(hook);
    if (!module) return;
    const entry = this.#module(module, this.#modules.get(this.#moduleKey(module))?.phase ?? "running");
    entry.hook = { name: this.#hookLabel(hook), startedAt: Date.now() };
  }

  onHookEnd(hook: ReportedHookContext): void {
    const module = this.#hookModule(hook);
    if (module) delete this.#modules.get(this.#moduleKey(module))?.hook;
  }

  onTestCaseReady(testCase: TestCase): void {
    const entry = { project: testCase.module.project.name, file: this.#file(testCase.module.moduleId), name: testCase.fullName, startedAt: Date.now() };
    const timeout = testCase.options.timeout ?? testCase.module.project.config.testTimeout;
    this.#cases.set(testCase.id, { moduleKey: this.#moduleKey(testCase.module), entry, timeout, due: false, named: false });
  }

  onTestCaseResult(testCase: TestCase): void {
    this.#cases.delete(testCase.id);
    this.#lastFinish = Date.now();
    this.#warned = false;
  }

  onTestRunEnd(): void {
    clearInterval(this.#timer);
    clearInterval(this.#ticker);
  }

  /** Records a tick that ran late as a hold on Node's event loop, and names a long one as it ends. */
  #tick(): void {
    const now = Date.now();
    const late = now - this.#tickedAt - LOOP_TICK_MS;
    this.#tickedAt = now;
    if (late < HOLD_MS) return;
    this.#holds.push({ endedAt: now, ms: late });
    if (this.#holds.length > 200) this.#holds.shift();
    if (late >= LONG_HOLD_MS) process.stderr.write(`${holdText(late, this.#inFlight(), now)}\n`);
  }

  /** The longest hold that ended since `start`, 0 when none did. */
  #heldSince(start: number): number {
    return this.#holds.reduce((longest, hold) => (hold.endedAt >= start ? Math.max(longest, hold.ms) : longest), 0);
  }

  #moduleKey(testModule: TestModule): string {
    return `${testModule.project.name}\0${testModule.moduleId}`;
  }

  #file(moduleId: string): string {
    return relative(this.#root, moduleId).split(sep).join("/");
  }

  /** Records a file's phase as it moves forward, and takes it off the list of files not yet started. */
  #module(testModule: TestModule, phase: Phase): ModuleEntry {
    const key = this.#moduleKey(testModule);
    this.#pending.delete(key);
    const current = this.#modules.get(key);
    if (current && current.phase === phase) return current;
    const entry: ModuleEntry = current ?? { project: testModule.project.name, file: this.#file(testModule.moduleId), phase, phaseAt: Date.now() };
    entry.phase = phase;
    entry.phaseAt = Date.now();
    this.#modules.set(key, entry);
    return entry;
  }

  /** The module a hook belongs to: a module's or a suite's `beforeAll` and `afterAll`, not each test's `beforeEach` and `afterEach`. */
  #hookModule(hook: ReportedHookContext): TestModule | undefined {
    if (hook.name !== "beforeAll" && hook.name !== "afterAll") return undefined;
    const entity = hook.entity as TestModule | TestSuite;
    return entity.type === "module" ? entity : entity.module;
  }

  #hookLabel(hook: ReportedHookContext): string {
    return hook.entity.type === "suite" ? `${hook.name} of "${hook.entity.name}"` : hook.name;
  }

  /** Each test case in flight, and each file none of whose tests is running (its loading, setup, hooks or teardown). */
  #inFlight(): InFlight[] {
    const cases = [...this.#cases.values()];
    const running = new Set(cases.map(({ moduleKey }) => moduleKey));
    const files = [...this.#modules]
      .filter(([key]) => !running.has(key))
      .map(([, { project, file, phase, phaseAt, hook }]): InFlight => ({
        project,
        file,
        name: null,
        startedAt: hook?.startedAt ?? phaseAt,
        phase,
        ...(hook ? { hook: hook.name } : {}),
      }));
    return [...cases.map(({ entry }) => entry), ...files];
  }

  /**
   * Writes the slow-test line once for each test case that has run for half its timeout. A test is named a tick
   * after it is due, so a hold that ends just after this tick is counted.
   */
  #watchCases(now: number): void {
    for (const kase of this.#cases.values()) {
      if (kase.named || now - kase.entry.startedAt < kase.timeout / 2) continue;
      if (!kase.due) {
        kase.due = true;
        continue;
      }
      kase.named = true;
      process.stderr.write(`${slowTestText(kase.entry, now - kase.entry.startedAt, kase.timeout, this.#heldSince(kase.entry.startedAt))}\n`);
    }
  }

  #check(): void {
    const now = Date.now();
    this.#watchCases(now);
    const pending: PendingRun = { notStarted: [...this.#pending.values()], finished: this.#finished, total: this.#total };
    const report = stallReport(this.#inFlight(), this.#lastFinish, now, this.#options, pending);
    if (report.level === "warn" && !this.#warned) {
      this.#warned = true;
      process.stderr.write(`${report.text}\n`);
    }
    if (report.level === "fail") {
      process.stderr.write(`${report.text}\n`);
      process.exit(1);
    }
  }
}
