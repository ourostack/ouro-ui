import { expect, test, type Page } from "@playwright/test";
import { CHAPTER_THREE_CONTROLS, ENCOUNTER, ORDERS, SALOON } from "../src/voyage/chapters/chapter-three-copy";
import { CHAPTER_ONE } from "../src/voyage/chapters/copy";
import { LATENCY, expectWithinBudget, measure, medianCeiling, type Presses } from "./latency";

// Each Chapter III control answers within budget, click to next paint, on a slower CPU, as
// chapter-one.latency.spec.ts holds Chapter I's: latency.ts holds the budget and the measurement. A
// press's set-up (opening the dialog before a choice, winning the fight before the organ) runs and
// settles unthrottled, so only the press is measured. An order changes the fight at once, and the
// porthole redraws from a task after the press's frame has painted (useAfterPaint), so no press
// waits on the porthole; ORDER_PRESSES measures the orders that change it. The two links' presses are measured
// with their navigation held back, so the page that answers is this one.

async function open(page: Page): Promise<void> {
  await page.goto("nautilus/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.locator("#chapter-three").scrollIntoViewIfNeeded();
  await expect(page.locator("#chapter-three[data-chapter-ready]")).toBeAttached();
}

const encounter = (page: Page) => page.locator("[data-composition='encounter']");
const saloon = (page: Page) => page.locator("[data-composition='saloon']");
const alarm = (page: Page) => encounter(page).getByRole("button", { name: ENCOUNTER.alarm });

async function giveOrder(page: Page, name: string): Promise<void> {
  await encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name, exact: true }).click();
  await expect(page.getByRole("menu")).toBeHidden();
}

/** Up, the feathers, and the organ: the saloon offers the way on. */
async function finish(page: Page): Promise<void> {
  if (await saloon(page).locator("[data-chapter-next]").count()) return;
  await giveOrder(page, ORDERS.surface);
  await giveOrder(page, ORDERS.feathers);
  await saloon(page).getByRole("button", { name: SALOON.play }).click();
  await saloon(page).locator("[data-chapter-next]").waitFor();
}

/** Holds back a link's navigation, so its press can be measured on this page. */
const holdLinks = (page: Page) => page.evaluate(() => document.addEventListener("click", (event) => (event.target as Element).closest("a") && event.preventDefault(), { capture: true }));

type Step = (page: Page, index: number) => Promise<unknown>;

const steps: Record<(typeof CHAPTER_THREE_CONTROLS)[number], { press: Step; before?: Step; after?: Step }> = {
  "encounter-code": { press: (page) => encounter(page).getByRole("button", { name: CHAPTER_ONE.code }).click(), after: (page) => page.keyboard.press("Escape") },
  alarm: { press: (page) => alarm(page).click(), after: (page) => page.keyboard.press("Escape") },
  orders: { press: (page) => encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true }).click(), after: (page) => page.keyboard.press("Escape") },
  palette: { press: (page) => encounter(page).getByRole("button", { name: ENCOUNTER.palette }).click(), after: (page) => page.keyboard.press("Escape") },
  // The choices in the dialog: it opens unthrottled, then the choice closes it and gives the order.
  feathers: { before: (page) => alarm(page).click(), press: (page) => page.getByRole("dialog").getByRole("button", { name: ORDERS.feathers }).click() },
  surface: { before: (page) => alarm(page).click(), press: (page) => page.getByRole("dialog").getByRole("button", { name: ENCOUNTER.hope }).click() },
  "saloon-code": { press: (page) => saloon(page).getByRole("button", { name: CHAPTER_ONE.code }).click(), after: (page) => page.keyboard.press("Escape") },
  // The fight is won unthrottled, the organ played, then Sail again (unthrottled) readies the next.
  organ: {
    before: async (page) => {
      await giveOrder(page, ORDERS.surface);
      await giveOrder(page, ORDERS.feathers);
    },
    press: (page) => saloon(page).getByRole("button", { name: SALOON.play }).click(),
    after: (page) => saloon(page).getByRole("button", { name: SALOON.again }).click(),
  },
  install: { before: async (page) => (await finish(page), holdLinks(page)), press: (page) => saloon(page).getByRole("link", { name: SALOON.install }).click() },
  components: { before: async (page) => (await finish(page), holdLinks(page)), press: (page) => saloon(page).getByRole("link", { name: SALOON.components }).click() },
  again: { before: finish, press: (page) => saloon(page).getByRole("button", { name: SALOON.again }).click() },
};

/**
 * Each control's baseline: the highest median, in ms, of CI runs of this spec (every run prints its
 * samples). Re-measure and update a control's line when a change makes it faster or knowingly slower.
 */
const BASELINE_MEDIAN: Record<(typeof CHAPTER_THREE_CONTROLS)[number], number> = {
  "encounter-code": 48,
  alarm: 48,
  orders: 64,
  palette: 48,
  feathers: 40,
  surface: 40,
  "saloon-code": 48,
  organ: 64,
  install: 24,
  components: 24,
  again: 56,
};

function presses(page: Page, id: (typeof CHAPTER_THREE_CONTROLS)[number]): Presses {
  const { press, before, after } = steps[id];
  return {
    press: (index) => press(page, index),
    setUp: async (index) => {
      if (after && index > 0) await after(page, index - 1);
      if (before) await before(page, index);
    },
  };
}

/**
 * The orders themselves, beside the controls that offer them: an item chosen in the open Menu
 * (Floodlights, which turns the porthole's beam on and off at each press) and Enter in the palette
 * with the same order found. Each changes the porthole, which must redraw after the press's paint.
 */
const ORDER_PRESSES = {
  "orders, an item": {
    press: (page: Page) => page.getByRole("menuitemcheckbox", { name: ORDERS.lights }).click(),
    before: (page: Page) => encounter(page).getByRole("button", { name: ENCOUNTER.orders, exact: true }).click(),
    after: (page: Page) => page.keyboard.press("Escape"),
  },
  "palette, Enter": {
    press: (page: Page) => page.keyboard.press("Enter"),
    before: async (page: Page) => {
      await encounter(page).getByRole("button", { name: ENCOUNTER.palette }).click();
      await page.keyboard.type("flood");
    },
  },
} satisfies Record<string, { press: Step; before?: Step; after?: Step }>;

const ORDER_BASELINE: Record<keyof typeof ORDER_PRESSES, number> = {
  "orders, an item": 56,
  "palette, Enter": 64,
};

test.describe("Chapter III interaction latency", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");

  for (const id of CHAPTER_THREE_CONTROLS) {
    test(`${id} answers within ${LATENCY.p95} ms (p95 of ${LATENCY.samples}, median within ${medianCeiling(BASELINE_MEDIAN[id])} ms) on a ${LATENCY.throttle}× slower CPU`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page);
      expectWithinBudget(id, await measure(page, id, presses(page, id)), BASELINE_MEDIAN[id]);
    });
  }

  for (const [id, step] of Object.entries(ORDER_PRESSES) as [keyof typeof ORDER_PRESSES, { press: Step; before?: Step; after?: Step }][]) {
    test(`${id} answers within ${LATENCY.p95} ms (p95 of ${LATENCY.samples}, median within ${medianCeiling(ORDER_BASELINE[id])} ms) on a ${LATENCY.throttle}× slower CPU, the porthole redrawn after`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page);
      const samples = await measure(page, id, {
        press: (index) => step.press(page, index),
        setUp: async (index) => {
          if (step.after && index > 0) await step.after(page, index - 1);
          if (step.before) await step.before(page, index);
        },
      });
      expectWithinBudget(id, samples, ORDER_BASELINE[id]);
    });
  }
});
