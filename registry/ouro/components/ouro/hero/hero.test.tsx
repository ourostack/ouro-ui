import type { ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { Hero, type HeroPicture, type HeroPictures, type HeroProps } from "@/registry/ouro/components/ouro/hero/hero";
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

const longLede = "Plan the week, shop once and cook with what you already have, so dinner is never a scramble and the fridge never fills with food you forgot you bought. ".repeat(3);

// The lede the shots showed running past the measure into a short orphan last line.
const plainLede = "Plan the week and shop once and cook with what you already have so dinner is never a scramble and the fridge never fills with food you forgot you bought last week or the week before";

/** The lede's text, line by line as the browser set it, read from each word's own rectangle. */
function ledeLines(lede: HTMLElement): string[] {
  const rows = new Map<number, string[]>();
  const walker = document.createTreeWalker(lede, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const word of (node.textContent ?? "").matchAll(/\S+/g)) {
      const range = document.createRange();
      range.setStart(node, word.index);
      range.setEnd(node, word.index + word[0].length);
      const top = Math.round(range.getBoundingClientRect().top);
      rows.set(top, [...(rows.get(top) ?? []), word[0]]);
    }
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, words]) => words.join(" "));
}
const night: HeroPicture = { src: `${svg(1536, 576)}%3C!--night--%3E`, width: 1536, height: 576 };

/** Light art with its night twin, as every hero takes it. */
const pair = (light: HeroPicture): HeroPictures => ({ light, dark: night });

const shownIn = (part: (name: string) => HTMLElement | null) =>
  [...part("media")!.querySelectorAll("picture")].filter((picture) => getComputedStyle(picture).display !== "none").map((picture) => picture.getAttribute("data-scheme"));

/**
 * The transitions a hero's server HTML runs as it first appears, by property and duration, then waits for them to end.
 * Nothing hydrates such HTML, so it carries no state marker for expectMotion; the client tests record the evidence.
 */
async function expectRiseFromHtml(media: HTMLElement, properties: Record<string, number>) {
  const running = media.getAnimations().filter((animation): animation is CSSTransition => animation instanceof CSSTransition);
  expect(Object.fromEntries(running.map((transition) => [transition.transitionProperty, Math.round(Number(transition.effect!.getComputedTiming().duration))]))).toEqual(properties);
  await Promise.all(running.map((transition) => transition.finished));
  expect(media.hasAttribute("data-starting-style")).toBe(false);
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  document.documentElement.classList.remove("dark");
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
        picture={pair(wide)}
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
    for (const name of ["breadcrumb", "eyebrow", "badge", "description", "actions", "more", "media", "image"]) expect(part(name)).toBeNull();
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

  it("runs the lede the full width of the text column in each layout", async () => {
    await page.viewport(1440, 900);
    for (const layout of ["stage", "column", "split"] as const) {
      const { header, part } = await render(<Hero title="Dinner" layout={layout} description={longLede} />);
      const column = header.firstElementChild!.getBoundingClientRect().width;
      expect(part("description")!.getBoundingClientRect().width).toBeCloseTo(column, 0);
    }
  });

  it("balances the lede in each layout, so its last line is never short", async () => {
    // The lede the Ouroboros website's 404 page showed with "with it." alone on its last line.
    const lost = "Ouro wandered off the glowing trail, out through the garden gate, and this page wandered off with it.";
    for (const width of [390, 768, 1440]) {
      await page.viewport(width, 900);
      for (const layout of ["stage", "column", "split"] as const) {
        for (const lede of [lost, plainLede]) {
          const { part } = await render(<Hero title="Lost in the coils." layout={layout} description={lede} picture={pair(wide)} />);
          const description = part("description")!;
          expect(getComputedStyle(description).textWrapStyle).toBe("balance");
          const lengths = ledeLines(description).map((line) => line.length);
          if (lengths.length > 1) expect(lengths.at(-1)! / Math.max(...lengths), `${layout} at ${width}: ${ledeLines(description).join(" / ")}`).toBeGreaterThan(0.5);
        }
      }
    }
  });

  it("sets the actions right under the lede, a step further from it than the lines of text, on the lede's edge", async () => {
    await page.viewport(1440, 900);
    for (const layout of ["stage", "column", "split"] as const) {
      const { header, part } = await render(
        <Hero eyebrow="Recipes" title="Dinner" layout={layout} description="Plan the week." actions={<button type="button">Start</button>} media={<div style={{ height: 120 }}>Live</div>} />,
      );
      const lede = part("description")!;
      const actions = part("actions")!;
      expect(lede.nextElementSibling).toBe(actions);
      const textGap = lede.getBoundingClientRect().top - header.querySelector("h1")!.getBoundingClientRect().bottom;
      expect(actions.getBoundingClientRect().top - lede.getBoundingClientRect().bottom).toBe(textGap + 8);
      const button = actions.querySelector("button")!.getBoundingClientRect();
      const words = document.createRange();
      words.selectNodeContents(lede);
      const line = words.getBoundingClientRect();
      if (layout === "stage") expect(button.left + button.width / 2).toBeCloseTo(line.left + line.width / 2, 0);
      else expect(button.left).toBe(line.left);
    }
  });

  it("puts the trail above the eyebrow and the badge beside it, on the text's edge", async () => {
    await page.viewport(1440, 900);
    for (const layout of ["stage", "column", "split"] as const) {
      const { header, part } = await render(
        <Hero layout={layout} breadcrumb={<nav aria-label="Breadcrumb">Lab / Story</nav>} eyebrow="Lab" badge={<span>Beta</span>} title="Story" />,
      );
      const column = header.firstElementChild!;
      expect(column.firstElementChild).toBe(part("breadcrumb"));
      const eyebrow = part("eyebrow")!.getBoundingClientRect();
      const badge = part("badge")!.getBoundingClientRect();
      expect(badge.left).toBeGreaterThan(eyebrow.right);
      expect(badge.top + badge.height / 2).toBeCloseTo(eyebrow.top + eyebrow.height / 2, 0);
      expect(part("breadcrumb")!.getBoundingClientRect().bottom).toBeLessThanOrEqual(eyebrow.top);
      const box = column.getBoundingClientRect();
      if (layout === "stage") expect((eyebrow.left + badge.right) / 2).toBeCloseTo(box.left + box.width / 2, 0);
      else expect(eyebrow.left).toBe(box.left);
    }
    const alone = await render(<Hero title="Story" badge={<span>Beta</span>} />);
    expect(alone.part("eyebrow")).toBeNull();
    expect(alone.part("badge")!.textContent).toBe("Beta");
  });

  it("sets more under the actions in the text column, beside the art in the split layout", async () => {
    await page.viewport(1440, 900);
    const { part } = await render(
      <Hero layout="split" title="Ouro MD" actions={<button type="button">Download</button>} media={<div style={{ height: 300 }}>Scene</div>}>
        <p>A recording of an agent's edit.</p>
      </Hero>,
    );
    const more = part("more")!;
    expect(part("actions")!.nextElementSibling).toBe(more);
    expect(more.getBoundingClientRect().right).toBeLessThanOrEqual(part("media")!.getBoundingClientRect().left);
  });

  it("takes its container's width with fullWidth, with no gutter or cap of its own", async () => {
    await page.viewport(1440, 900);
    for (const layout of ["stage", "column", "split"] as const) {
      const media = <div style={{ height: 120 }}>Live</div>;
      const own = await render(<div style={{ width: 900 }}><Hero title="Inset" layout={layout} media={media} /></div>);
      expect(own.header.firstElementChild!.getBoundingClientRect().width).toBeLessThan(900);
      const full = await render(<div style={{ width: 900 }}><Hero title="Full" layout={layout} media={media} fullWidth /></div>);
      expect(full.header.getBoundingClientRect().width).toBe(900);
      expect(getComputedStyle(full.header).paddingTop).toBe(getComputedStyle(own.header).paddingTop);
      const words = document.createRange();
      words.selectNodeContents(full.header.querySelector("h1")!);
      const title = words.getBoundingClientRect();
      if (layout === "stage") expect(title.left + title.width / 2).toBeCloseTo(full.host.getBoundingClientRect().left + 450, 0);
      else expect(title.left).toBe(full.host.getBoundingClientRect().left);
      if (layout === "split") {
        expect(full.header.getBoundingClientRect().left).toBe(full.host.getBoundingClientRect().left);
      } else {
        expect(full.header.firstElementChild!.getBoundingClientRect().width).toBe(900);
        expect(full.part("media")!.getBoundingClientRect().width).toBe(900);
      }
    }
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
    const { part } = await render(<Hero title="Wide" picture={pair(wide)} />);
    const media = part("media")!;
    expect(media.style.maxWidth).toBe("1536px");
    expect(media.getBoundingClientRect().width).toBeLessThanOrEqual(1536);
  });

  it("keeps the picture's own aspect ratio unless it is given a crop", async () => {
    const { part } = await render(<Hero title="Plain" picture={pair(wide)} />);
    expect(part("media")!.className).not.toContain("aspect-");
    const { part: cropped } = await render(<Hero title="Cropped" picture={pair({ ...wide, crop: "8 / 3", focus: "30% 10%" })} />);
    expect(cropped("media")!.className).toContain("aspect-[var(--hero-crop)]");
    expect(cropped("image")!.style.objectPosition).toBe("30% 10%");
  });

  it("uses the default focus when the picture has none", async () => {
    const { part } = await render(<Hero title="Focus" picture={pair(wide)} />);
    expect(part("image")!.style.objectPosition).toBe("50% 42%");
  });

  it("loads a picture lazily unless it is a priority", async () => {
    const lazy = await render(<Hero title="Lazy" picture={pair(wide)} />);
    expect(lazy.part("image")!.getAttribute("loading")).toBe("lazy");
    expect(lazy.part("image")!.getAttribute("decoding")).toBe("async");
    const eager = await render(<Hero title="Eager" picture={pair({ ...wide, priority: true })} />);
    expect(eager.part("image")!.getAttribute("fetchpriority")).toBe("high");
    expect(eager.part("image")!.hasAttribute("loading")).toBe(false);
  });

  it("writes the picture's sources in order, before the fallback image", async () => {
    const { part } = await render(
      <Hero
        title="Sources"
        picture={pair({
          ...wide,
          sources: [
            { srcSet: "/phone.avif", type: "image/avif", media: "(max-width: 40rem)" },
            { srcSet: "/wide.jpg" },
          ],
        })}
      />,
    );
    const sources = [...part("media")!.querySelectorAll("source")];
    expect(sources.map((source) => source.getAttribute("srcset"))).toEqual(["/phone.avif", "/wide.jpg"]);
    expect(sources[0]!.getAttribute("media")).toBe("(max-width: 40rem)");
    expect(sources[1]!.hasAttribute("type")).toBe(false);
    expect(sources[1]!.hasAttribute("media")).toBe(false);
    expect(sources[0]!.compareDocumentPosition(part("image")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gives each source its own width and height, so a source of another shape holds its box before it loads", async () => {
    await page.viewport(390, 844);
    const phone = { srcSet: "/phone.avif", type: "image/avif", media: "(max-width: 40rem)", width: 800, height: 600 };
    const { part } = await render(
      <Hero title="Sources" picture={{ light: { ...wide, sources: [phone, { srcSet: "/wide.avif", type: "image/avif" }] }, dark: { ...night, sources: [{ ...phone, srcSet: "/phone-night.avif", width: 640, height: 640 }] } }} />,
    );
    const [lightPhone, lightWide] = [...part("media")!.querySelectorAll('[data-scheme="light"] source')];
    expect([lightPhone!.getAttribute("width"), lightPhone!.getAttribute("height")]).toEqual(["800", "600"]);
    expect(lightWide!.hasAttribute("width")).toBe(false);
    expect(lightWide!.hasAttribute("height")).toBe(false);
    const darkPhone = part("media")!.querySelector('[data-scheme="dark"] source')!;
    expect([darkPhone.getAttribute("width"), darkPhone.getAttribute("height")]).toEqual(["640", "640"]);
    // The phone source is chosen, and its shape, not the fallback's, sets the image's ratio.
    expect(getComputedStyle(part("media")!.querySelector('[data-scheme="light"] img')!).aspectRatio).toBe("auto 800 / 600");
  });

  it("hides a decorative picture from assistive technology", async () => {
    const { part } = await render(<Hero title="Decor" picture={pair({ src: wide.src, width: 1536, height: 576, decorative: true })} />);
    expect(part("image")!.getAttribute("alt")).toBe("");
    expect(part("media")!.querySelector("picture")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("says so, and keeps the picture, when it has no alt text", async () => {
    await render(<Hero title="Bare" picture={pair({ src: wide.src, width: 1536, height: 576 })} />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Hero: picture has no alt text. Fix: <Hero picture={{ light: { src, width, height, alt: "A table set for four" }, dark }} />.',
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
    const html = renderToString(<Hero title="Server" eyebrow="Recipes" picture={pair(wide)} />);
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
      flushSync(() => root.render(<Hero title="Rise" picture={pair(wide)} />));
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

  it("rises the picture in from server-rendered HTML before any JavaScript runs, and only fades it with reduced motion", async () => {
    const token = (name: string) => parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name));
    const slow = token("--ouro-duration-slow");
    const fast = token("--ouro-duration-fast");
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      await expect.poll(() => matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(reduced);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      // The server's HTML, never hydrated: nothing but CSS can move it.
      const host = document.createElement("div");
      host.innerHTML = renderToString(<Hero title="Rise" picture={pair(wide)} />);
      document.body.append(host);
      mounted.push(host);
      const media = host.querySelector<HTMLElement>('[data-slot="media"]')!;
      await expectRiseFromHtml(media, reduced ? { opacity: fast } : { opacity: slow, transform: slow });
    }
    await commands.emulateMedia({ reducedMotion: "no-preference" });
  });

  it("rises with no keyframes: its own transition, on ouro-base's durations and easing", async () => {
    const token = (name: string) => parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name));
    const slow = token("--ouro-duration-slow");
    const fast = token("--ouro-duration-fast");
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      await expect.poll(() => matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(reduced);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const host = document.createElement("div");
      host.innerHTML = renderToString(
        <div>
          <Hero title="Rise" picture={pair(wide)} />
        </div>,
      );
      document.body.append(host);
      mounted.push(host);
      const media = host.querySelector<HTMLElement>('[data-slot="media"]')!;
      expect(getComputedStyle(media).animationName).toBe("none");
      // One easing per property the transition runs, each of them ouro-base's ease-out.
      const easings = getComputedStyle(media).transitionTimingFunction.split(/, (?=[a-z])/);
      expect(new Set(easings)).toEqual(new Set(["cubic-bezier(0.23, 1, 0.32, 1)"]));
      await expectRiseFromHtml(media, reduced ? { opacity: fast } : { opacity: slow, transform: slow });
    }
    await commands.emulateMedia({ reducedMotion: "no-preference" });
  });

  it("marks the rise only while it runs, so server HTML that never hydrates carries no marker", async () => {
    const html = renderToString(<Hero title="Rise" picture={pair(wide)} />);
    expect(html).not.toContain("data-starting-style");
    // Hydrated while the rise still runs: the marker shows for the rest of it, then goes.
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const media = host.querySelector<HTMLElement>('[data-slot="media"]')!;
    const root = hydrateRoot(host, <Hero title="Rise" picture={pair(wide)} />);
    roots.push(root);
    await act(async () => {});
    expect(media.getAttribute("data-starting-style")).toBe("");
    await expect.poll(() => media.hasAttribute("data-starting-style")).toBe(false);
    // Hydrated after it has finished: no marker at all.
    const late = document.createElement("div");
    late.innerHTML = html;
    document.body.append(late);
    mounted.push(late);
    const lateMedia = late.querySelector<HTMLElement>('[data-slot="media"]')!;
    await expect.poll(() => lateMedia.getAnimations().length).toBe(0);
    roots.push(hydrateRoot(late, <Hero title="Rise" picture={pair(wide)} />));
    await act(async () => {});
    expect(lateMedia.hasAttribute("data-starting-style")).toBe(false);
  });

  it("does not move the picture in at all when motion is none", async () => {
    const { part } = await render(<Hero title="Still" picture={pair(wide)} motion="none" />);
    expect(part("media")!).not.toHaveAttribute("data-starting-style");
  });

  it("gives the picture its rise by default, and none with motion none", async () => {
    const rising = await render(<Hero title="Rise" picture={pair(wide)} />);
    expect(rising.part("media")!.className).toContain("starting:opacity-0");
    const still = await render(<Hero title="Still" picture={pair(wide)} motion="none" />);
    expect(still.part("media")!.className).not.toContain("starting:");
  });

  it("applies each layout's classes to its own parts only", async () => {
    const stage = await render(
      <Hero eyebrow="Recipes" title="Stage" actions={<button type="button">Start</button>} picture={pair(wide)} />,
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
        picture={pair(wide)}
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
        picture={pair(wide)}
      />,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not ask a decorative picture for alt text", async () => {
    await render(<Hero title="Decor" picture={pair({ src: wide.src, width: 1536, height: 576, decorative: true })} />);
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
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Hero: image is not a prop. Fix: <Hero picture={{ light: { src, width, height, alt }, dark: { src, width, height } }} />.');
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Hero: action is not a prop. Fix: <Hero actions={<Button>Start</Button>} />.');
  });

  it("says className cannot set the look, and names the class", async () => {
    await render(<Hero title="Colored" className="bg-red-500" />);
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Hero: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; Hero sets its own look from the theme.',
    );
  });

  it("keeps the picture from being dragged out of the page", async () => {
    const { part } = await render(<Hero title="Drag" picture={pair(wide)} />);
    expect(part("image")!.getAttribute("draggable")).toBe("false");
  });

  it("lets a cropped picture fill its frame only on wider screens", async () => {
    const plain = await render(<Hero title="Plain" picture={pair(wide)} />);
    expect(plain.part("image")!.className).not.toContain("min-[40rem]:absolute");
    const cropped = await render(<Hero title="Cropped" picture={pair({ ...wide, crop: "8 / 3" })} />);
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
    const both = await render(<Hero title="Both" mediaWidth={400} picture={pair(wide)} />);
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
    expect(still.part("media")!.className).not.toContain("starting:");
  });

  it("shows the picture and warns when picture and media are both set", async () => {
    const { part } = await render(<Hero title="Both" picture={pair(wide)} media={<video data-testid="clip" />} />);
    expect(part("image")).not.toBeNull();
    expect(part("media")!.querySelector('[data-testid="clip"]')).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[ouro-ui] Hero: picture and media are both set; show one: picture for a still image, media for something live. Fix: <Hero media={<video src="..." muted autoPlay loop playsInline />} />.',
    );
  });

  it("shows the dark picture only while the page is in dark mode", async () => {
    const { part } = await render(<Hero title="Night" picture={{ light: wide, dark: night }} />);
    const [light, dark] = [...part("media")!.querySelectorAll("img")];
    expect(light!.getAttribute("src")).toBe(wide.src);
    expect(dark!.getAttribute("src")).toBe(night.src);
    expect(shownIn(part)).toEqual(["light"]);
    // A stored theme toggle sets the .dark class on the root, as Ouro's dark variant reads it.
    document.documentElement.classList.add("dark");
    expect(shownIn(part)).toEqual(["dark"]);
    document.documentElement.classList.remove("dark");
    expect(shownIn(part)).toEqual(["light"]);
  });

  it("keeps a lone priority twin eager in the HTML and the other lazy, at high fetch priority", async () => {
    const day = await render(<Hero title="Day" picture={{ light: { ...wide, priority: true }, dark: night }} />);
    const [light, dark] = [...day.part("media")!.querySelectorAll("img")];
    expect(light!.hasAttribute("loading")).toBe(false);
    expect(dark!.getAttribute("loading")).toBe("lazy");
    for (const twin of [light!, dark!]) {
      expect(twin.getAttribute("fetchpriority")).toBe("high");
      expect(twin.hasAttribute("decoding")).toBe(false);
    }
    const nightFirst = await render(<Hero title="Night" picture={{ light: wide, dark: { ...night, priority: true } }} />);
    const [nightLight, nightDark] = [...nightFirst.part("media")!.querySelectorAll("img")];
    expect(nightLight!.getAttribute("loading")).toBe("lazy");
    expect(nightDark!.hasAttribute("loading")).toBe(false);
    expect([nightLight!, nightDark!].map((twin) => twin.getAttribute("fetchpriority"))).toEqual(["high", "high"]);
    // Untyped code without night art: the day art alone loads from the HTML only with priority.
    const lone = await render(<Hero title="Lone" picture={{ light: { ...wide, priority: true } } as unknown as HeroPictures} />);
    expect(lone.part("image")!.hasAttribute("loading")).toBe(false);
    expect(lone.part("image")!.getAttribute("fetchpriority")).toBe("high");
    const loneLazy = await render(<Hero title="Lone lazy" picture={{ light: wide } as unknown as HeroPictures} />);
    expect(loneLazy.part("image")!.getAttribute("loading")).toBe("lazy");
    const both = await render(<Hero title="Both" picture={{ light: { ...wide, priority: true }, dark: { ...night, priority: true } }} />);
    expect([...both.part("media")!.querySelectorAll("img")].map((img) => img.getAttribute("loading"))).toEqual(["lazy", "lazy"]);
    const plain = await render(<Hero title="Plain" picture={{ light: wide, dark: night }} />);
    for (const twin of plain.part("media")!.querySelectorAll("img")) {
      expect(twin.getAttribute("loading")).toBe("lazy");
      expect(twin.hasAttribute("fetchpriority")).toBe(false);
      expect(twin.getAttribute("decoding")).toBe("async");
    }
  });

  it("loads the twin shown at first paint eagerly from server HTML, and leaves the hidden one lazy", async () => {
    // Inserted as the parser would run it: the fragment's inline script runs where it stands.
    const serve = (node: ReactNode) => {
      const host = document.createElement("div");
      document.body.append(host);
      mounted.push(host);
      host.append(document.createRange().createContextualFragment(renderToString(node)));
      return [...host.querySelectorAll("img")];
    };
    const twins = { light: { ...wide, priority: true }, dark: { ...night, priority: true } };
    const [lightByDay, darkByDay] = serve(<Hero title="Day" picture={twins} />);
    expect(lightByDay!.loading).toBe("eager");
    expect(darkByDay!.loading).toBe("lazy");
    document.documentElement.classList.add("dark");
    const [lightAtNight, darkAtNight] = serve(<Hero title="Night" picture={twins} />);
    expect(lightAtNight!.loading).toBe("lazy");
    expect(darkAtNight!.loading).toBe("eager");
    await expect.poll(() => darkAtNight!.complete && darkAtNight!.currentSrc).toBe(night.src);
    const [, lone] = serve(<Hero title="Lone" picture={{ light: { ...wide, priority: true }, dark: night }} />);
    expect(lone!.loading).toBe("eager");
    expect(renderToString(<Hero title="Plain" picture={{ light: wide, dark: night }} />)).not.toContain("<script");
  });

  it("hydrates the first-paint script and its twins quietly, and renders it on the client without running it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const twins = { light: { ...wide, priority: true }, dark: { ...night, priority: true } };
    const node = <Hero title="Hydrate" picture={twins} />;
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    host.append(document.createRange().createContextualFragment(renderToString(node)));
    expect(host.querySelector("img")!.loading).toBe("eager");
    const root = hydrateRoot(host, node, { onRecoverableError: (cause) => error(cause) });
    roots.push(root);
    await act(async () => {});
    expect(host.querySelector("script")!.getAttribute("type")).toBe("text/plain");
    await render(node);
    expect(error).not.toHaveBeenCalled();
  });

  it("gives the dark picture the light one's alt text, frame and crop unless it has its own", async () => {
    await page.viewport(1280, 900);
    document.documentElement.classList.add("dark");
    const { part } = await render(<Hero title="Twins" picture={{ light: { ...wide, width: 1200, crop: "8 / 3" }, dark: night }} />);
    const dark = part("media")!.querySelector<HTMLImageElement>('[data-scheme="dark"] img')!;
    expect(dark.alt).toBe("A green snake mascot");
    expect(part("media")!.style.maxWidth).toBe("1200px");
    expect(getComputedStyle(dark).position).toBe("absolute");
    expect(page.getByRole("img").all()).toHaveLength(1);
    const own = await render(<Hero title="Own" picture={{ light: wide, dark: { ...night, alt: "The mascot at night" } }} />);
    expect(own.part("media")!.querySelector('[data-scheme="dark"] img')!.getAttribute("alt")).toBe("The mascot at night");
    const decor = await render(<Hero title="Decor" picture={{ light: { ...wide, decorative: true }, dark: night }} />);
    expect(decor.part("media")!.querySelector('[data-scheme="dark"]')!.getAttribute("aria-hidden")).toBe("true");
    const shown = await render(<Hero title="Shown" picture={{ light: { ...wide, decorative: true }, dark: { ...night, alt: "Night", decorative: false } }} />);
    expect(shown.part("media")!.querySelector('[data-scheme="dark"]')!.hasAttribute("aria-hidden")).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("says so when the night art is missing, and shows the day art in both modes", async () => {
    const { part } = await render(<Hero title="One" picture={{ light: wide } as unknown as HeroPictures} />);
    expect(warn).toHaveBeenCalledWith(
      "[ouro-ui] Hero: picture needs light and dark art, the same scene by day and at night. Fix: <Hero picture={{ light: { src, width, height, alt }, dark: { src, width, height } }} />.",
    );
    const pictures = part("media")!.querySelectorAll("picture");
    expect(pictures).toHaveLength(1);
    expect(pictures[0]!.hasAttribute("data-scheme")).toBe(false);
    document.documentElement.classList.add("dark");
    expect(getComputedStyle(pictures[0]!).display).toBe("block");
  });

  it("says so, and shows nothing, when a single picture is passed without light and dark", async () => {
    const { part } = await render(<Hero title="Old" picture={wide as unknown as HeroPictures} />);
    expect(warn).toHaveBeenCalledWith(
      "[ouro-ui] Hero: picture needs light and dark art, the same scene by day and at night. Fix: <Hero picture={{ light: { src, width, height, alt }, dark: { src, width, height } }} />.",
    );
    expect(part("media")).toBeNull();
  });

  it("says so when the day art is missing", async () => {
    await render(<Hero title="Night only" picture={{ dark: night } as unknown as HeroPictures} />);
    expect(warn).toHaveBeenCalledWith(
      "[ouro-ui] Hero: picture needs light and dark art, the same scene by day and at night. Fix: <Hero picture={{ light: { src, width, height, alt }, dark: { src, width, height } }} />.",
    );
  });

  it("renders no media wrapper when media is null or false", async () => {
    const { part } = await render(<Hero title="Empty" media={null} />);
    expect(part("media")).toBeNull();
    const hidden = await render(<Hero title="Hidden" media={false} />);
    expect(hidden.part("media")).toBeNull();
  });
});
