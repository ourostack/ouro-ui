import { useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, server, userEvent } from "vitest/browser";
import { Carousel } from "@/registry/ouro/components/ouro/carousel/carousel";
import { OuroProvider } from "@/registry/ouro/lib/ouro/ouro-provider";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode, { dir }: { dir?: "rtl" } = {}) {
  const host = document.createElement("div");
  host.style.width = "320px";
  if (dir) host.dir = dir;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get carousel() {
      return host.querySelector<HTMLElement>('[data-ouro="carousel"]')!;
    },
    get viewport() {
      return host.querySelector<HTMLElement>("[data-ouro-carousel-viewport]")!;
    },
    get slides() {
      return [...host.querySelectorAll<HTMLElement>("[data-ouro-carousel-slide]")];
    },
    button(name: string) {
      return [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === name)!;
    },
  };
}

/** Five photo stand-ins. */
const photos = (count = 5) =>
  Array.from({ length: count }, (_, index) => (
    <div key={index} style={{ height: 120 }}>
      Photo {index + 1}
    </div>
  ));

/** The slide whose start edge lines up with the viewport's start edge. */
function slideAtStart(viewport: HTMLElement, slides: HTMLElement[], rtl = false): number {
  const edge = rtl ? viewport.getBoundingClientRect().right : viewport.getBoundingClientRect().left;
  return slides.findIndex((slide) => Math.abs((rtl ? slide.getBoundingClientRect().right : slide.getBoundingClientRect().left) - edge) < 1);
}

/**
 * Every text starting with `prefix` written into the shared polite live region, in order
 * (lib/ouro/announce clears it, then writes). Each test uses its own slideLabel prefix, so
 * an announcement still pending from an earlier test is not counted.
 */
function recordAnnouncements(prefix: string): { texts: string[]; stop: () => void } {
  const texts: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target as Element;
      const text = target.textContent ?? "";
      if (record.addedNodes.length > 0 && target.matches?.("[data-ouro-announcer]") && text.startsWith(prefix)) texts.push(text);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { texts, stop: () => observer.disconnect() };
}

/**
 * Presses `button` on each of the scroller's next `presses` scroll events, so the presses land
 * while a smooth scroll is under way however slow the machine is. A second real click can
 * arrive after the scroll has settled, which is a second change.
 */
function pressMidScroll(viewport: HTMLElement, button: HTMLButtonElement, presses = 1): Promise<void> {
  return new Promise((resolve) => {
    let left = presses;
    const onScroll = () => {
      button.click();
      if (--left > 0) return;
      viewport.removeEventListener("scroll", onScroll);
      resolve();
    };
    viewport.addEventListener("scroll", onScroll);
  });
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
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

describe("Carousel structure", () => {
  it("is a named carousel region of slides named by their position", async () => {
    const { carousel, slides } = await render(<Carousel label="Recipe photos">{photos(3)}</Carousel>);
    expect(carousel.tagName).toBe("SECTION");
    expect(carousel.getAttribute("aria-roledescription")).toBe("carousel");
    expect(carousel.getAttribute("aria-label")).toBe("Recipe photos");
    expect(slides.map((slide) => slide.getAttribute("aria-label"))).toEqual(["Slide 1 of 3", "Slide 2 of 3", "Slide 3 of 3"]);
    for (const slide of slides) {
      expect(slide.getAttribute("role")).toBe("group");
      expect(slide.getAttribute("aria-roledescription")).toBe("slide");
    }
    expect(slides[1]!.textContent).toBe("Photo 2");
  });

  it("snaps each slide to the start of a horizontal scroller that a keyboard can reach", async () => {
    const { viewport, slides } = await render(<Carousel label="Recipe photos">{photos()}</Carousel>);
    const style = getComputedStyle(viewport);
    expect(style.overflowX).toBe("auto");
    expect(style.scrollSnapType).toBe("x mandatory");
    expect(getComputedStyle(slides[0]!).scrollSnapAlign).toBe("start");
    expect(viewport.tabIndex).toBe(0);
    // One slide fills the viewport by default.
    expect(slides[0]!.getBoundingClientRect().width).toBe(viewport.clientWidth);
  });

  it("shows two or three slides at a time with slidesPerView", async () => {
    const two = await render(<Carousel label="Two" slidesPerView={2}>{photos()}</Carousel>);
    const three = await render(<Carousel label="Three" slidesPerView={3}>{photos()}</Carousel>);
    const gap = parseFloat(getComputedStyle(two.viewport).columnGap);
    expect(gap).toBeGreaterThan(0);
    expect(two.slides[0]!.getBoundingClientRect().width).toBeCloseTo((two.viewport.clientWidth - gap) / 2, 0);
    expect(three.slides[0]!.getBoundingClientRect().width).toBeCloseTo((three.viewport.clientWidth - 2 * gap) / 3, 0);
  });

  it("mirrors the back chevron and leaves the forward one as drawn, and reverses both under dir rtl", async () => {
    // Tailwind's -scale-x-100 sets the `scale` property, so a negative first value is a mirrored chevron.
    const mirrored = (button: HTMLButtonElement) => parseFloat(getComputedStyle(button.querySelector("svg")!).scale) < 0;
    const ltr = await render(<Carousel label="Recipe photos">{photos()}</Carousel>);
    expect(mirrored(ltr.button("Previous slide"))).toBe(true);
    expect(mirrored(ltr.button("Next slide"))).toBe(false);
    const rtl = await render(<Carousel label="Recipe photos">{photos()}</Carousel>, { dir: "rtl" });
    expect(mirrored(rtl.button("Previous slide"))).toBe(false);
    expect(mirrored(rtl.button("Next slide"))).toBe(true);
  });

  it("names its buttons and slides with the labels it is given", async () => {
    const screen = await render(
      <Carousel
        label="Fotos"
        previousLabel="Anterior"
        nextLabel="Siguiente"
        slideLabel="Foto {n} de {total}"
        roleDescription="carrusel"
        slideRoleDescription="diapositiva"
      >
        {photos(2)}
      </Carousel>,
    );
    expect(screen.button("Anterior")).toBeDefined();
    expect(screen.button("Siguiente")).toBeDefined();
    expect(screen.slides[1]!.getAttribute("aria-label")).toBe("Foto 2 de 2");
    expect(screen.carousel.getAttribute("aria-roledescription")).toBe("carrusel");
    expect(screen.slides.map((slide) => slide.getAttribute("aria-roledescription"))).toEqual(["diapositiva", "diapositiva"]);
  });

  /** Four slides, two per view, each with a button. */
  const savers = () =>
    Array.from({ length: 4 }, (_, index) => (
      <div key={index}>
        Photo {index + 1} <button>Save {index + 1}</button>
      </div>
    ));

  it("makes the slides out of view inert, so focus and a screen reader skip them", async () => {
    const screen = await render(
      <Carousel label="Recipe photos" slidesPerView={2}>
        {savers()}
      </Carousel>,
    );
    expect(screen.slides.map((slide) => slide.inert)).toEqual([false, false, true, true]);
    screen.slides[2]!.querySelector("button")!.focus();
    expect(document.activeElement).not.toBe(screen.slides[2]!.querySelector("button"));
    await userEvent.click(screen.button("Next slide"));
    await expect.poll(() => screen.slides.map((slide) => slide.inert)).toEqual([true, false, false, true]);
  });

  // WebKit's Tab skips buttons unless the user turns on "Press Tab to highlight each item".
  it.skipIf(server.browser !== "chromium")("keeps Tab from reaching a control in a slide out of view", async () => {
    const screen = await render(
      <Carousel label="Recipe photos" slidesPerView={2}>
        {savers()}
      </Carousel>,
    );
    screen.host.querySelector<HTMLButtonElement>("button")!.focus();
    await pressTab();
    expect(document.activeElement?.textContent).toBe("Save 2");
    // Slides 3 and 4 are skipped, and so is Previous, which is disabled.
    await pressTab();
    expect(document.activeElement).toBe(screen.button("Next slide"));
  });

  it("moves focus out of a slide that leaves the view, so focus is not lost", async () => {
    const screen = await render(
      <Carousel label="Recipe photos">
        {[1, 2, 3].map((n) => (
          <div key={n}>
            <button>Save {n}</button>
          </div>
        ))}
      </Carousel>,
    );
    screen.host.querySelector<HTMLButtonElement>("button")!.focus();
    // The arrow key scrolls the viewport, the focused button's scroll container.
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => screen.slides[0]!.inert).toBe(true);
    expect(document.activeElement).toBe(screen.viewport);
  });
});

describe("Carousel navigation", () => {
  it("moves one slide per press and disables the buttons at the ends", async () => {
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
        {photos(3)}
      </Carousel>,
    );
    const previous = screen.button("Previous slide");
    const next = screen.button("Next slide");
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    await userEvent.click(next);
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[1]]);
    expect(slideAtStart(screen.viewport, screen.slides)).toBe(1);
    await expect.poll(() => previous.disabled).toBe(false);
    await userEvent.click(next);
    await expect.poll(() => onIndexChange.mock.calls.length).toBe(2);
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
    expect(slideAtStart(screen.viewport, screen.slides)).toBe(2);
    await expect.poll(() => next.disabled).toBe(true);
    await userEvent.click(previous);
    await expect.poll(() => onIndexChange).toHaveBeenLastCalledWith(1);
  });

  it("hides the buttons when every slide is in view", async () => {
    const shown = (screen: Awaited<ReturnType<typeof render>>) => [screen.button("Previous slide"), screen.button("Next slide")].map((button) => button.getClientRects().length > 0);
    const screen = await render(<Carousel label="Recipe photos">{photos(1)}</Carousel>);
    expect(shown(screen)).toEqual([false, false]);
    await screen.rerender(<Carousel label="Recipe photos">{photos(2)}</Carousel>);
    expect(shown(screen)).toEqual([true, true]);
    await screen.rerender(
      <Carousel label="Recipe photos" slidesPerView={3}>
        {photos(3)}
      </Carousel>,
    );
    expect(shown(screen)).toEqual([false, false]);
    await screen.rerender(
      <Carousel label="Recipe photos" slidesPerView={3}>
        {photos(4)}
      </Carousel>,
    );
    expect(shown(screen)).toEqual([true, true]);
  });

  it("moves one slide per press when presses come faster than the scroll settles", async () => {
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
        {photos()}
      </Carousel>,
    );
    const next = screen.button("Next slide");
    // Two presses in one task: no scroll event, so nothing has settled in between.
    next.click();
    next.click();
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[2]]);
    expect(slideAtStart(screen.viewport, screen.slides)).toBe(2);
  });

  it("moves focus to Previous when Next reaches the end, so focus is not lost", async () => {
    const screen = await render(<Carousel label="Recipe photos">{photos(2)}</Carousel>);
    const next = screen.button("Next slide");
    // The click focuses Next; once the scroll settles on the last slide, Next is disabled
    // and focus is on Previous (it may already be by the time the click resolves).
    await userEvent.click(next);
    await expect.poll(() => next.disabled).toBe(true);
    await expect.poll(() => document.activeElement).toBe(screen.button("Previous slide"));
  });

  it("moves focus to Next when Previous reaches the start, so focus is not lost", async () => {
    const screen = await render(<Carousel label="Recipe photos">{photos(3)}</Carousel>);
    const previous = screen.button("Previous slide");
    await userEvent.click(screen.button("Next slide"));
    await expect.poll(() => previous.disabled).toBe(false);
    await userEvent.click(previous);
    await expect.poll(() => previous.disabled).toBe(true);
    await expect.poll(() => document.activeElement).toBe(screen.button("Next slide"));
  });

  it("moves focus to the carousel when both buttons become disabled", async () => {
    const screen = await render(<Carousel label="Recipe photos">{photos(3)}</Carousel>);
    screen.button("Next slide").focus();
    await screen.rerender(<Carousel label="Recipe photos">{photos(1)}</Carousel>);
    expect(screen.button("Next slide").disabled).toBe(true);
    expect(screen.button("Previous slide").disabled).toBe(true);
    expect(document.activeElement).toBe(screen.carousel);
  });

  it("leaves focus alone when the app has moved it elsewhere", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    mounted.push(outside);
    // The app moves focus when the position changes, before Next is disabled.
    const screen = await render(
      <Carousel label="Recipe photos" onIndexChange={() => outside.focus()}>
        {photos(2)}
      </Carousel>,
    );
    await userEvent.click(screen.button("Next slide"));
    await expect.poll(() => screen.button("Next slide").disabled).toBe(true);
    expect(document.activeElement).toBe(outside);
  });

  it("wraps around at both ends with loop, and never disables a button", async () => {
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" loop onIndexChange={onIndexChange}>
        {photos(3)}
      </Carousel>,
    );
    const previous = screen.button("Previous slide");
    expect(previous.disabled).toBe(false);
    await userEvent.click(previous);
    await expect.poll(() => onIndexChange).toHaveBeenLastCalledWith(2);
    expect(slideAtStart(screen.viewport, screen.slides)).toBe(2);
    expect(screen.button("Next slide").disabled).toBe(false);
    await userEvent.click(screen.button("Next slide"));
    await expect.poll(() => onIndexChange).toHaveBeenLastCalledWith(0);
    expect(slideAtStart(screen.viewport, screen.slides)).toBe(0);
  });

  it("stops at the last full view with several slides per view", async () => {
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" slidesPerView={2} loop onIndexChange={onIndexChange}>
        {photos(3)}
      </Carousel>,
    );
    await userEvent.click(screen.button("Next slide"));
    await expect.poll(() => onIndexChange).toHaveBeenLastCalledWith(1);
    // Index 1 is the last view (slides 2 and 3), so Next wraps to the start.
    await userEvent.click(screen.button("Next slide"));
    await expect.poll(() => onIndexChange).toHaveBeenLastCalledWith(0);
  });

  it("starts at defaultIndex without announcing it", async () => {
    const onIndexChange = vi.fn();
    const record = recordAnnouncements("Start");
    const screen = await render(
      <Carousel label="Recipe photos" defaultIndex={2} onIndexChange={onIndexChange} slideLabel="Start {n} of {total}">
        {photos()}
      </Carousel>,
    );
    expect(slideAtStart(screen.viewport, screen.slides)).toBe(2);
    expect(screen.button("Previous slide").disabled).toBe(false);
    // The first change reported is the user's, not the starting position.
    await userEvent.click(screen.button("Next slide"));
    await expect.poll(() => record.texts).toEqual(["Start 4 of 5"]);
    record.stop();
    expect(onIndexChange.mock.calls).toEqual([[3]]);
  });

  it("reports the slide a press is moving to at once, and null when the scroll settles", async () => {
    const onIndexChange = vi.fn();
    const onTargetChange = vi.fn();
    const record = recordAnnouncements("Target");
    const screen = await render(
      <Carousel label="Recipe photos" onIndexChange={onIndexChange} onTargetChange={onTargetChange} slideLabel="Target {n} of {total}">
        {photos(3)}
      </Carousel>,
    );
    // Hold the scroll the press asks for, so it is still on its way.
    const scrollTo = screen.viewport.scrollTo.bind(screen.viewport);
    let held: ScrollToOptions | undefined;
    screen.viewport.scrollTo = ((options: ScrollToOptions) => {
      held = options;
    }) as typeof screen.viewport.scrollTo;
    await userEvent.click(screen.button("Next slide"));
    expect(onTargetChange.mock.calls).toEqual([[1]]);
    expect(held).toBeDefined();
    expect(onIndexChange).not.toHaveBeenCalled();
    expect(record.texts).toEqual([]);
    // Where it settles is reported and announced as before, and the target is done.
    screen.viewport.scrollTo = scrollTo;
    screen.viewport.scrollTo(held!);
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[1]]);
    await expect.poll(() => record.texts).toEqual(["Target 2 of 3"]);
    expect(onTargetChange).toHaveBeenLastCalledWith(null);
    record.stop();
  });

  it("follows the reading direction in a right-to-left page", async () => {
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
        {photos(3)}
      </Carousel>,
      { dir: "rtl" },
    );
    await userEvent.click(screen.button("Next slide"));
    await expect.poll(() => onIndexChange).toHaveBeenLastCalledWith(1);
    expect(slideAtStart(screen.viewport, screen.slides, true)).toBe(1);
    expect(screen.viewport.scrollLeft).toBeLessThan(0);
  });

  it("updates its position when the user scrolls the slides themselves", async () => {
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
        {photos()}
      </Carousel>,
    );
    screen.viewport.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.poll(() => onIndexChange).toHaveBeenLastCalledWith(1);
    screen.viewport.scrollTo({ left: screen.slides[3]!.offsetLeft - screen.viewport.offsetLeft, behavior: "instant" });
    await expect.poll(() => onIndexChange).toHaveBeenLastCalledWith(3);
  });
});

describe("Carousel driven by the app", () => {
  it("starts at index, moves when index changes and announces it, and reports the user's own moves", async () => {
    const onIndexChange = vi.fn();
    const onTargetChange = vi.fn();
    const record = recordAnnouncements("Drive");
    const at = (index: number) => (
      <Carousel label="Overview" index={index} onIndexChange={onIndexChange} onTargetChange={onTargetChange} slideLabel="Drive {n} of {total}">
        {photos()}
      </Carousel>
    );
    const screen = await render(at(2));
    expect(slideAtStart(screen.viewport, screen.slides)).toBe(2);
    await screen.rerender(at(4));
    await expect.poll(() => slideAtStart(screen.viewport, screen.slides)).toBe(4);
    await expect.poll(() => record.texts).toEqual(["Drive 5 of 5"]);
    expect(screen.slides[4]!.inert).toBe(false);
    expect(onIndexChange).not.toHaveBeenCalled();
    await userEvent.click(screen.button("Previous slide"));
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[3]]);
    // The app follows the user's move; the carousel is already there, so nothing moves or waits.
    await screen.rerender(at(3));
    await expect.poll(() => onTargetChange.mock.calls.at(-1)).toEqual([null]);
    expect(slideAtStart(screen.viewport, screen.slides)).toBe(3);
    expect(warn).not.toHaveBeenCalled();
    record.stop();
  });

  it("moves to the app's index smoothly when motion is allowed", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    const at = (index: number) => (
      <Carousel label="Overview" index={index}>
        {photos()}
      </Carousel>
    );
    const screen = await render(at(0));
    const scrollTo = vi.spyOn(screen.viewport, "scrollTo");
    await screen.rerender(at(2));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("shows a pager of links, one per position, with the one in view marked current", async () => {
    const at = (index: number) => (
      <Carousel label="Overview" index={index} slidesPerView={2} pagerHref={(position) => `#slide-${position + 1}`}>
        {photos()}
      </Carousel>
    );
    const screen = await render(at(1));
    const pager = screen.host.querySelector("nav")!;
    expect(pager.getAttribute("aria-label")).toBe("Slides");
    const pages = () => [...pager.querySelectorAll("a")];
    expect(pages().map((page) => page.getAttribute("href"))).toEqual(["#slide-1", "#slide-2", "#slide-3", "#slide-4"]);
    expect(pages().map((page) => page.textContent)).toEqual(["Slide 1 of 5", "Slide 2 of 5", "Slide 3 of 5", "Slide 4 of 5"]);
    expect(pages().map((page) => page.getAttribute("aria-current"))).toEqual([null, "true", null, null]);
    const dot = (page: Element) => getComputedStyle(page, "::after");
    expect(dot(pages()[1]!).width).not.toBe(dot(pages()[0]!).width);
    expect(dot(pages()[1]!).backgroundColor).not.toBe(dot(pages()[0]!).backgroundColor);
    await screen.rerender(at(3));
    expect(pages().map((page) => page.getAttribute("aria-current"))).toEqual([null, null, null, "true"]);
  });

  it("follows the address when a pager link is followed, and when the address goes back", async () => {
    const subscribe = (change: () => void) => {
      window.addEventListener("hashchange", change);
      return () => window.removeEventListener("hashchange", change);
    };
    function Deck() {
      const hash = useSyncExternalStore(subscribe, () => location.hash);
      const index = Math.max(0, Number(hash.replace("#slide-", "")) - 1 || 0);
      return (
        <Carousel label="Overview" index={index} pagerHref={(position) => `#slide-${position + 1}`}>
          {photos()}
        </Carousel>
      );
    }
    const start = location.href;
    try {
      const screen = await render(<Deck />);
      screen.host.querySelector<HTMLAnchorElement>('a[href="#slide-3"]')!.click();
      await expect.poll(() => slideAtStart(screen.viewport, screen.slides)).toBe(2);
      expect(screen.host.querySelector('a[href="#slide-3"]')!.getAttribute("aria-current")).toBe("true");
      history.back();
      await expect.poll(() => slideAtStart(screen.viewport, screen.slides)).toBe(0);
    } finally {
      history.replaceState(null, "", start);
    }
  });

  it("renders no pager without pagerHref", async () => {
    const screen = await render(<Carousel label="Overview">{photos()}</Carousel>);
    expect(screen.host.querySelector("nav")).toBeNull();
  });
});

describe("Carousel's outside-jump event", () => {
  /** The jump Lightbox's Home and End dispatch, further than a button steps. */
  const goto = (viewport: HTMLElement, detail: { index: number; left: number; behavior: ScrollBehavior }) =>
    viewport.dispatchEvent(new CustomEvent("ouro-carousel-goto", { detail }));

  it("heading-tracks a jump dispatched on the viewport like a button press: reports the target at once, scrolls there and settles on it", async () => {
    const onIndexChange = vi.fn();
    const onTargetChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" onIndexChange={onIndexChange} onTargetChange={onTargetChange}>
        {photos()}
      </Carousel>,
    );
    const scrollTo = vi.spyOn(screen.viewport, "scrollTo");
    const left = screen.slides[3]!.offsetLeft - screen.slides[0]!.offsetLeft;
    goto(screen.viewport, { index: 3, left, behavior: "instant" });
    expect(onTargetChange).toHaveBeenLastCalledWith(3);
    expect(scrollTo).toHaveBeenCalledWith({ left, behavior: "instant" });
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[3]]);
  });

  it("still scrolls and settles when the app does not ask to be told the target", async () => {
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
        {photos()}
      </Carousel>,
    );
    const scrollTo = vi.spyOn(screen.viewport, "scrollTo");
    const left = screen.slides[2]!.offsetLeft - screen.slides[0]!.offsetLeft;
    goto(screen.viewport, { index: 2, left, behavior: "instant" });
    expect(scrollTo).toHaveBeenCalledWith({ left, behavior: "instant" });
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[2]]);
  });

  it("stops listening for the jump once unmounted", async () => {
    const onTargetChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" onTargetChange={onTargetChange}>
        {photos()}
      </Carousel>,
    );
    const viewport = screen.viewport;
    await act(async () => roots.at(-1)!.unmount());
    goto(viewport, { index: 1, left: 100, behavior: "instant" });
    expect(onTargetChange).not.toHaveBeenCalled();
  });
});

describe("Carousel inside a scaled element", () => {
  it("starts on defaultIndex when it mounts under a transform, as a Lightbox viewer does while it opens", async () => {
    const { viewport, slides } = await render(
      <div style={{ transform: "scale(0.9)", transformOrigin: "0 0" }}>
        <Carousel label="Photos" defaultIndex={6}>
          {photos(8)}
        </Carousel>
      </div>,
    );
    expect(slideAtStart(viewport, slides)).toBe(6);
  });

  it("starts on defaultIndex wherever it sits on the page", async () => {
    const { viewport, slides } = await render(
      <div style={{ marginLeft: 200 }}>
        <Carousel label="Photos" defaultIndex={2}>
          {photos(5)}
        </Carousel>
      </div>,
    );
    expect(slideAtStart(viewport, slides)).toBe(2);
  });

  it("does not scroll to NaN from a viewport with no layout, as when it mounts hidden", async () => {
    const scrollTo = vi.spyOn(Element.prototype, "scrollTo");
    const { viewport } = await render(
      <div style={{ display: "none" }}>
        <Carousel label="Photos" defaultIndex={2}>
          {photos(4)}
        </Carousel>
      </div>,
    );
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: "instant" });
    expect(viewport.scrollLeft).toBe(0);
  });
});

describe("Carousel announcements", () => {
  it("announces the new position politely, once per change", async () => {
    const record = recordAnnouncements("Photo");
    const screen = await render(
      <Carousel label="Recipe photos" slideLabel="Photo {n} of {total}">
        {photos()}
      </Carousel>,
    );
    await userEvent.click(screen.button("Next slide"));
    await expect.poll(() => record.texts).toEqual(["Photo 2 of 5"]);
    const region = document.querySelector("[data-ouro-announcer]")!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    await userEvent.click(screen.button("Next slide"));
    await expect.poll(() => record.texts).toEqual(["Photo 2 of 5", "Photo 3 of 5"]);
    // Going back is one more announcement, with nothing repeated in between.
    await userEvent.click(screen.button("Previous slide"));
    await expect.poll(() => record.texts).toEqual(["Photo 2 of 5", "Photo 3 of 5", "Photo 2 of 5"]);
    record.stop();
  });

  it("announces with the slideLabel template", async () => {
    const record = recordAnnouncements("Foto");
    const screen = await render(
      <Carousel label="Fotos" nextLabel="Siguiente" slideLabel="Foto {n} de {total}">
        {photos(2)}
      </Carousel>,
    );
    await userEvent.click(screen.button("Siguiente"));
    await expect.poll(() => record.texts).toEqual(["Foto 2 de 2"]);
    record.stop();
  });
});

describe("Carousel settling", () => {
  /** Runs `body` as in a browser without the `scrollend` event, such as older Safari. */
  async function withoutScrollEnd(body: () => Promise<void>) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "onscrollend");
    if (descriptor) delete (HTMLElement.prototype as { onscrollend?: unknown }).onscrollend;
    try {
      await body();
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "onscrollend", descriptor);
    }
  }
  const touch = (target: Element, type: string, touches = 0) =>
    target.dispatchEvent(Object.assign(new Event(type), { touches: { length: touches } }));

  it("settles after a pause without scrollend, but never while a finger is down", async () => {
    await withoutScrollEnd(async () => {
      const onIndexChange = vi.fn();
      const screen = await render(
        <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
          {photos()}
        </Carousel>,
      );
      const to = (slide: number) =>
        screen.viewport.scrollTo({ left: screen.slides[slide]!.offsetLeft - screen.slides[0]!.offsetLeft, behavior: "instant" });
      // No finger: a pause after scrolling settles.
      to(1);
      await expect.poll(() => onIndexChange.mock.calls).toEqual([[1]]);
      // A finger down: scrolling stops, but nothing settles until every finger is lifted.
      touch(screen.viewport, "touchstart", 1);
      to(2);
      touch(screen.viewport, "touchstart", 2);
      touch(screen.viewport, "touchend", 1);
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(onIndexChange.mock.calls).toEqual([[1]]);
      touch(screen.viewport, "touchend", 0);
      await expect.poll(() => onIndexChange.mock.calls).toEqual([[1], [2]]);
      touch(screen.viewport, "touchstart", 1);
      to(3);
      touch(screen.viewport, "touchcancel", 0);
      await expect.poll(() => onIndexChange.mock.calls).toEqual([[1], [2], [3]]);
    });
  });

  it("cancels a check that is waiting on its frames when a finger comes down", async () => {
    await withoutScrollEnd(async () => {
      const onIndexChange = vi.fn();
      const screen = await render(
        <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
          {photos()}
        </Carousel>,
      );
      // Frames that never run, so the check after the pause starts and cannot finish. Without
      // this the finger would have to land inside a two-frame window, which a test cannot time.
      const frames = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(7);
      const cancel = vi.spyOn(window, "cancelAnimationFrame");
      screen.viewport.scrollTo({ left: screen.slides[1]!.offsetLeft - screen.slides[0]!.offsetLeft, behavior: "instant" });
      await expect.poll(() => frames.mock.calls.length).toBeGreaterThan(0);
      touch(screen.viewport, "touchstart", 1);
      expect(cancel).toHaveBeenCalledWith(7);
      expect(onIndexChange).not.toHaveBeenCalled();
      frames.mockRestore();
      cancel.mockRestore();
      // The finger lifts: the pause starts again and the scroll settles.
      touch(screen.viewport, "touchend", 0);
      await expect.poll(() => onIndexChange.mock.calls).toEqual([[1]]);
    });
  });
});

describe("Carousel settling without scrollend", () => {
  it("announces once when the page stalls mid-scroll, after the scroll reaches its slide", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "onscrollend");
    if (descriptor) delete (HTMLElement.prototype as { onscrollend?: unknown }).onscrollend;
    const record = recordAnnouncements("Stalled");
    try {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
      const onIndexChange = vi.fn();
      const screen = await render(
        <Carousel label="Recipe photos" slideLabel="Stalled {n} of {total}" onIndexChange={onIndexChange}>
          {photos()}
        </Carousel>,
      );
      const starts = screen.slides.map((slide) => slide.offsetLeft - screen.slides[0]!.offsetLeft);
      // The page's main thread stalls for longer than the pause that stands in for scrollend,
      // once, while the scroll to the third slide is passing the second.
      let stalled = false;
      const stall = () => {
        if (stalled || screen.viewport.scrollLeft < starts[1]! * 0.9) return;
        stalled = true;
        const until = performance.now() + 400;
        while (performance.now() < until);
      };
      screen.viewport.addEventListener("scroll", stall);
      const midScroll = pressMidScroll(screen.viewport, screen.button("Next slide"));
      await userEvent.click(screen.button("Next slide"));
      await midScroll;
      await expect.poll(() => onIndexChange.mock.calls).toEqual([[2]]);
      expect(stalled).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(onIndexChange.mock.calls).toEqual([[2]]);
      expect(record.texts).toEqual(["Stalled 3 of 5"]);
    } finally {
      record.stop();
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "onscrollend", descriptor);
    }
  });
});

describe("Carousel settling without scrollend, late scroll events", () => {
  it("keeps waiting while the position still moves, though its scroll events arrive late", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "onscrollend");
    if (descriptor) delete (HTMLElement.prototype as { onscrollend?: unknown }).onscrollend;
    try {
      const onIndexChange = vi.fn();
      const screen = await render(
        <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
          {photos()}
        </Carousel>,
      );
      const starts = screen.slides.map((slide) => slide.offsetLeft - screen.slides[0]!.offsetLeft);
      // A busy page: the scroll moves every frame for 600ms, but after the first scroll event
      // the carousel sees none until the end, so its pause runs out while the scroll is
      // passing the second slide. Snapping is off so the scroll can stop between slides.
      screen.viewport.style.scrollSnapType = "none";
      let seen = 0;
      let swallow = true;
      const late = (event: Event) => {
        if (swallow && seen++ > 0) event.stopPropagation();
      };
      screen.host.addEventListener("scroll", late, true);
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const step = () => {
          const t = Math.min(1, (performance.now() - start) / 600);
          screen.viewport.scrollTo({ left: starts[2]! * t, behavior: "instant" });
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        step();
      });
      swallow = false;
      screen.viewport.dispatchEvent(new Event("scroll"));
      await expect.poll(() => onIndexChange.mock.calls).toEqual([[2]]);
      screen.host.removeEventListener("scroll", late, true);
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "onscrollend", descriptor);
    }
  });
});

describe("Carousel settling without scrollend, interrupted", () => {
  it("settles where the scroll stops when the user scrolls elsewhere before a press's slide", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "onscrollend");
    if (descriptor) delete (HTMLElement.prototype as { onscrollend?: unknown }).onscrollend;
    try {
      await commands.emulateMedia({ reducedMotion: "no-preference" });
      const onIndexChange = vi.fn();
      const screen = await render(
        <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
          {photos()}
        </Carousel>,
      );
      const starts = screen.slides.map((slide) => slide.offsetLeft - screen.slides[0]!.offsetLeft);
      // Next heads for the second slide; mid-scroll, the user jumps to the fourth.
      const jumped = new Promise<void>((resolve) => {
        const onScroll = () => {
          screen.viewport.removeEventListener("scroll", onScroll);
          screen.viewport.scrollTo({ left: starts[3]!, behavior: "instant" });
          resolve();
        };
        screen.viewport.addEventListener("scroll", onScroll);
      });
      await userEvent.click(screen.button("Next slide"));
      await jumped;
      await expect.poll(() => onIndexChange.mock.calls).toEqual([[3]]);
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "onscrollend", descriptor);
    }
  });
});

describe("Carousel settling without scrollend, retargeted", () => {
  it("settles where a later press is heading, not a reading a stale schedule from an earlier press catches mid-wait", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "onscrollend");
    if (descriptor) delete (HTMLElement.prototype as { onscrollend?: unknown }).onscrollend;
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
        {photos()}
      </Carousel>,
    );
    const { viewport, slides } = screen;
    const rect = viewport.getBoundingClientRect();
    const atSlide = (index: number) => DOMRect.fromRect({ ...rect.toJSON(), x: rect.x + (slides[index]!.getBoundingClientRect().left - rect.left) });
    // Frozen so only the mocked slide position below decides what each check sees; a press's
    // own scroll never actually moves it, so the "is it still moving" half of a check always
    // reads stable, leaving only the "does it match the heading" half to exercise.
    const scrollTo = vi.spyOn(viewport, "scrollTo").mockImplementation(() => {});
    const nearest = vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(atSlide(0));
    // Runs a check's two nested frames in the same tick as the fake timer that starts it, so a
    // stale schedule's reading is fixed by the mock in place when it fires, not by a later one.
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // Next heads for the second slide; its own scrollend is missing, so a pause stands in,
      // scheduled from the scroll event its (mocked) scroll still fires.
      await userEvent.click(screen.button("Next slide"));
      viewport.dispatchEvent(new Event("scroll"));
      // Next again, 50ms later, retargets to the third slide. A schedule left over from the
      // first press must not be the one a check judges this one against.
      await vi.advanceTimersByTimeAsync(50);
      await userEvent.click(screen.button("Next slide"));
      // At the first press's original 150ms mark the scroll has reached only the second slide,
      // consistent with either press; a check reading this must not drop the pending heading.
      nearest.mockReturnValue(atSlide(1));
      await vi.advanceTimersByTimeAsync(100);
      // By the second press's own 150ms mark the scroll has genuinely reached the third slide.
      nearest.mockReturnValue(atSlide(2));
      await vi.advanceTimersByTimeAsync(50);
      // A reading that belongs to neither press, were the heading already dropped, letting a
      // stale, re-armed check settle there instead of where the second press is heading. (Not
      // the start slide: settle() reports nothing when a reading matches where it began.)
      nearest.mockReturnValue(atSlide(3));
      await vi.advanceTimersByTimeAsync(200);
      expect(onIndexChange.mock.calls).toEqual([[2]]);
    } finally {
      vi.useRealTimers();
      raf.mockRestore();
      nearest.mockRestore();
      scrollTo.mockRestore();
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "onscrollend", descriptor);
    }
  });

  it("announces the app's own later index change, not a reading a stale schedule from an earlier one catches mid-wait", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "onscrollend");
    if (descriptor) delete (HTMLElement.prototype as { onscrollend?: unknown }).onscrollend;
    const record = recordAnnouncements("Slide");
    const at = (index: number) => (
      <Carousel label="Recipe photos" index={index}>
        {photos()}
      </Carousel>
    );
    const screen = await render(at(0));
    const { viewport, slides } = screen;
    const rect = viewport.getBoundingClientRect();
    const atSlide = (index: number) => DOMRect.fromRect({ ...rect.toJSON(), x: rect.x + (slides[index]!.getBoundingClientRect().left - rect.left) });
    const scrollTo = vi.spyOn(viewport, "scrollTo").mockImplementation(() => {});
    const nearest = vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(atSlide(0));
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // The app first heads for the second slide; its own scrollend is missing, so a pause
      // stands in, scheduled from the scroll event its (mocked) scroll still fires.
      await screen.rerender(at(1));
      viewport.dispatchEvent(new Event("scroll"));
      // The app retargets to the third slide 50ms later. A schedule left over from the first
      // index change must not be the one a check judges this one against.
      await vi.advanceTimersByTimeAsync(50);
      await screen.rerender(at(2));
      // At the first change's original 150ms mark the scroll has reached only the second
      // slide, consistent with either change; a check reading this must not drop the heading.
      nearest.mockReturnValue(atSlide(1));
      await vi.advanceTimersByTimeAsync(100);
      // By the second change's own 150ms mark the scroll has genuinely reached the third slide.
      nearest.mockReturnValue(atSlide(2));
      await vi.advanceTimersByTimeAsync(50);
      // A reading that belongs to neither change, were the heading already dropped, letting a
      // stale, re-armed check settle there instead of where the app's later index is heading.
      // (A screen reader hears whichever slide settle() announces, so this is the user-facing
      // signal the bug gets wrong: suppressing onIndexChange here, since next equals the app's
      // own controlled index, would hide it.)
      nearest.mockReturnValue(atSlide(3));
      await vi.advanceTimersByTimeAsync(200);
      expect(record.texts).toEqual(["Slide 3 of 5"]);
    } finally {
      vi.useRealTimers();
      raf.mockRestore();
      nearest.mockRestore();
      scrollTo.mockRestore();
      record.stop();
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "onscrollend", descriptor);
    }
  });
});

describe("Carousel motion", () => {
  it.each([
    { direction: "Next", loop: false, target: 1 },
    { direction: "Previous", loop: false, target: 0 },
    { direction: "Next", loop: true, target: 0 },
    { direction: "Previous", loop: true, target: 1 },
  ])("respects loop=$loop when $direction is pressed at the boundary's native scrollend", async ({ direction, loop, target }) => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    const onIndexChange = vi.fn();
    const screen = await render(<Carousel label="Recipe photos" loop={loop} onIndexChange={onIndexChange}>{photos(2)}</Carousel>);
    if (direction === "Previous") {
      await userEvent.click(screen.button("Next slide"));
      await expect.poll(() => screen.button("Previous slide").disabled).toBe(false);
      await expect.poll(() => onIndexChange.mock.calls).toEqual([[1]]);
    }
    onIndexChange.mockClear();
    const scrollTo = vi.spyOn(screen.viewport, "scrollTo");
    const button = screen.button(`${direction} slide`);
    const boundary = direction === "Next" ? 1 : 0;
    const pressed = new Promise<void>((resolve) => {
      screen.viewport.addEventListener("scrollend", () => {
        button.click();
        resolve();
      }, { once: true });
    });
    await userEvent.click(button);
    await pressed;
    expect(scrollTo).toHaveBeenCalledTimes(loop ? 2 : 1);
    await expect.poll(() => onIndexChange.mock.calls).toEqual(loop ? [[boundary], [target]] : [[boundary]]);
    expect(slideAtStart(screen.viewport, screen.slides)).toBe(target);
  });

  it("advances when pressed at scrollend before the settled index renders", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    const screen = await render(<Carousel label="Recipe photos">{photos()}</Carousel>);
    const next = new Promise<void>((resolve) => {
      screen.viewport.addEventListener("scrollend", () => {
        screen.button("Next slide").click();
        resolve();
      }, { once: true });
    });
    await userEvent.click(screen.button("Next slide"));
    await next;
    await expect.poll(() => slideAtStart(screen.viewport, screen.slides)).toBe(2);
  });

  it("jumps instantly with reduced motion", async () => {
    const screen = await render(<Carousel label="Recipe photos">{photos()}</Carousel>);
    const scrollTo = vi.spyOn(screen.viewport, "scrollTo");
    await userEvent.click(screen.button("Next slide"));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "instant" }));
  });

  it("follows OuroProvider's motion over the device: reduced jumps, full scrolls smoothly", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    const still = await render(
      <OuroProvider motion="reduced">
        <Carousel label="Recipe photos">{photos()}</Carousel>
      </OuroProvider>,
    );
    const stillScroll = vi.spyOn(still.viewport, "scrollTo");
    await userEvent.click(still.button("Next slide"));
    expect(stillScroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: "instant" }));
    await commands.emulateMedia({ reducedMotion: "reduce" });
    const moving = await render(
      <OuroProvider motion="full">
        <Carousel label="Menu photos">{photos()}</Carousel>
      </OuroProvider>,
    );
    const movingScroll = vi.spyOn(moving.viewport, "scrollTo");
    await userEvent.click(moving.button("Next slide"));
    expect(movingScroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("scrolls smoothly when motion is allowed", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
        {photos()}
      </Carousel>,
    );
    const scrollTo = vi.spyOn(screen.viewport, "scrollTo");
    // Where each slide starts in the scroller's content, before anything moves.
    const starts = screen.slides.map((slide) => slide.offsetLeft - screen.slides[0]!.offsetLeft);
    await userEvent.click(screen.button("Next slide"));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    expect((scrollTo.mock.calls[0]![0] as ScrollToOptions).left).toBeCloseTo(starts[1]!, 0);
    // Pressing again goes on from the slide it is heading to.
    await userEvent.click(screen.button("Next slide"));
    expect((scrollTo.mock.calls[1]![0] as ScrollToOptions).left).toBeCloseTo(starts[2]!, 0);
  });

  it("announces once per change while scrolling smoothly, with presses mid-scroll and a loop wrap", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    const record = recordAnnouncements("Smooth");
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" loop slideLabel="Smooth {n} of {total}" onIndexChange={onIndexChange}>
        {photos()}
      </Carousel>,
    );
    // Two presses before the first scroll ends: one change, to slide 3.
    let midScroll = pressMidScroll(screen.viewport, screen.button("Next slide"));
    await userEvent.click(screen.button("Next slide"));
    await midScroll;
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[2]]);
    // Three presses back wrap past the first slide to the last.
    midScroll = pressMidScroll(screen.viewport, screen.button("Previous slide"), 2);
    await userEvent.click(screen.button("Previous slide"));
    await midScroll;
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[2], [4]]);
    // Nothing more arrives once the scroll is over.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(onIndexChange.mock.calls).toEqual([[2], [4]]);
    expect(record.texts).toEqual(["Smooth 3 of 5", "Smooth 5 of 5"]);
    record.stop();
  });

  it("ignores a scrollend the browser fires early, while the press it belongs to is still moving", async () => {
    await commands.emulateMedia({ reducedMotion: "no-preference" });
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" slideLabel="Early {n} of {total}" onIndexChange={onIndexChange}>
        {photos()}
      </Carousel>,
    );
    await userEvent.click(screen.button("Next slide"));
    // A browser (WebKit) can dispatch scrollend for a scroll the press interrupted, at a slide
    // the press is not heading to. Here that scrollend reports the third slide at the start
    // edge while the press is still on its way to the second: it must settle on neither.
    const { viewport, slides } = screen;
    const rect = viewport.getBoundingClientRect();
    const shift = slides[2]!.getBoundingClientRect().left - rect.left;
    const moved = vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ ...rect.toJSON(), x: rect.x + shift }));
    viewport.dispatchEvent(new Event("scrollend"));
    moved.mockRestore();
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[1]]);
    expect(onIndexChange).toHaveBeenCalledTimes(1);
  });

  it("settles at once on a scrollend at the slide a press is heading to, without waiting out a pause", async () => {
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" slideLabel="Prompt {n} of {total}" onIndexChange={onIndexChange}>
        {photos()}
      </Carousel>,
    );
    // The pause that stands in for scrollend runs on a timer; with the timers held, only the
    // scrollend itself can settle the press. Frames still run, so the instant scroll ends.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await userEvent.click(screen.button("Next slide"));
      for (let frame = 0; frame < 60 && onIndexChange.mock.calls.length === 0; frame++) await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(onIndexChange.mock.calls).toEqual([[1]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("settles at once on a scrollend with no press pending, as after a swipe, without waiting out a pause", async () => {
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" slideLabel="Swiped {n} of {total}" onIndexChange={onIndexChange}>
        {photos()}
      </Carousel>,
    );
    const { viewport, slides } = screen;
    // With the timers held, only the scrollend of this scroll, which no button asked for, can settle it.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      viewport.scrollTo({ left: viewport.scrollLeft + slides[2]!.getBoundingClientRect().left - viewport.getBoundingClientRect().left, behavior: "instant" });
      for (let frame = 0; frame < 60 && onIndexChange.mock.calls.length === 0; frame++) await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(onIndexChange.mock.calls).toEqual([[2]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a stray scrollend fired after the carousel has already settled, with no press pending", async () => {
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" slideLabel="Stray {n} of {total}" onIndexChange={onIndexChange}>
        {photos()}
      </Carousel>,
    );
    await userEvent.click(screen.button("Next slide"));
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[1]]);
    // A browser can fire scrollend again after the carousel has already settled: a late
    // notice for a position it no longer holds. Here it reports the third slide at the start
    // edge, but that position does not actually hold a frame later, so it must settle on
    // neither — the position it momentarily reported, nor anywhere else.
    const { viewport, slides } = screen;
    const rect = viewport.getBoundingClientRect();
    const shift = slides[2]!.getBoundingClientRect().left - rect.left;
    const moved = vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ ...rect.toJSON(), x: rect.x + shift }));
    requestAnimationFrame(() => moved.mockRestore());
    viewport.dispatchEvent(new Event("scrollend"));
    for (let frame = 0; frame < 60; frame++) await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(onIndexChange.mock.calls).toEqual([[1]]);
  });

  it("stops listening for scrollend once unmounted, so a late event settles nothing", async () => {
    const onIndexChange = vi.fn();
    const screen = await render(
      <Carousel label="Recipe photos" onIndexChange={onIndexChange}>
        {photos()}
      </Carousel>,
    );
    const { viewport } = screen;
    await userEvent.click(screen.button("Next slide"));
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[1]]);
    await act(async () => roots.pop()!.unmount());
    // A scrollend reaching the viewport after unmount must find no listener left behind.
    viewport.dispatchEvent(new Event("scrollend"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onIndexChange).toHaveBeenCalledTimes(1);
  });
});

describe("Carousel development messages", () => {
  it.each([
    ["label", { label: "" }, "label is required; it names the carousel for screen readers", '<Carousel label="Recipe photos">'],
    ["slidesPerView", { slidesPerView: 4 }, "slidesPerView={4} is not supported; use 1, 2, 3", "<Carousel slidesPerView={3}>"],
    ["defaultIndex", { defaultIndex: 9 }, "defaultIndex={9} is past the last slide (4)", "<Carousel defaultIndex={4}>"],
    ["index", { index: 7 }, "index={7} is past the last slide (4)", "<Carousel index={4}>"],
    ["opts", { opts: { loop: true } }, "opts is not a prop", "<Carousel loop>"],
    ["setApi", { setApi: () => {} }, "setApi is not a prop", "<Carousel onIndexChange={setIndex}>"],
    ["plugins", { plugins: [] }, "plugins is not a prop; Carousel never moves on its own", '<Carousel label="Recipe photos">'],
    ["autoplay", { autoplay: true }, "autoplay is not a prop; Carousel never moves on its own", '<Carousel label="Recipe photos">'],
    ["orientation", { orientation: "vertical" }, "orientation is not a prop; Carousel scrolls horizontally", '<div className="grid gap-4">…</div>'],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    const props = { label: "Recipe photos", children: photos(), ...extra } as unknown as Parameters<typeof Carousel>[0];
    const { carousel } = await render(<Carousel {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] Carousel: ${problem}. Fix: ${fix}.`);
    for (const attribute of ["opts", "setapi", "plugins", "autoplay", "orientation"]) expect(carousel.hasAttribute(attribute)).toBe(false);
  });

  it("warns when there are no slides and disables both buttons", async () => {
    const screen = await render(<Carousel label="Recipe photos">{[]}</Carousel>);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] Carousel: there are no slides. Fix: <Carousel label="Recipe photos">{photos.map((photo) => <img key={photo.id} src={photo.src} alt={photo.alt} />)}</Carousel>.');
    expect(screen.button("Previous slide").disabled).toBe(true);
    expect(screen.button("Next slide").disabled).toBe(true);
  });

  it("renders one slide per view for an unknown slidesPerView and clamps defaultIndex", async () => {
    const props = { label: "Recipe photos", slidesPerView: 5, defaultIndex: 9, children: photos() } as unknown as Parameters<typeof Carousel>[0];
    const screen = await render(<Carousel {...props} />);
    expect(screen.slides[0]!.getBoundingClientRect().width).toBe(screen.viewport.clientWidth);
    expect(slideAtStart(screen.viewport, screen.slides)).toBe(4);
  });

  it.each([
    ["bg-muted", 'remove "bg-muted"; style the slides you pass in'],
    ["w-96", ""],
  ])("checks the className %s", async (className, fix) => {
    await render(
      <Carousel label="Recipe photos" className={className}>
        {photos()}
      </Carousel>,
    );
    if (fix) {
      expect(warn).toHaveBeenCalledWith(`[ouro-ui] Carousel: "${className}" sets appearance, and className is for layout only. Fix: ${fix}.`);
    } else {
      expect(warn).not.toHaveBeenCalled();
    }
  });

  it("renders to a string with its slides and labels, without warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<Carousel label="Recipe photos">{photos(2)}</Carousel>);
    expect(html).toContain('data-ouro="carousel"');
    expect(html).toContain('aria-label="Slide 2 of 2"');
    expect(html).toContain('aria-label="Next slide"');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
