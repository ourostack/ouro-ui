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
  { path: "docs/tooltip/", navs: ["Footer"] },
  { path: "docs/use-timer/", navs: ["Footer"] },
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
 * The theme picker opens a popover of themes, not navigation, so it is left out, and so is a fold that opens a list
 * in place inside a dialog (a Collapsible: the docs menu's folded lists): that is the menu's own content, not another menu.
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
      .filter((element) => !(element.closest("[role='dialog']") && element.matches("[data-ouro-control='collapsible']:not([aria-haspopup])")))
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
  // It opens on the heading of the page's list, which is open, the others folded.
  await expect(sheet(page).getByRole("button", { name: /^Actions \d+ pages$/ })).toHaveAttribute("aria-expanded", "true");
  // Its heading sits just under the search, not wherever the page's row happened to land.
  const under = (await sheet(page).locator("[data-site-menu-pinned]").boundingBox())!;
  const actions = (await sheet(page).getByRole("button", { name: /^Actions \d+ pages$/ }).boundingBox())!;
  expect(actions.y - (under.y + under.height)).toBeGreaterThanOrEqual(-4);
  expect(actions.y - (under.y + under.height)).toBeLessThanOrEqual(24);
  await expect(sheet(page).getByRole("button", { name: /^Forms \d+ pages$/ })).toHaveAttribute("aria-expanded", "false");
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
  // With nothing typed, Escape closes the menu.
  await search.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
  await openMenu(page);
  await search.fill("ax-cli");
  await sheet(page).getByRole("link", { name: "ax-cli", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/ax-cli\/$/);
});

test("on any docs page the menu lists the guides and the components, as the sidebar does, each list folded", async ({ page }) => {
  await open(page, "docs/theming/");
  await openMenu(page);
  await expect(sheet(page).getByRole("link", { name: "Theming", exact: true })).toHaveAttribute("aria-current", "page");
  // Only the list with the page you are on is open.
  await expect(sheet(page).getByRole("button", { name: /^Guides \d+ pages$/ })).toHaveAttribute("aria-expanded", "true");
  const navigation = sheet(page).getByRole("button", { name: /^Navigation \d+ pages$/ });
  await expect(navigation).toHaveAttribute("aria-expanded", "false");
  await navigation.click();
  await sheet(page).getByRole("link", { name: "SegmentedControl", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/segmented-control\/$/);
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await openMenu(page);
  await expect(sheet(page).getByRole("button", { name: /^Guides \d+ pages$/ })).toHaveAttribute("aria-expanded", "false");
  await sheet(page).getByRole("button", { name: /^Ouro AX, part by part \d+ pages$/ }).click();
  await expect(sheet(page).getByRole("link", { name: "ax-cli", exact: true })).toBeVisible();
  // A helper's page is in its component's group, after the components.
  await page.goto("docs/use-timer/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await openMenu(page);
  await expect(sheet(page).getByRole("button", { name: /^Feedback \d+ pages$/ })).toHaveAttribute("aria-expanded", "true");
  await expect(sheet(page).getByRole("link", { name: "useTimer", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(sheet(page).getByRole("link", { name: "Timer", exact: true })).toBeVisible();
});

test("on a phone Enter in the docs search opens the first page it found", async ({ page }) => {
  await open(page, "docs/button/");
  await openMenu(page);
  const search = sheet(page).getByRole("searchbox", { name: "Find a docs page" });
  await search.fill("shadcn");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/docs\/switching-from-shadcn\/$/);
});

test("on a phone the arrow keys walk the docs search's results, and up from the first goes back to the search", async ({ page }) => {
  await open(page, "docs/button/");
  await openMenu(page);
  const search = sheet(page).getByRole("searchbox", { name: "Find a docs page" });
  await search.fill("menu");
  const results = sheet(page).locator("nav a[href]");
  await search.press("ArrowDown");
  await expect(results.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(results.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(results.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(search).toBeFocused();
});

test("on a phone the menu's Search, away from the docs, opens the bar's search palette", async ({ page }) => {
  await open(page, "nautilus/");
  await openMenu(page);
  await sheet(page).getByRole("button", { name: "Search", exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  // Search was pressed, so the field has focus, ready to type.
  await expect(page.getByRole("dialog", { name: "Command palette" }).locator("input[data-ouro-part='input']")).toBeFocused();
});

/** Opens the theme picker. The docs' header is an island, so its button works once it has hydrated. */
async function openPicker(page: Page) {
  const picker = page.getByRole("dialog", { name: "Theme" });
  await expect(async () => {
    if ((await picker.count()) === 0) await page.locator("[data-site-theme-trigger]").click({ timeout: 1000 });
    // real clock: the picker stays open until it is closed; no timer ends it.
    await expect(picker).toBeVisible({ timeout: 1000 });
  }).toPass();
  return picker;
}

/** The middle of a link on the page that is in view and clear of the picker, to tap through it. */
async function linkBeside(page: Page, picker: ReturnType<Page["getByRole"]>): Promise<{ x: number; y: number; href: string }> {
  const box = (await picker.boundingBox())!;
  return page.evaluate((popup) => {
    const { innerWidth: width, innerHeight: height } = window;
    for (const link of document.querySelectorAll<HTMLAnchorElement>("main a[href], footer a[href]")) {
      const spot = link.getBoundingClientRect();
      const x = spot.x + spot.width / 2;
      const y = spot.y + spot.height / 2;
      const clear = y > popup.y + popup.height + 8 || y < popup.y - 8;
      if (spot.width > 0 && x > 0 && x < width && y > 60 && y < height - 8 && clear) return { x, y, href: link.href };
    }
    throw new Error("no link in view beside the picker");
  }, box);
}

test("on a phone a tap outside the theme picker closes it without pressing the link under the tap", async ({ page }) => {
  await open(page, "docs/button/");
  const url = page.url();
  const picker = await openPicker(page);
  const link = await linkBeside(page, picker);
  expect(link.href).not.toBe(url);
  await page.mouse.click(link.x, link.y);
  await expect(picker).toHaveCount(0);
  await page.waitForLoadState();
  expect(page.url()).toBe(url);
});

test("on a wide screen the theme picker leaves the page as it is: a click on a link outside it follows the link", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("docs/button/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await openPicker(page);
  await page.getByRole("banner").getByRole("link", { name: "The Nautilus", exact: true }).click();
  await expect(page).toHaveURL(/\/nautilus\/$/);
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
  // A helper's page is under Components too.
  await page.goto("docs/use-timer/");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await expect(page.getByRole("banner").getByRole("link", { name: "Components", exact: true })).toHaveAttribute("aria-current", "page");
});

test("on a phone the menu holds X-ray, which the bar has no room for, and closes to show it", async ({ page }) => {
  await open(page, "nautilus/");
  await openMenu(page);
  // Its name says what a press does.
  await sheet(page).getByRole("button", { name: "Show X-ray", exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "X-ray" })).toBeVisible();
  await openMenu(page);
  await sheet(page).getByRole("button", { name: "Hide X-ray", exact: true }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "X-ray" })).toHaveCount(0);
});

test("on a phone the menu opens scrolled to a page far down it", async ({ page }) => {
  await open(page, "docs/tooltip/");
  await openMenu(page);
  expect(await sheet(page).locator("[data-ouro-sheet-content]").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(sheet(page).locator('[aria-current="page"]')).toBeInViewport();
});

test("on a phone the keyboard's Close takes the corner from the pointer's, never both at once", async ({ page }) => {
  await open(page, "ax/");
  await openMenu(page);
  const twin = sheet(page).locator("[data-site-menu-close]");
  await expect(twin).toBeVisible();
  await sheet(page).locator("[data-ouro-sheet-close]").focus();
  await page.keyboard.press("Shift");
  // A focus() from script is not focus-visible everywhere: Tab to it as a keyboard would, from the end of the sheet.
  for (let step = 0; step < 60 && !(await sheet(page).locator("[data-ouro-sheet-close]").evaluate((element) => element.matches(":focus-visible"))); step += 1) await pressTab(page);
  await expect(twin).toBeHidden();
});

test("on a phone a heading you jump to on a docs page lands below the sticky header", async ({ page }) => {
  await open(page, "docs/button/");
  const heading = page.getByRole("main").locator("h2[id]").nth(1);
  const id = await heading.getAttribute("id");
  await page.goto(`docs/button/#${id}`);
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await expect.poll(async () => (await heading.boundingBox())!.y).toBeGreaterThanOrEqual((await page.getByRole("banner").boundingBox())!.height);
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
