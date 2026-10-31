import { expect, test, type Page } from "@playwright/test";
import { diagnostics } from "./diagnostics";

// The Dive moment in the theme sample (site/src/voyage/dive/), against the production build: Dive
// takes the sample window under and back up, the crew says how it went, and the page is as it was;
// with reduced motion only opacity changes.

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("./");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await page.locator("[data-site-sample]").scrollIntoViewIfNeeded();
}

async function dive(page: Page): Promise<void> {
  await page.locator("[data-site-dive-trigger]").click();
  await page.getByRole("dialog", { name: "Dive to 300 fathoms?" }).getByRole("button", { name: "Dive", exact: true }).click();
}

const scene = (page: Page) => page.locator("[data-site-dive]");

test("Dive takes the sample window down to 300 fathoms and back, says how it went, and leaves the page as it was", async ({ page }) => {
  const errors = diagnostics(page);
  await open(page);
  // The dive's code is not in the page's first load: it comes when the dialog opens.
  const before = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  await dive(page);
  await expect(scene(page)).toBeVisible();
  const after = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
  expect(after.filter((name) => !before.includes(name) && /\/assets\/dive-[^/]+\.js$/.test(name))).toHaveLength(1);
  await expect(scene(page).locator(".dive-number")).toHaveText("300", { timeout: 10_000 });
  await expect(scene(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator("[data-ouro-toast-title]", { hasText: "Back from the deep" })).toBeVisible();
  // As it was: the checklist answers, and the dialog opens again.
  await page.getByRole("checkbox", { name: "Test the lantern" }).click();
  await expect(page.getByRole("checkbox", { name: "Test the lantern" })).toBeChecked();
  await page.locator("[data-site-dive-trigger]").click();
  await expect(page.getByRole("dialog", { name: "Dive to 300 fathoms?" })).toBeVisible();
  await page.getByRole("button", { name: "Not yet" }).click();
  expect(errors).toEqual([]);
});

test("Escape brings her up at once, and she dives again", async ({ page }) => {
  await open(page);
  await dive(page);
  await expect(scene(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(scene(page)).toHaveCount(0, { timeout: 2000 });
  await dive(page);
  await expect(scene(page)).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(scene(page)).toHaveCount(0, { timeout: 2000 });
});

test("with reduced motion the dive only fades: nothing in it moves", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __motion: string[] }).__motion = seen;
    const allowed = new Set(["offset", "computedOffset", "easing", "composite", "opacity", "color", "backgroundColor", "borderColor", "outlineColor", "fill", "stroke", "boxShadow"]);
    const watch = () => {
      for (const animation of document.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        for (const frame of effect?.getKeyframes() ?? []) {
          for (const property of Object.keys(frame)) if (!allowed.has(property)) seen.push(`${property} on ${(effect?.target as Element | null)?.className}`);
        }
      }
      requestAnimationFrame(watch);
    };
    watch();
  });
  await dive(page);
  await expect(scene(page)).toBeVisible();
  await expect(scene(page).locator(".dive-number")).toHaveText("300");
  await expect(scene(page)).toHaveCount(0, { timeout: 10_000 });
  expect(await page.evaluate(() => [...new Set((window as unknown as { __motion: string[] }).__motion)])).toEqual([]);
});
