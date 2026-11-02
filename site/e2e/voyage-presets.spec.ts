import { expect, test, type Page } from "@playwright/test";
import { PRESET_NAMES, THEME_KEY } from "../src/themes/prepaint";
import { auditPage } from "./audit";
import { diagnostics } from "./diagnostics";

// Every preset, light and dark, passes the strict audit on both voyage pages. Split from voyage.spec.ts, whose
// shard it held past the pull request budget, so each goes to an end-to-end shard of its own.

async function store(page: Page, value: { preset?: string; mode?: string }): Promise<void> {
  await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [THEME_KEY, JSON.stringify(value)] as const);
}

async function open(page: Page, path = "./"): Promise<void> {
  await page.goto(path);
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
}

/** The two voyage pages: the home page and the Nautilus's own. */
const PAGES = ["./", "nautilus/"] as const;

test.describe("every preset, light and dark", () => {
  for (const path of PAGES) {
    for (const preset of PRESET_NAMES) {
      for (const mode of ["light", "dark"] as const) {
        test(`${preset} ${mode} passes the strict audit on the built page${path === "./" ? "" : ` ${path}`}`, async ({ page, browserName }) => {
          // The strict audit of the whole page takes WebKit 10 to 30 seconds on CI runners, by how busy they are.
          test.slow(browserName === "webkit");
          const errors = diagnostics(page);
          await page.setViewportSize({ width: 1440, height: 900 });
          await store(page, { preset, mode });
          await open(page, path);
          await page.evaluate(() => document.fonts.ready);
          // Every violation fails whatever its impact, and so does every check axe could not decide
          // unless the kit measures it.
          expect(await auditPage(page, browserName)).toBe("");
          expect(errors).toEqual([]);
        });
      }
    }
  }
});
