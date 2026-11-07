import type { Locator, Page } from "@playwright/test";

/**
 * Waits in the page until `count` frames in a row each arrive within `gap` ms: the page has stopped drawing and hydrating
 * and is ready to be measured. It counts frames, not time, so a loaded browser that draws slowly takes longer to be
 * called settled instead of being measured while it still stalls.
 */
export function quietFrames(page: Page, count = 20, gap = 50): Promise<void> {
  return page.evaluate(
    ({ count, gap }) =>
      new Promise<void>((resolve) => {
        let last = 0;
        let quiet = 0;
        const tick = (now: number) => {
          quiet = last && now - last > gap ? 0 : quiet + 1;
          last = now;
          if (quiet >= count) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { count, gap },
  );
}

/**
 * Each frame's height of the element, from the frame before it first has any until it has held still for `still` frames.
 * It starts when called and ends by what the element does, so a press that comes late is still seen from its first frame.
 */
export function heightsUntilStill(target: Locator, still = 8): Promise<number[]> {
  return target.evaluate(
    (element, still) =>
      new Promise<number[]>((resolve) => {
        const seen: number[] = [];
        let held = 0;
        const tick = () => {
          const height = Math.round(element.getBoundingClientRect().height);
          if (seen.length > 0 || height > 0) {
            held = height === seen.at(-1) ? held + 1 : 0;
            seen.push(height);
          }
          if (held >= still) resolve(seen);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    still,
  );
}
