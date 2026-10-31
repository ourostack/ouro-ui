import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("suggests people after @, picks with the keyboard, and keeps focus in the message", async ({ page }) => {
  await openStory(page, "forms-autocomplete--composer");
  const message = page.getByRole("textbox", { name: "Message" });
  await message.click();
  await message.pressSequentially("Thanks @pr");
  const people = page.getByRole("listbox", { name: "People" });
  await expect(people).toBeVisible();
  await expect(people.getByRole("option")).toHaveCount(1);
  await expect(message).toHaveAttribute("aria-activedescendant", (await people.getByRole("option").first().getAttribute("id"))!);
  await page.keyboard.press("Enter");
  await expect(message).toHaveValue("Thanks @Priya Natarajan ");
  await expect(people).toBeHidden();
  await expect(message).toBeFocused();
  await expect(page.getByText("Mentioned: Priya Natarajan")).toBeVisible();
});

test("suggests emoji after a colon and two letters, and closes on Escape", async ({ page }) => {
  await openStory(page, "forms-autocomplete--composer");
  const message = page.getByRole("textbox", { name: "Message" });
  await message.click();
  await message.pressSequentially("Ship it :r");
  await expect(page.getByRole("listbox", { name: "Emoji" })).toBeHidden();
  await message.pressSequentially("o");
  const list = page.getByRole("listbox", { name: "Emoji" });
  await expect(list.getByRole("option", { name: /Rocket/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await message.pressSequentially(" :ta");
  await expect(list).toBeVisible();
  await list.getByRole("option", { name: /Party popper/ }).click();
  await expect(message).toHaveValue("Ship it :ro 🎉");
  await expect(message).toBeFocused();
});

test("filters a plain list in a one-line field and inserts with Enter", async ({ page }) => {
  await openStory(page, "forms-autocomplete--single-line");
  const field = page.getByRole("textbox", { name: "Search messages" });
  await field.click();
  await field.pressSequentially("#des");
  await expect(page.getByRole("listbox", { name: "Channels" }).getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(field).toHaveValue("#design-reviews ");
  await expect(field).toBeFocused();
});
