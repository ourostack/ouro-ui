import { expect, test, type Page } from "@playwright/test";
import { ARTICLES, CHAPTER_ONE, CHAPTER_ONE_CONTROLS, PARTS } from "../src/voyage/chapters/copy";
import { LATENCY, expectWithinBudget, measure, medianCeiling, type Presses } from "./latency";

// Each Chapter I control answers within budget, click to next paint, on a slower CPU, as
// stage.latency.spec.ts holds the stage's: latency.ts holds the budget (of 20 presses after two
// warm-ups at 4× throttle, the p95 within 100 ms and the median within its ceiling from the baselines
// below) and the measurement. A press's set-up (ticking every job before Launch, filling the articles
// before Sign, closing what the last press opened) runs and settles unthrottled, so only the press is
// measured. Run alone, one worker, by `pnpm test:latency` (playwright.latency.config.ts) and CI's
// latency job: beside other workers the runner's CPU is shared and the numbers measure the neighbours.

async function open(page: Page): Promise<void> {
  await page.goto("voyage/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.locator("#chapter-one").scrollIntoViewIfNeeded();
  await expect(page.locator("#chapter-one[data-chapter-ready]")).toBeAttached();
}

const shipyard = (page: Page) => page.locator("[data-composition='shipyard']");
const articles = (page: Page) => page.locator("[data-composition='articles']");
const launchButton = (page: Page) => shipyard(page).locator("[data-chapter-control='launch'] button");

async function fillArticles(page: Page): Promise<void> {
  await page.getByRole("textbox", { name: ARTICLES.name }).fill("Ada");
  await page.getByRole("combobox", { name: ARTICLES.trade }).click();
  await page.getByRole("option", { name: "Cook" }).click();
  await page.getByRole("checkbox", { name: ARTICLES.oath }).click();
}

type Step = (page: Page, index: number) => Promise<unknown>;

/** Each control's press, what readies it (unthrottled) before each press, and what tidies after it. Indexes are latency.ts's, from 0. */
const steps: Record<(typeof CHAPTER_ONE_CONTROLS)[number], { press: Step; before?: Step; after?: Step }> = {
  "shipyard-code": { press: (page) => shipyard(page).getByRole("button", { name: CHAPTER_ONE.code }).click(), after: (page) => page.keyboard.press("Escape") },
  // The reorder itself: the handle's menu opens unthrottled, then "Move to top" and "Move to bottom" take turns.
  order: {
    before: (page) => page.getByRole("button", { name: /^Reorder Double hull/ }).click(),
    press: (page, index) => page.getByRole("menuitem", { name: index % 2 ? "Move to bottom" : "Move to top" }).click(),
  },
  jobs: { press: (page) => page.getByRole("checkbox", { name: PARTS[0].job }).click() },
  launch: {
    before: async (page, index) => {
      if (index % 2 === 0) for (const part of PARTS) await page.getByRole("checkbox", { name: part.job }).click();
    },
    press: (page) => launchButton(page).click(),
  },
  "articles-code": { press: (page) => articles(page).getByRole("button", { name: CHAPTER_ONE.code }).click(), after: (page) => page.keyboard.press("Escape") },
  name: {
    before: (page) => page.getByRole("textbox", { name: ARTICLES.name }).focus(),
    press: (page, index) => page.keyboard.press(index % 2 ? "Backspace" : "a"),
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

/**
 * Each control's baseline: the highest median, in ms, of six CI runs of this spec (#131, 2026-10-20;
 * every run prints its samples). Re-measure and update a control's line when a change makes it
 * faster or knowingly slower.
 */
const BASELINE_MEDIAN: Record<(typeof CHAPTER_ONE_CONTROLS)[number], number> = {
  "shipyard-code": 72,
  order: 76,
  jobs: 52,
  launch: 80,
  "articles-code": 72,
  name: 24,
  trade: 28,
  oath: 40,
  sign: 72,
  leave: 64,
};

/** A control's presses for latency.ts: its set-up readies each press, after tidying the one before. */
function presses(page: Page, id: (typeof CHAPTER_ONE_CONTROLS)[number]): Presses {
  const { press, before, after } = steps[id];
  return {
    press: (index) => press(page, index),
    setUp: async (index) => {
      if (after && index > 0) await after(page, index - 1);
      if (before) await before(page, index);
    },
  };
}

test.describe("Chapter I interaction latency", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");

  for (const id of CHAPTER_ONE_CONTROLS) {
    test(`${id} answers within ${LATENCY.p95} ms (p95 of ${LATENCY.samples}, median within ${medianCeiling(BASELINE_MEDIAN[id])} ms) on a ${LATENCY.throttle}× slower CPU`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page);
      expectWithinBudget(id, await measure(page, id, presses(page, id)), BASELINE_MEDIAN[id]);
    });
  }
});
