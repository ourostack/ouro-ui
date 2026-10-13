import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("an attachment opens from a link named by the file and its size", async ({ page }) => {
  await openStory(page, "chat-attachment--files");
  await expect(page.getByRole("link", { name: "menu.pdf 2 kB" })).toHaveAttribute("href", "#menu");
});

test("a removable attachment goes when its remove button is pressed", async ({ page }) => {
  await openStory(page, "chat-attachment--removable");
  await expect(page.locator('[data-ouro="attachment"]')).toHaveCount(3);
  await page.getByRole("button", { name: "Remove crumb.jpg" }).click();
  await expect(page.locator('[data-ouro="attachment"]')).toHaveCount(2);
  await expect(page.getByText("crumb.jpg")).toHaveCount(0);
});
