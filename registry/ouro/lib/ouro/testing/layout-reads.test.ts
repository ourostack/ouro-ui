import { describe, expect, it, onTestFinished } from "vitest";
import { layoutReadNames, watchLayoutReads } from "@/registry/ouro/lib/ouro/testing/layout-reads";

const own = (owner: object, name: string) => Object.getOwnPropertyDescriptor(owner, name);
const before = {
  offsetHeight: own(HTMLElement.prototype, "offsetHeight"),
  clientWidth: own(Element.prototype, "clientWidth"),
  rects: own(Element.prototype, "getBoundingClientRect"),
  rangeRects: own(Range.prototype, "getClientRects"),
  style: own(window, "getComputedStyle"),
};

describe("watchLayoutReads", () => {
  it("records each read that lays the page out, with what it was read from, in order", () => {
    const box = document.createElement("div");
    box.textContent = "words";
    document.body.append(box);
    const reads = watchLayoutReads();
    const values = [
      box.offsetHeight,
      box.offsetWidth,
      box.offsetTop,
      box.offsetLeft,
      box.offsetParent,
      box.clientHeight,
      box.clientWidth,
      box.clientTop,
      box.clientLeft,
      box.scrollHeight,
      box.scrollWidth,
      box.scrollTop,
      box.scrollLeft,
      box.getBoundingClientRect().height,
      box.getClientRects().length,
    ];
    const range = document.createRange();
    range.selectNodeContents(box);
    range.getBoundingClientRect();
    range.getClientRects();
    const style = getComputedStyle(box).display;
    reads.stop();
    box.remove();
    expect(values[0]).toBeGreaterThan(0);
    expect(style).toBe("block");
    expect(reads.names()).toEqual([...layoutReadNames.slice(0, 15), "getBoundingClientRect", "getClientRects", "getComputedStyle"]);
    expect(reads.reads.map((read) => read.target)).toEqual([...Array<unknown>(15).fill(box), range, range, box]);
  });

  it("reads a size changed a moment ago at once, which the browser can answer only by laying the page out first", () => {
    const box = document.createElement("div");
    box.style.width = "40px";
    document.body.append(box);
    void box.offsetWidth;
    box.style.width = "120px";
    const reads = watchLayoutReads();
    expect(box.offsetWidth).toBe(120);
    reads.stop();
    box.remove();
    expect(reads.names()).toEqual(["offsetWidth"]);
  });

  it("records nothing once stopped, and stops once", () => {
    const reads = watchLayoutReads();
    reads.stop();
    reads.stop();
    void document.body.offsetHeight;
    expect(reads.names()).toEqual([]);
  });

  it("puts the browser's own reads back on stop, and at the end of the test", () => {
    const reads = watchLayoutReads();
    expect(own(HTMLElement.prototype, "offsetHeight")).not.toEqual(before.offsetHeight);
    reads.stop();
    expect(own(HTMLElement.prototype, "offsetHeight")).toEqual(before.offsetHeight);
    expect(own(Element.prototype, "clientWidth")).toEqual(before.clientWidth);
    expect(own(Element.prototype, "getBoundingClientRect")).toEqual(before.rects);
    expect(own(Range.prototype, "getClientRects")).toEqual(before.rangeRects);
    expect(own(window, "getComputedStyle")).toEqual(before.style);
    // onTestFinished runs its callbacks last first, so this runs after the watch below has stopped itself.
    onTestFinished(() => {
      expect(own(HTMLElement.prototype, "offsetHeight")).toEqual(before.offsetHeight);
      expect(own(window, "getComputedStyle")).toEqual(before.style);
    });
    watchLayoutReads();
  });
});
