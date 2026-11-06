import { expect, test, type Page } from "@playwright/test";
import { pressTab } from "../../registry/ouro/e2e/ouro/story";
import { APPLE_PATHS } from "../src/paths";

// The site's one menu on a phone (src/voyage/site-menu.tsx): the header's menu button is the only control that opens
// navigation, on every kind of page, and nothing inside the open menu opens another. It closes on a choice, a tap
// outside and Escape, keeps focus inside while open and gives it back to its button.

const PHONE = { width: 390, height: 844 };

/** Every kind of page, with the navigation landmarks it shows on a phone besides the header's (hidden) one. */
const PAGES: ReadonlyArray<{ path: string; navs: string[] }> = [
  { path: "./", navs: ["Footer"] },
  { path: "nautilus/", navs: ["Chapters", "Footer"] },
  { path: "ax/", navs: ["Footer"] },
  ...APPLE_PATHS.map((path) => ({ path: path.slice(1), navs: ["Footer"] })),
  { path: "docs/", navs: ["Footer"] },
  { path: "docs/installing/", navs: ["Footer"] },
  { path: "docs/button/", navs: ["Footer"] },
];

async function open(page: Page, path: string): Promise<void> {
  await page.setViewportSize(PHONE);
  await page.goto(path);
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
}

/** The menu's sheet: the dialog that holds the site's navigation. */
const sheet = (page: Page) => page.locator("[role='dialog']", { has: page.getByRole("navigation", { name: "Site" }) });
const menuButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: "Menu", exact: true });

/**
 * The shown controls under `root` that open something: a button with a popup or an expanded state, or a disclosure.
 * The theme picker opens a popover of themes, not navigation, so it is left out.
 */
async function openers(page: Page, root: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const shown = (element: Element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
    };
    return [...document.querySelectorAll(selector)]
      .flatMap((scope) => [...scope.querySelectorAll("button[aria-haspopup], button[aria-expanded], [role='button'][aria-haspopup], [role='button'][aria-expanded], summary")])
      .filter((element) => shown(element) && !element.closest("[data-site-theme-trigger]"))
      .map((element) => element.getAttribute("aria-label") ?? element.textContent!.trim());
  }, root);
}

/** Opens the menu and waits for it to slide into place. The docs' header is an island, so its button works once it has hydrated. */
async function openMenu(page: Page): Promise<void> {
  await expect(async () => {
    await menuButton(page).click();
    // real clock: the menu stays open until it is closed; no timer ends it.
    await expect(sheet(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
  await settled(page);
}

/** The sheet has finished moving: nothing animates on it, and two reads of its place agree. */
async function settled(page: Page): Promise<void> {
  const place = () => sheet(page).evaluate((element) => (element.getAnimations({ subtree: true }).length > 0 ? "moving" : `${element.getBoundingClientRect().x}`));
  let last = "";
  await expect
    .poll(async () => {
      const now = await place();
      const same = now !== "moving" && now === last;
      last = now;
      return same;
    })
    .toBe(true);
}

for (const { path, navs } of PAGES) {
  test(`on a phone, /${path} has one menu, and nothing in it opens another`, async ({ page }) => {
    await open(page, path);
    // The page's navigation chrome: the header and any navigation or sidebar outside the page's own content.
    expect(await openers(page, "header, nav, aside")).toEqual(["Menu"]);
    const shownNavs = await page.getByRole("navigation").evaluateAll((elements) =>
      elements.filter((element) => element.getBoundingClientRect().height > 0).map((element) => element.getAttribute("aria-label")),
    );
    expect(shownNavs).toEqual(navs);
    await openMenu(page);
    expect(await openers(page, "[role='dialog']")).toEqual([]);
    // The page you are on is marked, once.
    await expect(sheet(page).locator('[aria-current="page"]')).toHaveCount(1);
    await expect(sheet(page).locator('[aria-current="page"]')).toBeInViewport();
    // Nothing sticks out of the window sideways.
    const box = (await sheet(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
  });
}

test("on a phone the menu lists each section's pages, the Apple pages from their own list", async ({ page }) => {
  await open(page, "apple/hx/");
  await openMenu(page);
  const links = await sheet(page).getByRole("link").evaluateAll((elements) => elements.map((element) => new URL((element as HTMLAnchorElement).href).pathname));
  for (const path of APPLE_PATHS) expect(links).toContain(path);
  for (const path of ["/", "/nautilus/", "/ax/", "/docs/installing/", "/docs/"]) expect(links).toContain(path);
  await expect(sheet(page).getByRole("link", { name: "Ouro HX for Apple" })).toHaveAttribute("aria-current", "page");
});

test("on a docs page the menu holds every component, with the filter", async ({ page }) => {
  await open(page, "docs/button/");
  await openMenu(page);
  // Opening it does not put the keyboard up: focus starts on a link, not the filter.
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("INPUT");
  await expect(sheet(page).getByRole("link", { name: "Button", exact: true })).toHaveAttribute("aria-current", "page");
  await sheet(page).getByRole("searchbox", { name: "Filter components" }).fill("segmented");
  await expect(sheet(page).getByRole("link", { name: "SegmentedControl" })).toBeVisible();
  await expect(sheet(page).getByRole("link", { name: "Toggle", exact: true })).toHaveCount(0);
});

test("on a phone the menu closes on a choice, and Back returns to the page with it closed", async ({ page }) => {
  await open(page, "./");
  await openMenu(page);
  await sheet(page).getByRole("link", { name: "Ouro AX", exact: true }).click();
  await expect(page).toHaveURL(/\/ax\/$/);
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await expect(sheet(page)).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await expect(sheet(page)).toHaveCount(0);
  await expect(menuButton(page)).toHaveAttribute("aria-expanded", "false");
});

test("on a phone the menu closes on a tap outside it, and on Escape, with focus back on its button", async ({ page }) => {
  await open(page, "docs/button/");
  await openMenu(page);
  const box = (await sheet(page).boundingBox())!;
  await page.mouse.click(Math.round((box.x + box.width + PHONE.width) / 2), PHONE.height / 2);
  await expect(sheet(page)).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(0);

  await openMenu(page);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
});

test("on a phone the open menu keeps focus inside it, both ways round", async ({ page }) => {
  await open(page, "apple/");
  await menuButton(page).focus();
  await page.keyboard.press("Enter");
  // real clock: the menu stays open until it is closed; no timer ends it.
  await expect(sheet(page)).toBeVisible();
  await settled(page);
  const stops = await sheet(page).locator("a[href], button, input").count();
  const inside = () => page.evaluate(() => Boolean(document.activeElement?.closest("[role='dialog']")));
  for (let step = 0; step < stops + 2; step += 1) {
    await pressTab(page);
    // Base UI's focus guards, just outside the sheet, hand focus straight back in.
    await expect.poll(inside).toBe(true);
  }
  for (let step = 0; step < stops + 2; step += 1) {
    await page.keyboard.press("Shift+Tab");
    await expect.poll(inside).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(menuButton(page)).toBeFocused();
});

test("on a wide screen the bar keeps its links, and the docs sidebar and the Apple pages' row stay", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("apple/hx/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await expect(menuButton(page)).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Ouro UI for Apple" })).toBeVisible();
  await page.goto("docs/button/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await expect(page.getByRole("navigation", { name: "Docs" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Components", exact: true })).toHaveAttribute("aria-current", "page");
});
