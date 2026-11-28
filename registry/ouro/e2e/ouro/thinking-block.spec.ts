import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a thinking block is open while it streams, closes to one line when it ends, and opens again on a press", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "chat-thinkingblock--in-a-conversation");
  const thinking = page.getByRole("button", { name: "Thinking", exact: true });
  await expect(thinking).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("The roast needs the oven at 200°C for an hour")).toBeVisible();
  await page.getByRole("button", { name: "Finish thinking" }).click();
  const finished = page.getByRole("button", { name: "Thought for 12 seconds" });
  await expect(finished).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("The roast needs the oven at 200°C for an hour")).toBeHidden();
  await finished.click();
  await expect(finished).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("The roast needs the oven at 200°C for an hour")).toBeVisible();
});
