import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { pressTab } from "../../registry/ouro/e2e/ouro/story";
import { PRESET_NAMES, THEME_KEY } from "../src/themes/prepaint";
import { LOG, TANKS } from "../src/voyage/stage/copy";
import shipComponents from "../src/docs/ship-components.json" with { type: "json" };
import { SHIP_PAGES } from "../src/docs/ships";
import { auditPage } from "./audit";
import { diagnostics } from "./diagnostics";

// The voyage preview against the production build (site-design.md, "Verification in CI"): the
// stored theme paints before any JavaScript, every preset passes axe in light and dark, the page
// reflows at 320px, keeps control boundaries under forced colours, moves nothing under reduced
// motion, loads only the fonts it shows, and the header works from the keyboard.

async function store(page: Page, value: { preset?: string; mode?: string }): Promise<void> {
  await page.addInitScript(([key, json]) => localStorage.setItem(key, json), [THEME_KEY, JSON.stringify(value)] as const);
}

/** The two voyage pages: the home page (the stage, the ships, the themes) and the Nautilus's own (the story and Chapter I). */
const PAGES = ["./", "nautilus/"] as const;

async function open(page: Page, path: (typeof PAGES)[number] = "./"): Promise<void> {
  await page.goto(path);
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
  await bare.goto("./");
  await bare.waitForLoadState("load");
  expect(refused).toBe(1);
  await expect(bare.locator("html")).toHaveAttribute("data-theme", "abyss");
  await expect(bare.locator("html")).toHaveClass(/\bdark\b/);
  await expect(bare.locator("html[data-site-ready]")).toHaveCount(0);
  expect(await colours(bare)).toEqual(expected);
  // The picker's label and the pressed preset are the stored one's too, before any hydration.
  await expect(bare.locator("[data-site-theme-trigger]")).toHaveAccessibleName(/Abyss/);
  await expect(bare.locator("[data-site-theme-trigger]")).not.toHaveAccessibleName(/Pearl/);
  expect(await bare.locator("[data-site-sample] .site-window-bar").innerText()).toMatch(/^before-we-dive\.tsx\s+Abyss$/);
  await expect(bare.locator('[data-site-preset="abyss"]')).toHaveAttribute("aria-pressed", "true");
  await expect(bare.locator('[data-site-preset="pearl"]')).toHaveAttribute("aria-pressed", "false");
  await expect(bare.locator('[data-site-preset="abyss"]')).toHaveCSS("box-shadow", /inset/);
  await expect(bare.locator('[data-site-preset="pearl"]')).not.toHaveCSS("box-shadow", /inset/);
  await blocked.close();
});

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

test("reflows at 320 CSS pixels (400% zoom) in every preset without scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of PAGES) {
    for (const preset of PRESET_NAMES) {
      await store(page, { preset });
      await open(page, path);
      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(overflow.scroll, `${path} ${preset}`).toBeLessThanOrEqual(overflow.client);
    }
  }
});

/**
 * Parts that draw no boundary of their own under forced colours: none since the conformance matrix
 * (#133) gave segmented-control segments, the collapsible trigger and the reorderable handle one.
 * The test fails once any part loses its boundary.
 */
const FORCED_COLOURS_GAPS: string[] = [];

for (const path of PAGES) test(`keeps every control's boundary under forced colours${path === "./" ? "" : ` on ${path}`}`, async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, path);
  if (path === "./") {
    // The ship's log fold holds lines only once something happens, so make something happen. The
    // stage writes the line in a transition, after the switch's own paint, so the click returns
    // before it; scan once the crew's newest line says it (and the fold has it).
    await page.getByRole("switch", { name: "Forward tank", exact: true }).click();
    await expect(page.locator("[data-stage-crew]")).toContainText(LOG.tankFull(TANKS[0].noun, 1).text);
  } else {
    for (const chapter of ["chapter-one", "chapter-two", "chapter-three"]) {
      await page.locator(`#${chapter}`).scrollIntoViewIfNeeded();
      await expect(page.locator(`#${chapter}[data-chapter-ready]`)).toBeAttached();
    }
  }
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
        // track, a radio's circle), for an input inside it, the part that holds it (a slider's thumb),
        // or the frame just outside its own field (a Composer's frame around its plain text area).
        const own = element.getAttribute("data-ouro-control");
        const holders: Element[] = [];
        for (let node = element.parentElement; node; node = node.parentElement) {
          const root = node.getAttribute("data-ouro");
          if (root !== null && root !== "field" && root !== own) break;
          holders.push(node);
        }
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
  // real clock: a confirm dialog, which stays open until answered.
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
  await store(page, { preset: "pearl", mode: "light" });
  await open(page);
  const trigger = page.locator("[data-site-theme-trigger]");
  await page.locator("body").focus();
  for (const [role, name] of [
    ["link", "Ouro HX"],
    ["link", "The Nautilus"],
    ["link", "Docs"],
    ["link", "Components"],
    ["link", "GitHub"],
  ] as const) {
    await pressTab(page);
    await expect(page.getByRole("banner").getByRole(role, { name, exact: true })).toBeFocused();
  }
  await pressTab(page);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAccessibleName(/Theme: Pearl/);
  await page.keyboard.press("Enter");
  const popup = page.getByRole("dialog", { name: "Theme" });
  // real clock: the theme picker's popup stays open until it is closed; no timer ends it.
  await expect(popup).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await pressTab(page);
  await expect(page.getByRole("radio", { name: "Pearl" })).toBeFocused();
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

test("the old /voyage/ address sends the reader to the home page", async ({ page }) => {
  await page.goto("voyage/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

for (const path of PAGES) {
  test(`?xray turns X-ray on at load${path === "./" ? "" : ` on ${path}`}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${path}?xray`);
    await expect(page.locator("html[data-site-ready]")).toBeAttached();
    await expect(page.getByRole("switch", { name: "X-ray" })).toBeChecked();
    await expect(page.locator("[data-ouro-inspector-outline]").first()).toBeAttached();
  });
}

// Every component a docs page links on a ship page (ship-components.json, from the built pages'
// HTML) is one X-ray finds there and points out: on the screen, its outline the spotlit one.
for (const ship of SHIP_PAGES) {
  test(`?xray=<item> points out each component the docs link on ${ship.path}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const items = Object.entries(shipComponents.items).filter(([, paths]) => paths.includes(ship.path)).map(([item]) => item);
    expect(items.length).toBeGreaterThan(3);
    for (const item of items) {
      await page.goto(`.${ship.path}?xray=${item}`);
      await expect(page.locator("html[data-site-ready]")).toBeAttached();
      const bar = page.getByRole("region", { name: "X-ray" });
      await expect(bar.getByRole("status"), item).toHaveText(`Showing ${item}`);
      const spotlit = page.locator("[data-ouro-inspector-outline][data-spotlight]");
      await expect(spotlit, item).toHaveCount(1);
      await expect(spotlit.getByRole("link", { includeHidden: true }), item).toHaveText(item);
      await expect.poll(async () => {
        const box = await spotlit.boundingBox();
        return !!box && box.y < 900 && box.y + box.height > 0;
      }, { message: `${item} comes onto the screen` }).toBe(true);
    }
  });
}

test("the home page's Nautilus card leads to the Nautilus's page, with X-ray on from its X-ray link", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const card = page.locator("[data-site-ship='ship-nautilus']");
  await card.getByRole("link", { name: "X-ray it" }).click();
  await expect(page).toHaveURL(/\/nautilus\/\?xray$/);
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await expect(page.getByRole("switch", { name: "X-ray" })).toBeChecked();
});

test("typing nemo on the built page brings the Nautilus by with a toast, once a visit", async ({ page }) => {
  const errors = diagnostics(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "nautilus/");
  await page.keyboard.type("nemo");
  const nemo = page.locator('[data-egg="nemo"]');
  await expect(nemo.locator(".egg-ship svg")).toBeVisible();
  await expect(page.locator("[data-ouro-toast-title]", { hasText: "Captain Nemo waves hello!" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nemo).toHaveCount(0);
  await page.keyboard.type("nemo");
  await page.waitForTimeout(300);
  await expect(nemo).toHaveCount(0);
  expect(errors).toEqual([]);
});
