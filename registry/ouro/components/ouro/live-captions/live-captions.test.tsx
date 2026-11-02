import type { ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page } from "vitest/browser";
import { LiveCaptions, type LiveCaptionLine, type LiveCaptionsProps } from "@/registry/ouro/components/ouro/live-captions/live-captions";
import { liveCaptionsAx } from "@/registry/ouro/components/ouro/live-captions/live-captions-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { pageCss } from "@/registry/ouro/lib/ouro/testing/page-css";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode, width = 600) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    root,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get band() {
      return host.querySelector<HTMLElement>('[data-ouro="live-captions"]')!;
    },
    get window() {
      return host.querySelector<HTMLElement>("[data-ouro-live-captions-window]")!;
    },
    get track() {
      return host.querySelector<HTMLElement>("[data-ouro-live-captions-track]")!;
    },
    line(id: string) {
      return host.querySelector<HTMLElement>(`[data-ouro-live-captions-line="${id}"]`)!;
    },
    get rows() {
      return [...host.querySelectorAll<HTMLElement>("[data-ouro-live-captions-line]")];
    },
  };
}

const line = (id: string, speaker: string, text: string, final = true): LiveCaptionLine => ({ id, speaker, text, final });
const mara = (id: string, text: string, final = true) => line(id, "Mara Lind", text, final);
const jonas = (id: string, text: string, final = true) => line(id, "Jonas Ek", text, final);

/** A colour as the page computes it, from any CSS colour: a theme variable, a mix or a system colour. */
function computed(colour: string, inside: Element = document.body): string {
  const probe = document.createElement("span");
  probe.style.color = colour;
  inside.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

type Rgb = [number, number, number];
const canvas = document.createElement("canvas");
canvas.width = canvas.height = 1;
const context = canvas.getContext("2d", { willReadFrequently: true })!;

/** A CSS colour composited over `below`, as sRGB. */
function over(colour: string, below: Rgb): Rgb {
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = `rgb(${below.join(",")})`;
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r!, g!, b!];
}

function luminance([r, g, b]: Rgb): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** How far a track is drawn below where it sits, in px. */
const lift = (track: HTMLElement) => parseFloat(getComputedStyle(track).translate.split(" ")[1] ?? "0") || 0;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await commands.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none", contrast: "no-preference" });
});

const warnings = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

describe("LiveCaptions", () => {
  it("is a region named by its label, which hideLabel hides from sight only", async () => {
    const { band, rerender } = await render(<LiveCaptions label="Captions" lines={[mara("1", "Shall we start?")]} />);
    await expect.element(page.getByRole("region", { name: "Captions" })).toBeVisible();
    expect(band.getAttribute("role")).toBe("region");
    const name = band.querySelector<HTMLElement>("[data-ouro-live-captions-label]")!;
    expect(name.getAttribute("data-ouro-live-captions-label")).toBe("");
    expect(name.textContent).toBe("Captions");
    expect(name.getBoundingClientRect().width).toBeGreaterThan(1);
    expect(band.hasAttribute("tabindex")).toBe(false);
    await rerender(<LiveCaptions label="Captions" hideLabel lines={[mara("1", "Shall we start?")]} />);
    await expect.element(page.getByRole("region", { name: "Captions" })).toBeInTheDocument();
    expect(name.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(warnings()).toEqual([]);
  });

  it("shows each line as the speaker's first name in a tint of the brand colour, then their words", async () => {
    const { band, line: row } = await render(<LiveCaptions label="Captions" lines={[mara("1", "Shall we start?"), line("2", "  Jonas   Ek ", "Yes, go ahead.")]} />);
    const first = row("1");
    const speaker = first.querySelector<HTMLElement>("[data-ouro-live-captions-speaker]")!;
    const words = first.querySelector<HTMLElement>("[data-ouro-live-captions-words]")!;
    expect(speaker.textContent).toBe("Mara");
    expect(words.textContent).toBe("Shall we start?");
    expect(row("2").querySelector("[data-ouro-live-captions-speaker]")!.textContent).toBe("Jonas");
    // The name reads "Mara: Shall we start?" to a screen reader browsing the band.
    expect(first.textContent).toBe("Mara: Shall we start?");
    expect(speaker.getBoundingClientRect().right).toBeLessThan(words.getBoundingClientRect().left);
    expect(getComputedStyle(speaker).color).toBe(computed("color-mix(in oklab, var(--primary) 35%, white)", band));
    expect(Number(getComputedStyle(speaker).fontWeight)).toBeGreaterThanOrEqual(600);
    expect(getComputedStyle(words).color).toBe("rgb(255, 255, 255)");
    expect(first.getAttribute("data-final")).toBe("");
    expect(getComputedStyle(first).marginTop).toBe("0px");
  });

  it("turns interim words white in place when they become final, moving nothing", async () => {
    const { line: row, rerender } = await render(<LiveCaptions label="Captions" lines={[mara("1", "Shall we start the", false)]} />);
    const before = row("1");
    const words = () => before.querySelector<HTMLElement>("[data-ouro-live-captions-words]")!;
    expect(before.hasAttribute("data-final")).toBe(false);
    const muted = over(getComputedStyle(words()).color, [0, 0, 0]);
    over("rgb(255 255 255 / 0.7)", [0, 0, 0]).forEach((channel, index) => expect(muted[index]).toBeCloseTo(channel, -0.5));
    const where = words().getBoundingClientRect().toJSON();
    const rowAt = before.getBoundingClientRect().toJSON();
    await rerender(<LiveCaptions label="Captions" lines={[mara("1", "Shall we start the")]} />);
    // The same element, now final: its colour eases to white, and nothing else changes.
    expect(row("1")).toBe(before);
    expect(before.getAttribute("data-final")).toBe("");
    const running = words().getAnimations().map((animation) => (animation as CSSTransition).transitionProperty);
    expect(running).toEqual(["color"]);
    await expect.poll(() => words().getAnimations().length).toBe(0);
    expect(getComputedStyle(words()).color).toBe("rgb(255, 255, 255)");
    expect(words().getBoundingClientRect().toJSON()).toEqual(where);
    expect(before.getBoundingClientRect().toJSON()).toEqual(rowAt);
  });

  it("is exactly maxLines lines tall, empty, full and overflowing, so nothing around it moves", async () => {
    const long = "and then we can go through the plan for next week, the budget, the hiring and the launch in that order";
    const { band, window: view, rows, rerender } = await render(<LiveCaptions label="Captions" lines={[]} />);
    const heights = () => [band.getBoundingClientRect().height, view.getBoundingClientRect().height];
    const lineHeight = parseFloat(getComputedStyle(view).lineHeight);
    expect(lineHeight).toBe(28);
    expect(view.getBoundingClientRect().height).toBe(56);
    const empty = heights();
    expect(rows.length).toBe(0);
    for (const lines of [[mara("1", "Shall we start?")], [mara("1", "Shall we start?"), jonas("2", "Yes.")], [mara("1", "Shall we start?"), jonas("2", "Yes."), mara("3", long, false)], [mara("1", "a"), jonas("2", "b"), mara("3", "c"), jonas("4", "d"), mara("5", "e")]]) {
      await rerender(<LiveCaptions label="Captions" lines={lines} />);
      expect(heights()).toEqual(empty);
    }
    await expect.poll(() => lift(band.querySelector("[data-ouro-live-captions-track]")!)).toBe(0);
    // The newest lines, and one more above them over the top edge: d and e show, c is out of sight.
    const shown = [...band.querySelectorAll<HTMLElement>("[data-ouro-live-captions-line]")];
    expect(shown.map((row) => row.dataset["ouroLiveCaptionsLine"])).toEqual(["3", "4", "5"]);
    const edge = view.getBoundingClientRect();
    expect(shown[2]!.getBoundingClientRect().bottom).toBeCloseTo(edge.bottom, 0);
    expect(shown[1]!.getBoundingClientRect().top).toBeCloseTo(edge.top, 0);
    expect(shown[0]!.getBoundingClientRect().bottom).toBeLessThanOrEqual(edge.top + 0.5);
    expect(getComputedStyle(view).overflow).toBe("hidden");
    // A long line wraps; the band keeps its newest words on the last line and its height.
    await rerender(<LiveCaptions label="Captions" lines={[mara("1", long)]} maxLines={3} />);
    await expect.poll(() => lift(band.querySelector("[data-ouro-live-captions-track]")!)).toBe(0);
    expect(view.getBoundingClientRect().height).toBe(84);
    const only = band.querySelector<HTMLElement>('[data-ouro-live-captions-line="1"]')!;
    expect(only.getBoundingClientRect().bottom).toBeCloseTo(view.getBoundingClientRect().bottom, 0);
  });

  it("keeps 2 lines by default, or the nearest whole number from 1 to 6", async () => {
    const tall = async (maxLines?: number) => (await render(<LiveCaptions label="Captions" lines={[]} maxLines={maxLines} />)).window.getBoundingClientRect().height / 28;
    expect(await tall()).toBe(2);
    expect(await tall(1)).toBe(1);
    expect(await tall(6)).toBe(6);
    expect(await tall(0)).toBe(1);
    expect(await tall(9)).toBe(6);
    expect(await tall(2.6)).toBe(3);
    expect(await tall(Number.NaN)).toBe(2);
    expect(warnings()).toEqual([
      "[ouro-ui] LiveCaptions: maxLines={0} is not a whole number from 1 to 6. Fix: <LiveCaptions maxLines={1}>.",
      "[ouro-ui] LiveCaptions: maxLines={9} is not a whole number from 1 to 6. Fix: <LiveCaptions maxLines={6}>.",
      "[ouro-ui] LiveCaptions: maxLines={2.6} is not a whole number from 1 to 6. Fix: <LiveCaptions maxLines={3}>.",
      "[ouro-ui] LiveCaptions: maxLines={NaN} is not a whole number from 1 to 6. Fix: <LiveCaptions maxLines={2}>.",
    ]);
  });

  it("sets its words at 14, 18 and 24px on 20, 28 and 32px lines, md by default", async () => {
    const measure = async (size?: LiveCaptionsProps["size"]) => {
      const { band, window: view } = await render(<LiveCaptions label="Captions" lines={[mara("1", "Hello")]} size={size} />);
      const style = getComputedStyle(view);
      const pad = getComputedStyle(band);
      return [style.fontSize, style.lineHeight, view.getBoundingClientRect().height, pad.paddingInlineStart, pad.paddingTop, band.dataset["size"]];
    };
    expect(await measure()).toEqual(["18px", "28px", 56, "16px", "8px", "md"]);
    expect(await measure("sm")).toEqual(["14px", "20px", 40, "12px", "6px", "sm"]);
    expect(await measure("md")).toEqual(["18px", "28px", 56, "16px", "8px", "md"]);
    expect(await measure("lg")).toEqual(["24px", "32px", 64, "20px", "12px", "lg"]);
    expect(warnings()).toEqual([]);
  });

  it("draws a solid translucent black band with rounded corners and no blur", async () => {
    const { band } = await render(<LiveCaptions label="Captions" lines={[mara("1", "Hello")]} />);
    const style = getComputedStyle(band);
    expect(over(style.backgroundColor, [255, 255, 255])).toEqual(over("rgb(0 0 0 / 0.8)", [255, 255, 255]));
    expect(over(style.backgroundColor, [0, 0, 0])).toEqual([0, 0, 0]);
    expect(style.backdropFilter).toBe("none");
    expect(parseFloat(style.borderTopLeftRadius)).toBeGreaterThan(0);
    expect(parseFloat(style.borderTopWidth)).toBe(0);
  });

  it("goes solid black under reduced transparency, and white on solid black with an edge under more contrast", async () => {
    const { band, rerender } = await render(<LiveCaptions label="Captions" lines={[mara("1", "Hello", false)]} />);
    // No test browser emulates reduced transparency, so read the rule the page compiled.
    expect(band.classList.contains("[@media(prefers-reduced-transparency:reduce)]:bg-black")).toBe(true);
    const rules = (list: CSSRuleList): CSSRule[] => [...list].flatMap((rule) => [rule, ...("cssRules" in rule ? rules((rule as CSSGroupingRule).cssRules) : [])]);
    const solid = [...document.styleSheets].flatMap((sheet) => rules(sheet.cssRules)).filter((rule) => rule instanceof CSSMediaRule && /prefers-reduced-transparency: ?reduce/.test(rule.conditionText));
    expect(solid.some((rule) => /bg-black/.test(rule.parentRule?.cssText ?? rule.cssText) && /background-color: var\(--color-black\)/.test(rule.cssText))).toBe(true);
    expect(pageCss()).toContain("prefers-reduced-transparency");
    await commands.emulateMedia({ contrast: "more" });
    await rerender(<LiveCaptions label="Captions" lines={[mara("1", "Hello", false)]} />);
    const style = getComputedStyle(band);
    expect(style.backgroundColor).toBe("rgb(0, 0, 0)");
    expect(style.borderTopStyle).toBe("solid");
    expect(parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
    expect(style.borderTopColor).toBe("rgb(255, 255, 255)");
    // Words not yet final are white too; their colour eases there.
    for (const part of ["label", "speaker", "words"]) await expect.poll(() => getComputedStyle(band.querySelector(`[data-ouro-live-captions-${part}]`)!).color).toBe("rgb(255, 255, 255)");
  });

  it("keeps its words and fill apart under forced colours, with an edge around the band", async () => {
    await commands.emulateMedia({ forcedColors: "active" });
    const { band } = await render(<LiveCaptions label="Captions" lines={[mara("1", "Shall we start?"), jonas("2", "Yes, go", false)]} />);
    const style = getComputedStyle(band);
    expect(style.borderTopStyle).toBe("solid");
    expect(parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
    expect(style.borderTopColor).toBe(computed("CanvasText"));
    expect(style.backgroundColor).toBe(computed("Canvas"));
    const [finalWords, interimWords] = [...band.querySelectorAll("[data-ouro-live-captions-words]")];
    await expect.poll(() => getComputedStyle(finalWords!).color).toBe(computed("CanvasText"));
    expect(getComputedStyle(band.querySelector("[data-ouro-live-captions-speaker]")!).color).toBe(computed("CanvasText"));
    expect(getComputedStyle(band.querySelector("[data-ouro-live-captions-label]")!).color).toBe(computed("CanvasText"));
    await expect.poll(() => getComputedStyle(interimWords!).color).toBe(computed("GrayText"));
    expect(computed("GrayText")).not.toBe(computed("Canvas"));
  });

  it("keeps names and words at 4.5:1 or more over a white picture, under stock shadcn and Ouro colours", async () => {
    const primaries = ["oklch(0.205 0 0)", "oklch(0.922 0 0)", "#0066cc", "#2997ff"];
    for (const primary of primaries) {
      const { band, host } = await render(<LiveCaptions label="Captions" lines={[mara("1", "Final words"), jonas("2", "Interim words", false)]} />);
      host.style.setProperty("--primary", primary);
      for (const picture of [[255, 255, 255], [0, 0, 0]] as Rgb[]) {
        const fill = over(getComputedStyle(band).backgroundColor, picture);
        await expect.poll(() => band.querySelectorAll("[data-ouro-live-captions-words]")[1]!.getAnimations().length).toBe(0);
        for (const part of band.querySelectorAll("[data-ouro-live-captions-speaker], [data-ouro-live-captions-words], [data-ouro-live-captions-label]")) {
          const ratio = contrast(over(getComputedStyle(part).color, fill), fill);
          expect(ratio, `${primary} ${part.textContent} over ${picture.join(",")}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("lays its lines from the start edge in either direction", async () => {
    // Made-up words in a right-to-left script: a name, then what was said.
    const rtl = line("1", "\u05de\u05e8\u05d4 \u05dc\u05d9\u05e0\u05d3", "\u05e9\u05dc\u05d5\u05dd");
    const { host, window: view, line: row, rerender } = await render(<LiveCaptions label="Captions" lines={[mara("1", "Hello")]} />);
    const speaker = () => row("1").querySelector("[data-ouro-live-captions-speaker]")!.getBoundingClientRect();
    const words = () => row("1").querySelector("[data-ouro-live-captions-words]")!.getBoundingClientRect();
    expect(speaker().left).toBeCloseTo(view.getBoundingClientRect().left, 0);
    expect(speaker().left).toBeLessThan(words().left);
    host.dir = "rtl";
    await rerender(<LiveCaptions label="Captions" lines={[rtl]} />);
    await expect.poll(() => Math.round(speaker().right)).toBe(Math.round(view.getBoundingClientRect().right));
    expect(speaker().left).toBeGreaterThan(words().right);
    expect(row("1").querySelector("[data-ouro-live-captions-speaker]")!.textContent).toBe("\u05de\u05e8\u05d4");
  });

  it("keeps layout classes and passes ids and refs through", async () => {
    let element: HTMLDivElement | null = null;
    const { band } = await render(<LiveCaptions label="Captions" lines={[]} className="mt-4 max-w-md" id="call-captions" ref={(node) => void (element = node)} />);
    expect(band.classList.contains("mt-4")).toBe(true);
    expect(band.getBoundingClientRect().width).toBe(448);
    expect(band.id).toBe("call-captions");
    expect(element).toBe(band);
    expect(warnings()).toEqual([]);
  });

  it("renders the same on the server and hydrates without a mismatch", async () => {
    const node = <LiveCaptions label="Captions" lines={[mara("1", "Shall we start?"), jonas("2", "Yes", false)]} maxLines={3} />;
    const html = renderToString(node);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const served = doc.querySelector('[role="region"]')!;
    expect(doc.getElementById(served.getAttribute("aria-labelledby")!)!.textContent).toBe("Captions");
    expect(served.querySelectorAll("[data-ouro-live-captions-line]").length).toBe(2);
    expect(served.getAttribute("style")).toContain("--ouro-live-captions-lines:3");
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
    await expect.element(page.getByRole("region", { name: "Captions" })).toBeInTheDocument();
  });

  it("warns, once each, for guessed props, repeated ids and appearance classes, and renders the defaults", async () => {
    const guessed = { captions: [], readAloud: true, size: "xl" } as unknown as LiveCaptionsProps;
    const lines = [mara("1", "a"), { ...jonas("1", "b"), isFinal: true } as unknown as LiveCaptionLine];
    // React reports the repeated key too; the development message says how to fix it.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { band, window: view, rerender } = await render(<LiveCaptions {...guessed} label="Captions" lines={lines} className="bg-red-500" />);
    expect(error).toHaveBeenCalled();
    expect(band.dataset["size"]).toBe("md");
    expect(view.getBoundingClientRect().height).toBe(56);
    await rerender(<LiveCaptions {...guessed} label="Captions" lines={[...lines]} className="bg-red-500" />);
    expect(warnings()).toEqual([
      '[ouro-ui] LiveCaptions: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; the band keeps its own look over video, and size="lg" makes the words larger.',
      '[ouro-ui] LiveCaptions: size="xl" is not a size; use "sm", "md", "lg". Fix: <LiveCaptions size="md">.',
      '[ouro-ui] LiveCaptions: two lines share an id; give each line its own and keep it while the line firms up. Fix: <LiveCaptions lines={[{ id: "a1", speaker, text, final }]}>.',
      "[ouro-ui] LiveCaptions: isFinal is not a line field. Fix: { id, speaker, text, final: true }.",
      "[ouro-ui] LiveCaptions: captions is not a prop. Fix: <LiveCaptions lines={lines}>.",
      "[ouro-ui] LiveCaptions: readAloud is not a prop. Fix: <LiveCaptions announce>.",
    ]);
    expect(band.hasAttribute("captions")).toBe(false);
    expect(band.hasAttribute("readaloud")).toBe(false);
  });

  it("declares one agent read, the captions, behind listening consent and a filtered push, and no actions", () => {
    expect(liveCaptionsAx).toEqual({
      component: "LiveCaptions",
      reads: [{ id: "captions", summary: "What people say, once the person asks you to follow the meeting.", fields: ["speaker", "text", "at"], consent: "listening", push: "filtered" }],
      actions: [],
    });
    // No toggle: no element in the band carries an agent action.
    return render(<LiveCaptions label="Captions" lines={[mara("1", "Hello")]} />).then(({ band }) => expect(band.querySelector("[data-ax-action]")).toBeNull());
  });
});

describe("LiveCaptions announcements", () => {
  // The rate cap and the announcer's write are timers: hold the page's clock so a loaded runner
  // can't let a gap end between two steps.
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => vi.useRealTimers());
  /** Moves the page's timers on by `ms`. */
  const wait = (ms: number) => act(async () => vi.advanceTimersByTime(ms));

  it("announces a line once, when it becomes final, and never its interim words", async () => {
    const announced = watchAnnouncements();
    try {
      const { rerender } = await render(<LiveCaptions label="Captions" announce lines={[]} />);
      for (const text of ["Shall", "Shall we", "Shall we start"]) {
        await rerender(<LiveCaptions label="Captions" announce lines={[mara("1", text, false)]} />);
        await wait(500);
      }
      expect(announced.changes).toEqual([]);
      await rerender(<LiveCaptions label="Captions" announce lines={[mara("1", "Shall we start?")]} />);
      await wait(100);
      expect(announced.changes.map((change) => change.text)).toEqual(["Mara Lind: Shall we start?"]);
      // Through one polite live region, outside the band.
      const region = announced.changes[0]!.region;
      expect(region.getAttribute("aria-live")).toBe("polite");
      expect(region.closest('[data-ouro="live-captions"]')).toBeNull();
      // The same final line again, and an interim one after it, say nothing more.
      await rerender(<LiveCaptions label="Captions" announce lines={[mara("1", "Shall we start?")]} />);
      await rerender(<LiveCaptions label="Captions" announce lines={[mara("1", "Shall we start?"), jonas("2", "Yes", false)]} />);
      await wait(5000);
      expect(announced.changes.length).toBe(1);
    } finally {
      announced.stop();
    }
  });

  it("reads at most one announcement every 2 seconds, and batches the lines that finish in between into the next", async () => {
    const announced = watchAnnouncements();
    const said = () => announced.changes.map((change) => change.text);
    try {
      const a = mara("1", "Shall we start?");
      const b = jonas("2", "Yes.");
      const c = jonas("3", "Go ahead.");
      const d = mara("4", "First, the plan.");
      const e = mara("5", "Then the budget.");
      const { rerender } = await render(<LiveCaptions label="Captions" announce lines={[]} />);
      await rerender(<LiveCaptions label="Captions" announce lines={[a]} />);
      await wait(100);
      expect(said()).toEqual(["Mara Lind: Shall we start?"]);
      await rerender(<LiveCaptions label="Captions" announce lines={[a, b]} />);
      await wait(400);
      await rerender(<LiveCaptions label="Captions" announce lines={[a, b, c, mara("4", "First", false)]} />);
      await wait(1499);
      // 1,999ms after the first: nothing new yet.
      expect(said()).toEqual(["Mara Lind: Shall we start?"]);
      await wait(1);
      await wait(100);
      // Two lines that finished in the gap, read together, the speaker's name once; the interim one waits.
      expect(said()).toEqual(["Mara Lind: Shall we start?", "Jonas Ek: Yes. Go ahead."]);
      await rerender(<LiveCaptions label="Captions" announce lines={[a, b, c, d, e]} />);
      await wait(1899);
      expect(said().length).toBe(2);
      await wait(1);
      await wait(100);
      expect(said()).toEqual(["Mara Lind: Shall we start?", "Jonas Ek: Yes. Go ahead.", "Mara Lind: First, the plan. Then the budget."]);
      // After a quiet gap, the next final line is read at once.
      await wait(2000);
      await rerender(<LiveCaptions label="Captions" announce lines={[a, b, c, d, e, jonas("6", "Sounds good.")]} />);
      await wait(100);
      expect(said().at(-1)).toBe("Jonas Ek: Sounds good.");
      expect(said().length).toBe(4);
    } finally {
      announced.stop();
    }
  });

  it("announces nothing by default, nor once announce is turned off", async () => {
    const announced = watchAnnouncements();
    try {
      const a = mara("1", "Shall we start?");
      const b = jonas("2", "Yes.");
      const { host, rerender } = await render(<LiveCaptions label="Captions" lines={[]} />);
      await rerender(<LiveCaptions label="Captions" lines={[a]} />);
      await wait(3000);
      expect(announced.changes).toEqual([]);
      expect(host.querySelector('[aria-live], [role="status"], [role="alert"], [role="log"]')).toBeNull();
      await rerender(<LiveCaptions label="Captions" announce lines={[a]} />);
      await rerender(<LiveCaptions label="Captions" announce lines={[a, b]} />);
      await wait(100);
      expect(announced.changes.map((change) => change.text)).toEqual(["Jonas Ek: Yes."]);
      // A line that finishes in the gap, then announce goes off: it is dropped, not read later.
      await rerender(<LiveCaptions label="Captions" announce lines={[a, b, mara("3", "Good.")]} />);
      await rerender(<LiveCaptions label="Captions" lines={[a, b, mara("3", "Good.")]} />);
      await wait(5000);
      expect(announced.changes.length).toBe(1);
      // On again: what finished while it was off is not read, and the next line is read at once.
      await rerender(<LiveCaptions label="Captions" announce lines={[a, b, mara("3", "Good.")]} />);
      await rerender(<LiveCaptions label="Captions" announce lines={[a, b, mara("3", "Good."), jonas("4", "Next.")]} />);
      await wait(100);
      expect(announced.changes.map((change) => change.text)).toEqual(["Jonas Ek: Yes.", "Jonas Ek: Next."]);
    } finally {
      announced.stop();
    }
  });

  it("does not read lines that were final before announcing began", async () => {
    const announced = watchAnnouncements();
    try {
      const { rerender } = await render(<LiveCaptions label="Captions" announce lines={[mara("1", "Earlier."), jonas("2", "Still going", false)]} />);
      await wait(3000);
      expect(announced.changes).toEqual([]);
      await rerender(<LiveCaptions label="Captions" announce lines={[mara("1", "Earlier."), jonas("2", "Still going.")]} />);
      await wait(100);
      expect(announced.changes.map((change) => change.text)).toEqual(["Jonas Ek: Still going."]);
    } finally {
      announced.stop();
    }
  });

  it("stops its gap timer when it unmounts, so nothing is read after", async () => {
    const announced = watchAnnouncements();
    try {
      const { root, rerender } = await render(<LiveCaptions label="Captions" announce lines={[]} />);
      await rerender(<LiveCaptions label="Captions" announce lines={[mara("1", "One.")]} />);
      await rerender(<LiveCaptions label="Captions" announce lines={[mara("1", "One."), jonas("2", "Two.")]} />);
      await wait(100);
      await act(async () => root.unmount());
      roots.splice(roots.indexOf(root), 1);
      expect(vi.getTimerCount()).toBe(0);
      await wait(5000);
      expect(announced.changes.map((change) => change.text)).toEqual(["Mara Lind: One."]);
    } finally {
      announced.stop();
    }
  });
});

describe("LiveCaptions motion", () => {
  it("slides older lines up and off the top as a new line comes, and with reduced motion moves them at once", async () => {
    const a = mara("1", "Shall we start?");
    const b = jonas("2", "Yes.");
    const c = mara("3", "First, the plan.");
    const d = jonas("4", "Go on.");
    const e = mara("5", "Then the budget.");
    const { window: view, track, line: row, rerender } = await render(<LiveCaptions label="Captions" lines={[a, b]} />);
    expect(track.getAnimations()).toEqual([]);
    const bottom = () => view.getBoundingClientRect().bottom;
    // An interim line growing on its own line moves nothing.
    await rerender(<LiveCaptions label="Captions" lines={[a, mara("2", "Yes, go", false)]} />);
    expect(track.getAnimations()).toEqual([]);
    await rerender(<LiveCaptions label="Captions" lines={[a, b]} />);
    await rerender(<LiveCaptions label="Captions" lines={[a, b, c]} />);
    // The lines start where they were and slide up one line, on the base duration and the ease-out curve.
    const [slide] = track.getAnimations() as CSSTransition[];
    expect(slide!.transitionProperty).toBe("translate");
    const style = getComputedStyle(track);
    expect(style.transitionDuration).toBe("0.2s");
    expect(style.transitionTimingFunction).toBe("cubic-bezier(0.23, 1, 0.32, 1)");
    const first = lift(track);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(28);
    // Another line before the slide ends: the lines start from where they are drawn, one more line down.
    await rerender(<LiveCaptions label="Captions" lines={[a, b, c, d]} />);
    expect(lift(track)).toBeGreaterThan(28);
    expect(lift(track)).toBeLessThanOrEqual(first + 28 + 0.5);
    await expect.poll(() => track.getAnimations().length).toBe(0);
    expect(lift(track)).toBe(0);
    expect(row("4").getBoundingClientRect().bottom).toBeCloseTo(bottom(), 0);

    await commands.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    await rerender(<LiveCaptions label="Captions" lines={[a, b, c, d]} />);
    await rerender(<LiveCaptions label="Captions" lines={[a, b, c, d, e]} />);
    expect(track.getAnimations()).toEqual([]);
    expect(lift(track)).toBe(0);
    expect(row("5").getBoundingClientRect().bottom).toBeCloseTo(bottom(), 0);
    expect(row("4").getBoundingClientRect().bottom).toBeCloseTo(bottom() - 28, 0);
  });
});
