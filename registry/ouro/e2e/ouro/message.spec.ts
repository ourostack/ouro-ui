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
  // real clock: the story's replies stream for good; nothing in it ends on a timer.
  await expect(page.getByRole("article").first()).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("[data-ouro-message-typing]")).toHaveText("Writing");
});

test("a chat message's action bar shows on hover and from the keyboard, and its menu opens", async ({ page }) => {
  await openStory(page, "chat-message--chat");
  const message = page.getByRole("article").filter({ hasText: "I have one." });
  const bar = message.getByRole("toolbar", { name: "Message actions" });
  await expect(bar).toHaveCSS("opacity", "0");
  await message.getByText("I have one.").hover();
  await expect(bar).toHaveCSS("opacity", "1");
  await bar.getByRole("button", { name: "Reply" }).click();
  await expect(page.getByRole("status")).toHaveText("Replying to Mara Quill");
  await bar.getByRole("button", { name: "Reply" }).press("ArrowRight");
  await expect(bar.getByRole("button", { name: "More actions" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(bar.getByRole("button", { name: "More actions" })).toBeFocused();
});

test("posts are cards under their author, with reactions inside and the thread under them", async ({ page }) => {
  await openStory(page, "chat-message--posts");
  const post = page.getByRole("article").filter({ hasText: "Agenda for Friday's design review" });
  const card = post.locator("[data-ouro-message-card]");
  await expect(card.getByRole("group", { name: "Reactions" })).toBeVisible();
  await post.getByRole("button", { name: "3 replies" }).click();
  await expect(page.getByRole("status")).toHaveText("Opened the thread: Agenda for Friday's design review");
});
