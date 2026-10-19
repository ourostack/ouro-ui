import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { pressTab } from "../../registry/ouro/e2e/ouro/story";
import { PRESET_NAMES, THEME_KEY } from "../src/themes/prepaint";

// The voyage preview against the production build (site-design.md, "Verification in CI"): the
// stored theme paints before any JavaScript, every preset passes axe in light and dark, the page
// reflows at 320px, keeps control boundaries under forced colours, moves nothing under reduced
// motion, loads only the fonts it shows, and the header works from the keyboard.

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

/**
 * WebKit fetches a preloaded font again for its @font-face instead of using the preload, then warns
 * a few seconds after load that the preload went unused. Chromium uses it; the warning is WebKit's.
 */
const WEBKIT_UNUSED_FONT_PRELOAD = /^The resource \S+\/fonts\/[\w.-]+\.woff2 was preloaded using link preload but not used within a few seconds/;

function diagnostics(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if ((message.type() === "error" || message.type() === "warning") && !WEBKIT_UNUSED_FONT_PRELOAD.test(message.text())) errors.push(message.text());
  });
  return errors;
}

async function store(page: Page, value: { preset?: string; mode?: string }): Promise<void> {
  await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [THEME_KEY, JSON.stringify(value)] as const);
}

async function open(page: Page): Promise<void> {
  await page.goto("voyage/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
}

const colours = (page: Page) =>
  page.evaluate(() => ({
    background: getComputedStyle(document.body).backgroundColor,
    heading: getComputedStyle(document.querySelector("h1")!).color,
    font: getComputedStyle(document.querySelector("h1")!).fontFamily,
  }));

test("a stored preset paints from the server HTML, before the client entry runs", async ({ browser }) => {
  const manifest = JSON.parse(readFileSync(resolve("site/dist/.vite/manifest.json"), "utf8")) as Record<string, { file: string }>;
  const entry = manifest["index.html"]!.file;
  const hydrated = await browser.newContext();
  const page = await hydrated.newPage();
  await store(page, { preset: "abyss", mode: "dark" });
  await open(page);
  const expected = await colours(page);
  await hydrated.close();
  const plain = await browser.newContext();
  const fresh = await plain.newPage();
  await open(fresh);
  expect((await colours(fresh)).background, "Abyss dark differs from the default").not.toBe(expected.background);
  await plain.close();

  const blocked = await browser.newContext();
  const bare = await blocked.newPage();
  let refused = 0;
  await bare.route(`**/${entry}`, (route) => {
    refused++;
    return route.abort();
  });
  await store(bare, { preset: "abyss", mode: "dark" });
  await bare.goto("voyage/");
  await bare.waitForLoadState("load");
  expect(refused).toBe(1);
  await expect(bare.locator("html")).toHaveAttribute("data-theme", "abyss");
  await expect(bare.locator("html")).toHaveClass(/\bdark\b/);
  await expect(bare.locator("html[data-site-ready]")).toHaveCount(0);
  expect(await colours(bare)).toEqual(expected);
  await blocked.close();
});

test.describe("every preset, light and dark", () => {
  for (const preset of PRESET_NAMES) {
    for (const mode of ["light", "dark"] as const) {
      test(`${preset} ${mode} has zero axe violations on the built page`, async ({ page }) => {
        const errors = diagnostics(page);
        await page.setViewportSize({ width: 1440, height: 900 });
        await store(page, { preset, mode });
        await open(page);
        await page.evaluate(() => document.fonts.ready);
        await page.addScriptTag({ content: axeSource });
        const violations = await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } }).axe;
          const result = await axe.run({ exclude: [["[data-base-ui-focus-guard]"]] }, { resultTypes: ["violations"] });
          return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
        });
        expect(violations).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  }
});

test("reflows at 320 CSS pixels (400% zoom) in every preset without scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const preset of PRESET_NAMES) {
    await store(page, { preset });
    await open(page);
    const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(overflow.scroll, preset).toBeLessThanOrEqual(overflow.client);
  }
});

/**
 * HX parts that draw no boundary of their own under forced colours yet (a registry follow-up, noted
 * in the voyage PRs): a segmented control's segments sit in a group with no border, a message
 * list's scroller is a region, not a control, and a collapsible's trigger is a line of text with a
 * chevron (the ship's log fold). The test fails once one of them gains a boundary, so this list
 * only shrinks.
 */
const FORCED_COLOURS_GAPS = ["segmented-control/segment", "message-list/scroller", "collapsible/trigger"];

test("keeps every control's boundary under forced colours", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const bare = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main [data-ouro-control], header [data-ouro-control]")]
      .filter((element) => element.checkVisibility() && element.getBoundingClientRect().width > 1)
      .filter((element) => element.closest("a") === null && element.tagName !== "A")
      .filter((element) => {
        const outlined = (node: Element) => {
          const style = getComputedStyle(node);
          const border = ["Top", "Right", "Bottom", "Left"].some(
            (side) => parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== "none",
          );
          return border || (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0);
        };
        // A control's boundary may be drawn by the element itself, its visible box (a switch's
        // track, a radio's circle) or, for an input inside it, the part that holds it (a slider's thumb).
        const holders: Element[] = [];
        for (let node = element.parentElement; node && !node.hasAttribute("data-ouro"); node = node.parentElement) holders.push(node);
        return !outlined(element) && ![...element.querySelectorAll("*")].some(outlined) && !holders.some(outlined);
      })
      .map((element) => `${element.getAttribute("data-ouro-control")}/${element.getAttribute("data-ouro-part")}`),
  );
  expect([...new Set(bare)].sort()).toEqual([...FORCED_COLOURS_GAPS].sort());
});

test("moves nothing under reduced motion: repainting, the picker and the dialog only fade and change colour", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __motion: string[] }).__motion = seen;
    const allowed = new Set(["offset", "computedOffset", "easing", "composite", "opacity", "color", "backgroundColor", "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor", "fill", "stroke", "textDecorationColor", "boxShadow", "stopColor", "stopOpacity"]);
    const watch = () => {
      for (const animation of document.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        for (const frame of effect?.getKeyframes() ?? []) {
          for (const property of Object.keys(frame)) if (!allowed.has(property)) seen.push(`${property} on ${(effect?.target as Element | null)?.tagName}`);
        }
      }
      requestAnimationFrame(watch);
    };
    watch();
  });
  await page.getByRole("group", { name: "Presets" }).getByRole("button", { name: "Coral", exact: true }).click();
  await page.locator("[data-site-theme-trigger]").click();
  await page.getByRole("radio", { name: "Submerged" }).click();
  await page.keyboard.press("Escape");
  await page.locator("[data-site-dive-trigger]").click();
  await expect(page.getByRole("dialog", { name: "Dive to 300 fathoms?" })).toBeVisible();
  await page.getByRole("button", { name: "Not yet" }).click();
  await page.getByRole("checkbox", { name: "Fill the ballast tanks" }).click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => [...new Set((window as unknown as { __motion: string[] }).__motion)])).toEqual([]);
});

test("loads Geist and Geist Mono, and a preset's display face only once it is chosen", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    const match = /\/fonts\/([^/]+\.woff2)$/.exec(new URL(request.url()).pathname);
    if (match) requested.push(match[1]!);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.evaluate(() => document.fonts.ready);
  // WebKit fetches a preloaded font a second time (from cache) when the @font-face uses it.
  expect([...new Set(requested)].sort()).toEqual(["geist-5.3.0.woff2", "geist-mono-5.3.0.woff2"]);
  const loaded = () => page.evaluate(() => [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family.replaceAll('"', "")).sort());
  expect(await loaded()).toEqual(["Geist", "Geist Mono"]);
  await page.getByRole("group", { name: "Presets" }).getByRole("button", { name: "Abyss", exact: true }).click();
  await expect.poll(loaded).toEqual(["Geist", "Geist Mono", "Space Grotesk"]);
  expect(requested).toContain("space-grotesk-5.3.0.woff2");
  expect(requested.filter((file) => !/^(geist|geist-mono|space-grotesk)-/.test(file))).toEqual([]);
});

test("the header works from the keyboard: picker, mode, X-ray and the command palette, with focus returned", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await store(page, { preset: "sleek", mode: "light" });
  await open(page);
  const trigger = page.locator("[data-site-theme-trigger]");
  await page.locator("body").focus();
  for (const [role, name] of [
    ["link", "Ouro HX"],
    ["link", "Docs"],
    ["link", "Components"],
    ["link", "GitHub"],
  ] as const) {
    await pressTab(page);
    await expect(page.getByRole("banner").getByRole(role, { name, exact: true })).toBeFocused();
  }
  await pressTab(page);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAccessibleName(/Theme: Sleek/);
  await page.keyboard.press("Enter");
  const popup = page.getByRole("dialog", { name: "Theme" });
  await expect(popup).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await pressTab(page);
  await expect(page.getByRole("radio", { name: "Sleek" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "abyss");
  await pressTab(page);
  await expect(page.getByRole("radio", { name: "Surfaced" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(trigger).toBeFocused();
  await pressTab(page);
  const xray = page.getByRole("switch", { name: "X-ray" });
  await expect(xray).toBeFocused();
  await page.keyboard.press("Space");
  await expect(xray).toBeChecked();
  await expect(page.locator("[data-ouro-inspector-outline]").first()).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(xray).not.toBeChecked();
  await pressTab(page);
  const search = page.getByRole("button", { name: /Search/ });
  await expect(search).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Search commands" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search).toBeFocused();
  expect(JSON.parse((await page.evaluate((key) => localStorage.getItem(key), THEME_KEY))!)).toEqual({ preset: "abyss", mode: "dark" });
});
