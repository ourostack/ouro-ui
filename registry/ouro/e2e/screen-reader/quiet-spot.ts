import type { Page } from "@playwright/test";

/**
 * A point in the viewport where a click lands on the page itself (the body, the document or
 * Storybook's root), not on a control: a corner, or the middle of an edge. The middle of the body
 * can be a control: in Celebrate's InContext story it is the last chore's label, and a click there
 * ticked it before the spec began. Null when every spot holds something.
 */
export async function quietSpot(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const width = innerWidth;
    const height = innerHeight;
    const spots: Array<[number, number]> = [
      [1, 1],
      [width - 2, 1],
      [1, height - 2],
      [width - 2, height - 2],
      [Math.round(width / 2), height - 2],
      [Math.round(width / 2), 1],
    ];
    for (const [x, y] of spots) {
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === document.body || hit === document.documentElement || hit.id === "storybook-root") return { x, y };
    }
    return null;
  });
}
