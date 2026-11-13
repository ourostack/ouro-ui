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

  it("sets a text lede in a paragraph", async () => {
    for (const description of ["Plan the week.", 7]) {
      const { part } = await render(<Hero title="Dinner" description={description} />);
      expect(part("description")!.tagName).toBe("P");
    }
  });

  it("sets a lede made of blocks in a div, so its paragraphs stay valid", async () => {
    const { part } = await render(
      <Hero
        title="Dinner"
        description={
          <>
            <p>Plan the week.</p>
            <p>Shop once.</p>
          </>
        }
      />,
    );
    expect(part("description")!.tagName).toBe("DIV");
    expect(part("description")!.querySelectorAll("p")).toHaveLength(2);
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
    expect(header.firstElementChild!.className).toContain("pt-10 min-[40rem]:pt-12");
  });

  it("switches to the split layout, with copy and media side by side from 64rem", async () => {
    const { header, part } = await render(
      <Hero title="Split" layout="split" actions={<button type="button">Start</button>} media={<div>Live</div>} />,
    );
    expect(header.getAttribute("data-layout")).toBe("split");
    expect(header.className).toContain("min-[64rem]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]");
    expect(header.className).toContain("[--hero-width:100%]");
    expect(header.firstElementChild!.className).toContain("text-start");
    expect(part("actions")!.className).toContain("justify-start");
    expect(part("media")!.className).toContain("min-[64rem]:mt-0");
  });

  it("sets split media beside the words on a wide screen and below them on a phone", async () => {
    await page.viewport(1400, 900);
    const wideHero = await render(<Hero title="Split" layout="split" media={<div style={{ height: 200 }}>Live</div>} />);
    const words = wideHero.header.firstElementChild!.getBoundingClientRect();
    const beside = wideHero.part("media")!.getBoundingClientRect();
    expect(beside.left).toBeGreaterThanOrEqual(words.right);
    await page.viewport(400, 900);
    const phoneHero = await render(<Hero title="Split" layout="split" media={<div style={{ height: 200 }}>Live</div>} />);
    const below = phoneHero.part("media")!.getBoundingClientRect();
    expect(below.top).toBeGreaterThanOrEqual(phoneHero.header.firstElementChild!.getBoundingClientRect().bottom);
  });

  it("keeps a split hero without media in a single column", async () => {
    const { header } = await render(<Hero title="Split" layout="split" media={false} />);
    expect(header.className).not.toContain("grid-cols-");
  });

  it("keeps stage and column media below the words on a wide screen", async () => {
    await page.viewport(1400, 900);
    for (const layout of ["stage", "column"] as const) {
      const { header, part } = await render(<Hero title="Stacked" layout={layout} media={<div style={{ height: 200 }}>Live</div>} />);
      expect(part("media")!.getBoundingClientRect().top).toBeGreaterThanOrEqual(header.firstElementChild!.getBoundingClientRect().bottom);
    }
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
            { srcSet: "/wide.jpg" },
          ],
        }}
      />,
    );
    const sources = [...part("media")!.querySelectorAll("source")];
    expect(sources.map((source) => source.getAttribute("srcset"))).toEqual(["/phone.avif", "/wide.jpg"]);
    expect(sources[0]!.getAttribute("media")).toBe("(max-width: 40rem)");
    expect(sources[1]!.hasAttribute("type")).toBe(false);
    expect(sources[1]!.hasAttribute("media")).toBe(false);
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
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Hero: layout="banana" is not a layout; use "stage", "column" or "split". Fix: <Hero layout="column" />.');
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
      expect(media.getAttribute("data-starting-style")).toBe("");
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

  it("gives the picture its rise animation by default, and none with motion none", async () => {
    const rising = await render(<Hero title="Rise" picture={wide} />);
    expect(rising.part("media")!.className).toContain("animate-[ouro-hero-rise");
    const still = await render(<Hero title="Still" picture={wide} motion="none" />);
    expect(still.part("media")!.className).not.toContain("animate-[ouro-hero");
  });

  it("applies each layout's classes to its own parts only", async () => {
    const stage = await render(
      <Hero eyebrow="Recipes" title="Stage" actions={<button type="button">Start</button>} picture={wide} />,
    );
    expect(stage.header.className).toContain("min(80rem,");
    expect(stage.header.className).not.toContain("min(72rem,");
    expect(stage.header.firstElementChild!.className).toContain("text-center");
    expect(stage.header.firstElementChild!.className).not.toContain("text-start");
    expect(stage.part("actions")!.className).toContain("justify-center");
    expect(stage.part("actions")!.className).not.toContain("justify-start");
    expect(stage.part("media")!.className).toContain("min-[40rem]:mt-12");

    const column = await render(
      <Hero
        eyebrow="Recipes"
        title="Column"
        layout="column"
        actions={<button type="button">Start</button>}
        picture={wide}
      />,
    );
    expect(column.header.className).toContain("min(75rem,");
    expect(column.header.className).not.toContain("min(80rem,");
    expect(column.header.firstElementChild!.className).toContain("text-start");
    expect(column.header.firstElementChild!.className).not.toContain("text-center");
    expect(column.part("actions")!.className).toContain("justify-start");
    expect(column.part("actions")!.className).not.toContain("justify-center");
    expect(column.part("media")!.className).toContain("mx-auto mt-8");
    expect(column.part("media")!.className).not.toContain("min-[40rem]:mt-12");
  });

  it("says nothing when the Hero is used as intended", async () => {
    await render(
      <Hero
        eyebrow="Recipes"
        title="Dinner, sorted"
        description="Plan the week and shop once."
        actions={<button type="button">Start planning</button>}
        picture={wide}
      />,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not ask a decorative picture for alt text", async () => {
    await render(<Hero title="Decor" picture={{ src: wide.src, width: 1536, height: 576, decorative: true }} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("says heading, image and action are not props, and what to use instead", async () => {
    const legacy = {
      heading: "Dinner, sorted",
      image: wide,
      action: <button type="button">Start</button>,
    } as unknown as HeroProps;
    await render(<Hero {...legacy} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Hero: heading is not a prop. Fix: <Hero title="Dinner, sorted" />.');
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Hero: image is not a prop. Fix: <Hero picture={{ src, width, height, alt }} />.');
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Hero: action is not a prop. Fix: <Hero actions={<Button>Start</Button>} />.');
  });

  it("says className cannot set the look, and names the class", async () => {
    await render(<Hero title="Colored" className="bg-red-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Hero: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; Hero sets its own look from the theme.',
    );
  });

  it("keeps the picture from being dragged out of the page", async () => {
    const { part } = await render(<Hero title="Drag" picture={wide} />);
    expect(part("image")!.getAttribute("draggable")).toBe("false");
  });

  it("lets a cropped picture fill its frame only on wider screens", async () => {
    const plain = await render(<Hero title="Plain" picture={wide} />);
    expect(plain.part("image")!.className).not.toContain("min-[40rem]:absolute");
    const cropped = await render(<Hero title="Cropped" picture={{ ...wide, crop: "8 / 3" }} />);
    expect(cropped.part("image")!.className).toContain("min-[40rem]:absolute");
  });

  it("shows live media in the picture's place", async () => {
    const { part } = await render(<Hero title="T" media={<video data-testid="clip" />} />);
    const media = part("media")!;
    expect(media.querySelector('[data-testid="clip"]')).not.toBeNull();
    expect(media.querySelector("picture")).toBeNull();
    expect(media.querySelector("img")).toBeNull();
    expect(media.hasAttribute("style")).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("never shows live media wider than mediaWidth", async () => {
    await page.viewport(2400, 900);
    const { part } = await render(
      <Hero title="Wide" mediaWidth={1536} media={<div data-testid="scene" className="h-10 w-full" />} />,
    );
    const media = part("media")!;
    expect(media.style.maxWidth).toBe("1536px");
    expect(media.getBoundingClientRect().width).toBeLessThanOrEqual(1536);
    const both = await render(<Hero title="Both" mediaWidth={400} picture={wide} />);
    expect(both.part("media")!.style.maxWidth).toBe("1536px");
  });

  it("rises live media in on mount like a picture", async () => {
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
      flushSync(() => root.render(<Hero title="Rise" media={<video data-testid="clip" />} />));
      const media = host.querySelector<HTMLElement>('[data-slot="media"]')!;
      expect(media.getAttribute("data-starting-style")).toBe("");
      await expectMotion(media, {
        stem: "hero",
        state: "data-starting-style",
        properties: reduced ? { opacity: fast } : { opacity: slow, transform: slow },
        reduced,
      });
      await expect.poll(() => media.hasAttribute("data-starting-style")).toBe(false);
    }
    const still = await render(<Hero title="Still" media={<video data-testid="clip" />} motion="none" />);
    expect(still.part("media")!).not.toHaveAttribute("data-starting-style");
    expect(still.part("media")!.className).not.toContain("animate-[ouro-hero");
  });

  it("shows the picture and warns when picture and media are both set", async () => {
    const { part } = await render(<Hero title="Both" picture={wide} media={<video data-testid="clip" />} />);
    expect(part("image")).not.toBeNull();
    expect(part("media")!.querySelector('[data-testid="clip"]')).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Hero: picture and media are both set; show one: picture for a still image, media for something live. Fix: <Hero media={<video src="..." muted autoPlay loop playsInline />} />.',
    );
  });

  it("renders no media wrapper when media is null or false", async () => {
    const { part } = await render(<Hero title="Empty" media={null} />);
    expect(part("media")).toBeNull();
    const hidden = await render(<Hero title="Hidden" media={false} />);
    expect(hidden.part("media")).toBeNull();
  });
});
