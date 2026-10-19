import { nvdaTest, voiceOverTest, type NVDAPlaywright, type VoiceOverPlaywright } from "@guidepup/playwright";
import { expect, type Page, type PlaywrightTestArgs, type PlaywrightTestOptions, type PlaywrightWorkerArgs, type PlaywrightWorkerOptions, type TestType } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { firstMatch, MARK, readRecords, RECORD_END, RECORD_START, saysValue as valueSaid, spokenAfter } from "./phrases";

// The screen-reader lane's fixtures (playwright.screen-reader.config.ts): VoiceOver on macOS and
// NVDA on Windows, through Guidepup. `page` opens the spec's story and waits for its component
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

/** Opens a story on its own and waits for its component root (`[data-ouro]`) to be visible. */
async function openStory(page: Page, id: string): Promise<void> {
  try {
    await page.goto(`iframe.html?id=${id}&viewMode=story`);
  } catch (error) {
    throw new Error(`[sr] infrastructure: Storybook did not answer for ${id}: ${(error as Error).message}`, { cause: error });
  }
  await expect(page.locator("#storybook-root [data-ouro]").first()).toBeVisible({ timeout: 30_000 });
}

/** The spec's story is open before the screen reader starts: both screen readers' fixtures need `page`. */
const page = async ({ page, storyId }: { page: Page; storyId: string }, provide: (page: Page) => Promise<void>) => {
  await openStory(page, storyId);
  await provide(page);
};

const run = promisify(execFile);

/** Whether NVDA's process is still running: Guidepup's `nvda.stop()` asks it to quit and returns at once. */
async function nvdaRunning(): Promise<boolean> {
  const { stdout } = await run("tasklist", ["/FI", "IMAGENAME eq nvda.exe", "/NH"]);
  return /\bnvda\.exe\b/i.test(stdout);
}

/**
 * Ends a test in an order that cannot fail one that passed. The screen reader stops first; on
 * Windows the test waits (up to 30 s) until NVDA's process has gone, because NVDA quits after
 * `nvda.stop()` returns and unloads its helper from the browser as it goes, and a browser context
 * closed in the meantime failed to close ("browserContext.close: Test ended.", recorded on main).
 * Then the context closes here, so a failure to close is logged rather than failing the test, and
 * Guidepup's and Playwright's own teardown find nothing left to do.
 */
async function finish(sr: ScreenReader, page: Page): Promise<void> {
  const note = (what: string, error: unknown) => console.log(`[sr] teardown: ${what}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  await sr.stop().catch((error: unknown) => note("the screen reader did not stop", error));
  if (process.platform === "win32") {
    const deadline = Date.now() + 30_000;
    while ((await nvdaRunning().catch(() => false)) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 250));
    if (await nvdaRunning().catch(() => false)) note("NVDA was still running after 30 s", "closing the browser context anyway");
  }
  await page
    .context()
    .close()
    .catch((error: unknown) => note("the browser context did not close", error));
}

/** The test each spec uses: VoiceOver's on macOS, NVDA's on Windows. */
export const test: ScreenReaderTest =
  process.platform === "darwin"
    ? voiceOverTest.extend<Fixtures>({
        storyId: ["", { option: true }],
        page,
        sr: async ({ voiceOver, page }, provide) => {
          await provide(voiceOver);
          await finish(voiceOver, page);
        },
      })
    : nvdaTest.extend<Fixtures>({
        storyId: ["", { option: true }],
        page,
        sr: async ({ nvda, page }, provide) => {
          await provide(nvda);
          await finish(nvda, page);
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
  /** Why the watch ended early, or null while it runs. */
  failure(): string | null;
  stop(): Promise<void>;
}

/**
 * Watches VoiceOver's last phrase, the only speech it lets AppleScript read, every 50 ms for up to
 * `seconds`, from one osascript process (as Guidepup runs its own). It first has VoiceOver say
 * MARK, and resolves once MARK is its last phrase: what VoiceOver says after that is new, even the
 * same words it said before. Guidepup's `capture` reads the last phrase again only after waiting
 * as long as it takes to say, so after a long hint it missed the short phrase that named the
 * focused control and read the next hint instead.
 */
async function watchVoiceOver(seconds: number): Promise<VoiceOverWatch> {
  const script = `tell application "VoiceOver" to output "${MARK}"
set endAt to (current date) + ${seconds}
set previousText to missing value
repeat while (current date) < endAt
  set spokenText to ""
  try
    tell application "VoiceOver" to set spokenText to content of last phrase
  end try
  if spokenText is missing value then set spokenText to ""
  considering case
    set changed to (previousText is missing value) or (spokenText is not previousText)
  end considering
  if changed then
    log "${RECORD_START}" & spokenText & "${RECORD_END}"
    set previousText to spokenText
  end if
  delay 0.05
end repeat`;
  const child = spawn("/usr/bin/osascript", [], { stdio: ["pipe", "ignore", "pipe"] });
  const records: string[] = [];
  let buffer = "";
  let errors = "";
  let ended: string | null = null;
  let wake = () => {};
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    const { records: read, rest } = readRecords(buffer + chunk);
    if (read.length === 0 && !(buffer + chunk).includes(RECORD_START)) errors += chunk;
    records.push(...read);
    buffer = rest;
    wake();
  });
  const exited = new Promise<void>((resolve) =>
    child.on("close", (code) => {
      ended = `osascript ended (exit ${code})${errors.trim() ? `: ${errors.trim()}` : ""}`;
      wake();
      resolve();
    }),
  );
  child.on("error", (error) => {
    ended = `osascript did not run: ${error.message}`;
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
    next: (deadline) => (ended === null ? next(deadline) : Promise.resolve()),
    failure: () => ended,
    stop: async () => {
      if (ended === null) child.kill();
      await exited;
    },
  };
  const ready = Date.now() + 10_000;
  const marked = () => records.some((record) => record.trim() === MARK);
  while (!marked() && ended === null && Date.now() < ready) await watch.next(ready);
  if (!marked()) {
    await watch.stop();
    const read = records.map((record) => `"${record.trim()}"`).join(" | ") || "nothing";
    throw new Error(`[sr] infrastructure: VoiceOver's speech could not be read: ${ended ?? `"${MARK}" was not its last phrase within 10 s`}; read: ${read}`);
  }
  return watch;
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

/** `heard`, on VoiceOver: polls nothing itself, but wakes each time the watch reads a new phrase. */
async function heardFromVoiceOver(action: () => Promise<unknown>, matches: (phrase: string) => boolean, what: string, timeout: number): Promise<string> {
  const watch = await watchVoiceOver(Math.ceil(timeout / 1000) + 10);
  try {
    await action();
    const deadline = Date.now() + timeout;
    for (;;) {
      const phrases = watch.phrases();
      const found = firstMatch(phrases, matches);
      if (found !== undefined) {
        console.log(`[sr] heard ${what}: "${found}"`);
        return found;
      }
      const heardSoFar = phrases.map((phrase) => `"${phrase}"`).join(" | ") || "nothing";
      const failure = watch.failure();
      if (failure !== null) throw new Error(`[sr] infrastructure: VoiceOver's speech stopped being read (${failure}); heard: ${heardSoFar}`);
      if (Date.now() > deadline) throw new Error(`[sr] no utterance matched ${what}; heard: ${heardSoFar}`);
      await watch.next(deadline);
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
