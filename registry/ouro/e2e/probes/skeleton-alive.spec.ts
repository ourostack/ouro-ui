import type { Page } from "@playwright/test";
import { expect, test } from "../ouro-fixtures";
import { openStory } from "../ouro/story";
import { applyMode, modes, type Mode } from "./alive-modes";

async function deadFrames(page: Page, mode: Mode | "control"): Promise<number> {
  await openStory(page, "feedback-skeleton--long-scroller-still");
  await applyMode(page, mode);
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
  // The delayed prototypes only start after a second; scroll once they are running.
  await new Promise((resolve) => setTimeout(resolve, 1500)); // real clock: the prototypes' own delay
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
  if (!frames?.length) throw new Error("the page lost its frame log");
  expect(frames.at(-1)!.scrollTop).toBeGreaterThan(1000);
  return frames.filter((f, i) => i > 0 && f.wheel !== 0 && f.scrollTop === frames[i - 1]!.scrollTop && f.scrollTop < f.maxTop - 1).length;
}

const mode = process.env["OURO_ALIVE_MODE"] as Mode | undefined;

test("prototype's dead frames against the control, alternated", async ({ page }) => {
  test.skip(!mode || !modes.includes(mode), "set OURO_ALIVE_MODE");
  test.setTimeout(25 * 60_000);
  const runs = Number(process.env["OURO_PROBE_RUNS"] ?? 20);
  const control: number[] = [];
  const candidate: number[] = [];
  for (let run = 0; run < runs; run++) {
    control.push(await deadFrames(page, "control"));
    candidate.push(await deadFrames(page, mode!));
  }
  const sum = (counts: number[]) => counts.reduce((a, b) => a + b, 0);
  const row = `| ${mode} | ${sum(candidate)} | ${sum(control)} | ${JSON.stringify(candidate)} | ${JSON.stringify(control)} |`;
  console.log(`RESULT ${row}`);
});
