import type { Page } from "@playwright/test";
import { expect, test } from "../ouro-fixtures";
import { openStory } from "../ouro/story";

// The Skeleton frame probe: repository-only, run by skeleton-frames.yml on a schedule and by hand, never by CI's e2e
// shards (playwright.config.ts ignores probes/). It compares wheel scrolling of the shimmer={false} story with the
// same page with its animation stripped. The shipped spec checks only that no animation runs there (skeleton.spec.ts).

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
// Chromium doesn't drop these frames, so the probe's config runs WebKit only (#1221).
test("wheel scrolling a long scroller of loading skeletons with shimmer={false} drops no more frames than the same page with its animation stripped", async ({ page }) => {
  // About 15 minutes of measuring in WebKit with the default runs, so a run that hangs fails here, by name, before the job's limit.
  test.setTimeout(25 * 60_000);
  const runs = Number(process.env["OURO_PROBE_RUNS"] ?? 20);
  const control: number[] = [];
  const stilled: number[] = [];
  for (let run = 0; run < runs; run++) {
    control.push(await deadFrames(page, true));
    stilled.push(await deadFrames(page, false));
  }
  const report = `shimmer={false} ${JSON.stringify(stilled)}, control ${JSON.stringify(control)}`;
  expect(chanceOfMore(stilled, control), report).toBeGreaterThanOrEqual(0.001);
});
