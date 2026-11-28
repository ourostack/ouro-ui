import { expect, test, type Page } from "@playwright/test";
import { EVENT_TIMING_STEP, LATENCY, expectPressesWithinBudget, forgetSteadySlowRunner, hostBusy, hostTicks, loaded, manyRemeasured, expectWithinBudget, measure, morePresses, p95Bound, pastCap, runnerFactor, slowRunnerMessage, takeThrottle, throttleApplied, THROTTLE_RETAKES, splitPaint, splitPress, steadySlow, summarise, describeFrame, thinMargin } from "./latency";

// The latency budget's rules (site/e2e/latency.ts), on made-up samples and on a page whose button is slow on purpose:
// a control is pressed more only when all its presses together could be within budget, every press is judged, and a
// control that really is slow fails, with or without the presses more.

const at = (value: number, count: number) => Array<number>(count).fill(value);

test("the p95 of 40 presses is the 38th: two of 40 over the bound pass, three fail", () => {
  expect(summarise([...at(56, 38), 152, 112], 64).p95).toBe(56);
  expect(summarise([...at(56, 37), 152, 120, 112], 64).p95).toBe(112);
  expect(summarise([...at(56, 37), 152, 120, 112], 64).within).toBe(false);
});

test("the p95 bound is rounded to the nearest 8 ms step, as Event Timing rounds each duration, ties up", () => {
  expect(p95Bound(1)).toBe(104);
  expect(p95Bound(1.19)).toBe(120);
  expect(p95Bound(1.12)).toBe(112);
  // A sample one step over the raw bound but on the rounded one passes: orders on ourostack/ouro-ui#1232, 120 against 119.
  expect(summarise([...at(88, 18), 120, 120], 64, 1.19).within).toBe(true);
  expect(summarise([...at(88, 18), 128, 128], 64, 1.19).within).toBe(false);
});

test("a control is pressed more only when its first 20 fail on the p95 alone and all of them could still be within it", () => {
  // Within budget: no more presses.
  expect(morePresses([...at(56, 19), 112], 64)).toBe(false);
  // Two of 20 over 100 ms (ourostack/ouro-ui#463's radio-code): 20 more, and the 40 are judged together.
  expect(morePresses([88, 88, 80, 80, 80, 88, 88, 112, 80, 80, 80, 112, 80, 64, 88, 80, 80, 56, 72, 72], 64)).toBe(true);
  // Three over: the p95 of 40 allows two, so this already fails and is not pressed again.
  expect(morePresses([...at(56, 17), 112, 120, 128], 64)).toBe(false);
  // A median over its ceiling: a slow press or two cannot move it, so it fails at once, every press under 100 ms or not.
  expect(morePresses(at(56, 20), 24)).toBe(false);
  expect(morePresses([...at(56, 18), 152, 112], 24)).toBe(false);
  // Only the first 20 are ever pressed more, once.
  expect(morePresses([...at(56, 38), 152, 112], 64)).toBe(false);
});

test("a control slow in more than one press of 20 fails with the presses more, as without them", () => {
  // Slow one press in ten: two of the first 20, then two of the next 20, four of 40.
  const first = [...at(48, 9), 120, ...at(48, 9), 120];
  expect(morePresses(first, 48)).toBe(true);
  const all = [...first, ...first];
  expect(summarise(all, 48).within).toBe(false);
  expect(() => expectWithinBudget("one in ten slow", all, 48)).toThrow();
  // Slow in every press: never pressed more, and fails.
  expect(morePresses(at(120, 20), 48)).toBe(false);
  expect(() => expectWithinBudget("every press slow", at(120, 20), 48)).toThrow();
});

test("a runner the probe measures slower stretches the bounds by its factor, at most 1.5 times, and a quiet one by none", () => {
  // Quiet: the probe at or under its quiet median leaves the bounds as they are.
  expect(runnerFactor(at(LATENCY.probeQuiet, 10))).toBe(1);
  expect(runnerFactor(at(LATENCY.probeQuiet - 8, 10))).toBe(1);
  // A quarter slower than a quiet runner, and a runner past the cap, judged at the cap.
  expect(runnerFactor(at(Math.round(LATENCY.probeQuiet * 1.25), 10))).toBe(1.25);
  expect(runnerFactor(at(200, 10))).toBe(LATENCY.maxFactor);
  // Every press 112 ms: over the quiet runner's bound (104 ms), within 128 ms on one a quarter slower.
  expect(summarise(at(112, 20), 64).within).toBe(false);
  expect(summarise(at(112, 20), 64, 1.25).within).toBe(true);
  // A control that really is slow still fails on the slowest runner the factor allows for.
  expect(summarise(at(160, 20), 64, LATENCY.maxFactor).within).toBe(false);
  expect(() => expectWithinBudget("slow on a slow runner", at(160, 20), 64, LATENCY.maxFactor)).toThrow();
  // The median's ceiling stretches too: twice the baseline, times the factor.
  expect(summarise(at(80, 20), 32, 1.25).within).toBe(true);
  expect(summarise(at(88, 20), 32, 1.25).within).toBe(false);
});

test("a quiet runner's p95 within 10% of its bound is a thin margin; over the bound, or on a slower runner, it is not", () => {
  // The bound is 104 ms and 90% of it 93.6: 96 and 104 are thin, 88 has room.
  expect(thinMargin(96, 1)).toBe(true);
  expect(thinMargin(104, 1)).toBe(true);
  expect(thinMargin(88, 1)).toBe(false);
  // Over the bound is a failure, not a margin.
  expect(thinMargin(112, 1)).toBe(false);
  // 120 is within a slower runner's 128 ms bound and near it, but a runner the probe measured slower is never listed.
  expect(thinMargin(120, 1.25)).toBe(false);
  expect(thinMargin(128, 1.25)).toBe(false);
});

test.describe("a page whose button is slow on purpose", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");

  // Busy-waits in the button's handler (wall-clock time, which the CPU throttle does not shorten) on the presses
  // `slow` names, by measure()'s index, the warm-ups 0 and 1 included.
  async function slowButton(page: Page, slow: (index: number) => boolean) {
    await page.setContent(`<button id="b">Press</button><output id="o"></output>`);
    const presses = {
      setUp: (index: number) => page.evaluate((wait) => ((window as unknown as { wait: number }).wait = wait), slow(index) ? 160 : 0),
      press: () => page.locator("#b").click(),
    };
    await page.evaluate(() =>
      document.getElementById("b")!.addEventListener("click", () => {
        const end = performance.now() + (window as unknown as { wait: number }).wait;
        while (performance.now() < end);
        document.getElementById("o")!.textContent = String(Math.random());
      }),
    );
    return presses;
  }

  test("slow in one press of ten, it is pressed 20 more times and still fails", async ({ page }) => {
    const presses = await slowButton(page, (index) => index >= LATENCY.warmUps && (index - LATENCY.warmUps) % 10 === 9);
    const { samples } = await measure(page, "one in ten", presses, LATENCY.throttle, (first) => morePresses(first, 48));
    // The two slow presses of the first 20 call for 20 more, unless the runner slowed a third, which fails as it is.
    if (samples.slice(0, LATENCY.samples).filter((sample) => sample > LATENCY.p95).length === 2) expect(samples).toHaveLength(LATENCY.samples + LATENCY.more);
    expect(samples.filter((sample) => sample > LATENCY.p95).length).toBeGreaterThanOrEqual(3);
    expect(() => expectWithinBudget("one in ten", samples, 48)).toThrow();
  });

  test("an app-wide slowdown, a busy listener on the whole document, never reaches the probe, and still fails", async ({ page }) => {
    // Longer than any probe press a loaded runner has read, so a probe press it reached could not pass for runner load.
    const busy = 400;
    await page.setContent(`<button id="b">Press</button><output id="o"></output>`);
    // As a provider might add it: every pointerdown on the page busy-waits, whatever was pressed.
    await page.evaluate((busy) => {
      document.addEventListener("pointerdown", () => {
        const end = performance.now() + busy;
        while (performance.now() < end);
      });
      document.getElementById("b")!.addEventListener("click", () => (document.getElementById("o")!.textContent = String(Math.random())));
    }, busy);
    const { samples, probe, factor } = await measure(page, "app-wide", { press: () => page.locator("#b").click() }, LATENCY.throttle, (first, before) => morePresses(first, 48, before));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(busy);
    // The probe runs in a page of its own, with none of this page's code, so no press of it waits on the listener. Its
    // factor is the runner's alone: 1 on a quiet runner, more beside other work, as on an end-to-end shard's workers.
    expect(Math.max(...probe)).toBeLessThan(busy);
    expect(() => expectWithinBudget("app-wide", samples, 48, factor)).toThrow();
  });

  test("slow in every press, it fails on its first 20", async ({ page }) => {
    const presses = await slowButton(page, () => true);
    const { samples } = await measure(page, "every press", presses, LATENCY.throttle, (first) => morePresses(first, 48));
    expect(samples).toHaveLength(LATENCY.samples);
    expect(() => expectWithinBudget("every press", samples, 48)).toThrow();
  });
});

test("the host's CPU load over a press is read from /proc/stat: busy is all but idle and iowait, and steal is its own share", () => {
  const before = hostTicks("cpu  100 0 50 800 50 0 0 0 0 0\ncpu0 50 0 25 400 25 0 0 0 0 0\n");
  const after = hostTicks("cpu  160 0 80 840 60 0 0 20 0 0\n");
  expect(before).toEqual({ total: 1000, busy: 150, steal: 0 });
  expect(hostBusy(before, after)).toEqual({ busy: 69, steal: 13 });
  expect(hostTicks("intr 1 2 3\n")).toBeNull();
  expect(hostBusy(null, after)).toBeNull();
  expect(hostBusy(after, after)).toBeNull();
});

test("a probe past the cap calls for a re-measure, read from the probe alone", () => {
  const cap = LATENCY.probeQuiet * LATENCY.maxFactor;
  expect(pastCap([cap, cap, cap + 8])).toBe(false);
  expect(pastCap([cap + 8, cap + 8, cap])).toBe(true);
});

test("a probe round past the cap during the presses calls for a re-measure, though the rounds either side were quiet", () => {
  const quiet = LATENCY.probeQuiet;
  const busy = LATENCY.probeQuiet * LATENCY.maxFactor + 8;
  // The feathers run in ourostack/ouro-ui#2114: quiet before and after, the load within the presses.
  expect(pastCap([quiet, quiet, quiet, busy, busy, busy, quiet, quiet, quiet])).toBe(false);
  expect(loaded([[quiet, quiet, quiet], [busy, busy, busy], [quiet, quiet, quiet]])).toBe(true);
  expect(loaded([[quiet, quiet, quiet], [quiet, busy, quiet], [quiet, quiet, quiet]])).toBe(false);
  expect(loaded([[busy, busy, busy], [], [busy, busy, busy]])).toBe(true);
  expect(loaded([[quiet, quiet, quiet], [], [quiet, quiet, quiet]])).toBe(false);
  // The lights run in ourostack/ouro-ui#716: a runner near the cap, a round's median past it, no round past it whole, and the
  // median over all its rounds within it.
  expect(loaded([[72, 96, 64], [80, 88, 72], [64, 88, 64]])).toBe(false);
});

test("a probe that reads past the cap every time, within one Event Timing step, is steady; spiky or within the cap is not", () => {
  const slow = 80;
  // The reads from ourostack/ouro-ui#2114: 80, then 80; 80, 84, 80; 80, 88, 80. Steady, past the cap every time.
  expect(steadySlow([slow, slow])).toBe(true);
  expect(steadySlow([slow, slow + 4, slow])).toBe(true);
  expect(steadySlow([slow, slow + EVENT_TIMING_STEP, slow])).toBe(true);
  // Spiky: 80 then 68, and 68 is within the cap.
  expect(steadySlow([slow, 68])).toBe(false);
  // One read is not yet a re-measure, so not steady.
  expect(steadySlow([slow])).toBe(false);
  // Within the cap: 70 is under 1.5× quiet (78 ms).
  expect(steadySlow([70, 70])).toBe(false);
  // Spread just over the step: 9 ms apart is not one step.
  expect(steadySlow([slow, slow + EVENT_TIMING_STEP + 1])).toBe(false);
});

test("the infrastructure failure names the probe reads that decided it, the cap the control missed, and the control that found the runner when another did", () => {
  const message = slowRunnerMessage("shipyard", [80, 80]);
  expect(message.startsWith("infrastructure: runner too slow to judge")).toBe(true);
  expect(message).toContain("probe 80 ms, then 80 ms, steady, past 1.5× quiet (52 ms)");
  expect(message).toContain("shipyard misses its bounds at 1.5×");
  expect(slowRunnerMessage("nemo", [80, 80], "shipyard")).toContain(`found on "shipyard"; nemo misses its bounds at 1.5×`);
});

test.describe("a runner the probe reads past the cap", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");
  const quiet = LATENCY.probeQuiet;
  const wait = LATENCY.loadWaitMs;
  // A quiet reading so low that any runner reads past the cap, as an overloaded one does; no wait between measurements.
  // Whether its two reads are steady or spiky is the runner's, so the test accepts either outcome and checks each.
  test.beforeEach(() => void Object.assign(LATENCY, { probeQuiet: 1, loadWaitMs: 0 }));
  test.afterEach(() => {
    Object.assign(LATENCY, { probeQuiet: quiet, loadWaitMs: wait });
    forgetSteadySlowRunner();
  });

  test("re-measures a fast control too, carrying its presses on: a spiky runner fails it as too loaded to judge, and a steady one judges it at the cap, failing only a miss there", async ({ page }) => {
    // Four measurements where a control runs one (overloaded twice, then later and missed), each with its probe rounds:
    // a loaded runner ran the last out of a limit sized for two (ourostack/ouro-ui#2529).
    test.slow();
    // The time limit before any re-measure: each re-measure extends it by what it needs.
    const limit = test.info().timeout;
    await page.setContent(`<button id="b">Press</button><output id="o"></output>`);
    await page.evaluate(() => document.getElementById("b")!.addEventListener("click", () => (document.getElementById("o")!.textContent = String(Math.random()))));
    const pressing = (into: number[]) => ({ press: async (index: number) => void (into.push(index), await page.locator("#b").click()) });
    const outcome = (label: string, into: number[], baseline: number) =>
      expectPressesWithinBudget(page, label, pressing(into), baseline).then(
        () => null,
        (error: Error) => error.message,
      );
    const pressed: number[] = [];
    const failure = await outcome("overloaded", pressed, 48);
    // Measured each time from the index the one before stopped at, never starting again at 0.
    expect(pressed).toEqual(Array.from({ length: pressed.length }, (_, index) => index));
    expect(test.info().timeout).toBeGreaterThan(limit);
    const one = LATENCY.warmUps + LATENCY.samples;
    if (failure === null) {
      // Steady: measured twice, then judged at the cap, which a fast control meets.
      expect(pressed.length).toBe(2 * one);
      const limitAfterFirst = test.info().timeout;
      // A later control is measured once, never re-measured, its time limit unchanged, and judged at the cap too, even in
      // the new worker Playwright starts after a failed test, which reads the run's verdict back.
      forgetSteadySlowRunner("worker");
      const later: number[] = [];
      expect(await outcome("later", later, 48)).toBeNull();
      expect(later.length).toBe(one);
      // A control that misses at the cap fails as too slow to judge: a median no press can meet stands in for a slow page.
      const missed: number[] = [];
      const miss = await outcome("missed", missed, -1000);
      expect(miss).toContain(`found on "overloaded"; missed misses its bounds at ${LATENCY.maxFactor}×`);
      expect(miss!.startsWith("infrastructure: runner too slow to judge")).toBe(true);
      expect(missed.length).toBe(one);
      expect(test.info().timeout).toBe(limitAfterFirst);
    } else {
      expect(failure).toContain("overloaded: runner too loaded to judge: probe");
      expect(failure).toContain(`${LATENCY.loadTries} times`);
      // Measured LATENCY.loadTries times, each carrying on from the one before's last index.
      expect(pressed.length).toBe(LATENCY.loadTries * one);
    }
  });
});


test("flags a job where more than 1 in 20 controls needed a re-measure, as a sign the runners or the probe need fixing", () => {
  expect(manyRemeasured(0, 20)).toBe(false);
  expect(manyRemeasured(1, 20)).toBe(false);
  expect(manyRemeasured(2, 20)).toBe(true);
  expect(manyRemeasured(1, 19)).toBe(true);
});

test("a slow press's time is split into the page's input delay, its handlers and the wait for the next paint", () => {
  // From an Event Timing entry: when it began, when its handlers ran, and its duration to the next paint (ms).
  const press = splitPress({ startTime: 1000, processingStart: 1004, processingEnd: 1011, duration: 176 });
  expect(press).toEqual({ inputDelay: 4, processing: 7, presentation: 165 });
  expect(press.inputDelay + press.processing + press.presentation).toBe(176);
});

test("a slow press's wait for the paint is split by the long animation frame that holds its rendering", () => {
  // The press's handlers end at 1011 and its paint is at 1112. The frame 1005 to 1085 holds the rendering.
  const press = { startTime: 1000, processingEnd: 1011, duration: 112 };
  expect(splitPaint(press, [{ startTime: 1005, duration: 80 }])).toEqual({ mainThread: 74, afterMainThread: 27 });
});

test("a slow press's long animation frame says what it spent its time on, and its three heaviest scripts", () => {
  const frame = {
    startTime: 1000,
    duration: 90,
    renderStart: 1050,
    styleAndLayoutStart: 1080,
    scripts: [
      { duration: 5, forcedStyleAndLayoutDuration: 0, source: "event-listener DIV#root.onclick (a in entry.js)" },
      { duration: 30, forcedStyleAndLayoutDuration: 12, source: "event-listener DIV#root.onclick (b in entry.js)" },
      { duration: 9, forcedStyleAndLayoutDuration: 1, source: "user-callback FrameRequestCallback (c in entry.js)" },
      { duration: 2, forcedStyleAndLayoutDuration: 0, source: "resolve-promise Response.json (d in entry.js)" },
    ],
  };
  expect(describeFrame(frame)).toBe(
    "scripts and tasks 50 ms, animation frame callbacks and observers 30 ms, style, layout and paint 10 ms; heaviest scripts: event-listener DIV#root.onclick (b in entry.js) 30 ms (12 ms forced layout), user-callback FrameRequestCallback (c in entry.js) 9 ms (1 ms forced layout), event-listener DIV#root.onclick (a in entry.js) 5 ms (0 ms forced layout)",
  );
  expect(describeFrame({ ...frame, renderStart: 0, styleAndLayoutStart: 0, scripts: [] })).toBe("scripts and tasks 90 ms, animation frame callbacks and observers 0 ms, style, layout and paint 0 ms");
});

test("a slow press no long animation frame holds has no split", () => {
  expect(splitPaint({ startTime: 1000, processingEnd: 1011, duration: 112 }, [])).toBeNull();
});

test("a long animation frame that ended before a press's handlers does not hold its rendering", () => {
  expect(splitPaint({ startTime: 1000, processingEnd: 1011, duration: 112 }, [{ startTime: 950, duration: 50 }])).toBeNull();
});

test("a throttle that never applies fails as a harness error naming the throttle, after its retakes, never as a latency result", async () => {
  expect(throttleApplied(30, 10)).toBe(true);
  expect(throttleApplied(11, 10)).toBe(false);
  let sessions = 0;
  // Every loop reads the same time: the throttle never slows the page.
  const page = {
    evaluate: async () => 10,
    context: () => ({ newCDPSession: async () => (sessions += 1, { send: async () => undefined, detach: async () => undefined }) }),
  } as unknown as Page;
  await expect(takeThrottle(page, 4, "menu on /")).rejects.toThrow(/harness error, not a latency result: the 4× CPU throttle did not apply to menu on \//);
  expect(sessions).toBe(THROTTLE_RETAKES + 1);
});
