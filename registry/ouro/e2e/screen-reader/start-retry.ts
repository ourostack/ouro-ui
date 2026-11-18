import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export { cannotStart, deepestCause, installVoiceOverStartRetry, START_DIAGNOSTICS_PREFIX, START_RETRY_PREFIX, startWithRetry, voiceOverDiagnostics, voiceOverRunning };

/**
 * The start of each retry's log line. scripts/sr-classify.mjs counts these and reads them as no finding.
 *
 * VoiceOver's start, which the fixtures make for each test (@guidepup/playwright's voiceOverTest, on the
 * singleton Guidepup exports). A start that fails with "VoiceOver cannot be started" on macOS 26 runners
 * (ourostack/ouro-ui#2141) is retried once: VoiceOver is stopped or killed, the system is given time to
 * settle, and the start runs again. Its error is logged, and its diagnostics too, so the lane's log says
 * what was running. The start, stop, kill, wait and log are injected, so scripts/sr-start-retry.test.mjs
 * runs it under node --test, without VoiceOver.
 */
const START_RETRY_PREFIX = "[sr] start retry:";

/** One line of the diagnostics a retry logs, under this prefix: no finding either. */
const START_DIAGNOSTICS_PREFIX = "[sr] start diagnostics:";

/** Guidepup's "VoiceOver cannot be started", and AppleScript's "Application isn't running" (-600), anywhere in the cause chain. */
const CANNOT_START = /VoiceOver cannot be started|Application isn.t running|\(-600\)/;

/** Bounds the cause chain: an error with a cause that loops back on itself stops here. */
const CHAIN_LIMIT = 10;

/** A VoiceOver still running after the failed start is polled for 10 s (20 polls, 500 ms apart), then killed. */
const GONE_POLLS = 20;
const POLL_MS = 500;

/** The system's settle before the second start: about 15 s. */
const SETTLE_MS = 15_000;

interface StartAttempts {
  /** Starts VoiceOver: the original start, with the options it was given. */
  start: () => Promise<void>;
  /** Stops VoiceOver. After a failed start Guidepup has nothing to stop, so its error is ignored. */
  stop: () => Promise<void>;
  /** Whether VoiceOver's process is still running. */
  running: () => Promise<boolean>;
  /** Kills VoiceOver's processes, ignoring errors. */
  kill: () => Promise<void>;
  /** Waits for `ms`. */
  wait: (ms: number) => Promise<void>;
  /** The diagnostics to log, one line each, taken before anything is stopped. */
  diagnose: () => Promise<string[]>;
  /** Writes one line of the lane's log. */
  log: (line: string) => void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const firstLine = (text: string): string => text.split("\n")[0] ?? "";

/** The error at the end of an error's cause chain (the error itself when it has no cause). */
function deepestCause(error: unknown): unknown {
  let deepest = error;
  for (let depth = 0; depth < CHAIN_LIMIT; depth++) {
    const cause = (deepest as { cause?: unknown } | null | undefined)?.cause;
    if (cause === undefined || cause === null) break;
    deepest = cause;
  }
  return deepest;
}

/** Whether the error, or any error in its cause chain, says VoiceOver could not be started or was not running. */
function cannotStart(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < CHAIN_LIMIT && current !== undefined && current !== null; depth++) {
    if (CANNOT_START.test(messageOf(current))) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Starts VoiceOver. A start that fails because VoiceOver could not be started is logged, its diagnostics
 * are logged, VoiceOver is stopped or killed, the system settles, and the start is tried once more. A
 * second failure is thrown as it was, and any other failure is thrown at once, never retried.
 */
async function startWithRetry(attempts: StartAttempts): Promise<void> {
  try {
    await attempts.start();
  } catch (error) {
    if (!cannotStart(error)) throw error;
    attempts.log(`${START_RETRY_PREFIX} VoiceOver could not be started (${firstLine(messageOf(deepestCause(error)))}); waiting for it to settle, then starting it again.`);
    for (const line of await attempts.diagnose().catch((): string[] => [])) attempts.log(`${START_DIAGNOSTICS_PREFIX} ${line}`);
    await attempts.stop().catch(() => undefined);
    let running = await attempts.running();
    for (let poll = 0; running && poll < GONE_POLLS; poll++) {
      await attempts.wait(POLL_MS);
      running = await attempts.running();
    }
    if (running) await attempts.kill().catch(() => undefined);
    await attempts.wait(SETTLE_MS);
    await attempts.start();
  }
}

const run = promisify(execFile);

/** Whether VoiceOver's process is running, by the pattern Guidepup itself looks for. */
const voiceOverRunning = (): Promise<boolean> => run("pgrep", ["-f", "VoiceOver launchd -s"]).then(() => true, () => false);

/** Kills VoiceOver's processes; a failure (none running, say) is no error here. */
const killVoiceOver = (): Promise<void> => run("killall", ["VoiceOver"], { timeout: 10_000 }).then(() => undefined, () => undefined);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Keeps each diagnostic line short: a process's command line or a crash report's line can be long. */
const bounded = (text: string): string => (text.length > 300 ? `${text.slice(0, 300)}…` : text);

/** The processes whose command line matches `pattern`, as `pgrep -fl` lists them (ten at most). */
async function processLines(pattern: string): Promise<string[]> {
  try {
    const { stdout } = await run("pgrep", ["-fl", pattern], { timeout: 5_000 });
    const found = stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "").slice(0, 10);
    return found.length > 0 ? found.map((line) => `pgrep -fl ${pattern}: ${bounded(line)}`) : [`pgrep -fl ${pattern}: none`];
  } catch (error) {
    // pgrep exits 1 when nothing matches; any other failure is said as it was.
    return (error as { code?: unknown }).code === 1 ? [`pgrep -fl ${pattern}: none`] : [`pgrep -fl ${pattern}: could not run (${firstLine(messageOf(error))})`];
  }
}

/** The newest VoiceOver crash report written in the last 10 minutes: its name and first lines. */
async function newestCrashReport(now: number): Promise<string[]> {
  const folder = join(homedir(), "Library/Logs/DiagnosticReports");
  try {
    const names = (await readdir(folder)).filter((name) => name.startsWith("VoiceOver"));
    const dated = await Promise.all(names.map(async (name) => ({ name, mtime: (await stat(join(folder, name))).mtimeMs })));
    const newest = dated.filter((report) => now - report.mtime <= 10 * 60_000).sort((a, b) => b.mtime - a.mtime)[0];
    if (!newest) return ["no VoiceOver crash report in the last 10 minutes"];
    const text = await readFile(join(folder, newest.name), "utf8");
    return [`crash report ${newest.name}:`, ...text.split("\n").slice(0, 15).map(bounded)];
  } catch (error) {
    return [`crash reports: could not be read (${firstLine(messageOf(error))})`];
  }
}

/** What was running when VoiceOver failed to start: its processes and the newest crash report. Never throws. */
async function voiceOverDiagnostics(now = Date.now()): Promise<string[]> {
  return [...(await processLines("VoiceOver")), ...(await processLines("ScreenReader")), ...(await newestCrashReport(now))];
}

const installed = new WeakSet<object>();

/**
 * Wraps `voiceOver.start` once. Guidepup's voiceOverTest fixture calls `start` on this same singleton at
 * call time, and navigation.ts's retry calls it too, so an own property on the instance reaches both.
 */
function installVoiceOverStartRetry<Options>(voiceOver: { start(options?: Options): Promise<void>; stop(): Promise<void> }, log: (line: string) => void = (line) => console.log(line)): void {
  if (installed.has(voiceOver)) return;
  installed.add(voiceOver);
  const original = voiceOver.start.bind(voiceOver);
  voiceOver.start = (options?: Options) =>
    startWithRetry({
      start: () => original(options),
      stop: () => voiceOver.stop(),
      running: voiceOverRunning,
      kill: killVoiceOver,
      wait: sleep,
      diagnose: () => voiceOverDiagnostics(),
      log,
    });
}
