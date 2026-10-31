import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

const distanceFromBottom = (scroller: Locator) => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
const scrollTop = (scroller: Locator) => scroller.evaluate((el) => el.scrollTop);

/**
 * Waits until the list stops scrolling (wheel scrolling is smooth): until its position has held
 * for 30 frames in a row. Counting the page's own frames, rather than reading from here at
 * intervals, waits out a busy page that pauses a smooth scroll midway (a cold Storybook does),
 * since a paused page draws no frames.
 */
async function settle(scroller: Locator) {
  await scroller.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        let last = el.scrollTop;
        let still = 0;
        const frame = () => {
          still = el.scrollTop === last ? still + 1 : 0;
          last = el.scrollTop;
          if (still >= 30) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
}

async function wheelOver(page: Page, scroller: Locator, deltaY: number) {
  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await settle(scroller);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`at ${viewport.width}px, a reader who scrolls up keeps their place while a reply streams, and jumps back`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openStory(page, "chat-messagelist--live");
    const scroller = page.getByRole("region", { name: "Conversation with Ouro" });
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);

    // At the bottom, a new question and its streamed reply stay in view.
    await page.getByRole("button", { name: "Send next question" }).click();
    await expect(page.getByRole("article").last()).not.toHaveAttribute("aria-busy");
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);

    await wheelOver(page, scroller, -300);
    await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    const top = await scrollTop(scroller);
    await page.getByRole("button", { name: "Send next question" }).click();
    await expect(page.getByRole("article").last()).not.toHaveAttribute("aria-busy");
    expect(await scrollTop(scroller)).toBe(top);

    await page.getByRole("button", { name: "Jump to latest" }).click();
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Jump to latest" })).toHaveCount(0);
    await expect(scroller).toBeFocused();
  });
}

test("each finished reply is announced once, politely", async ({ page }) => {
  await openStory(page, "chat-messagelist--live");
  const live = page.locator("[data-ouro-message-list-live]");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await page.getByRole("button", { name: "Send next question" }).click();
  await expect(page.getByRole("article").last()).not.toHaveAttribute("aria-busy");
  await expect(live.locator("p")).toHaveCount(1);
  await expect(live.locator("p")).toHaveText(/^Ouro: /);
});
