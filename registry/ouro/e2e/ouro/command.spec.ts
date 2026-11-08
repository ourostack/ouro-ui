import { expect, test } from "../ouro-fixtures";
import { filmTops, openStory, settledBox } from "./story";

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

  test("keeps the palette and its rows still while a server's longer results arrive", async ({ page }) => {
    // As narrow as a window gets with the dialog, where a longer answer once widened the palette and moved every row.
    await page.setViewportSize({ width: 720, height: 900 });
    await openStory(page, "menus-command--server-search");
    await page.getByRole("button", { name: "Search recipes…" }).click();
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await expect(dialog.getByRole("option")).toHaveCount(8);
    const before = await settledBox(dialog);
    const measured = await page.evaluate(() => {
      const supported = PerformanceObserver.supportedEntryTypes.includes("layout-shift");
      const shifts: number[] = [];
      (window as unknown as { __commandShifts: number[] }).__commandShifts = shifts;
      if (supported) new PerformanceObserver((list) => list.getEntries().forEach((entry) => shifts.push((entry as unknown as { value: number }).value))).observe({ type: "layout-shift" });
      return supported;
    });
    await dialog.getByRole("combobox", { name: "Search commands" }).fill("stew");
    const found = dialog.getByRole("option", { name: /^Slow-roasted tomato/ });
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await expect(found).toBeVisible();
    const after = await settledBox(dialog);
    expect({ x: after.x, y: after.y, width: after.width }).toEqual({ x: before.x, y: before.y, width: before.width });
    expect(await found.locator("[data-ouro-command-label]").evaluate((label) => label.scrollWidth > label.clientWidth)).toBe(true);
    // Every shift counts here, those right after a key press too: nothing in the palette may move.
    const shifted = await page.evaluate(async () => {
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      return (window as unknown as { __commandShifts: number[] }).__commandShifts.reduce((sum, value) => sum + value, 0);
    });
    if (measured) expect(shifted).toBeLessThan(0.001);
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

test.describe("by touch on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("opens a full-height sheet whose search input, panel and top stay put on every frame while filtering", async ({ page }) => {
    await openStory(page, "menus-command--playground");
    await page.getByRole("button", { name: "Search…" }).tap();
    const sheet = page.getByRole("dialog", { name: "Command palette" });
    const input = sheet.getByRole("combobox", { name: "Search commands" });
    const options = sheet.getByRole("option");
    await expect(options.first()).toBeVisible();
    const all = await options.count();
    const film = await filmTops({ input, panel: sheet.locator('[data-ouro="command"]'), sheet }, async () => {
      await input.tap();
      await input.pressSequentially("bak", { delay: 120 });
      await expect(options).toHaveCount(1);
    });
    expect(all).toBeGreaterThan(1);
    expect(film.frames).toBeGreaterThan(0);
    expect(film.moves).toEqual([]);
  });
});
