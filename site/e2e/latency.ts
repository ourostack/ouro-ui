import { cpus } from "node:os";
import { expect, test, type Page } from "@playwright/test";

// Click-to-paint latency for the voyage's controls, shared by every *.latency.spec.ts (run alone by
// `pnpm test:latency`, playwright.latency.config.ts, and CI's latency job). Each control is pressed
// LATENCY.warmUps times to warm up (the first press of anything compiles code), then LATENCY.samples
// times on a CPU throttled LATENCY.throttle×. The control passes when its 95th percentile (the 19th of
// 20, so one slow frame on a shared runner is not a failure) is within LATENCY.p95, the hard ceiling
// for every control, and its median is within its own ceiling, set from the median it measures on CI
// (medianCeiling): that catches a fast control that got much slower but stays under 100 ms.
//
// Event Timing reports durations in 8 ms steps, so every sample is a multiple of 8 and a median of
// 20 a multiple of 4: a bound sits between steps or it is really the step below it.
//
// CI's runners differ in speed, from one machine to the next as well as between kinds, and a
// press's time follows the runner's: the same press measured 56 ms on one host and 88 on another.
// But only part of a press scales with the CPU being throttled: the rest, the frame it waits for and
// the compositor that shows it, does not. So each press is judged in two parts, as it would have
// measured on the reference runner, CI's AMD EPYC 7763. The fixed part is this page's own: a press
// that does nearly nothing, pressed the same way before each control (fixedPart). The rest is CPU
// time, divided by this runner's CPU pace (runnerPace): each worker presses a frozen reference page at
// LATENCY.throttle and twice it, and how much longer it took at the higher one is its CPU time, which
// over the reference runner's (LATENCY.referenceCpu) is the pace. On a runner of the reference
// runner's pace a sample stays exactly as measured; a control that does more work is as much slower
// on every runner; and a fast runner's quick CPU doesn't inflate the frames it waited for. The budget,
// the samples and the ceilings are the same on every runner, and each test logs its raw p95, the
// pace, the fixed part and the p95 it is judged on (judge).

/** The budget, the number of presses and the throttle every latency spec measures with. */
export const LATENCY = {
  /** The 95th percentile of the counted presses, in ms: the nearest-rank one, the 19th of 20. */
  p95: 100,
  /** Presses that count. */
  samples: 20,
  /** Presses before them that don't. */
  warmUps: 2,
  /** How many times slower than the runner the CPU is. */
  throttle: 4,
  /**
   * The reference press's CPU time per unit of throttle, in ms, on the reference runner, CI's AMD
   * EPYC 7763, its most common runner: the median of (8× median - 4× median) / 4 across 7763s
   * (runnerPace).
   */
  referenceCpu: 20,
  /** Presses of the reference page at each of its two throttles, and of the near-empty press. */
  referenceSamples: 20,
  fixedSamples: 10,
} as const;

/**
 * The reference press: a frozen page, which no change to the site or the components touches, whose
 * button restyles and rewrites a long list, so a press costs script, style, layout and paint as a
 * control's press does.
 */
export const REFERENCE_PAGE = `<!doctype html><title>Reference press</title><style>
body { font: 14px/1.4 system-ui, sans-serif; margin: 0 }
.row { display: flex; gap: 8px; padding: 4px 8px; border-bottom: 1px solid #ddd }
.on .row { background: #eef; color: #123; padding-left: 12px }
</style><button id="press">Press</button><div id="list"></div><script>
const list = document.getElementById("list");
list.innerHTML = Array.from({ length: 2000 }, (_, i) => '<div class="row"><span>' + i + '</span><span class="text">Item ' + i + '</span><b>' + ((i * 7919) % 1009) + '</b></div>').join("");
let presses = 0;
document.getElementById("press").addEventListener("click", () => {
  presses++;
  list.classList.toggle("on");
  for (const [i, text] of [...list.querySelectorAll(".text")].entries()) text.textContent = "Item " + i + " (" + presses + ")";
});
</script>`;

/** The median of some samples. */
function median(samples: readonly number[]): number {
  const sorted = samples.toSorted((a, b) => a - b);
  const middle = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(middle)]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** This runner's CPU pace, and the reference press's times it comes from. */
export interface Pace {
  /** How many times the reference runner's CPU time this runner's takes: 1 on the reference runner. */
  pace: number;
  /** The reference press's median at LATENCY.throttle and at twice it, in ms. */
  low: number;
  high: number;
  /** The CPU this runner reports. */
  cpu: string;
}

let pace: Promise<Pace> | undefined;

/**
 * This runner's CPU pace against the reference runner's: how much longer the reference press took
 * here at twice LATENCY.throttle than at LATENCY.throttle (its CPU time per unit of throttle), over
 * LATENCY.referenceCpu. The frames and the compositor cost the same at both throttles, so they drop
 * out. Measured once per worker, in a page of its own, the first time a test measures.
 */
export function runnerPace(page: Page): Promise<Pace> {
  pace ??= (async () => {
    const reference = await page.context().newPage();
    try {
      await reference.setViewportSize({ width: 1440, height: 900 });
      await reference.setContent(REFERENCE_PAGE);
      const press = { press: () => reference.locator("#press").click() };
      const at = async (throttle: number) => median(await pressSamples(reference, "reference press", press, throttle, { samples: LATENCY.referenceSamples }));
      const low = await at(LATENCY.throttle);
      const high = await at(2 * LATENCY.throttle);
      const cpuTime = (high - low) / LATENCY.throttle;
      const cpu = cpus()[0]?.model.trim() ?? "unknown CPU";
      console.log(
        `latency reference press on ${cpu}: median ${low} ms at ${LATENCY.throttle}×, ${high} ms at ${2 * LATENCY.throttle}×: CPU time ${cpuTime.toFixed(1)} ms per unit of throttle, ${LATENCY.referenceCpu} on the reference runner, so this runner's pace is ${(cpuTime / LATENCY.referenceCpu).toFixed(2)}`,
      );
      expect(cpuTime, `the reference press took longer at ${2 * LATENCY.throttle}× than at ${LATENCY.throttle}× (${low} ms, then ${high} ms)`).toBeGreaterThan(0);
      return { pace: cpuTime / LATENCY.referenceCpu, low, high, cpu };
    } finally {
      await reference.close();
    }
  })();
  return pace;
}

/**
 * The part of a press on this page that doesn't scale with the CPU: the median of a press that
 * changes one small box's colour and nothing else, pressed as every control is. Added to the page
 * for these presses and taken away after.
 */
export async function fixedPart(page: Page, throttle: number = LATENCY.throttle): Promise<number> {
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.id = "latency-fixed-part";
    button.textContent = "·";
    button.style.cssText = "position:fixed;right:0;bottom:0;z-index:2147483647;width:24px;height:24px;margin:0;padding:0;border:0;background:#888";
    button.addEventListener("click", () => {
      button.style.background = button.style.background === "rgb(136, 136, 136)" ? "#999" : "#888";
    });
    document.body.append(button);
  });
  try {
    return median(await pressSamples(page, "fixed part", { press: () => page.locator("#latency-fixed-part").click() }, throttle, { samples: LATENCY.fixedSamples }));
  } finally {
    await page.evaluate(() => document.getElementById("latency-fixed-part")?.remove());
  }
}

/** One control's presses. Indexes run from 0, the first warm-up, to warmUps + samples - 1. */
export interface Presses {
  /** Presses the control once. */
  press: (index: number) => Promise<unknown>;
  /** Runs once before the first press, at full speed: what the presses need (an earlier line in the log). */
  prepare?: () => Promise<unknown>;
  /** Runs before a press, at full speed: what that press needs (full tanks before Dive). */
  setUp?: (index: number) => Promise<unknown>;
}

/**
 * The most a control's median may be, in ms, given its baseline: the highest median it measured
 * across recorded CI runs. Twice the baseline, or 24 ms (three Event Timing steps) over it if that is
 * more, so a slower runner passes and a control that got twice as slow does not. Above 100 ms the
 * p95 ceiling already holds the median, so for slower controls this only guards the fast ones.
 */
export function medianCeiling(baseline: number): number {
  return Math.max(2 * baseline, baseline + 24);
}

/** The 95th percentile and the median of a control's samples, and whether they are within budget. */
export function summarise(samples: readonly number[], baseline: number): { p95: number; median: number; within: boolean; report: string } {
  const sorted = samples.toSorted((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
  const middle = median(samples);
  const ceiling = medianCeiling(baseline);
  const within = p95 <= LATENCY.p95 && middle <= ceiling;
  return { p95, median: middle, within, report: `p95 ${p95} ms (≤ ${LATENCY.p95}), median ${middle} ms (≤ ${ceiling}, baseline ${baseline})` };
}

/** A control's presses: as measured on this runner, and as judged, on the reference runner. */
export interface Measured {
  /** Each counted press's click-to-paint time here, in order. */
  raw: number[];
  /** The same presses as on the reference runner (asOnReference). */
  samples: number[];
  /** This runner's pace (runnerPace). */
  runner: Pace;
  /** This page's fixed part, in ms (fixedPart). */
  fixed: number;
}

/**
 * A press's time as on the reference runner: its fixed part, plus the rest over the runner's pace.
 * At pace 1 it is the time as measured, and a time within the fixed part stays as it is.
 */
export function asOnReference(sample: number, fixed: number, pace: number): number {
  return sample <= fixed ? sample : Math.round((fixed + (sample - fixed) / pace) * 10) / 10;
}

/**
 * Presses a control warmUps + samples times on a throttled CPU (pressSamples), after measuring this
 * page's fixed part (fixedPart) and, once per worker, this runner's pace (runnerPace).
 */
export async function measure(page: Page, label: string, presses: Presses, throttle: number = LATENCY.throttle): Promise<Measured> {
  const runner = await runnerPace(page);
  const fixed = await fixedPart(page, throttle);
  const raw = await pressSamples(page, label, presses, throttle);
  return { raw, samples: raw.map((sample) => asOnReference(sample, fixed, runner.pace)), runner, fixed };
}

/**
 * Presses a control warmUps + samples times on a throttled CPU and returns each counted press's
 * click-to-paint time in ms. Event Timing reports nothing under 16 ms (its durationThreshold floor),
 * so a press with no entry counts as 16 ms, if the browser's interaction count says it happened; a
 * press with neither is a broken measurement, and fails. Setting up a press runs at full speed, and
 * so does its tail (the porthole's repaint after the press), so a press is measured from a settled page, as
 * a person's would be a beat later.
 */
export async function pressSamples(
  page: Page,
  label: string,
  { press, prepare, setUp }: Presses,
  throttle: number = LATENCY.throttle,
  { first = 0, warmUps = LATENCY.warmUps, samples: count = LATENCY.samples }: { first?: number; warmUps?: number; samples?: number } = {},
): Promise<number[]> {
  await page.evaluate(() => {
    const store: number[] = [];
    (window as unknown as { __latency: number[] }).__latency = store;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) if (entry.interactionId) store.push(entry.duration);
    }).observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
  });
  const cdp = await page.context().newCDPSession(page);
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))));
  const unthrottled = async (work: () => Promise<unknown>) => {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await work();
    await settle();
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  };
  /** How many interactions the page has had (Event Timing's count, which has no duration floor). */
  const interactions = () => page.evaluate(() => (performance as Performance & { interactionCount: number }).interactionCount);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  if (prepare && first === 0) await unthrottled(prepare);
  const samples: number[] = [];
  for (let index = first; index < first + warmUps + count; index++) {
    if (setUp) await unthrottled(() => setUp(index));
    await page.evaluate(() => ((window as unknown as { __latency: number[] }).__latency.length = 0));
    const before = await interactions();
    await press(index);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))));
    const durations = await page.evaluate(() => (window as unknown as { __latency: number[] }).__latency);
    const pressed = (await interactions()) > before;
    expect(durations.length > 0 || pressed, `${label}, press ${index}: the press happened and Event Timing saw it or it was under 16 ms`).toBe(true);
    if (index >= first + warmUps) samples.push(durations.length > 0 ? Math.max(...durations) : 16);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return samples;
}

/**
 * Holds a control's samples, as on the reference runner, to the budget and its baseline's median
 * ceiling, logging how each was judged: the raw p95 and median, the runner's pace, the fixed part,
 * the p95 and median judged and their bounds, and every sample both ways, pass or fail.
 */
export function expectWithinBudget(label: string, { raw, samples, runner, fixed }: Measured, baseline: number): void {
  const measured = summarise(raw, baseline);
  const judged = summarise(samples, baseline);
  const report = [
    `${judged.within ? "within budget" : "OVER BUDGET"}: judged ${judged.report}`,
    `raw p95 ${measured.p95} ms, median ${measured.median} ms`,
    `runner pace ${runner.pace.toFixed(2)} (${runner.cpu}; reference press ${runner.low} ms at ${LATENCY.throttle}×, ${runner.high} ms at ${2 * LATENCY.throttle}×)`,
    `fixed part ${fixed} ms`,
    `raw samples in order: ${raw.join(", ")}`,
    `judged: ${samples.join(", ")}`,
  ].join("; ");
  test.info().annotations.push({ type: "latency", description: `${label}: ${report}` });
  console.log(`latency ${label}: ${report}`);
  expect(judged.p95, `${label} ${report}`).toBeLessThanOrEqual(LATENCY.p95);
  expect(judged.median, `${label} ${report}`).toBeLessThanOrEqual(medianCeiling(baseline));
}
