import { expect, test } from "../ouro-fixtures";
import { holdClock, openStory } from "./story";

test("an agent hand-off puts its line on the clipboard and says Copied, with Copy under the line on a phone", async ({ page, browserName }) => {
  if (browserName === "chromium") {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  } else {
    // WebKit gives Playwright no clipboard to read, so the page's Clipboard API records what it is given.
    await page.addInitScript(() => {
      const copied: string[] = [];
      Object.defineProperty(window, "copied", { value: copied });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => void copied.push(text) } });
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // The page's clock stands still until the spec moves it on, so the two-second confirmation cannot end between the click and the check.
  await page.clock.install();
  await openStory(page, "actions-agenthandoff--in-context");
  await holdClock(page);
  const handoff = page.getByRole("group", { name: "Hand it to your agent" });
  const line = "Add a tea timer to this app with Ouro UI. Read https://ui.ouroboros.bot/docs/progress.md first and follow it.";
  await expect(handoff.locator('[data-slot="prompt"]')).toHaveText(line);
  const prompt = await handoff.locator('[data-slot="prompt"]').boundingBox();
  const copy = handoff.getByRole("button", { name: "Copy" });
  expect((await copy.boundingBox())!.y).toBeGreaterThanOrEqual(prompt!.y + prompt!.height);
  await copy.click();
  await expect(handoff.getByRole("button", { name: "Copied" })).toBeVisible();
  const copied =
    browserName === "chromium"
      ? await page.evaluate(() => navigator.clipboard.readText())
      : await page.evaluate(() => (window as unknown as { copied: string[] }).copied[0]);
  expect(copied).toBe(line);
});
