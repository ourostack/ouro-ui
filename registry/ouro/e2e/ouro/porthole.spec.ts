import { expect, test } from "../ouro-fixtures";
import { holdClock, openStory } from "./story";

// The trust check: each fault changes data-porthole-state within the time it promises.
const HEARTBEAT_TIMEOUT_MS = 5_000;
const TROUBLE_AFTER_MS = 5_000;

test("porthole says Status unknown within six seconds of the heartbeat stopping, and recovers on the next beat", async ({ page }) => {
  await page.clock.install();
  await openStory(page, "feedback-porthole--live");
  const spot = page.locator('[data-ouro="porthole"]');
  await expect(spot).toHaveAttribute("data-porthole-state", "rest-fresh");
  await page.getByRole("switch", { name: "Heartbeat" }).click();
  await holdClock(page);
  await page.clock.runFor(HEARTBEAT_TIMEOUT_MS);
  await expect(spot).toHaveAttribute("data-porthole-state", "rest-fresh");
  await page.clock.runFor(1_000);
  await expect(spot).toHaveAttribute("data-porthole-state", "unknown");
  await expect(spot.getByRole("button", { name: "Status unknown" })).toBeVisible();
  await page.clock.resume();
  await page.getByRole("switch", { name: "Heartbeat" }).click();
  await holdClock(page);
  await page.clock.runFor(1_000);
  await expect(spot).toHaveAttribute("data-porthole-state", "rest-fresh");
});

test("porthole stops saying just now five seconds into a hung read, and says so again once it clears", async ({ page }) => {
  await page.clock.install();
  await openStory(page, "feedback-porthole--live");
  const spot = page.locator('[data-ouro="porthole"]');
  await page.getByRole("switch", { name: "Calendar read hangs" }).click();
  await holdClock(page);
  await page.clock.runFor(TROUBLE_AFTER_MS - 1_000);
  await expect(spot).toHaveAttribute("data-porthole-state", "rest-fresh");
  await page.clock.runFor(1_000);
  await expect(spot).toHaveAttribute("data-porthole-state", "rest-stale");
  await expect(spot.getByRole("button", { name: "Updated less than a minute ago" })).toBeVisible();
  await spot.getByRole("button", { name: "Updated less than a minute ago" }).click();
  await expect(spot.getByText(/^Calendar: verified less than a minute ago, in trouble for/)).toBeVisible();
  await page.clock.resume();
  await page.getByRole("switch", { name: "Calendar read hangs" }).click();
  await expect(spot).toHaveAttribute("data-porthole-state", "rest-fresh");
});

test("porthole shows an error over rest, and an update the person restarts for and then dismisses", async ({ page }) => {
  await openStory(page, "feedback-porthole--live");
  const spot = page.locator('[data-ouro="porthole"]');
  await page.getByRole("switch", { name: "Service offline" }).click();
  await expect(spot).toHaveAttribute("data-porthole-state", "error");
  await page.getByRole("button", { name: "Offer an update" }).click();
  await expect(spot).toHaveAttribute("data-porthole-state", "action");
  await spot.getByRole("button", { name: "Restart" }).click();
  await expect(spot).toHaveAttribute("data-porthole-state", "error");
  await page.getByRole("switch", { name: "Service offline" }).click();
  await expect(spot.getByRole("button", { name: "Up to date" })).toBeVisible();
  await spot.getByRole("button", { name: "Dismiss" }).click();
  await expect(spot.getByRole("button", { name: "Updated just now" })).toBeVisible();
  await expect(spot.getByRole("button", { name: "Updated just now" })).toBeFocused();
});
