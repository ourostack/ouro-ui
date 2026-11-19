import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("an app window frames a live demo: its file in the bar, the working controls inside, and what it is built with along its foot", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "display-appwindow--in-context");
  const frame = page.locator('[data-ouro="app-window"]');
  await expect(frame.locator('[data-slot="app-window-bar"]')).toContainText("tea.tsx");
  await expect(page.getByRole("list", { name: "Built with" }).getByRole("listitem")).toHaveText(["Checklist", "Button"]);
  const step = page.getByRole("checkbox", { name: /Warm the pot/ });
  await step.click();
  await expect(step).toBeChecked();
  await page.getByRole("button", { name: "Code" }).click();
  await expect(frame).toContainText('<Checklist label="Make a pot of tea"');
});
