import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("an agent's recipe card renders with HX, and a consequential button asks before it acts", async ({ page }) => {
  await openStory(page, "display-a2uisurface--recipe-card");
  const surface = page.locator('[data-ouro="a2ui-surface"]');
  await expect(surface.getByRole("heading", { level: 1 })).toHaveText("Charred Lemon Orzo");
  await expect(surface.getByRole("img", { name: "A shallow pan of golden orzo with peas and charred lemon halves" })).toBeVisible();
  await expect(surface.locator("button[data-action]")).toHaveText(["Open recipe", "Add ingredients to list", "Share recipe", "Order ingredients"]);
  await surface.getByRole("button", { name: "Share recipe" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Share recipe?" });
  await expect(confirm).toContainText("sam@example.com");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
});

test("messages that fail validation show a short alert and no buttons", async ({ page }) => {
  await openStory(page, "display-a2uisurface--invalid");
  const surface = page.locator('[data-ouro="a2ui-surface"]');
  await expect(surface.getByText("This card can't be shown")).toBeVisible();
  await expect(surface.getByRole("button")).toHaveCount(0);
});
