import { expect, test, type Page } from "@playwright/test";
import { CHAPTER_THREE_CONTROLS, ENCOUNTER, ORDERS, SALOON } from "../src/voyage/chapters/chapter-three-copy";
import { CHAPTER_ONE } from "../src/voyage/chapters/copy";
import { LATENCY, expectWithinBudget, measure, medianCeiling, type Presses } from "./latency";

// Each Chapter III control answers within budget, click to next paint, on a slower CPU, as
// chapter-one.latency.spec.ts holds Chapter I's: latency.ts holds the budget and the measurement. A
// press's set-up (opening the dialog before a choice, winning the fight before the organ) runs and
// settles unthrottled, so only the press is measured. An order runs as a transition after the
// control's own repaint, so no press waits on the porthole. The two links' presses are measured
// with their navigation held back, so the page that answers is this one.

async function open(page: Page): Promise<void> {
  await page.goto("voyage/");
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

/** Up, the axes, and the organ: the saloon offers the way on. */
async function finish(page: Page): Promise<void> {
  if (await saloon(page).locator("[data-chapter-next]").count()) return;
  await giveOrder(page, ORDERS.surface);
  await giveOrder(page, ORDERS.axes);
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
  axes: { before: (page) => alarm(page).click(), press: (page) => page.getByRole("dialog").getByRole("button", { name: ORDERS.axes }).click() },
  surface: { before: (page) => alarm(page).click(), press: (page) => page.getByRole("dialog").getByRole("button", { name: ENCOUNTER.hope }).click() },
  "saloon-code": { press: (page) => saloon(page).getByRole("button", { name: CHAPTER_ONE.code }).click(), after: (page) => page.keyboard.press("Escape") },
  // The fight is won unthrottled, the organ played, then Sail again (unthrottled) readies the next.
  organ: {
    before: async (page) => {
      await giveOrder(page, ORDERS.surface);
      await giveOrder(page, ORDERS.axes);
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
  "encounter-code": 72,
  alarm: 72,
  orders: 48,
  palette: 72,
  axes: 64,
  surface: 64,
  "saloon-code": 72,
  organ: 48,
  install: 24,
  components: 24,
  again: 48,
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

test.describe("Chapter III interaction latency", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");

  for (const id of CHAPTER_THREE_CONTROLS) {
    test(`${id} answers within ${LATENCY.p95} ms (p95 of ${LATENCY.samples}, median within ${medianCeiling(BASELINE_MEDIAN[id])} ms) on a ${LATENCY.throttle}× slower CPU`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page);
      expectWithinBudget(id, await measure(page, id, presses(page, id)), BASELINE_MEDIAN[id]);
    });
  }
});
