import { expect, test, type Page } from "@playwright/test";
import { LATENCY, expectWithinBudget, measure, morePresses, summarise } from "./latency";

// The latency budget's rules (site/e2e/latency.ts), on made-up samples and on a page whose button is slow on purpose:
// a control is pressed more only when all its presses together could be within budget, every press is judged, and a
// control that really is slow fails, with or without the presses more.

const at = (value: number, count: number) => Array<number>(count).fill(value);

test("the p95 of 40 presses is the 38th: two of 40 over 100 ms pass, three fail", () => {
  expect(summarise([...at(56, 38), 152, 112], 64).p95).toBe(56);
  expect(summarise([...at(56, 37), 152, 112, 104], 64).p95).toBe(104);
  expect(summarise([...at(56, 37), 152, 112, 104], 64).within).toBe(false);
});

test("a control is pressed more only when its first 20 are over budget and all of them could still be within it", () => {
  // Within budget: no more presses.
  expect(morePresses([...at(56, 19), 112], 64)).toBe(false);
  // Two of 20 over 100 ms (ourostack/ouro-ui#463's radio-code): 20 more, and the 40 are judged together.
  expect(morePresses([88, 88, 80, 80, 80, 88, 88, 112, 80, 80, 80, 112, 80, 64, 88, 80, 80, 56, 72, 72], 64)).toBe(true);
  // Three over: the p95 of 40 allows two, so this already fails and is not pressed again.
  expect(morePresses([...at(56, 17), 104, 112, 120], 64)).toBe(false);
  // A median over its ceiling, every press under 100 ms: pressed more, held to the same ceiling.
  expect(morePresses(at(56, 20), 24)).toBe(true);
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
    const samples = await measure(page, "one in ten", presses, LATENCY.throttle, (first) => morePresses(first, 48));
    expect(samples.filter((sample) => sample > LATENCY.p95).length).toBeGreaterThanOrEqual(3);
    expect(() => expectWithinBudget("one in ten", samples, 48)).toThrow();
  });

  test("slow in every press, it fails on its first 20", async ({ page }) => {
    const presses = await slowButton(page, () => true);
    const samples = await measure(page, "every press", presses, LATENCY.throttle, (first) => morePresses(first, 48));
    expect(samples).toHaveLength(LATENCY.samples);
    expect(() => expectWithinBudget("every press", samples, 48)).toThrow();
  });
});
