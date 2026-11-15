import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a composed tree renders with HX, and a consequential button asks before it acts", async ({ page }) => {
  await openStory(page, "display-composedsurface--recipe-card");
  const surface = page.locator('[data-ouro="composed-surface"]');
  await expect(surface.getByRole("heading", { level: 1 })).toHaveText("Charred Lemon Orzo");
  await expect(surface.getByRole("img", { name: "A shallow pan of golden orzo with peas and charred lemon halves" })).toBeVisible();
  await expect(surface.locator("button[data-action]")).toHaveText(["Open recipe", "Add ingredients to list", "Share recipe", "Order ingredients"]);
  await surface.getByRole("button", { name: "Share recipe" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Share recipe?" });
  await expect(confirm).toContainText("Recipe: Charred Lemon Orzo rcp_lemon_orzo");
  await expect(confirm).toContainText("sam@example.com");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
});
