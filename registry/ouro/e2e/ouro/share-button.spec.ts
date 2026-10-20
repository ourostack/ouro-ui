import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("the share button copies the link where there is no share sheet, and says Link copied", async ({ page }) => {
  // Without a share sheet (desktop Chromium and Firefox), the page's Clipboard API records what it is given.
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.defineProperty(window, "copied", { value: copied });
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void copied.push(text) } });
  });
  await openStory(page, "actions-sharebutton--in-context");
  await page.getByRole("button", { name: "Share notes" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual(["https://example.com/notes/42"]);
  await expect(page.getByRole("button", { name: "Share notes" })).toBeVisible({ timeout: 5000 });
});

test("the share button opens the system's share sheet where there is one", async ({ page }) => {
  await page.addInitScript(() => {
    const shared: ShareData[] = [];
    Object.defineProperty(window, "shared", { value: shared });
    Object.defineProperty(navigator, "share", { configurable: true, value: async (data: ShareData) => void shared.push(data) });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
  });
  await openStory(page, "actions-sharebutton--in-context");
  await page.getByRole("button", { name: "Share map" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared)).toEqual([{ url: "https://example.com/notes/42/map", title: "Trail map" }]);
  await expect(page.getByRole("button", { name: "Share map" })).toBeVisible();
});
