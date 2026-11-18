import { expect, test, type Page } from "@playwright/test";
import { LATENCY, median, probeRound, runnerFactor } from "./latency";

// How long each page pattern an app installs whole takes to first paint on a phone: a 390px page on a CPU throttled
// LATENCY.throttle×, from navigation to the first contentful paint. Each app's HTML is an empty root that React fills, so
// that paint is the pattern's first commit. Chart draws its plot after the first paint, so for a pattern with a chart the
// time its plot is drawn at full size is measured too. Each app is the production build scripts/pattern-size.mjs makes (the pattern
// and the registry closure it installs, with React and Ouro's stylesheet), served by playwright.latency.config.ts, and
// loaded LOADS.warmUps times to warm the cache and then LOADS.samples times, each in a new page. A bare app with the same
// stylesheet, which renders one paragraph, is measured beside them for what React alone costs. Each median must stay
// within its ceiling (ceilingFor). This runs alone, one worker, in CI's latency job, so no neighbour shares the CPU.

const PHONE = { width: 390, height: 844 };
const LOADS = { warmUps: 2, samples: 12 };

/** A baseline: the median a CI run measured, in ms, and that run's calibration probe median, which scales it to a quiet runner. */
interface Baseline {
  median: number;
  probe: number;
}

/**
 * Each pattern's baselines, from CI's latency job: its first paint, and for a pattern with a chart, the frame that draws
 * its plot (null until a run has measured it). Re-measure and update a line when a change makes a pattern faster or
 * knowingly slower.
 */
const BASELINES: Record<string, { paint: Baseline | null; plot?: Baseline | null }> = {
  "bare-app": { paint: null },
  "dashboard-page": { paint: null, plot: null },
  "list-detail-page": { paint: null },
  "settings-page": { paint: null },
};

/**
 * The most a median may be, in ms: its baseline as a quiet runner would have measured it (scaled by the quiet probe over
 * its run's probe, so a baseline taken on a fast runner does not leave a quiet one no room), half again, times this
 * runner's factor (runnerFactor). CI's runs' probe medians range from 32 to 68 ms around the quiet 52 (latency.ts), and a
 * test's own probe is six presses at Event Timing's 8 ms step, so the margin is half the baseline rather than a quarter.
 */
function ceilingFor(baseline: Baseline, factor: number): number {
  return Math.round(baseline.median * (LATENCY.probeQuiet / baseline.probe) * 1.5 * factor);
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
  await expect(page.locator(name === "bare-app" ? "p" : "main").first()).toBeVisible();
  const throttled = await loop(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return { paint: Math.round(paint), plot: plot === null ? null : Math.round(plot), throttled };
}

/** The verdict on one median against its baseline, reported in the log either way. */
function judge(label: string, samples: number[], baseline: Baseline | null | undefined, factor: number, probe: number[]): void {
  const middle = median(samples);
  const ceiling = baseline ? ceilingFor(baseline, factor) : null;
  const report = `${label}: median ${middle} ms (${ceiling === null ? "no baseline yet" : `≤ ${ceiling}, baseline ${baseline!.median} at probe ${baseline!.probe}`}), runner factor ${factor}, probe median ${median(probe)} (${probe.join(", ")}); samples in order: ${samples.join(", ")}`;
  test.info().annotations.push({ type: "latency", description: report });
  console.log(`latency ${report}`);
  if (baseline === undefined) return;
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
    const anchor = await context.newPage();
    await anchor.setViewportSize(PHONE);
    const probe = await probeRound(anchor);
    // The runner's full speed: the loop on the unthrottled anchor page, fastest of its runs before the loads and after.
    let full = await loop(anchor);
    const paints: number[] = [];
    const plots: number[] = [];
    const throttledLoops: number[] = [];
    for (let index = 0; index < LOADS.warmUps + LOADS.samples; index++) {
      const page = await context.newPage();
      try {
        const { paint, plot, throttled } = await load(page, name, chart);
        throttledLoops.push(throttled);
        if (index >= LOADS.warmUps) {
          paints.push(paint);
          if (plot !== null) plots.push(plot);
        }
      } finally {
        await page.close();
      }
    }
    full = Math.min(full, await loop(anchor));
    probe.push(...(await probeRound(anchor)));
    const factor = runnerFactor(probe);
    const slowdowns = throttledLoops.map((time) => Math.round((time / full) * 10) / 10);
    console.log(`latency ${name} throttle: each load's loop ran ${slowdowns.join(", ")}× slower than full speed (${Math.round(full * 10) / 10} ms)`);
    expect(Math.min(...slowdowns), `${name}: a load ran ${Math.min(...slowdowns)}× slower than full speed, so the ${LATENCY.throttle}× throttle missed it (${slowdowns.join(", ")})`).toBeGreaterThanOrEqual(2);
    // The bare app has no budget: it is measured for what React alone costs beside the patterns.
    judge(`${name} first paint`, paints, name === "bare-app" ? undefined : baselines.paint, factor, probe);
    if (chart) judge(`${name} chart drawn`, plots, baselines.plot, factor, probe);
  });
}
