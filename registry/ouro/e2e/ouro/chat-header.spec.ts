import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a group chat's header says who is in it, and its count opens the member list", async ({ page }) => {
  await openStory(page, "chat-chatheader--group");
  await expect(page.getByRole("heading", { name: "Launch crew" })).toBeVisible();
  await expect(page.getByText("Ana Lind and 3 others")).toBeVisible();
  await page.getByRole("button", { name: "4 members" }).click();
  const list = page.getByRole("dialog", { name: "Members" });
  await expect(list.getByRole("listitem")).toHaveCount(4);
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(page.getByRole("button", { name: "4 members" })).toBeFocused();
});

test("a one-to-one chat's header shows the person's presence and no member list", async ({ page }) => {
  await openStory(page, "chat-chatheader--one-to-one");
  await expect(page.getByRole("heading", { name: "Ana Lind" })).toBeVisible();
  await expect(page.getByText("Available")).toBeVisible();
  await expect(page.getByRole("button", { name: /members/ })).toHaveCount(0);
});
