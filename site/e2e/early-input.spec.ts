import { expect, test, type Page } from "@playwright/test";

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

for (const path of ["./", "docs/tooltip/", "ax/"]) {
  test(`a tap on the menu button before the page's script has run opens the menu, on ${path}`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    const { release } = await hold(page, ENTRY);
    await page.goto(path, { waitUntil: "commit" });
    const button = page.getByRole("banner").getByRole("button", { name: "Menu", exact: true });
    await button.click();
    release();
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
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
    // Each opens a dialog: the theme picker's popover, and Search's command palette.
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.unroute(ENTRY);
  }
});

test("text typed into the docs filter before the page's script has run stays, and filters", async ({ page }) => {
  const { release } = await hold(page, ENTRY);
  await page.goto("docs/toggle/", { waitUntil: "commit" });
  const filter = page.getByPlaceholder("Filter components");
  await filter.fill("tabs");
  release();
  await expect(page.locator("html[data-site-ready]")).toBeAttached();
  await expect(filter).toHaveValue("tabs");
  await expect(page.getByRole("link", { name: "Tabs", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Toggle", exact: true })).toBeHidden();
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
  await expect(page.locator('[data-site-demo="form"][data-site-demo-ready]')).toBeAttached();
  await expect(page.locator('[data-ouro="select-popup"]')).toHaveAttribute("data-open", "");
  await expect(page.getByRole("option", { name: "Main", exact: true })).toBeVisible();
  await expect(name).toHaveValue("Soup");
});
