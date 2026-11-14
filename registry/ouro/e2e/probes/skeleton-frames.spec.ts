import type { Page } from "@playwright/test";
import { expect, test } from "../ouro-fixtures";
import { openStory } from "../ouro/story";

// The Skeleton frame probe: repository-only, run by skeleton-frames.yml on a schedule and by hand, never by CI's e2e
// shards (playwright.config.ts ignores probes/). It compares wheel scrolling of the default, breathing story with the
// same page with its animation stripped. The shipped spec checks only that no animation runs there (skeleton.spec.ts).

async function deadFrames(page: Page, still: boolean): Promise<number> {
  await page.setViewportSize({ width: 1280, height: 860 });
  // The control is the default story with its animation stripped; the candidate is the same story breathing.
  await openStory(page, "feedback-skeleton--long-scroller");
  if (still) await page.addStyleTag({ content: '[data-ouro="skeleton"] { animation: none !important; }' });
  // The breathing starts after a one-second delay; scroll once it is running.
  // real clock: the animation's own delay, which no state in the page reports.
  else await page.waitForTimeout(1500);
  const scroller = page.getByRole("region", { name: "Long scroller" });
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('[aria-label="Long scroller"]')!;
    const w = window as unknown as { __frames: { wheel: number; scrollTop: number; maxTop: number; moved: number | null }[]; __wheel: number; __stop: boolean };
    Object.assign(w, { __frames: [], __wheel: 0, __stop: false });
    addEventListener("wheel", (e) => (w.__wheel += e.deltaY), { capture: true, passive: true });
    // As the replay reads each frame: every row's box (a layout flush) and the row at the scroller's centre, whose
    // movement, not scrollTop, says whether the wheel moved anything.
    const pick = () => {
      const v = s.getBoundingClientRect();
      return document.elementFromPoint(v.left + v.width / 2, v.top + v.height / 2)?.closest("[data-row]") ?? null;
    };
    let anchor = pick();
    let anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;
    const tick = () => {
      if (w.__stop) return;
      const v = s.getBoundingClientRect();
      [...s.querySelectorAll("[data-row]")].some((r) => {
        const b = r.getBoundingClientRect();
        return b.height > 0 && b.bottom > v.top + 40 && b.top < v.bottom - 40;
      });
      const moved = anchor?.isConnected ? anchorTop - anchor.getBoundingClientRect().top : null;
      w.__frames.push({ wheel: w.__wheel, scrollTop: s.scrollTop, maxTop: s.scrollHeight - s.clientHeight, moved });
      anchor = pick();
      anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;
      w.__wheel = 0;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const sent: Promise<void>[] = [];
  // A trackpad's flicks as a consuming app's replay sends them: eight down the scroller, a pause, eight back up, each
  // decaying by 5% every 16 ms, sent without waiting for the page.
  const flicks = async (sign: 1 | -1) => {
    for (let flick = 0; flick < 8; flick++) {
      for (let delta = 60; delta >= 1; delta *= 0.95) {
        sent.push(page.mouse.wheel(0, sign * Math.round(delta)));
        await new Promise((resolve) => setTimeout(resolve, 16)); // real clock: the wheel's own pace
      }
    }
  };
  await flicks(1);
  await new Promise((resolve) => setTimeout(resolve, 1500)); // real clock: the replay's rest between directions
  await flicks(-1);
  await new Promise((resolve) => setTimeout(resolve, 1500)); // real clock: the replay's rest at the end
  await Promise.all(sent);
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames?: { wheel: number; scrollTop: number; maxTop: number; moved: number | null }[]; __stop: boolean };
    w.__stop = true;
    return w.__frames ?? null;
  });
  if (!frames?.length) throw new Error("deadFrames: the page lost its frame log while it was scrolled (it reloaded or navigated), so this run measured nothing");
  expect(Math.max(...frames.map((f) => f.scrollTop))).toBeGreaterThan(5000);
  // The replay's dead frame: the wheel came, the list was at neither end it pushes toward, and it moved neither that frame nor the next.
  const stays = (i: number) => i < frames.length && Math.abs(frames[i]!.moved ?? 0) < 0.5;
  const atEnd = (f: { wheel: number; scrollTop: number; maxTop: number; moved: number | null }) => (f.wheel < 0 ? f.scrollTop <= 1 : f.scrollTop >= f.maxTop - 1);
  return frames.filter((f, i) => i > 0 && f.wheel !== 0 && !atEnd(f) && stays(i) && stays(i + 1)).length;
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

// WebKit drops a frame or two of wheel scrolling on its own, so the breathing is judged against the same page with its
// animation stripped, alternated on the same runner. The two draw the same pixels, so their counts differ only by chance:
// a margin fails such pairs now and then, and a permutation test fails them at a fixed rate instead (1 in 1,000).
// Chromium doesn't drop these frames, so the probe's config runs WebKit only (#1221).
test("wheel scrolling a long scroller of loading skeletons breathing drops no more frames than the same page with its animation stripped", async ({ page }) => {
  // About 15 minutes of measuring in WebKit with the default runs, so a run that hangs fails here, by name, before the job's limit.
  test.setTimeout(25 * 60_000);
  const runs = Number(process.env["OURO_PROBE_RUNS"] ?? 20);
  const control: number[] = [];
  const breathing: number[] = [];
  for (let run = 0; run < runs; run++) {
    control.push(await deadFrames(page, true));
    breathing.push(await deadFrames(page, false));
  }
  const report = `breathing ${JSON.stringify(breathing)}, control ${JSON.stringify(control)}`;
  expect(Math.max(...breathing), report).toBe(0);
  expect(chanceOfMore(breathing, control), report).toBeGreaterThanOrEqual(0.001);
});
