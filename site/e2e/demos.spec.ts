import { expect, test } from "@playwright/test";

// The docs' live demos on a phone: what a press shows stays inside the page.

test.describe("on a phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("the MCP app demo's line about a link the host opens wraps, and the page never scrolls sideways", async ({ page }) => {
    await page.goto("docs/ouro-mcp-app/");
    await expect(page.locator("[data-site-demo-ready]")).toBeAttached();
    await page.locator("[data-site-demo]").getByRole("button", { name: /Order ingredients/ }).tap();
    await expect(page.locator("[data-site-demo]").getByText(/The host opens https:/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });
});
