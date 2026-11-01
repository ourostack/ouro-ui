import { useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Lightbox, type LightboxImage, type LightboxProps, type LightboxWithThumbnailsProps } from "@/registry/ouro/components/ouro/lightbox/lightbox";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";

// Runs in Chromium and WebKit.

const roots: Root[] = [];
let mounted: Element[] = [];

/** A flat picture of the given size, drawn inline so the tests need no network. */
const picture = (width: number, height: number, fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${fill}"/></svg>`)}`;

const kitchen: LightboxImage[] = [
  { src: picture(1600, 1000, "#335"), alt: "The old kitchen, with dark cabinets", title: "Before", caption: "Before: dark cabinets and a narrow counter." },
  { src: picture(900, 1200, "#cba"), alt: "The new kitchen, with white cabinets", title: "After" },
  { src: picture(1800, 800, "#7a9"), alt: "The new pantry shelves", caption: "Oak shelves, floor to ceiling." },
  { src: picture(1000, 1000, "#a75"), alt: "The breakfast nook", thumbnail: picture(200, 200, "#a75") },
];

async function render(node: ReactNode, width = 600) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, rerender: (next: ReactNode) => act(async () => root.render(next)) };
}

const lightbox = (props: Partial<LightboxWithThumbnailsProps> = {}) => <Lightbox label="Kitchen photos" images={kitchen} {...props} />;

const thumbnails = (host: Element) => [...host.querySelectorAll<HTMLButtonElement>('[data-ouro-part="thumbnail"]')];
const popup = () => document.querySelector<HTMLElement>('[data-ouro="dialog"]');
const viewport = () => popup()!.querySelector<HTMLElement>("[data-ouro-carousel-viewport]")!;
const slides = () => [...popup()!.querySelectorAll<HTMLElement>("[data-ouro-carousel-slide]")];
const position = () => popup()!.querySelector("[data-ouro-lightbox-position]")!.textContent;
const button = (name: string) => [...popup()!.querySelectorAll<HTMLElement>("button, a")].find((element) => element.getAttribute("aria-label") === name || element.textContent === name)!;

/** The slide whose start edge lines up with the scroller's start edge. */
function slideInView(): number {
  const edge = viewport().getBoundingClientRect();
  return slides().findIndex((slide) => {
    const rect = slide.getBoundingClientRect();
    return getComputedStyle(viewport()).direction === "rtl" ? Math.abs(rect.right - edge.right) < 1 : Math.abs(rect.left - edge.left) < 1;
  });
}

/** Waits until the open viewer has finished its entrance. */
async function settled() {
  await expect
    .poll(() => {
      const element = popup();
      return Boolean(element && !element.hasAttribute("data-starting-style") && element.getAnimations().length === 0);
    })
    .toBe(true);
}

async function openAt(host: Element, index: number) {
  await userEvent.click(thumbnails(host)[index]!);
  await settled();
}

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
  document.documentElement.removeAttribute("dir");
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

describe("Lightbox development messages", () => {
  it("names a missing label, missing images and a missing alt, each with the fix", async () => {
    await render(<Lightbox label="" images={[]} />);
    // Inline pictures: a path such as "/a.jpg" would ask an app's dev server for its index page.
    const blank = picture(1, 1, "#fff");
    await render(<Lightbox label="Photos" images={[{ src: blank, alt: "" }, { src: blank, alt: "B" }]} />);
    const messages: string[] = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(messages).toContain(
      '[ouro-ui] Lightbox: label is required; it names the thumbnails and the viewer for screen readers. Fix: <Lightbox label="Kitchen photos" images={images}>.',
    );
    expect(messages).toContain('[ouro-ui] Lightbox: there are no images. Fix: <Lightbox label="Kitchen photos" images={[{ src: "/photos/a.jpg", alt: "…" }]}>.');
    expect(messages).toContain(
      `[ouro-ui] Lightbox: images[0] has no alt; describe the image for screen readers. Fix: { src: "${blank}", alt: "The new kitchen, with white cabinets" }.`,
    );
    expect(messages.filter((message) => message.includes("has no alt"))).toHaveLength(1);
  });

  it("names slides, shadcn-style, as not a prop", async () => {
    const props = { label: "Photos", images: kitchen, slides: kitchen } as unknown as LightboxProps;
    const { host } = await render(<Lightbox {...props} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Lightbox: slides is not a prop. Fix: <Lightbox label="Kitchen photos" images={[{ src, alt }]}>.');
    expect(host.querySelector("[slides]")).toBeNull();
  });

  it("names an appearance class with the fix", async () => {
    await render(lightbox({ className: "bg-red-500" }));
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Lightbox: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; Lightbox draws its own thumbnails.',
    );
  });
});

describe("Lightbox thumbnails", () => {
  it("is a named list of thumbnail buttons, each named by its image and opening a dialog", async () => {
    const { host } = await render(lightbox());
    const root = host.querySelector('[data-ouro="lightbox"]')!;
    const list = root.querySelector("ul")!;
    expect(list.getAttribute("role")).toBe("list");
    expect(list.getAttribute("aria-label")).toBe("Kitchen photos");
    const buttons = thumbnails(host);
    expect(buttons).toHaveLength(4);
    for (const thumbnail of buttons) {
      expect(thumbnail.type).toBe("button");
      expect(thumbnail.getAttribute("aria-haspopup")).toBe("dialog");
      expect(thumbnail.getAttribute("data-ouro-control")).toBe("lightbox");
    }
    const images = buttons.map((thumbnail) => thumbnail.querySelector("img")!);
    expect(images.map((image) => image.alt)).toEqual(kitchen.map((image) => image.alt));
    // The thumbnail file when there is one, else the image itself.
    expect(images[0]!.getAttribute("src")).toBe(kitchen[0]!.src);
    expect(images[3]!.getAttribute("src")).toBe(kitchen[3]!.thumbnail);
    expect(images[0]!.loading).toBe("lazy");
    expect(popup()).toBeNull();
  });

  it("lays the thumbnails out in as many columns of at least 8rem as fit", async () => {
    const wide = await render(lightbox(), 600);
    const narrow = await render(lightbox(), 300);
    const columns = (host: Element) => getComputedStyle(host.querySelector("ul")!).gridTemplateColumns.split(" ").length;
    // 600px holds four columns of 128px with three 12px gaps; 300px holds two.
    expect(columns(wide.host)).toBe(4);
    expect(columns(narrow.host)).toBe(2);
    const thumbnail = thumbnails(narrow.host)[0]!.getBoundingClientRect();
    expect(thumbnail.width).toBeGreaterThanOrEqual(128);
    expect(thumbnail.width / thumbnail.height).toBeCloseTo(4 / 3, 1);
  });

  it("takes layout classes from className", async () => {
    const { host } = await render(lightbox({ className: "mt-6 max-w-2xl" }));
    const root = host.querySelector<HTMLElement>('[data-ouro="lightbox"]')!;
    expect(root.classList.contains("mt-6")).toBe(true);
    expect(root.classList.contains("max-w-2xl")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("renders the thumbnails on the server, and the viewer only once it opens", () => {
    const html = renderToString(lightbox());
    expect(html).toContain('data-ouro="lightbox"');
    expect(html).toContain('alt="The new pantry shelves"');
    expect(html).not.toContain("Previous image");
  });
});

describe("Lightbox opening and closing", () => {
  it("opens on the image pressed, named by the label and the position", async () => {
    const { host } = await render(lightbox());
    await openAt(host, 2);
    const dialog = popup()!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(page.getByRole("dialog", { name: "Kitchen photos, 3 of 4", exact: true }).element()).toBe(dialog);
    expect(dialog.querySelector("h2")!.textContent).toBe("Kitchen photos");
    expect(position()).toBe("3 of 4");
    expect(slideInView()).toBe(2);
    expect(slides()[2]!.querySelector("img")!.alt).toBe("The new pantry shelves");
    expect(slides()[2]!.getAttribute("aria-label")).toBe("3 of 4");
    // Focus starts on the images, so the arrow keys and a screen reader start there.
    expect(document.activeElement).toBe(viewport());
  });

  it("closes with Escape and gives focus to the thumbnail of the image last shown", async () => {
    const { host } = await render(lightbox());
    await openAt(host, 1);
    await userEvent.click(button("Next image"));
    await expect.poll(position).toBe("3 of 4");
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    expect(document.activeElement).toBe(thumbnails(host)[2]);
    // Opened and closed again without a move: the thumbnail pressed.
    await openAt(host, 0);
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    expect(document.activeElement).toBe(thumbnails(host)[0]);
  });

  it("gives focus to the thumbnail pressed, and grows from it, even when focus was elsewhere as it opened", async () => {
    const { host } = await render(
      <>
        <button type="button">Elsewhere</button>
        {lightbox()}
      </>,
    );
    host.querySelector<HTMLButtonElement>("button")!.focus();
    // As Safari presses a button: without focusing it.
    await act(async () => thumbnails(host)[2]!.click());
    await settled();
    const rect = thumbnails(host)[2]!.getBoundingClientRect();
    const [x] = popup()!.style.transformOrigin.split(" ").map(parseFloat);
    expect(x).toBeCloseTo(rect.left + rect.width / 2 - popup()!.offsetLeft, -1);
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    expect(document.activeElement).toBe(thumbnails(host)[2]);
  });

  it("closes with the close button, which sits in the viewer's frame beside the position", async () => {
    const { host } = await render(lightbox());
    await openAt(host, 0);
    const close = button("Close");
    const header = popup()!.querySelector("[data-ouro-lightbox-header]")!;
    expect(header.contains(close)).toBe(true);
    expect(close.getAttribute("data-ouro-control")).toBe("lightbox");
    expect(close.getAttribute("data-ouro-part")).toBe("close");
    expect(close.querySelector('svg[aria-hidden="true"] path')).not.toBeNull();
    const frame = popup()!.getBoundingClientRect();
    const box = close.getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(frame.top);
    expect(box.right).toBeLessThanOrEqual(frame.right);
    expect(box.top - frame.top).toBeLessThan(24);
    expect(frame.right - box.right).toBeLessThan(24);
    await userEvent.click(close);
    await expect.poll(popup).toBeNull();
    expect(document.activeElement).toBe(thumbnails(host)[0]);
  });

  it("closes with a press outside the viewer", async () => {
    const { host } = await render(lightbox());
    await openAt(host, 0);
    await userEvent.click(document.body, { position: { x: 6, y: 6 } });
    await expect.poll(popup).toBeNull();
  });

  it("uses the labels it is given", async () => {
    const { host } = await render(
      lightbox({
        label: "Fotos de la cocina",
        images: kitchen.map((image) => ({ ...image, href: "https://example.com/original.jpg" })),
        closeLabel: "Cerrar",
        previousLabel: "Foto anterior",
        nextLabel: "Foto siguiente",
        positionLabel: "Foto {n} de {total}",
        originalLabel: "Ver original",
      }),
    );
    await openAt(host, 1);
    expect(position()).toBe("Foto 2 de 4");
    expect(slides()[0]!.getAttribute("aria-label")).toBe("Foto 1 de 4");
    expect(button("Cerrar")).toBeTruthy();
    expect(button("Foto anterior")).toBeTruthy();
    expect(button("Foto siguiente")).toBeTruthy();
    expect(button("Ver original")).toBeTruthy();
    expect(popup()!.querySelector("[data-ouro-carousel-viewport]")!.closest("section")!.getAttribute("aria-label")).toBe("Fotos de la cocina");
  });
});

describe("Lightbox navigation", () => {
  it("steps with the arrow keys from anywhere in the viewer, in reading order", async () => {
    const { host } = await render(lightbox());
    await openAt(host, 1);
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("3 of 4");
    expect(slideInView()).toBe(2);
    // From the close button too: the key steps, and focus stays where it was.
    button("Close").focus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.poll(position).toBe("2 of 4");
    expect(slideInView()).toBe(1);
    expect(document.activeElement).toBe(button("Close"));
    await userEvent.keyboard("{ArrowLeft}");
    await expect.poll(position).toBe("1 of 4");
  });

  it("steps the other way with the arrow keys in a right-to-left page", async () => {
    document.documentElement.dir = "rtl";
    const { host } = await render(lightbox());
    await openAt(host, 1);
    await userEvent.keyboard("{ArrowLeft}");
    await expect.poll(position).toBe("3 of 4");
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("2 of 4");
    // Home and End keep their meaning: the first image and the last.
    await userEvent.keyboard("{End}");
    await expect.poll(position).toBe("4 of 4");
    expect(slideInView()).toBe(3);
    await userEvent.keyboard("{Home}");
    await expect.poll(position).toBe("1 of 4");
    expect(slideInView()).toBe(0);
  });

  it("jumps to the last image with End under OuroProvider's motion=\"reduced\", whatever the device says", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    const { host } = await render(<OuroProvider motion="reduced">{lightbox()}</OuroProvider>);
    await openAt(host, 1);
    const scrollTo = vi.spyOn(viewport(), "scrollTo");
    await userEvent.keyboard("{End}");
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "instant" }));
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
  });

  it("glides to the last image with End under OuroProvider's motion=\"full\", whatever the device says", async () => {
    const { host } = await render(<OuroProvider motion="full">{lightbox()}</OuroProvider>);
    await openAt(host, 1);
    const scrollTo = vi.spyOn(viewport(), "scrollTo");
    await userEvent.keyboard("{End}");
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("goes to the first and the last image with Home and End", async () => {
    const { host } = await render(lightbox());
    await openAt(host, 1);
    const announced = watchAnnouncements();
    await userEvent.keyboard("{End}");
    // With reduced motion it jumps there at once, past the images between.
    expect(slideInView()).toBe(3);
    await expect.poll(position).toBe("4 of 4");
    await expect.poll(() => announced.count("4 of 4")).toBe(1);
    // From the close button too, and focus stays where it was.
    button("Close").focus();
    await userEvent.keyboard("{Home}");
    expect(slideInView()).toBe(0);
    await expect.poll(position).toBe("1 of 4");
    expect(document.activeElement).toBe(button("Close"));
    // Each move is announced once, and the images passed on the way are not.
    await expect.poll(() => announced.count("1 of 4")).toBe(1);
    expect([announced.count("4 of 4"), announced.count("3 of 4"), announced.count("2 of 4")]).toEqual([1, 0, 0]);
    announced.stop();
  });

  it("glides to the last image with End, unless motion is reduced", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    const { host } = await render(lightbox());
    await openAt(host, 0);
    await userEvent.keyboard("{End}");
    expect(slideInView()).not.toBe(3);
    await expect.poll(position).toBe("4 of 4");
    expect(slideInView()).toBe(3);
  });

  it("leaves other keys, keys with a modifier and keys typed into a field alone", async () => {
    const images = [kitchen[0]!, { ...kitchen[1]!, caption: <input aria-label="Note" defaultValue="Cabinets" /> }, ...kitchen.slice(2)];
    const { host } = await render(lightbox({ images }));
    // On the second image, so a key taken for either arrow would move.
    await openAt(host, 1);
    const before = viewport().scrollLeft;
    button("Close").focus();
    await userEvent.keyboard("{ArrowUp}");
    // Dispatched rather than typed: Alt or Command with an arrow is the browser's Back and Forward.
    for (const key of ["ArrowRight", "End"]) {
      for (const modifier of ["shiftKey", "altKey", "ctrlKey", "metaKey"]) {
        const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, [modifier]: true });
        button("Close").dispatchEvent(event);
        expect(event.defaultPrevented, `${modifier} ${key}`).toBe(false);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(position()).toBe("2 of 4");
    expect(viewport().scrollLeft).toBe(before);
    // In a field in a caption, the key moves the caret.
    const field = popup()!.querySelector<HTMLInputElement>('input[aria-label="Note"]')!;
    field.focus();
    field.setSelectionRange(2, 2);
    await userEvent.keyboard("{ArrowRight}");
    expect(field.selectionStart).toBe(3);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(position()).toBe("2 of 4");
    expect(viewport().scrollLeft).toBe(before);
    // Home and End are the field's too, left to the browser.
    const keys: KeyboardEvent[] = [];
    const record = (event: KeyboardEvent) => keys.push(event);
    addEventListener("keydown", record, true);
    try {
      await userEvent.keyboard("{Home}{End}");
    } finally {
      removeEventListener("keydown", record, true);
    }
    expect(keys.map((event) => [event.key, event.defaultPrevented])).toEqual([
      ["Home", false],
      ["End", false],
    ]);
  });

  it("moves with Previous and Next, and stops at the ends", async () => {
    const { host } = await render(lightbox({ images: kitchen.slice(0, 2) }));
    await openAt(host, 0);
    const previous = button("Previous image") as HTMLButtonElement;
    const next = button("Next image") as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    await userEvent.click(next);
    await expect.poll(position).toBe("2 of 2");
    await expect.poll(() => next.disabled).toBe(true);
    await userEvent.keyboard("{ArrowRight}");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(position()).toBe("2 of 2");
  });

  it("goes round from the last image to the first with loop", async () => {
    const { host } = await render(lightbox({ loop: true }));
    await openAt(host, 3);
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("1 of 4");
    expect(slideInView()).toBe(0);
    await userEvent.keyboard("{ArrowLeft}");
    await expect.poll(position).toBe("4 of 4");
  });
});

describe("Lightbox viewer", () => {
  it("shows the title and caption with the image, exactly as given", async () => {
    const { host } = await render(lightbox());
    await openAt(host, 0);
    const caption = (index: number) => slides()[index]!.querySelector("figcaption");
    // The caption keeps its own prefix: nothing is added in front of it.
    expect([...caption(0)!.children].map((part) => part.textContent)).toEqual(["Before", "Before: dark cabinets and a narrow counter."]);
    expect(caption(0)!.textContent).toBe("BeforeBefore: dark cabinets and a narrow counter.");
    expect([...caption(1)!.children].map((part) => part.textContent)).toEqual(["After"]);
    expect([...caption(2)!.children].map((part) => part.textContent)).toEqual(["Oak shelves, floor to ceiling."]);
    expect(caption(3)).toBeNull();
    expect(slides()[0]!.querySelector("figure")!.contains(caption(0))).toBe(true);
  });

  it("reports each move with onIndexChange", async () => {
    const onIndexChange = vi.fn();
    const { host } = await render(lightbox({ onIndexChange }));
    await openAt(host, 1);
    expect(onIndexChange).not.toHaveBeenCalled();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[2]]);
  });

  it("shows the position and announces it once when it changes", async () => {
    const { host } = await render(lightbox());
    await openAt(host, 0);
    const announcements = watchAnnouncements();
    await userEvent.click(button("Next image"));
    await expect.poll(position).toBe("2 of 4");
    expect(page.getByRole("dialog", { name: "Kitchen photos, 2 of 4", exact: true }).element()).toBe(popup());
    await expect.poll(() => announcements.count("2 of 4")).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(announcements.count("2 of 4")).toBe(1);
    // The position at the top is not a live region of its own.
    expect(popup()!.querySelector("[data-ouro-lightbox-position]")!.closest("[aria-live]")).toBeNull();
    announcements.stop();
  });

  it("links to the image's original in a new tab, only when it has one", async () => {
    const images = kitchen.map((image, index) => (index === 1 ? { ...image, href: "https://example.com/after.jpg" } : image));
    const { host } = await render(lightbox({ images }));
    await openAt(host, 0);
    expect(button("Open original")).toBeUndefined();
    await userEvent.click(button("Next image"));
    await expect.poll(position).toBe("2 of 4");
    const link = button("Open original") as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.href).toBe("https://example.com/after.jpg");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(link.getAttribute("data-ouro-control")).toBe("lightbox");
    expect(link.getAttribute("data-ouro-part")).toBe("original");
    // An icon says it opens elsewhere; below 640px it shows alone, and the text still names the link.
    expect(link.querySelector('svg[aria-hidden="true"] path')).not.toBeNull();
    expect(link.querySelector("span.max-sm\\:sr-only")!.textContent).toBe("Open original");
  });

  it("keeps working when the app removes images while the viewer is open", async () => {
    const { host, rerender } = await render(lightbox({ images: kitchen.map((image) => ({ ...image, href: image.src })) }));
    await openAt(host, 3);
    expect(position()).toBe("4 of 4");
    await rerender(lightbox({ images: kitchen.slice(0, 2).map((image) => ({ ...image, href: image.src })) }));
    expect(position()).toBe("2 of 2");
    expect(button("Open original")).toBeTruthy();
    await rerender(lightbox({ images: [] }));
    expect(popup()!.querySelector("[data-ouro-lightbox-position]")).toBeNull();
    expect(button("Open original")).toBeUndefined();
    // Home and End with no image to go to change nothing.
    for (const key of ["Home", "End"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      await act(async () => button("Close").dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
    }
    expect(popup()!.querySelector("[data-ouro-lightbox-position]")).toBeNull();
  });

  it("shows no position, Previous or Next for one image", async () => {
    const onIndexChange = vi.fn();
    const { host, rerender } = await render(lightbox({ images: kitchen.slice(0, 1), onIndexChange }));
    await openAt(host, 0);
    expect(popup()!.querySelector("[data-ouro-lightbox-position]")).toBeNull();
    expect(page.getByRole("dialog", { name: "Kitchen photos", exact: true }).element()).toBe(popup());
    for (const name of ["Previous image", "Next image"]) expect(button(name).getClientRects()).toHaveLength(0);
    // The arrow keys still go nowhere, quietly.
    viewport().focus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{ArrowLeft}");
    expect(slideInView()).toBe(0);
    expect(onIndexChange).not.toHaveBeenCalled();
    // A second image brings them back.
    await rerender(lightbox({ images: kitchen.slice(0, 2), onIndexChange }));
    expect(position()).toBe("1 of 2");
    expect(page.getByRole("dialog", { name: "Kitchen photos, 1 of 2", exact: true }).element()).toBe(popup());
    expect(button("Next image").getClientRects()).toHaveLength(1);
  });

  it("fits the image to the screen, uncropped, with the caption right under it, on a phone and on a desktop", async () => {
    for (const [width, height] of [
      [390, 844],
      [1280, 800],
    ] as const) {
      await page.viewport(width, height);
      const { host } = await render(lightbox({ images: [{ src: picture(900, 1600, "#335"), alt: "A tall photo", caption: "Tall" }, ...kitchen] }), width - 32);
        // A tall picture and a wide one.
      for (const index of [0, 3]) {
        await openAt(host, index);
        const frame = popup()!.getBoundingClientRect();
        expect(frame.width).toBeLessThanOrEqual(width);
        expect(frame.height).toBeLessThanOrEqual(height);
        const image = slides()[index]!.querySelector("img")!;
        await expect.poll(() => image.complete && image.naturalWidth > 0).toBe(true);
        const box = image.getBoundingClientRect();
        // Inside the viewer, and at the picture's own shape: nothing is cropped or stretched.
        expect(box.top).toBeGreaterThanOrEqual(frame.top);
        expect(box.bottom).toBeLessThanOrEqual(frame.bottom);
        expect(box.width).toBeLessThanOrEqual(frame.width);
        expect(box.width / box.height).toBeCloseTo(image.naturalWidth / image.naturalHeight, 1);
        // Large: it fills the stage's width or its height.
        const stage = slides()[index]!.getBoundingClientRect();
        expect(Math.max(box.width / stage.width, box.height / stage.height)).toBeGreaterThan(0.6);
        const caption = slides()[index]!.querySelector("figcaption");
        if (caption) expect(caption.getBoundingClientRect().top - box.bottom).toBeLessThanOrEqual(13);
        await userEvent.keyboard("{Escape}");
        await expect.poll(popup).toBeNull();
      }
    }
  });
});

/** An app that lays out its own thumbnails and opens the viewer from them. */
function Controlled({
  onIndexChange,
  initial = 0,
  follow = true,
  returnFocus,
}: {
  onIndexChange?: (index: number) => void;
  initial?: number;
  follow?: boolean;
  returnFocus?: (index: number) => HTMLElement | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(initial);
  return (
    <>
      {kitchen.slice(0, 2).map((image, position) => (
        <button
          key={position}
          type="button"
          onClick={() => {
            setIndex(position);
            setOpen(true);
          }}
        >
          {image.alt}
        </button>
      ))}
      <button type="button" data-testid="first" onClick={() => setIndex(0)}>
        First
      </button>
      <Lightbox
        label="Kitchen photos"
        images={kitchen}
        open={open}
        index={index}
        onOpenChange={setOpen}
        onIndexChange={(next) => {
          onIndexChange?.(next);
          if (follow) setIndex(next);
        }}
        returnFocus={returnFocus}
      />
    </>
  );
}

describe("Lightbox controlled", () => {
  it("draws no thumbnails, and opens on index when open", async () => {
    const onOpenChange = vi.fn();
    const { host, rerender } = await render(<Lightbox label="Kitchen photos" images={kitchen} open={false} index={2} onOpenChange={onOpenChange} />);
    expect(host.children).toHaveLength(0);
    expect(popup()).toBeNull();
    await rerender(<Lightbox label="Kitchen photos" images={kitchen} open index={2} onOpenChange={onOpenChange} />);
    await settled();
    expect(position()).toBe("3 of 4");
    expect(slideInView()).toBe(2);
    expect(page.getByRole("dialog", { name: "Kitchen photos, 3 of 4", exact: true }).element()).toBe(popup());
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // The app owns open: the viewer stays until it changes.
    expect(popup()).not.toBeNull();
  });

  it("opens on the first image without index", async () => {
    await render(<Lightbox label="Kitchen photos" images={kitchen} open onOpenChange={() => {}} />);
    await settled();
    expect(position()).toBe("1 of 4");
  });

  it("gives focus back to what had it when the viewer opened, and grows from it", async () => {
    const onIndexChange = vi.fn();
    const { host } = await render(<Controlled onIndexChange={onIndexChange} />);
    const opener = host.querySelectorAll("button")[1]!;
    opener.focus();
    await userEvent.keyboard("{Enter}");
    await settled();
    expect(position()).toBe("2 of 4");
    const dialog = popup()!;
    const rect = opener.getBoundingClientRect();
    const [x, y] = dialog.style.transformOrigin.split(" ").map(parseFloat);
    expect(x).toBeCloseTo(rect.left + rect.width / 2 - dialog.offsetLeft, -1);
    expect(y).toBeCloseTo(rect.top + rect.height / 2 - dialog.offsetTop, -1);
    const scroller = viewport();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("3 of 4");
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
    // Following the user with index moves nothing: the same carousel stays.
    expect(viewport()).toBe(scroller);
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("gives focus to what returnFocus gives for the image last shown, or else back to what had it", async () => {
    const shown: number[] = [];
    let buttons: HTMLButtonElement[] = [];
    const { host } = await render(
      <Controlled
        returnFocus={(index) => {
          shown.push(index);
          return buttons[index];
        }}
      />,
    );
    buttons = [...host.querySelectorAll("button")].slice(0, 2);
    await userEvent.click(buttons[0]!);
    await settled();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("2 of 4");
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    expect(document.activeElement).toBe(buttons[1]);
    // The last image has no button here: focus goes back to what had it as the viewer opened.
    buttons[0]!.focus();
    await userEvent.keyboard("{Enter}");
    await settled();
    await userEvent.keyboard("{End}");
    await expect.poll(position).toBe("4 of 4");
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    expect(document.activeElement).toBe(buttons[0]);
    expect(shown).toEqual([1, 3]);
  });

  it("grows from the middle when it is open from the start", async () => {
    await render(<Lightbox label="Kitchen photos" images={kitchen} open index={1} onOpenChange={() => {}} />);
    await settled();
    expect(popup()!.style.transformOrigin).toBe("");
  });

  it("grows from the middle when nothing had focus as it opened", async () => {
    const { rerender } = await render(<Lightbox label="Kitchen photos" images={kitchen} open={false} index={1} onOpenChange={() => {}} />);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    await rerender(<Lightbox label="Kitchen photos" images={kitchen} open index={1} onOpenChange={() => {}} />);
    await settled();
    expect(popup()!.style.transformOrigin).toBe("");
  });

  it("moves to an index the app sets while the viewer is open", async () => {
    const { host } = await render(<Controlled initial={1} />);
    await userEvent.click(host.querySelectorAll("button")[1]!);
    await settled();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("3 of 4");
    // The app moves it back to the first image, as a list beside the viewer might.
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="first"]')!.click());
    await expect.poll(position).toBe("1 of 4");
    expect(slideInView()).toBe(0);
    // Focus stays in the viewer, on the images, and the keys go on stepping.
    expect(document.activeElement).toBe(viewport());
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("2 of 4");
  });

  it("stays where the user went when the app does not follow onIndexChange", async () => {
    const { host } = await render(<Controlled follow={false} />);
    await userEvent.click(host.querySelectorAll("button")[0]!);
    await settled();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("2 of 4");
    // A render of the app with the old index changes nothing.
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="first"]')!.click());
    expect(position()).toBe("2 of 4");
    expect(slideInView()).toBe(1);
  });

  it("stays where the user went after the app moved it, when the app does not follow", async () => {
    const { host } = await render(<Controlled follow={false} />);
    await userEvent.click(host.querySelectorAll("button")[1]!);
    await settled();
    // The app moves the viewer to the first image, then lets the user go on alone.
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="first"]')!.click());
    await expect.poll(position).toBe("1 of 4");
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(position).toBe("2 of 4");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(position()).toBe("2 of 4");
    expect(slideInView()).toBe(1);
  });

  it.each([
    ["open without onOpenChange", { open: false }, "open needs onOpenChange, which closes the viewer"],
    ["index without open", { index: 1 }, "index, onOpenChange and returnFocus need open; without it Lightbox draws its own thumbnails"],
    ["onOpenChange without open", { onOpenChange: () => {} }, "index, onOpenChange and returnFocus need open; without it Lightbox draws its own thumbnails"],
    ["returnFocus without open", { returnFocus: () => null }, "index, onOpenChange and returnFocus need open; without it Lightbox draws its own thumbnails"],
    ["className with open", { open: false, onOpenChange: () => {}, className: "mt-4" }, "className lays out the thumbnails, and a Lightbox with open draws none"],
  ])("names %s, and only that, with the fix", async (_case, props, message) => {
    await render(<Lightbox {...({ label: "Photos", images: kitchen, ...props } as unknown as LightboxProps)} />);
    const messages: string[] = warn.mock.calls.map((call: unknown[]) => String(call[0]));
    const fix =
      "className" in props
        ? '<div className="…"><Lightbox open={open} … /></div>'
        : '<Lightbox label="Kitchen photos" images={images} open={open} index={index} onOpenChange={setOpen}>';
    expect(messages).toEqual([`[ouro-ui] Lightbox: ${message}. Fix: ${fix}.`]);
  });

  it("gives correct controlled props no message, and closes nothing without onOpenChange", async () => {
    await render(<Lightbox label="Photos" images={kitchen} open={false} index={1} onOpenChange={() => {}} />);
    expect(warn).not.toHaveBeenCalled();
    await render(<Lightbox {...({ label: "Photos", images: kitchen, open: true } as unknown as LightboxProps)} />);
    await settled();
    // Without onOpenChange, Escape closes nothing and throws nothing.
    await userEvent.keyboard("{Escape}");
    expect(popup()).not.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Lightbox: open needs onOpenChange, which closes the viewer. Fix: <Lightbox label="Kitchen photos" images={images} open={open} index={index} onOpenChange={setOpen}>.',
    );
  });

  it("says once in development that a viewer mounted already open runs no transitions", async () => {
    // The app mounts the Lightbox on the press that opens it, as `{viewing && <Lightbox open … />}` does.
    document.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse" }));
    const { rerender } = await render(<Lightbox label="Photos" images={kitchen} open index={1} onOpenChange={() => {}} />);
    await settled();
    await rerender(<Lightbox label="Photos" images={kitchen} open index={2} onOpenChange={() => {}} />);
    expect(warn.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([
      "[ouro-ui] Lightbox: mounted already open, so the viewer's open and close transitions don't run; mount it closed and change open. Fix: <Lightbox label=\"Kitchen photos\" images={images} open={open} index={index} onOpenChange={setOpen}>.",
    ]);
  });
});

describe("Lightbox motion", () => {
  it("grows from the thumbnail that opened it, and only fades with reduced motion", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    const { host } = await render(lightbox());
    const thumbnail = thumbnails(host)[2]!;
    await userEvent.click(thumbnail);
    const dialog = popup()!;
    const rect = thumbnail.getBoundingClientRect();
    const [x, y] = dialog.style.transformOrigin.split(" ").map(parseFloat);
    expect(x).toBeCloseTo(rect.left + rect.width / 2 - dialog.offsetLeft, -1);
    expect(y).toBeCloseTo(rect.top + rect.height / 2 - dialog.offsetTop, -1);
    expect(getComputedStyle(dialog).transitionProperty).toContain("transform");
    await settled();
    await userEvent.keyboard("{Escape}");
    await expect.poll(popup).toBeNull();
    // It starts at 0.9 of its size.
    const starting = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).map((rule) => rule.cssText).join("\n");
    expect(starting).toContain("scale(0.9)");

    await commands.emulateMedia({ reducedMotion: "reduce" });
    await userEvent.click(thumbnail);
    expect(getComputedStyle(popup()!).transitionProperty).toBe("opacity");
    await settled();
    await userEvent.click(button("Next image"));
    // Reduced motion jumps to the next image.
    expect(slideInView()).toBe(3);
  });
});

describe("Lightbox's thumbnails and a page scroll at the press", () => {
  // A smooth scroll begins as the press goes down, ahead of the trigger's own handlers: the press
  // stops it where it is, the release (or the key) clicks the trigger, and the dialog opens there.
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  afterEach(() => {
    document.documentElement.removeAttribute("style");
    window.scrollTo({ top: 0, behavior: "instant" });
  });

  for (const input of ["pointer", "Enter"] as const) {
    it(`stops a smooth scroll where ${input === "pointer" ? "a press" : "Enter"} on a thumbnail found it, and opens`, async () => {
      await render(
        <div style={{ height: 5000 }}>
          <header style={{ position: "sticky", top: 0, height: 100 }}>
            {lightbox()}
          </header>
        </div>,
      );
      window.scrollTo({ top: 2000, behavior: "instant" });
      document.documentElement.style.scrollBehavior = "smooth";
      document.addEventListener(input === "pointer" ? "pointerdown" : "keydown", () => window.scrollTo({ top: 4000 }), { capture: true, once: true });
      const opener = document.querySelector<HTMLElement>('li:first-child [data-ouro-part="thumbnail"]')!;
      if (input === "pointer") {
        await commands.pointerPress({ selector: 'li:first-child [data-ouro-part="thumbnail"]', action: "down" });
        for (let index = 0; index < 10; index++) await frame();
        await commands.pointerPress({ action: "up" });
      } else {
        opener.focus({ preventScroll: true });
        await userEvent.keyboard("{Enter}");
      }
      await expect.poll(() => Boolean(popup()?.hasAttribute("data-open"))).toBe(true);
      await frame();
      await frame();
      expect(window.scrollY).toBe(2000);
    });
  }
});
