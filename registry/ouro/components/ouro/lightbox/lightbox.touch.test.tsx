import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { Lightbox, type LightboxImage } from "@/registry/ouro/components/ouro/lightbox/lightbox";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

const picture = (fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${fill}"/></svg>`)}`;

const images: LightboxImage[] = ["#335", "#cba", "#7a9"].map((fill, index) => ({ src: picture(fill), alt: `Photo ${index + 1}` }));

let root: Root | undefined;
const nodes: Element[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await commands.touchStep({ type: "touchEnd" });
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

async function open(shown: readonly LightboxImage[] = images) {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(<Lightbox label="Photos" images={shown} />));
  await userEvent.click(host.querySelector<HTMLButtonElement>('[data-ouro-part="thumbnail"]')!);
  const popup = () => document.querySelector<HTMLElement>('[data-ouro="dialog"]');
  await expect.poll(() => Boolean(popup() && !popup()!.hasAttribute("data-starting-style") && popup()!.getAnimations().length === 0)).toBe(true);
  const first = popup()!.querySelector<HTMLImageElement>("[data-ouro-lightbox-figure] > img")!;
  await expect.poll(() => first.complete && first.naturalWidth > 0).toBe(true);
  return popup()!;
}

const figure = (popup: HTMLElement) => popup.querySelector<HTMLElement>("[data-ouro-lightbox-figure]")!;
const fitted = (popup: HTMLElement) => figure(popup).querySelector<HTMLImageElement>(":scope > img")!;
const zoomed = (popup: HTMLElement) => figure(popup).querySelector<HTMLImageElement>("[data-ouro-lightbox-zoom-view] img");
const positionOf = (popup: HTMLElement) => popup.querySelector("[data-ouro-lightbox-position]")!.textContent;

/**
 * One step of a touch gesture, dispatched on `target` with the fingers at `points`, as the browser
 * sends it (touchstart, touchmove, touchend), so the pinch can be measured finger by finger.
 * Returns the event, to read whether a handler took its default.
 */
function touch(type: "touchstart" | "touchmove" | "touchend" | "touchcancel", target: Element, points: [number, number][]): TouchEvent {
  const touches = points.map(([clientX, clientY], identifier) => new Touch({ identifier, target, clientX, clientY }));
  const event = new TouchEvent(type, { bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches: touches });
  target.dispatchEvent(event);
  return event;
}

/** Two fingers `distance` apart, level, either side of (x, y). */
const fingers = (x: number, y: number, distance: number): [number, number][] => [
  [x - distance / 2, y],
  [x + distance / 2, y],
];

describe("Lightbox on a touch screen", () => {
  it("moves to the next image with a swipe", async () => {
    const popup = await open();
    const viewport = popup.querySelector<HTMLElement>("[data-ouro-carousel-viewport]")!;
    const rect = viewport.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    await commands.touchDrag({ from: [rect.right - 40, y], to: [rect.left + 40, y], steps: 12, durationMs: 400 });
    await expect.poll(() => popup.querySelector("[data-ouro-lightbox-position]")!.textContent).toBe("2 of 3");
  });

  it("gives its buttons a 44px target and fits the viewer to the phone", async () => {
    const popup = await open();
    const frame = popup.getBoundingClientRect();
    expect(frame.left).toBeGreaterThanOrEqual(0);
    expect(frame.right).toBeLessThanOrEqual(innerWidth);
    for (const name of ["Close", "Previous image", "Next image"]) {
      const button = popup.querySelector<HTMLElement>(`[aria-label="${name}"]`)!;
      const target = button.querySelector<HTMLElement>("[data-ouro-touch-target]") ?? button;
      const box = target.getBoundingClientRect();
      expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44);
    }
    const thumbnail = document.querySelector<HTMLElement>('[data-ouro-part="thumbnail"]')!.getBoundingClientRect();
    expect(Math.min(thumbnail.width, thumbnail.height)).toBeGreaterThanOrEqual(44);
  });
});

describe("Lightbox zoom on a touch screen", () => {
  it("pinches between the fitted size and the image's own size, holding the point between the fingers", async () => {
    const popup = await open();
    const picture = fitted(popup);
    const width = picture.offsetWidth;
    const box = picture.getBoundingClientRect();
    const [x, y] = [box.left + box.width * 0.3, box.top + box.height * 0.5];
    touch("touchstart", picture, fingers(x, y, 100));
    // The pinch's own moves: the carousel does not also swipe.
    expect(touch("touchmove", picture, fingers(x, y, 200)).defaultPrevented).toBe(true);
    await expect.poll(() => zoomed(popup)?.offsetWidth).toBeCloseTo(width * 2, -1);
    const drawn = zoomed(popup)!.getBoundingClientRect();
    expect((x - drawn.left) / drawn.width).toBeCloseTo(0.3, 2);
    // Never past the image's own size, and never smaller than fitted.
    touch("touchmove", picture, fingers(x, y, 5000));
    await expect.poll(() => zoomed(popup)?.offsetWidth).toBe(1200);
    touch("touchmove", picture, fingers(x, y, 10));
    await expect.poll(() => zoomed(popup)).toBeNull();
    touch("touchend", picture, []);
    expect(positionOf(popup)).toBe("1 of 3");
  });

  it("settles a pinch that ends nearly fitted, keeps one that ends zoomed, and pinches on from there", async () => {
    const popup = await open();
    const picture = fitted(popup);
    const box = picture.getBoundingClientRect();
    const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
    touch("touchstart", picture, fingers(x, y, 100));
    touch("touchmove", picture, fingers(x, y, 103));
    await expect.poll(() => zoomed(popup)).not.toBeNull();
    touch("touchend", picture, []);
    await expect.poll(() => zoomed(popup)).toBeNull();
    // Lifted straight after the move, before React has drawn it.
    touch("touchstart", picture, fingers(x, y, 100));
    touch("touchmove", picture, fingers(x, y, 200));
    touch("touchend", picture, []);
    await expect.poll(() => zoomed(popup)).not.toBeNull();
    // Two fingers that lift without moving change nothing.
    touch("touchstart", picture, fingers(x, y, 100));
    touch("touchend", picture, []);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(zoomed(popup)).not.toBeNull();
    const width = zoomed(popup)!.offsetWidth;
    // A third finger lifting leaves the pinch going; a cancelled touch ends it.
    touch("touchstart", picture, fingers(x, y, 100));
    touch("touchend", picture, fingers(x, y, 100));
    touch("touchmove", picture, fingers(x, y, 150));
    await expect.poll(() => zoomed(popup)?.offsetWidth).toBeCloseTo(width * 1.5, -1);
    touch("touchcancel", picture, []);
    expect(touch("touchmove", picture, fingers(x, y, 300)).defaultPrevented).toBe(false);
  });

  it("leaves one finger's moves, and a pinch on an image at its own size, to the browser", async () => {
    const small: LightboxImage = { src: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#335"/></svg>')}`, alt: "Small" };
    const popup = await open([small, ...images]);
    const drawn = fitted(popup);
    expect(drawn.offsetWidth).toBe(200);
    const box = drawn.getBoundingClientRect();
    const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
    touch("touchstart", drawn, [[x, y]]);
    expect(touch("touchmove", drawn, [[x + 30, y]]).defaultPrevented).toBe(false);
    touch("touchend", drawn, []);
    touch("touchstart", drawn, fingers(x, y, 40));
    expect(touch("touchmove", drawn, fingers(x, y, 80)).defaultPrevented).toBe(false);
    touch("touchend", drawn, []);
    expect(zoomed(popup)).toBeNull();
  });

  it("zooms with a real double-tap, and then pans with a swipe instead of turning the page", async () => {
    const popup = await open();
    const box = fitted(popup).getBoundingClientRect();
    const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
    for (let press = 0; press < 2; press++) {
      await commands.touchStep({ type: "touchStart", x, y });
      await commands.touchStep({ type: "touchEnd", x, y });
    }
    await expect.poll(() => zoomed(popup)).not.toBeNull();
    const scroller = popup.querySelector<HTMLElement>("[data-ouro-lightbox-zoom-view]")!;
    const before = scroller.scrollLeft;
    await commands.touchDrag({ from: [x + 100, y], to: [x - 100, y], steps: 10, durationMs: 300 });
    await expect.poll(() => scroller.scrollLeft).toBeGreaterThan(before);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(positionOf(popup)).toBe("1 of 3");
  });
});
