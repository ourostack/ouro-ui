import { voiceOverTest, type NVDAPlaywright, type VoiceOverPlaywright } from "@guidepup/playwright";
import { test as base, expect, type BrowserContext, type BrowserContextOptions, type Page, type PlaywrightTestArgs, type PlaywrightTestOptions, type PlaywrightWorkerArgs, type PlaywrightWorkerOptions, type TestType } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { nvdaFor, startNVDA, stopNVDA } from "./nvda";
import { firstMatch, MARK, missedPhrase, readRecords, RECORD_END, RECORD_START, readyForAction, saysValue as valueSaid, speechVerdict, spokenAfter, WATCH_LIMIT_SECONDS, type WatchEnd } from "./phrases";

// The screen-reader lane's fixtures (playwright.screen-reader.config.ts): VoiceOver on macOS and
// NVDA on Windows, through Guidepup. VoiceOver starts for each test; NVDA once for each worker
// (nvda.ts). `page` opens the spec's story and waits for its component
// before the screen reader starts, and `sr` is the running screen reader, at the start of the web
// content. Lines starting `[sr]` are what scripts/sr-classify.mjs reads: `[sr] first utterance:`
// shows the screen reader spoke, `[sr] no utterance matched` is an accessibility failure and
// `[sr] infrastructure:` is the runner's; `[sr] teardown:` notes what went wrong after a test, and
// never decides the class.

/** A running screen reader: VoiceOver or NVDA. */
export type ScreenReader = VoiceOverPlaywright | NVDAPlaywright;

interface Fixtures {
  /** The story the spec opens (`stories.ts`). */
  storyId: string;
  sr: ScreenReader;
}

type ScreenReaderTest = TestType<PlaywrightTestArgs & PlaywrightTestOptions & Fixtures, PlaywrightWorkerArgs & PlaywrightWorkerOptions>;

/**
 * Opens a story on its own and waits for a component root (`[data-ouro]`) to be visible: the first
 * that is, since a component can render an empty root until it has something to show (Celebrate).
 */
async function openStory(page: Page, id: string): Promise<void> {
  try {
    await page.goto(`iframe.html?id=${id}&viewMode=story`);
  } catch (error) {
    throw new Error(`[sr] infrastructure: Storybook did not answer for ${id}: ${(error as Error).message}`, { cause: error });
  }
  await expect(page.locator("#storybook-root [data-ouro]").filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
}

/** The spec's story is open before the screen reader starts: both screen readers' fixtures need `page`. */
const page = async ({ page, storyId }: { page: Page; storyId: string }, provide: (page: Page) => Promise<void>) => {
  await openStory(page, storyId);
  await provide(page);
};

const run = promisify(execFile);

/** Logs what went wrong after a test: `[sr] teardown:` never decides the lane's class. */
const note = (what: string, error: unknown) => console.log(`[sr] teardown: ${what}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);

/**
 * Closes the test's browser context here, so a failure to close is logged rather than failing a
 * test that passed, and Playwright's own teardown finds nothing left to do.
 */
const closeContext = (page: Page) =>
  page
    .context()
    .close()
    .catch((error: unknown) => note("the browser context did not close", error));

/** Stops VoiceOver, giving up after 30 s, then closes the context: VoiceOver starts afresh for each test. */
async function finishVoiceOver(voiceOver: VoiceOverPlaywright, page: Page): Promise<void> {
  const stopped = await Promise.race([voiceOver.stop().then(() => true, (error: unknown) => (note("VoiceOver did not stop", error), true)), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 30_000))]);
  if (!stopped) note("VoiceOver did not stop", "voiceOver.stop() did not return within 30 s");
  await closeContext(page);
}

/**
 * VoiceOver's tests each get a WebKit of their own, launched as Playwright's would be and closed
 * after the test, once VoiceOver has stopped: a test's page must not shape what VoiceOver says on
 * the next. VoiceOver said the Dialog's name as it opened in every run while Checkbox's test ran
 * before it (13 of 13), and missed it in 4 of 8 once Checklist's did, in the same browser
 * ("Shakshuka", then the text field's hint).
 */
const ownBrowserContext = async (
  { playwright, browserName, launchOptions, headless, baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch }: PlaywrightTestArgs & PlaywrightTestOptions & PlaywrightWorkerArgs & PlaywrightWorkerOptions,
  provide: (context: BrowserContext) => Promise<void>,
) => {
  const browser = await playwright[browserName].launch({ ...launchOptions, headless });
  const options = Object.fromEntries(Object.entries({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch }).filter(([, value]) => value !== undefined));
  const context = await browser.newContext(options as BrowserContextOptions);
  await provide(context);
  await context.close().catch(() => undefined);
  await browser.close().catch((error: unknown) => note("the browser did not close", error));
};

/** The worker's NVDA (nvda.ts): it starts after the shared browser and quits before it closes. */
interface NVDAWorker {
  nvdaWorker: void;
}

/** The test each spec uses: VoiceOver's on macOS, NVDA's on Windows. */
export const test: ScreenReaderTest =
  process.platform === "darwin"
    ? voiceOverTest.extend<Fixtures>({
        storyId: ["", { option: true }],
        context: ownBrowserContext,
        page,
        sr: async ({ voiceOver, page }, provide) => {
          await provide(voiceOver);
          await finishVoiceOver(voiceOver, page);
        },
      })
    : base.extend<Fixtures, NVDAWorker>({
        nvdaWorker: [
          async ({ browser }, provide) => {
            void browser;
            await startNVDA();
            await provide();
            for (const problem of await stopNVDA()) note("at the end of the worker", problem);
          },
          { scope: "worker", timeout: 120_000 },
        ],
        storyId: ["", { option: true }],
        page,
        sr: async ({ nvdaWorker, page }, provide) => {
          void nvdaWorker;
          await provide(nvdaFor(page));
          await closeContext(page);
        },
      });

/**
 * Moves the screen reader into the page and logs the first thing it says. Getting there can move
 * the focus (NVDA tabs to the first control), so the focus goes back to the page: each spec's
 * first move then announces its control.
 */
export async function startReading(sr: ScreenReader, page: Page): Promise<void> {
  await sr.navigateToWebContent();
  console.log(`[sr] first utterance: "${await sr.lastSpokenPhrase()}"`);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** The phrases VoiceOver says while it is watched: see `watchVoiceOver`. */
interface VoiceOverWatch {
  /** Every phrase VoiceOver moved to since the watch began (phrases.ts, `spokenAfter`). */
  phrases(): string[];
  /** Resolves when VoiceOver says something new, the watch ends, or `deadline` passes. */
  next(deadline: number): Promise<void>;
  /** How the watcher ended, or null while it runs. */
  ended(): WatchEnd | null;
  stop(): Promise<void>;
}

/**
 * Watches VoiceOver's last phrase, the only speech it lets AppleScript read, every 20 ms from one
 * osascript process (as Guidepup runs its own), until `stop()` ends it: its own limit,
 * WATCH_LIMIT_SECONDS, is longer than a whole test, so no check outlives it. It resolves once
 * VoiceOver is ready for the action (phrases.ts, `readyForAction`): quiet, then MARK as its last
 * phrase. What VoiceOver says after that is new, even the same words it said before. Guidepup's `capture` reads the last phrase again only after waiting
 * as long as it takes to say, so after a long hint it missed the short phrase that named the
 * focused control and read the next hint instead.
 */
async function watchVoiceOver(): Promise<VoiceOverWatch> {
  const script = `set endAt to (current date) + ${WATCH_LIMIT_SECONDS}
set previousText to missing value
repeat while (current date) < endAt
  set spokenText to ""
  if application "VoiceOver" is running then
    try
      tell application "VoiceOver" to set spokenText to content of last phrase
    end try
  end if
  if spokenText is missing value then set spokenText to ""
  considering case
    set changed to (previousText is missing value) or (spokenText is not previousText)
  end considering
  if changed then
    log "${RECORD_START}" & spokenText & "${RECORD_END}"
    set previousText to spokenText
  end if
  delay 0.02
end repeat`;
  const child = spawn("/usr/bin/osascript", [], { stdio: ["pipe", "ignore", "pipe"] });
  const records: string[] = [];
  const stamps: number[] = [];
  let buffer = "";
  let errors = "";
  let ended: WatchEnd | null = null;
  let wake = () => {};
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    const { records: read, rest } = readRecords(buffer + chunk);
    if (read.length === 0 && !(buffer + chunk).includes(RECORD_START)) errors += chunk;
    records.push(...read);
    stamps.push(...read.map(() => Date.now()));
    buffer = rest;
    wake();
  });
  const exited = new Promise<void>((resolve) =>
    child.on("close", (code) => {
      ended = { code, detail: `osascript ended (exit ${code})${errors.trim() ? `: ${errors.trim()}` : ""}` };
      wake();
      resolve();
    }),
  );
  child.on("error", (error) => {
    ended = { code: null, detail: `osascript did not run: ${error.message}` };
    wake();
  });
  child.stdin.end(script);
  const next = (deadline: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  const watch: VoiceOverWatch = {
    phrases: () => spokenAfter(records),
    next,
    ended: () => ended,
    stop: async () => {
      if (ended === null) child.kill();
      await exited;
    },
  };
  const why = await readyForAction({ records, stamps, now: Date.now, ended: () => ended, next }, async () => {
    await run("/usr/bin/osascript", ["-e", `tell application "VoiceOver" to output "${MARK}"`]);
  });
  if (why === null) return watch;
  // Why, before stopping the watcher: stopping it ends osascript, which says nothing about why.
  const read = records.map((record) => `"${record.trim()}"`).join(" | ") || "nothing";
  await watch.stop();
  throw new Error(`[sr] infrastructure: VoiceOver's speech could not be read: ${why}; read: ${read}`);
}

/**
 * Performs `action` (with Playwright) and waits up to `timeout` for the screen reader to say one
 * phrase `matches` accepts (build it with `inOneSentence`, phrases.ts), failing with every phrase it
 * heard. Phrases are never joined, and the item text under the cursor never counts: only speech.
 * VoiceOver's phrases come from `watchVoiceOver`, which reads each one as it is said; NVDA's from
 * Guidepup's capture, which logs every phrase NVDA speaks.
 */
export async function heard(sr: ScreenReader, action: () => Promise<unknown>, matches: (phrase: string) => boolean, what: string, timeout = 15_000): Promise<string> {
  if (isVoiceOver(sr)) return heardFromVoiceOver(action, matches, what, timeout);
  const phrases: string[] = [];
  const add = (phrase: string) => {
    const text = phrase.trim();
    if (text && !phrases.includes(text)) phrases.push(text);
  };
  add((await sr.capture(action, { capture: true })).spokenPhrase);
  const deadline = Date.now() + timeout;
  for (;;) {
    const found = firstMatch(phrases, matches);
    if (found !== undefined) {
      console.log(`[sr] heard ${what}: "${found}"`);
      return found;
    }
    if (Date.now() > deadline) throw new Error(`[sr] no utterance matched ${what}; heard: ${phrases.map((phrase) => `"${phrase}"`).join(" | ") || "nothing"}`);
    // Speech that comes after the action (a live region) is read by capturing again.
    add((await sr.capture(async () => undefined, { capture: true })).spokenPhrase);
  }
}

/**
 * `heard`, except that on VoiceOver a phrase that never came is not yet a failure: VoiceOver is then
 * asked to describe what the step changed, and that description must pass `described`, one phrase
 * under the same strict rule; the miss is logged as `[sr] finding:` with `finding`, the issue that
 * tracks it. `from: "focus"` describes the focused element (`describesFocus`); `from: "container"`
 * describes the element around it (`describesContainer`). Only for a step VoiceOver is known to
 * skip at times: the Checklist toggle (ourostack/ouro-ui#118) and the Dialog's opening
 * (ourostack/ouro-ui#119). On NVDA it is `heard`.
 */
export async function heardOrDescribed(
  sr: ScreenReader,
  action: () => Promise<unknown>,
  matches: (phrase: string) => boolean,
  described: (phrase: string) => boolean,
  what: string,
  { finding, from = "focus" }: { finding: string; from?: "focus" | "container" },
): Promise<string> {
  if (!isVoiceOver(sr)) return heard(sr, action, matches, what);
  try {
    return await heard(sr, action, matches, what);
  } catch (error) {
    if (!(error instanceof Error) || !missedPhrase(error.message)) throw error;
    const description = from === "container" ? await describesContainer(sr, described, `${what}, described`) : await describesFocus(sr, described, `${what}, described`);
    const spoke = error.message.slice(error.message.indexOf("; heard: ") + "; heard: ".length);
    console.log(`[sr] finding: ${finding}: VoiceOver did not announce ${what} (it said: ${spoke}); described, the ${from === "container" ? "focus's container" : "focus"} is "${description}"`);
    return description;
  }
}

/**
 * Asks VoiceOver to describe the element around the focus, until it says something `matches`
 * accepts: it stops interacting with the focused element once (VO-Shift-Up, as the field's own hint
 * says, "To exit this group"), which moves the VoiceOver cursor, not the keyboard focus, up to the
 * container and names it, then describes the item in the VoiceOver cursor (VO-F3) up to three times.
 * Describing the focused field (VO-F4) names only the field. One step up, never more: a second
 * would leave the container.
 */
export async function describesContainer(sr: VoiceOverPlaywright, matches: (phrase: string) => boolean, what: string, attempts = 3): Promise<string> {
  const phrases: string[] = [];
  const add = (phrase: string) => {
    const text = phrase.trim();
    if (text && !phrases.includes(text)) phrases.push(text);
  };
  await sr.stopInteracting({ capture: true });
  add(await sr.lastSpokenPhrase());
  for (let attempt = 0; attempt < attempts && firstMatch(phrases, matches) === undefined; attempt++) {
    await sr.perform(sr.keyboardCommands.describeItem, { capture: true });
    add(await sr.lastSpokenPhrase());
  }
  const found = firstMatch(phrases, matches);
  if (found === undefined) throw new Error(`[sr] no utterance matched ${what}; heard: ${phrases.map((phrase) => `"${phrase}"`).join(" | ") || "nothing"}`);
  console.log(`[sr] heard ${what}: "${found}"`);
  return found;
}

/** `heard`, on VoiceOver: polls nothing itself, but wakes each time the watch reads a new phrase. */
async function heardFromVoiceOver(action: () => Promise<unknown>, matches: (phrase: string) => boolean, what: string, timeout: number): Promise<string> {
  const watch = await watchVoiceOver();
  try {
    await action();
    const deadline = Date.now() + timeout;
    for (;;) {
      const verdict = speechVerdict(watch.phrases(), matches, what, { now: Date.now(), deadline, ended: watch.ended() });
      if (verdict === "wait") await watch.next(deadline);
      else if ("fail" in verdict) throw new Error(verdict.fail);
      else {
        console.log(`[sr] heard ${what}: "${verdict.found}" (VoiceOver said: ${verdict.heard})`);
        return verdict.found;
      }
    }
  } finally {
    await watch.stop();
  }
}

/** Performs `action` and logs what the screen reader said, without asserting it. */
export async function said(sr: ScreenReader, action: () => Promise<unknown>, what: string): Promise<string> {
  const { spokenPhrase } = await sr.capture(action, { capture: true });
  console.log(`[sr] said ${what}: "${spokenPhrase}"`);
  return spokenPhrase;
}

/** VoiceOver on macOS; NVDA elsewhere (the fixture picks the same way). */
const isVoiceOver = (reader: ScreenReader): reader is VoiceOverPlaywright => reader !== null && process.platform === "darwin";

/**
 * Asks the screen reader to describe the control with the keyboard focus, as a person checks a
 * value (VoiceOver's VO-F4, NVDA's NVDA+Tab), until it says something `matches` accepts.
 */
export async function describesFocus(sr: ScreenReader, matches: (phrase: string) => boolean, what: string, attempts = 3): Promise<string> {
  const phrases: string[] = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (isVoiceOver(sr)) await sr.perform(sr.keyboardCommands.describeItemWithKeyboardFocus, { capture: true });
    else await sr.perform(sr.keyboardCommands.reportCurrentFocus, { capture: true });
    const phrase = (await sr.lastSpokenPhrase()).trim();
    if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
    const found = firstMatch(phrases, matches);
    if (found !== undefined) {
      console.log(`[sr] heard ${what}: "${found}"`);
      return found;
    }
  }
  throw new Error(`[sr] no utterance matched ${what}; heard: ${phrases.map((phrase) => `"${phrase}"`).join(" | ") || "nothing"}`);
}

/** Whether `sentence` gives the combo box's value, as this screen reader says it (phrases.ts, ourostack/ouro-ui#113). */
export function saysValue(sr: ScreenReader, sentence: string, value: string, label: string): boolean {
  const said = valueSaid(sentence, value, label, isVoiceOver(sr));
  if (said && !new RegExp(`\\b${value}\\b`, "i").test(sentence)) console.log(`[sr] finding (ourostack/ouro-ui#113): VoiceOver read the value "${value}" as "${value.slice(0, -3)}"`);
  return said;
}

/** A locator's accessible name, from its ARIA snapshot (`- checkbox "Rolled oats"`). */
export async function accessibleName(locator: import("@playwright/test").Locator): Promise<string> {
  const name = /^- \w+ "([^"]*)"/.exec(await locator.ariaSnapshot())?.[1];
  if (!name) throw new Error(`no accessible name in ${await locator.ariaSnapshot()}`);
  return name;
}
