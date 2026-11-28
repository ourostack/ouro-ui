import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a tool call opens to its output, and a failed one says so in words", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "chat-toolcall--statuses");
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
  await expect(page.getByText("Waiting for you", { exact: true })).toBeVisible();
  const failed = page.getByRole("button", { name: /^Ran command\s+npm test\s+4\.2s\s*,\s*failed$/ });
  await expect(failed).toHaveAttribute("aria-expanded", "false");
  await failed.click();
  await expect(failed).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("fits the rice on the stove")).toBeVisible();
});
