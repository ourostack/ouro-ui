import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, server, userEvent } from "vitest/browser";
import { Lightbox, type LightboxImage, type LightboxProps, type LightboxWithThumbnailsProps } from "@/registry/ouro/components/ouro/lightbox/lightbox";
import { mosaicLayout } from "@/registry/ouro/components/ouro/lightbox/lightbox-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { measureTextContrast } from "@/registry/ouro/lib/ouro/testing/axe";

// Runs in Chromium and WebKit: the mosaic layout, the still frame and the full-screen viewer.

const roots: Root[] = [];
let mounted: Element[] = [];

/** A flat picture of the given size, drawn inline so the tests need no network. */
const picture = (width: number, height: number, fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${fill}"/></svg>`)}`;

const offsite: LightboxImage[] = [
  { src: picture(900, 600, "#68a"), alt: "Two mugs on a dock by a lake", width: 900, height: 600 },
  { src: picture(800, 600, "#ec7"), alt: "The retro board, covered in sticky notes" },
  { src: picture(900, 600, "#435"), alt: "A trail through the pines at dusk" },
  { src: picture(600, 900, "#7a6"), alt: "The team on the summit" },
  { src: picture(900, 900, "#a64"), alt: "Dinner by the fire" },
  { src: picture(900, 600, "#579"), alt: "The lake at night" },
];

async function render(node: ReactNode, width = 400) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, rerender: (next: ReactNode) => act(async () => root.render(next)) };
}

const mosaic = (images: readonly LightboxImage[], props: Partial<LightboxWithThumbnailsProps> = {}) => (
  <Lightbox label="Offsite photos" images={images} layout="mosaic" {...props} />
);
const thumbnails = (host: Element) => [...host.querySelectorAll<HTMLButtonElement>('[data-ouro-part="thumbnail"]')];
const list = (host: Element) => host.querySelector<HTMLElement>("ul")!;
const ratio = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return rect.width / rect.height;
};
const popup = () => document.querySelector<HTMLElement>('[data-ouro="dialog"]');
// The position once the image has arrived: while the scroll is on its way the position already
// names the image chosen, marked as pending.
const position = () => {
  const counter = popup()!.querySelector("[data-ouro-lightbox-position]")!;
  return counter.hasAttribute("data-pending") ? `${counter.textContent} (on its way)` : counter.textContent;
};

async function settled() {
  await expect
    .poll(() => {
      const element = popup();
      return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
    })
    .toBe(true);
}

// Only Chromium emulates forced colours.
const chromiumOnly = it.skipIf(server.browser !== "chromium");

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  await page.viewport(1280, 800);
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

describe("Lightbox mosaic", () => {
  it("draws one picture at its own shape, between 3:4 and 3:1, and 4:3 when its size is unknown", async () => {
    const own = await render(mosaic([offsite[0]!]));
    expect(ratio(list(own.host))).toBeCloseTo(3 / 2, 1);
    const tall = await render(mosaic([{ ...offsite[0]!, width: 400, height: 2000 }]));
    expect(ratio(list(tall.host))).toBeCloseTo(3 / 4, 1);
    const wide = await render(mosaic([{ ...offsite[0]!, width: 4000, height: 400 }]));
    expect(ratio(list(wide.host))).toBeCloseTo(3, 1);
    const unknown = await render(mosaic([offsite[1]!]));
    expect(ratio(list(unknown.host))).toBeCloseTo(4 / 3, 1);
    // The picture fills its frame, cropped to it, and keeps the frame's shape before it loads.
    expect(thumbnails(own.host)[0]!.getBoundingClientRect().width).toBeCloseTo(list(own.host).getBoundingClientRect().width - 2, 0);
    expect(mosaicLayout(1, 0, 600)).toEqual(mosaicLayout(1));
    expect(mosaicLayout(1, 600, 0)).toEqual(mosaicLayout(1));
    expect(mosaicLayout(1, 600)).toEqual(mosaicLayout(1));
    // A mosaic is a layout, so it says nothing in development.
    expect(warn).not.toHaveBeenCalled();
  });

  it("draws two side by side, three as one large and two small, and four or more as a 2 by 2 grid", async () => {
    const two = await render(mosaic(offsite.slice(0, 2)));
    expect(ratio(list(two.host))).toBeCloseTo(2, 1);
    const [a, b] = thumbnails(two.host).map((thumbnail) => thumbnail.getBoundingClientRect());
    expect(a!.top).toBeCloseTo(b!.top, 0);
    expect(a!.width).toBeCloseTo(b!.width, 0);

    const three = await render(mosaic(offsite.slice(0, 3)));
    expect(ratio(list(three.host))).toBeCloseTo(3 / 2, 1);
    const [large, top, bottom] = thumbnails(three.host).map((thumbnail) => thumbnail.getBoundingClientRect());
    // The first spans both rows, wider than the two stacked beside it.
    expect(large!.height).toBeCloseTo(top!.height + bottom!.height + 2, 0);
    expect(large!.width).toBeGreaterThan(top!.width);
    expect(top!.left).toBeCloseTo(bottom!.left, 0);

    const four = await render(mosaic(offsite.slice(0, 4)));
    expect(ratio(list(four.host))).toBeCloseTo(4 / 3, 1);
    expect(thumbnails(four.host)).toHaveLength(4);
    expect(four.host.querySelector("[data-ouro-lightbox-more]")).toBeNull();
    // A 2 by 2 grid: two columns and two rows of equal pictures, read in rows.
    const grid = getComputedStyle(list(four.host));
    expect(grid.gridTemplateColumns.split(" ")).toHaveLength(2);
    expect(grid.gridTemplateRows.split(" ")).toHaveLength(2);
    const [topStart, topEnd, bottomStart, bottomEnd] = thumbnails(four.host).map((thumbnail) => thumbnail.getBoundingClientRect());
    expect(topStart!.top).toBeCloseTo(topEnd!.top, 0);
    expect(bottomStart!.top).toBeCloseTo(bottomEnd!.top, 0);
    expect(bottomStart!.top).toBeGreaterThan(topStart!.bottom);
    expect(topStart!.left).toBeCloseTo(bottomStart!.left, 0);
    expect(topEnd!.left).toBeGreaterThan(topStart!.right);
    expect(topStart!.width).toBeCloseTo(topEnd!.width, 0);
    expect(topStart!.height).toBeCloseTo(bottomStart!.height, 0);
  });

  it("shows four of more pictures, the last saying how many more follow, to sight and to screen readers", async () => {
    const { host } = await render(mosaic(offsite));
    const buttons = thumbnails(host);
    expect(buttons).toHaveLength(4);
    const more = host.querySelector("[data-ouro-lightbox-more]")!;
    expect(more.textContent).toBe("+2");
    expect(more.getAttribute("aria-hidden")).toBe("true");
    expect(buttons[3]!.contains(more)).toBe(true);
    await expect.element(page.getByRole("button", { name: /^The team on the summit\s*, and 2 more$/ })).toBeInTheDocument();
    expect(list(host).getAttribute("aria-label")).toBe("Offsite photos");
    expect(host.querySelector('[data-ouro="lightbox"]')!.getAttribute("data-layout")).toBe("mosaic");
  });

  it("opens the viewer on the picture pressed, steps on past the four shown, and gives focus back to the last one shown", async () => {
    const { host } = await render(mosaic(offsite));
    await userEvent.click(thumbnails(host)[3]!);
    await settled();
    expect(position()).toBe("4 of 6");
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("5 of 6");
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    expect(document.activeElement).toBe(thumbnails(host)[3]);
  });

  it("gives focus back to a picture the mosaic shows when the viewer closes on it", async () => {
    const { host } = await render(mosaic(offsite.slice(0, 3)));
    await userEvent.click(thumbnails(host)[0]!);
    await settled();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("2 of 3");
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    expect(document.activeElement).toBe(thumbnails(host)[1]);
  });

  it("draws an empty frame, and names the missing images, when there are none", async () => {
    const { host } = await render(mosaic([]));
    expect(thumbnails(host)).toHaveLength(0);
    expect(ratio(list(host))).toBeCloseTo(4 / 3, 1);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Lightbox: there are no images. Fix: <Lightbox label="Kitchen photos" images={[{ src: "/photos/a.jpg", alt: "…" }]}>.');
  });

  it("names a layout that is not one, and draws the grid", async () => {
    const props = { label: "Photos", images: offsite, layout: "masonry" } as unknown as LightboxProps;
    const { host } = await render(<Lightbox {...props} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Lightbox: layout="masonry" is not a layout; use "grid", "mosaic". Fix: <Lightbox layout="mosaic">.');
    expect(thumbnails(host)).toHaveLength(6);
    expect(host.querySelector("[data-layout]")).toBeNull();
  });

  it("renders the mosaic on the server", () => {
    const html = renderToString(mosaic(offsite));
    expect(html).toContain('data-layout="mosaic"');
    expect(html).toContain("aspect-ratio:1.3333333333333333");
    expect(html).toContain(">+2<");
  });
});

describe("Lightbox still frames", () => {
  const gif: LightboxImage = { src: picture(300, 200, "#a3c"), alt: "Shipped! A rocket in confetti", still: picture(300, 200, "#333") };

  it("shows an animated image's still frame in its thumbnail when the user asks for reduced motion", async () => {
    const { host } = await render(mosaic([gif]));
    const image = thumbnails(host)[0]!.querySelector("img")!;
    expect(host.querySelector("source")!.getAttribute("media")).toBe("(prefers-reduced-motion: reduce)");
    await expect.poll(() => image.currentSrc).toBe(gif.still);
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    await expect.poll(() => image.currentSrc).toBe(gif.src);
  });

  it("plays the image itself in the viewer", async () => {
    const { host } = await render(mosaic([gif]));
    await userEvent.click(thumbnails(host)[0]!);
    await settled();
    expect(popup()!.querySelector<HTMLImageElement>("img")!.getAttribute("src")).toBe(gif.src);
    expect(popup()!.querySelector("source")).toBeNull();
  });

  it("adds no source for an image with no still frame", async () => {
    const { host } = await render(mosaic([offsite[0]!]));
    expect(host.querySelector("source")).toBeNull();
  });
});

describe("Lightbox full screen", () => {
  it("covers the whole screen with no frame, from the thumbnails or controlled", async () => {
    const { host } = await render(mosaic(offsite.slice(0, 2), { fullScreen: true }));
    await userEvent.click(thumbnails(host)[0]!);
    await settled();
    const rect = popup()!.getBoundingClientRect();
    expect([rect.left, rect.top, rect.width, rect.height]).toEqual([0, 0, 1280, 800]);
    const style = getComputedStyle(popup()!);
    expect(style.borderTopLeftRadius).toBe("0px");
    // No hairline and no shadow: every layer Tailwind composes has zero size.
    expect(style.boxShadow.replace(/[a-z]+\([^)]*\)/g, "").match(/[1-9]/)).toBeNull();
    expect(popup()!.getAttribute("data-full-screen")).toBe("");
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();

    await render(<Lightbox label="Offsite photos" images={offsite} open index={1} onOpenChange={() => {}} fullScreen />);
    await settled();
    expect(popup()!.getBoundingClientRect().width).toBe(1280);
  });

  it("hides the page behind one solid field in the light theme too, with readable controls", async () => {
    const { host } = await render(mosaic(offsite.slice(0, 2), { fullScreen: true }));
    await userEvent.click(thumbnails(host)[0]!);
    await settled();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    // A near-black field, fully opaque: nothing of the page shows through.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const paint = canvas.getContext("2d")!;
    paint.fillStyle = getComputedStyle(popup()!).backgroundColor;
    paint.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data;
    expect(Math.max(r!, g!, b!)).toBeLessThan(40);
    expect(a!).toBe(255);
    // The title, the position and Close read on it.
    for (const text of [popup()!.querySelector("[data-ouro-dialog-title]")!, popup()!.querySelector("[data-ouro-lightbox-position]")!]) {
      expect(await measureTextContrast(text, 4.5), text.textContent!).toEqual({ pass: true });
    }
    const close = popup()!.querySelector<HTMLElement>('[data-ouro-part="close"]')!;
    expect(getComputedStyle(close).color).not.toBe(getComputedStyle(popup()!).backgroundColor);
    expect(popup()!.classList.contains("dark")).toBe(true);
  });

  it("rings the image shown, not the stage, when the images have keyboard focus", async () => {
    const { host } = await render(mosaic(offsite.slice(0, 2), { fullScreen: true }));
    thumbnails(host)[0]!.focus();
    await userEvent.keyboard("{Enter}");
    await settled();
    const scroller = popup()!.querySelector<HTMLElement>("[data-ouro-carousel-viewport]")!;
    expect(document.activeElement).toBe(scroller);
    expect(scroller.matches(":focus-visible")).toBe(true);
    expect(getComputedStyle(scroller).outlineStyle).toBe("none");
    const [first, second] = [...popup()!.querySelectorAll<HTMLElement>("[data-ouro-lightbox-image]")];
    expect(getComputedStyle(first!).outlineStyle).toBe("solid");
    expect(getComputedStyle(first!).outlineWidth).toBe("2px");
    // Without keyboard focus on the images, no ring.
    popup()!.querySelector<HTMLElement>('[data-ouro-part="close"]')!.focus();
    expect(getComputedStyle(first!).outlineStyle).toBe("none");
    expect(getComputedStyle(second!).outlineStyle).toBe("none");
  });

  chromiumOnly("leaves forced colours to the system", async () => {
    await commands.emulateMedia({ forcedColors: "active" });
    try {
      const { host } = await render(mosaic(offsite.slice(0, 2), { fullScreen: true }));
      await userEvent.click(thumbnails(host)[0]!);
      await settled();
      const probe = document.createElement("div");
      probe.style.backgroundColor = "Canvas";
      probe.style.color = "CanvasText";
      document.body.append(probe);
      mounted.push(probe);
      expect(getComputedStyle(popup()!).backgroundColor).toBe(getComputedStyle(probe).backgroundColor);
      expect(getComputedStyle(popup()!.querySelector("[data-ouro-dialog-title]")!).color).toBe(getComputedStyle(probe).color);
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });

  it("keeps the dialog's frame without it", async () => {
    const { host } = await render(mosaic(offsite.slice(0, 2)));
    await userEvent.click(thumbnails(host)[0]!);
    await settled();
    expect(popup()!.getBoundingClientRect().width).toBeLessThan(1280);
    expect(popup()!.hasAttribute("data-full-screen")).toBe(false);
  });

  it("names fullscreen, in lower case, as not a prop", async () => {
    const props = { label: "Photos", images: offsite, fullscreen: true } as unknown as LightboxProps;
    const { host } = await render(<Lightbox {...props} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Lightbox: fullscreen is not a prop. Fix: <Lightbox label="Kitchen photos" images={images} fullScreen>.');
    expect(host.querySelector("[fullscreen]")).toBeNull();
  });
});
