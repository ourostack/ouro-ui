import type { ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { MediaTile, type MediaTileProps } from "@/registry/ouro/components/ouro/media-tile/media-tile";
import { mediaTileAx } from "@/registry/ouro/components/ouro/media-tile/media-tile-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { holdFrames } from "@/registry/ouro/lib/ouro/testing/frames";
import { expectMotion, expectNoMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";
import { pageCss } from "@/registry/ouro/lib/ouro/testing/page-css";

const roots: Root[] = [];
let mounted: Element[] = [];

/** A made-up camera picture: a gradient, never a real photo. */
function Camera() {
  return <canvas data-test-camera="" width={160} height={90} style={{ background: "linear-gradient(135deg, #3b6, #258)" }} />;
}

async function render(node: ReactNode, width = 320) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get tile() {
      return host.querySelector<HTMLElement>('[data-ouro="media-tile"]')!;
    },
    get ring() {
      return host.querySelector<HTMLElement>('[data-ouro-part="ring"]');
    },
    get media() {
      return host.querySelector<HTMLElement>("[data-ouro-media-tile-media]")!;
    },
    get photo() {
      return host.querySelector<HTMLElement>("[data-ouro-media-tile-photo]");
    },
    get plate() {
      return host.querySelector<HTMLElement>("[data-ouro-media-tile-plate]")!;
    },
    get controls() {
      return host.querySelector<HTMLElement>("[data-ouro-media-tile-controls]");
    },
  };
}

/** The theme's colour as the page computes it for a background. */
function themeColor(variable: string): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = `var(${variable})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return value;
}

/** Resolves once the browser has delivered a resize observation for `element`, so the tile's own observer (made earlier) has run. */
function resized(element: Element): Promise<void> {
  return new Promise((resolve) => {
    const observer = new ResizeObserver(() => {
      observer.disconnect();
      resolve();
    });
    observer.observe(element);
  });
}

/** Waits for real animation frames. */
const frames = (count = 3) =>
  new Promise<void>((resolve) => {
    const next = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => next(left - 1)));
    next(count);
  });

/** Pretends the page is hidden or shown, as the browser does when the window is minimised or another tab is in front. */
function setPage(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

const token = (name: string) => parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name));

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  delete (document as { visibilityState?: unknown }).visibilityState;
  await commands.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none", contrast: "no-preference" });
});

const warnings = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

describe("MediaTile", () => {
  it("reads as one sentence: who, then what they are doing, in the order a person listens for it", async () => {
    const view = await render(
      <MediaTile name="Mara Lind" speaking handRaised>
        <Camera />
      </MediaTile>,
    );
    await expect.element(page.getByRole("group", { name: "Mara Lind, speaking, camera on, hand raised" })).toBeVisible();
    expect(view.tile.getAttribute("role")).toBe("group");
    // Nothing inside is read again: the plate, the picture and the photo are hidden from screen readers.
    expect(view.plate.getAttribute("aria-hidden")).toBe("true");
    expect(view.tile.querySelector("[data-ouro-media-tile-media]")!.getAttribute("aria-hidden")).toBe("true");
    const priya = await render(<MediaTile name="Priya Raman" muted />);
    expect(priya.tile.getAttribute("aria-label")).toBe("Priya Raman, muted, camera off");
    expect(priya.photo!.getAttribute("aria-hidden")).toBe("true");
    await view.rerender(
      <MediaTile key="theo" name="Theo Okafor" presenting speaking muted handRaised connection="poor" pinned>
        <Camera />
      </MediaTile>,
    );
    expect(view.tile.getAttribute("aria-label")).toBe("Theo Okafor, presenting, speaking, muted, camera on, hand raised, poor connection, pinned");
    await view.rerender(
      <MediaTile key="share" name="Theo Okafor" source="screen">
        <Camera />
      </MediaTile>,
    );
    expect(view.tile.getAttribute("aria-label")).toBe("Theo Okafor, shared screen");
    await view.rerender(
      <MediaTile key="jonas" name="Jonas Ek" cameraOn={false} connection="fair">
        <Camera />
      </MediaTile>,
    );
    expect(view.tile.getAttribute("aria-label")).toBe("Jonas Ek, camera off");
    expect(warnings()).toEqual([]);
  });

  it("reads in the words labels gives, and English for the rest", async () => {
    const { tile } = await render(
      <MediaTile name="Mara Lind" speaking muted pinned labels={{ speaking: "spricht", muted: "stumm" }}>
        <Camera />
      </MediaTile>,
    );
    expect(tile.getAttribute("aria-label")).toBe("Mara Lind, spricht, stumm, camera on, pinned");
    expect(tile.querySelector("[data-ouro-media-tile-muted]")!.getAttribute("title")).toBe("Stumm");
  });

  it("shows the app's media while the camera is on, and the photo while it is off or paused, keeping the media mounted", async () => {
    const { tile, media, rerender } = await render(
      <MediaTile name="Mara Lind" avatar={{ initials: "ML" }}>
        <Camera />
      </MediaTile>,
    );
    const camera = media.querySelector("[data-test-camera]")!;
    expect(getComputedStyle(media).visibility).toBe("visible");
    expect(tile.hasAttribute("data-picture")).toBe(true);
    expect(tile.querySelector("[data-ouro-media-tile-photo]")).toBeNull();
    await rerender(
      <MediaTile name="Mara Lind" avatar={{ initials: "ML" }} cameraOn={false}>
        <Camera />
      </MediaTile>,
    );
    expect(media.querySelector("[data-test-camera]")).toBe(camera);
    expect(getComputedStyle(media).visibility).toBe("hidden");
    expect(tile.hasAttribute("data-picture")).toBe(false);
    expect(tile.querySelector('[data-ouro="avatar"]')!.textContent).toBe("ML");
    expect(tile.querySelector("[data-ouro-media-tile-paused]")).toBeNull();
    await rerender(
      <MediaTile name="Mara Lind" avatar={{ initials: "ML" }} paused>
        <Camera />
      </MediaTile>,
    );
    expect(media.querySelector("[data-test-camera]")).toBe(camera);
    expect(getComputedStyle(media).visibility).toBe("hidden");
    expect(tile.getAttribute("aria-label")).toBe("Mara Lind, video paused");
    expect(tile.querySelector("[data-ouro-media-tile-paused]")!.getAttribute("title")).toBe("Video paused");
    await rerender(
      <MediaTile name="Mara Lind" avatar={{ initials: "ML" }} paused="video paused to save power">
        <Camera />
      </MediaTile>,
    );
    expect(tile.getAttribute("aria-label")).toBe("Mara Lind, video paused to save power");
    expect(tile.querySelector("[data-ouro-media-tile-paused]")!.getAttribute("title")).toBe("Video paused to save power");
    await rerender(
      <MediaTile name="Mara Lind" avatar={{ initials: "ML" }} paused={false}>
        <Camera />
      </MediaTile>,
    );
    expect(media.querySelector("[data-test-camera]")).toBe(camera);
    expect(getComputedStyle(media).visibility).toBe("visible");
    // The camera is on before its first picture arrives: the photo shows, and the sentence says so.
    await rerender(<MediaTile name="Mara Lind" cameraOn />);
    expect(tile.getAttribute("aria-label")).toBe("Mara Lind, camera on");
    expect(tile.querySelector('[data-ouro="avatar"]')).not.toBeNull();
  });

  it("crops a camera to fill the tile and never crops a share", async () => {
    const { tile, rerender } = await render(
      <MediaTile name="Mara Lind">
        <Camera />
      </MediaTile>,
    );
    const fitOf = () => getComputedStyle(tile.querySelector("[data-test-camera]")!).objectFit;
    const box = () => tile.querySelector("[data-test-camera]")!.getBoundingClientRect();
    expect(fitOf()).toBe("cover");
    expect(tile.getAttribute("data-fit")).toBe("cover");
    expect(box().width).toBe(tile.getBoundingClientRect().width);
    expect(box().height).toBe(tile.getBoundingClientRect().height);
    await rerender(
      <MediaTile name="Theo Okafor" source="screen">
        <Camera />
      </MediaTile>,
    );
    expect(fitOf()).toBe("contain");
    expect(tile.getAttribute("data-source")).toBe("screen");
    await rerender(
      <MediaTile name="Theo Okafor" source="screen" fit="cover">
        <Camera />
      </MediaTile>,
    );
    expect(fitOf()).toBe("cover");
    await rerender(
      <MediaTile name="Mara Lind" fit="contain">
        <Camera />
      </MediaTile>,
    );
    expect(fitOf()).toBe("contain");
    expect(warnings()).toEqual([]);
  });

  it("shows a glyph for a poor connection only, and the hand while it is up", async () => {
    const { tile, rerender } = await render(<MediaTile name="Jonas Ek" connection="good" />);
    const glyph = () => tile.querySelector("[data-ouro-media-tile-connection]");
    expect(glyph()).toBeNull();
    expect(tile.getAttribute("data-connection")).toBe("good");
    await rerender(<MediaTile name="Jonas Ek" connection="fair" />);
    expect(glyph()).toBeNull();
    expect(tile.getAttribute("data-connection")).toBe("fair");
    await rerender(<MediaTile name="Jonas Ek" connection="poor" />);
    expect(glyph()!.getAttribute("title")).toBe("Poor connection");
    expect(glyph()!.querySelector("svg")).not.toBeNull();
    expect(tile.querySelector("[data-ouro-media-tile-hand]")).toBeNull();
    await rerender(<MediaTile name="Jonas Ek" handRaised />);
    expect(glyph()).toBeNull();
    expect(tile.querySelector("[data-ouro-media-tile-hand]")!.getAttribute("title")).toBe("Hand raised");
    // Both sit in the top start corner, clear of the name plate.
    const hand = tile.querySelector("[data-ouro-media-tile-hand]")!.getBoundingClientRect();
    const plate = tile.querySelector("[data-ouro-media-tile-plate]")!.getBoundingClientRect();
    expect(hand.bottom).toBeLessThan(plate.top);
    expect(hand.left - tile.getBoundingClientRect().left).toBe(8);
  });

  it("puts the name plate on a translucent fill with no blur, solid with reduced transparency", async () => {
    const { plate, tile } = await render(
      <MediaTile name="Mara Lind" muted presenting>
        <Camera />
      </MediaTile>,
    );
    const style = getComputedStyle(plate);
    expect(style.backdropFilter).toBe("none");
    expect(style.backgroundColor).not.toBe(themeColor("--background"));
    expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    // Bottom start, holding the muted glyph, the name and "Presenting".
    expect(plate.getBoundingClientRect().left - tile.getBoundingClientRect().left).toBe(8);
    expect(tile.getBoundingClientRect().bottom - plate.getBoundingClientRect().bottom).toBe(8);
    expect(plate.textContent).toBe("Mara Lind· Presenting");
    expect(plate.firstElementChild!.hasAttribute("data-ouro-media-tile-muted")).toBe(true);
    // Test browsers cannot ask for reduced transparency, so the page's own rules for it apply to every page here.
    const reduced = document.createElement("style");
    reduced.textContent = pageCss().replace(/@media ?\(prefers-reduced-transparency: ?reduce\)/g, "@media all");
    expect(reduced.textContent).not.toBe(pageCss());
    document.head.append(reduced);
    mounted.push(reduced);
    expect(getComputedStyle(plate).backgroundColor).toBe(themeColor("--background"));
    reduced.remove();
    await commands.emulateMedia({ contrast: "more" });
    expect(getComputedStyle(plate).backgroundColor).toBe(themeColor("--background"));
    expect(getComputedStyle(plate).borderTopColor).toBe(getComputedStyle(plate).color);
    await commands.emulateMedia({ contrast: "no-preference", forcedColors: "active" });
    expect(getComputedStyle(plate).borderTopStyle).toBe("solid");
    expect(parseFloat(getComputedStyle(plate).borderTopWidth)).toBeGreaterThan(0);
    expect(getComputedStyle(tile).borderTopStyle).toBe("solid");
  });

  it("cuts a long name short on a small tile, with the whole name in its tooltip", async () => {
    const long = "Priya Raman-Okafor Lindqvist-Ekström";
    const { host, rerender } = await render(<MediaTile name={long} />, 160);
    const name = () => host.querySelector<HTMLElement>("[data-ouro-media-tile-name]")!;
    expect(name().scrollWidth).toBeGreaterThan(name().clientWidth);
    expect(getComputedStyle(name()).textOverflow).toBe("ellipsis");
    expect(name().getAttribute("title")).toBe(long);
    await rerender(<MediaTile name="Jonas Ek" />);
    expect(name().hasAttribute("title")).toBe(false);
    // A wider tile has room for the whole name: its tooltip goes once the tile is measured.
    await rerender(<MediaTile name={long} />);
    expect(name().getAttribute("title")).toBe(long);
    host.style.width = "900px";
    await expect.poll(() => name().hasAttribute("title")).toBe(false);
  });

  it("grows the photo with the tile, 64px until the tile is measured", async () => {
    const html = renderToString(<MediaTile name="Mara Lind" />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector('[data-ouro="avatar"]')!.className).toContain("size-16");
    const width = (host: HTMLElement) => host.querySelector('[data-ouro="avatar"]')!.getBoundingClientRect().width;
    for (const [tileWidth, photo] of [
      [120, 32],
      [240, 48],
      [400, 64],
      [700, 72],
      [900, 112],
    ] as const) {
      const { host } = await render(<MediaTile name="Mara Lind" />, tileWidth);
      await expect.poll(() => width(host)).toBe(photo);
    }
    // A size of the app's own stays.
    const { host } = await render(<MediaTile name="Mara Lind" avatar={{ size: "xs" }} />, 900);
    await frames();
    expect(width(host)).toBe(24);
  });

  it("renders the same on the server and hydrates without a mismatch", async () => {
    const node = (
      <MediaTile name="Mara Lind" speaking muted onPinnedChange={() => {}}>
        <Camera />
      </MediaTile>
    );
    const html = renderToString(node);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector('[role="group"]')!.getAttribute("aria-label")).toBe("Mara Lind, speaking, muted, camera on");
    expect(doc.querySelector('[data-ouro-part="ring"]')!.hasAttribute("data-highlighted")).toBe(true);
    const host = document.createElement("div");
    host.style.width = "320px";
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    await expect.element(page.getByRole("group", { name: "Mara Lind, speaking, muted, camera on" })).toBeInTheDocument();
  });

  it("is a 16:9 tile as wide as its container, and keeps layout classes, ids, refs and div attributes", async () => {
    const plain = await render(<MediaTile name="Jonas Ek" />, 320);
    expect(plain.tile.getBoundingClientRect().width).toBe(320);
    expect(plain.tile.getBoundingClientRect().height).toBe(180);
    let element: HTMLDivElement | null = null;
    const menu = vi.fn();
    const { tile } = await render(
      <MediaTile name="Mara Lind" className="aspect-square" id="tile-mara" onContextMenu={menu} ref={(node) => void (element = node)} />,
    );
    expect(tile.classList.contains("aspect-square")).toBe(true);
    expect(tile.getBoundingClientRect().height).toBe(tile.getBoundingClientRect().width);
    expect(tile.id).toBe("tile-mara");
    expect(element).toBe(tile);
    tile.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect(menu).toHaveBeenCalledTimes(1);
    expect(warnings()).toEqual([]);
  });

  it("warns, once each, for guessed props and values that aren't its own, and renders the defaults", async () => {
    const props = {
      level: 0.4,
      isMuted: true,
      label: "Mara",
      objectFit: "contain",
      src: "/mara.jpg",
      source: "window",
      fit: "fill",
      connection: "bad",
      hysteresis: { on: -1, off: Number.NaN },
      speaking: 0.6,
    } as unknown as MediaTileProps;
    const { tile, rerender } = await render(<MediaTile {...props} name="" className="bg-red-500" />);
    expect(tile.getAttribute("data-source")).toBe("camera");
    expect(tile.getAttribute("data-fit")).toBe("cover");
    expect(tile.getAttribute("data-connection")).toBe("good");
    expect(tile.hasAttribute("level")).toBe(false);
    expect(tile.hasAttribute("src")).toBe(false);
    await rerender(<MediaTile {...props} name="" className="bg-red-500" />);
    expect(warnings()).toEqual([
      '[ouro-ui] MediaTile: "bg-red-500" sets appearance, and className is for layout only. Fix: MediaTile draws its own surface; set --ouro-media-tile-ring for the ring\'s colour, or wrap the tile in an element of your own.',
      '[ouro-ui] MediaTile: name is empty, so screen readers hear no one. Fix: <MediaTile name="Mara Lind">.',
      '[ouro-ui] MediaTile: source="window" is not a source; use "camera", "screen". Fix: <MediaTile source="screen">.',
      '[ouro-ui] MediaTile: fit="fill" is not a fit; use "cover", "contain". Fix: <MediaTile fit="cover">.',
      '[ouro-ui] MediaTile: connection="bad" is not a connection; use "good", "fair", "poor". Fix: <MediaTile connection="poor">.',
      "[ouro-ui] MediaTile: hysteresis takes milliseconds from 0. Fix: <MediaTile hysteresis={{ on: 300, off: 600 }}>.",
      "[ouro-ui] MediaTile: speaking is on or off, not a level. Fix: <MediaTile speaking={level > 0.1}>.",
      "[ouro-ui] MediaTile: level is not a prop; speaking is on or off. Fix: <MediaTile speaking={level > 0.1}>.",
      "[ouro-ui] MediaTile: isMuted is not a prop. Fix: <MediaTile muted>.",
      '[ouro-ui] MediaTile: label is not a prop; the name names the tile. Fix: <MediaTile name="Mara">.',
      '[ouro-ui] MediaTile: objectFit is not a prop. Fix: <MediaTile fit="contain">.',
      '[ouro-ui] MediaTile: src is not a prop; pass the picture as children, and the photo as avatar. Fix: <MediaTile avatar={{ src: "/mara.jpg" }}>.',
    ]);
  });

  it("warns about a hysteresis it can't use on either side, and a fit a share can't take", async () => {
    await render(<MediaTile name="Mara Lind" hysteresis={{ off: -5 }} />);
    await render(<MediaTile name="Theo Okafor" source="screen" fit={"stretch" as "cover"} />);
    await render(<MediaTile name="Jonas Ek" hysteresis={{ on: 0, off: 0 }} />);
    expect(warnings()).toEqual([
      "[ouro-ui] MediaTile: hysteresis takes milliseconds from 0. Fix: <MediaTile hysteresis={{ on: 300, off: 600 }}>.",
      '[ouro-ui] MediaTile: fit="stretch" is not a fit; use "cover", "contain". Fix: <MediaTile fit="contain">.',
    ]);
  });

  it("declares its agent side: a participant read anyone may take, and a private pin an agent may take", () => {
    expect(mediaTileAx).toEqual({
      component: "MediaTile",
      reads: [
        {
          id: "participant",
          summary: "Who is in the tile, and what they are doing.",
          fields: ["name", "muted", "camera", "speaking", "handRaised", "connection"],
          consent: "none",
        },
      ],
      actions: [{ id: "pin", summary: "Keep this tile in the person's main view.", effect: "private", agent: true }],
    });
  });
});

describe("MediaTile speaking", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  const tileFor = (speaking: boolean, props: Partial<MediaTileProps> = {}) => (
    <MediaTile name="Mara Lind" speaking={speaking} {...props}>
      <Camera />
    </MediaTile>
  );

  it("turns the ring on after 300ms of speaking and off after 600ms of quiet, and ignores a blip shorter than that", async () => {
    const { tile, ring, rerender } = await render(tileFor(false));
    const on = () => ring!.hasAttribute("data-highlighted");
    expect(on()).toBe(false);
    await rerender(tileFor(true));
    await act(() => vi.advanceTimersByTime(299));
    expect(on()).toBe(false);
    expect(tile.getAttribute("aria-label")).toBe("Mara Lind, camera on");
    await act(() => vi.advanceTimersByTime(1));
    expect(on()).toBe(true);
    expect(tile.hasAttribute("data-speaking")).toBe(true);
    expect(tile.getAttribute("aria-label")).toBe("Mara Lind, speaking, camera on");
    await rerender(tileFor(false));
    await act(() => vi.advanceTimersByTime(599));
    expect(on()).toBe(true);
    await act(() => vi.advanceTimersByTime(1));
    expect(on()).toBe(false);
    expect(tile.getAttribute("aria-label")).toBe("Mara Lind, camera on");
    // A cough: speaking for 200ms never turns the ring on, and a pause of 400ms never turns it off.
    await rerender(tileFor(true));
    await act(() => vi.advanceTimersByTime(200));
    await rerender(tileFor(false));
    await act(() => vi.advanceTimersByTime(1000));
    expect(on()).toBe(false);
    await rerender(tileFor(true));
    await act(() => vi.advanceTimersByTime(300));
    expect(on()).toBe(true);
    await rerender(tileFor(false));
    await act(() => vi.advanceTimersByTime(400));
    await rerender(tileFor(true));
    await act(() => vi.advanceTimersByTime(1000));
    expect(on()).toBe(true);
  });

  it("takes its own hysteresis, and turns at once with 0", async () => {
    const { ring, rerender } = await render(tileFor(false, { hysteresis: { on: 1000 } }));
    const on = () => ring!.hasAttribute("data-highlighted");
    await rerender(tileFor(true, { hysteresis: { on: 1000 } }));
    await act(() => vi.advanceTimersByTime(999));
    expect(on()).toBe(false);
    await act(() => vi.advanceTimersByTime(1));
    expect(on()).toBe(true);
    // The other side keeps its default.
    await rerender(tileFor(false, { hysteresis: { on: 1000 } }));
    await act(() => vi.advanceTimersByTime(599));
    expect(on()).toBe(true);
    await act(() => vi.advanceTimersByTime(1));
    expect(on()).toBe(false);
    await rerender(tileFor(true, { hysteresis: { on: 0, off: 0 } }));
    await act(() => vi.advanceTimersByTime(0));
    expect(on()).toBe(true);
    await rerender(tileFor(false, { hysteresis: { on: 0, off: 0 } }));
    await act(() => vi.advanceTimersByTime(0));
    expect(on()).toBe(false);
  });

  it("draws no ring with ring={false}, and still says speaking", async () => {
    const { tile, ring } = await render(tileFor(true, { ring: false }));
    expect(ring).toBeNull();
    expect(tile.getAttribute("aria-label")).toBe("Mara Lind, speaking, camera on");
  });

  it("draws the ring as an inset box-shadow that never moves the layout, and as an outline under forced colours", async () => {
    vi.useRealTimers();
    const { tile, ring, rerender } = await render(tileFor(false, { hysteresis: { on: 0, off: 0 } }));
    const before = tile.getBoundingClientRect();
    const plate = tile.querySelector("[data-ouro-media-tile-plate]")!.getBoundingClientRect();
    await rerender(tileFor(true, { hysteresis: { on: 0, off: 0 } }));
    await expect.poll(() => getComputedStyle(ring!).opacity).toBe("1");
    const style = getComputedStyle(ring!);
    expect(style.boxShadow).toMatch(/inset/);
    expect(style.position).toBe("absolute");
    expect(style.pointerEvents).toBe("none");
    expect(ring!.getBoundingClientRect().toJSON()).toEqual(before.toJSON());
    expect(tile.getBoundingClientRect().toJSON()).toEqual(before.toJSON());
    expect(tile.querySelector("[data-ouro-media-tile-plate]")!.getBoundingClientRect().toJSON()).toEqual(plate.toJSON());
    await commands.emulateMedia({ forcedColors: "active" });
    const forced = getComputedStyle(ring!);
    expect(forced.outlineStyle).toBe("solid");
    expect(forced.outlineWidth).toBe("3px");
    expect(forced.outlineOffset).toBe("-3px");
  });
});

describe("MediaTile motion", () => {
  it("fades the ring in over the fast duration, and turns it on at once with reduced motion", async () => {
    const fast = token("--ouro-duration-fast");
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const element = (speaking: boolean) => (
        <MediaTile name="Mara Lind" speaking={speaking}>
          <Camera />
        </MediaTile>
      );
      const { ring, rerender } = await render(element(false));
      await rerender(element(true));
      await act(() => vi.advanceTimersByTime(300));
      vi.useRealTimers();
      if (reduced) {
        await expectNoMotion(ring!, { stem: "media-tile", state: "data-highlighted", reduced });
      } else {
        await expectMotion(ring!, { stem: "media-tile", state: "data-highlighted", properties: { opacity: fast }, reduced });
      }
      expect(getComputedStyle(ring!).opacity).toBe("1");
      expect(getComputedStyle(ring!).transitionTimingFunction).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
    }
  });
});

describe("MediaTile controls", () => {
  it("shows a Pin toggle that carries the pin action, pressed while pinned", async () => {
    const onPinnedChange = vi.fn();
    const { tile, controls, rerender } = await render(<MediaTile name="Mara Lind" onPinnedChange={onPinnedChange} />);
    const pin = page.getByRole("button", { name: "Pin" });
    await expect.element(pin).toHaveAttribute("aria-pressed", "false");
    const button = pin.element() as HTMLElement;
    expect(button.getAttribute("data-ax-action")).toBe("pin");
    expect(button.getAttribute("data-ouro-control")).toBe("media-tile");
    expect(button.getAttribute("data-ouro-part")).toBe("pin");
    expect(button.getAttribute("title")).toBe("Pin");
    expect(controls!.contains(button)).toBe(true);
    await act(() => button.click());
    expect(onPinnedChange).toHaveBeenCalledWith(true);
    await rerender(<MediaTile name="Mara Lind" pinned onPinnedChange={onPinnedChange} />);
    await expect.element(pin).toHaveAttribute("aria-pressed", "true");
    // The pressed Pin is the tile's pin, so the plate draws none of its own.
    expect(tile.querySelector("[data-ouro-media-tile-pinned]")).toBeNull();
    expect(tile.getAttribute("aria-label")).toBe("Mara Lind, camera off, pinned");
    await rerender(<MediaTile name="Mara Lind" pinned />);
    expect(tile.querySelector("[data-ouro-media-tile-pinned]")!.getAttribute("title")).toBe("Pinned");
    expect(tile.querySelector("[data-ouro-media-tile-controls]")).toBeNull();
  });

  it("shows its controls while focus is inside the tile or it is pinned, and hides them otherwise", async () => {
    const { controls, rerender } = await render(
      <MediaTile name="Mara Lind" onPinnedChange={() => {}} actions={<button type="button">More</button>}>
        <Camera />
      </MediaTile>,
    );
    expect(matchMedia("(pointer: fine)").matches).toBe(true);
    expect(getComputedStyle(controls!).opacity).toBe("0");
    const more = page.getByRole("button", { name: "More" }).element() as HTMLElement;
    expect(controls!.lastElementChild).toBe(more);
    await act(() => more.focus());
    expect(getComputedStyle(controls!).opacity).toBe("1");
    await act(() => more.blur());
    await expect.poll(() => getComputedStyle(controls!).opacity).toBe("0");
    await rerender(
      <MediaTile name="Mara Lind" pinned onPinnedChange={() => {}} actions={<button type="button">More</button>}>
        <Camera />
      </MediaTile>,
    );
    await expect.poll(() => getComputedStyle(controls!).opacity).toBe("1");
    // Actions alone make the corner too; with neither there is none.
    await rerender(<MediaTile name="Mara Lind" actions={<button type="button">More</button>} />);
    expect(page.getByRole("button", { name: "Pin" }).query()).toBeNull();
    expect(page.getByRole("button", { name: "More" }).query()).not.toBeNull();
    await rerender(<MediaTile name="Mara Lind" actions={null} />);
    expect(page.getByRole("button", { name: "More" }).query()).toBeNull();
  });
});

describe("MediaTile visibility", () => {
  it("reports its size rounded up once a frame, never twice with the same values, whatever the callback", async () => {
    const calls: [boolean, number, number][] = [];
    const element = () => <MediaTile name="Mara Lind" onVisibilityChange={(...args) => void calls.push(args)} />;
    const { host, tile, rerender } = await render(element(), 301.5);
    await expect.poll(() => calls).toEqual([[true, 302, 170]]);
    // A new callback each render, and a re-render, report nothing new.
    await rerender(element());
    await rerender(element());
    await frames();
    expect(calls).toEqual([[true, 302, 170]]);
    // Two resizes before the frame runs are one report, of the last size.
    const held = holdFrames();
    host.style.width = "500px";
    await resized(tile);
    host.style.width = "640px";
    await resized(tile);
    expect(calls.length).toBe(1);
    held.step();
    expect(calls).toEqual([
      [true, 302, 170],
      [true, 640, 360],
    ]);
    held.step();
    expect(calls.length).toBe(2);
    // A resize that ends where it started within a frame reports nothing.
    host.style.width = "600px";
    await resized(tile);
    host.style.width = "640px";
    await resized(tile);
    held.step();
    expect(calls.length).toBe(2);
    held.release();
    // Without the callback, nothing is reported.
    await rerender(<MediaTile name="Mara Lind" />);
    host.style.width = "320px";
    await resized(tile);
    await frames();
    expect(calls.length).toBe(2);
  });

  it("counts a tile as seen only once a tenth of it is on screen, so a sliver doesn't count", async () => {
    const report = vi.fn();
    const { host } = await render(<MediaTile name="Mara Lind" onVisibilityChange={report} />, 320);
    host.style.position = "fixed";
    host.style.left = "0px";
    // 180px tall: 8px on screen is a sliver, 30px is more than a tenth.
    host.style.top = `${innerHeight - 8}px`;
    await expect.poll(() => report.mock.lastCall).toEqual([false, 320, 180]);
    host.style.top = `${innerHeight - 30}px`;
    await expect.poll(() => report.mock.lastCall).toEqual([true, 320, 180]);
    host.style.top = `${innerHeight + 40}px`;
    await expect.poll(() => report.mock.lastCall).toEqual([false, 320, 180]);
    host.style.top = "0px";
    await expect.poll(() => report.mock.lastCall).toEqual([true, 320, 180]);
    const count = report.mock.calls.length;
    await frames();
    expect(report.mock.calls.length).toBe(count);
  });

  it("reports a hidden page as unseen at once, and seen again when it shows", async () => {
    const report = vi.fn();
    await render(<MediaTile name="Mara Lind" onVisibilityChange={report} />, 320);
    await expect.poll(() => report.mock.calls).toEqual([[true, 320, 180]]);
    setPage("hidden");
    expect(report.mock.calls).toEqual([
      [true, 320, 180],
      [false, 320, 180],
    ]);
    // Told twice, it reports once.
    setPage("hidden");
    expect(report.mock.calls.length).toBe(2);
    setPage("visible");
    expect(report.mock.lastCall).toEqual([true, 320, 180]);
    expect(report.mock.calls.length).toBe(3);
  });

  it("stops watching when it unmounts", async () => {
    const report = vi.fn();
    const { host } = await render(<MediaTile name="Mara Lind" onVisibilityChange={report} />, 320);
    await expect.poll(() => report.mock.calls.length).toBe(1);
    await act(async () => roots.pop()!.unmount());
    host.style.width = "500px";
    setPage("hidden");
    await frames();
    expect(report.mock.calls.length).toBe(1);
  });
});
