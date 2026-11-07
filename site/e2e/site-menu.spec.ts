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
  // Where the stage is, it has judged the screen first, so a slow screen's still water is in place before the presses
  // (the press before that has its own test below).
  // real clock: the stage judges the screen on its real frames, a beat and then a second of them.
  if (await page.locator("[data-stage]").count()) await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "");
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

test("the site's CSS has no rule that makes an open restyle more than it changes", async ({ page }) => {
  // Two kinds of rule made each open of the menu restyle the whole page or the whole sheet in Chrome, once per change,
  // and so cost the press tens of ms on a slow phone: a bare :has() (every element, the page's root too, then hangs on
  // what the focus or a new node does), and a group-* variant on an attribute each sheet, menu and popover toggles as
  // it opens (Tailwind writes it as `.x:is(:where(.group)[data-open] *)`, which Chrome cannot narrow to `.x`).
  for (const path of ["./", "docs/button/"]) {
    await page.goto(path);
    await expect(page.locator("html[data-site-ready]")).toBeAttached();
    const offenders = await page.evaluate(() => {
      const found: string[] = [];
      const walk = (rules: CSSRuleList) => {
        for (const rule of rules) {
          if ("cssRules" in rule && (rule as CSSGroupingRule).cssRules) walk((rule as CSSGroupingRule).cssRules);
          const selector = (rule as CSSStyleRule).selectorText;
          if (!selector) continue;
          for (const part of selector.split(",")) {
            const one = part.trim();
            if (one.startsWith(":has(") || /:is\(:where\(\.(group|peer)[^)]*\)\[data-(open|closed|starting-style|ending-style)\]/.test(one)) found.push(one);
          }
        }
      };
      for (const sheet of document.styleSheets) walk(sheet.cssRules);
      return found;
    });
    expect(offenders, path).toEqual([]);
  }
});

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
  const search = sheet(page).getByRole("searchbox", { name: "Find a page or component" });
  await search.fill("segmented");
  await expect(sheet(page).getByRole("link", { name: "SegmentedControl", exact: true })).toBeVisible();
  await expect(sheet(page).getByRole("link", { name: "Toggle", exact: true })).toHaveCount(0);
  for (const [query, name] of [["install", "Installing"], ["shadcn", "Switching from shadcn"], ["nautilus", "The Nautilus"], ["github", "GitHub"], ["overview", "Components"], ["ouro ax guide", "Ouro AX guide"]] as const) {
    await search.fill(query);
    await expect(sheet(page).getByRole("link", { name, exact: true })).toBeVisible();
  }
  // A link off the site keeps its own address, and its address is not a name to find it by.
  await search.fill("github");
  await expect(sheet(page).getByRole("link", { name: "GitHub", exact: true })).toHaveAttribute("href", "https://github.com/ourostack/ouro-ui");
  await expect(sheet(page).getByRole("link", { name: "GitHub", exact: true })).toContainText("↗");
  await search.fill("ourostack");
  await expect(sheet(page).getByRole("link", { name: "GitHub", exact: true })).toHaveCount(0);
  // The guide and the section it shares a name with are told apart, as in the menu.
  await search.fill("ouro ax");
  await expect(sheet(page).getByRole("link", { name: "Ouro AX", exact: true })).toHaveCount(1);
  await expect(sheet(page).getByRole("link", { name: "Ouro AX guide", exact: true })).toHaveCount(1);
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
  // A guide that shares a section's name says it is the guide, so no two links share a name.
  await sheet(page).getByRole("button", { name: /^Guides \d+ pages$/ }).click();
  await expect(sheet(page).getByRole("link", { name: "Ouro AX guide", exact: true })).toBeVisible();
  await expect(sheet(page).getByRole("link", { name: "Ouro AX", exact: true })).toHaveCount(1);
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
  const search = sheet(page).getByRole("searchbox", { name: "Find a page or component" });
  await search.fill("shadcn");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/docs\/switching-from-shadcn\/$/);
});

test("on a phone the arrow keys walk the docs search's results, and up from the first goes back to the search", async ({ page }) => {
  await open(page, "docs/button/");
  await openMenu(page);
  const search = sheet(page).getByRole("searchbox", { name: "Find a page or component" });
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
  // real clock: the palette stays open until it is closed; no timer ends it.
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  // Search was pressed, so the field has focus, ready to type.
  const field = page.getByRole("dialog", { name: "Command palette" }).locator("input[data-ouro-part='input']");
  // real clock: focus stays in the field until something moves it; no timer does.
  await expect(field).toBeFocused();
  // It finds what the menu lists, and every component and guide.
  for (const [query, name] of [["feel", "Ouro Feel"], ["toggle", "Toggle"], ["theming", "Theming"], ["timer", "useTimer"], ["installing", "Docs"], ["ouro ax guide", "Ouro AX guide"], ["overview", "Components"]] as const) {
    await field.fill(query);
    await expect(page.getByRole("option", { name: new RegExp(`^${name}\\b`) }).first()).toBeVisible();
  }
  await field.fill("skill");
  await expect(page.getByRole("option", { name: /Skill comparison/ }).first()).toBeVisible();
  await field.fill("no such page at all");
  // real clock: the empty line stays while the search finds nothing; no timer ends it.
  await expect(page.getByRole("dialog", { name: "Command palette" }).getByText("Nothing aboard by that name. Try another?")).toBeVisible();
});

test("on a phone the menu opens on the section you are in, its row just under the top, when its row is far down", async ({ page }) => {
  await open(page, "docs/");
  await openMenu(page);
  const under = (await sheet(page).locator("[data-site-menu-pinned]").boundingBox())!;
  const row = (await sheet(page).locator('a[aria-current="page"]').boundingBox())!;
  expect(row.y - (under.y + under.height)).toBeGreaterThanOrEqual(-4);
  expect(row.y - (under.y + under.height)).toBeLessThanOrEqual(24);
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

// The page stays free to take the menu's press: the longest gap between frames while the page sits for a second and a
// half. A stage that holds the main thread shows here (Playwright sends its press only once the page is free, so a press
// alone would hide it). CI's WebKit draws without the GPU, and there the moving fish held frames 300-460 ms apart, 18 ms with
// them still (ci.yml run 42259745492, job 128036522038): so a screen that slow gets still water once the stage has judged it
// (stage.tsx, data-paced), and this reads the frames after that. How soon the press then draws the sheet is the latency
// job's (site-menu.latency.spec.ts): there no other worker shares the CPU.
const FRAME_GAP_BUDGET = 100;
for (const path of ["./", "docs/button/"]) {
  test(`on a phone /${path === "./" ? "" : path} stays free to take the menu's press`, async ({ page }) => {
    await open(page, path);
    if (path === "./") {
      // The frames after the stage has judged the screen, and once its scene shows the speed the control chose: on a screen
      // too slow for the fish, the one switch to still water repaints the stage (ourostack/ouro-ui#667).
      await expect(page.locator("[data-stage]")).toHaveAttribute("data-paced", "");
      const stop = await page.getByRole("radio", { name: "Stop" }).isChecked();
      await expect(page.locator(".stage-scene")).toHaveAttribute("data-speed", stop ? "stop" : "half");
    }
    // The longest gap, when in the read it fell, and whether the stage's verdict landed during the read.
    const read = () =>
      page.evaluate(
        () =>
          new Promise<{ longest: number; at: number; paced: boolean }>((resolve) => {
            const stage = document.querySelector("[data-stage]");
            const pacedBefore = stage?.hasAttribute("data-paced") ?? true;
            let last = 0;
            let longest = 0;
            let at = 0;
            const start = performance.now();
            const tick = (now: number) => {
              if (last && now - last > longest) {
                longest = now - last;
                at = Math.round(last - start);
              }
              last = now;
              if (now - start < 1500) requestAnimationFrame(tick);
              else resolve({ longest, at, paced: pacedBefore !== (stage?.hasAttribute("data-paced") ?? true) });
            };
            requestAnimationFrame(tick);
          }),
      );
    const longestGap = async () => (await read()).longest;
    const first = await read();
    const gap = first.longest;
    // Over budget: say whether the page's running animations are what holds the frames, by pausing them and reading again.
    let paused = "";
    if (gap >= FRAME_GAP_BUDGET) {
      const names = await page.evaluate(() => {
        const running = document.getAnimations().filter((animation) => animation.playState === "running");
        for (const animation of running) animation.pause();
        return running.map((animation) => (animation as CSSAnimation).animationName ?? "?");
      });
      paused = ` (with its ${names.length} running animations [${names.join(", ")}] paused: ${Math.round(await longestGap())} ms)`;
    }
    expect(gap, `the longest gap between frames, in ms, ${first.at} ms into the read${first.paced ? ", as the stage judged the screen" : ""}${paused}`).toBeLessThan(FRAME_GAP_BUDGET);
    await menuButton(page).click({ timeout: 1000 });
    // real clock: the sheet stays open until it is closed; no timer ends it.
    await expect(sheet(page)).toBeVisible({ timeout: 1000 });
  });
}

// A slow screen's moving fish once held WebKit's frames with the menu open over them until a press never came back (CI's
// WebKit, drawing without the GPU): a press as soon as the page is ready, before the stage has judged the screen, opens it.
test("on a phone the home page takes the menu's press as soon as it is ready, before the stage has judged the screen", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("./");
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await menuButton(page).click({ timeout: 3000 });
  // real clock: the sheet stays open until it is closed; no timer ends it.
  await expect(sheet(page)).toBeVisible({ timeout: 3000 });
});

test("on a phone the menu's first open registers no CSS property, on the home page or a docs page, so it restyles no more of the page than the sheet", async ({ page }) => {
  // Each property registered restyles the whole page; the sheet's are registered as its code loads, not on its press.
  await page.addInitScript(() => {
    const registered: string[] = [];
    (window as unknown as { __registered: string[] }).__registered = registered;
    const register = CSS.registerProperty.bind(CSS);
    CSS.registerProperty = (definition: PropertyDefinition) => {
      register(definition);
      registered.push(definition.name);
    };
  });
  await page.setViewportSize(PHONE);
  const registered = () => page.evaluate(() => (window as unknown as { __registered: string[] }).__registered);
  for (const path of ["./", "docs/button/"]) {
    await page.goto(path);
    await expect(page.locator("html[data-site-ready]")).toBeAttached();
    // The docs' header is an island: wait for its code, which registers the sheet's properties as it loads.
    await expect.poll(registered).toContain("--drawer-swipe-strength");
    const before = (await registered()).length;
    await menuButton(page).click();
    // real clock: the menu stays open until it is closed; no timer ends it.
    await expect(sheet(page)).toBeVisible();
    expect((await registered()).slice(before), path).toEqual([]);
  }
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

test("on a phone the menu, kept between opens, opens afresh each time: the search empty, at the page you are on", async ({ page }) => {
  await open(page, "docs/tooltip/");
  // Built while the page is idle, before the first press, and kept from then on.
  // real clock: the sheet is built when the browser says the page is idle, which no page clock drives.
  await expect(page.locator('[data-ouro="sheet"][hidden]')).toBeAttached();
  await openMenu(page);
  const body = sheet(page).locator("[data-ouro-sheet-content]");
  const at = await body.evaluate((element) => element.scrollTop);
  await sheet(page).getByRole("searchbox", { name: "Find a page or component" }).fill("but");
  await body.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await page.locator("[data-site-menu-close]").click();
  // real clock: the sheet's slide out is a CSS transition, which the page's clock does not drive.
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator('[data-ouro="sheet"][hidden]')).toBeAttached();
  await openMenu(page);
  await expect(sheet(page).getByRole("searchbox", { name: "Find a page or component" })).toHaveValue("");
  await expect(sheet(page).locator('[aria-current="page"]')).toBeInViewport();
  expect(await body.evaluate((element) => element.scrollTop)).toBe(at);
});

test("on a phone the menu, scrolled past the page you are on and a list unfolded, opens afresh: at the page you are on, the list folded", async ({ page }) => {
  await open(page, "docs/button/");
  // real clock: the sheet is built when the browser says the page is idle, which no page clock drives.
  await expect(page.locator('[data-ouro="sheet"][hidden]')).toBeAttached();
  await openMenu(page);
  const body = sheet(page).locator("[data-ouro-sheet-content]");
  const at = await body.evaluate((element) => element.scrollTop);
  const folded = sheet(page).locator('[data-site-menu-group] [aria-expanded="false"]').last();
  const name = (await folded.textContent())!;
  await folded.click();
  await expect(sheet(page).locator("[data-site-menu-group] [aria-expanded]").filter({ hasText: name })).toHaveAttribute("aria-expanded", "true");
  await body.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(sheet(page).locator('[aria-current="page"]')).not.toBeInViewport();
  await page.locator("[data-site-menu-close]").click();
  // real clock: the sheet's slide out is a CSS transition, which the page's clock does not drive.
  await expect(sheet(page)).toHaveCount(0);
  await openMenu(page);
  await expect(sheet(page).locator("[data-site-menu-group] [aria-expanded]").filter({ hasText: name })).toHaveAttribute("aria-expanded", "false");
  await expect(sheet(page).locator('[aria-current="page"]')).toBeInViewport();
  expect(await body.evaluate((element) => element.scrollTop)).toBe(at);
});

test("on a phone the docs menu's folded lists hold no pages until they unfold, then slide open with them and keep them", async ({ page }) => {
  await open(page, "docs/button/");
  await openMenu(page);
  const groups = sheet(page).locator("[data-site-menu-group]");
  const folded = await groups.evaluateAll((items) => items.findLastIndex((item) => item.querySelector('[aria-expanded="false"]')));
  const group = groups.nth(folded);
  const panel = group.locator("[data-ouro-collapsible-panel]");
  // Folded, the list is not in the page at all: nothing in it to style with the sheet.
  await expect(panel.locator("a")).toHaveCount(0);
  // Each frame of the unfold, the panel's height: it grows through the frames between, not in one step.
  const heights = panel.evaluate(
    (element) =>
      new Promise<number[]>((resolve) => {
        const seen: number[] = [];
        const start = performance.now();
        const tick = () => {
          seen.push(Math.round(element.getBoundingClientRect().height));
          if (performance.now() - start < 900) requestAnimationFrame(tick);
          else resolve(seen);
        };
        requestAnimationFrame(tick);
      }),
  );
  await group.locator('[aria-expanded="false"]').click();
  const grown = await heights;
  const full = grown.at(-1)!;
  expect(full).toBeGreaterThan(100);
  expect(grown.some((height) => height > 0 && height < full)).toBe(true);
  await expect(panel.getByRole("link").first()).toBeVisible();
  const pages = await panel.getByRole("link").count();
  await group.locator('[aria-expanded="true"]').click();
  await expect(panel).toBeHidden();
  // Folded again, it keeps its pages, hidden, until the menu next opens afresh.
  await expect(panel.locator("a")).toHaveCount(pages);
});

test("on a phone the docs menu's search holds still as a search shortens the list, which takes it back to its top", async ({ page }) => {
  await open(page, "docs/tooltip/");
  await openMenu(page);
  const body = sheet(page).locator("[data-ouro-sheet-content]");
  const field = sheet(page).locator("[data-site-menu-pinned]");
  // Opened at the page you are on, far down the list, so the search is stuck at the top.
  expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const stuck = (await field.boundingBox())!.y;
  await sheet(page).getByRole("searchbox", { name: "Find a page or component" }).fill("tool");
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);
  expect((await field.boundingBox())!.y).toBe(stuck);
});

test("on a phone the docs menu's search starts each search at the top of what it found, and clearing it goes back to the page you are on", async ({ page }) => {
  await open(page, "docs/button/");
  await openMenu(page);
  const body = sheet(page).locator("[data-ouro-sheet-content]");
  const field = sheet(page).getByRole("searchbox", { name: "Find a page or component" });
  const at = await body.evaluate((element) => element.scrollTop);
  expect(at).toBeGreaterThan(0);
  // A search that still scrolls: its first page found sits under the search, not above it.
  await field.fill("to");
  await expect.poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);
  const first = sheet(page).locator("[data-ouro-sheet-content] a[href]").first();
  const below = (await sheet(page).locator("[data-site-menu-pinned]").boundingBox())!;
  expect((await first.boundingBox())!.y).toBeGreaterThanOrEqual(below.y + below.height - 1);
  // Clearing a search scrolled part way down its results, short of where the menu opened, goes back there too.
  await field.fill("a");
  await body.evaluate((element, to) => (element.scrollTop = to), at - 150);
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(at - 150);
  await field.fill("");
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(at);
  // Each way of clearing it goes back to where the menu opened.
  for (const clear of [() => field.fill(""), () => field.press("Escape"), async () => { await field.focus(); for (let key = 0; key < 3; key += 1) await page.keyboard.press("Backspace"); }]) {
    await field.fill("to");
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);
    await clear();
    await expect(field).toHaveValue("");
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(at);
    await expect(sheet(page).locator('[aria-current="page"]')).toBeInViewport();
  }
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
  // The wheel's scroll, and the page's islands drawing above it, have come to rest: three reads in a row agree.
  const reads: number[] = [];
  await expect
    .poll(async () => {
      reads.push(await page.evaluate(() => scrollY));
      return reads.length >= 3 && reads.slice(-3).every((read) => read === reads.at(-1));
    })
    .toBe(true);
  const before = reads.at(-1)!;
  await openMenu(page);
  await sheet(page).locator('[aria-current="page"]').click();
  await expect(sheet(page)).toHaveCount(0);
  expect(await page.evaluate(() => scrollY)).toBe(before);
});

test("on a phone the page you are on, chosen with a modifier key held, opens in a new tab and the menu stays", async ({ page, context }) => {
  await open(page, "ax/");
  await openMenu(page);
  // What the press did, read back if no tab opens (ourostack/ouro-ui#664): each pointer and click event, its target, its
  // modifier keys and whether anything cancelled it, as the event leaves the page.
  await page.evaluate(() => {
    const events: string[] = [];
    (window as unknown as { __press: string[] }).__press = events;
    for (const type of ["pointerdown", "pointerup", "click", "auxclick"])
      window.addEventListener(type, (event) => {
        const target = event.target as Element;
        const mouse = event as MouseEvent;
        events.push(`${Math.round(performance.now())}:${type}@${target.tagName}${target.getAttribute("aria-current") ? "[current]" : ""}"${(target.textContent ?? "").trim().slice(0, 16)}" ctrl=${mouse.ctrlKey} meta=${mouse.metaKey} prevented=${event.defaultPrevented}`);
      });
  });
  const tab = context.waitForEvent("page", { timeout: 10_000 }).catch(async () => {
    throw new Error(`no tab opened; the press: ${JSON.stringify(await page.evaluate(() => (window as unknown as { __press: string[] }).__press))}`);
  });
  await sheet(page).locator('[aria-current="page"]').click({ modifiers: ["ControlOrMeta"] });
  // The tab opens on about:blank and then loads the page.
  await (await tab).waitForURL(/\/ax\/$/);
  await expect(sheet(page)).toBeVisible();
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
