import { expect, test } from "../ouro-fixtures";
import { filmTops, openStory } from "./story";

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

test("offers an image catalogue's emoji, finds one by shortcode and gives its token", async ({ page }) => {
  await openStory(page, "chat-emojipicker--image-catalogue");
  await page.getByRole("button", { name: "Add a reaction" }).click();
  const picker = page.getByRole("dialog", { name: "Add a reaction" });
  await expect(picker.getByRole("grid", { name: "Fernwood" })).toBeVisible();
  await expect(picker.getByRole("button", { name: "Team coffee" }).locator("img")).toBeVisible();
  await picker.getByRole("searchbox", { name: "Search emoji" }).fill(":tada");
  await expect(picker.getByRole("grid", { name: "1 emoji" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  await expect(page.getByText("Reacted with Party popper (:party:)")).toBeVisible();
});

test.describe("by touch on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the sheet's search field, panel and top stay put on every frame as a search starts and narrows", async ({ page }) => {
    await openStory(page, "chat-emojipicker--reactions");
    await page.getByRole("button", { name: "Add a reaction" }).tap();
    const sheet = page.getByRole("dialog", { name: "Add a reaction" });
    const searchbox = sheet.getByRole("searchbox", { name: "Search emoji" });
    // The category bar goes as the first letter is typed, and its row with it took the field down 57 px (#696).
    await expect(sheet.getByRole("toolbar", { name: "Categories" })).toBeVisible();
    const film = await filmTops({ input: searchbox, panel: sheet.locator('[data-ouro="emoji-picker"]'), sheet }, async () => {
      await searchbox.tap();
      await searchbox.pressSequentially("hea", { delay: 120 });
      await expect(sheet.getByRole("toolbar", { name: "Categories" })).toHaveCount(0);
      await expect(sheet.getByRole("grid", { name: /^\d+ emoji$/ }).getByRole("button", { name: "red heart" })).toBeVisible();
    });
    expect(film.frames).toBeGreaterThan(0);
    expect(film.moves).toEqual([]);
  });
});
