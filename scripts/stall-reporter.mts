// The Vitest reporter that fails a stalled browser shard in minutes, naming what hung (issue #671).
// A shard that hangs outside a test body (a browser tab, a worker, a hook or teardown) never lets a
// test time out, so the job ran into its hour with nothing in the log. This reporter watches the
// time since any test case last finished: after two minutes it names the tests and files in flight
// once, and after five it exits the process, so the step fails and the log names what hung.
// vitest.config.ts adds it to CI's shard runs. OURO_VITEST_STALL_WARN_MS and OURO_VITEST_STALL_FAIL_MS
// change the two thresholds, for tests and local runs.
import { relative, sep } from "node:path";
import type { Reporter, TestCase, TestModule, Vitest } from "vitest/node";

/** Something running now: a test case, or a file whose setup runs before its first test (`name` null). */
export interface InFlight {
  project: string;
  file: string;
  name: string | null;
  startedAt: number;
}

export interface StallOptions {
  warnAfter: number;
  failAfter: number;
}

export interface StallReport {
  level: "ok" | "warn" | "fail";
  text: string;
}

/** A duration as the thresholds name it: `2 min`, or `10 s` when it is not whole minutes. */
const threshold = (ms: number) => (ms >= 60_000 && ms % 60_000 === 0 ? `${ms / 60_000} min` : `${Math.round(ms / 1000)} s`);

/** An elapsed time as the in-flight list shows it: `45s`, then `2m 10s`. */
const elapsed = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

/**
 * What the watchdog reports at `now`, given what is in flight and when a test case last finished:
 * ok while tests keep finishing, warn once none has finished for `warnAfter` ms, and fail once none
 * has for `failAfter` ms. The text names each thing in flight with its project, file, test and time.
 */
export function stallReport(inFlight: readonly InFlight[], lastFinish: number, now: number, { warnAfter, failAfter }: StallOptions): StallReport {
  const idle = now - lastFinish;
  const level = idle >= failAfter ? "fail" : idle >= warnAfter ? "warn" : "ok";
  if (level === "ok") return { level, text: "" };
  const list =
    inFlight.length === 0
      ? "No test in flight: the run is between files or in teardown."
      : `In flight: ${inFlight.map(({ project, file, name, startedAt }) => `${project} ${file} > ${name ?? "(no test running: its setup, hooks or teardown)"} (running ${elapsed(now - startedAt)})`).join("; ")}`;
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

/** Watches for a stall, every 15 seconds, from the run's start to its end (see the file's comment). */
export class StallReporter implements Reporter {
  readonly #options: StallOptions;
  readonly #intervalMs: number;
  readonly #modules = new Map<string, InFlight>();
  readonly #cases = new Map<string, { moduleKey: string; entry: InFlight }>();
  #root = process.cwd();
  #lastFinish = Date.now();
  #warned = false;
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor({ warnAfter = envMs("OURO_VITEST_STALL_WARN_MS", 120_000), failAfter = envMs("OURO_VITEST_STALL_FAIL_MS", 300_000), intervalMs = 15_000 } = {}) {
    this.#options = { warnAfter, failAfter };
    this.#intervalMs = intervalMs;
  }

  onInit(vitest: Vitest): void {
    this.#root = vitest.config.root;
  }

  onTestRunStart(): void {
    this.#lastFinish = Date.now();
    this.#timer = setInterval(() => this.#check(), this.#intervalMs);
    this.#timer.unref();
  }

  onTestModuleStart(testModule: TestModule): void {
    this.#modules.set(this.#moduleKey(testModule), this.#describe(testModule, null, Date.now()));
  }

  onTestModuleEnd(testModule: TestModule): void {
    this.#modules.delete(this.#moduleKey(testModule));
  }

  onTestCaseReady(testCase: TestCase): void {
    this.#cases.set(testCase.id, { moduleKey: this.#moduleKey(testCase.module), entry: this.#describe(testCase.module, testCase.fullName, Date.now()) });
  }

  onTestCaseResult(testCase: TestCase): void {
    this.#cases.delete(testCase.id);
    this.#lastFinish = Date.now();
    this.#warned = false;
  }

  onTestRunEnd(): void {
    clearInterval(this.#timer);
  }

  #moduleKey(testModule: TestModule): string {
    return `${testModule.project.name}\0${testModule.moduleId}`;
  }

  #describe(testModule: TestModule, name: string | null, startedAt: number): InFlight {
    const file = relative(this.#root, testModule.moduleId).split(sep).join("/");
    return { project: testModule.project.name, file, name, startedAt };
  }

  /** Each test case in flight, and each file none of whose tests is running (its setup or hooks). */
  #inFlight(): InFlight[] {
    const cases = [...this.#cases.values()];
    const running = new Set(cases.map(({ moduleKey }) => moduleKey));
    const files = [...this.#modules].filter(([key]) => !running.has(key)).map(([, entry]) => entry);
    return [...cases.map(({ entry }) => entry), ...files];
  }

  #check(): void {
    const now = Date.now();
    const report = stallReport(this.#inFlight(), this.#lastFinish, now, this.#options);
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
