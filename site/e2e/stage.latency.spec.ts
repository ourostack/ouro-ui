import { expect, test, type Page } from "@playwright/test";
import { STAGE_CONTROLS, STAGE_COPY, TANKS } from "../src/voyage/stage/copy";
import { LATENCY, expectWithinBudget, measure, medianCeiling, type Presses } from "./latency";

// Each stage control answers within budget, click to next paint, on a slower CPU: latency.ts holds
// the budget (of 20 presses after two warm-ups at 4× throttle, the p95 within 100 ms and the median
// within its ceiling from the baselines below) and the measurement. Run
// alone, one worker, by `pnpm test:latency` (playwright.latency.config.ts) and CI's latency job:
// beside other workers the runner's CPU is shared and the numbers measure the neighbours.

async function open(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
}

const tank = (page: Page, name: string) => page.getByRole("switch", { name, exact: true });
const diveButton = (page: Page) => page.getByRole("button", { name: STAGE_COPY.dive, exact: true });

async function fillTanks(page: Page): Promise<void> {
  for (const { name } of TANKS) await tank(page, name).click();
}

/**
 * Each control's baseline: the highest median, in ms, of six CI runs of this spec (#134, 2026-10-20;
 * every run prints its samples). Re-measure and update a control's line when a change makes it
 * faster or knowingly slower.
 */
const BASELINE_MEDIAN: Record<(typeof STAGE_CONTROLS)[number], number> = {
  xray: 64,
  depth: 72,
  speed: 48,
  "tank-fore": 56,
  "tank-middle": 56,
  "tank-aft": 56,
  dive: 64,
  lights: 56,
  log: 48,
  bell: 40,
};

test.describe("interaction latency", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");

  /** Each control's presses, repeatable as many times in a row as the budget measures. */
  const controls: Record<(typeof STAGE_CONTROLS)[number], (page: Page) => Presses> = {
    // X-ray's press turns it on; switching it off again is set-up.
    xray: (page) => ({
      press: () => page.locator("[data-stage-control='xray']").getByRole("button", { name: STAGE_COPY.xray }).click(),
      setUp: async (index) => {
        if (index > 0) await page.getByRole("switch", { name: "X-ray" }).click();
      },
    }),
    depth: (page) => ({
      press: async (index) => {
        await page.getByRole("slider", { name: STAGE_COPY.depth }).focus();
        await page.keyboard.press(index % 2 ? "ArrowLeft" : "ArrowRight");
      },
    }),
    "tank-fore": (page) => ({ press: () => tank(page, TANKS[0].name).click() }),
    "tank-middle": (page) => ({ press: () => tank(page, TANKS[1].name).click() }),
    "tank-aft": (page) => ({ press: () => tank(page, TANKS[2].name).click() }),
    // Dive, then Surface (which empties the tanks), so each Dive needs the tanks filled first.
    dive: (page) => ({
      press: (index) => (index % 2 === 0 ? diveButton(page) : page.getByRole("button", { name: STAGE_COPY.surface, exact: true })).click(),
      setUp: async (index) => {
        if (index % 2 === 0) await fillTanks(page);
      },
    }),
    speed: (page) => ({ press: (index) => page.getByRole("radio", { name: index % 2 ? "Half" : "Full" }).click() }),
    lights: (page) => ({ press: () => page.getByRole("switch", { name: STAGE_COPY.lights }).click() }),
    // The fold holds lines once something has happened.
    log: (page) => ({
      prepare: () => page.getByRole("radio", { name: "Full" }).click(),
      press: () => page.getByRole("button", { name: /^Ship's log \(/ }).click(),
    }),
    bell: (page) => ({ press: () => page.getByRole("button", { name: STAGE_COPY.bell }).click() }),
  };

  for (const id of STAGE_CONTROLS) {
    test(`${id} answers within ${LATENCY.p95} ms (p95 of ${LATENCY.samples}, median within ${medianCeiling(BASELINE_MEDIAN[id])} ms) on a ${LATENCY.throttle}× slower CPU`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page);
      expectWithinBudget(id, await measure(page, id, controls[id](page)), BASELINE_MEDIAN[id]);
    });
  }
});
