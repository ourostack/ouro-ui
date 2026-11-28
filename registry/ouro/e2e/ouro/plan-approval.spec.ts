import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("a plan settles to who asked for changes, with what they wrote, when the person sends feedback", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "chat-planapproval--in-a-conversation");
  const plan = page.getByRole("article", { name: "Your agent's plan for dinner" });
  await expect(plan.getByText("Roast the lamb at 200°C for an hour")).toBeVisible();
  await plan.getByRole("button", { name: "Request changes" }).click();
  const field = plan.getByRole("textbox", { name: "What should change?" });
  await expect(field).toBeFocused();
  await field.fill("Make it vegetarian.");
  await plan.getByRole("button", { name: "Send" }).click();
  await expect(plan.getByRole("status")).toHaveText("Changes requested by you from this app");
  await expect(plan.getByRole("status")).toBeFocused();
  await expect(plan.getByText("Make it vegetarian.")).toBeVisible();
  await expect(plan.getByRole("button")).toHaveCount(0);
});
