import { expect, test, type Page } from "@playwright/test";
import { THEME_KEY } from "../src/themes/prepaint";
import { auditPage } from "./audit";
import { diagnostics } from "./diagnostics";

// Live, at each of its skies in light and dark, passes the strict audit on the home page. Split from voyage.spec.ts, whose
// shard it held past the pull request budget, so each goes to an end-to-end shard of its own.

async function store(page: Page, value: { preset?: string; mode?: string }): Promise<void> {
  await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [THEME_KEY, JSON.stringify(value)] as const);
}

async function open(page: Page, path = "./"): Promise<void> {
  await page.goto(path);
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
}

/** Live at each of its four skies (themes/live.ts), on a clock pinned in New York in late October. */
const LIVE_MODES = ["light", "dark"] as const;
const SKIES = { dawn: "2026-10-31T07:10:00-04:00", day: "2026-10-31T12:00:00-04:00", dusk: "2026-10-31T17:50:00-04:00", night: "2026-10-31T22:30:00-04:00" } as const;

test.describe("Live, at every sky, light and dark", () => {
  test.use({ timezoneId: "America/New_York" });
  for (const [sky, time] of Object.entries(SKIES)) {
    for (const mode of LIVE_MODES) {
      test(`Live at ${sky}, ${mode}, passes the strict audit on the built page`, async ({ page, browserName }) => {
        test.slow(browserName === "webkit");
        const errors = diagnostics(page);
        await page.clock.setFixedTime(new Date(time));
        await page.setViewportSize({ width: 1440, height: 900 });
        await store(page, { preset: "live", mode });
        await open(page);
        await expect(page.locator("html")).toHaveAttribute("data-sky", sky);
        await expect(page.locator("html")).toHaveAttribute("data-theme", "pearl");
        await expect(page.locator('.site-hero [data-site-preset="live"]')).toHaveAttribute("aria-pressed", "true");
        await page.evaluate(() => document.fonts.ready);
        const report = await auditPage(page, browserName);
        expect(report).toBe("");
        expect(errors).toEqual([]);
      });
    }
  }

  test("picking a preset ends Live, and picking Live brings the sky back", async ({ page }) => {
    await page.clock.setFixedTime(new Date(SKIES.dusk));
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page);
    await expect(page.locator("html")).not.toHaveAttribute("data-live", /.*/);
    const dots = page.getByRole("group", { name: "Theme", exact: true });
    await dots.getByRole("button", { name: "Live", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-sky", "dusk");
    await expect(page.locator("#ouro-live")).toHaveCount(1);
    await dots.getByRole("button", { name: "Coral", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "coral");
    await expect(page.locator("html")).not.toHaveAttribute("data-live", /.*/);
    await expect(page.locator("#ouro-live")).toHaveCount(0);
  });
});
