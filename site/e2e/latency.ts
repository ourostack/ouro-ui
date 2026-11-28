import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { expect, test, type CDPSession, type Page } from "@playwright/test";

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
// probe of its own (openProbe), in a page of its own with none of the app's code, pressed before the control's presses, halfway
// through them and after them. Its median over a quiet runner's (LATENCY.probeQuiet) is the runner's factor (runnerFactor), at least 1 and at
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
   * The calibration probe's median on a quiet CI runner, in ms, measured from main's own runs: the median of the probe's
   * medians over the latency shards of the last 20 completed push runs of ci.yml on main, which the probe's logs name
   * beside each control. Each run's value is the median of its own probe medians (the probes of its three shards), and this
   * is the median of those values, rounded to a whole ms. Recompute it with `node scripts/latency-quiet.mjs --runs 20`
   * (it reads the runs' logs through the GitHub API and needs GH_TOKEN; it writes nothing). Derived on 2026-11-18 (UTC) from runs
   * 44241837744 (#8083) to 44260827968 (#8156); two of the 20 ran no latency shards, so 18 runs set it:
   *
   * ```text
   * latency-quiet: ourostack/ouro-ui, the last 20 completed push runs of ci.yml on main (created 2026-11-18 to 2026-11-18)
   *   run 44260827968 (#8156, 6bba3a89): median 48 ms over 50 probes in 3 latency shard(s)
   *   run 44257987022 (#8151, c15d2274): median 52 ms over 50 probes in 3 latency shard(s)
   *   run 44257200298 (#8150, ac63b302): median 48 ms over 50 probes in 3 latency shard(s)
   *   run 44256311973 (#8145, 37d6c55f): median 60 ms over 50 probes in 3 latency shard(s)
   *   run 44255988195 (#8144, bb9f2e89): median 56 ms over 50 probes in 3 latency shard(s)
   *   run 44255061326 (#8141, 17d5d294): median 48 ms over 50 probes in 3 latency shard(s)
   *   run 44253970660 (#8136, 83d7ba6a): median 60 ms over 50 probes in 3 latency shard(s)
   *   run 44252753013 (#8127, 40a54ca6): median 56 ms over 50 probes in 3 latency shard(s)
   *   run 44252511046 (#8124, 0baf94f9): no latency probe in 0 latency shard(s)
   *   run 44250906634 (#8116, 94005473): median 40 ms over 50 probes in 3 latency shard(s)
   *   run 44249972375 (#8113, 0d07c5c8): median 52 ms over 50 probes in 3 latency shard(s)
   *   run 44249006839 (#8108, 17b513a9): median 56 ms over 50 probes in 3 latency shard(s)
   *   run 44248270281 (#8106, 2995ef02): median 48 ms over 50 probes in 3 latency shard(s)
   *   run 44246645376 (#8101, 8f1d7ebc): median 68 ms over 50 probes in 3 latency shard(s)
   *   run 44245991720 (#8097, 7b780919): median 48 ms over 50 probes in 3 latency shard(s)
   *   run 44244785743 (#8093, e7785d0b): median 48 ms over 50 probes in 3 latency shard(s)
   *   run 44244684049 (#8092, 17773151): median 68 ms over 50 probes in 3 latency shard(s)
   *   run 44243584246 (#8089, 9b851026): median 64 ms over 50 probes in 3 latency shard(s)
   *   run 44242303928 (#8085, d9761771): median 32 ms over 50 probes in 3 latency shard(s)
   *   run 44241837744 (#8083, b196df39): no latency probe in 0 latency shard(s)
   *   quiet median: 52 ms, the median of 18 runs' medians (probeQuiet)
   * ```
   *
   * A runner whose probe reads at or under this keeps the bounds as they are; a slower one is stretched by its factor
   * (runnerFactor), up to LATENCY.maxFactor. Of the 18 runs, 8 read over 52 ms, and their factors run from 1.08 to 1.31.
   */
  probeQuiet: 52,
  /** The most a slow runner's factor stretches the bounds: a runner slower than this is still judged at this. */
  maxFactor: 1.5,
  /**
   * Measurements in all of a control whose probe reads the runner past the cap: the runner's load is a precondition of
   * judging it, so a loaded runner is waited on and the control measured again, never judged on the reading alone
   * (ourostack/ouro-ui#2142). Each re-measure is logged and counted in the job's summary, and a control still past the
   * cap after these fails as too loaded to judge. A steady reading (steadySlow) stops the re-measuring after the first
   * re-measure instead: the runner is slow, not loaded, so the control is judged at maxFactor, and only a miss there
   * fails, as too slow to judge (ourostack/ouro-ui#2114).
   */
  loadTries: 3,
  /**
   * How long a runner past the cap is given before the control is measured again, in ms. The wait comes before the first
   * re-measure whatever the reads, since steadiness is known only from them; a steady reading gets no second wait.
   */
  loadWaitMs: 10_000,
} as const;

/** The host's CPU time since boot, in clock ticks, from the first line of Linux's /proc/stat: all of it, the part not idle, and the part stolen by the hypervisor. */
export interface HostTicks {
  total: number;
  busy: number;
  steal: number;
}

/**
 * Reads the host's CPU ticks from /proc/stat's text (`cpu user nice system idle iowait irq softirq steal …`), or null when
 * the text has no `cpu` line. Idle and iowait count as not busy; everything else, steal included, as busy.
 */
export function hostTicks(stat: string): HostTicks | null {
  const line = stat.split("\n").find((row) => row.startsWith("cpu "));
  if (!line) return null;
  const fields = line.trim().split(/\s+/).slice(1).map(Number);
  const total = fields.reduce((sum, value) => sum + value, 0);
  return { total, busy: total - (fields[3] ?? 0) - (fields[4] ?? 0), steal: fields[7] ?? 0 };
}

/**
 * How busy the host's CPUs were between two reads, as whole percentages of all of them: busy and stolen. Null when either
 * read is missing (not Linux) or no tick passed. A press that answered slowly while the host was busy with something
 * other than the press measures the runner, not the page (ourostack/ouro-ui#2114).
 */
export function hostBusy(before: HostTicks | null, after: HostTicks | null): { busy: number; steal: number } | null {
  if (!before || !after || after.total <= before.total) return null;
  const total = after.total - before.total;
  return { busy: Math.round(((after.busy - before.busy) / total) * 100), steal: Math.round(((after.steal - before.steal) / total) * 100) };
}

/** The host's CPU ticks now, on Linux; null elsewhere. */
function readHostTicks(): HostTicks | null {
  return existsSync("/proc/stat") ? hostTicks(readFileSync("/proc/stat", "utf8")) : null;
}

/** Event Timing's duration step, in ms: every duration it reports is a multiple of this. */
export const EVENT_TIMING_STEP = 8;

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

/**
 * The p95's bound at the runner's factor, LATENCY.p95 times it, rounded to the nearest 8 ms step, ties up: Event
 * Timing rounds each duration to the nearest 8 ms (https://w3c.github.io/event-timing/#sec-fin-event-timing, "rounded
 * to the nearest 8ms"), so a sample is only known to within 4 ms either side, and a bound between steps judges at the
 * API's own resolution only when it sits on one. At factor 1 the bound is 104; at 1.19, 120 rather than 119.
 */
export function p95Bound(factor = 1): number {
  // Round the raw bound to the nearest 8 ms step (ties up): the resolution Event Timing reports durations at.
  return Math.floor((LATENCY.p95 * factor) / EVENT_TIMING_STEP + 0.5) * EVENT_TIMING_STEP;
}

/** Where a press's time went, from its Event Timing entry: waiting for the page's thread, its handlers, and the wait for the next paint (ms). The duration is rounded to 8 ms and the other times are not, so the last part is accurate to within that rounding. */
export function splitPress(entry: { startTime: number; processingStart: number; processingEnd: number; duration: number }): { inputDelay: number; processing: number; presentation: number } {
  const inputDelay = Math.round(entry.processingStart - entry.startTime);
  const processing = Math.round(entry.processingEnd - entry.processingStart);
  return { inputDelay, processing, presentation: Math.round(entry.duration) - inputDelay - processing };
}

/**
 * How much of a press's wait for the paint was the main thread's frame and how much came after it (ms), from the long
 * animation frame that holds its rendering: the first one that ends after the press's handlers and starts before its
 * paint. Null when no frame holds it, which means its rendering on the main thread took under 50 ms, since a long
 * animation frame is one of 50 ms or more. The duration is rounded to 8 ms and the other times are not, like splitPress.
 */
export function splitPaint(entry: { startTime: number; processingEnd: number; duration: number }, frames: ReadonlyArray<{ startTime: number; duration: number }>): { mainThread: number; afterMainThread: number } | null {
  const paint = entry.startTime + entry.duration;
  const frame = holdingFrame(entry, frames);
  if (!frame) return null;
  const frameEnd = frame.startTime + frame.duration;
  return { mainThread: Math.max(0, Math.round(frameEnd - entry.processingEnd)), afterMainThread: Math.max(0, Math.round(paint - frameEnd)) };
}

/** The long animation frame that holds a press's rendering, as splitPaint takes it, or undefined. */
export function holdingFrame<F extends { startTime: number; duration: number }>(entry: { startTime: number; processingEnd: number; duration: number }, frames: ReadonlyArray<F>): F | undefined {
  const paint = entry.startTime + entry.duration;
  return frames.find((candidate) => candidate.startTime + candidate.duration > entry.processingEnd && candidate.startTime <= paint);
}

/** A long animation frame as the page records it (Chromium only): when its phases began, and the scripts it ran. */
export interface FrameDetail {
  startTime: number;
  duration: number;
  /** When the frame's rendering began (its animation frame callbacks), 0 when it rendered nothing. */
  renderStart: number;
  /** When its style and layout began, 0 when it rendered nothing. */
  styleAndLayoutStart: number;
  scripts: ReadonlyArray<{ duration: number; forcedStyleAndLayoutDuration: number; source: string }>;
}

/**
 * What a long animation frame spent its time on: the scripts and tasks before its rendering, its animation frame callbacks
 * and observers, and its style, layout and paint (ms), then its three heaviest scripts with the forced layout in each. A
 * slow press's log line carries it, so a press that is slow only now and then says, the one time it is, what ran.
 */
export function describeFrame(frame: FrameDetail): string {
  const end = frame.startTime + frame.duration;
  const render = frame.renderStart || end;
  const style = frame.styleAndLayoutStart || end;
  const phases = `scripts and tasks ${Math.round(render - frame.startTime)} ms, animation frame callbacks and observers ${Math.round(style - render)} ms, style, layout and paint ${Math.round(end - style)} ms`;
  const heaviest = [...frame.scripts]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 3)
    .map((script) => `${script.source} ${Math.round(script.duration)} ms (${Math.round(script.forcedStyleAndLayoutDuration)} ms forced layout)`);
  return heaviest.length > 0 ? `${phases}; heaviest scripts: ${heaviest.join(", ")}` : phases;
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
  const bound = p95Bound(factor);
  const ceiling = medianCeiling(baseline) * factor;
  const within = p95 <= bound && median <= ceiling;
  const runner = factor > 1 ? `; the runner measured ${factor}× slower than a quiet one, so the bounds are ${factor}× theirs` : "";
  return { p95, median, within, report: `p95 ${p95} ms (≤ ${bound}, ${LATENCY.p95 * factor} raw, at Event Timing's 8 ms step), median ${median} ms (≤ ${ceiling}, baseline ${baseline})${runner}; samples in order: ${samples.join(", ")}` };
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
  return median <= medianCeiling(baseline) * factor && samples.filter((sample) => sample > p95Bound(factor)).length <= all - Math.ceil(all * 0.95);
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
 * A setup retry, never a timing one (ourostack/ouro-ui#2131, #4115). The CPU throttle is a precondition of every
 * measurement: a navigation at times lands in a renderer the throttle was not set on, and what ran there ran at full
 * speed. Whether it applied is read from a fixed loop's time (`throttleApplied`), never from a press's paint time, and
 * `takeThrottle` takes it again on a new session, each retake logged, from one budget of THROTTLE_RETAKES for the page.
 * A throttle still missing once the budget is spent fails as a harness error that names it, never as a latency result.
 */
export const THROTTLE_RETAKES = 12;

/** Whether the throttle applied: a loop on the throttled page ran at least twice as slow as on the runner's full speed. */
export function throttleApplied(loopMs: number, fullMs: number): boolean {
  return loopMs / fullMs >= 2;
}

/** A fixed loop's time in the page, ms: the fastest of three runs after one to compile it, since a busy runner only ever adds time. */
export async function throttleLoop(page: Page): Promise<number> {
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

/** How many throttle retakes this worker has spent, for the one budget. */
let throttleRetakes = 0;

/**
 * Sets the CPU throttle on a new CDP session of the page and checks it applied, taking it again on a fresh session when
 * it did not. Returns the session whose throttle holds; throws a harness error naming the throttle when the budget of
 * retakes is spent.
 */
export async function takeThrottle(page: Page, rate: number, label: string): Promise<CDPSession> {
  const full = await throttleLoop(page);
  for (;;) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const throttled = await throttleLoop(page);
    if (throttleApplied(throttled, full)) return cdp;
    const ratio = Math.round((throttled / full) * 10) / 10;
    if (throttleRetakes >= THROTTLE_RETAKES) {
      throw new Error(`latency harness error, not a latency result: the ${rate}× CPU throttle did not apply to ${label} (its loop ran ${ratio}× full speed) after ${THROTTLE_RETAKES} retakes`);
    }
    throttleRetakes += 1;
    const line = `${label}: the ${rate}× throttle did not apply (its loop ran ${ratio}× full speed); taking it again (retake ${throttleRetakes} of ${THROTTLE_RETAKES})`;
    test.info().annotations.push({ type: "latency-throttle-retake", description: line });
    console.log(`latency-throttle-retake ${line}`);
    await cdp.detach().catch(() => undefined);
  }
}

/** Whether this worker's browser has measured a control yet (LATENCY.firstWarmUps). */
let browserWarmed = false;

/**
 * Presses a control warmUps + samples times on a throttled CPU and returns each counted press's
 * click-to-paint time in ms, LATENCY.more presses more when `more` says so of the first samples (morePresses). Event Timing reports nothing under 16 ms (its durationThreshold floor),
 * so a press with no entry counts as 16 ms, if the browser's interaction count says it happened; a
 * press with neither is a broken measurement, and fails. Setting up a press runs at full speed, and
 * so does its tail (the porthole's repaint after the press), and the page then settles again at the
 * throttle before the press, so a press is measured from a settled page, as a person's would be a beat later.
 */
export async function measure(
  page: Page,
  label: string,
  { press, prepare, setUp }: Presses,
  throttle: number = LATENCY.throttle,
  more?: (samples: readonly number[], factor: number) => boolean,
  /** The index the first press takes, so a second measurement of a control carries on where its first stopped. */
  indexFrom = 0,
): Promise<{ samples: number[]; probe: number[]; rounds: number[][]; factor: number; presses: number }> {
  await page.evaluate(() => {
    const store: Array<[number, number, number, number, string]> = [];
    (window as unknown as { __latency: typeof store }).__latency = store;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) if (entry.interactionId) store.push([entry.duration, entry.startTime, entry.processingStart, entry.processingEnd, entry.name]);
    }).observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
    // Long animation frames show whether a slow press's wait for the paint was the main thread's frame (Chromium only).
    type Script = { duration: number; forcedStyleAndLayoutDuration: number; invoker: string; invokerType: string; sourceURL: string; sourceFunctionName: string };
    const frames: FrameDetail[] = [];
    (window as unknown as { __latencyFrames: typeof frames }).__latencyFrames = frames;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { renderStart: number; styleAndLayoutStart: number; scripts?: Script[] }>)
          frames.push({
            startTime: entry.startTime,
            duration: entry.duration,
            renderStart: entry.renderStart,
            styleAndLayoutStart: entry.styleAndLayoutStart,
            scripts: (entry.scripts ?? []).map((script) => ({
              duration: script.duration,
              forcedStyleAndLayoutDuration: script.forcedStyleAndLayoutDuration,
              source: `${script.invokerType} ${script.invoker} (${script.sourceFunctionName || "anonymous"} in ${script.sourceURL.split("/").pop() || "the page"})`,
            })),
          });
      }).observe({ type: "long-animation-frame", buffered: false } as PerformanceObserverInit);
    } catch {
      // A browser without long animation frames records none.
    }
  });
  let cdp = await page.context().newCDPSession(page);
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
  const host = cpus();
  const runnerLine = `${label}: script ${speed.script} ms, frame ${speed.frame} ms (full speed), CPU ${host[0]?.model ?? "unknown CPU"} × ${host.length}`;
  test.info().annotations.push({ type: "latency-runner", description: runnerLine });
  console.log(`latency-runner ${runnerLine}`);
  cdp = await takeThrottle(page, throttle, label);
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
  // How busy the host was over each counted press, beside its sample (Linux only).
  const hostReads: string[] = [];
  // Only the latency run's own projects: the rules spec's slow pages count presses by index from the usual warm-ups.
  const warmUps = !browserWarmed && test.info().project.name.startsWith("site-latency") ? LATENCY.firstWarmUps : LATENCY.warmUps;
  browserWarmed = true;
  let presses = warmUps + LATENCY.samples;
  // A round halfway through the counted presses too, so load that comes and goes within them is read (ourostack/ouro-ui#2114).
  const halfway = warmUps + Math.floor(LATENCY.samples / 2);
  let probeDuring: number[] = [];
  for (let index = 0; index < presses; index++) {
    if (index === halfway) probeDuring = await probeRound();
    if (setUp) await unthrottled(() => setUp(indexFrom + index));
    await page.evaluate(() => {
      (window as unknown as { __latency: unknown[] }).__latency.length = 0;
      (window as unknown as { __latencyFrames: unknown[] }).__latencyFrames.length = 0;
    });
    // The press starts from a page settled at the throttle too: the set-up's settle ran at full speed, so
    // whatever still runs once the throttle is back ends before the press, as it would before a person's
    // press a beat later, rather than becoming the press's input delay.
    await settle();
    const before = await interactions();
    const ticksBefore = readHostTicks();
    await press(indexFrom + index);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))));
    const host = hostBusy(ticksBefore, readHostTicks());
    const entries = await page.evaluate(() => (window as unknown as { __latency: Array<[number, number, number, number, string]> }).__latency);
    const durations = entries.map(([duration]) => duration);
    const pressed = (await interactions()) > before;
    expect(durations.length > 0 || pressed, `${label}, press ${index}: the press happened and Event Timing saw it or it was under 16 ms`).toBe(true);
    if (index >= warmUps) {
      samples.push(durations.length > 0 ? Math.max(...durations) : 16);
      if (host) hostReads.push(`${host.busy}%${host.steal > 0 ? ` (${host.steal}% stolen)` : ""}`);
      // Where an over-budget press's time went, so the next failure says whether it was the page's thread or the wait for the paint.
      const slowest = entries.find(([duration]) => duration === Math.max(...durations));
      if (slowest && slowest[0] > LATENCY.p95) {
        // Event Timing gives a press's later entries (pointerup, click) its first event's start (pointerdown's), so their input delay runs from pointerdown.
        const { inputDelay, processing, presentation } = splitPress({ duration: slowest[0], startTime: slowest[1], processingStart: slowest[2], processingEnd: slowest[3] });
        const frames = await page.evaluate(() => (window as unknown as { __latencyFrames: FrameDetail[] }).__latencyFrames);
        const press = { duration: slowest[0], startTime: slowest[1], processingEnd: slowest[3] };
        const paint = splitPaint(press, frames);
        const holding = holdingFrame(press, frames);
        const paintPart = paint && holding ? `; of the wait, ${paint.mainThread} ms in the main thread's frame and ${paint.afterMainThread} ms after it; the frame: ${describeFrame(holding)}` : "; no long animation frame held it, so the main thread's part was under 50 ms";
        const hostPart = host ? `; the host's CPUs ${host.busy}% busy${host.steal > 0 ? `, ${host.steal}% stolen` : ""} over the press` : "";
        const split = `${label}, press ${index}: ${slowest[0]} ms = ${inputDelay} ms input delay + ${processing} ms handlers + ${presentation} ms to the next paint (${slowest[4]} entry)${paintPart}${hostPart}`;
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
  const rounds = [probeBefore, probeDuring, probeAfter].filter((round) => round.length > 0);
  const probe = rounds.flat();
  const factor = runnerFactor(probe);
  const line = `${label}: median ${median(probe)} ms (quiet ${LATENCY.probeQuiet}), factor ${factor}; before ${probeBefore.join(", ")}; during ${probeDuring.join(", ")}; after ${probeAfter.join(", ")}`;
  test.info().annotations.push({ type: "latency-probe", description: line });
  console.log(`latency-probe ${line}`);
  if (hostReads.length > 0) {
    const hostLine = `${label}: the host's CPUs over each counted press, in order: ${hostReads.join(", ")} busy (${cpus().length} CPUs)`;
    test.info().annotations.push({ type: "latency-host", description: hostLine });
    console.log(`latency-host ${hostLine}`);
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  return { samples, probe, rounds, factor, presses };
}

/** Holds a control's samples to the budget and its baseline's median ceiling, each times the runner's factor, reporting every sample, pass or fail. */
export function expectWithinBudget(label: string, samples: readonly number[], baseline: number, factor = 1): void {
  const { p95, median, report } = summarise(samples, baseline, factor);
  test.info().annotations.push({ type: "latency", description: `${label}: ${report}` });
  console.log(`latency ${label}: ${report}`);
  expect(p95, `${label} ${report}`).toBeLessThanOrEqual(p95Bound(factor));
  expect(median, `${label} ${report}`).toBeLessThanOrEqual(medianCeiling(baseline) * factor);
}

/**
 * Whether a control's p95 on a quiet runner (factor 1) is within 10% of its bound, at or over 90% of it while still within
 * it: a press with so little room that a slightly slower page would fail it, which is listed in the job summary so the
 * thin margins stay visible. A p95 over the bound is a failure, not a margin, and a slower runner's factor is never one.
 */
export function thinMargin(p95: number, factor: number): boolean {
  return factor === 1 && p95 <= p95Bound(1) && p95 >= 0.9 * p95Bound(1);
}

/**
 * Whether the probe read the runner past the slowest it is calibrated for (LATENCY.maxFactor): its median over
 * LATENCY.probeQuiet, before the factor is capped. Decided from the probe alone, never from the control's result.
 */
export function pastCap(probe: readonly number[]): boolean {
  return pastCapRead(median(probe));
}

/**
 * Whether the runner was loaded while a control was measured: the probe past the cap over all its rounds (pastCap), or in
 * any one round, before, during or after the presses, with every reading of that round past it. A load that comes and goes
 * within the presses leaves the rounds either side of it quiet, and moves their median little, so one round is enough
 * (ourostack/ouro-ui#2114). One round's median of three readings is not: a runner near the cap reads 64 to 96 ms round to
 * round, and its rounds' medians crossed the cap on every measurement, failing a control as too loaded to judge though no
 * reading over all its rounds was past the cap (ourostack/ouro-ui#716).
 */
export function loaded(rounds: readonly (readonly number[])[]): boolean {
  return pastCap(rounds.flat()) || rounds.some((round) => round.length > 0 && pastCapRead(Math.min(...round)));
}

/** Whether one probe median reads the runner past the cap (LATENCY.maxFactor). */
function pastCapRead(read: number): boolean {
  return read / LATENCY.probeQuiet > LATENCY.maxFactor;
}

/**
 * Whether the probe reads the runner steadily past the cap: at least two reads (the first measurement and the first
 * re-measure), every one past the cap, and all within one Event Timing step (8 ms) of each other. A spiky runner is
 * waited on; a steady one reads slow, not loaded, so waiting on it again only costs the job its time (ourostack/ouro-ui#2114).
 */
export function steadySlow(reads: readonly number[]): boolean {
  if (reads.length < 2 || !reads.every(pastCapRead)) return false;
  return Math.max(...reads) - Math.min(...reads) <= EVENT_TIMING_STEP;
}

/**
 * The failure message of a control that missed its bounds at maxFactor on a runner steadily slower than that (steadySlow):
 * a miss there can't be told from the runner's slowness. It names the probe reads that decided it, and the control that
 * found them when another control did.
 */
export function slowRunnerMessage(label: string, reads: readonly number[], foundBy?: string): string {
  const probe = `probe ${reads.join(" ms, then ")} ms, steady, past ${LATENCY.maxFactor}× quiet (${LATENCY.probeQuiet} ms)`;
  const missed = `${label} misses its bounds at ${LATENCY.maxFactor}×`;
  return `infrastructure: runner too slow to judge: ${probe}; ${foundBy === undefined ? missed : `found on "${foundBy}"; ${missed}`}`;
}

/** Whether a control's samples meet its bounds at a factor, as expectWithinBudget holds them. */
function withinBudget(samples: readonly number[], baseline: number, factor: number): boolean {
  const { p95, median } = summarise(samples, baseline, factor);
  return p95 <= p95Bound(factor) && median <= medianCeiling(baseline) * factor;
}

/** Whether more than 1 in 20 of a job's controls needed a re-measure: a sign the runners or the probe need fixing (ourostack/ouro-ui#2142). */
export function manyRemeasured(remeasured: number, measured: number): boolean {
  return remeasured * 20 > measured;
}

/** Controls re-measured in this worker, for the count in the job summary. */
let remeasured = 0;
let measured = 0;
/** Controls that missed their bounds at the cap on a runner found steadily too slow, and failed as too slow to judge. */
let missedAtCap = 0;
/** The control whose re-measures found this worker's runner steadily too slow, and the probe reads that did. */
let steadySlowRun: { label: string; reads: readonly number[] } | undefined;
/**
 * Where the run keeps that verdict: Playwright starts a new worker after a failed test, which would forget it and measure
 * every later control again, re-measures and waits included, until a slow runner ran the job out of time (main's run
 * 44566696721, ourostack/ouro-ui#2114). The project's output folder is emptied when a run starts, so no run inherits one.
 */
const steadyFile = () => join(test.info().project.outputDir, "latency-steady-slow.json");
/** The verdict this run found, whichever worker found it. */
function steadyVerdict(): typeof steadySlowRun {
  if (!steadySlowRun && existsSync(steadyFile())) steadySlowRun = JSON.parse(readFileSync(steadyFile(), "utf8")) as NonNullable<typeof steadySlowRun>;
  return steadySlowRun;
}
/** The controls whose quiet-runner p95 was within 10% of its bound (thinMargin), as `label p95/bound`, for the job summary. */
const thinMargins: string[] = [];
/** Appends a line to the CI job's summary, where there is one. */
function summary(line: string): void {
  const file = process.env["GITHUB_STEP_SUMMARY"];
  if (file) appendFileSync(file, `${line}\n`);
}
process.once("exit", () => {
  if (measured > 0) summary(`Latency: ${remeasured} of ${measured} controls re-measured on a runner the probe read past ${LATENCY.maxFactor}× slower.`);
  if (steadySlowRun) summary(`Latency: runner steadily too slow (probe ${steadySlowRun.reads.join(", ")} ms): its controls were judged at ${LATENCY.maxFactor}×, and ${missedAtCap} of ${measured} missed there, failing as too slow to judge.`);
  if (manyRemeasured(remeasured, measured)) summary(`Latency: more than 1 in 20 controls needed a re-measure. The runner pool, or the probe's 8 ms quantum, needs fixing, not more retries.`);
  if (measured > 0) summary(thinMargins.length > 0 ? `Latency: thin margins on a quiet runner (p95 within 10% of its bound): ${thinMargins.join(", ")}.` : "Latency: no thin margins on a quiet runner.");
});

/**
 * Clears the steady-runner verdict, for the rules spec, whose tests share a worker: a later test starts with the runner
 * judged afresh. `"worker"` clears only this worker's copy, as a new worker starts, so the run's own record is read again.
 */
export function forgetSteadySlowRunner(scope: "run" | "worker" = "run"): void {
  steadySlowRun = undefined;
  if (scope === "run") rmSync(steadyFile(), { force: true });
}

/**
 * Measures a control (with LATENCY.more presses more when its first samples call for them) and holds it to the budget,
 * at the runner's factor. When the probe reads the runner past the cap (pastCap), the runner is given LATENCY.loadWaitMs
 * and the control measured again, pass or fail, up to LATENCY.loadTries measurements in all, and the last alone is
 * judged; when its probe is past the cap too, the control fails as too loaded to judge, so an overloaded runner never
 * passes a control unmeasured. A steady reading (steadySlow: every read past the cap, within one Event Timing step of
 * the others) stops the re-measuring after the first re-measure instead: the runner is slow, not loaded, so waiting on it
 * reads the same. The control is judged at LATENCY.maxFactor, which stretches its bounds less than the runner is slow, so
 * a pass there holds; a miss fails as infrastructure (slowRunnerMessage). Every later control in this worker whose probe
 * is past the cap is measured once and judged the same way, never re-measured, its time limit unchanged. The job's
 * summary counts both. Each re-measured control goes to the job summary with every probe reading.
 */
export async function expectPressesWithinBudget(page: Page, label: string, presses: Presses, baseline: number): Promise<void> {
  const more = (first: readonly number[], before: number) => morePresses(first, baseline, before);
  measured += 1;
  const began = Date.now();
  let result = await measure(page, label, presses, LATENCY.throttle, more);
  // How long one measurement took here: each re-measure adds that, half again, and the wait to the test's time limit, so
  // the retries a loaded runner needs never run the test out of time (ourostack/ouro-ui#1735).
  const took = Date.now() - began;
  const reads = [median(result.probe)];
  // Each measurement's presses carry on from the last index of the ones before it.
  let pressed = result.presses;
  while (loaded(result.rounds) && reads.length < LATENCY.loadTries && !steadySlow(reads) && !steadyVerdict()) {
    test.info().setTimeout(test.info().timeout + LATENCY.loadWaitMs + Math.ceil(took * 1.5));
    await page.waitForTimeout(LATENCY.loadWaitMs);
    result = await measure(page, `${label} (again)`, presses, LATENCY.throttle, more, pressed);
    pressed += result.presses;
    reads.push(median(result.probe));
  }
  if (reads.length > 1) {
    remeasured += 1;
    const line = `${label}: re-measured ${reads.length - 1} ${reads.length === 2 ? "time" : "times"}, the probe read ${reads.join(" ms, then ")} ms against ${LATENCY.maxFactor}× quiet (${LATENCY.probeQuiet} ms)`;
    test.info().annotations.push({ type: "latency-remeasure", description: line });
    console.log(`latency-remeasure ${line}`);
    summary(`- ${line}`);
  }
  // A runner found steadily too slow, by this control or an earlier one in this worker, while it still reads past the cap.
  if (steadySlow(reads) && !steadyVerdict()) {
    steadySlowRun = { label, reads };
    writeFileSync(steadyFile(), JSON.stringify(steadySlowRun));
  }
  const steady = pastCap(result.probe) ? steadyVerdict() : undefined;
  if (steady) {
    if (!withinBudget(result.samples, baseline, result.factor)) {
      missedAtCap += 1;
      const message = slowRunnerMessage(label, steady.reads, steady.label === label ? undefined : steady.label);
      test.info().annotations.push({ type: "latency-runner-too-slow", description: message });
      console.log(`latency-runner-too-slow ${steady.reads.join(", ")} ms, steady (${label} missed at ${LATENCY.maxFactor}×)`);
      expect(false, message).toBe(true);
    }
  } else if (reads.length > 1) {
    expect(loaded(result.rounds), `${label}: runner too loaded to judge: probe ${reads.join(" ms, then ")} ms, and its last rounds ${result.rounds.map((round) => round.join(", ")).join("; ")}, past ${LATENCY.maxFactor}× quiet (${LATENCY.probeQuiet} ms), ${reads.length} times`).toBe(false);
  }
  const { p95 } = summarise(result.samples, baseline, result.factor);
  summary(`- ${label}: p95 ${p95} ms, bound ${p95Bound(result.factor)} ms (${LATENCY.p95 * result.factor} raw, rounded to Event Timing's 8 ms step)`);
  if (thinMargin(p95, result.factor)) {
    const line = `${label}: p95 ${p95} ms within 10% of its ${p95Bound(1)} ms bound on a quiet runner`;
    test.info().annotations.push({ type: "latency-thin", description: line });
    console.log(`latency-thin ${line}`);
    thinMargins.push(`${label} ${p95}/${p95Bound(1)}`);
  }
  expectWithinBudget(label, result.samples, baseline, result.factor);
}
