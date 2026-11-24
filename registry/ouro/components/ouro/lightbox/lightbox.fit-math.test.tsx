import { afterEach, describe, expect, it } from "vitest";
import { fitFrom } from "@/registry/ouro/components/ouro/lightbox/lightbox-styles";

// Pins fitFrom's arithmetic and its shape/picture/thumbnail fallback, called directly on
// constructed elements so every branch and operator has an exact, worked-by-hand expectation.

const nodes: Element[] = [];

function rectOf(el: Element, box: { left: number; top: number; width: number; height: number }): void {
  el.getBoundingClientRect = () =>
    ({ left: box.left, top: box.top, width: box.width, height: box.height, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => box }) as DOMRect;
}

function thumbnailAt(box: { left: number; top: number; width: number; height: number }): HTMLDivElement {
  const el = document.createElement("div");
  rectOf(el, box);
  nodes.push(el);
  return el;
}

function popupAt(offsetWidth: number, offsetHeight: number, box: { left: number; top: number; width: number; height: number }): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "offsetWidth", { configurable: true, get: () => offsetWidth });
  Object.defineProperty(el, "offsetHeight", { configurable: true, get: () => offsetHeight });
  rectOf(el, box);
  nodes.push(el);
  return el;
}

function pictureIn(thumbnail: Element, naturalWidth: number, naturalHeight: number): HTMLImageElement {
  const img = document.createElement("img");
  Object.defineProperty(img, "naturalWidth", { configurable: true, get: () => naturalWidth });
  Object.defineProperty(img, "naturalHeight", { configurable: true, get: () => naturalHeight });
  thumbnail.append(img);
  return img;
}

afterEach(() => {
  nodes.splice(0).forEach((node) => node.remove());
});

describe("fitFrom", () => {
  it("fits width-bound: the room's own width draws the picture, not its height times the shape", () => {
    const thumbnail = thumbnailAt({ left: 50, top: 100, width: 120, height: 80 });
    const popup = popupAt(1000, 700, { left: 0, top: 0, width: 1000, height: 700 });
    const { scale, x, y } = fitFrom(thumbnail, popup, { width: 200, height: 100 });
    expect(scale).toBe(0.125);
    expect(x).toBe(-390);
    expect(y).toBe(-212.25);
  });

  it("fits height-bound: the room's own height, times the shape, draws the picture instead", () => {
    const thumbnail = thumbnailAt({ left: 50, top: 100, width: 120, height: 80 });
    const popup = popupAt(1000, 700, { left: 0, top: 0, width: 1000, height: 700 });
    const { scale, x, y } = fitFrom(thumbnail, popup, { width: 100, height: 100 });
    // room = {width: 960, height: 624}; drawn = min(960, 624) = 624; scale = 120/624.
    expect(scale).toBe(120 / 624);
    expect(x).toBe(-390);
    expect(y).toBeCloseTo(-213.46153846153845, 10);
  });

  it("clamps the scale at 1, never growing the viewer past the picture's own size", () => {
    const thumbnail = thumbnailAt({ left: 0, top: 0, width: 2000, height: 80 });
    const popup = popupAt(1000, 700, { left: 0, top: 0, width: 1000, height: 700 });
    const { scale } = fitFrom(thumbnail, popup, { width: 100, height: 100 });
    expect(scale).toBe(1);
  });

  it("clamps the scale at 0.05, never shrinking the viewer past a visible size", () => {
    const thumbnail = thumbnailAt({ left: 0, top: 0, width: 1, height: 1 });
    const popup = popupAt(1000, 700, { left: 0, top: 0, width: 1000, height: 700 });
    const { scale } = fitFrom(thumbnail, popup, { width: 100, height: 100 });
    expect(scale).toBe(0.05);
  });

  it("draws the image's own shape over the thumbnail's picture and the thumbnail's own size", () => {
    const thumbnail = thumbnailAt({ left: 0, top: 0, width: 120, height: 80 });
    pictureIn(thumbnail, 800, 200);
    const popup = popupAt(1000, 700, { left: 0, top: 0, width: 1000, height: 700 });
    const { scale: shaped } = fitFrom(thumbnail, popup, { width: 100, height: 100 });
    const { scale: byPicture } = fitFrom(thumbnail, popup, undefined);
    // The shape (100x100, height-bound, scale 120/624) and the picture (800x200, width-bound,
    // scale 120/960) draw a different size; the shape must win when both are given.
    expect(shaped).toBe(120 / 624);
    expect(byPicture).toBe(0.125);
    expect(shaped).not.toBe(byPicture);
  });

  it("falls to the thumbnail's picture when the shape gives only one dimension", () => {
    const thumbnail = thumbnailAt({ left: 0, top: 0, width: 120, height: 80 });
    pictureIn(thumbnail, 100, 100);
    const popup = popupAt(1000, 700, { left: 0, top: 0, width: 1000, height: 700 });
    const { scale } = fitFrom(thumbnail, popup, { width: 500, height: undefined });
    // A shape missing its height must not be used; the picture's 100x100 (height-bound) wins instead.
    expect(scale).toBe(120 / 624);
  });

  it("falls to the thumbnail's own size with no shape and no picture, throwing nothing", () => {
    const thumbnail = thumbnailAt({ left: 0, top: 0, width: 120, height: 80 });
    const popup = popupAt(1000, 700, { left: 0, top: 0, width: 1000, height: 700 });
    // rect is 120x80 (w/h = 1.5); room = {960, 624}; drawn = min(960, 624*1.5=936) = 936.
    const { scale } = fitFrom(thumbnail, popup, undefined);
    expect(scale).toBe(120 / 936);
  });
});
