import { expect, test, type Page } from "@playwright/test";

// Click-to-paint latency for the voyage's controls, shared by every *.latency.spec.ts (run alone by
// `pnpm test:latency`, playwright.latency.config.ts, and CI's latency job). Each control is pressed
// LATENCY.warmUps times to warm up (the first press of anything compiles code; LATENCY.firstWarmUps for a worker's
// first control, which warms the browser too), then LATENCY.samples
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
//
// Before a control's presses, measure() also logs its runner's speed at full CPU speed (runnerSpeed), so
// a slow runner shows in the log beside its latency.
//
// A shared runner is sometimes slow all over: every control on it slower together, the time going to the wait for the
// next paint (ourostack/ouro-ui#798). So beside each control, at the same throttle, measure() presses a calibration
// probe of its own (openProbe), in a page of its own with none of the app's code, pressed before the control's presses and after
// them. Its median over a quiet runner's (LATENCY.probeQuiet) is the runner's factor (runnerFactor), at least 1 and at
// most LATENCY.maxFactor, and the control's p95 bound and median ceiling are each times it. A quiet runner's factor is
// 1, so its bounds are the ones above; a slow app is as slow beside the probe on any runner, so it still fails.

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
  /**
   * Presses that don't count before the first control a latency run's worker measures. That browser's first presses
   * pay for warming caches every later page shares: on CI, a shard's first control read 80 to 96 ms for its first presses
   * and then settled near 56 (#749), while later controls, each on a fresh page, started where they settled.
   */
  firstWarmUps: 10,
  /** How many times slower than the runner the CPU is. */
  throttle: 4,
  /**
   * The calibration probe's median on a quiet CI runner, in ms: the most it read on runners with nothing beside them
   * (48 to 64 ms, ourostack/ouro-ui#798), so a quiet runner keeps the bounds as they are.
   */
  probeQuiet: 64,
  /** The most a slow runner's factor stretches the bounds: a runner slower than this is still judged at this. */
  maxFactor: 1.5,
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

/**
 * How much slower the runner is than a quiet one, from the calibration probe's presses beside a control: the probe's
 * median over LATENCY.probeQuiet, at least 1 and at most LATENCY.maxFactor. The probe is page work of its own, so it
 * slows with the runner and never with the app.
 */
export function runnerFactor(probe: readonly number[]): number {
  return Math.round(Math.min(LATENCY.maxFactor, Math.max(1, median(probe) / LATENCY.probeQuiet)) * 100) / 100;
}

/**
 * The 95th percentile and the median of a control's samples, and whether they are within budget: LATENCY.p95 and the
 * median's ceiling, each times the runner's factor (runnerFactor), so a runner the probe measured slower is not
 * taken for a slower app. A quiet runner's factor is 1.
 */
export function summarise(samples: readonly number[], baseline: number, factor = 1): { p95: number; median: number; within: boolean; report: string } {
  const sorted = samples.toSorted((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
  const middle = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(middle)]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const bound = LATENCY.p95 * factor;
  const ceiling = medianCeiling(baseline) * factor;
  const within = p95 <= bound && median <= ceiling;
  const runner = factor > 1 ? `; the runner measured ${factor}× slower than a quiet one, so the bounds are ${factor}× theirs` : "";
  return { p95, median, within, report: `p95 ${p95} ms (≤ ${bound}), median ${median} ms (≤ ${ceiling}, baseline ${baseline})${runner}; samples in order: ${samples.join(", ")}` };
}

/**
 * Whether a control's first LATENCY.samples presses, judged over budget, are pressed LATENCY.more times more: only
 * when the p95 alone failed, with as many presses over LATENCY.p95 as the p95 of all of them allows (two of 40), and
 * the median within its ceiling. A slow press or two cannot move a median, so a median over its ceiling fails at
 * once, and so do three or more presses over 100 ms.
 */
export function morePresses(samples: readonly number[], baseline: number, factor = 1): boolean {
  const { within, median } = summarise(samples, baseline, factor);
  if (samples.length !== LATENCY.samples || within) return false;
  const all = LATENCY.samples + LATENCY.more;
  return median <= medianCeiling(baseline) * factor && samples.filter((sample) => sample > LATENCY.p95 * factor).length <= all - Math.ceil(all * 0.95);
}

/**
 * How fast the runner is, measured in the page at full CPU speed: the time a fixed integer loop takes (script, ms)
 * and the median gap between animation frames while the page is idle (frame, ms). A run's latency numbers only
 * mean something beside its runner's speed, since a runner that is slow everywhere makes every press slow, so
 * each control logs this before its presses.
 */
export async function runnerSpeed(page: Page): Promise<{ script: number; frame: number }> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const started = performance.now();
        let hash = 0;
        for (let i = 0; i < 5_000_000; i++) hash = Math.imul(hash ^ i, 2654435761) >>> 0;
        // Kept on the window so the loop's result is used and the engine cannot drop the loop.
        (window as unknown as { __runnerHash: number }).__runnerHash = hash;
        const script = performance.now() - started;
        const stamps: number[] = [];
        const tick = (time: number) => {
          stamps.push(time);
          if (stamps.length < 21) return requestAnimationFrame(tick);
          const gaps = stamps.slice(1).map((stamp, index) => stamp - stamps[index]!).toSorted((a, b) => a - b);
          const median = (gaps[9]! + gaps[10]!) / 2;
          resolve({ script: Math.round(script * 10) / 10, frame: Math.round(median * 10) / 10 });
        };
        requestAnimationFrame(tick);
      }),
  );
}

/** How many times the calibration probe is pressed before a control's presses and after them; the first of each is a warm-up. */
export const PROBE_PRESSES = 4;

/**
 * Opens the calibration probe in a page of its own, beside the app's, with none of the app's code: a fixed panel of 480
 * boxes and a button whose press restyles every box and changes their size, so it costs style, layout, paint and
 * raster as a control's press does. Its own page means an app-wide slowdown (a global listener, a provider's render, a
 * stylesheet) never slows the probe, so it can't raise the factor and hide a regression. It has its own Event Timing
 * observer, as the app's page has.
 */
async function openProbe(page: Page): Promise<Page> {
  const probe = await page.context().newPage();
  await probe.setContent("<!doctype html><title>latency probe</title><body style='margin:0'></body>");
  await probe.evaluate(() => {
    const store: number[][] = [];
    (window as unknown as { __latency: number[][] }).__latency = store;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) if (entry.interactionId) store.push([entry.duration]);
    }).observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
    const panel = document.createElement("div");
    panel.style.cssText = "position:fixed;inset-block-start:0;inset-inline-start:0;inline-size:600px;block-size:420px;display:flex;flex-wrap:wrap;align-content:flex-start;gap:2px;padding:4px;background:#fff;overflow:hidden;contain:strict";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "probe";
    button.setAttribute("data-latency-probe-press", "");
    button.style.cssText = "inline-size:60px;block-size:24px";
    panel.append(button);
    for (let i = 0; i < 480; i++) {
      const box = document.createElement("span");
      box.textContent = `item ${i}`;
      box.style.cssText = `padding:2px 4px;border-radius:6px;font:12px system-ui;background:linear-gradient(90deg,hsl(${i % 360} 70% 80%),hsl(${(i * 7) % 360} 70% 70%));box-shadow:0 1px 2px #0003`;
      panel.append(box);
    }
    let flipped = false;
    button.addEventListener("click", () => {
      flipped = !flipped;
      for (const box of panel.querySelectorAll<HTMLElement>("span")) {
        box.style.fontSize = flipped ? "13px" : "12px";
        box.style.filter = flipped ? "hue-rotate(40deg)" : "none";
      }
    });
    document.body.append(panel);
  });
  return probe;
}

/** The median of a list of numbers. */
function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(middle)]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Presses a control warmUps + samples times on a throttled CPU and returns each counted press's
 * click-to-paint time in ms, LATENCY.more presses more when `more` says so of the first samples (morePresses). Event Timing reports nothing under 16 ms (its durationThreshold floor),
 * so a press with no entry counts as 16 ms, if the browser's interaction count says it happened; a
 * press with neither is a broken measurement, and fails. Setting up a press runs at full speed, and
 * so does its tail (the porthole's repaint after the press), and the page then settles again at the
 * throttle before the press, so a press is measured from a settled page, as a person's would be a beat later.
 */
/** Whether this worker's browser has measured a control yet (LATENCY.firstWarmUps). */
let browserWarmed = false;

export async function measure(
  page: Page,
  label: string,
  { press, prepare, setUp }: Presses,
  throttle: number = LATENCY.throttle,
  more?: (samples: readonly number[], factor: number) => boolean,
): Promise<{ samples: number[]; probe: number[]; factor: number }> {
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
  // A new CDP session starts at full speed, so the probe runs before the throttle is set.
  const speed = await runnerSpeed(page);
  test.info().annotations.push({ type: "latency-runner", description: `${label}: script ${speed.script} ms, frame ${speed.frame} ms (full speed)` });
  console.log(`latency-runner ${label}: script ${speed.script} ms, frame ${speed.frame} ms (full speed)`);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  if (prepare) await unthrottled(prepare);
  // The calibration probe's presses, at the same throttle as the control's: the first of each round is a warm-up.
  const probeRound = async (): Promise<number[]> => {
    const probe = await openProbe(page);
    const durations: number[] = [];
    try {
      const probeCdp = await page.context().newCDPSession(probe);
      await probeCdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
      const settleProbe = () => probe.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))));
      for (let index = 0; index < PROBE_PRESSES; index++) {
        await probe.evaluate(() => ((window as unknown as { __latency: unknown[] }).__latency.length = 0));
        await settleProbe();
        await probe.locator("[data-latency-probe-press]").click();
        await probe.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))));
        const entries = await probe.evaluate(() => (window as unknown as { __latency: number[][] }).__latency);
        if (index > 0) durations.push(entries.length > 0 ? Math.max(...entries.map(([duration]) => duration!)) : 16);
      }
    } finally {
      await probe.close();
    }
    await page.bringToFront();
    await settle();
    return durations;
  };
  const probeBefore = await probeRound();
  const samples: number[] = [];
  // Only the latency run's own projects: the rules spec's slow pages count presses by index from the usual warm-ups.
  const warmUps = !browserWarmed && test.info().project.name.startsWith("site-latency") ? LATENCY.firstWarmUps : LATENCY.warmUps;
  browserWarmed = true;
  let presses = warmUps + LATENCY.samples;
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
    if (index >= warmUps) {
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
    if (samples.length === LATENCY.samples && presses === warmUps + LATENCY.samples && more?.(samples, runnerFactor(probeBefore))) {
      presses += LATENCY.more;
      test.info().annotations.push({ type: "latency-more", description: `${label}: ${LATENCY.more} presses more after the first ${LATENCY.samples}: ${samples.join(", ")}` });
    }
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  }
  const probeAfter = await probeRound();
  const probe = [...probeBefore, ...probeAfter];
  const factor = runnerFactor(probe);
  const line = `${label}: median ${median(probe)} ms (quiet ${LATENCY.probeQuiet}), factor ${factor}; before ${probeBefore.join(", ")}; after ${probeAfter.join(", ")}`;
  test.info().annotations.push({ type: "latency-probe", description: line });
  console.log(`latency-probe ${line}`);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return { samples, probe, factor };
}

/** Holds a control's samples to the budget and its baseline's median ceiling, each times the runner's factor, reporting every sample, pass or fail. */
export function expectWithinBudget(label: string, samples: readonly number[], baseline: number, factor = 1): void {
  const { p95, median, report } = summarise(samples, baseline, factor);
  test.info().annotations.push({ type: "latency", description: `${label}: ${report}` });
  console.log(`latency ${label}: ${report}`);
  expect(p95, `${label} ${report}`).toBeLessThanOrEqual(LATENCY.p95 * factor);
  expect(median, `${label} ${report}`).toBeLessThanOrEqual(medianCeiling(baseline) * factor);
}

/** Measures a control (with LATENCY.more presses more when its first samples call for them) and holds it to the budget, at the runner's factor. */
export async function expectPressesWithinBudget(page: Page, label: string, presses: Presses, baseline: number): Promise<void> {
  const { samples, factor } = await measure(page, label, presses, LATENCY.throttle, (first, before) => morePresses(first, baseline, before));
  expectWithinBudget(label, samples, baseline, factor);
}
