import { expect, test } from "../ouro-fixtures";
import { openStory, settledBox } from "./story";

test.describe("on a desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("filters, runs a command with Enter, and returns focus to the trigger", async ({ page }) => {
    await openStory(page, "menus-command--playground");
    const trigger = page.getByRole("button", { name: "Search…" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole("combobox", { name: "Search commands" });
    await expect(input).toBeFocused();
    const before = await settledBox(dialog);
    await input.fill("bak");
    await expect(dialog.getByRole("option")).toHaveCount(1);
    expect((await settledBox(dialog)).height).toBe(before.height);
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("jumps to a chat by name, its avatar and unread state in the row", async ({ page }) => {
    await openStory(page, "menus-command--media");
    const trigger = page.getByRole("button", { name: "Go to…" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Go to a chat" });
    await expect(dialog.getByRole("option", { name: /^Launch team.*Unread/ })).toBeVisible();
    await dialog.getByRole("combobox", { name: "Search commands" }).fill("launch");
    const option = dialog.getByRole("option");
    await expect(option).toHaveCount(1);
    await expect(option.locator('[data-ouro="avatar"]')).toBeVisible();
    await expect(option.locator('[data-ouro="badge"]')).toHaveText("3");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("shows the empty state when nothing matches", async ({ page }) => {
    await openStory(page, "menus-command--playground");
    await page.getByRole("button", { name: "Search…" }).click();
    await page.getByRole("combobox", { name: "Search commands" }).fill("zzz");
    await expect(page.getByText("No results")).toBeVisible();
  });

  test("the shortcut opens and closes the palette", async ({ page }) => {
    await openStory(page, "menus-command--shortcut");
    // The emulated app platform can differ from Playwright's host-OS modifier alias.
    const shortcut = page.locator('[data-ouro="kbd"]');
    await expect(shortcut).toHaveAttribute("data-platform", /^(apple|other)$/);
    await page.keyboard.press(await shortcut.getAttribute("data-platform") === "apple" ? "Meta+k" : "Control+k");
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("opens a full-height sheet whose search input stays put while filtering", async ({ page }) => {
    await openStory(page, "menus-command--playground");
    await page.getByRole("button", { name: "Search…" }).click();
    const input = page.getByRole("combobox", { name: "Search commands" });
    const sheet = page.getByRole("dialog", { name: "Command palette" });
    await settledBox(sheet);
    const before = (await settledBox(input)).y;
    await input.fill("bak");
    await expect(page.getByRole("option")).toHaveCount(1);
    expect((await settledBox(input)).y).toBe(before);
  });
});
