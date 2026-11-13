import { expect, test, type Page } from "@playwright/test";

// Click-to-paint latency for the voyage's controls, shared by every *.latency.spec.ts (run alone by
// `pnpm test:latency`, playwright.latency.config.ts, and CI's latency job). Each control is pressed
// LATENCY.warmUps times to warm up (the first press of anything compiles code), then LATENCY.samples
// times on a CPU throttled LATENCY.throttle×. The control passes when its 95th percentile (the 19th of
// 20, so one slow frame on a shared runner is not a failure) is within LATENCY.p95, the hard ceiling
// for every control, and its median is within its own ceiling, set from the median it measures on CI
// (medianCeiling): that catches a fast control that got much slower but stays under 100 ms.
//
// When those 20 fail on the p95 alone and could still be within it with more presses (morePresses), the
// control is pressed LATENCY.more times more, once, on the same page, and the same budget judges all
// 40: the p95 is then the 38th, so at most two of 40 may be over 100 ms, the same one in twenty. Every
// press counts, the first 20 too, and no take is chosen over another. On CI's runners about one press in
// a hundred takes half again as long as its control's median or more: the same work, slower in every part
// of the frame (script, style, layout, paint), while the browser was never stopped, no other thread held
// its main thread off the CPU, and garbage collection was in 2 of 57 (the probes, posted on ourostack/ouro-ui#463). Nothing
// we could measure from the page told those presses from a press the page made slow, so none is excused:
// two of them in 20 decided the p95 of controls whose other 18 sat well within it, and with 40 presses
// the p95 is the control's, not theirs.
//
// Event Timing reports durations in 8 ms steps, so every sample is a multiple of 8 and a median of
// 20 a multiple of 4: a bound sits between steps or it is really the step below it.

/** The budget, the number of presses and the throttle every latency spec measures with. */
export const LATENCY = {
  /** The 95th percentile of the counted presses, in ms: the nearest-rank one, the 19th of 20 (the 38th of 40). */
  p95: 100,
  /** Presses that count. */
  samples: 20,
  /** Presses that count added, once, when the first `samples` fail on the p95 alone and could be within it with them (morePresses). */
  more: 20,
  /** Presses before them that don't. */
  warmUps: 2,
  /** How many times slower than the runner the CPU is. */
  throttle: 4,
} as const;

/** One control's presses. Indexes run from 0, the first warm-up, to warmUps + samples - 1, or warmUps + samples + more - 1 when 20 more are pressed. */
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

/** Where a press's time went, from its Event Timing entry: waiting for the page's thread, its handlers, and the wait for the next paint (ms). The duration is rounded to 8 ms and the other times are not, so the last part is accurate to within that rounding. */
export function splitPress(entry: { startTime: number; processingStart: number; processingEnd: number; duration: number }): { inputDelay: number; processing: number; presentation: number } {
  const inputDelay = Math.round(entry.processingStart - entry.startTime);
  const processing = Math.round(entry.processingEnd - entry.processingStart);
  return { inputDelay, processing, presentation: Math.round(entry.duration) - inputDelay - processing };
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
 * Whether a control's first LATENCY.samples presses, judged over budget, are pressed LATENCY.more times more: only
 * when the p95 alone failed, with as many presses over LATENCY.p95 as the p95 of all of them allows (two of 40), and
 * the median within its ceiling. A slow press or two cannot move a median, so a median over its ceiling fails at
 * once, and so do three or more presses over 100 ms.
 */
export function morePresses(samples: readonly number[], baseline: number): boolean {
  const { within, median } = summarise(samples, baseline);
  if (samples.length !== LATENCY.samples || within) return false;
  const all = LATENCY.samples + LATENCY.more;
  return median <= medianCeiling(baseline) && samples.filter((sample) => sample > LATENCY.p95).length <= all - Math.ceil(all * 0.95);
}

/**
 * Presses a control warmUps + samples times on a throttled CPU and returns each counted press's
 * click-to-paint time in ms, LATENCY.more presses more when `more` says so of the first samples (morePresses). Event Timing reports nothing under 16 ms (its durationThreshold floor),
 * so a press with no entry counts as 16 ms, if the browser's interaction count says it happened; a
 * press with neither is a broken measurement, and fails. Setting up a press runs at full speed, and
 * so does its tail (the porthole's repaint after the press), and the page then settles again at the
 * throttle before the press, so a press is measured from a settled page, as a person's would be a beat later.
 */
export async function measure(page: Page, label: string, { press, prepare, setUp }: Presses, throttle: number = LATENCY.throttle, more?: (samples: readonly number[]) => boolean): Promise<number[]> {
  await page.evaluate(() => {
    const store: Array<[number, number, number, number, string]> = [];
    (window as unknown as { __latency: typeof store }).__latency = store;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) if (entry.interactionId) store.push([entry.duration, entry.startTime, entry.processingStart, entry.processingEnd, entry.name]);
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
  let presses = LATENCY.warmUps + LATENCY.samples;
  for (let index = 0; index < presses; index++) {
    if (setUp) await unthrottled(() => setUp(index));
    await page.evaluate(() => ((window as unknown as { __latency: unknown[] }).__latency.length = 0));
    // The press starts from a page settled at the throttle too: the set-up's settle ran at full speed, so
    // whatever still runs once the throttle is back ends before the press, as it would before a person's
    // press a beat later, rather than becoming the press's input delay.
    await settle();
    const before = await interactions();
    await press(index);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))));
    const entries = await page.evaluate(() => (window as unknown as { __latency: Array<[number, number, number, number, string]> }).__latency);
    const durations = entries.map(([duration]) => duration);
    const pressed = (await interactions()) > before;
    expect(durations.length > 0 || pressed, `${label}, press ${index}: the press happened and Event Timing saw it or it was under 16 ms`).toBe(true);
    if (index >= LATENCY.warmUps) {
      samples.push(durations.length > 0 ? Math.max(...durations) : 16);
      // Where an over-budget press's time went, so the next failure says whether it was the page's thread or the wait for the paint.
      const slowest = entries.find(([duration]) => duration === Math.max(...durations));
      if (slowest && slowest[0] > LATENCY.p95) {
        // Event Timing gives a press's later entries (pointerup, click) its first event's start (pointerdown's), so their input delay runs from pointerdown.
        const { inputDelay, processing, presentation } = splitPress({ duration: slowest[0], startTime: slowest[1], processingStart: slowest[2], processingEnd: slowest[3] });
        const split = `${label}, press ${index}: ${slowest[0]} ms = ${inputDelay} ms input delay + ${processing} ms handlers + ${presentation} ms to the next paint (${slowest[4]} entry)`;
        test.info().annotations.push({ type: "latency-slow", description: split });
        console.log(`latency-slow ${split}`);
      }
    }
    if (samples.length === LATENCY.samples && presses === LATENCY.warmUps + LATENCY.samples && more?.(samples)) {
      presses += LATENCY.more;
      test.info().annotations.push({ type: "latency-more", description: `${label}: ${LATENCY.more} presses more after the first ${LATENCY.samples}: ${samples.join(", ")}` });
    }
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

/** Measures a control (with LATENCY.more presses more when its first samples call for them) and holds it to the budget. */
export async function expectPressesWithinBudget(page: Page, label: string, presses: Presses, baseline: number): Promise<void> {
  expectWithinBudget(label, await measure(page, label, presses, LATENCY.throttle, (samples) => morePresses(samples, baseline)), baseline);
}
