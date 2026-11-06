import { appendFileSync, readFileSync } from "node:fs";
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
// The throttle slows the page relative to the runner, so a slower runner makes every press slower
// (#651). Before each control's presses, a fixed piece of main-thread work is timed on the same
// throttled CPU (calibrate); with a reference for a typical runner, each sample is divided by how much
// slower or faster this runner is than that before it is held to the budget (normalise). That evens out
// a whole run on a slow or fast runner. It does not hide a stall in one press: the calibration runs
// before the presses, so a press that stalls on a runner of typical speed still counts in full.

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

/** The runner's speed, from a fixed piece of main-thread work timed on the throttled CPU before each control's presses. */
export const CALIBRATION: {
  /** The median calibration on a typical CI runner, in ms; null until it is set from CI runs, when samples count as measured. */
  readonly reference: number | null;
  /** Runs before the timed ones, so V8 has optimised the work before it is timed. */
  readonly warmUps: number;
  /** Timed runs; their median is the calibration. */
  readonly runs: number;
} = { reference: null, warmUps: 5, runs: 9 };

/** A control's calibration: its median in ms, and how many times slower than the reference runner this one is (1 without a reference). */
export interface Calibration {
  ms: number;
  factor: number;
}

const calibrations = new Map<string, Calibration>();

/** How many times slower than the reference runner a calibration says this one is: 1 without a reference. */
export function speedFactor(ms: number, reference: number | null = CALIBRATION.reference): number {
  return reference === null ? 1 : ms / reference;
}

/** Samples as a run on the reference runner would have measured them: each divided by the runner's factor. */
export function normalise(samples: readonly number[], factor: number): number[] {
  return samples.map((sample) => Math.round((sample / factor) * 10) / 10);
}

/**
 * Times a fixed piece of main-thread work (arithmetic, then laying out 300 lines off screen) on the CPU as it is
 * throttled now: CALIBRATION.warmUps untimed runs so V8 has optimised it, then the median of CALIBRATION.runs.
 */
async function calibrate(page: Page): Promise<number> {
  const timed: number[] = [];
  for (let run = 0; run < CALIBRATION.warmUps + CALIBRATION.runs; run++) {
    const ms = await page.evaluate(() => {
      const start = performance.now();
      let value = 0;
      for (let step = 0; step < 3_000_000; step++) value = (value * 31 + step) | 0;
      const box = document.createElement("div");
      box.style.cssText = "position:absolute;left:-9999px;top:0;width:320px";
      for (let line = 0; line < 300; line++) {
        const paragraph = document.createElement("p");
        paragraph.textContent = `calibration line ${line} ${value & 7}`;
        box.append(paragraph);
      }
      document.body.append(box);
      void box.offsetHeight;
      box.remove();
      return performance.now() - start;
    });
    if (run >= CALIBRATION.warmUps) timed.push(ms);
  }
  return timed.toSorted((a, b) => a - b)[Math.floor(timed.length / 2)]!;
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
  const ms = await calibrate(page);
  calibrations.set(label, { ms, factor: speedFactor(ms) });
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

/** Writes one control's calibration and result to the job's summary on CI, under one heading per run. */
function summarize(line: string): void {
  const file = process.env["GITHUB_STEP_SUMMARY"];
  if (!file) return;
  const heading = "### Latency, by the runner's speed";
  let written = "";
  try {
    written = readFileSync(file, "utf8");
  } catch {
    // No summary yet.
  }
  if (!written.includes(heading)) {
    appendFileSync(
      file,
      `${heading}\n\nCalibration reference: ${CALIBRATION.reference === null ? "not set, so samples count as measured" : `${CALIBRATION.reference} ms`}.\n\n| Control | Calibration | Factor | Measured p95 / median | Held to budget p95 / median | Within |\n| --- | --- | --- | --- | --- | --- |\n`,
    );
  }
  appendFileSync(file, `${line}\n`);
}

/**
 * Holds a control's samples to the budget and its baseline's median ceiling, reporting every sample, pass or fail:
 * the samples as measured, normalised by the runner's speed when there is a reference (see CALIBRATION).
 */
export function expectWithinBudget(label: string, samples: readonly number[], baseline: number): void {
  const calibration = calibrations.get(label) ?? { ms: Number.NaN, factor: 1 };
  const held = normalise(samples, calibration.factor);
  const measured = summarise(samples, baseline);
  const { p95, median, within, report } = summarise(held, baseline);
  const speed = `calibration ${calibration.ms.toFixed(1)} ms, factor ${calibration.factor.toFixed(2)}`;
  const full = calibration.factor === 1 ? `${report}; ${speed}` : `${report}; ${speed}; as measured: ${measured.report}`;
  test.info().annotations.push({ type: "latency", description: `${label}: ${full}` });
  console.log(`latency ${label}: ${full}`);
  summarize(`| ${label} | ${calibration.ms.toFixed(1)} ms | ${calibration.factor.toFixed(2)} | ${measured.p95} / ${measured.median} ms | ${p95} / ${median} ms | ${within ? "yes" : "no"} |`);
  expect(p95, `${label} ${full}`).toBeLessThanOrEqual(LATENCY.p95);
  expect(median, `${label} ${full}`).toBeLessThanOrEqual(medianCeiling(baseline));
}
