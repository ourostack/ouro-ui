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
  { path: "docs/ax-cli/", navs: ["Footer"] },
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
    // Once the sheet is open its backdrop covers the button, and a second press would close it.
    // A button that says open with no sheet to show for it is pressed again, closing it, and the next try opens it.
    const expanded = (await menuButton(page).getAttribute("aria-expanded")) === "true";
    if (!expanded || (await sheet(page).count()) === 0) await menuButton(page).click({ timeout: 1000 });
    // real clock: the menu stays open until it is closed; no timer ends it.
    await expect(sheet(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
  await settled(page);
}

/** The sheet has finished moving: nothing animates on it (the "you're here" ping inside may go on), and two reads of its place agree. */
async function settled(page: Page): Promise<void> {
  const place = () => sheet(page).evaluate((element) => (element.getAnimations().length > 0 ? "moving" : `${element.getBoundingClientRect().x}`));
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

test("on a docs page the menu holds every component, with a search for any docs page", async ({ page }) => {
  await open(page, "docs/button/");
  await openMenu(page);
  // Opening it does not put the keyboard up: focus starts on the sheet, not the search.
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("INPUT");
  await expect(sheet(page).getByRole("link", { name: "Button", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(sheet(page).getByRole("link", { name: "SegmentedControl", exact: true })).toBeAttached();
  const search = sheet(page).getByRole("searchbox", { name: "Find a docs page" });
  await search.fill("segmented");
  await expect(sheet(page).getByRole("link", { name: "SegmentedControl", exact: true })).toBeVisible();
  await expect(sheet(page).getByRole("link", { name: "Toggle", exact: true })).toHaveCount(0);
  for (const [query, name] of [["install", "Installing"], ["shadcn", "Switching from shadcn"], ["nautilus", "The Nautilus"]] as const) {
    await search.fill(query);
    await expect(sheet(page).getByRole("link", { name, exact: true })).toBeVisible();
  }
  // "/docs/" is in every docs page's address, not in its name.
  await search.fill("docs");
  await expect(sheet(page).getByRole("link", { name: "Theming", exact: true })).toHaveCount(0);
  await search.fill("no such page at all");
  await expect(sheet(page).getByRole("status")).toHaveText("Nothing aboard by that name. Try another?");
  // Escape clears a search before it closes the menu.
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(sheet(page)).toBeVisible();
  await search.fill("ax-cli");
  await sheet(page).getByRole("link", { name: "ax-cli", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/ax-cli\/$/);
});

test("on a guide's page the menu unfolds the guides, not every component", async ({ page }) => {
  await open(page, "docs/theming/");
  await openMenu(page);
  await expect(sheet(page).getByRole("link", { name: "Theming", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(sheet(page).getByRole("link", { name: "SegmentedControl", exact: true })).toHaveCount(0);
});

test("on a phone the menu's close button closes it", async ({ page }) => {
  await open(page, "ax/");
  await openMenu(page);
  await sheet(page).locator("[data-site-menu-close]").click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
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
    await pressTab(page, { shift: true });
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

test("on a phone the menu holds X-ray, which the bar has no room for, and closes to show it", async ({ page }) => {
  await open(page, "nautilus/");
  await openMenu(page);
  await sheet(page).getByRole("button", { name: /^X-ray/ }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "X-ray" })).toBeVisible();
});

test("on a phone choosing the page you are on closes the menu and stays put", async ({ page }) => {
  await open(page, "ax/");
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
  const before = await page.evaluate(() => scrollY);
  await openMenu(page);
  await sheet(page).locator('[aria-current="page"]').click();
  await expect(sheet(page)).toHaveCount(0);
  expect(await page.evaluate(() => scrollY)).toBe(before);
});

test("on a phone a docs page keeps its header, and the menu, in reach as you scroll", async ({ page }) => {
  await open(page, "docs/theming/");
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(600);
  await expect(menuButton(page)).toBeInViewport();
});

test("on a phone the Nautilus's first chapter marker is styled before any script runs, so it does not jump into place", async ({ page }) => {
  await page.route("**/*.js", (route) => route.abort());
  await page.setViewportSize(PHONE);
  await page.goto("nautilus/");
  const marker = page.locator("[data-chapter-marker]").first();
  await expect(marker).toBeInViewport();
  expect(await marker.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
});
