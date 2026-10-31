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
  it("zooms with a real double-tap, and then pans with a swipe instead of turning the page", async () => {
    const popup = await open();
    // A double-tap zooms only once the viewer has measured the image as drawn smaller than its own
    // size, which the Zoom button shows.
    await expect.poll(() => popup.querySelector('[data-ouro-part="zoom"]')).not.toBeNull();
    const box = fitted(popup).getBoundingClientRect();
    const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
    // A busy runner can deliver the second tap later than a double-tap allows (500ms): such a pair is
    // two single taps, so tap again rather than fail. A pair delivered in time must zoom.
    for (let pair = 0; pair < 3 && !zoomed(popup); pair++) {
      const started = performance.now();
      for (let press = 0; press < 2; press++) {
        await commands.touchStep({ type: "touchStart", x, y });
        await commands.touchStep({ type: "touchEnd", x, y });
      }
      if (performance.now() - started < 500) break;
      await new Promise((resolve) => setTimeout(resolve, 600));
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
