import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("opens a picker of the official build and the builds serving now, and switches on choosing one", async ({ page }) => {
  await openStory(page, "feedback-buildchip--in-context");
  const trigger = page.getByRole("button", { name: /feature\/build-chip/ });
  await trigger.click();
  await expect(page.getByRole("menuitemradio", { name: "Official 1.4.0" })).toBeVisible();
  await page.getByRole("menuitemradio", { name: "Official 1.4.0" }).click();
  await expect(page.getByText("Running: Official 1.4.0")).toBeVisible();
});

test("shows the skew's message and fix, with no warning styling", async ({ page }) => {
  await openStory(page, "feedback-buildchip--skew");
  await page.getByRole("button", { name: /feature\/build-chip/ }).click();
  await expect(page.getByText("2 commits behind main")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Update" })).toBeVisible();
});
