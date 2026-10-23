import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a person previews a proposal, goes back, then applies it", async ({ page }) => {
  await openStory(page, "chat-layoutproposal--proposal");
  await expect(page.getByRole("region", { name: "Proposed change Customers first" })).toBeVisible();
  // While previewing, the region is named "Previewing Customers first".
  const bar = page.locator('[data-ouro="layout-proposal"]');
  const surface = page.getByTestId("surface");
  await expect(surface).toHaveText("ConversationsConversationCalendar");
  await bar.getByRole("button", { name: "Preview" }).click();
  await expect(surface).toHaveText("Customer chatsConversationAgenda");
  await expect(bar.getByRole("button", { name: "Back to current" })).toBeFocused();
  await expect(page.getByRole("region", { name: "Previewing Customers first" })).toBeVisible();
  await bar.getByRole("button", { name: "Back to current" }).click();
  await expect(surface).toHaveText("ConversationsConversationCalendar");
  await bar.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Applied: Customer chats, Conversation, Agenda")).toBeVisible();
  // The bar is gone: focus is on the line that says what happened, not on the page.
  await expect(page.getByText("Applied: Customer chats, Conversation, Agenda")).toBeFocused();
  await expect(page.getByRole("region", { name: /Customers first/ })).toHaveCount(0);
});
