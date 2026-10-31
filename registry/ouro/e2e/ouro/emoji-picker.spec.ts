import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("searches, moves through the grid with the keyboard and reacts with the emoji chosen", async ({ page }) => {
  await openStory(page, "chat-emojipicker--reactions");
  const trigger = page.getByRole("button", { name: "Add a reaction" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const picker = page.getByRole("dialog", { name: "Add a reaction" });
  await expect(picker).toBeVisible();
  const searchbox = picker.getByRole("searchbox", { name: "Search emoji" });
  await expect(searchbox).toBeFocused();
  await searchbox.fill("rocket");
  await expect(picker.getByRole("grid", { name: "1 emoji" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(picker.getByRole("button", { name: "rocket" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(page.getByText("Reacted with 🚀 rocket")).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("jumps to a category and chooses a skin tone that the emoji then show", async ({ page }) => {
  await openStory(page, "chat-emojipicker--skin-tone");
  await page.getByRole("button", { name: "Add a reaction" }).click();
  const picker = page.getByRole("dialog", { name: "Add a reaction" });
  await expect(picker.getByRole("button", { name: "thumbs up" })).toHaveText("👍🏽");
  await picker.getByRole("button", { name: "Skin tone: Medium" }).click();
  await picker.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.getByText("Kept skin tone: dark")).toBeVisible();
  await expect(picker.getByRole("button", { name: "thumbs up" })).toHaveText("👍🏿");
  await picker.getByRole("toolbar", { name: "Categories" }).getByRole("button", { name: "Symbols" }).click();
  await expect(picker.getByRole("button", { name: "red heart" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
});

test("adds the chosen emoji to the draft from the app's own button", async ({ page }) => {
  await openStory(page, "chat-emojipicker--insert-into-text");
  await page.getByRole("button", { name: "Insert emoji" }).click();
  const picker = page.getByRole("dialog", { name: "Insert emoji" });
  await picker.getByRole("button", { name: "party popper" }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByText("Shipping the release notes today 🎉")).toBeVisible();
});
