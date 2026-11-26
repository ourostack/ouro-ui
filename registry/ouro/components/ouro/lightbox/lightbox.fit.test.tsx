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

/** Whether the controls sit 12px in from the shown picture's top and end edges, to the pixel: its edges fall between pixels. */
function onCorner(dialog: HTMLElement) {
  const shownPic = [...dialog.querySelectorAll<HTMLImageElement>("[data-ouro-lightbox-figure] > img")]
    .find((p) => {
      const r = p.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth;
    })!
    .getBoundingClientRect();
  const group = dialog.querySelector('[data-ouro-lightbox-header] [data-ouro="button-group"]')!.getBoundingClientRect();
  const end = getComputedStyle(dialog).direction === "rtl" ? group.left - shownPic.left - 12 : shownPic.right - group.right - 12;
  return { right: Math.abs(end) <= 1, top: Math.abs(group.top - shownPic.top - 12) <= 1 };
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
    await act(async () => root.render(<Lightbox label="Photos" images={images} open={false} onOpenChange={() => {}} fit />));
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

  it("hides the title from sight and puts the header buttons in one glass group, only with fit", async () => {
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
        // Named for screen readers, not drawn: the picture is the viewer.
        expect(title.closest("[data-ouro-lightbox-header] > div")!.getBoundingClientRect().width).toBeLessThanOrEqual(1);
        // One glass group holds them all, each button plain inside it.
        const group = dialog.querySelector<HTMLElement>('[data-ouro-lightbox-header] [data-ouro="button-group"]')!;
        const glass = getComputedStyle(group);
        expect(glass.backdropFilter || glass.getPropertyValue("-webkit-backdrop-filter")).toMatch(/blur/);
        for (const button of [original, zoom, close]) {
          expect(button.parentElement).toBe(group);
          expect(button.getAttribute("data-variant")).toBe("plain");
          expect(getComputedStyle(button).backgroundColor).toBe("rgba(0, 0, 0, 0)");
        }
        expect(group.lastElementChild).toBe(close);
      } else {
        expect(getComputedStyle(title).fontWeight).toBe("600");
        for (const button of [original, zoom, close]) {
          expect(button.getAttribute("data-variant")).toBe("outline");
          expect(getComputedStyle(button).borderColor).not.toBe("rgba(0, 0, 0, 0)");
        }
      }
      await userEvent.click(close);
      await expect.poll(popup).toBeNull();
    }
  });
  it("draws a picture smaller than the screen as large as fits, at its own shape, with its caption under it", async () => {
    const host = await render(true);
    await userEvent.click(thumbnail(host));
    await settled();
    const img = popup()!.querySelector<HTMLImageElement>("[data-ouro-lightbox-figure] > img")!;
    await expect.poll(() => img.getBoundingClientRect().width).toBeGreaterThan(900);
    const pic = img.getBoundingClientRect();
    expect(pic.width / pic.height).toBeCloseTo(900 / 600, 2);
    const figure = img.parentElement!.getBoundingClientRect();
    const caption = popup()!.querySelector("figcaption")!.getBoundingClientRect();
    // Height-bound at 1280 by 800: the picture and its caption take the figure's whole height.
    expect(caption.bottom).toBeGreaterThan(figure.bottom - 2);
    expect(caption.top).toBeGreaterThan(pic.bottom);
    expect(pic.top).toBeLessThan(figure.top + 2);
    // A picture drawn past its own size has nothing more to zoom into.
    expect(popup()!.querySelector('[data-ouro-part="zoom"]')).toBeNull();
  });

  it("keeps the controls on the shown picture's top-end corner, set in from it, after the picture changes", async () => {
    const host = await render(true);
    await userEvent.click(thumbnail(host));
    await settled();
    const dialog = popup()!;
    const corner = () => onCorner(dialog);
    await expect.poll(corner).toEqual({ right: true, top: true });
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => dialog.querySelector("[data-ouro-lightbox-position]")!.textContent).toBe("2 of 2");
    await expect.poll(corner).toEqual({ right: true, top: true });
  });

  it("stays open for a press on the buttons' cluster that misses a button, as on the picture", async () => {
    const host = await render(true);
    await userEvent.click(thumbnail(host));
    await settled();
    const header = popup()!.querySelector<HTMLElement>("[data-ouro-lightbox-header]")!;
    await userEvent.click(header.querySelector("[data-ouro-lightbox-position]")!);
    header.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    header.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(popup()).not.toBeNull();
  });
  it("groups Previous, the position, Next and Close as one glass control, and hides the carousel's own", async () => {
    const host = await render(true);
    await userEvent.click(thumbnail(host));
    await settled();
    const dialog = popup()!;
    const group = dialog.querySelector<HTMLElement>('[data-ouro-lightbox-header] [data-ouro="button-group"]')!;
    const style = getComputedStyle(group);
    expect(style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter")).toMatch(/blur/);
    expect([...group.children].map((c) => c.getAttribute("data-ouro-part") ?? (c.hasAttribute("data-ouro-lightbox-position") ? "position" : "?"))).toEqual(["previous", "position", "next", "close"]);
    for (const part of ["previous", "next"]) expect(dialog.querySelector<HTMLElement>(`[data-ouro-control="carousel"][data-ouro-part="${part}"]`)!.getClientRects().length).toBe(0);
    const previous = group.querySelector<HTMLButtonElement>('[data-ouro-part="previous"]')!;
    const next = group.querySelector<HTMLButtonElement>('[data-ouro-part="next"]')!;
    expect(previous.disabled).toBe(true);
    await userEvent.click(next);
    await expect.poll(() => group.querySelector("[data-ouro-lightbox-position]")!.textContent).toBe("2 of 2");
    await expect.poll(() => next.disabled).toBe(true);
    await userEvent.click(previous);
    await expect.poll(() => group.querySelector("[data-ouro-lightbox-position]")!.textContent).toBe("1 of 2");
    expect(popup()).not.toBeNull();
  });

  it("rounds the picture with the large squircle, not the thumbnail's small one", async () => {
    const host = await render(true);
    await userEvent.click(thumbnail(host));
    await settled();
    const img = popup()!.querySelector<HTMLElement>("[data-ouro-lightbox-figure] > img")!;
    const probe = document.createElement("div");
    probe.style.borderRadius = "var(--radius-ouro-2xl)";
    document.body.append(probe);
    mounted.push(probe);
    expect(getComputedStyle(img).borderTopLeftRadius).toBe(getComputedStyle(probe).borderTopLeftRadius);
    expect(Number.parseFloat(getComputedStyle(img).borderTopLeftRadius)).toBeGreaterThan(Number.parseFloat(getComputedStyle(thumbnail(host)).borderTopLeftRadius || "0"));
  });
  it("sizes the picture as the viewer opens, before the browser draws it, and not until its shape is known", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    // Pictures that never load, given only a width or only a height: their shape is not known.
    const broken = "data:image/png;base64,AAAA";
    const unknown: LightboxImage[] = [
      { src: broken, alt: "Wide only", width: 900 },
      { src: broken, alt: "Tall only", height: 600 },
    ];
    for (const list of [images, unknown]) {
      await act(async () => root.render(<Lightbox label="Photos" images={list} open={false} onOpenChange={() => {}} fit />));
      await act(async () => root.render(<Lightbox label="Photos" images={list} open onOpenChange={() => {}} fit />));
      const pics = [...popup()!.querySelectorAll<HTMLImageElement>("[data-ouro-lightbox-figure] > img")];
      const group = popup()!.querySelector<HTMLElement>("[data-ouro-lightbox-header]")!;
      if (list === images) {
        // In the same task as the viewer opened: the controls are placed before any observer runs.
        expect(group.style.top).not.toBe("");
      } else {
        await settled();
        for (const pic of pics) expect([pic.style.width, pic.style.height]).toEqual(["", ""]);
      }
      await act(async () => root.render(<Lightbox label="Photos" images={list} open={false} onOpenChange={() => {}} fit />));
      await expect.poll(popup).toBeNull();
    }
  });

  it("fills a picture given without its size once it loads, with the controls on its corner", async () => {
    const host = await render(true, images.map(({ src, alt }) => ({ src, alt })));
    await userEvent.click(thumbnail(host));
    await settled();
    const dialog = popup()!;
    const img = dialog.querySelector<HTMLImageElement>("[data-ouro-lightbox-figure] > img")!;
    await expect.poll(() => img.getBoundingClientRect().width).toBeGreaterThan(900);
    const pic = img.getBoundingClientRect();
    expect(pic.width / pic.height).toBeCloseTo(900 / 600, 2);
    await expect.poll(() => onCorner(dialog)).toEqual({ right: true, top: true });
    // A shape that arrives after the viewer opened, as a picture over the network does: it fits again, and the controls follow.
    img.src = picture(600, 900, "#abc");
    await expect.poll(() => img.getBoundingClientRect().width / img.getBoundingClientRect().height).toBeCloseTo(600 / 900, 2);
    await expect.poll(() => onCorner(dialog)).toEqual({ right: true, top: true });
  });

  it("keeps the controls on the picture's corner as the viewer grows from the thumbnail and as the window changes size", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    const host = await render(true);
    await userEvent.click(thumbnail(host));
    await settled();
    const dialog = popup()!;
    await expect.poll(() => onCorner(dialog)).toEqual({ right: true, top: true });
    // Wider, at the same height: the picture keeps its size and moves, and the controls with it, placed in the viewer's
    // own pixels while it is drawn at half its size, as it is partway through growing from the thumbnail.
    const header = dialog.querySelector<HTMLElement>("[data-ouro-lightbox-header]")!;
    const before = header.style.insetInlineEnd;
    dialog.style.scale = "0.5";
    await page.viewport(1500, 800);
    await expect.poll(() => header.style.insetInlineEnd).not.toBe(before);
    dialog.style.scale = "";
    expect(onCorner(dialog)).toEqual({ right: true, top: true });
  });

  it("puts the controls on the picture's top-left corner right to left", async () => {
    document.documentElement.dir = "rtl";
    try {
      const host = await render(true);
      await userEvent.click(thumbnail(host));
      await settled();
      const dialog = popup()!;
      expect(getComputedStyle(dialog).direction).toBe("rtl");
      await expect.poll(() => onCorner(dialog)).toEqual({ right: true, top: true });
    } finally {
      document.documentElement.dir = "";
    }
  });

  it("points Previous's chevron back and Next's forward", async () => {
    const host = await render(true);
    await userEvent.click(thumbnail(host));
    await settled();
    const flip = (part: string) => getComputedStyle(popup()!.querySelector(`[data-ouro-control="lightbox"][data-ouro-part="${part}"] svg`)!).scale;
    expect(flip("previous")).toBe("-1 1");
    expect(flip("next")).toBe("none");
  });

  it("shows one picture with no Previous, Next or position, and opens with no pictures at all", async () => {
    const host = await render(true, images.slice(0, 1));
    await userEvent.click(thumbnail(host));
    await settled();
    const group = popup()!.querySelector<HTMLElement>('[data-ouro-lightbox-header] [data-ouro="button-group"]')!;
    expect([...group.children].map((child) => child.getAttribute("data-ouro-part"))).toEqual(["close"]);
    const empty = document.createElement("div");
    document.body.append(empty);
    mounted.push(empty);
    const root = createRoot(empty);
    roots.push(root);
    await act(async () => root.render(<Lightbox label="Photos" images={[]} open onOpenChange={() => {}} fit />));
    expect(document.querySelectorAll('[data-ouro="dialog"]').length).toBe(2);
  });
});
