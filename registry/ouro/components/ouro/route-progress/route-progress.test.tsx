import { type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { RouteProgress } from "@/registry/ouro/components/ouro/route-progress/route-progress";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
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
    root,
    get region() {
      return host.querySelector<HTMLElement>('[data-ouro="route-progress"]')!;
    },
    get bar() {
      return host.querySelector<HTMLElement>('[data-ouro-part="bar"]')!;
    },
    get sweep() {
      return host.querySelector<HTMLElement>('[data-ouro-part="bar"] > div')!;
    },
  };
}

const token = (name: string) => parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name));
const animationName = (element: Element) => getComputedStyle(element).animationName;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

describe("RouteProgress", () => {
  it("is a 2px bar fixed across the top of the screen in the primary color, which no click reaches", async () => {
    const { region, bar, sweep } = await render(<RouteProgress active />);
    expect(getComputedStyle(region).position).toBe("fixed");
    const rect = region.getBoundingClientRect();
    expect(rect.top).toBe(0);
    expect(rect.left).toBe(0);
    expect(rect.width).toBe(innerWidth);
    expect(rect.height).toBe(2);
    expect(getComputedStyle(region).pointerEvents).toBe("none");
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--primary)";
    document.body.append(probe);
    mounted.push(probe);
    expect(getComputedStyle(sweep).backgroundColor).toBe(getComputedStyle(probe).backgroundColor);
    expect(getComputedStyle(bar).opacity).toBe("1");
  });

  it("is a status region that is empty while idle and says the label while active", async () => {
    const { root, region } = await render(<RouteProgress active={false} />);
    expect(region.getAttribute("role")).toBe("status");
    expect(region.textContent).toBe("");
    await act(async () => root.render(<RouteProgress active />));
    await expect.element(page.getByRole("status")).toHaveTextContent("Loading");
    await act(async () => root.render(<RouteProgress active label="Opening the recipe" />));
    expect(region.textContent).toBe("Opening the recipe");
  });

  it("is heard once when a navigation starts, and not again while it runs", async () => {
    const { root } = await render(<RouteProgress active={false} />);
    const announcements = watchAnnouncements();
    try {
      await act(async () => root.render(<RouteProgress active />));
      await act(async () => root.render(<RouteProgress active />));
      await expect.poll(() => announcements.count("Loading")).toBe(1);
      await act(async () => root.render(<RouteProgress active={false} />));
      await act(async () => root.render(<RouteProgress active />));
      await expect.poll(() => announcements.count("Loading")).toBe(2);
      expect(announcements.matching("Loading")[0]!.region.getAttribute("data-ouro")).toBe("route-progress");
    } finally {
      announcements.stop();
    }
  });

  it("fades in when a navigation starts and out when it ends, faster with reduced motion", async () => {
    const { root, bar } = await render(<RouteProgress active={false} />);
    expect(getComputedStyle(bar).opacity).toBe("0");
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      const duration = token(reduced ? "--ouro-duration-fast" : "--ouro-duration-base");
      flushSync(() => root.render(<RouteProgress active />));
      await expectMotion(bar, { stem: "route-progress", state: "data-open", properties: { opacity: duration }, reduced });
      expect(getComputedStyle(bar).opacity).toBe("1");
      flushSync(() => root.render(<RouteProgress active={false} />));
      await expectMotion(bar, { stem: "route-progress", state: "data-closed", properties: { opacity: duration }, reduced });
      expect(getComputedStyle(bar).opacity).toBe("0");
    }
  });

  it("sweeps while active and pauses while hidden; with reduced motion it stays still and pulses", async () => {
    const { root, sweep } = await render(<RouteProgress active />);
    expect(animationName(sweep)).toBe("ouro-progress");
    expect(getComputedStyle(sweep).animationPlayState).toBe("running");
    expect(sweep.getBoundingClientRect().width).toBeCloseTo(innerWidth / 3, 0);
    await act(async () => root.render(<RouteProgress active={false} />));
    expect(getComputedStyle(sweep).animationPlayState).toBe("paused");
    await commands.emulateMedia({ reducedMotion: "reduce" });
    await act(async () => root.render(<RouteProgress active />));
    expect(animationName(sweep)).toBe("ouro-pulse");
    expect(sweep.getBoundingClientRect().width).toBe(innerWidth);
    // Only its opacity changes: nothing moves.
    for (const animation of sweep.getAnimations()) {
      const keys = (animation.effect as KeyframeEffect).getKeyframes().flatMap((frame) => Object.keys(frame));
      expect(new Set(keys.filter((key) => !["offset", "computedOffset", "easing", "composite"].includes(key)))).toEqual(new Set(["opacity"]));
    }
  });

  it("forwards a ref and lets app layout classes win", async () => {
    let element: HTMLDivElement | null = null;
    const { region } = await render(<RouteProgress active className="top-14" ref={(node) => void (element = node)} />);
    expect(element).toBe(region);
    expect(region.getBoundingClientRect().top).toBe(56);
  });

  it("does not print", async () => {
    const { region } = await render(<RouteProgress active />);
    expect(region.className).toContain("print:hidden");
  });
});

describe("RouteProgress development messages", () => {
  const fix = '<RouteProgress active={navigation.state !== "idle"} />';
  it.each([
    ["loading", { loading: true }, "loading is not a prop", fix],
    ["isLoading", { isLoading: true }, "isLoading is not a prop", fix],
    ["value", { active: true, value: 50 }, "RouteProgress has no amount", "<Progress value={50}>"],
  ])("names the fix for %s", async (_name, extra, problem, message) => {
    const props = { ...extra } as unknown as Parameters<typeof RouteProgress>[0];
    const { region } = await render(<RouteProgress {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] RouteProgress: ${problem}. Fix: ${message}.`);
    for (const attribute of ["loading", "isloading", "value"]) expect(region.hasAttribute(attribute)).toBe(false);
  });

  it("names a missing active", async () => {
    const props = {} as unknown as Parameters<typeof RouteProgress>[0];
    await render(<RouteProgress {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] RouteProgress: active is required; pass whether a navigation is under way. Fix: ${fix}.`);
  });

  it.each([
    ["bg-red-500", 'remove "bg-red-500"; RouteProgress takes the theme\'s --primary color'],
    ["top-14", ""],
  ])("checks the className %s", async (className, message) => {
    await render(<RouteProgress active className={className} />);
    if (message) {
      expect(warn).toHaveBeenCalledWith(`[ouro-ui] RouteProgress: "${className}" sets appearance, and className is for layout only. Fix: ${message}.`);
    } else {
      expect(warn).not.toHaveBeenCalled();
    }
  });

  it("renders to a string without messages", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(<RouteProgress active className="bg-red-500" />);
    expect(html).toContain('data-ouro="route-progress"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading");
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
