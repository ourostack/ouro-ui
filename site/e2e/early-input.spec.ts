import { expect, test, type Locator, type Page } from "@playwright/test";

// A tap or text that lands before its control has hydrated is kept and answered once it has (src/early-input.ts,
// ourostack/ouro-ui#672). Each test holds back the script a control waits on, acts while it is held, then lets it go.

const PHONE = { width: 390, height: 844 };

/** Holds back requests matching `pattern` until the returned release is called; resolves once one has been asked for. */
async function hold(page: Page, pattern: RegExp | string): Promise<{ asked: Promise<void>; release: () => void }> {
  let release!: () => void;
  const gate = new Promise<void>((done) => (release = done));
  let asked!: () => void;
  const requested = new Promise<void>((done) => (asked = done));
  await page.route(pattern, async (route) => {
    asked();
    await gate;
    await route.continue();
  });
  return { asked: requested, release };
}

const ENTRY = /\/assets\/entry-[^/]*\.js$/;

/**
 * How long a kept tap or text may take to be answered once its control has hydrated, in ms. The page answers it a frame
 * or two later and the menu takes about 140 ms to open at a 4× slower CPU; this ceiling, for a shared CI runner, still
 * fails a tap left waiting on its part of the page's turn to hydrate (seconds).
 */
const ANSWERED = 1000;

/** Waits until React has hydrated `control`: it keeps its fiber on the node, under a key of its own. */
async function hydrated(control: Locator): Promise<void> {
  const node = await control.elementHandle();
  await node!.evaluate((element) => new Promise<void>((done) => {
    const look = () => (Object.keys(element).some((key) => key.startsWith("__reactFiber$")) ? done() : requestAnimationFrame(look));
    look();
  }));
}

for (const path of ["./", "docs/tooltip/", "ax/"]) {
  test(`a tap on the menu button before the page's script has run opens the menu, on ${path}`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    const { release } = await hold(page, ENTRY);
    await page.goto(path, { waitUntil: "commit" });
    const button = page.getByRole("banner").getByRole("button", { name: "Menu", exact: true });
    await button.click();
    release();
    await hydrated(button);
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible({ timeout: ANSWERED });
    await expect(page.getByRole("dialog", { name: "Menu" }).getByRole("navigation", { name: "Site" })).toBeVisible();
  });
}

test("a tap on the theme picker or Search before the page's script has run is answered", async ({ page }) => {
  for (const name of [/^Theme: /, /^Search/]) {
    const { release } = await hold(page, ENTRY);
    await page.goto("docs/tooltip/", { waitUntil: "commit" });
    const button = page.getByRole("banner").getByRole("button", { name });
    await button.click();
    release();
    await hydrated(button);
    // Each opens a dialog: the theme picker's popover, and Search's command palette.
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: ANSWERED });
    await page.unroute(ENTRY);
  }
});

test("text typed into the docs filter before the page's script has run stays, and filters", async ({ page }) => {
  const { release } = await hold(page, ENTRY);
  await page.goto("docs/toggle/", { waitUntil: "commit" });
  const filter = page.getByPlaceholder("Filter components");
  await filter.fill("tabs");
  release();
  await hydrated(filter);
  await expect(page.getByRole("link", { name: "Toggle", exact: true })).toBeHidden({ timeout: ANSWERED });
  await expect(page.getByRole("link", { name: "Tabs", exact: true })).toBeVisible();
  await expect(filter).toHaveValue("tabs");
});

test("a live example answers a tap and keeps text from before its own script arrived, and is never shown disabled", async ({ page }) => {
  const { asked, release } = await hold(page, "**/assets/form.demo-*.js");
  await page.goto("docs/form/", { waitUntil: "domcontentloaded" });
  await asked;
  const name = page.getByRole("textbox", { name: "Recipe name", exact: true });
  const course = page.getByRole("combobox", { name: "Course", exact: true });
  await expect(page.locator("[data-site-demo-ready]")).toHaveCount(0);
  await expect(name).toBeEnabled();
  await name.fill("Soup");
  await course.click();
  release();
  await hydrated(course);
  await expect(page.locator('[data-ouro="select-popup"]')).toHaveAttribute("data-open", "", { timeout: ANSWERED });
  await expect(page.getByRole("option", { name: "Main", exact: true })).toBeVisible();
  await expect(name).toHaveValue("Soup");
});

test("a tap on the stage before the page's script has run is answered once the page hydrates, not when the stage's turn comes", async ({ page }) => {
  // The stage hydrates in its turn, when the browser is next idle (src/hydrate.tsx); here that is 4 s away, so only the
  // kept tap hurrying it along answers the press in time.
  await page.addInitScript(() => {
    window.requestIdleCallback = (callback: IdleRequestCallback) => window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 10 }), 4000);
  });
  const { release } = await hold(page, ENTRY);
  await page.goto("./", { waitUntil: "commit" });
  const speed = page.locator(".site-hero-stage").getByRole("radio").first();
  await expect(speed).toHaveAttribute("aria-checked", "false");
  await speed.click();
  release();
  await page.waitForFunction(() => Object.keys(document.getElementById("root")!).some((key) => key.startsWith("__reactContainer$")));
  await expect(speed).toHaveAttribute("aria-checked", "true", { timeout: ANSWERED });
});

test("a tap on a live slider before its own script arrived moves it there once it does", async ({ page }) => {
  await page.setViewportSize(PHONE);
  const { asked, release } = await hold(page, "**/assets/slider.demo-*.js");
  await page.goto("docs/slider/", { waitUntil: "domcontentloaded" });
  await asked;
  const spice = page.getByRole("slider", { name: "Spice level" });
  await expect(spice).toHaveAttribute("aria-valuenow", "2");
  const track = page.locator('[data-ouro="slider"]').filter({ has: spice }).locator("[data-ouro-slider-control]");
  const box = (await track.boundingBox())!;
  // Near the end of the track: 4 of 0 to 5, past the thumb at 2.
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
  release();
  await expect(page.locator('[data-site-demo="slider"][data-site-demo-ready]')).toBeAttached();
  await hydrated(track);
  await expect(spice).toHaveAttribute("aria-valuenow", "4", { timeout: ANSWERED });
});
