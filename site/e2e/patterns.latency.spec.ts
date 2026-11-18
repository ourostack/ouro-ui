import { expect, test, type Page } from "@playwright/test";
import { LATENCY } from "./latency";

// How long each page pattern an app installs whole takes to first paint on a phone: a 390px page on a CPU throttled
// LATENCY.throttle×, from navigation to the first contentful paint. Each app's HTML is an empty root that React fills, so
// that paint is the pattern's first commit. Chart draws its plot after the first paint, so for a pattern with a chart the
// time its plot is drawn at full size is measured too. Each app is the production build scripts/pattern-size.mjs makes
// (the pattern and the registry closure it installs, with React and Ouro's stylesheet), served by
// playwright.latency.config.ts, and loaded LOADS.warmUps times to warm the cache and then LOADS.samples times, each in a
// new page. A bare app with the same stylesheet, which renders one paragraph, is loaded in turn with the pattern: it is
// the same work on the same runner at the same moment, so its median scales the pattern's baseline to this runner
// (ceilingFor), and it is held itself against the runner's speed (bareCeiling). This runs alone, one worker, in CI's
// latency job, so no neighbour shares the CPU.

const PHONE = { width: 390, height: 844 };
const LOADS = { warmUps: 2, samples: 12 };
const BARE = "bare-app";

/** A baseline: the median a CI run measured, in ms, and the bare app's median in the same test, which scales it to a runner. */
interface Baseline {
  median: number;
  bare: number;
}

/**
 * Each pattern's baselines, from CI's latency job: its first paint, and for a pattern with a chart, the time its plot is
 * drawn. Re-measure and update a line when a change makes a pattern faster or knowingly slower.
 *
 * Set 2026-11-18 from run 44286124531 (pull request #2103), whose runner was slow: its bare app's median was 148 to 152
 * ms. Run 44283863397, a fast runner with a bare app at 88 ms, measured 288, 192 and 232 ms for the first paints and
 * 428.5 for the chart: against the bare app, within 1% of these for the first paints and 7% for the chart, whose ratio
 * was lower there, so these, the higher ratios, are the baselines.
 */
const BASELINES: Record<string, { paint: Baseline | null; plot?: Baseline | null }> = {
  "dashboard-page": { paint: { median: 502, bare: 152 }, plot: { median: 793, bare: 152 } },
  "list-detail-page": { paint: { median: 326, bare: 148 } },
  "settings-page": { paint: { median: 402, bare: 152 } },
};

/**
 * The most a pattern's median may be, in ms: its baseline scaled by the bare app's median now over its median then, and a
 * quarter more, so a pattern that paints a quarter later than the runner explains fails.
 */
function ceilingFor(baseline: Baseline, bare: number): number {
  return Math.round(baseline.median * (bare / baseline.bare) * 1.25);
}

/**
 * The bare app's own baseline: its median first paint and the runner's full-speed loop time (loop) in the same run, so
 * what every pattern shares (React, Ouro's stylesheet) is held too, which the patterns' ceilings, scaled by the bare app,
 * cannot see. From run 44286124531: 148 to 152 ms beside a loop of 2.4 to 2.5 ms. Run 44283863397 measured 88 ms beside
 * a loop of 1.7 ms, about a fifth faster than the loop alone explains, so its ceiling is half again over the scaled
 * baseline, not a quarter.
 */
const BARE_BASELINE = { median: 152, loop: 2.5 };

/** The most the bare app's median may be, in ms: its baseline scaled by the runner's loop now over its loop then, and half again. */
function bareCeiling(loop: number): number {
  return Math.round(BARE_BASELINE.median * (loop / BARE_BASELINE.loop) * 1.5);
}

/** The median of a list of numbers. */
function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(middle)]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** A fixed loop's time in the page, ms: the fastest of three runs after one to compile it, since a busy runner only ever adds time. */
async function loop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const once = () => {
      const started = performance.now();
      let hash = 0;
      for (let i = 0; i < 2_000_000; i++) hash = Math.imul(hash ^ i, 2654435761) >>> 0;
      // Kept on the window so the loop's result is used and the engine cannot drop the loop.
      (window as unknown as { __loopHash: number }).__loopHash = hash;
      return performance.now() - started;
    };
    once();
    return Math.min(once(), once(), once());
  });
}

/**
 * One load of an app in a new page on the throttled CPU: its first contentful paint and, when it has a chart, the time
 * its plot was drawn, in ms from navigation; and the fixed loop's time on the page while still throttled, which the test
 * holds against the runner's full speed, so a load the throttle missed fails rather than passing fast.
 */
async function load(page: Page, name: string, chart: boolean): Promise<{ paint: number; plot: number | null; throttled: number }> {
  await page.setViewportSize(PHONE);
  // A throttle set before a new page's first navigation missed about half the loads in Chromium (the page ran at full
  // speed); set once the page holds a document from the same origin, it reached every one.
  await page.goto(`${name}/dist/assets/index.css`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: LATENCY.throttle });
  await page.goto(`${name}/dist/`);
  const { paint, plot } = await page.evaluate(
    (chart) =>
      Promise.all([
        new Promise<number>((resolve) => {
          new PerformanceObserver((list) => {
            const entry = list.getEntriesByName("first-contentful-paint")[0];
            if (entry) resolve(entry.startTime);
          }).observe({ type: "paint", buffered: true });
        }),
        chart ? new Promise<number>((resolve) => void (window as unknown as { __plotDrawn: Promise<number> }).__plotDrawn.then(resolve)) : null,
      ]).then(([paint, plot]) => ({ paint, plot })),
    chart,
  );
  await expect(page.locator(name === BARE ? "p" : "main").first()).toBeVisible();
  const throttled = await loop(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return { paint: Math.round(paint), plot: plot === null ? null : Math.round(plot), throttled };
}

/** Holds one median to its ceiling, reporting it either way. */
function judge(label: string, samples: number[], ceiling: number | null, basis: string): void {
  const middle = median(samples);
  const report = `${label}: median ${middle} ms (${ceiling === null ? "no baseline yet" : `≤ ${ceiling}`}), ${basis}; samples in order: ${samples.join(", ")}`;
  test.info().annotations.push({ type: "latency", description: report });
  console.log(`latency ${report}`);
  // Soft, so a pattern's every number is measured and reported before the test fails on any of them.
  if (ceiling === null) expect.soft(ceiling, `${label} has no baseline: set it in BASELINES from CI's latency job (${report})`).not.toBeNull();
  else expect.soft(middle, report).toBeLessThanOrEqual(ceiling);
}

for (const [name, baselines] of Object.entries(BASELINES)) {
  test(`${name} paints first within its ceiling on a phone, at ${LATENCY.throttle}× slower CPU`, async ({ context }) => {
    const chart = "plot" in baselines;
    // From the document's start: the time after the frame that first shows Chart's plot at its real size with its
    // series drawn. Recharts first adds a 1×1 placeholder surface, and sizes it once it has measured its box, so the
    // observer watches the surface's size too, and waits for a path in its layers.
    if (chart)
      await context.addInitScript(() => {
        (window as unknown as { __plotDrawn: Promise<number> }).__plotDrawn = new Promise((resolve) => {
          const drawn = () => {
            const surface = document.querySelector("[data-ouro-chart-plot] svg.recharts-surface");
            return !!surface && Number(surface.getAttribute("width")) > 1 && !!surface.querySelector(".recharts-layer path");
          };
          const observer = new MutationObserver(() => {
            if (!drawn()) return;
            observer.disconnect();
            requestAnimationFrame(() => setTimeout(() => resolve(performance.now())));
          });
          observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["width", "height", "d"] });
        });
      });
    // The runner's full speed: the loop on an unthrottled page, fastest of its runs before the loads and after.
    const anchor = await context.newPage();
    await anchor.goto(`${BARE}/dist/`);
    let full = await loop(anchor);
    const paints: number[] = [];
    const plots: number[] = [];
    const bares: number[] = [];
    const throttledLoops: number[] = [];
    for (let index = 0; index < LOADS.warmUps + LOADS.samples; index++) {
      for (const app of [BARE, name]) {
        const page = await context.newPage();
        try {
          const { paint, plot, throttled } = await load(page, app, chart && app === name);
          throttledLoops.push(throttled);
          if (index < LOADS.warmUps) continue;
          if (app === BARE) bares.push(paint);
          else paints.push(paint);
          if (plot !== null) plots.push(plot);
        } finally {
          await page.close();
        }
      }
    }
    full = Math.min(full, await loop(anchor));
    const slowdowns = throttledLoops.map((time) => Math.round((time / full) * 10) / 10);
    console.log(`latency ${name} throttle: each load's loop ran ${slowdowns.join(", ")}× slower than full speed (${Math.round(full * 10) / 10} ms)`);
    expect(Math.min(...slowdowns), `${name}: a load ran ${Math.min(...slowdowns)}× slower than full speed, so the ${LATENCY.throttle}× throttle missed it (${slowdowns.join(", ")})`).toBeGreaterThanOrEqual(2);
    const bare = median(bares);
    const runner = Math.round(full * 100) / 100;
    judge(`${name}'s ${BARE} first paint`, bares, bareCeiling(runner), `baseline ${BARE_BASELINE.median} beside a loop of ${BARE_BASELINE.loop} ms, the loop ${runner} ms now`);
    const against = (baseline: Baseline) => `baseline ${baseline.median} beside a bare app's ${baseline.bare}, the bare app ${bare} ms now`;
    judge(`${name} first paint`, paints, baselines.paint ? ceilingFor(baselines.paint, bare) : null, baselines.paint ? against(baselines.paint) : `the bare app ${bare} ms now`);
    if (chart) judge(`${name} chart drawn`, plots, baselines.plot ? ceilingFor(baselines.plot, bare) : null, baselines.plot ? against(baselines.plot) : `the bare app ${bare} ms now`);
  });
}
