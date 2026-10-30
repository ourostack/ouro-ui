import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, server, userEvent } from "vitest/browser";
import { Lightbox, type LightboxImage } from "@/registry/ouro/components/ouro/lightbox/lightbox";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit; the pinch, built from touch events WebKit cannot construct, in
// Chromium alone. A real double-tap and swipe on a touch screen are in lightbox.touch.test.tsx.

/** A flat picture of the given size, drawn inline so the tests need no network. */
const picture = (width: number, height: number, fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${fill}"/><rect x="${width / 4}" y="${height / 4}" width="${width / 2}" height="${height / 2}" fill="#fff"/></svg>`)}`;

const wide: LightboxImage = { src: picture(1600, 1000, "#335"), alt: "A wide dashboard screenshot", caption: "Every row healthy." };
const small: LightboxImage = { src: picture(200, 120, "#a75"), alt: "A small badge" };
const photos: LightboxImage[] = ["#335", "#cba", "#7a9"].map((fill, index) => ({ src: picture(1200, 800, fill), alt: `Photo ${index + 1}` }));
const chromiumOnly = it.skipIf(server.browser !== "chromium");

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host;
}

const popup = () => document.querySelector<HTMLElement>('[data-ouro="dialog"]');
const slides = () => [...popup()!.querySelectorAll<HTMLElement>("[data-ouro-carousel-slide]")];
const figure = (index = 0) => slides()[index]!.querySelector<HTMLElement>("[data-ouro-lightbox-figure]")!;
const fittedImage = (index = 0) => figure(index).querySelector<HTMLImageElement>(":scope > img")!;
const view = (index = 0) => figure(index).querySelector<HTMLElement>("[data-ouro-lightbox-zoom-view]");
const zoomButton = () => popup()!.querySelector<HTMLButtonElement>('[data-ouro-part="zoom"]');
const position = () => popup()!.querySelector("[data-ouro-lightbox-position]")!.textContent;
const zoomedImage = () => view()?.querySelector("img") ?? null;

/** Opens the viewer on the first image and waits until its picture is loaded and measured. */
async function open(images: readonly LightboxImage[], props: { zoomLabel?: string } = {}) {
  const host = await render(<Lightbox label="Proof images" images={images} {...props} />);
  await userEvent.click(host.querySelector("button")!);
  await expect
    .poll(() => {
      const element = popup();
      return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
    })
    .toBe(true);
  await expect.poll(() => fittedImage().complete && fittedImage().naturalWidth > 0).toBe(true);
  return host;
}

/** A press at (x, y) on the fitted picture, as a short tap or click: pointerdown and pointerup. */
function tap(x: number, y: number, { from, primary = true, index = 0 }: { from?: [number, number]; primary?: boolean; index?: number } = {}) {
  const target = view(index) ?? fittedImage(index);
  const fire = (type: string, at: [number, number]) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: primary, pointerType: "touch", clientX: at[0], clientY: at[1] }));
  fire("pointerdown", from ?? [x, y]);
  fire("pointerup", [x, y]);
}

/** A point on the fitted picture, as fractions of its width and height. */
function onPicture(fx: number, fy: number, index = 0): [number, number] {
  const box = fittedImage(index).getBoundingClientRect();
  return [box.left + fx * box.width, box.top + fy * box.height];
}

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

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await page.viewport(390, 844);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await commands.emulateMedia({ reducedMotion: "reduce" });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

describe("Lightbox on a phone", () => {
  it("draws a wide image across the phone's whole width, uncropped", async () => {
    await open([wide]);
    expect(popup()!.getBoundingClientRect().width).toBe(390);
    const image = fittedImage();
    expect(image.offsetWidth).toBeGreaterThanOrEqual(360);
    expect(image.offsetWidth / image.offsetHeight).toBeCloseTo(1600 / 1000, 1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("never draws an image larger than its own size", async () => {
    await page.viewport(1280, 800);
    await open([small]);
    expect([fittedImage().offsetWidth, fittedImage().offsetHeight]).toEqual([200, 120]);
  });
});

describe("Lightbox zoom", () => {
  it("offers the zoom button only while the image is drawn smaller than its own size", async () => {
    await open([wide, small, { src: picture(375, 200, "#7a9"), alt: "Nearly fitted" }, { src: picture(420, 200, "#7a9"), alt: "A little wider" }]);
    await expect.poll(zoomButton).not.toBeNull();
    expect(zoomButton()!.getAttribute("aria-label")).toBe("Zoom");
    expect(zoomButton()!.getAttribute("aria-pressed")).toBe("false");
    // The small image is drawn at its own size, and one drawn at 98% of it is near enough.
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("2 of 4");
    expect(zoomButton()).toBeNull();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("3 of 4");
    expect(zoomButton()).toBeNull();
    // At 87% there is something to gain.
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("4 of 4");
    await expect.poll(zoomButton).not.toBeNull();
  });

  it("measures again when the screen changes, and drops the button once the image fits at its own size", async () => {
    await open([{ src: picture(900, 600, "#335"), alt: "A medium screenshot" }]);
    await expect.poll(zoomButton).not.toBeNull();
    await page.viewport(1280, 800);
    await expect.poll(zoomButton).toBeNull();
    expect(fittedImage().offsetWidth).toBe(900);
  });

  it("zooms to the image's own size from the zoom button, in the middle, and back", async () => {
    await open([wide, { ...wide, alt: "Another wide screenshot" }], { zoomLabel: "Agrandir" });
    await expect.poll(zoomButton).not.toBeNull();
    // A magnifier with a plus, and with a minus once zoomed.
    const icon = () => zoomButton()!.querySelector("svg[aria-hidden='true'] path")!.getAttribute("d");
    expect(icon()).toBe("M5 7h4M7 5v4M10.5 10.5L14 14");
    await userEvent.click(zoomButton()!);
    const scroller = view()!;
    expect(scroller).not.toBeNull();
    // Only the image in view zooms.
    expect(popup()!.querySelectorAll("[data-ouro-lightbox-zoom-view]")).toHaveLength(1);
    expect(zoomButton()!.getAttribute("aria-pressed")).toBe("true");
    expect(icon()).toBe("M5 7h4M10.5 10.5L14 14");
    expect(figure().hasAttribute("data-zoomed")).toBe(true);
    const zoomedImage = scroller.querySelector("img")!;
    expect(zoomedImage.offsetWidth).toBeCloseTo(1600, -1);
    expect(zoomedImage.alt).toBe("A wide dashboard screenshot");
    // The fitted picture keeps its place, hidden, so the slide does not change size.
    expect(getComputedStyle(fittedImage()).visibility).toBe("hidden");
    // The image covers the caption, which steps aside until the image is fitted again.
    expect(getComputedStyle(figure().querySelector("figcaption")!).visibility).toBe("hidden");
    expect(scroller.scrollLeft).toBeCloseTo((scroller.scrollWidth - scroller.clientWidth) / 2, -1);
    expect(scroller.scrollTop).toBeCloseTo((scroller.scrollHeight - scroller.clientHeight) / 2, -1);
    // A named scroller a keyboard can reach, whose edge stops a swipe.
    expect(scroller.getAttribute("role")).toBe("group");
    expect(scroller.getAttribute("aria-label")).toBe("Agrandir");
    expect(scroller.tabIndex).toBe(0);
    expect(scroller.getAttribute("data-ouro-control")).toBe("lightbox");
    expect(getComputedStyle(scroller).overscrollBehaviorX).toBe("contain");
    expect(getComputedStyle(figure()).touchAction).toBe("pan-x pan-y");
    await userEvent.click(zoomButton()!);
    expect(view()).toBeNull();
    expect(zoomButton()!.getAttribute("aria-pressed")).toBe("false");
    expect(icon()).toBe("M5 7h4M7 5v4M10.5 10.5L14 14");
    expect(getComputedStyle(fittedImage()).visibility).toBe("visible");
    expect(getComputedStyle(figure().querySelector("figcaption")!).visibility).toBe("visible");
  });

  it("zooms at a double-tap's point and back with another", async () => {
    await open([wide]);
    await expect.poll(zoomButton).not.toBeNull();
    const [x, y] = onPicture(0.4, 0.6);
    tap(x, y);
    tap(x, y);
    await expect.poll(() => view()).not.toBeNull();
    // The point tapped stays under the finger.
    const box = view()!.querySelector("img")!.getBoundingClientRect();
    expect((x - box.left) / box.width).toBeCloseTo(0.4, 2);
    expect((y - box.top) / box.height).toBeCloseTo(0.6, 2);
    tap(x, y);
    tap(x, y);
    await expect.poll(() => view()).toBeNull();
  });

  it("takes no slow, distant, dragged or second-finger tap for a double-tap", async () => {
    await open([wide]);
    await expect.poll(zoomButton).not.toBeNull();
    const [x, y] = onPicture(0.5, 0.5);
    tap(x, y);
    await new Promise((resolve) => setTimeout(resolve, 350));
    tap(x, y);
    tap(x + 40, y);
    // Dragged 40px, ending where the tap before it was.
    tap(x + 40, y, { from: [x + 40, y - 40] });
    tap(x, y);
    tap(x, y, { primary: false });
    tap(x, y);
    figure().dispatchEvent(new PointerEvent("pointerup", { bubbles: true, isPrimary: true, clientX: x, clientY: y }));
    tap(x, y);
    // A second finger landing between two taps makes them a pinch's.
    fittedImage().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, isPrimary: false, clientX: x, clientY: y }));
    tap(x, y);
    expect(view()).toBeNull();
  });

  it("zooms nothing on a double-tap at an image drawn nearly at its own size", async () => {
    await open([wide, { src: picture(375, 200, "#7a9"), alt: "Nearly fitted" }]);
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("2 of 2");
    await expect.poll(() => fittedImage(1).naturalWidth).toBe(375);
    const [x, y] = onPicture(0.5, 0.5, 1);
    tap(x, y, { index: 1 });
    tap(x, y, { index: 1 });
    expect(view(1)).toBeNull();
  });

  it("draws the next image fitted, and the zoomed one fitted again on return", async () => {
    await open([wide, wide]);
    await expect.poll(zoomButton).not.toBeNull();
    await userEvent.click(zoomButton()!);
    expect(view()).not.toBeNull();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("2 of 2");
    expect(view(0)).toBeNull();
    expect(view(1)).toBeNull();
    expect(zoomButton()!.getAttribute("aria-pressed")).toBe("false");
    await userEvent.keyboard("{ArrowLeft}");
    await expect.poll(position).toBe("1 of 2");
    expect(view(0)).toBeNull();
  });

  it("leaves the arrow keys to a zoomed image's scrolling rather than turning the page", async () => {
    await open([wide, wide]);
    await expect.poll(zoomButton).not.toBeNull();
    await userEvent.click(zoomButton()!);
    const scroller = view()!;
    scroller.focus();
    // The browser scrolls the focused scroller unless a handler takes the key.
    const taken: boolean[] = [];
    const record = (event: KeyboardEvent) => setTimeout(() => taken.push(event.defaultPrevented));
    addEventListener("keydown", record, true);
    try {
      await userEvent.keyboard("{ArrowRight}");
      await expect.poll(() => taken).toEqual([false]);
    } finally {
      removeEventListener("keydown", record, true);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(position()).toBe("1 of 2");
    expect(view()).not.toBeNull();
  });
});

describe("Lightbox pinch", () => {
  chromiumOnly("pinches between the fitted size and the image's own size, holding the point between the fingers", async () => {
    await open(photos);
    const target = fittedImage();
    const width = target.offsetWidth;
    const box = target.getBoundingClientRect();
    const [x, y] = [box.left + box.width * 0.3, box.top + box.height * 0.5];
    touch("touchstart", target, fingers(x, y, 100));
    // The pinch's own moves: the carousel does not also swipe.
    expect(touch("touchmove", target, fingers(x, y, 200)).defaultPrevented).toBe(true);
    await expect.poll(() => zoomedImage()?.offsetWidth).toBeCloseTo(width * 2, -1);
    const drawn = zoomedImage()!.getBoundingClientRect();
    expect((x - drawn.left) / drawn.width).toBeCloseTo(0.3, 2);
    // Never past the image's own size, and never smaller than fitted.
    touch("touchmove", target, fingers(x, y, 5000));
    await expect.poll(() => zoomedImage()?.offsetWidth).toBe(1200);
    touch("touchmove", target, fingers(x, y, 10));
    await expect.poll(() => zoomedImage()).toBeNull();
    touch("touchend", target, []);
    expect(position()).toBe("1 of 3");
  });

  chromiumOnly("settles a pinch that ends nearly fitted, keeps one that ends zoomed, and pinches on from there", async () => {
    await open(photos);
    const target = fittedImage();
    const box = target.getBoundingClientRect();
    const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
    touch("touchstart", target, fingers(x, y, 100));
    touch("touchmove", target, fingers(x, y, 103));
    await expect.poll(() => zoomedImage()).not.toBeNull();
    touch("touchend", target, []);
    await expect.poll(() => zoomedImage()).toBeNull();
    // Lifted straight after the move, before React has drawn it.
    touch("touchstart", target, fingers(x, y, 100));
    touch("touchmove", target, fingers(x, y, 200));
    touch("touchend", target, []);
    await expect.poll(() => zoomedImage()).not.toBeNull();
    // Two fingers that lift without moving change nothing.
    touch("touchstart", target, fingers(x, y, 100));
    touch("touchend", target, []);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(zoomedImage()).not.toBeNull();
    const width = zoomedImage()!.offsetWidth;
    // A third finger lifting leaves the pinch going; a cancelled touch ends it.
    touch("touchstart", target, fingers(x, y, 100));
    touch("touchend", target, fingers(x, y, 100));
    touch("touchmove", target, fingers(x, y, 150));
    await expect.poll(() => zoomedImage()?.offsetWidth).toBeCloseTo(width * 1.5, -1);
    touch("touchcancel", target, []);
    expect(touch("touchmove", target, fingers(x, y, 300)).defaultPrevented).toBe(false);
  });

  chromiumOnly("leaves one finger's moves, and a pinch on an image at its own size, to the browser", async () => {
    await open([small, ...photos]);
    const drawn = fittedImage();
    expect(drawn.offsetWidth).toBe(200);
    const box = drawn.getBoundingClientRect();
    const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
    touch("touchstart", drawn, [[x, y]]);
    expect(touch("touchmove", drawn, [[x + 30, y]]).defaultPrevented).toBe(false);
    touch("touchend", drawn, []);
    touch("touchstart", drawn, fingers(x, y, 40));
    expect(touch("touchmove", drawn, fingers(x, y, 80)).defaultPrevented).toBe(false);
    touch("touchend", drawn, []);
    expect(zoomedImage()).toBeNull();
  });
});
