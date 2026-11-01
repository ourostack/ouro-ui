import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a composer sends on Enter, starts a new line on Shift+Enter, and clears after sending", async ({ page }) => {
  await openStory(page, "chat-composer--basic");
  const message = page.getByRole("textbox", { name: "Message Mia" });
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await message.pressSequentially("See you");
  await message.press("Shift+Enter");
  await message.pressSequentially("Saturday");
  await message.press("Enter");
  await expect(page.getByRole("list", { name: "Sent" }).getByRole("listitem")).toHaveText("See you\nSaturday");
  await expect(message).toHaveValue("");
  await expect(message).toBeFocused();
});

test("a composer's suggested words stay marked as the person edits around them", async ({ page }) => {
  await openStory(page, "chat-composer--suggested");
  const reply = page.getByRole("textbox", { name: "Reply to Mia" });
  await expect(reply).toHaveAccessibleDescription(/Suggested by your assistant: “Thanks for the notes\.”, “the sourdough starter”\./);
  const marks = page.locator("[data-ouro-highlight]");
  await expect(marks).toHaveText(["Thanks for the notes.", "the sourdough starter"]);
  await reply.press("ControlOrMeta+Home");
  await reply.pressSequentially("Hi Mia! ");
  await expect(marks).toHaveText(["Thanks for the notes.", "the sourdough starter"]);
  await expect(reply).toHaveValue(/^Hi Mia! Thanks for the notes\./);
});

test("a composer with sending off keeps the text and says why", async ({ page }) => {
  await openStory(page, "chat-composer--sending-off");
  const reply = page.getByRole("textbox", { name: "Reply to Mia" });
  await expect(reply).toHaveAccessibleDescription("Sending is off while you review your assistant's draft.");
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await reply.press("Enter");
  await expect(reply).toHaveValue("See you Saturday");
});

test("an image catalogue's emoji go in as tokens, from suggestions or the picker, and the sent message draws them", async ({ page }) => {
  await openStory(page, "chat-composer--emoji-tokens");
  const box = page.getByRole("textbox", { name: "Message the release team" });
  await box.fill("Coffee break ");
  await box.press("End");
  await page.keyboard.type(":cof");
  await page.getByRole("option", { name: /Team coffee/ }).click();
  await expect(box).toHaveValue("Coffee break :coffee_time: ");
  await page.getByRole("button", { name: "Insert emoji" }).click();
  await page.getByRole("dialog", { name: "Insert emoji" }).getByRole("button", { name: "Party popper" }).click();
  await expect(box).toHaveValue("Coffee break :coffee_time: :party:");
  await box.focus();
  await page.keyboard.press("Enter");
  const sent = page.getByRole("list", { name: "Sent" }).getByRole("listitem").last();
  await expect(sent.getByRole("img", { name: "Team coffee" })).toBeVisible();
  await expect(sent.getByRole("img", { name: "Party popper" })).toBeVisible();
});
