import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import themes from "../src/themes/themes.json" with { type: "json" };

// The copy-theme install proof (site-design.md, "Verification in CI"): for each preset, the CSS the
// voyage page's Copy theme button puts on the clipboard, pasted at the end of a clean shadcn app's
// stylesheet with Checklist and Dialog installed (site/scripts/theme-install-test.sh), renders the
// same computed colour, background, radius, font family and shadow as the site, light and dark,
// a portaled Dialog included, and the browser reports the preset's faces as loaded.

const fontsDir = join(import.meta.dirname, "../public/fonts");
const PROPERTIES = ["color", "background-color", "border-radius", "font-family", "box-shadow"] as const;

/** The sample elements, found the same way on both pages. */
const SAMPLES: Array<[string, (page: Page) => ReturnType<Page["locator"]>]> = [
  ["checklist", (page) => page.locator('[data-ouro="checklist"]').first()],
  ["checklist label", (page) => page.locator('[data-ouro="checklist"]').getByText("Before we dive", { exact: true })],
  ["checked box", (page) => page.getByRole("checkbox", { name: "Close the hatch" })],
  ["unchecked box", (page) => page.getByRole("checkbox", { name: "Fill the ballast tanks" })],
  ["clear button", (page) => page.getByRole("button", { name: "Clear checked", exact: true })],
  ["primary button", (page) => page.getByRole("button", { name: "Ready to dive?", exact: true })],
];
const dive = (page: Page) => page.getByRole("dialog", { name: "Dive to 300 fathoms?" });
const DIALOG: Array<[string, (page: Page) => ReturnType<Page["locator"]>]> = [
  ["dialog", dive],
  ["dialog title", (page) => dive(page).getByRole("heading", { name: "Dive to 300 fathoms?" })],
  ["dialog description", (page) => dive(page).getByText("The lantern stays on.", { exact: false })],
  ["dialog action", (page) => dive(page).getByRole("button", { name: "Dive", exact: true })],
  ["dialog cancel", (page) => dive(page).getByRole("button", { name: "Not yet", exact: true })],
];

async function serveFonts(context: BrowserContext): Promise<void> {
  // The copied CSS names the fonts on Pages; this build's files stand in for them, with Pages' CORS header.
  await context.route("https://ourostack.github.io/ouro-ui/fonts/*", (route) =>
    route.fulfill({
      body: readFileSync(join(fontsDir, new URL(route.request().url()).pathname.split("/").pop()!)),
      headers: { "content-type": "font/woff2", "access-control-allow-origin": "*" },
    }),
  );
}

async function styles(page: Page, samples: typeof SAMPLES): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [name, find] of samples) {
    const element = find(page);
    await expect(element, name).toBeVisible();
    out[name] = await element.evaluate(
      (node, properties) => Object.fromEntries(properties.map((property) => [property, getComputedStyle(node).getPropertyValue(property)])),
      [...PROPERTIES],
    );
  }
  return out;
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  // Endless animations (the stage's drifting fish) never settle; everything else must.
  await expect
    .poll(() =>
      page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running" && animation.effect?.getComputedTiming().iterations !== Infinity).length),
    )
    .toBe(0);
}

/** The sample on a page, closed and with its Dialog open, then the Dialog closed again. */
async function measure(page: Page): Promise<{ closed: Record<string, Record<string, string>>; open: Record<string, Record<string, string>> }> {
  await settle(page);
  const closed = await styles(page, SAMPLES);
  await page.getByRole("button", { name: "Ready to dive?", exact: true }).click();
  await settle(page);
  const open = await styles(page, DIALOG);
  await page.keyboard.press("Escape");
  await expect(dive(page)).toBeHidden();
  return { closed, open };
}

for (const preset of themes) {
  for (const mode of ["light", "dark"] as const) {
    test(`${preset.label} ${mode}: the copied theme renders in a clean shadcn app as on the site`, async ({ browser }) => {
      const site = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
      const page = await site.newPage();
      await page.addInitScript((value) => localStorage.setItem("ouro-site-theme", value), JSON.stringify({ preset: preset.name, mode }));
      await page.goto("ouro-ui/voyage/");
      await expect(page.locator("html[data-site-ready]")).toBeAttached();
      // What the button copies is what the app was built with.
      await page.getByRole("button", { name: "Copy theme", exact: true }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(preset.css.theme);
      await page.locator("[data-site-sample]").scrollIntoViewIfNeeded();
      const expected = await measure(page);
      await site.close();

      const app = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await serveFonts(app);
      const installed = await app.newPage();
      const errors: string[] = [];
      installed.on("pageerror", (error) => errors.push(error.message));
      await installed.goto(`app/${preset.name}/`);
      if (mode === "dark") await installed.evaluate(() => document.documentElement.classList.add("dark"));
      await expect(installed.getByRole("button", { name: "Ready to dive?", exact: true })).toBeVisible();
      const actual = await measure(installed);
      expect(actual).toEqual(expected);
      // The faces load from the copied @font-face rules, not just name a family.
      const heading = preset.heading;
      await installed.getByRole("button", { name: "Ready to dive?", exact: true }).click();
      await settle(installed);
      const loaded = await installed.evaluate(() => [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family.replaceAll('"', "")));
      expect(loaded).toContain("Geist");
      expect(loaded).toContain(heading);
      expect(errors).toEqual([]);
      await app.close();
    });
  }
}
