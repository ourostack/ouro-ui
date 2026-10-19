import { nvda, WindowsKeyCodes, WindowsModifiers } from "@guidepup/guidepup";
import type { NVDAPlaywright } from "@guidepup/playwright";
import type { Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readsBrowser } from "./phrases";

// NVDA for the screen-reader lane (screen-reader.ts): one NVDA for each Playwright worker, where
// @guidepup/playwright's nvdaTest starts one for each test. NVDA quitting between tests is what
// broke the lane: Guidepup's `nvda.stop()` returns while NVDA is still unloading its helper from the
// browser, and that failed the context's close after a test that passed ("browserContext.close:
// Test ended.") or took the shared browser down, so the next test could not open a context. NVDA
// now quits once, after the worker's last test. Each test moves NVDA to its page as Guidepup's
// `navigateToWebContent` does, adapted from @guidepup/playwright 0.19.1 (lib/nvdaTest.js), and fails
// as infrastructure when NVDA is not reading the browser.

const run = promisify(execFile);

/** Alt+Escape: sends the foreground window to the back, so the next one comes forward. */
const SWITCH_APPLICATION = { keyCode: [WindowsKeyCodes.Escape], modifiers: [WindowsModifiers.Alt] };
/** Control+Home: the start of the page. */
const MOVE_TO_TOP = { keyCode: [WindowsKeyCodes.Home], modifiers: [WindowsModifiers.Control] };

/** Whether NVDA's process is still running: `nvda.stop()` asks it to quit and returns at once. */
async function running(): Promise<boolean> {
  const { stdout } = await run("tasklist", ["/FI", "IMAGENAME eq nvda.exe", "/NH"]);
  return /\bnvda\.exe\b/i.test(stdout);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts the worker's NVDA. */
export async function startNVDA(): Promise<void> {
  await nvda.start({ capture: "initial" });
}

/**
 * Stops the worker's NVDA and waits (up to 30 s each) for `nvda.stop()` and for NVDA's process to
 * end, returning what went wrong, so the browser closes after NVDA has gone.
 */
export async function stopNVDA(): Promise<string[]> {
  const notes: string[] = [];
  const stopped = await Promise.race([nvda.stop().then(() => true, (error: unknown) => (notes.push(`NVDA did not stop: ${String(error)}`), true)), sleep(30_000).then(() => false)]);
  if (!stopped) notes.push("nvda.stop() did not return within 30 s");
  const deadline = Date.now() + 30_000;
  while ((await running().catch(() => false)) && Date.now() < deadline) await sleep(250);
  if (await running().catch(() => false)) notes.push("NVDA was still running 30 s after it was asked to quit");
  return notes;
}

/**
 * Brings the browser window forward until NVDA reports it (`readsBrowser`), at most ten times as
 * @guidepup/playwright does, and fails as infrastructure when it never does: a run where NVDA read
 * "Start, window" instead hung until the test timed out.
 */
async function focusBrowser(page: Page): Promise<void> {
  const pageTitle = await page.title();
  let windowTitle = "";
  for (let attempt = 0; attempt <= 10; attempt++) {
    if (attempt > 0) {
      await nvda.perform(SWITCH_APPLICATION, { capture: false });
      await page.bringToFront();
      await sleep(500);
    }
    await nvda.perform(nvda.keyboardCommands.reportTitle);
    windowTitle = await nvda.lastSpokenPhrase();
    if (readsBrowser(windowTitle, pageTitle)) return;
  }
  throw new Error(`[sr] infrastructure: NVDA was not reading the browser window after 10 tries; it reported "${windowTitle}"`);
}

/**
 * The worker's NVDA for one test's page: `navigateToWebContent` leaves focus mode, brings the
 * browser forward, puts the focus in the page, resets browse mode, clears what NVDA has said so far
 * and moves to the start of the page, as @guidepup/playwright's does.
 */
export function nvdaFor(page: Page): NVDAPlaywright {
  const reader = nvda as NVDAPlaywright;
  reader.navigateToWebContent = async ({ capture } = {}) => {
    await nvda.perform(nvda.keyboardCommands.exitFocusMode, { capture: false });
    await sleep(100);
    await focusBrowser(page);
    await page.bringToFront();
    await page.locator("body").waitFor();
    await page.locator("body").focus();
    await page.locator("body").click();
    await page.locator("body").blur();
    await nvda.perform(nvda.keyboardCommands.readNextFocusableItem, { capture: false });
    await sleep(100);
    await nvda.perform(nvda.keyboardCommands.toggleBetweenBrowseAndFocusMode, { capture: false });
    await sleep(100);
    await nvda.perform(nvda.keyboardCommands.toggleBetweenBrowseAndFocusMode, { capture: false });
    await sleep(100);
    await nvda.perform(nvda.keyboardCommands.exitFocusMode, { capture: false });
    await sleep(100);
    await nvda.clearSpokenPhraseLog();
    await nvda.clearItemTextLog();
    await nvda.perform(MOVE_TO_TOP, capture === undefined ? {} : { capture });
  };
  return reader;
}
