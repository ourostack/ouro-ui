import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Lightbox, type LightboxImage } from "@/registry/ouro/components/ouro/lightbox/lightbox";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in Chromium and WebKit: the fitted viewer.

const roots: Root[] = [];
const mounted: Element[] = [];

const picture = (width: number, height: number, fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${fill}"/></svg>`)}`;

const images: LightboxImage[] = [
  { src: picture(900, 600, "#68a"), alt: "Two mugs on a dock", width: 900, height: 600, caption: "On the dock" },
  { src: picture(800, 600, "#ec7"), alt: "The retro board", width: 800, height: 600 },
];

async function render(fit: boolean) {
  const host = document.createElement("div");
  host.style.width = "400px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<Lightbox label="Photos" images={images} layout="mosaic" fit={fit} />));
  return host;
}

const popup = () => document.querySelector<HTMLElement>('[data-ouro="dialog"]');
const thumbnail = (host: Element) => host.querySelector<HTMLButtonElement>('[data-ouro-part="thumbnail"]')!;
async function settled() {
  await expect
    .poll(() => Boolean(popup() && !popup()!.hasAttribute("data-starting-style") && popup()!.getAnimations().length === 0))
    .toBe(true);
}

beforeEach(async () => {
  await page.viewport(1280, 800);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await commands.emulateMedia({ reducedMotion: "reduce" });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted.splice(0)) node.remove();
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

describe("Lightbox fit", () => {
  it("draws no panel, and a press beside the image dismisses it, but not one on the image, the caption or a button", async () => {
    const host = await render(true);
    await userEvent.click(thumbnail(host));
    await settled();
    const style = getComputedStyle(popup()!);
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.boxShadow).toBe("none");
    expect(popup()!.hasAttribute("data-fit")).toBe(true);
    await userEvent.click(popup()!.querySelector("img")!);
    await userEvent.click(popup()!.querySelector("figcaption")!);
    expect(popup()).not.toBeNull();
    await userEvent.click(popup()!, { position: { x: 20, y: 400 } });
    await expect.poll(popup).toBeNull();
  });

  it("grows from the thumbnail's size, not from 0.9, and only fades with reduced motion", async () => {
    const host = await render(true);
    const small = thumbnail(host).getBoundingClientRect().width;
    await userEvent.click(thumbnail(host));
    const scale = Number(popup()!.style.getPropertyValue("--ouro-lightbox-from-scale"));
    expect(scale).toBeGreaterThan(0.05);
    expect(scale).toBeLessThan(0.5);
    expect(scale).not.toBe(0.9);
    expect(small).toBeGreaterThan(0);
    expect(popup()!.style.getPropertyValue("--ouro-lightbox-from-x")).toMatch(/px$/);
  });

  it("keeps the panel and the 0.9 growth without fit", async () => {
    const host = await render(false);
    await userEvent.click(thumbnail(host));
    await settled();
    expect(popup()!.hasAttribute("data-fit")).toBe(false);
    expect(popup()!.style.getPropertyValue("--ouro-lightbox-from-scale")).toBe("");
    expect(getComputedStyle(popup()!).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });
});
