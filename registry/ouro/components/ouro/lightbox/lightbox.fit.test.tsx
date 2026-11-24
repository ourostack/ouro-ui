import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Lightbox, type LightboxImage } from "@/registry/ouro/components/ouro/lightbox/lightbox";
import { fitFrom } from "@/registry/ouro/components/ouro/lightbox/lightbox-styles";
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

async function render(fit: boolean, imgs: LightboxImage[] = images) {
  const host = document.createElement("div");
  host.style.width = "400px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<Lightbox label="Photos" images={imgs} layout="mosaic" fit={fit} />));
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
    expect(style.boxShadow.match(/-?[1-9]\d*(\.\d+)?px/g)).toBeNull();
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
    expect(popup()!.style.transformOrigin).toBe("50% 50%");
    expect(popup()!.style.getPropertyValue("--ouro-lightbox-from-x")).toMatch(/^-?\d+px$/);
    expect(popup()!.style.getPropertyValue("--ouro-lightbox-from-y")).toMatch(/^-?\d+px$/);
    expect(popup()!.getAttribute("data-fit")).toBe("");
  });

  it("uses the image shown's own shape for the growth, not always the first image's", async () => {
    const wide: LightboxImage = { src: picture(2000, 100, "#111"), alt: "Wide", width: 2000, height: 100 };
    const square: LightboxImage = { src: picture(100, 100, "#222"), alt: "Square", width: 100, height: 100 };
    const opener = document.createElement("button");
    opener.type = "button";
    opener.style.position = "fixed";
    opener.style.left = "0px";
    opener.style.top = "0px";
    opener.style.width = "120px";
    opener.style.height = "80px";
    document.body.append(opener);
    mounted.push(opener);
    opener.focus();
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    const onOpenChange = vi.fn();
    await act(async () => root.render(<Lightbox label="Photos" images={[square, wide]} open={false} index={1} onOpenChange={onOpenChange} fit />));
    await act(async () => root.render(<Lightbox label="Photos" images={[square, wide]} open index={1} onOpenChange={onOpenChange} fit />));
    await settled();
    const dialog = popup()!;
    const forWide = fitFrom(opener, dialog, wide);
    const forSquare = fitFrom(opener, dialog, square);
    expect(forWide.scale).not.toBe(forSquare.scale);
    expect(Number(dialog.style.getPropertyValue("--ouro-lightbox-from-scale"))).toBe(forWide.scale);
  });

  it("does not dismiss a click that was not preceded by a press beside the image", async () => {
    const host = await render(true);
    await userEvent.click(thumbnail(host));
    await settled();
    const dialog = popup()!;
    // A click with no prior pointerdown on this popup (a programmatic click, or one whose press
    // landed elsewhere) must not read a stale or wrongly-defaulted "pressed beside" flag.
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(popup()).not.toBeNull();
    // A press beside the image, released on the image itself, is not a dismissal either.
    dialog.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    dialog.querySelector("img")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(popup()).not.toBeNull();
    // That click must have reset the "pressed beside" flag: a further click with no new press
    // beside the image must not read it as still armed from the earlier pointerdown.
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(popup()).not.toBeNull();
    // Only a click whose own press and whose own release both land beside the image closes it.
    await userEvent.click(dialog, { position: { x: 20, y: 400 } });
    await expect.poll(popup).toBeNull();
  });

  it("fits a controlled viewer from what had focus, on the first image or the index given, and wins over fullScreen", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open";
    opener.style.cssText = "width:60px;height:40px";
    document.body.append(opener);
    mounted.push(opener);
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    const show = (index?: number) =>
      act(async () => root.render(<Lightbox label="Photos" images={images} open onOpenChange={() => {}} fullScreen fit {...(index === undefined ? {} : { index })} />));
    opener.focus();
    await show();
    await settled();
    expect(popup()!.hasAttribute("data-fit")).toBe(true);
    expect(popup()!.hasAttribute("data-full-screen")).toBe(false);
    expect(popup()!.style.getPropertyValue("--ouro-lightbox-from-scale")).not.toBe("");
    await act(async () => root.render(<Lightbox label="Photos" images={images} open={false} onOpenChange={() => {}} fit />));
    await expect.poll(popup).toBeNull();
    opener.focus();
    await show(1);
    await settled();
    expect(popup()!.style.getPropertyValue("--ouro-lightbox-from-scale")).not.toBe("");
  });

  it("keeps the panel and the 0.9 growth without fit", async () => {
    const host = await render(false);
    await userEvent.click(thumbnail(host));
    await settled();
    expect(popup()!.hasAttribute("data-fit")).toBe(false);
    expect(popup()!.style.getPropertyValue("--ouro-lightbox-from-scale")).toBe("");
    expect(getComputedStyle(popup()!).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("gives the title a quiet look and the header buttons a plain look, only with fit", async () => {
    // Large enough that the dialog draws it smaller than its own size, so the zoom button renders too.
    const bigImage: LightboxImage = { src: picture(2400, 1600, "#59a"), alt: "A big picture", href: "https://example.com/full.jpg" };
    const withHref = [bigImage, images[1]!];
    for (const fit of [true, false] as const) {
      const host = await render(fit, withHref);
      await userEvent.click(thumbnail(host));
      await settled();
      const dialog = popup()!;
      const fittedImg = dialog.querySelector<HTMLImageElement>("[data-ouro-lightbox-figure] > img")!;
      // The zoom button only renders once the image is measured and found larger than its fitted size.
      await expect.poll(() => fittedImg.complete && fittedImg.naturalWidth > 0).toBe(true);
      await expect.poll(() => dialog.querySelector('[data-ouro-part="zoom"]')).not.toBeNull();
      const title = dialog.querySelector<HTMLElement>("[data-ouro-dialog-title]")!;
      const original = dialog.querySelector<HTMLElement>('[data-ouro-part="original"]')!;
      const zoom = dialog.querySelector<HTMLElement>('[data-ouro-part="zoom"]')!;
      const close = dialog.querySelector<HTMLElement>('[data-ouro-part="close"]')!;
      if (fit) {
        expect(getComputedStyle(title).fontWeight).toBe("400");
        for (const button of [original, zoom, close]) {
          expect(getComputedStyle(button).borderColor).toBe("rgba(0, 0, 0, 0)");
          // Beyond the border, which an unrecognised variant falling back to "solid" would also
          // leave transparent for tone="secondary": a filled background tells plain from solid.
          expect(getComputedStyle(button).backgroundColor).toBe("rgba(0, 0, 0, 0)");
        }
      } else {
        expect(getComputedStyle(title).fontWeight).toBe("600");
        for (const button of [original, zoom, close]) {
          expect(getComputedStyle(button).borderColor).not.toBe("rgba(0, 0, 0, 0)");
        }
      }
      await userEvent.click(close);
      await expect.poll(popup).toBeNull();
    }
  });
});
