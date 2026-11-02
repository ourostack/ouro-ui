import { expect, test } from "../ouro-fixtures";
import { holdClock, openStory, pressTab } from "./story";

test("is one tab stop whose arrow keys move between controls, and presses a toggle", async ({ page }) => {
  await openStory(page, "actions-toolbar--labeled");
  const toolbar = page.getByRole("toolbar", { name: "Document" });
  await toolbar.getByRole("button", { name: "Undo" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(toolbar.getByRole("button", { name: "Redo" })).toBeFocused();
  await expect(toolbar.getByRole("button", { name: "Redo" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("End");
  const outline = toolbar.getByRole("button", { name: "Show outline" });
  await expect(outline).toBeFocused();
  await expect(outline).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(outline).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Home");
  await expect(toolbar.getByRole("button", { name: "Undo" })).toBeFocused();
});

test("moves what does not fit into the More menu, with toggles as checkbox items", async ({ page }) => {
  await openStory(page, "actions-toolbar--overflow");
  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  const more = toolbar.getByRole("button", { name: "More" });
  await expect(more).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Quote" })).toHaveCount(0);
  await more.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Quote" })).toBeVisible();
  const code = menu.getByRole("menuitemcheckbox", { name: /Code/ });
  await expect(code).toHaveAttribute("aria-checked", "false");
  await code.click();
  await expect(code).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
});

test("keeps the caret in the message when a control is clicked", async ({ page }) => {
  await openStory(page, "actions-toolbar--composer");
  const message = page.getByRole("textbox", { name: "Message" });
  await message.fill("Lunch at noon");
  await message.focus();
  await page.getByRole("toolbar", { name: "Formatting" }).getByRole("button", { name: "Bold" }).click();
  await expect(message).toBeFocused();
  await expect(page.getByText("Bold on, italic off")).toBeVisible();
});

test("floats as glass over the call, and turns solid with a defined border for more contrast", async ({ page }) => {
  await openStory(page, "actions-toolbar--floating");
  const toolbar = page.getByRole("toolbar", { name: "Call controls" });
  await expect(toolbar).toHaveCSS("backdrop-filter", /^blur\(/);
  await expect(toolbar).toHaveCSS("border-top-width", "0px");
  await page.emulateMedia({ contrast: "more" });
  await expect(toolbar).toHaveCSS("backdrop-filter", "none");
  await expect(toolbar).toHaveCSS("border-top-width", "2px");
});

test("fades after the pointer rests, comes back on a move over the stage, and Tab brings it back first", async ({ page }) => {
  await page.clock.install();
  await openStory(page, "actions-toolbar--auto-hide");
  await holdClock(page);
  const toolbar = page.locator('[data-ouro="toolbar"]');
  const stage = page.getByRole("group", { name: "Design review" });
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.clock.runFor(3000);
  await expect(toolbar).toHaveAttribute("data-hidden", "");
  await expect(page.getByRole("toolbar")).toHaveCount(0);
  await expect(page.getByText("Controls faded")).toBeVisible();
  await page.mouse.move(box.x + 60, box.y + 40);
  await expect(toolbar).not.toHaveAttribute("data-hidden");
  await expect(page.getByText("Controls showing")).toBeVisible();
  await page.clock.runFor(3000);
  await expect(toolbar).toHaveAttribute("data-hidden", "");
  await pressTab(page);
  await expect(page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Mute" })).toBeFocused();
  // Keyboard use, and focus inside, hold it however long the pointer rests.
  await page.clock.runFor(10_000);
  await expect(toolbar).not.toHaveAttribute("data-hidden");
});
