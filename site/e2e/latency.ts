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
} as const;

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
  const middle = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(middle)]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const ceiling = medianCeiling(baseline);
  const within = p95 <= LATENCY.p95 && median <= ceiling;
  return { p95, median, within, report: `p95 ${p95} ms (≤ ${LATENCY.p95}), median ${median} ms (≤ ${ceiling}, baseline ${baseline}); samples in order: ${samples.join(", ")}` };
}

/**
 * Presses a control warmUps + samples times on a throttled CPU and returns each counted press's
 * click-to-paint time in ms. Event Timing reports nothing under 16 ms (its durationThreshold floor),
 * so a press with no entry counts as 16 ms, if the browser's interaction count says it happened; a
 * press with neither is a broken measurement, and fails. Setting up a press runs at full speed, and
 * so does its tail (the porthole's repaint after the press), so a press is measured from a settled page, as
 * a person's would be a beat later.
 */
export async function measure(page: Page, label: string, { press, prepare, setUp }: Presses, throttle: number = LATENCY.throttle): Promise<number[]> {
  // PROBE (never merge): a style sheet from PROBE_CSS.
  if (process.env["PROBE_CSS"]) {
    await page.addStyleTag({ content: process.env["PROBE_CSS"] });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 200)))));
  }
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
  if (prepare) await unthrottled(prepare);
  const samples: number[] = [];
  for (let index = 0; index < LATENCY.warmUps + LATENCY.samples; index++) {
    if (setUp) await unthrottled(() => setUp(index));
    await page.evaluate(() => ((window as unknown as { __latency: number[] }).__latency.length = 0));
    const before = await interactions();
    await press(index);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))));
    const durations = await page.evaluate(() => (window as unknown as { __latency: number[] }).__latency);
    const pressed = (await interactions()) > before;
    expect(durations.length > 0 || pressed, `${label}, press ${index}: the press happened and Event Timing saw it or it was under 16 ms`).toBe(true);
    if (index >= LATENCY.warmUps) samples.push(durations.length > 0 ? Math.max(...durations) : 16);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return samples;
}

/** Holds a control's samples to the budget and its baseline's median ceiling, reporting every sample, pass or fail. */
export function expectWithinBudget(label: string, samples: readonly number[], baseline: number): void {
  const { p95, median, report } = summarise(samples, baseline);
  test.info().annotations.push({ type: "latency", description: `${label}: ${report}` });
  console.log(`latency ${label}: ${report}`);
  expect(p95, `${label} ${report}`).toBeLessThanOrEqual(LATENCY.p95);
  expect(median, `${label} ${report}`).toBeLessThanOrEqual(medianCeiling(baseline));
}
