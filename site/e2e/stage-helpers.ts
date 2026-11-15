import { expect, type Page } from "@playwright/test";
import { STAGE_COPY, TANKS } from "../src/voyage/stage/copy";

// What the stage specs share: opening the page, bringing the stage up, and the slow-screen stand-ins.
export async function open(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
}

export const scene = (page: Page) => page.locator(".stage-scene");

/** The page opens in Ouro's meadow, the porthole below it; the stage judges the screen only once it is on it, so bring it up. */
export const bringUp = (page: Page) => page.evaluate(() => document.querySelector("[data-stage]")!.scrollIntoView({ block: "center", behavior: "instant" }));

/**
 * The fish swimming at Half, from a page the stage has judged: a screen too slow to swim them (CI's WebKit, drawing without
 * its GPU) starts in still water, and a press on Half sets them going, as a visitor's would.
 */
export async function swimming(page: Page): Promise<void> {
  await bringUp(page);
  // real clock: the stage judges the screen on its real frames, a beat and then a second of them.
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "");
  // The verdict asked of the control, which commits with data-paced: the scene follows the controls a paint later, so its
  // data-speed can still say Half for a frame after the stage has chosen Stop.
  if (await page.getByRole("radio", { name: "Stop" }).isChecked()) await page.getByRole("radio", { name: "Half" }).click();
  await expect(scene(page)).toHaveAttribute("data-speed", "half");
}

/** Holds the page on each frame for `ms` from when its HTML has loaded, as a screen that draws slowly would. */
export const slowFrames = (page: Page, ms: number) =>
  page.addInitScript((hold) => {
    const burn = () => {
      const end = performance.now() + hold;
      while (performance.now() < end);
      requestAnimationFrame(burn);
    };
    addEventListener("DOMContentLoaded", () => requestAnimationFrame(burn));
  }, ms);

/** Opens the stage on a page that draws slowly, which takes longer to be ready. */
export async function openSlow(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.locator("html[data-site-ready]")).toBeAttached({ timeout: 20_000 });
}

/** The stage's endless animations that are running: the fish's drift and the caustics' sway. */
export const ambient = (page: Page) =>
  page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running" && ["stage-drift", "stage-caustics"].includes((animation as CSSAnimation).animationName)).length);
export const porthole = (page: Page) => page.locator(".stage-porthole");
/** The crew's newest line, under the porthole. */
export const lastLog = (page: Page) => page.locator("[data-stage-crew]");
export const [FORE, MIDDLE, AFT] = TANKS;
export const tank = (page: Page, name: string) => page.getByRole("switch", { name, exact: true });
export const diveButton = (page: Page) => page.getByRole("button", { name: STAGE_COPY.dive, exact: true });

/** Waits until every finite animation and transition on the page has finished. */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let round = 0; round < 50; round++) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const running = document.getAnimations().filter((animation) => animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity);
      if (running.every((animation) => animation instanceof CSSAnimation && animation.animationName === "stage-drift")) return;
      await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
    }
  });
}

/** Waits until the page has not scrolled for five frames in a row. */
export async function scrollAtRest(page: Page): Promise<void> {
  await page.evaluate(async () => {
    let last = scrollY;
    for (let still = 0, frame = 0; still < 5 && frame < 300; frame++) {
      await new Promise(requestAnimationFrame);
      still = scrollY === last ? still + 1 : 0;
      last = scrollY;
    }
  });
}

/** The porthole as pixels, with the fish held still so only the control under test changes it. */
export async function picture(page: Page): Promise<Buffer> {
  await settled(page);
  return porthole(page).screenshot({ animations: "disabled" });
}

/** Operates a control and asserts the porthole looks different afterwards. */
export async function changesThePicture(page: Page, act: () => Promise<void>): Promise<void> {
  const before = await picture(page);
  await act();
  const after = await picture(page);
  expect(after.equals(before), "the porthole looks different").toBe(false);
}

/**
 * Records each CSS animation that starts from now on, and returns which ones started on the elements
 * a selector matches. A test can't look for a one-off animation still running: it lasts under a
 * second, less than the waits before the look can take on a busy runner.
 */
export async function recordAnimations(page: Page): Promise<(selector: string) => Promise<string[]>> {
  await page.evaluate(() => {
    const started: Array<{ target: Element; name: string }> = [];
    (window as unknown as { __started: typeof started }).__started = started;
    document.addEventListener("animationstart", (event) => started.push({ target: event.target as Element, name: event.animationName }));
  });
  return (selector) =>
    page.evaluate((selector) => {
      const started = (window as unknown as { __started: Array<{ target: Element; name: string }> }).__started;
      return [...new Set(started.filter(({ target }) => target.matches(selector)).map(({ name }) => name))];
    }, selector);
}

export async function fillTanks(page: Page): Promise<void> {
  for (const { name } of TANKS) await tank(page, name).click();
}
