import { expect, test, type BrowserContextOptions, type Page } from "@playwright/test";
import { pooled } from "./frames";
import { LATENCY } from "./latency";

// The switch to still water draws no long frame: a visitor on a slow screen may reach for the menu just then
// (ourostack/ouro-ui#667). Run alone, one worker, by `pnpm test:latency` (playwright.latency.config.ts) and CI's
// latency job: beside other workers and Storybook's dev server, CI's WebKit drew every frame 130 to 420 ms apart and the
// switch could not be told from its neighbours.
//
// The stage's judge is shown slow frames by scaling its requestAnimationFrame timestamps, so it reaches its real verdict
// while the page itself runs at its own speed and pays the switch's real cost. The frames are read from an unscaled
// requestAnimationFrame, from the last frame before the verdict (the verdict is stamped after its own task, so a cost
// inside that task ends before the stamp) until the scene has stood still for half a second.
//
// - Chromium, at the latency budget's 4x slower CPU: no frame of 50 ms or more.
// - WebKit, which on CI draws without the GPU at 50 to 300 ms a frame from one runner to the next: no frame over 100 ms,
//   or over two and a half times the page's own median frame in the 1.5 s before the verdict when that is more. The
//   switch's old costs there were three to eight times the page's own frame; its frame now is at most about twice it
//   (ten verdicts on CI, 1.3 to 2.1 times: ourostack/ouro-ui#676), which twice exactly failed at random.
//
// A verdict counts only when the page drew at least `PACED` frames in the 1.5 s before it: CI's WebKit once drew none for
// 6.7 s while its first page loaded, which says nothing of the switch. Such a page is judged again, afresh.
const CHROMIUM_BUDGET = 50;
const WEBKIT_BUDGET = 100;
/** In WebKit, the switch's frame may take this many of the page's own median frames. */
const WEBKIT_PACES = 2.5;
/** Fresh pages, each judged once. */
const VERDICTS = 5;
/** Frames the page must have drawn in the 1.5 s before the verdict for it to count, and the pages tried for each. */
const PACED = 4;
const TRIES = 3;
// The pages tried are one pool of VERDICTS times TRIES, so a bad stretch on the runner does not end the run early.

interface Switch {
  worst: number;
  raw: number;
  rawAt: number;
  /** The longest gap as drawn, and the part of it a worker in the page also stood still through (the runner's). */
  gap: number;
  runner: number;
  at: number;
  pace: number;
  paced: number;
  series: string;
}

async function judge(page: Page): Promise<Switch> {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const raw = window.requestAnimationFrame.bind(window);
    const frames: number[] = [];
    (window as unknown as { __frames: number[] }).__frames = frames;
    window.requestAnimationFrame = (callback) => raw((now) => callback(now * 10));
    const count = () => {
      frames.push(performance.now());
      raw(count);
    };
    raw(count);
    // A worker ticks on its own thread: the page's own work on its main thread leaves it ticking, while a runner that stops
    // the whole browser stops it too (ourostack/ouro-ui#722).
    const code = "const t=[];const n=()=>t.push(performance.timeOrigin+performance.now());setInterval(n,4);onmessage=()=>{n();postMessage(t)};";
    (window as unknown as { __worker: Worker }).__worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
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
  // real clock: half a second of frames with the scene still.
  await page.waitForTimeout(500);
  return page.evaluate(async () => {
    const worker = (window as unknown as { __worker: Worker }).__worker;
    const ticks = await new Promise<number[]>((resolve) => {
      worker.onmessage = ({ data }) => resolve(data);
      worker.postMessage(0);
    });
    worker.terminate();
    // A tick 20 ms late or more is the runner standing still: the page did not stop it.
    const stalls: [number, number][] = [];
    for (let index = 1; index < ticks.length; index += 1) if (ticks[index]! - ticks[index - 1]! > 20) stalls.push([ticks[index - 1]!, ticks[index]!]);
    const origin = performance.timeOrigin;
    const from = (window as unknown as { __paced: number }).__paced;
    const all = (window as unknown as { __frames: number[] }).__frames;
    // Every frame's gap from 1.5 s before the verdict, as "ms from the verdict:gap", for the record.
    const series = all
      .map((time, index) => (index ? `${Math.round(all[index - 1]! - from)}:${Math.round(time - all[index - 1]!)}` : ""))
      .filter((entry, index) => index && all[index - 1]! >= from - 1500)
      .join(" ");
    // The page's own pace: the median gap between frames in the 1.5 s before the verdict.
    const before = all
      .map((time, index) => (index && all[index - 1]! >= from - 1500 && time < from - 50 ? time - all[index - 1]! : -1))
      .filter((gap) => gap >= 0)
      .sort((a, b) => a - b);
    const pace = before.length ? before[Math.floor(before.length / 2)]! : 0;
    const frames = all.slice(Math.max(0, all.findIndex((time) => time >= from - 50) - 1));
    let worst = 0;
    let gap = 0;
    let runner = 0;
    let at = 0;
    let raw = 0;
    let rawAt = 0;
    for (let index = 1; index < frames.length; index += 1) {
      const [start, end] = [frames[index - 1]!, frames[index]!];
      const stood = stalls.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(end + origin, b) - Math.max(start + origin, a)), 0);
      if (end - start > raw) {
        raw = end - start;
        rawAt = start - from;
      }
      if (end - start - stood > worst) {
        worst = end - start - stood;
        gap = end - start;
        runner = stood;
        at = start - from;
      }
    }
    return { worst: Math.round(worst), gap: Math.round(gap), raw: Math.round(raw), rawAt: Math.round(rawAt), runner: Math.round(runner), at: Math.round(at), pace: Math.round(pace), paced: before.length, series };
  });
}

test("the switch to still water draws no long frame", async ({ browser, browserName }) => {
  test.setTimeout(VERDICTS * TRIES * 30_000);
  // One pool of attempts for all the verdicts, each on a fresh page in the project's own device and address.
  const { baseURL, ignoreHTTPSErrors, viewport, deviceScaleFactor, userAgent, isMobile, hasTouch } = test.info().project.use;
  const options = Object.fromEntries(Object.entries({ baseURL, ignoreHTTPSErrors, viewport, deviceScaleFactor, userAgent, isMobile, hasTouch }).filter(([, value]) => value !== undefined)) as BrowserContextOptions;
  const { kept: results, discarded: unpaced } = await pooled(
    VERDICTS,
    VERDICTS * TRIES,
    async () => {
      const context = await browser.newContext(options);
      const page = await context.newPage();
      if (browserName === "chromium") await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: LATENCY.throttle });
      const result = await judge(page);
      await context.close();
      return result;
    },
    (result) => result.paced >= PACED,
  );
  for (const result of [...results, ...unpaced])
    test.info().annotations.push({ type: "switch", description: `${result.paced >= PACED ? "kept" : "judged again"}: ${result.paced} frames before the verdict, ${result.worst} ms of the page's own in a ${result.gap} ms gap (${result.runner} ms the runner's) at ${result.at}, pace ${result.pace}` });
  const budget = (result: Switch) => (browserName === "chromium" ? CHROMIUM_BUDGET : Math.max(WEBKIT_BUDGET, Math.round(WEBKIT_PACES * result.pace)));
  // Printed every run, so CI's log keeps the switch's cost.
  console.log(`switch to still water, ${browserName}: ${results.map((result) => `${result.worst} ms of the page's own in a ${result.gap} ms gap (${result.runner} ms the runner's) at ${result.at} (pace ${result.pace}, budget ${budget(result)})`).join("; ")}${unpaced.length ? `; judged again, with too few frames before the verdict: ${unpaced.map((result) => `${result.paced} frames, ${result.worst} ms at ${result.at}`).join("; ")}` : ""}`);
  expect(results, `only ${results.length} of ${VERDICTS} judgeable: the pool ran out with the rest on pages that drew fewer than ${PACED} frames in the 1.5 s before the verdict`).toHaveLength(VERDICTS);
  for (const result of results) {
    // A stop-the-world pause in the page's own process (a full GC) stops the worker too, so the split would excuse it as the runner's; the raw gap is bounded whatever the split.
    expect(result.raw, `the longest raw frame gap around the switch, ${result.raw} ms ${result.rawAt} ms from the verdict, against twice the ${budget(result)} ms budget: the split excuses a runner's stall, not a page-wide pause; each frame from 1.5 s before the verdict: ${result.series}`).toBeLessThan(2 * budget(result));
    expect(result.worst, `the page's own longest frame around the switch, a ${result.gap} ms gap of which ${result.runner} ms the runner's, ${result.at} ms from the verdict, against ${budget(result)} ms (the page's median frame before it, ${result.pace} ms); each frame from 1.5 s before it: ${result.series}`).toBeLessThan(budget(result));
  }
});
