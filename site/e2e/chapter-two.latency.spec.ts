import { expect, test, type Page } from "@playwright/test";
import { CATALOGUE, CHAPTER_TWO_CONTROLS, CHART_ROOM } from "../src/voyage/chapters/chapter-two-copy";
import { CHAPTER_ONE } from "../src/voyage/chapters/copy";
import { LATENCY, expectWithinBudget, measure, medianCeiling, type Presses } from "./latency";

// Each Chapter II control answers within budget, click to next paint, on a slower CPU, as
// chapter-one.latency.spec.ts holds Chapter I's: latency.ts holds the budget and the measurement. A
// press's set-up (opening a handle's menu before a move, closing what the last press opened) runs
// and settles unthrottled, so only the press is measured. The map, the counter and the Chart follow
// a reorder a frame later (a deferred render), so a move answers before Recharts redraws.

async function open(page: Page): Promise<void> {
  await page.goto("voyage/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.locator("#chapter-two").scrollIntoViewIfNeeded();
  await expect(page.locator("#chapter-two[data-chapter-ready]")).toBeAttached();
}

const room = (page: Page) => page.locator("[data-composition='chart-room']");
const catalogue = (page: Page) => page.locator("[data-composition='catalogue']");

type Step = (page: Page, index: number) => Promise<unknown>;

/** Each control's press, what readies it (unthrottled) before each press, and what tidies after it. Indexes are latency.ts's, from 0. */
const steps: Record<(typeof CHAPTER_TWO_CONTROLS)[number], { press: Step; before?: Step; after?: Step }> = {
  "chart-room-code": { press: (page) => room(page).getByRole("button", { name: CHAPTER_ONE.code }).click(), after: (page) => page.keyboard.press("Escape") },
  // The move itself: Crespo's menu opens unthrottled, then "Move to top" and "Move to bottom" take turns.
  ports: {
    before: (page) => page.getByRole("button", { name: /^Reorder Crespo Island/ }).click(),
    press: (page, index) => page.getByRole("menu", { name: "Reorder Crespo Island" }).getByRole("menuitem", { name: index % 2 ? "Move to bottom" : "Move to top" }).click(),
  },
  departure: {
    before: (page) => page.getByRole("textbox", { name: CHART_ROOM.departure }).focus(),
    press: (page, index) => page.keyboard.press(index % 2 ? "Backspace" : "7"),
  },
  // The plot takes focus unthrottled; each press walks the tooltip to the next leg or back.
  legs: {
    before: (page) => room(page).getByRole("application", { name: CHART_ROOM.legs }).focus(),
    press: (page, index) => page.keyboard.press(index % 2 ? "ArrowLeft" : "ArrowRight"),
  },
  "catalogue-code": { press: (page) => catalogue(page).getByRole("button", { name: CHAPTER_ONE.code }).click(), after: (page) => page.keyboard.press("Escape") },
  sort: { press: (page, index) => catalogue(page).getByRole("radio", { name: index % 2 ? "Name" : "Depth" }).click() },
  filter: { press: (page) => catalogue(page).getByRole("combobox", { name: CATALOGUE.filter }).click(), after: (page) => page.keyboard.press("Escape") },
  // Focus reaching a name: its note opens after the hover card's delay, so the press is the move of focus.
  notes: {
    before: (page) => catalogue(page).getByRole("radio", { name: "Name" }).focus(),
    press: (page) => page.keyboard.press("Tab"),
    after: (page) => page.keyboard.press("Escape"),
  },
  classify: { press: (page) => page.getByRole("combobox", { name: CATALOGUE.classify }).click(), after: (page) => page.keyboard.press("Escape") },
  museum: { press: (page) => catalogue(page).getByRole("button", { name: CATALOGUE.museum }).click(), after: (page) => page.keyboard.press("Escape") },
};

/**
 * Each control's baseline: the highest median, in ms, of CI runs of this spec (every run prints its
 * samples). Re-measure and update a control's line when a change makes it faster or knowingly slower.
 */
const BASELINE_MEDIAN: Record<(typeof CHAPTER_TWO_CONTROLS)[number], number> = {
  "chart-room-code": 72,
  ports: 80,
  departure: 32,
  legs: 40,
  "catalogue-code": 72,
  sort: 48,
  filter: 32,
  notes: 24,
  classify: 40,
  museum: 72,
};

function presses(page: Page, id: (typeof CHAPTER_TWO_CONTROLS)[number]): Presses {
  const { press, before, after } = steps[id];
  return {
    press: (index) => press(page, index),
    setUp: async (index) => {
      if (after && index > 0) await after(page, index - 1);
      if (before) await before(page, index);
    },
  };
}

test.describe("Chapter II interaction latency", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");

  for (const id of CHAPTER_TWO_CONTROLS) {
    test(`${id} answers within ${LATENCY.p95} ms (p95 of ${LATENCY.samples}, median within ${medianCeiling(BASELINE_MEDIAN[id])} ms) on a ${LATENCY.throttle}× slower CPU`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page);
      expectWithinBudget(id, await measure(page, id, presses(page, id)), BASELINE_MEDIAN[id]);
    });
  }
});
