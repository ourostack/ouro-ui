import { describe, expect, it } from "vitest";
import { halveShown } from "@/registry/ouro/lib/ouro/halve";

/** Items down a page: a hidden one has a top of 0 (no box), the rest rise from 10 in steps of 10. */
const page = (hidden: number) => Array.from({ length: 7 }, (_, at) => ({ at, shown: (hidden >> at) % 2 === 0, top: 10 * (at + 1) }));
const topOf = (item: { shown: boolean; top: number }) => (item.shown ? item.top : 0);

describe("halveShown", () => {
  it("splits the items that have a place around the point, however the hidden ones lie", () => {
    for (let length = 0; length <= 7; length++) {
      for (let hidden = 0; hidden < 1 << length; hidden++) {
        for (let point = 0; point <= 10 * (length + 1); point += 5) {
          const list = page(hidden).slice(0, length);
          const found = halveShown(list, (item) => item.shown, (item) => topOf(item) < point);
          const placed = list.filter((item) => item.shown);
          expect(found).toBeGreaterThanOrEqual(0);
          expect(found).toBeLessThanOrEqual(length);
          for (const item of placed) expect(item.at < found).toBe(topOf(item) < point);
        }
      }
    }
  });

  it("says the point lies past a range where nothing has a place", () => {
    const list = [0, 1, 2, 3, 4];
    expect(halveShown(list, () => false, () => true)).toBe(5);
    expect(halveShown([], () => true, () => true)).toBe(0);
  });

  it("steps from a hidden item to the one after it, then the one before it, a step further each time", () => {
    const list = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const asked: number[] = [];
    const shown = (item: number) => (asked.push(item), item === 1 || item === 6);
    // The middle, 4, is hidden (asked for the item after it, then the one before it), then 5 and 3 are, and 6 has a place.
    expect(halveShown(list, shown, (item) => item < 0)).toBe(1);
    expect(asked.slice(0, 5)).toEqual([4, 4, 5, 3, 6]);
  });
});
