import { Profiler, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { LevelMeter, type LevelMeterProps } from "@/registry/ouro/components/ouro/level-meter/level-meter";
import { bandFor, levelFromAmplitude, levelMeterAx } from "@/registry/ouro/components/ouro/level-meter/level-meter-styles";
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
    get segments() {
      return [...host.querySelectorAll<HTMLElement>('[data-ouro-part="segment"]')];
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

/** The linear amplitude of a level in dBFS: -20 dBFS is 0.1. */
const dB = (decibels: number) => 10 ** (decibels / 20);

/** Which bars are lit, as 1 and 0 in order. */
const litPattern = (segments: HTMLElement[]) => segments.map((segment) => (segment.hasAttribute("data-highlighted") ? 1 : 0)).join("");
const litCount = (segments: HTMLElement[]) => segments.filter((segment) => segment.hasAttribute("data-highlighted")).length;

/** Holds the page's timers, frames and clock, so the meter's ballistics and its reading run on the test's time. */
const holdClock = () => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
const pass = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

/** Resolves once `element` carries `attribute`, in the microtask after the change, so a motion check can start right away. */
function attributeAdded(element: HTMLElement, attribute: string): Promise<void> {
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!element.hasAttribute(attribute)) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(element, { attributes: true, attributeFilter: [attribute] });
  });
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const node of mounted) node.remove();
  mounted = [];
  await commands.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none", contrast: "no-preference" });
});

const warnings = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

describe("LevelMeter", () => {
  it("is a meter named by its label, from 0 to 100, its value the middle of its word's band", async () => {
    const { meter, segments } = await render(<LevelMeter label="Microphone level" value={dB(-30)} />);
    await expect.element(page.getByRole("meter", { name: "Microphone level" })).toBeVisible();
    expect(meter.getAttribute("role")).toBe("meter");
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBe("100");
    expect(meter.getAttribute("aria-valuenow")).toBe("50");
    expect(meter.getAttribute("aria-valuetext")).toBe("Speaking");
    expect(meter.hasAttribute("data-muted")).toBe(false);
    const name = meter.querySelector("[data-ouro-level-meter-label]")!;
    expect(name.getAttribute("data-ouro-level-meter-label")).toBe("");
    expect(name.getBoundingClientRect().width).toBeGreaterThan(1);
    expect(segments.length).toBe(8);
    expect(litPattern(segments)).toBe("11110000");
    expect(segments.map((segment) => segment.getAttribute("data-highlighted"))).toEqual(["", "", "", "", null, null, null, null]);
    expect(warnings()).toEqual([]);
  });

  it("maps a linear amplitude to the bars on a decibel scale from -60 dBFS to 0, so speech lights 3 to 5 of 8 bars", async () => {
    expect(levelFromAmplitude(1)).toBe(1);
    expect(levelFromAmplitude(dB(-6))).toBeCloseTo(0.9, 6);
    expect(levelFromAmplitude(0.1)).toBeCloseTo(2 / 3, 6);
    expect(levelFromAmplitude(dB(-30))).toBeCloseTo(0.5, 6);
    expect(levelFromAmplitude(0.01)).toBeCloseTo(1 / 3, 6);
    expect(levelFromAmplitude(0.001)).toBeCloseTo(0, 6);
    expect(levelFromAmplitude(0.0001)).toBe(0);
    expect(levelFromAmplitude(0)).toBe(0);
    expect(levelFromAmplitude(2)).toBe(1);
    expect(levelFromAmplitude(-0.5)).toBe(0);
    expect(levelFromAmplitude(Number.NaN)).toBe(0);
    const lit = async (value: number) => {
      const { segments, meter } = await render(<LevelMeter label="Level" value={value} />);
      return [litCount(segments), meter.getAttribute("aria-valuenow")];
    };
    // Quiet speech to a raised voice: -40, -30 and -20 dBFS.
    expect(await lit(0.01)).toEqual([3, "50"]);
    expect(await lit(dB(-30))).toEqual([4, "50"]);
    expect(await lit(0.1)).toEqual([5, "50"]);
    expect(await lit(0)).toEqual([0, "10"]);
    expect(await lit(1)).toEqual([8, "90"]);
    expect(warnings()).toEqual([]);
  });

  it("reads Quiet below -48 dBFS, Speaking up to -12 dBFS and Loud from there, in words valueText translates", async () => {
    expect(bandFor(0)).toBe("quiet");
    expect(bandFor(0.199)).toBe("quiet");
    expect(bandFor(0.2)).toBe("speaking");
    expect(bandFor(0.799)).toBe("speaking");
    expect(bandFor(0.8)).toBe("loud");
    expect(bandFor(1)).toBe("loud");
    const text = async (value: number, valueText?: LevelMeterProps["valueText"]) =>
      (await render(<LevelMeter label="Mikrofonpegel" value={value} valueText={valueText} />)).meter.getAttribute("aria-valuetext");
    expect(await text(dB(-55))).toBe("Quiet");
    expect(await text(dB(-30))).toBe("Speaking");
    expect(await text(dB(-5))).toBe("Loud");
    const german = { quiet: "Leise", speaking: "Spricht", loud: "Laut", muted: "Stumm" };
    expect(await text(dB(-55), german)).toBe("Leise");
    expect(await text(dB(-30), german)).toBe("Spricht");
    expect(await text(dB(-5), german)).toBe("Laut");
    expect((await render(<LevelMeter label="Mikrofonpegel" value={dB(-30)} valueText={german} muted />)).meter.getAttribute("aria-valuetext")).toBe("Stumm");
  });

  it("holds its reading at the loudest level of the last 1.5 seconds, so a pause after speech still reads Speaking", async () => {
    holdClock();
    const { meter, rerender } = await render(<LevelMeter label="Microphone level" value={dB(-30)} />);
    await rerender(<LevelMeter label="Microphone level" value={0} />);
    const reading = () => [meter.getAttribute("aria-valuenow"), meter.getAttribute("aria-valuetext")];
    await pass(500);
    expect(reading()).toEqual(["50", "Speaking"]);
    await pass(1000);
    expect(reading()).toEqual(["50", "Speaking"]);
    await pass(500);
    expect(reading()).toEqual(["10", "Quiet"]);
    // The loudest of what it heard, not the latest.
    await rerender(<LevelMeter label="Microphone level" value={dB(-5)} />);
    await rerender(<LevelMeter label="Microphone level" value={dB(-30)} />);
    await pass(500);
    expect(reading()).toEqual(["90", "Loud"]);
  });

  it("changes its ARIA values only when its word changes, and at most twice a second", async () => {
    holdClock();
    const { meter, rerender } = await render(<LevelMeter label="Microphone level" value={0} />);
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(meter, { attributes: true, attributeFilter: ["aria-valuenow", "aria-valuetext"] });
    const updates = () => changes.filter((record) => record.attributeName === "aria-valuenow").length;
    // Three seconds of speech that moves between -40 and -20 dBFS, 15 times a second: one word, so one change.
    for (let step = 0; step < 45; step++) {
      await rerender(<LevelMeter label="Microphone level" value={dB(-40 + ((step * 7) % 21))} />);
      await pass(66);
    }
    expect([updates(), changes.filter((record) => record.attributeName === "aria-valuetext").length]).toEqual([1, 1]);
    expect([meter.getAttribute("aria-valuenow"), meter.getAttribute("aria-valuetext")]).toEqual(["50", "Speaking"]);
    changes.splice(0);
    // Two seconds of a level that swings every 66 ms, 15 times a second.
    for (let step = 0; step < 30; step++) {
      await rerender(<LevelMeter label="Microphone level" value={step % 2 ? dB(-50) : dB(-5 - step)} />);
      await pass(66);
    }
    observer.disconnect();
    expect(updates()).toBeGreaterThan(0);
    expect(updates()).toBeLessThanOrEqual(4);
  });

  it("dims its lit bars while muted, still showing the level, and reads Muted with a value of 0", async () => {
    holdClock();
    const meterAt = (value: number, muted?: boolean) => <LevelMeter label="Microphone level" value={value} bars={4} tone="primary" muted={muted} />;
    const { meter, segments, rerender } = await render(meterAt(dB(-30), true));
    const reading = () => [meter.getAttribute("aria-valuenow"), meter.getAttribute("aria-valuetext")];
    expect(meter.getAttribute("data-muted")).toBe("");
    expect(reading()).toEqual(["0", "Muted"]);
    expect(litPattern(segments)).toBe("1100");
    const muted = themeColor("--muted-foreground");
    expect([getComputedStyle(segments[0]!).backgroundColor, getComputedStyle(segments[0]!).borderTopColor]).toEqual([muted, muted]);
    expect(getComputedStyle(segments[3]!).backgroundColor).toBe(themeColor("--input"));
    // A louder voice while muted lights more bars, and the reading stays.
    await rerender(meterAt(dB(-5), true));
    await pass(600);
    expect(litPattern(segments)).toBe("1111");
    expect(reading()).toEqual(["0", "Muted"]);
    // Unmuted, the bars take the tone and the reading the level's word.
    await rerender(meterAt(dB(-5)));
    expect(meter.hasAttribute("data-muted")).toBe(false);
    expect(reading()).toEqual(["90", "Loud"]);
    await expect.poll(() => getComputedStyle(segments[0]!).backgroundColor).toBe(themeColor("--primary"));
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    vi.useRealTimers();
    // Under forced colours a muted lit bar is GrayText.
    await commands.emulateMedia({ forcedColors: "active" });
    const forced = await render(meterAt(dB(-30), true));
    expect(getComputedStyle(forced.segments[0]!).backgroundColor).toBe(themeColor("GrayText"));
    expect(getComputedStyle(forced.segments[0]!).borderTopColor).toBe(themeColor("GrayText"));
    expect(getComputedStyle(forced.segments[3]!).borderTopColor).toBe(themeColor("CanvasText"));
    expect(warnings()).toEqual([]);
  });

  it("is no live region, so nothing is announced as the level changes", async () => {
    const announced = watchAnnouncements();
    const { host, meter, rerender } = await render(<LevelMeter label="Microphone level" value={0} />);
    for (const value of [0.02, 0.1, 0.5, 0.03, 0]) await rerender(<LevelMeter label="Microphone level" value={value} />);
    announced.stop();
    expect(announced.changes).toEqual([]);
    expect(host.querySelector('[aria-live], [role="status"], [role="alert"], [role="log"]')).toBeNull();
    expect(meter.hasAttribute("tabindex")).toBe(false);
  });

  it("hides the label visually with hideLabel, and keeps the name", async () => {
    const { meter } = await render(<LevelMeter label="Microphone level" hideLabel value={0.05} />);
    await expect.element(page.getByRole("meter", { name: "Microphone level" })).toBeInTheDocument();
    expect(meter.querySelector("[data-ouro-level-meter-label]")!.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });

  it("draws 8 bars by default, or the nearest whole number from 3 to 24", async () => {
    const count = async (bars?: number) => (await render(<LevelMeter label="Level" value={0} bars={bars} />)).segments.length;
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

  it("lights whole bars from the start edge in either direction, every bar the full height of the row", async () => {
    const { host, segments } = await render(<LevelMeter label="Level" value={dB(-30)} />);
    const row = segments[0]!.parentElement!.getBoundingClientRect();
    for (const segment of segments) {
      const box = segment.getBoundingClientRect();
      expect([box.top, box.height, box.width]).toEqual([row.top, row.height, segments[0]!.getBoundingClientRect().width]);
      expect(getComputedStyle(segment).scale).toBe("none");
      expect(getComputedStyle(segment).transform).toBe("none");
    }
    expect(segments[0]!.getBoundingClientRect().left).toBeLessThan(segments[7]!.getBoundingClientRect().left);
    host.dir = "rtl";
    await expect.poll(() => segments[0]!.getBoundingClientRect().left > segments[7]!.getBoundingClientRect().left).toBe(true);
  });

  it("rises within about 50 ms and falls over about 350 ms, the same with reduced motion", async () => {
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      holdClock();
      const { segments, rerender } = await render(<LevelMeter label="Level" value={0} />);
      await rerender(<LevelMeter label="Level" value={1} />);
      expect(litCount(segments)).toBe(0);
      await pass(50);
      expect(litCount(segments)).toBeGreaterThanOrEqual(4);
      expect(litCount(segments)).toBeLessThan(8);
      await pass(150);
      expect(litCount(segments)).toBe(8);
      await rerender(<LevelMeter label="Level" value={0} />);
      await pass(100);
      expect(litCount(segments)).toBeGreaterThanOrEqual(5);
      expect(litCount(segments)).toBeLessThan(8);
      await pass(250);
      expect(litCount(segments)).toBeGreaterThanOrEqual(2);
      expect(litCount(segments)).toBeLessThanOrEqual(4);
      await pass(1150);
      expect(litCount(segments)).toBe(0);
      expect(litPattern(segments)).toBe("00000000");
      await act(async () => roots.splice(0).forEach((root) => root.unmount()));
      vi.useRealTimers();
    }
  });

  it("shows an amplitude outside 0 to 1, or not a number, as silence or full scale, and says so in development", async () => {
    const shown = async (value: number) => {
      const { meter, segments } = await render(<LevelMeter label="Level" value={value} bars={4} />);
      return [meter.getAttribute("aria-valuenow"), meter.getAttribute("aria-valuetext"), litPattern(segments)];
    };
    expect(await shown(1.5)).toEqual(["90", "Loud", "1111"]);
    expect(await shown(-0.5)).toEqual(["10", "Quiet", "0000"]);
    expect(await shown(Number.NaN)).toEqual(["10", "Quiet", "0000"]);
    expect(warnings()).toEqual(Array(3).fill("[ouro-ui] LevelMeter: value is a linear amplitude from 0 to 1, such as an analyser's RMS. Fix: <LevelMeter value={rms}>."));
  });

  it("re-renders between values only when a bar lights or goes out or the word changes, and changes the page only there", async () => {
    holdClock();
    let commits = 0;
    const counted = (value: number) => (
      <Profiler id="meter" onRender={() => void commits++}>
        <LevelMeter label="Level" value={value} />
      </Profiler>
    );
    const { meter, segments, rerender } = await render(counted(1));
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => changes.push(...records));
    observer.observe(meter, { subtree: true, attributes: true, childList: true, characterData: true });
    // Two seconds of release from full scale to silence: eight bars go out, and the reading falls once.
    commits = 0;
    await rerender(counted(0));
    // A frame at a time, so each frame's render commits on its own.
    for (let frame = 0; frame < 125; frame++) await pass(16);
    expect(litCount(segments)).toBe(0);
    expect(commits).toBeGreaterThanOrEqual(9);
    expect(commits).toBeLessThanOrEqual(12);
    changes.splice(0);
    // A level within the same lit bar and word changes nothing, across two of the reading's checks (every 500 ms).
    await rerender(counted(dB(-30)));
    await pass(600);
    changes.splice(0);
    await rerender(counted(dB(-29)));
    await pass(1000);
    expect(changes).toEqual([]);
    // One that crosses bars changes only those bars, and the reading once its word changes at the next check.
    await rerender(counted(dB(-10)));
    await pass(200);
    expect(changes.every((record) => record.attributeName === "data-highlighted" && (record.target as Element).getAttribute("data-ouro-part") === "segment")).toBe(true);
    expect(changes.map((record) => segments.indexOf(record.target as HTMLElement))).toEqual([4, 5, 6]);
    changes.splice(0);
    await pass(300);
    observer.disconnect();
    expect(changes.map((record) => [record.target, record.attributeName])).toEqual([
      [meter, "aria-valuenow"],
      [meter, "aria-valuetext"],
    ]);
  });

  it("draws bars 12, 16 and 24px high, md by default", async () => {
    const measure = async (size?: LevelMeterProps["size"]) => {
      const { segments } = await render(<LevelMeter label="Level" value={0} size={size} bars={3} />);
      const [first, second] = segments.map((segment) => segment.getBoundingClientRect());
      return [first!.height, first!.width, second!.left - first!.right];
    };
    expect(await measure()).toEqual([16, 6, 4]);
    expect(await measure("sm")).toEqual([12, 4, 2]);
    expect(await measure("md")).toEqual([16, 6, 4]);
    expect(await measure("lg")).toEqual([24, 8, 4]);
  });

  it("lights its bars in the tone's colour, success by default, and draws unlit bars as a quiet filled track", async () => {
    const colours = async (tone?: LevelMeterProps["tone"]) => {
      const { segments } = await render(<LevelMeter label="Level" value={dB(-30)} bars={4} tone={tone} />);
      const lit = getComputedStyle(segments[0]!);
      const unlit = getComputedStyle(segments[3]!);
      return { fill: lit.backgroundColor, edge: lit.borderTopColor, unlitFill: unlit.backgroundColor, unlitEdge: unlit.borderTopColor };
    };
    const track = themeColor("--input");
    const defaults = await colours();
    expect(defaults).toEqual({ fill: themeColor("--success"), edge: themeColor("--success"), unlitFill: track, unlitEdge: "rgba(0, 0, 0, 0)" });
    for (const [tone, variable] of [["primary", "--primary"], ["secondary", "--muted-foreground"], ["destructive", "--destructive"], ["success", "--success"], ["warning", "--warning"]] as const) {
      const shown = await colours(tone);
      expect([shown.fill, shown.edge, shown.unlitFill, shown.unlitEdge], tone).toEqual([themeColor(variable), themeColor(variable), track, "rgba(0, 0, 0, 0)"]);
    }
  });

  it("outlines unlit bars in the muted foreground with more contrast", async () => {
    await commands.emulateMedia({ contrast: "more" });
    const { segments } = await render(<LevelMeter label="Level" value={dB(-30)} bars={4} />);
    expect(getComputedStyle(segments[3]!).borderTopColor).toBe(themeColor("--muted-foreground"));
    expect(getComputedStyle(segments[3]!).backgroundColor).toBe(themeColor("--input"));
    expect(getComputedStyle(segments[0]!).borderTopColor).toBe(themeColor("--success"));
  });

  it("keeps an edge on every bar under forced colours, and fills a lit bar with Highlight", async () => {
    await commands.emulateMedia({ forcedColors: "active" });
    const { segments } = await render(<LevelMeter label="Level" value={dB(-30)} bars={4} />);
    for (const segment of segments) {
      const style = getComputedStyle(segment);
      expect(parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
      expect(style.borderTopStyle).toBe("solid");
    }
    expect(getComputedStyle(segments[0]!).backgroundColor).toBe(themeColor("Highlight"));
    expect(getComputedStyle(segments[0]!).borderTopColor).toBe(themeColor("Highlight"));
    expect(getComputedStyle(segments[3]!).backgroundColor).toMatch(/,\s*0\)$/);
    expect(getComputedStyle(segments[3]!).borderTopColor).toBe(themeColor("CanvasText"));
  });

  it("keeps layout classes and passes ids and refs through", async () => {
    let element: HTMLDivElement | null = null;
    const { meter } = await render(<LevelMeter label="Level" value={0.02} className="mt-4" id="mic-level" ref={(node) => void (element = node)} />);
    expect(meter.classList.contains("mt-4")).toBe(true);
    expect(meter.id).toBe("mic-level");
    expect(element).toBe(meter);
    expect(warnings()).toEqual([]);
  });

  it("renders the same on the server and hydrates without a mismatch", async () => {
    const node = <LevelMeter label="Microphone level" value={dB(-30)} bars={6} />;
    const html = renderToString(node);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const served = doc.querySelector('[role="meter"]')!;
    expect(doc.getElementById(served.getAttribute("aria-labelledby")!)!.textContent).toBe("Microphone level");
    expect(served.getAttribute("aria-valuenow")).toBe("50");
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
    const { segments, rerender } = await render(<LevelMeter {...props} label="Level" value={1} className="bg-red-500" />);
    expect(segments.length).toBe(8);
    expect(getComputedStyle(segments[0]!).backgroundColor).toBe(themeColor("--success"));
    expect(segments[0]!.getBoundingClientRect().height).toBe(16);
    await rerender(<LevelMeter {...props} label="Level" value={0.6} className="bg-red-500" />);
    expect(warnings()).toEqual([
      '[ouro-ui] LevelMeter: "bg-red-500" sets appearance, and className is for layout only. Fix: tone="destructive".',
      '[ouro-ui] LevelMeter: size="xl" is not a size; use "sm", "md", "lg". Fix: <LevelMeter size="md">.',
      '[ouro-ui] LevelMeter: tone="danger" is not a tone. Fix: <LevelMeter tone="destructive">.',
      "[ouro-ui] LevelMeter: level is not a prop. Fix: <LevelMeter value={rms}>.",
      "[ouro-ui] LevelMeter: max is not a prop; value is an amplitude from 0 to 1. Fix: <LevelMeter value={rms}>.",
      "[ouro-ui] LevelMeter: segments is not a prop. Fix: <LevelMeter bars={10}>.",
      '[ouro-ui] LevelMeter: color is not a prop. Fix: <LevelMeter tone="success">.',
    ]);
  });

  it("declares no agent reads and no actions", () => {
    expect(levelMeterAx).toEqual({ component: "LevelMeter", reads: [], actions: [] });
  });
});

describe("LevelMeter motion", () => {
  it("cross-fades a bar as it lights in a third of --ouro-duration-fast, the same with reduced motion, and nothing moves or scales", async () => {
    const lighting = token("--ouro-duration-fast") / 3;
    for (const reduced of [false, true]) {
      await commands.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
      const { segments, rerender } = await render(<LevelMeter label="Level" value={0} bars={4} />);
      const first = segments[0]!;
      const box = first.getBoundingClientRect();
      expect(first.hasAttribute("data-highlighted")).toBe(false);
      const lit = attributeAdded(first, "data-highlighted");
      await rerender(<LevelMeter label="Level" value={1} bars={4} />);
      await lit;
      await expectMotion(first, { stem: "level-meter", state: "data-highlighted", properties: { "background-color": lighting, "border-color": lighting }, reduced });
      expect(getComputedStyle(first).backgroundColor).toBe(themeColor("--success"));
      expect(first.getBoundingClientRect()).toEqual(box);
      await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    }
  });
});
