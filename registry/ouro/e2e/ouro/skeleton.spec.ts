import type { Page } from "@playwright/test";
import { expect, test } from "../ouro-fixtures";
import { openStory } from "./story";

test("skeletons are hidden from screen readers inside a busy region", async ({ page }) => {
  await openStory(page, "feedback-skeleton--recipe-card");
  const card = page.getByRole("group", { name: "Loading recipe" });
  // real clock: the story's card is busy for good; nothing in it ends on a timer.
  await expect(card).toHaveAttribute("aria-busy", "true");
  const skeletons = card.locator('[data-ouro="skeleton"]');
  await expect(skeletons).toHaveCount(6);
  for (const skeleton of await skeletons.all()) await expect(skeleton).toHaveAttribute("aria-hidden", "true");
});

async function deadFrames(page: Page, still: boolean): Promise<number> {
  // The control is the shimmering story with its animation stripped; the candidate is the story that sets shimmer={false}.
  await openStory(page, still ? "feedback-skeleton--long-scroller" : "feedback-skeleton--long-scroller-still");
  if (still) await page.addStyleTag({ content: '[data-ouro="skeleton"]::before { animation: none !important; }' });
  const scroller = page.getByRole("region", { name: "Long scroller" });
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('[aria-label="Long scroller"]')!;
    const w = window as unknown as { __frames: { wheel: number; scrollTop: number; maxTop: number }[]; __wheel: number; __stop: boolean };
    Object.assign(w, { __frames: [], __wheel: 0, __stop: false });
    addEventListener("wheel", (e) => (w.__wheel += e.deltaY), { capture: true, passive: true });
    const tick = () => {
      if (w.__stop) return;
      w.__frames.push({ wheel: w.__wheel, scrollTop: s.scrollTop, maxTop: s.scrollHeight - s.clientHeight });
      w.__wheel = 0;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const sent: Promise<void>[] = [];
  for (let flick = 0; flick < 12; flick++) {
    for (let delta = 60; delta >= 1; delta *= 0.95) {
      sent.push(page.mouse.wheel(0, Math.round(delta)));
      await new Promise((resolve) => setTimeout(resolve, 16)); // real clock: the wheel's own pace
    }
  }
  await Promise.all(sent);
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: { wheel: number; scrollTop: number; maxTop: number }[]; __stop: boolean };
    w.__stop = true;
    return w.__frames;
  });
  expect(frames.at(-1)!.scrollTop).toBeGreaterThan(1000);
  return frames.filter((f, i) => i > 0 && f.wheel !== 0 && f.scrollTop === frames[i - 1]!.scrollTop && f.scrollTop < f.maxTop - 1).length;
}

// WebKit drops a frame or two of wheel scrolling on its own, so shimmer={false} is judged against the same page with its animation off, alternated on the same runner.
test("wheel scrolling a long scroller of loading skeletons with shimmer={false} drops no more frames than the same page with its animation stripped", async ({ page }) => {
  test.setTimeout(900_000);
  const runs = 20;
  const control: number[] = [];
  const stilled: number[] = [];
  for (let run = 0; run < runs; run++) {
    control.push(await deadFrames(page, true));
    stilled.push(await deadFrames(page, false));
  }
  const sum = (counts: number[]) => counts.reduce((a, b) => a + b, 0);
  const failing = (counts: number[]) => counts.filter((count) => count > 0).length;
  const report = `shimmer={false} ${JSON.stringify(stilled)}, control ${JSON.stringify(control)}`;
  expect(failing(stilled), report).toBeLessThanOrEqual(failing(control));
  expect(sum(stilled), report).toBeLessThanOrEqual(sum(control));
});
