import { expect, test, type Locator, type Page } from "@playwright/test";
import { STAGE_CONTROLS, STAGE_COPY, TANKS } from "../src/voyage/stage/copy";

// Each stage control answers within 100 ms, click to next paint (p95 of 10 after two warm-up
// presses), on a CPU throttled 4× (site-design.md, "Verification in CI"). Run alone, one worker, by
// `pnpm test:latency` (playwright.latency.config.ts) and CI's latency job: beside other workers the
// runner's CPU is shared and the numbers measure the neighbours. Every press must happen, and produce
// an Event Timing entry unless it took under 16 ms (the API's floor); neither is a broken
// measurement, and fails.

async function open(page: Page): Promise<void> {
  await page.goto("voyage/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
}

const tank = (page: Page, name: string) => page.getByRole("switch", { name, exact: true });
const diveButton = (page: Page) => page.getByRole("button", { name: STAGE_COPY.dive, exact: true });

async function fillTanks(page: Page): Promise<void> {
  for (const { name } of TANKS) await tank(page, name).click();
}

/** How many interactions the page has had (Event Timing's count, which has no duration floor). */
const interactionCount = (page: Page) => page.evaluate(() => (performance as Performance & { interactionCount: number }).interactionCount);

test.describe("interaction latency", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");

  /** Each control's interaction, repeatable ten times in a row. */
  const interactions: Record<(typeof STAGE_CONTROLS)[number], (page: Page, round: number) => Promise<Locator | void>> = {
    xray: (page) => page.locator("[data-stage-control='xray']").getByRole("button", { name: STAGE_COPY.xray }).click(),
    depth: async (page, round) => {
      await page.getByRole("slider", { name: STAGE_COPY.depth }).focus();
      await page.keyboard.press(round % 2 ? "ArrowLeft" : "ArrowRight");
    },
    "tank-fore": (page) => tank(page, TANKS[0].name).click(),
    "tank-middle": (page) => tank(page, TANKS[1].name).click(),
    "tank-aft": (page) => tank(page, TANKS[2].name).click(),
    dive: async (page, round) => {
      if (round % 2 === 0) await diveButton(page).click();
      else await page.getByRole("button", { name: STAGE_COPY.surface, exact: true }).click();
    },
    speed: (page, round) => page.getByRole("radio", { name: round % 2 ? "Half" : "Full" }).click(),
    lights: (page) => page.getByRole("switch", { name: STAGE_COPY.lights }).click(),
    log: (page) => page.getByRole("button", { name: /^Ship's log \(/ }).click(),
    bell: (page) => page.getByRole("button", { name: STAGE_COPY.bell }).click(),
  };

  for (const id of STAGE_CONTROLS) {
    test(`${id} answers within 100 ms (p95 of 10) on a 4× slower CPU`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page);
      await page.evaluate(() => {
        const store: number[] = [];
        (window as unknown as { __latency: number[] }).__latency = store;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as PerformanceEventTiming[]) if (entry.interactionId) store.push(entry.duration);
        }).observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      const samples: number[] = [];
      // Two rounds to warm up (the first press of anything compiles code), then ten that count.
      // Setting up a press runs at full speed: it isn't what's measured.
      // Its tail (the porthole's deferred repaint) finishes at full speed too, so a
      // press is measured from a settled stage, as a person's would be a beat later.
      const unthrottled = async (setUp: () => Promise<unknown>) => {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        await setUp();
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))));
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      };
      if (id === "log") await unthrottled(() => page.getByRole("radio", { name: "Full" }).click());
      for (let round = -2; round < 10; round++) {
        if (id === "dive" && (round + 2) % 2 === 0) await unthrottled(() => fillTanks(page));
        if (id === "xray" && round > -2) await unthrottled(() => page.getByRole("switch", { name: "X-ray" }).click());
        await page.evaluate(() => ((window as unknown as { __latency: number[] }).__latency.length = 0));
        const before = await interactionCount(page);
        await interactions[id](page, round + 2);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))));
        const durations = await page.evaluate(() => (window as unknown as { __latency: number[] }).__latency);
        // Event Timing reports nothing under 16 ms (its durationThreshold floor), so no entry can
        // mean a fast press. The browser's interaction count says whether the press happened: if it
        // did, it counts as 16 ms; if neither it nor an entry is there, the measurement is broken.
        const pressed = (await interactionCount(page)) > before;
        expect(durations.length > 0 || pressed, `${id}, round ${round}: the press happened and Event Timing saw it or it was under 16 ms`).toBe(true);
        if (round >= 0) samples.push(durations.length > 0 ? Math.max(...durations) : 16);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
      }
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      const sorted = samples.toSorted((a, b) => a - b);
      const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
      test.info().annotations.push({ type: "latency", description: `${id}: p95 ${p95} ms (${samples.join(", ")})` });
      expect(p95, `${id} samples: ${samples.join(", ")}`).toBeLessThanOrEqual(100);
    });
  }
});
