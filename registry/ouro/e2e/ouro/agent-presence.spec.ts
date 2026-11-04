import { expect, test } from "../ouro-fixtures";
import { openStory, pressTab } from "./story";

test("the chip counts the agents, and its popover stops one, then the rest", async ({ page }) => {
  await openStory(page, "feedback-agentpresence--two-agents");
  const chip = page.getByRole("button", { name: "2 agents listening: inbox agent, research agent" });
  await expect(chip).toHaveText("2 agents listening");
  await chip.click();
  const popover = page.getByRole("dialog", { name: "Agents listening" });
  await expect(popover).toBeVisible();
  await expect(popover).toContainText("listening for your name, and anything about the empty state");
  await popover.getByRole("button", { name: "Stop inbox agent" }).click();
  await expect(page.getByRole("button", { name: "research agent listening" })).toBeVisible();
  await expect(popover.getByRole("button", { name: "Stop all" })).toBeHidden();
  await expect(popover.getByRole("button", { name: "Stop research agent" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-ouro="agent-presence"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask them to listen again" })).toBeFocused();
});

test("from the keyboard, Stop all ends every agent and focus moves on", async ({ page }) => {
  await openStory(page, "feedback-agentpresence--two-agents");
  await pressTab(page);
  await expect(page.getByRole("button", { name: /^2 agents listening/ })).toBeFocused();
  await page.keyboard.press("Enter");
  const popover = page.getByRole("dialog", { name: "Agents listening" });
  await expect(popover.getByRole("button", { name: "Stop inbox agent" })).toBeFocused();
  await popover.getByRole("button", { name: "Stop all" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-ouro="agent-presence"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask them to listen again" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^2 agents listening/ })).toBeVisible();
});

test("compact shows the sparkle and a count, and the empty story shows no chip until an agent listens", async ({ page }) => {
  await openStory(page, "feedback-agentpresence--compact");
  await expect(page.getByRole("button", { name: "2 agents listening: inbox agent, research agent" })).toHaveText("2");
  await openStory(page, "feedback-agentpresence--empty");
  await expect(page.locator('[data-ouro="agent-presence"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Ask them to listen again" }).click();
  await expect(page.getByRole("button", { name: "inbox agent listening" })).toBeVisible();
});
