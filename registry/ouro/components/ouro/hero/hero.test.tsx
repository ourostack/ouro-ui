import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { Hero, type HeroPicture, type HeroProps } from "@/registry/ouro/components/ouro/hero/hero";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { expectMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    get header() {
      return host.querySelector<HTMLElement>('[data-ouro="hero"]')!;
    },
    part(name: string) {
      return host.querySelector<HTMLElement>(`[data-slot="${name}"]`);
    },
  };
}

const svg = (width: number, height: number) => `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'/%3E`;

const wide: HeroPicture = { src: svg(1536, 576), width: 1536, height: 576, alt: "A green snake mascot" };

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await page.viewport(414, 896);
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("Hero", () => {
  it("puts the eyebrow, the title, the lede, the buttons and the picture in order", async () => {
    const { header, part } = await render(
      <Hero
        eyebrow="Recipes"
        title="Dinner, sorted"
        description="Plan the week and shop once."
        actions={<button type="button">Start planning</button>}
        picture={wide}
      />,
    );
    expect(header.tagName).toBe("HEADER");
    expect(header.getAttribute("data-layout")).toBe("stage");
    expect(part("eyebrow")!.textContent).toBe("Recipes");
    expect(header.querySelector("h1")!.textContent).toBe("Dinner, sorted");
    expect(part("description")!.textContent).toBe("Plan the week and shop once.");
    expect(part("actions")!.querySelector("button")!.textContent).toBe("Start planning");
    expect(part("image")!.getAttribute("alt")).toBe("A green snake mascot");
  });

  it("renders the title as an h2 when it heads a section", async () => {
    const { header } = await render(<Hero title="Plans" headingLevel={2} />);
    expect(header.querySelector("h2")!.textContent).toBe("Plans");
    expect(header.querySelector("h1")).toBeNull();
  });

  it("renders no optional slots it was not given", async () => {
    const { part } = await render(<Hero title="Plain" />);
    for (const name of ["eyebrow", "description", "actions", "media", "image"]) expect(part(name)).toBeNull();
  });

  it("switches to the column layout", async () => {
    const { header } = await render(<Hero title="Notes" layout="column" />);
    expect(header.getAttribute("data-layout")).toBe("column");
  });

  it("never shows the picture wider than its intrinsic width", async () => {
    await page.viewport(2400, 900);
    const { part } = await render(<Hero title="Wide" picture={wide} />);
    const media = part("media")!;
    expect(media.style.maxWidth).toBe("1536px");
    expect(media.getBoundingClientRect().width).toBeLessThanOrEqual(1536);
  });

  it("keeps the picture's own aspect ratio unless it is given a crop", async () => {
    const { part } = await render(<Hero title="Plain" picture={wide} />);
    expect(part("media")!.className).not.toContain("aspect-");
    const { part: cropped } = await render(<Hero title="Cropped" picture={{ ...wide, crop: "8 / 3", focus: "30% 10%" }} />);
    expect(cropped("media")!.className).toContain("aspect-[var(--hero-crop)]");
    expect(cropped("image")!.style.objectPosition).toBe("30% 10%");
  });

  it("uses the default focus when the picture has none", async () => {
    const { part } = await render(<Hero title="Focus" picture={wide} />);
    expect(part("image")!.style.objectPosition).toBe("50% 42%");
  });

  it("loads a picture lazily unless it is a priority", async () => {
    const lazy = await render(<Hero title="Lazy" picture={wide} />);
    expect(lazy.part("image")!.getAttribute("loading")).toBe("lazy");
    expect(lazy.part("image")!.getAttribute("decoding")).toBe("async");
    const eager = await render(<Hero title="Eager" picture={{ ...wide, priority: true }} />);
    expect(eager.part("image")!.getAttribute("fetchpriority")).toBe("high");
    expect(eager.part("image")!.hasAttribute("loading")).toBe(false);
  });

  it("writes the picture's sources in order, before the fallback image", async () => {
    const { part } = await render(
      <Hero
        title="Sources"
        picture={{
          ...wide,
          sources: [
            { srcSet: "/phone.avif", type: "image/avif", media: "(max-width: 40rem)" },
            { srcSet: "/wide.webp", type: "image/webp" },
          ],
        }}
      />,
    );
    const sources = [...part("media")!.querySelectorAll("source")];
    expect(sources.map((source) => source.getAttribute("srcset"))).toEqual(["/phone.avif", "/wide.webp"]);
    expect(sources[0]!.getAttribute("media")).toBe("(max-width: 40rem)");
    expect(sources[0]!.compareDocumentPosition(part("image")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides a decorative picture from assistive technology", async () => {
    const { part } = await render(<Hero title="Decor" picture={{ src: wide.src, width: 1536, height: 576, decorative: true }} />);
    expect(part("image")!.getAttribute("alt")).toBe("");
    expect(part("media")!.querySelector("picture")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("says so, and keeps the picture, when it has no alt text", async () => {
    await render(<Hero title="Bare" picture={{ src: wide.src, width: 1536, height: 576 }} />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Hero: picture has no alt text. Fix: <Hero picture={{ src, width, height, alt: "A table set for four" }} />.',
    );
  });

  it("falls back to the default layout, motion and heading level for unknown values, and says so", async () => {
    const { header } = await render(
      <Hero title="Odd" layout={"banana" as HeroProps["layout"]} motion={"wobble" as HeroProps["motion"]} headingLevel={3 as HeroProps["headingLevel"]} />,
    );
    expect(header.getAttribute("data-layout")).toBe("stage");
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Hero: layout="banana" is not a layout; use "stage" or "column". Fix: <Hero layout="column" />.');
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Hero: motion="wobble" is not a motion; use "rise" or "none". Fix: <Hero motion="none" />.');
    expect(warn).toHaveBeenCalledWith(
      "[ouro-ui] Hero: headingLevel={3} is not a heading level; use 1 for the page headline or 2 for a section. Fix: <Hero headingLevel={2} />.",
    );
    expect(header.querySelector("h1")).not.toBeNull();
  });

  it("drops the old prop names from the DOM, and says what to use instead", async () => {
    const legacy = { title: "Dinner", subtitle: "Lede text", overline: "Recipes" } as unknown as HeroProps;
    const { header } = await render(<Hero {...legacy} />);
    expect(header.textContent).toContain("Dinner");
    expect(header.textContent).not.toContain("Lede text");
    expect(header.textContent).not.toContain("Recipes");
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Hero: subtitle is not a prop. Fix: <Hero description="..." />.');
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Hero: overline is not a prop. Fix: <Hero eyebrow="Recipes" />.');
  });

  it("is server-rendered with its slots", () => {
    const html = renderToString(<Hero title="Server" eyebrow="Recipes" picture={wide} />);
    expect(html).toContain('data-ouro="hero"');
    expect(html).toContain('data-slot="image"');
    expect(html).toContain("Server");
  });

  it("rises the picture in on mount, and only fades it with reduced motion", async () => {
    const token = (name: string) => parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name));
    const slow = token("--ouro-duration-slow");
    const fast = token("--ouro-duration-fast");
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      // A loaded WebKit can take the setting a moment after the command returns: mount only once the page has it.
      await expect.poll(() => matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(reduced);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const host = document.createElement("div");
      document.body.append(host);
      mounted.push(host);
      const root = createRoot(host);
      roots.push(root);
      // No await before the checks: the rise lasts only as long as the slow token, which a loaded browser can finish first.
      flushSync(() => root.render(<Hero title="Rise" picture={wide} />));
      const media = host.querySelector<HTMLElement>('[data-slot="media"]')!;
      expect(media).toHaveAttribute("data-starting-style");
      await expectMotion(media, {
        stem: "hero",
        state: "data-starting-style",
        properties: reduced ? { opacity: fast } : { opacity: slow, transform: slow },
        reduced,
      });
      await expect.poll(() => media.hasAttribute("data-starting-style")).toBe(false);
    }
  });

  it("does not move the picture in at all when motion is none", async () => {
    const { part } = await render(<Hero title="Still" picture={wide} motion="none" />);
    expect(part("media")!).not.toHaveAttribute("data-starting-style");
  });
});
