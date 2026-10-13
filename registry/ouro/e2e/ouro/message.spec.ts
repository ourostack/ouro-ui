import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("messages say who wrote them and sit on the author's side", async ({ page }) => {
  await openStory(page, "chat-message--roles");
  const articles = page.getByRole("article");
  await expect(articles).toHaveCount(3);
  const user = articles.nth(1);
  const assistant = articles.nth(2);
  await expect(user).toContainText("Ada Lovelace");
  await expect(assistant).toContainText("Ouro");
  const userBox = (await user.locator("[data-ouro-message-content]").boundingBox())!;
  const assistantBox = (await assistant.locator("[data-ouro-message-content]").boundingBox())!;
  expect(userBox.x + userBox.width).toBeGreaterThan(assistantBox.x + assistantBox.width);
  expect(userBox.x).toBeGreaterThan(assistantBox.x);
});

test("a streaming reply is busy and shows the typing indicator", async ({ page }) => {
  await openStory(page, "chat-message--streaming");
  await expect(page.getByRole("article").first()).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("[data-ouro-message-typing]")).toHaveText("Writing");
});
