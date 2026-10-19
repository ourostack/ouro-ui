import { nvdaTest, voiceOverTest, type NVDAPlaywright, type VoiceOverPlaywright } from "@guidepup/playwright";
import { expect, type Page, type PlaywrightTestArgs, type PlaywrightTestOptions, type PlaywrightWorkerArgs, type PlaywrightWorkerOptions, type TestType } from "@playwright/test";

// The screen-reader lane's fixtures (playwright.screen-reader.config.ts): VoiceOver on macOS and
// NVDA on Windows, through Guidepup. `page` opens the spec's story and waits for its component
// before the screen reader starts, and `sr` is the running screen reader, at the start of the web
// content. Lines starting `[sr]` are what scripts/sr-classify.mjs reads: `[sr] first utterance:`
// shows the screen reader spoke, `[sr] no utterance matched` is an accessibility failure and
// `[sr] infrastructure:` is the runner's.

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

/** The test each spec uses: VoiceOver's on macOS, NVDA's on Windows. */
export const test: ScreenReaderTest =
  process.platform === "darwin"
    ? voiceOverTest.extend<Fixtures>({ storyId: ["", { option: true }], page, sr: async ({ voiceOver }, provide) => provide(voiceOver) })
    : nvdaTest.extend<Fixtures>({ storyId: ["", { option: true }], page, sr: async ({ nvda }, provide) => provide(nvda) });

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

/**
 * Performs `action` (with Playwright) and waits up to `timeout` for the screen reader to say
 * something `matches` accepts, failing with every phrase it heard. Returns the matching phrase.
 */
export async function heard(sr: ScreenReader, action: () => Promise<unknown>, matches: (phrase: string) => boolean, what: string, timeout = 15_000): Promise<string> {
  const phrases: string[] = [];
  const add = (phrase: string) => {
    const text = phrase.trim();
    if (text && phrases.at(-1) !== text) phrases.push(text);
  };
  add((await sr.capture(action, { capture: true })).spokenPhrase);
  const deadline = Date.now() + timeout;
  for (;;) {
    const found = phrases.find(matches) ?? (matches(phrases.join(" ")) ? phrases.join(" ") : undefined);
    if (found !== undefined) {
      console.log(`[sr] heard ${what}: "${found}"`);
      return found;
    }
    if (Date.now() > deadline) throw new Error(`[sr] no utterance matched ${what}; heard: ${phrases.map((phrase) => `"${phrase}"`).join(" | ") || "nothing"}`);
    // Speech that comes after the action (a live region) is read by capturing again.
    add((await sr.capture(async () => undefined, { capture: true })).spokenPhrase);
  }
}

/** "unchecked" (VoiceOver) or "not checked" (NVDA). */
export const saysUnchecked = (phrase: string): boolean => /\b(unchecked|not checked)\b/i.test(phrase);

/** "checked", and neither "unchecked" nor "not checked". */
export const saysChecked = (phrase: string): boolean => /\bchecked\b/i.test(phrase) && !saysUnchecked(phrase);

/** The role word for a checkbox: "checkbox" (VoiceOver) or "check box" (NVDA). */
export const saysCheckbox = (phrase: string): boolean => /\bcheck ?box\b/i.test(phrase);

/** A locator's accessible name, from its ARIA snapshot (`- checkbox "Rolled oats"`). */
export async function accessibleName(locator: import("@playwright/test").Locator): Promise<string> {
  const name = /^- \w+ "([^"]*)"/.exec(await locator.ariaSnapshot())?.[1];
  if (!name) throw new Error(`no accessible name in ${await locator.ariaSnapshot()}`);
  return name;
}
