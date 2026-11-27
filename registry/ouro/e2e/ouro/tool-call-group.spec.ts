import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a tool-call group is open while its calls run, and closes to one line when they settle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "chat-toolcallgroup--in-a-conversation");
  const running = page.getByRole("button", { name: "Running 2 tools" });
  await expect(running).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("rice on the stove for six")).toBeVisible();
  await page.getByRole("button", { name: "Finish the calls" }).click();
  const ran = page.getByRole("button", { name: "Ran 3 tools" });
  await expect(ran).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("rice on the stove for six")).toBeHidden();
  await ran.click();
  await expect(ran).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("rice on the stove for six")).toBeVisible();
});
