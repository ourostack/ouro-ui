import { expect, test, type BrowserContextOptions, type Page } from "@playwright/test";
import { LATENCY } from "./latency";

// The switch to still water draws no long frame: a visitor on a slow screen may reach for the menu just then
// (ourostack/ouro-ui#667). Run alone, one worker, by `pnpm test:latency` (playwright.latency.config.ts) and CI's
// latency job: beside other workers and Storybook's dev server, CI's WebKit drew every frame 130 to 420 ms apart and the
// switch could not be told from its neighbours.
//
// The stage's judge is shown slow frames by scaling its requestAnimationFrame timestamps, so it reaches its real verdict
// while the page itself runs at its own speed and pays the switch's real cost. The frames are read from an unscaled
// requestAnimationFrame. The switch's frames are the frame the verdict lands in (the verdict is stamped after its own task,
// so a cost inside that task ends before the stamp) and the next SWITCH_FRAMES - 1: its commit, effects and the captain's
// line are drawn there. Frames before or after are the runner's: CI's WebKit drew 600 to 900 ms frames 1.2 to 1.5 s before
// the verdict while the page loaded, and local WebKit under load paused 510 to 590 ms half a second after it, with the
// scene long still (ourostack/ouro-ui#676).
//
// - Chromium, at the latency budget's 4x slower CPU: no frame of 50 ms or more.
// - WebKit, which on CI draws without the GPU: no frame over 100 ms, or over REPAINTS times what this runner takes to draw
//   a frame that changes the whole viewport when that is more. On CI the switch's frame took 50 to 137 ms however fast the
//   page's own frames were (24 to 334 ms), so neither a flat budget nor the page's pace told it from the runner, and two
//   and a half paces let a 160 ms busy task in the switch through where the page was slow (ourostack/ouro-ui#676). The
//   viewport frame is measured on the same page once the scene is still, by a veil of the test's own, so no change to the
//   switch can widen it: CI's runners drew it in 51 to 73 ms, local WebKit in 15 to 18.
//
// A verdict counts only when the page drew at least `PACED` frames in the 1.5 s before it: CI's WebKit once drew none for
// 6.7 s while its first page loaded, which says nothing of the switch. Such a page is judged again, afresh.
const CHROMIUM_BUDGET = 50;
const WEBKIT_BUDGET = 100;
/** In WebKit, the switch's frame may take this many of the runner's whole-viewport frames (`repaint`). */
const REPAINTS = 3;
/** The frames that are the switch's: the one the verdict lands in and those after it. */
const SWITCH_FRAMES = 3;
/** Frames the veil is drawn in to measure a whole-viewport frame, the first one not counted. */
const VEIL_FRAMES = 8;
/** Fresh pages, each judged once. */
const VERDICTS = 5;
/**
 * Verdicts that may go over budget: a cost of the switch's own is paid on every page, while a runner's stall lands in the
 * switch's frames on one page now and then (under eight local WebKit workers, 3 runs in 20 had one, on one page each).
 */
const OUTLIERS = 1;
/** Frames the page must have drawn in the 1.5 s before the verdict for it to count, and the pages tried for each. */
const PACED = 4;
const TRIES = 3;

interface Switch {
  worst: number;
  at: number;
  pace: number;
  paced: number;
  repaint: number;
  /** The switch's frames, in ms. */
  frames: number[];
  series: string;
}

async function judge(page: Page): Promise<Switch> {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const raw = window.requestAnimationFrame.bind(window);
    const frames: number[] = [];
    (window as unknown as { __frames: number[]; __raf: typeof raw }).__frames = frames;
    (window as unknown as { __raf: typeof raw }).__raf = raw;
    window.requestAnimationFrame = (callback) => raw((now) => callback(now * 10));
    const count = () => {
      frames.push(performance.now());
      raw(count);
    };
    raw(count);
    // When the verdict lands, stamped in the page.
    document.addEventListener("DOMContentLoaded", () => {
      const stage = document.querySelector("[data-stage]")!;
      new MutationObserver(() => {
        if (stage.hasAttribute("data-paced")) (window as unknown as { __paced: number }).__paced ??= performance.now();
      }).observe(stage, { attributes: true, attributeFilter: ["data-paced"] });
    });
  });
  await page.goto("./");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  // real clock: the stage judges the screen on its real frames, a beat and then a second of them.
  await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "", { timeout: 15_000 });
  await expect(page.locator(".stage-scene")).toHaveAttribute("data-speed", "stop");
  // real clock: half a second of frames with the scene still, with no call into the page while the switch draws (while the
  // test polled the page there, CI's WebKit drew the switch's third frame in 149 to 247 ms).
  await page.waitForTimeout(500);
  // The switch's frames, and one more so the last of them has ended, if a slow runner has not drawn them yet: counted in
  // frames, so frames after them, the runner's, are not read.
  await page.evaluate(async (count) => {
    const { __frames: frames, __paced: from, __raf: raw } = window as unknown as { __frames: number[]; __paced: number; __raf: typeof requestAnimationFrame };
    while (frames.filter((time) => time > from).length < count) await new Promise((resolve) => raw(resolve));
  }, SWITCH_FRAMES + 1);
  // What this runner takes to draw a frame that changes the whole viewport: a veil over it, near clear, switched between
  // two shades a frame at a time; the median gap, with the frame that adds it not counted.
  const repaint = await page.evaluate(async (frames) => {
    const raw = (window as unknown as { __raf: typeof requestAnimationFrame }).__raf;
    const next = () => new Promise<number>((resolve) => raw(() => resolve(performance.now())));
    const veil = document.createElement("div");
    veil.style.cssText = "position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; background: rgb(0 0 0 / 0.02)";
    document.body.append(veil);
    let last = await next();
    const gaps: number[] = [];
    for (let index = 1; index < frames; index += 1) {
      veil.style.background = index % 2 ? "rgb(255 255 255 / 0.02)" : "rgb(0 0 0 / 0.02)";
      const now = await next();
      gaps.push(now - last);
      last = now;
    }
    veil.remove();
    return gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
  }, VEIL_FRAMES);
  const read = await page.evaluate((count) => {
    const from = (window as unknown as { __paced: number }).__paced;
    const all = (window as unknown as { __frames: number[] }).__frames;
    // The frame the verdict lands in: the last to begin before its stamp.
    let first = 0;
    while (first + 1 < all.length && all[first + 1]! <= from) first += 1;
    const last = first + count;
    // Every frame's gap from 1.5 s before the verdict, as "ms from the verdict:gap", the switch's in [brackets].
    const series = all
      .map((time, index) => {
        if (!index || all[index - 1]! < from - 1500) return "";
        const entry = `${Math.round(all[index - 1]! - from)}:${Math.round(time - all[index - 1]!)}`;
        return index > first && index <= last ? `[${entry}]` : entry;
      })
      .filter(Boolean)
      .join(" ");
    // The page's own pace: the median gap between frames in the 1.5 s before the verdict.
    const before = all
      .map((time, index) => (index && all[index - 1]! >= from - 1500 && time < from - 50 ? time - all[index - 1]! : -1))
      .filter((gap) => gap >= 0)
      .sort((a, b) => a - b);
    const pace = before.length ? before[Math.floor(before.length / 2)]! : 0;
    let worst = 0;
    let at = 0;
    for (let index = first + 1; index <= last && index < all.length; index += 1)
      if (all[index]! - all[index - 1]! > worst) {
        worst = all[index]! - all[index - 1]!;
        at = all[index - 1]! - from;
      }
    const frames = all.slice(first, last + 1).flatMap((time, index, own) => (index ? [Math.round(time - own[index - 1]!)] : []));
    return { worst: Math.round(worst), at: Math.round(at), pace: Math.round(pace), paced: before.length, frames, series };
  }, SWITCH_FRAMES);
  return { ...read, repaint: Math.round(repaint) };
}

test("the switch to still water draws no long frame", async ({ browser, browserName }) => {
  test.setTimeout(VERDICTS * TRIES * 30_000);
  const results: Switch[] = [];
  const unpaced: Switch[] = [];
  for (let run = 0; run < VERDICTS; run += 1)
    for (let attempt = 0; attempt < TRIES; attempt += 1) {
      // The project's own device and address, in a fresh context for each verdict.
      const { baseURL, ignoreHTTPSErrors, viewport, deviceScaleFactor, userAgent, isMobile, hasTouch } = test.info().project.use;
      const options = Object.fromEntries(Object.entries({ baseURL, ignoreHTTPSErrors, viewport, deviceScaleFactor, userAgent, isMobile, hasTouch }).filter(([, value]) => value !== undefined)) as BrowserContextOptions;
      const context = await browser.newContext(options);
      const page = await context.newPage();
      if (browserName === "chromium") await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: LATENCY.throttle });
      const result = await judge(page);
      await context.close();
      if (result.paced >= PACED) {
        results.push(result);
        break;
      }
      unpaced.push(result);
    }
  const budget = (result: Switch) =>
    browserName === "chromium" ? CHROMIUM_BUDGET : Math.max(WEBKIT_BUDGET, Math.round(REPAINTS * result.repaint));
  // Printed every run, so CI's log keeps the switch's cost.
  console.log(`switch to still water, ${browserName}: ${results.map((result) => `${result.worst} ms at ${result.at} (frames ${result.frames.join("/")}, pace ${result.pace}, viewport frame ${result.repaint}, budget ${budget(result)})`).join("; ")}${unpaced.length ? `; judged again, with too few frames before the verdict: ${unpaced.map((result) => `${result.paced} frames, ${result.worst} ms at ${result.at}`).join("; ")}` : ""}`);
  expect(results, `every verdict, with ${PACED} frames or more in the 1.5 s before it`).toHaveLength(VERDICTS);
  const over = results.filter((result) => result.worst >= budget(result));
  expect(
    over.length,
    `verdicts whose switch drew a frame over budget, of ${VERDICTS} (at most ${OUTLIERS}):\n${over
      .map(
        (result) =>
          `- the longest of the switch's ${SWITCH_FRAMES} frames, ${result.worst} ms at ${result.at} ms from the verdict, against ${budget(result)} ms (the page's median frame before it, ${result.pace} ms; the runner's whole-viewport frame, ${result.repaint} ms); each frame from 1.5 s before it as "ms from the verdict:gap", the switch's in [brackets]: ${result.series}`,
      )
      .join("\n")}`,
  ).toBeLessThanOrEqual(OUTLIERS);
});
