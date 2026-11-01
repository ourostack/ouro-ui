import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("an avatar shows its picture once loaded and its initials without one", async ({ page }) => {
  await openStory(page, "display-avatar--sizes");
  const ana = page.getByRole("img", { name: "Ana Lind" }).first();
  await expect(ana.locator("img")).toBeVisible();
  const grace = page.getByRole("img", { name: "Grace Hopper" }).first();
  await expect(grace).toHaveText("GH");
});

test("a group shows max avatars and says how many more", async ({ page }) => {
  await openStory(page, "display-avatar--group");
  const cooks = page.getByRole("group", { name: "Cooks on this recipe" });
  await expect(cooks.getByRole("img")).toHaveCount(3);
  await expect(cooks).toContainText("2 more");
});

test("a presence dot is read after the name", async ({ page }) => {
  await openStory(page, "display-avatar--presence");
  await expect(page.getByRole("img", { name: "Grace Hopper, In a meeting" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Available", exact: true })).toBeVisible();
});
