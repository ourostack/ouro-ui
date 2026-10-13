import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("an accordion opens one item at a time", async ({ page }) => {
  await openStory(page, "lists-accordion--in-context");
  const storage = page.getByRole("button", { name: "How long does it keep?" });
  const freeze = page.getByRole("button", { name: "Can I freeze it?" });
  await expect(storage).toHaveAttribute("aria-expanded", "true");
  await freeze.click();
  await expect(freeze).toHaveAttribute("aria-expanded", "true");
  await expect(storage).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Thaw it overnight")).toBeVisible();
});

test("a multiple accordion keeps several open", async ({ page }) => {
  await openStory(page, "lists-accordion--multiple");
  await expect(page.getByRole("button", { name: "How long does it keep?" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Is there a vegan version?" })).toHaveAttribute("aria-expanded", "true");
});
