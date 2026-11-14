import { expect, test, type Page } from "@playwright/test";
import { LATENCY, expectPressesWithinBudget, expectWithinBudget, measure, morePresses, p95Bound, pastCap, runnerFactor, splitPaint, splitPress, summarise } from "./latency";

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
  expect(runnerFactor(at(48, 10))).toBe(1);
  expect(runnerFactor(at(64, 10))).toBe(1);
  // A quarter slower than a quiet runner, and a runner past the cap, judged at the cap.
  expect(runnerFactor(at(80, 10))).toBe(1.25);
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

test("a probe past the cap calls for a re-measure, read from the probe alone", () => {
  const cap = LATENCY.probeQuiet * LATENCY.maxFactor;
  expect(pastCap([cap, cap, cap + 8])).toBe(false);
  expect(pastCap([cap + 8, cap + 8, cap])).toBe(true);
});

test.describe("a runner the probe reads past the cap", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");
  const quiet = LATENCY.probeQuiet;
  // A quiet reading so low that any runner reads past the cap, as an overloaded one does.
  test.beforeEach(() => void ((LATENCY as { probeQuiet: number }).probeQuiet = 1));
  test.afterEach(() => void ((LATENCY as { probeQuiet: number }).probeQuiet = quiet));

  test("re-measures a fast control too, carrying its presses on, and fails it as too loaded to judge when the probe is past the cap again", async ({ page }) => {
    await page.setContent(`<button id="b">Press</button><output id="o"></output>`);
    await page.evaluate(() => document.getElementById("b")!.addEventListener("click", () => (document.getElementById("o")!.textContent = String(Math.random()))));
    const pressed: number[] = [];
    const presses = { press: async (index: number) => void (pressed.push(index), await page.locator("#b").click()) };
    const failure = await expectPressesWithinBudget(page, "overloaded", presses, 48).then(
      () => null,
      (error: Error) => error.message,
    );
    expect(failure).toContain("overloaded: runner too loaded to judge: probe");
    // Measured twice, the second carrying on from the first's last index rather than starting again at 0.
    expect(pressed).toEqual(Array.from({ length: pressed.length }, (_, index) => index));
    expect(pressed.length).toBe(2 * (LATENCY.warmUps + LATENCY.samples));
  });
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

test("a slow press no long animation frame holds has no split", () => {
  expect(splitPaint({ startTime: 1000, processingEnd: 1011, duration: 112 }, [])).toBeNull();
});

test("a long animation frame that ended before a press's handlers does not hold its rendering", () => {
  expect(splitPaint({ startTime: 1000, processingEnd: 1011, duration: 112 }, [{ startTime: 950, duration: 50 }])).toBeNull();
});
