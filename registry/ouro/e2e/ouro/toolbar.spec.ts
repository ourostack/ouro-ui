import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

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
