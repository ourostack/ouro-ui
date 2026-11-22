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
// At the warn level and again at the fail level it also writes one line per browser page (#2149): whether the
// page's fonts are still loading, whether it is visible and focused, whether a frame arrives, and its path. A page
// that does not answer in 2 s says so, then reads the JavaScript it is stuck in through a DevTools session (#2149)
// when the page still pauses, or says why it cannot: Chromium pauses a loop only for a debugger enabled before the
// loop began, so a stall usually says the page did not pause either. Once a page does not answer, its browser's
// renderers get a CPU reading over a second, once per browser (#2149): a renderer near 1 s is spinning, one near 0 is
// hung. The fail exit waits for those lines for at most 8 s, and a page the reporter cannot read says why, so a hang
// names what it was doing.
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
 * a test awaits, so the line says so. When Node was held up, it also names whatever else was in flight at the
 * same time (`inFlight`, this test left out): a heavy neighbour sharing the same event loop is what a hold
 * usually waits on (issue #2469).
 */
export function slowTestText(
  entry: Pick<InFlight, "project" | "file" | "name">,
  runningMs: number,
  timeoutMs: number,
  heldMs: number,
  inFlight: readonly InFlight[] = [],
  now = Date.now(),
): string {
  const loop =
    heldMs >= HOLD_MS
      ? `Node's event loop was held up for ${spanOf(heldMs)} while it ran, so an answer from Node may have waited behind it.`
      : `Node's event loop was not held up for ${HOLD_MS} ms or more while it ran, so the wait is not in Node.`;
  const neighbours = heldMs >= HOLD_MS && inFlight.length > 0 ? ` Sharing the event loop: ${inFlight.map((other) => describeInFlight(other, now)).join("; ")}.` : "";
  return `[ouro-ui] Vitest: ${label(entry.project, entry.file)} > ${entry.name} has run for ${spanOf(runningMs)} of its ${threshold(timeoutMs)} timeout. ${loop}${neighbours} The reporter cannot see the browser command a test awaits; a timeout names it.`;
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

/** How long one page has to answer the diagnostic's read. A page that does not answer in time is the finding. */
const PAGE_DEADLINE_MS = 2_000;

/** How long a page that did not answer has to open a DevTools session, and then to pause, before its stack is given up. */
const STACK_DEADLINE_MS = 2_000;

/** How long each step of letting a session go may take. A hung renderer or browser never answers, so each step is bounded. */
const RELEASE_MS = 500;

/** The call frames a stuck page's stack names, top first; a deeper stack ends with `…`. */
const STACK_FRAMES = 8;

/** How long a browser's renderer CPU read may take, from its session to its second sample. */
const CPU_DEADLINE_MS = 4_000;

/** The span between the two renderer CPU samples. */
const CPU_SAMPLE_MS = 1_000;

/**
 * How long the whole page diagnostic may take before the stall gives up on it, so the fail exit is not held back for
 * long: a page's answer (2 s), then its stack (at most 5.5 s) and its browser's CPU (at most 4.5 s), in parallel.
 */
const DIAGNOSTIC_DEADLINE_MS = 8_000;

/** The part of a Playwright page the diagnostic uses: its URL, a function run inside it, and its browser context. */
export interface BrowserPage {
  url(): string;
  evaluate<R>(pageFunction: () => R | PromiseLike<R>): Promise<R>;
  /** Playwright's context: its DevTools session on the page, which the stack is read through, and its browser. Chromium only; other engines throw. */
  context?(): BrowserContextLike;
}

/** The part of Playwright's browser context the diagnostic uses. */
export interface BrowserContextLike {
  newCDPSession(page: BrowserPage): Promise<CdpSession>;
  browser?(): BrowserLike | null;
}

/** The part of Playwright's browser the diagnostic uses: its DevTools session on the whole browser (Chromium only), and its type. */
export interface BrowserLike {
  newBrowserCDPSession(): Promise<CdpSession>;
  browserType?(): { name(): string };
}

/** The part of a Chrome DevTools Protocol session the diagnostic uses. */
export interface CdpSession {
  send(method: string, params?: object): Promise<unknown>;
  on(event: string, listener: (params: unknown) => void): unknown;
  detach(): Promise<unknown>;
}

/** How the page reads are bounded: a page's answer, its stack, and its browser's renderer CPU (two samples, `cpuSampleMs` apart). */
export interface PageReadOptions {
  deadlineMs?: number;
  stackDeadlineMs?: number;
  cpuDeadlineMs?: number;
  cpuSampleMs?: number;
}

/** A page the diagnostic reads, or the reason a project has none to read (no browser, no provider pages, no page open). */
export type PageSource = { label: string; page: BrowserPage } | { label: string; note: string };

/** Finds the pages to read. The default reads each Vitest project's browser provider; the result may come late, or never. */
export type PageLookup = (vitest: Vitest | undefined) => PageSource[] | Promise<PageSource[]>;

/** What a page reports about itself, read inside it by `probePage`. */
export interface PageReading {
  fonts: "loaded" | "loading";
  /** The families of the faces still loading. */
  loading: string[];
  visible: boolean;
  focused: boolean;
  /** Whether one animation frame ran within a second. */
  frames: boolean;
}

/** One page's line: what it reported, that it did not answer (with the stack it was stuck in, or why none was read), or why it could not be read. */
export type PageState =
  | { kind: "note"; label: string; note: string }
  | { kind: "unanswered"; label: string; path: string; stack?: string[]; stackNote?: string }
  | ({ kind: "read"; label: string; path: string } & PageReading);

/** The top of the JavaScript stack a page is paused in, or the reason none was read. */
export type StackReading = { stack: string[] } | { stackNote: string };

/** One browser's renderer CPU over a sample window, read once for all its pages that did not answer, or why none was read. */
export type BrowserState =
  | { kind: "cpu"; name: string; windowMs: number; renderers: { pid: number; seconds: number }[] }
  | { kind: "cpuNote"; name: string; note: string };

/** The part of a debugger's paused event the stack read uses. */
interface CallFrame {
  functionName: string;
  url?: string;
  location: { scriptId: string; lineNumber: number; columnNumber: number };
}

/** A process as `SystemInfo.getProcessInfo` reports it: its type, its id (the OS process id) and its CPU time so far, in seconds. */
interface ProcessInfo {
  type: string;
  id: number;
  cpuTime: number;
}

/** Runs in the page. Its fonts still loading, its visibility and focus, and whether a frame arrives within a second. */
async function probePage(): Promise<PageReading> {
  const loading = Array.from(document.fonts)
    .filter((face) => face.status === "loading")
    .map((face) => face.family);
  const frames = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 1000);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
  return { fonts: document.fonts.status, loading, visible: document.visibilityState === "visible", focused: document.hasFocus(), frames };
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Marks a `within` whose promise had not settled when its time ran out. */
const TIMED_OUT = Symbol("timed out");

/** The promise's value, or TIMED_OUT when it has not settled after `ms`. A rejection is the promise's own. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** The URL's path, or a note when the page has no readable URL. */
const pathOf = (page: BrowserPage): string => {
  try {
    return new URL(page.url()).pathname;
  } catch {
    return "no readable URL";
  }
};

/** A page's state as one line of the diagnostic: fonts, visibility, focus, frames and path, or why it has no reading. */
export function pageStateText(state: PageState): string {
  const head = `[ouro-ui] Vitest page ${state.label}:`;
  if (state.kind === "note") return `${head} ${state.note}`;
  if (state.kind === "unanswered") return `${head} did not answer in ${threshold(PAGE_DEADLINE_MS)}, ${state.path}`;
  const fonts = state.fonts === "loaded" ? "fonts loaded" : state.loading.length > 0 ? `fonts loading (${state.loading.join(", ")})` : "fonts loading";
  const visibility = state.visible ? "visible" : "hidden";
  const focus = state.focused ? "focused" : "not focused";
  const frames = state.frames ? "frames arrive" : "no frame in 1 s";
  return `${head} ${fonts}, ${visibility}, ${focus}, ${frames}, ${state.path}`;
}

/** The line under a page that did not answer: the stack it was stuck in, or why none was read. */
export function stackText(state: Extract<PageState, { kind: "unanswered" }>): string {
  const head = `[ouro-ui] Vitest page ${state.label}:`;
  return state.stack ? `${head} stuck in: ${state.stack.join(" < ")}` : `${head} ${state.stackNote ?? "no stack read."}`;
}

/** A script's URL as the stack names it: its path, without the origin or the query. */
const scriptPath = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return url || "(no script URL)";
  }
};

/** A call frame as the stack names it: `fn (path:line:col)`, its script's URL looked up by the frame's script id, else the frame's own. */
const frameText = ({ functionName, url, location }: CallFrame, scripts: ReadonlyMap<string, string>): string => {
  const { scriptId, lineNumber, columnNumber } = location;
  return `${functionName || "(anonymous)"} (${scriptPath(scripts.get(scriptId) || url || "")}:${lineNumber + 1}:${columnNumber + 1})`;
};

/** One step of letting a session go: tolerated, and bounded, since a hung renderer or browser never answers. */
const tidy = (action: () => Promise<unknown>) => within(Promise.resolve().then(action).catch(() => undefined), RELEASE_MS);

/** Lets a paused page go: resumes it, turns its debugger off and detaches. */
async function release(session: CdpSession): Promise<void> {
  await tidy(() => session.send("Debugger.resume"));
  await tidy(() => session.send("Debugger.disable"));
  await tidy(() => session.detach());
}

/** A session that opens within `ms`, or TIMED_OUT; one that opens later is detached, so it is not left open. */
async function openWithin(opening: Promise<CdpSession>, ms: number): Promise<CdpSession | typeof TIMED_OUT> {
  const opened = await within(opening, ms);
  if (opened === TIMED_OUT) void opening.then((late) => late.detach()).catch(() => undefined);
  return opened;
}

/**
 * The top call frames of the JavaScript a page that did not answer is stuck in, through a Chrome DevTools session.
 * A page with no session (Playwright's WebKit and Firefox throw on one), a session that does not open in time, and a
 * page that does not pause in time (a hung renderer, or a loop begun before the debugger was on) each say so instead.
 * The page is always let go.
 */
export async function readStack(page: BrowserPage, deadlineMs = STACK_DEADLINE_MS): Promise<StackReading> {
  let session: CdpSession;
  try {
    const context = page.context?.();
    if (!context) return { stackNote: "no stack read: the page has no Chrome DevTools session." };
    const opened = await openWithin(context.newCDPSession(page), deadlineMs);
    if (opened === TIMED_OUT) return { stackNote: `no stack read: no Chrome DevTools session in ${threshold(deadlineMs)}.` };
    session = opened;
  } catch (error) {
    return { stackNote: `no stack read: no Chrome DevTools session (${messageOf(error)}).` };
  }
  const scripts = new Map<string, string>();
  try {
    const paused = new Promise<{ callFrames: CallFrame[] }>((resolve) => {
      session.on("Debugger.scriptParsed", (event) => {
        const { scriptId, url } = event as { scriptId: string; url: string };
        scripts.set(scriptId, url);
      });
      session.on("Debugger.paused", (event) => resolve(event as { callFrames: CallFrame[] }));
    });
    const outcome = await within(
      (async () => {
        await session.send("Debugger.enable");
        await session.send("Debugger.pause");
        return paused;
      })(),
      deadlineMs,
    );
    if (outcome === TIMED_OUT) {
      return { stackNote: `the page did not pause in ${threshold(deadlineMs)} either, so it is hung, or looping since before the debugger was on (Chromium pauses a loop only for a debugger enabled before it began).` };
    }
    const frames = outcome.callFrames.slice(0, STACK_FRAMES).map((frame) => frameText(frame, scripts));
    if (frames.length === 0) return { stackNote: "no stack read: the page paused with no call frames." };
    return { stack: outcome.callFrames.length > STACK_FRAMES ? [...frames, "…"] : frames };
  } catch (error) {
    return { stackNote: `no stack read: ${messageOf(error)}.` };
  } finally {
    await release(session);
  }
}

/** The browser a page belongs to, when its context has one. A page without one has no renderer CPU to read. */
function browserOf(page: BrowserPage): BrowserLike | undefined {
  try {
    return page.context?.()?.browser?.() ?? undefined;
  } catch {
    return undefined;
  }
}

/** The renderer processes among a browser's processes, as its browser-level session reports them. */
async function sampleRenderers(session: CdpSession): Promise<ProcessInfo[]> {
  const { processInfo } = (await session.send("SystemInfo.getProcessInfo")) as { processInfo: ProcessInfo[] };
  return processInfo.filter((process) => process.type === "renderer");
}

/**
 * Each renderer process's CPU time over `cpuSampleMs`, from two `SystemInfo.getProcessInfo` samples on a browser-level
 * DevTools session. A browser without that session (Playwright's WebKit and Firefox throw on one) says so instead.
 * The session is always detached.
 */
async function readBrowserCpu(name: string, browser: BrowserLike | undefined, { cpuDeadlineMs, cpuSampleMs }: { cpuDeadlineMs: number; cpuSampleMs: number }): Promise<BrowserState> {
  if (!browser) return { kind: "cpuNote", name, note: "the page has no browser to read its renderer CPU from." };
  const end = Date.now() + cpuDeadlineMs;
  const left = () => Math.max(0, end - Date.now());
  let session: CdpSession;
  try {
    const opened = await openWithin(browser.newBrowserCDPSession(), cpuDeadlineMs);
    if (opened === TIMED_OUT) return { kind: "cpuNote", name, note: `no Chrome DevTools session in ${threshold(cpuDeadlineMs)}.` };
    session = opened;
  } catch (error) {
    return { kind: "cpuNote", name, note: `no Chrome DevTools session (${messageOf(error)}).` };
  }
  try {
    const first = await within(sampleRenderers(session), left());
    if (first === TIMED_OUT) return { kind: "cpuNote", name, note: `the browser did not report its processes in ${threshold(cpuDeadlineMs)}.` };
    const started = performance.now();
    await new Promise((resolve) => setTimeout(resolve, cpuSampleMs));
    const second = await within(sampleRenderers(session), left());
    if (second === TIMED_OUT) return { kind: "cpuNote", name, note: `the browser did not report its processes in ${threshold(cpuDeadlineMs)}.` };
    const before = new Map(first.map((process) => [process.id, process.cpuTime]));
    return {
      kind: "cpu",
      name,
      windowMs: performance.now() - started,
      renderers: second.map((process) => ({ pid: process.id, seconds: Math.max(0, process.cpuTime - (before.get(process.id) ?? 0)) })),
    };
  } catch (error) {
    return { kind: "cpuNote", name, note: `${messageOf(error)}.` };
  } finally {
    await tidy(() => session.detach());
  }
}

/** A browser's renderer CPU as one line of the diagnostic: each renderer's CPU time over the window, or why none was read. */
export function browserStateText(state: BrowserState): string {
  const head = `[ouro-ui] Vitest browser ${state.name}:`;
  if (state.kind === "cpuNote") return `${head} renderer CPU not read: ${state.note}`;
  const span = `${Math.round(state.windowMs / 100) / 10} s`;
  if (state.renderers.length === 0) return `${head} renderer CPU in ${span}: no renderer process.`;
  return `${head} renderer CPU in ${span}: ${state.renderers.map(({ pid, seconds }) => `pid ${pid} ${seconds.toFixed(2)} s`).join(", ")}`;
}

/**
 * One source's state. Each page is read against its own deadline, and a page that cannot be read says why. A page
 * that does not answer also reads its browser's renderer CPU, started once for each browser (`browsers`).
 */
async function readPageState(source: PageSource, options: Required<PageReadOptions>, browsers: Map<unknown, Promise<BrowserState>>): Promise<PageState> {
  if (!("page" in source)) return { kind: "note", label: source.label, note: source.note };
  const { label, page } = source;
  try {
    const path = pathOf(page);
    const reading = await within(page.evaluate(probePage), options.deadlineMs);
    if (reading === TIMED_OUT) {
      const browser = browserOf(page);
      const key = browser ?? page;
      if (!browsers.has(key)) browsers.set(key, readBrowserCpu(browser?.browserType?.().name() ?? label, browser, options));
      return { kind: "unanswered", label, path, ...(await readStack(page, options.stackDeadlineMs)) };
    }
    return { kind: "read", label, path, ...reading };
  } catch (error) {
    return { kind: "note", label, note: `could not be read: ${messageOf(error)}` };
  }
}

/**
 * Each source's state, all read at once so the slowest page sets the wait, then one renderer CPU state for each browser
 * that had a page not answer. The options bound each read; the defaults are the diagnostic's own.
 */
export async function readPageStates(sources: readonly PageSource[], options: PageReadOptions = {}): Promise<(PageState | BrowserState)[]> {
  const resolved: Required<PageReadOptions> = {
    deadlineMs: PAGE_DEADLINE_MS,
    stackDeadlineMs: STACK_DEADLINE_MS,
    cpuDeadlineMs: CPU_DEADLINE_MS,
    cpuSampleMs: CPU_SAMPLE_MS,
    ...options,
  };
  const browsers = new Map<unknown, Promise<BrowserState>>();
  const pages = await Promise.all(sources.map((source) => readPageState(source, resolved, browsers)));
  return [...pages, ...(await Promise.all(browsers.values()))];
}

/**
 * The browser pages of each Vitest project, from its browser provider (Vitest's Playwright provider keeps them in
 * `pages`). A project with no browser, a provider with no `pages` map, or no page open yet says so, in its line.
 */
export function browserPageSources(vitest: Vitest | undefined): PageSource[] {
  const sources: PageSource[] = [];
  for (const project of vitest?.projects ?? []) {
    const name = project.name || "unnamed project";
    const provider = project.browser?.provider;
    if (!provider) {
      sources.push({ label: name, note: "has no browser, so it has no page to read." });
      continue;
    }
    const pages = (provider as { pages?: unknown }).pages;
    if (!(pages instanceof Map)) {
      sources.push({ label: name, note: "its browser provider keeps no pages, so there is no page to read." });
      continue;
    }
    if (pages.size === 0) sources.push({ label: name, note: "has no page open yet, so there is no page to read." });
    for (const [sessionId, page] of pages) sources.push({ label: pages.size > 1 ? `${name} ${sessionId}` : name, page: page as BrowserPage });
  }
  return sources;
}

const envMs = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
};

/** The options the reporter takes; each one defaults to the real behaviour, and the tests inject the rest. */
export interface StallReporterOptions {
  warnAfter?: number;
  failAfter?: number;
  intervalMs?: number;
  /** Finds the pages the page diagnostic reads. */
  pages?: PageLookup;
  /** Ends the process at the fail level, after the page lines. */
  exit?: (code: number) => void;
  /** How long the page diagnostic may take before the stall gives up on it. */
  diagnosticMs?: number;
}

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
  readonly #pages: PageLookup;
  readonly #exit: (code: number) => void;
  readonly #diagnosticMs: number;
  readonly #modules = new Map<string, ModuleEntry>();
  readonly #cases = new Map<string, { moduleKey: string; entry: InFlight; timeout: number; due: boolean; named: boolean }>();
  readonly #pending = new Map<string, { project: string; file: string }>();
  readonly #holds: { endedAt: number; ms: number }[] = [];
  #finished = 0;
  #total = 0;
  #root = process.cwd();
  #vitest: Vitest | undefined;
  #lastFinish = Date.now();
  #warned = false;
  #pagesWarned = false;
  #failing = false;
  #timer: ReturnType<typeof setInterval> | undefined;
  #ticker: ReturnType<typeof setInterval> | undefined;
  #tickedAt = Date.now();

  constructor({
    warnAfter = envMs("OURO_VITEST_STALL_WARN_MS", 120_000),
    failAfter = envMs("OURO_VITEST_STALL_FAIL_MS", 300_000),
    intervalMs = 1_000,
    pages = browserPageSources,
    exit = (code: number) => process.exit(code),
    diagnosticMs = DIAGNOSTIC_DEADLINE_MS,
  }: StallReporterOptions = {}) {
    this.#options = { warnAfter, failAfter };
    this.#intervalMs = intervalMs;
    this.#pages = pages;
    this.#exit = exit;
    this.#diagnosticMs = diagnosticMs;
  }

  onInit(vitest: Vitest): void {
    this.#root = vitest.config.root;
    this.#vitest = vitest;
  }

  onTestRunStart(specifications: ReadonlyArray<TestSpecification>): void {
    this.#lastFinish = Date.now();
    this.#pagesWarned = false;
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
      const neighbours = this.#inFlight().filter((other) => other !== kase.entry);
      process.stderr.write(`${slowTestText(kase.entry, now - kase.entry.startedAt, kase.timeout, this.#heldSince(kase.entry.startedAt), neighbours, now)}\n`);
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
      if (!this.#pagesWarned) {
        this.#pagesWarned = true;
        void this.#writePages();
      }
    }
    if (report.level === "fail" && !this.#failing) {
      this.#failing = true;
      process.stderr.write(`${report.text}\n`);
      void this.#writePages().then(() => this.#exit(1));
    }
  }

  /**
   * Writes one line per browser page, read once the lookup has answered. Never throws: a lookup or read that
   * does not finish within the diagnostic deadline, or fails, says so in a line instead.
   */
  async #writePages(): Promise<void> {
    try {
      const states = await within(this.#readPages(), this.#diagnosticMs);
      if (states === TIMED_OUT) {
        process.stderr.write(`[ouro-ui] Vitest page state: the page lookup or a page read did not finish in ${threshold(this.#diagnosticMs)}.\n`);
        return;
      }
      for (const state of states) {
        if (state.kind === "cpu" || state.kind === "cpuNote") {
          process.stderr.write(`${browserStateText(state)}\n`);
          continue;
        }
        process.stderr.write(`${pageStateText(state)}\n`);
        if (state.kind === "unanswered") process.stderr.write(`${stackText(state)}\n`);
      }
    } catch (error) {
      process.stderr.write(`[ouro-ui] Vitest page lookup failed: ${messageOf(error)}.\n`);
    }
  }

  async #readPages(): Promise<(PageState | BrowserState)[]> {
    return readPageStates(await this.#pages(this.#vitest));
  }
}

