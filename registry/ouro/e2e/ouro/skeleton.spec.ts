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
  for (let flick = 0; flick < 6; flick++) {
    for (let delta = 60; delta >= 1; delta *= 0.95) {
      sent.push(page.mouse.wheel(0, Math.round(delta)));
      await new Promise((resolve) => setTimeout(resolve, 16)); // real clock: the wheel's own pace
    }
  }
  await Promise.all(sent);
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames?: { wheel: number; scrollTop: number; maxTop: number }[]; __stop: boolean };
    w.__stop = true;
    return w.__frames ?? null;
  });
  if (!frames?.length) throw new Error("deadFrames: the page lost its frame log while it was scrolled (it reloaded or navigated), so this run measured nothing");
  expect(frames.at(-1)!.scrollTop).toBeGreaterThan(1000);
  return frames.filter((f, i) => i > 0 && f.wheel !== 0 && f.scrollTop === frames[i - 1]!.scrollTop && f.scrollTop < f.maxTop - 1).length;
}

/**
 * How likely chance alone makes `a`'s total at least this much larger than `b`'s, when both come
 * from the same page: a one-sided permutation test over the runs, shuffled with a fixed seed so
 * the same counts always give the same answer.
 */
function chanceOfMore(a: number[], b: number[], shuffles = 20_000): number {
  const total = (counts: number[]) => counts.reduce((sum, count) => sum + count, 0);
  const observed = total(a) - total(b);
  const pool = [...a, ...b];
  let seed = 0x2f6b1d;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  let asLarge = 0;
  for (let shuffle = 0; shuffle < shuffles; shuffle++) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    if (total(pool.slice(0, a.length)) - total(pool.slice(a.length)) >= observed) asLarge++;
  }
  return (asLarge + 1) / (shuffles + 1);
}

// WebKit drops a frame or two of wheel scrolling on its own, so shimmer={false} is judged against the same page with its
// animation stripped, alternated on the same runner. The two draw the same pixels, so their counts differ only by chance:
// a margin fails such pairs now and then, and a permutation test fails them at a fixed rate instead (1 in 1,000).
// Chromium doesn't drop these frames, so the comparison runs in WebKit only (#1221).
test("wheel scrolling a long scroller of loading skeletons with shimmer={false} drops no more frames than the same page with its animation stripped", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "WebKit is the engine that drops frames under a running shimmer.");
  // About twice what its 40 runs take in WebKit on CI, so a run that hangs fails here, by name, before the shard's limit.
  test.setTimeout(12 * 60_000);
  const runs = 20;
  const control: number[] = [];
  const stilled: number[] = [];
  for (let run = 0; run < runs; run++) {
    control.push(await deadFrames(page, true));
    stilled.push(await deadFrames(page, false));
    // The page just scrolled is the shimmer={false} story: nothing on a skeleton may be animating there.
    const running = await page.evaluate(() =>
      document.getAnimations().filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return animation.playState === "running" && target instanceof Element && target.closest('[data-ouro="skeleton"]') !== null;
      }).length,
    );
    expect(running, "an animation runs on a skeleton with shimmer={false}").toBe(0);
  }
  const report = `shimmer={false} ${JSON.stringify(stilled)}, control ${JSON.stringify(control)}`;
  expect(chanceOfMore(stilled, control), report).toBeGreaterThanOrEqual(0.001);
});
