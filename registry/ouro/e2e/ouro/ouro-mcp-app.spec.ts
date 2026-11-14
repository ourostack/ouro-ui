import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("the tool's card renders in its host, and each button reaches the host as its consent class says", async ({ page }) => {
  await openStory(page, "display-ouromcpapp--in-host");
  const view = page.locator('[data-ouro="ouro-mcp-app"]');
  const log = page.locator("[data-host-log] li");
  await expect(view.getByRole("heading", { level: 1 })).toHaveText("Charred Lemon Orzo");
  await view.getByRole("button", { name: "Add ingredients to list" }).click();
  await expect(log).toHaveText(['tools/call add_recipe_to_shopping_list {"recipe":"rcp_lemon_orzo","servings":4}']);
  await expect(view.locator('[data-ouro="alert"]')).toContainText("Added 6 ingredients to your shopping list.");
  await view.getByRole("button", { name: "Share recipe" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Share recipe?" });
  await expect(confirm).toContainText("sam@example.com");
  await expect(log).toHaveCount(1);
  await confirm.getByRole("button", { name: "Share recipe" }).click();
  await expect(log.nth(1)).toHaveText('tools/call share_recipe {"recipe":"rcp_lemon_orzo","with":"sam@example.com"}');
  await view.getByRole("button", { name: "Order ingredients" }).click();
  await expect(log.nth(2)).toHaveText("ui/open-link https://kitchen.example.com/recipes/rcp_lemon_orzo?do=order_ingredients");
  await expect(log).toHaveCount(3);
});
