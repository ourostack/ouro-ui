import { expect, test } from "@playwright/test";

// What every docs page ends with: its source on GitHub and the page as Markdown. On a phone each is a full
// touch target, as any link that stands alone is.

for (const path of ["docs/button/", "docs/installing/"]) {
  test.describe(`at the foot of /${path}`, () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test("on a phone the source and Markdown links are each at least 44px tall and wide", async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html[data-site-ready]")).toBeAttached();
      for (const name of ["Source on GitHub", "This page as Markdown"]) {
        const box = (await page.getByRole("main").getByRole("link", { name, exact: true }).boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    });
  });
}

// From 640px the sidebar sits beside the page. Until 768px it is narrower, so a tablet's page column is as wide as a
// phone's, and a live example has a phone's room: TabBar's labels show whole.
test.describe("on a small tablet", () => {
  test.use({ viewport: { width: 640, height: 900 } });

  test("the page's column is at least a 375px phone's, and TabBar's example shows each label whole", async ({ page }) => {
    await page.goto("docs/tab-bar/");
    await expect(page.locator("[data-site-demo-ready]")).toBeAttached();
    const column = (await page.getByRole("main").boundingBox())!;
    // A 375px phone's column: the window less its 1rem gutters.
    expect(column.width).toBeGreaterThanOrEqual(375 - 32);
    const cut = await page.locator('[data-site-demo] [data-ouro="tab-bar"]').evaluate((bar) =>
      [...bar.querySelectorAll("a, button")].filter((tab) => [...tab.querySelectorAll("span")].some((label) => label.clientWidth > 2 && label.scrollWidth > label.clientWidth + 1)).length,
    );
    expect(cut).toBe(0);
  });

  for (const width of [700, 1100]) test(`the calendar demo's controls show each label whole at large text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("docs/calendar-demo/");
    await expect(page.locator("[data-site-calendar-demo]")).toBeAttached();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    const clipped = () =>
      page.locator("[data-site-calendar-demo]").evaluate((demo) =>
        [...demo.querySelectorAll<HTMLElement>("*")].filter((el) => el.clientWidth > 2 && !el.closest("[data-ouro='time-grid']") && !el.querySelector("[data-ouro='time-grid']") && /auto|hidden|clip/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1).map((el) => `${el.textContent}|${el.closest("[data-ouro]")?.getAttribute("data-ouro")}:${el.scrollWidth}>${el.clientWidth}`),
      );
    await expect.poll(clipped).toEqual([]);
  });
});
