import { expect, test, type Page } from "@playwright/test";
import { ARTICLES, CHAPTER_ONE, CHAPTER_ONE_CONTROLS, PARTS } from "../src/voyage/chapters/copy";

// Each Chapter I control answers within 100 ms, click to next paint (p95 of 10 after two warm-up
// presses), on a CPU throttled 4× (site-design.md, "Verification in CI"), as stage.latency.spec.ts
// holds the stage's. Run alone, one worker, by `pnpm test:latency`. A press's set-up (ticking every
// job before Launch, filling the articles before Sign) runs and settles unthrottled, so only the
// press is measured; every press must happen, and produce an Event Timing entry unless it took
// under 16 ms, the API's floor.

async function open(page: Page): Promise<void> {
  await page.goto("voyage/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.locator("#chapter-one").scrollIntoViewIfNeeded();
  await expect(page.locator("#chapter-one[data-chapter-ready]")).toBeAttached();
}

const interactionCount = (page: Page) => page.evaluate(() => (performance as Performance & { interactionCount: number }).interactionCount);
const shipyard = (page: Page) => page.locator("[data-composition='shipyard']");
const articles = (page: Page) => page.locator("[data-composition='articles']");
const launchButton = (page: Page) => shipyard(page).locator("[data-chapter-control='launch'] button");

async function fillArticles(page: Page): Promise<void> {
  await page.getByRole("textbox", { name: ARTICLES.name }).fill("Ada");
  await page.getByRole("combobox", { name: ARTICLES.trade }).click();
  await page.getByRole("option", { name: "Cook" }).click();
  await page.getByRole("checkbox", { name: ARTICLES.oath }).click();
}

type Step = (page: Page, round: number) => Promise<unknown>;

/** Each control's press, and what readies it (unthrottled) before each round and tidies after. */
const presses: Record<(typeof CHAPTER_ONE_CONTROLS)[number], { press: Step; before?: Step; after?: Step }> = {
  "shipyard-code": { press: (page) => shipyard(page).getByRole("button", { name: CHAPTER_ONE.code }).click(), after: (page) => page.keyboard.press("Escape") },
  // The reorder itself: the handle's menu opens unthrottled, then "Move to top" and "Move to bottom" take turns.
  order: {
    before: (page) => page.getByRole("button", { name: /^Reorder Double hull/ }).click(),
    press: (page, round) => page.getByRole("menuitem", { name: round % 2 ? "Move to bottom" : "Move to top" }).click(),
  },
  jobs: { press: (page) => page.getByRole("checkbox", { name: PARTS[0].job }).click() },
  launch: {
    before: async (page, round) => {
      if (round % 2 === 0) for (const part of PARTS) await page.getByRole("checkbox", { name: part.job }).click();
    },
    press: (page) => launchButton(page).click(),
  },
  "articles-code": { press: (page) => articles(page).getByRole("button", { name: CHAPTER_ONE.code }).click(), after: (page) => page.keyboard.press("Escape") },
  name: {
    before: (page) => page.getByRole("textbox", { name: ARTICLES.name }).focus(),
    press: (page, round) => page.keyboard.press(round % 2 ? "Backspace" : "a"),
  },
  trade: { press: (page) => page.getByRole("combobox", { name: ARTICLES.trade }).click(), after: (page) => page.keyboard.press("Escape") },
  oath: { press: (page) => page.getByRole("checkbox", { name: ARTICLES.oath }).click() },
  sign: { before: fillArticles, press: (page) => page.getByRole("button", { name: ARTICLES.sign }).click() },
  leave: {
    before: async (page) => {
      await fillArticles(page);
      await page.getByRole("button", { name: ARTICLES.sign }).click();
      await articles(page).getByRole("button", { name: ARTICLES.leave }).waitFor();
    },
    press: (page) => articles(page).getByRole("button", { name: ARTICLES.leave }).click(),
  },
};

test.describe("Chapter I interaction latency", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");

  for (const id of CHAPTER_ONE_CONTROLS) {
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
      const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))));
      const unthrottled = async (step: () => Promise<unknown>) => {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        await step();
        await settle();
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      };
      const { press, before, after } = presses[id];
      const samples: number[] = [];
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      for (let round = -2; round < 10; round++) {
        if (before) await unthrottled(() => before(page, round + 2));
        await page.evaluate(() => ((window as unknown as { __latency: number[] }).__latency.length = 0));
        const count = await interactionCount(page);
        await press(page, round + 2);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))));
        const durations = await page.evaluate(() => (window as unknown as { __latency: number[] }).__latency);
        const pressed = (await interactionCount(page)) > count;
        expect(durations.length > 0 || pressed, `${id}, round ${round}: the press happened and Event Timing saw it or it was under 16 ms`).toBe(true);
        if (round >= 0) samples.push(durations.length > 0 ? Math.max(...durations) : 16);
        if (after) await unthrottled(() => after(page, round + 2));
      }
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      const sorted = samples.toSorted((a, b) => a - b);
      const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
      test.info().annotations.push({ type: "latency", description: `${id}: p95 ${p95} ms (${samples.join(", ")})` });
      expect(p95, `${id} samples: ${samples.join(", ")}`).toBeLessThanOrEqual(100);
    });
  }
});

