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

async function open() {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(<Lightbox label="Photos" images={images} />));
  await userEvent.click(host.querySelector<HTMLButtonElement>('[data-ouro-part="thumbnail"]')!);
  const popup = () => document.querySelector<HTMLElement>('[data-ouro="dialog"]');
  await expect.poll(() => Boolean(popup() && !popup()!.hasAttribute("data-starting-style") && popup()!.getAnimations().length === 0)).toBe(true);
  return popup()!;
}

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
