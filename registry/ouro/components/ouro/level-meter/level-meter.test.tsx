import type { ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { LevelMeter, type LevelMeterProps } from "@/registry/ouro/components/ouro/level-meter/level-meter";
import { levelMeterAx } from "@/registry/ouro/components/ouro/level-meter/level-meter-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { expectMotion, parseDuration } from "@/registry/ouro/lib/ouro/testing/motion";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "300px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get meter() {
      return host.querySelector<HTMLElement>('[data-ouro="level-meter"]')!;
    },
    get bars() {
      return [...host.querySelectorAll<HTMLElement>("[data-ouro-level-meter-bar]")];
    },
    get fills() {
      return [...host.querySelectorAll<HTMLElement>('[data-ouro-part="fill"]')];
    },
  };
}

/** A colour as the page computes it: a theme variable (`--success`) or a system colour (`Highlight`). */
function themeColor(colour: string): string {
  const probe = document.createElement("div");
  probe.style.backgroundColor = colour.startsWith("--") ? `var(${colour})` : colour;
  document.body.append(probe);
  const value = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return value;
}

const token = (name: string) => parseDuration(getComputedStyle(document.documentElement).getPropertyValue(name));

/** How much of the inside of its bar (within any edge) a fill covers, from 0 to 1, as drawn. */
const share = (fill: HTMLElement) => fill.getBoundingClientRect().height / fill.parentElement!.clientHeight;

/** Which bars are lit, as 1 and 0 in order. */
const litPattern = (bars: HTMLElement[]) => bars.map((bar) => (bar.querySelector('[data-ouro-part="fill"]')!.hasAttribute("data-highlighted") ? 1 : 0)).join("");

/** Waits until no transition runs on the fills. */
const settled = (fills: HTMLElement[]) => expect.poll(() => fills.every((fill) => fill.getAnimations().length === 0)).toBe(true);

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await commands.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none" });
});

const warnings = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

describe("LevelMeter", () => {
  it("is a meter named by its label, from 0 to 100, with the level rounded and in words", async () => {
    const { meter } = await render(<LevelMeter label="Microphone level" value={0.456} />);
    await expect.element(page.getByRole("meter", { name: "Microphone level" })).toBeVisible();
    expect(meter.getAttribute("role")).toBe("meter");
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBe("100");
    expect(meter.getAttribute("aria-valuenow")).toBe("46");
    expect(meter.getAttribute("aria-valuetext")).toBe("Speaking");
    const name = meter.querySelector("[data-ouro-level-meter-label]")!;
    expect(name.getAttribute("data-ouro-level-meter-label")).toBe("");
    expect(name.getBoundingClientRect().width).toBeGreaterThan(1);
    expect(meter.querySelectorAll('[data-ouro-level-meter-bar=""]').length).toBe(8);
    expect(warnings()).toEqual([]);
  });

  it("reads Quiet below a tenth, Speaking up to three quarters and Loud from there, in words valueText translates", async () => {
    const { meter, rerender } = await render(<LevelMeter label="Microphone level" value={0} />);
    const text = () => meter.getAttribute("aria-valuetext");
    expect(text()).toBe("Quiet");
    await rerender(<LevelMeter label="Microphone level" value={0.099} />);
    expect(text()).toBe("Quiet");
    await rerender(<LevelMeter label="Microphone level" value={0.1} />);
    expect(text()).toBe("Speaking");
    await rerender(<LevelMeter label="Microphone level" value={0.749} />);
    expect(text()).toBe("Speaking");
    await rerender(<LevelMeter label="Microphone level" value={0.75} />);
    expect(text()).toBe("Loud");
    await rerender(<LevelMeter label="Microphone level" value={1} />);
    expect(text()).toBe("Loud");
    const words = { quiet: "Leise", speaking: "Spricht", loud: "Laut" };
    await rerender(<LevelMeter label="Mikrofonpegel" value={0} valueText={words} />);
    expect(text()).toBe("Leise");
    await rerender(<LevelMeter label="Mikrofonpegel" value={0.5} valueText={words} />);
    expect(text()).toBe("Spricht");
    await rerender(<LevelMeter label="Mikrofonpegel" value={0.9} valueText={words} />);
    expect(text()).toBe("Laut");
    expect(warnings()).toEqual([]);
  });

  it("is no live region, so nothing is announced as the level changes", async () => {
    const announced = watchAnnouncements();
    const { host, meter, rerender } = await render(<LevelMeter label="Microphone level" value={0} />);
    for (const value of [0.2, 0.5, 0.9, 0.3, 0]) await rerender(<LevelMeter label="Microphone level" value={value} />);
    announced.stop();
    expect(announced.changes).toEqual([]);
    expect(host.querySelector('[aria-live], [role="status"], [role="alert"], [role="log"]')).toBeNull();
    expect(meter.hasAttribute("tabindex")).toBe(false);
  });

  it("hides the label visually with hideLabel, and keeps the name", async () => {
    const { meter } = await render(<LevelMeter label="Microphone level" hideLabel value={0.4} />);
    await expect.element(page.getByRole("meter", { name: "Microphone level" })).toBeInTheDocument();
    expect(meter.querySelector("[data-ouro-level-meter-label]")!.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });

  it("draws 8 bars by default, or the nearest whole number from 3 to 24", async () => {
    const count = async (bars?: number) => (await render(<LevelMeter label="Level" value={0} bars={bars} />)).bars.length;
    expect(await count()).toBe(8);
    expect(await count(3)).toBe(3);
    expect(await count(24)).toBe(24);
    expect(await count(2)).toBe(3);
    expect(await count(40)).toBe(24);
    expect(await count(7.4)).toBe(7);
    expect(await count(7.6)).toBe(8);
    expect(await count(Number.NaN)).toBe(8);
    expect(warnings()).toEqual([
      "[ouro-ui] LevelMeter: bars={2} is not a whole number from 3 to 24. Fix: <LevelMeter bars={3}>.",
      "[ouro-ui] LevelMeter: bars={40} is not a whole number from 3 to 24. Fix: <LevelMeter bars={24}>.",
      "[ouro-ui] LevelMeter: bars={7.4} is not a whole number from 3 to 24. Fix: <LevelMeter bars={7}>.",
      "[ouro-ui] LevelMeter: bars={7.6} is not a whole number from 3 to 24. Fix: <LevelMeter bars={8}>.",
      "[ouro-ui] LevelMeter: bars={NaN} is not a whole number from 3 to 24. Fix: <LevelMeter bars={8}>.",
    ]);
  });

  it("lights the bars the level reaches, to the nearest bar, each grown to its share", async () => {
    const { bars, fills, rerender } = await render(<LevelMeter label="Level" value={0} bars={5} />);
    expect(litPattern(bars)).toBe("00000");
    await settled(fills);
    expect(fills.map(share)).toEqual([0, 0, 0, 0, 0]);
    // 0.48 of five bars reaches 2.4: two lit, the third grown by 0.4.
    await rerender(<LevelMeter label="Level" value={0.48} bars={5} />);
    expect(litPattern(bars)).toBe("11000");
    expect(fills.map((fill) => fill.getAttribute("data-highlighted"))).toEqual(["", "", null, null, null]);
    await settled(fills);
    const drawn = fills.map(share);
    expect(drawn[0]).toBeCloseTo(1, 2);
    expect(drawn[1]).toBeCloseTo(1, 2);
    expect(drawn[2]).toBeCloseTo(0.4, 2);
    expect(drawn.slice(3)).toEqual([0, 0]);
    // 0.5 of five bars reaches 2.5, which rounds to three lit.
    await rerender(<LevelMeter label="Level" value={0.5} bars={5} />);
    expect(litPattern(bars)).toBe("11100");
    await rerender(<LevelMeter label="Level" value={1} bars={5} />);
    expect(litPattern(bars)).toBe("11111");
    await settled(fills);
    for (const fill of fills) expect(share(fill)).toBeCloseTo(1, 2);
  });

  it("grows each bar from its foot, and lights the bars from the start edge in either direction", async () => {
    const { host, bars, fills } = await render(<LevelMeter label="Level" value={0.3} bars={5} />);
    await settled(fills);
    // 1.5 bars: the first lit whole, the second grown by half from its foot.
    const second = fills[1]!.getBoundingClientRect();
    const slot = bars[1]!.getBoundingClientRect();
    expect(second.bottom).toBeCloseTo(slot.bottom, 0);
    expect(second.height).toBeCloseTo(slot.height / 2, 0);
    expect(bars[0]!.getBoundingClientRect().left).toBeLessThan(bars[4]!.getBoundingClientRect().left);
    host.dir = "rtl";
    await expect.poll(() => bars[0]!.getBoundingClientRect().left > bars[4]!.getBoundingClientRect().left).toBe(true);
  });

  it("clamps a level outside 0 to 1, and shows a level that is not a number as 0", async () => {
    const { meter, bars, rerender } = await render(<LevelMeter label="Level" value={1.5} bars={4} />);
    expect(meter.getAttribute("aria-valuenow")).toBe("100");
    expect(litPattern(bars)).toBe("1111");
    await rerender(<LevelMeter label="Level" value={-0.5} bars={4} />);
    expect(meter.getAttribute("aria-valuenow")).toBe("0");
    expect(litPattern(bars)).toBe("0000");
    await rerender(<LevelMeter label="Level" value={Number.NaN} bars={4} />);
    expect(meter.getAttribute("aria-valuenow")).toBe("0");
    expect(meter.getAttribute("aria-valuetext")).toBe("Quiet");
    expect(meter.style.getPropertyValue("--ouro-level")).toBe("0");
    expect(warnings()).toEqual(["[ouro-ui] LevelMeter: value is outside 0 to 1; pass a fraction of full scale. Fix: <LevelMeter value={percent / 100}>."]);
  });

  it("changes only the root's level and the bars that light or go out when the level changes", async () => {
    const { meter, bars, rerender } = await render(<LevelMeter label="Level" value={0.3} bars={5} />);
    const partOf = (target: Node) => (target === meter ? "root" : (target as Element).hasAttribute("data-ouro-level-meter-bar") ? "bar" : (target as Element).getAttribute("data-ouro-part"));
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(meter, { subtree: true, attributes: true, childList: true, characterData: true });
    // 1.5 to 1.9 bars: both round to two lit, so no bar changes.
    await rerender(<LevelMeter label="Level" value={0.38} bars={5} />);
    let seen = changes.splice(0).map((record) => [partOf(record.target), record.attributeName]);
    expect(new Set(seen.map(([target]) => target))).toEqual(new Set(["root"]));
    expect(new Set(seen.map(([, name]) => name))).toEqual(new Set(["style", "aria-valuenow"]));
    // 1.9 to 3 bars: the third lights, and nothing else in the row changes.
    await rerender(<LevelMeter label="Level" value={0.6} bars={5} />);
    seen = changes.splice(0).map((record) => [partOf(record.target), record.attributeName]);
    observer.disconnect();
    expect(seen.filter(([target]) => target !== "root")).toEqual([["fill", "data-highlighted"]]);
    expect(litPattern(bars)).toBe("11100");
  });

  it("draws bars 12, 16 and 24px high, md by default", async () => {
    const measure = async (size?: LevelMeterProps["size"]) => {
      const { bars } = await render(<LevelMeter label="Level" value={0} size={size} bars={3} />);
      const [first, second] = bars.map((bar) => bar.getBoundingClientRect());
      return [first!.height, first!.width, second!.left - first!.right];
    };
    expect(await measure()).toEqual([16, 6, 4]);
    expect(await measure("sm")).toEqual([12, 4, 2]);
    expect(await measure("md")).toEqual([16, 6, 4]);
    expect(await measure("lg")).toEqual([24, 8, 4]);
  });

  it("lights its bars in the tone's colour, success by default, and leaves the rest muted", async () => {
    const colours = async (tone?: LevelMeterProps["tone"]) => {
      const { fills, bars } = await render(<LevelMeter label="Level" value={0.5} bars={4} tone={tone} />);
      return { lit: getComputedStyle(fills[0]!).backgroundColor, unlit: getComputedStyle(bars[3]!).backgroundColor };
    };
    const muted = themeColor("--muted-foreground");
    const defaults = await colours();
    expect(defaults.lit).toBe(themeColor("--success"));
    expect(defaults.unlit).not.toBe(themeColor("--background"));
    expect(defaults.unlit).not.toBe(muted);
    expect((await colours("primary")).lit).toBe(themeColor("--primary"));
    expect((await colours("secondary")).lit).toBe(muted);
    expect((await colours("destructive")).lit).toBe(themeColor("--destructive"));
    expect((await colours("success")).lit).toBe(themeColor("--success"));
    const warning = await colours("warning");
    expect(warning.lit).toBe(themeColor("--warning"));
    expect(warning.unlit).toBe(defaults.unlit);
  });

  it("keeps an edge on every bar under forced colours, and fills a lit bar with Highlight", async () => {
    await commands.emulateMedia({ forcedColors: "active" });
    const { bars, fills } = await render(<LevelMeter label="Level" value={0.5} bars={4} />);
    await settled(fills);
    for (const bar of bars) {
      const style = getComputedStyle(bar);
      expect(parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
      expect(style.borderTopStyle).toBe("solid");
    }
    const highlight = themeColor("Highlight");
    expect(getComputedStyle(fills[0]!).backgroundColor).toBe(highlight);
    expect(share(fills[0]!)).toBeCloseTo(1, 1);
    expect(share(fills[3]!)).toBe(0);
    await commands.emulateMedia({ reducedMotion: "reduce" });
    await settled(fills);
    expect(getComputedStyle(fills[0]!).opacity).toBe("1");
    expect(getComputedStyle(fills[3]!).opacity).toBe("0");
  });

  it("keeps layout classes and passes ids and refs through", async () => {
    let element: HTMLDivElement | null = null;
    const { meter } = await render(<LevelMeter label="Level" value={0.2} className="mt-4" id="mic-level" ref={(node) => void (element = node)} />);
    expect(meter.classList.contains("mt-4")).toBe(true);
    expect(meter.id).toBe("mic-level");
    expect(element).toBe(meter);
    expect(warnings()).toEqual([]);
  });

  it("renders the same on the server and hydrates without a mismatch", async () => {
    const node = <LevelMeter label="Microphone level" value={0.42} bars={6} />;
    const html = renderToString(node);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const served = doc.querySelector('[role="meter"]')!;
    expect(doc.getElementById(served.getAttribute("aria-labelledby")!)!.textContent).toBe("Microphone level");
    expect(served.getAttribute("aria-valuenow")).toBe("42");
    expect(served.querySelectorAll("[data-highlighted]").length).toBe(3);
    const host = document.createElement("div");
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
    await expect.element(page.getByRole("meter", { name: "Microphone level" })).toBeInTheDocument();
  });

  it("warns, once each, for guessed props and appearance classes, and renders the defaults", async () => {
    const props = { level: 0.4, max: 100, segments: 10, color: "green", tone: "danger", size: "xl" } as unknown as LevelMeterProps;
    const { bars, fills, rerender } = await render(<LevelMeter {...props} label="Level" value={0.5} className="bg-red-500" />);
    expect(bars.length).toBe(8);
    expect(getComputedStyle(fills[0]!).backgroundColor).toBe(themeColor("--success"));
    expect(bars[0]!.getBoundingClientRect().height).toBe(16);
    await rerender(<LevelMeter {...props} label="Level" value={0.6} className="bg-red-500" />);
    expect(warnings()).toEqual([
      '[ouro-ui] LevelMeter: "bg-red-500" sets appearance, and className is for layout only. Fix: tone="destructive".',
      '[ouro-ui] LevelMeter: size="xl" is not a size; use "sm", "md", "lg". Fix: <LevelMeter size="md">.',
      '[ouro-ui] LevelMeter: tone="danger" is not a tone. Fix: <LevelMeter tone="destructive">.',
      "[ouro-ui] LevelMeter: level is not a prop. Fix: <LevelMeter value={level}>.",
      "[ouro-ui] LevelMeter: max is not a prop; value runs from 0 to 1. Fix: <LevelMeter value={level / max}>.",
      "[ouro-ui] LevelMeter: segments is not a prop. Fix: <LevelMeter bars={10}>.",
      '[ouro-ui] LevelMeter: color is not a prop. Fix: <LevelMeter tone="success">.',
    ]);
  });

  it("declares no agent reads and no actions", () => {
    expect(levelMeterAx).toEqual({ component: "LevelMeter", reads: [], actions: [] });
  });
});

describe("LevelMeter motion", () => {
  it("grows lit bars from their foot with a short scale transition, and with reduced motion shows them whole and only fades them", async () => {
    const fast = token("--ouro-duration-fast");
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      const { bars, fills, rerender } = await render(<LevelMeter label="Level" value={0} bars={4} />);
      await settled(fills);
      expect(fills[0]!.hasAttribute("data-highlighted")).toBe(false);
      await rerender(<LevelMeter label="Level" value={1} bars={4} />);
      await expectMotion(fills[0]!, { stem: "level-meter", state: "data-highlighted", properties: reduced ? { opacity: fast } : { scale: fast }, reduced });
      await settled(fills);
      expect(share(fills[0]!)).toBeCloseTo(1, 2);
      expect(getComputedStyle(fills[0]!).opacity).toBe("1");
      if (reduced) {
        // Nothing scales: a bar the level does not reach is whole but hidden, not shrunk.
        await rerender(<LevelMeter label="Level" value={0.3} bars={4} />);
        await settled(fills);
        expect(litPattern(bars)).toBe("1000");
        expect(share(fills[1]!)).toBeCloseTo(1, 2);
        expect(getComputedStyle(fills[1]!).opacity).toBe("0");
        expect(getComputedStyle(fills[0]!).transitionProperty).toBe("opacity");
      } else {
        expect(getComputedStyle(fills[0]!).transitionProperty).toBe("scale");
        expect(getComputedStyle(fills[0]!).transitionTimingFunction).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
      }
    }
  });
});
