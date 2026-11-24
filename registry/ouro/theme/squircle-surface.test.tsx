import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, server } from "vitest/browser";
import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { Dialog } from "@/registry/ouro/components/ouro/dialog/dialog";
import { TextField } from "@/registry/ouro/components/ouro/text-field/text-field";
import { Badge } from "@/registry/ouro/components/ouro/badge/badge";
import { Toggle } from "@/registry/ouro/components/ouro/toggle/toggle";
import { Card } from "@/registry/ouro/components/ouro/card/card";
import { Avatar } from "@/registry/ouro/components/ouro/avatar/avatar";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { pageCss } from "@/registry/ouro/lib/ouro/testing/page-css";

const styles: HTMLStyleElement[] = [];
const roots: { root: Root; host: HTMLElement }[] = [];
async function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push({ root, host });
  await act(() => root.render(node));
  return host.querySelector("button") as HTMLElement;
}
afterEach(async () => {
  for (const { root, host } of roots.splice(0)) {
    await act(() => root.unmount());
    host.remove();
  }
  for (const style of styles.splice(0)) style.remove();
  vi.restoreAllMocks();
});

/** The ring is a rounded border inside the fill's squircle clip, with no clip path of its own to draw. */
function expectBorderRing(surface: HTMLElement) {
  const ring = getComputedStyle(surface, "::after");
  expect(ring.clipPath).toBe("none");
  expect(ring.borderTopWidth).toBe("1px");
  expect(ring.borderTopStyle).toBe("solid");
  expect(Number.parseFloat(ring.borderTopLeftRadius)).toBeGreaterThan(1);
}

/** The fallback rules as an engine without corner-shape applies them: the same block, with its condition taken off. */
function applyFallback() {
  const css = pageCss();
  const blocks = [...css.matchAll(/@supports not \(corner-shape: squircle\)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map((match) => match[1]);
  const style = document.createElement("style");
  style.textContent = blocks.join("\n");
  document.head.append(style);
  styles.push(style);
}

describe("squircle surface where the engine has no corner-shape", () => {
  it("keeps a Button's own paint where corner-shape is supported, and shows no surface", async () => {
    const button = await mount(<Button>Save</Button>);
    const surface = button.querySelector<HTMLElement>("[data-ouro-surface]")!;
    expect(getComputedStyle(surface).display).toBe("none");
    expect(getComputedStyle(button).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("paints a Button's fill and ring through squircle clip paths, leaving the element's own paint clear", async () => {
    applyFallback();
    const button = await mount(<Button variant="outline">Save</Button>);
    const surface = button.querySelector<HTMLElement>("[data-ouro-surface]")!;
    expect(getComputedStyle(surface).display).toBe("block");
    expect(getComputedStyle(surface).clipPath).toMatch(/^shape\(/);
    expectBorderRing(surface);
    expect(getComputedStyle(button).borderTopColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(button, "::before").display).toBe("none");
  });

  it.each([
    ["a capsule (9999px), its corner size half the button's height", "9999px", "half"],
    ["Pearl's lg step (unset), its own corner size", undefined, "own"],
  ] as const)("draws a Button's squircle for %s, never a square box", async (_name, radius, expected) => {
    applyFallback();
    const host = document.createElement("div");
    if (radius) host.style.setProperty("--ouro-control-radius", radius);
    document.body.append(host);
    const root = createRoot(host);
    roots.push({ root, host });
    await act(() => root.render(<Button variant="outline">Save</Button>));
    const button = host.querySelector("button")!;
    const surface = button.querySelector<HTMLElement>("[data-ouro-surface]")!;
    const half = button.getBoundingClientRect().height / 2;
    expect(half).toBeGreaterThan(10);
    const own = Number.parseFloat(getComputedStyle(button).borderTopLeftRadius) / 0.7;
    if (expected === "own") expect(own).toBeLessThan(half);
    const start = getComputedStyle(surface).clipPath.match(/^shape\(from 0px ([\d.]+)px/);
    expect(start).not.toBeNull();
    expect(Number(start![1])).toBeCloseTo(expected === "half" ? half : own, 0);
  });

  it("lets an app's own fill and border classes on a Button win, with and without corner-shape", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const own = await mount(<Button className="bg-red-500 border-blue-500">Save</Button>);
    expect(getComputedStyle(own).backgroundColor).toMatch(/^(oklch|rgb|color)/);
    const native = getComputedStyle(own).backgroundColor;
    const plain = await mount(<Button>Plain</Button>);
    expect(native).not.toBe(getComputedStyle(plain).backgroundColor);
    applyFallback();
    expect(getComputedStyle(own).backgroundColor).toBe(native);
    expect(getComputedStyle(own).borderTopColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(plain).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("stacks the label above the surface, and leaves the box-shadow and outline on the element", async () => {
    applyFallback();
    const button = await mount(<Button>Save</Button>);
    const surface = button.querySelector<HTMLElement>("[data-ouro-surface]")!;
    const label = button.querySelector<HTMLElement>("[data-ouro-label]")!;
    const position = surface.compareDocumentPosition(label);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Its own stacking context paints it with the positioned surface, in document order, so above it (#3368: not
    // `relative`, which would anchor an app's absolutely placed children to the label).
    expect(getComputedStyle(label).isolation).toBe("isolate");
    // The label is otherwise non-positioned (static), so it stays off the surface's own stacking context;
    // the surface's negative z-index is what keeps it under the label's paint, as every other
    // data-ouro-surface consumer (Badge, Card, Toggle, Dialog, TextField) already relies on (#3396).
    expect(getComputedStyle(label).position).toBe("static");
    expect(getComputedStyle(surface).zIndex).toBe("-1");
    expect(getComputedStyle(button).borderTopLeftRadius).not.toBe("0px");
  });

  it("paints a Card's fill and ring through the surface, and leaves a plain Card without one", async () => {
    applyFallback();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push({ root, host });
    await act(() =>
      root.render(
        <>
          <Card title="Outlined">x</Card>
          <Card title="Bare" variant="plain">x</Card>
        </>,
      ),
    );
    const [outlined, bare] = [...host.querySelectorAll<HTMLElement>("[data-ouro=card]")];
    const surface = outlined!.querySelector<HTMLElement>(":scope > [data-ouro-surface]")!;
    expect(getComputedStyle(surface).clipPath).toMatch(/^shape\(/);
    expect(getComputedStyle(surface).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(outlined!).borderTopColor).toBe("rgba(0, 0, 0, 0)");
    expect(bare!.querySelector("[data-ouro-surface]")).toBeNull();
  });

  it("clips a Card's backdrop, and only it, to the squircle at the card's radius", async () => {
    applyFallback();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push({ root, host });
    await act(() =>
      root.render(
        <Card backdrop={<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" />} footer={<Button>Start</Button>}>
          x
        </Card>,
      ),
    );
    const card = host.querySelector<HTMLElement>("[data-ouro=card]")!;
    const backdrop = card.querySelector<HTMLElement>(":scope > [data-card-backdrop]")!;
    // The card's own corner is a circle at 0.7 of the squircle's radius (--ouro-corner-fallback) where corner-shape is missing.
    const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius) / 0.7;
    expect(radius).toBeGreaterThan(1);
    // The squircle at the card's radius, starting down the left edge at that radius, as an avatar's photo is clipped.
    const clip = getComputedStyle(backdrop).clipPath;
    const start = clip.match(/^shape\(from 0px ([\d.]+)px/);
    expect(start).not.toBeNull();
    expect(Number(start![1])).toBeCloseTo(radius, 1);
    expect(clip).not.toMatch(/round|circle|ellipse/);
    // The clip is its only edge: no circular corner or overflow clip under it.
    expect(getComputedStyle(backdrop).borderTopLeftRadius).toBe("0px");
    expect(getComputedStyle(backdrop).overflow).toBe("visible");
    // The card, its text and its controls aren't clipped.
    expect(getComputedStyle(card).clipPath).toBe("none");
    expect(getComputedStyle(card).overflow).toBe("visible");
    const button = card.querySelector("button")!;
    for (let node: Element | null = button; node && node !== card; node = node.parentElement) expect(getComputedStyle(node).clipPath).toBe("none");
  });

  it.each([
    ["md", 1.4],
    ["sm", 1],
  ] as const)("clips a plain %s Card's backdrop to the squircle at the radius plain media rounds to", async (size, scale) => {
    applyFallback();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push({ root, host });
    await act(() =>
      root.render(
        <Card variant="plain" size={size} backdrop={<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" />}>
          x
        </Card>,
      ),
    );
    const backdrop = host.querySelector<HTMLElement>("[data-card-backdrop]")!;
    const radius = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--radius")) * 16 * scale;
    const start = getComputedStyle(backdrop).clipPath.match(/^shape\(from 0px ([\d.]+)px/);
    expect(start).not.toBeNull();
    expect(Number(start![1])).toBeCloseTo(radius, 1);
    expect(getComputedStyle(backdrop).borderTopLeftRadius).toBe("0px");
  });
});

describe("a Dialog where the engine has no corner-shape", () => {
  it("paints the dialog's fill and ring through its surface layer, and hides its own ring", async () => {
    applyFallback();
    await mount(
      <Dialog title="Edit" presentation="dialog" open onOpenChange={() => {}}>
        body
      </Dialog>,
    );
    const popup = document.querySelector<HTMLElement>("[data-ouro-squircle]")!;
    const surface = popup.querySelector<HTMLElement>("[data-ouro-surface]")!;
    expect(getComputedStyle(surface).clipPath).toMatch(/^shape\(/);
    expectBorderRing(surface);
    expect(getComputedStyle(popup).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(popup).getPropertyValue("--tw-ring-color")).toBe("transparent");
  });

  it("paints a TextField's fill and border through the surface, and turns the border destructive when invalid", async () => {
    applyFallback();
    await mount(
      <>
        <TextField label="Name" />
        <TextField label="Email" error="Required" />
      </>,
    );
    const [first, second] = [...document.querySelectorAll<HTMLElement>("[data-ouro-input-group]")] as [HTMLElement, HTMLElement];
    const surface = first.querySelector<HTMLElement>("[data-ouro-surface]")!;
    expect(getComputedStyle(surface).clipPath).toMatch(/^shape\(/);
    expectBorderRing(surface);
    expect(getComputedStyle(first).borderTopColor).toBe("rgba(0, 0, 0, 0)");
    const bd = (el: HTMLElement) => getComputedStyle(el.querySelector<HTMLElement>("[data-ouro-surface]")!, "::after").borderTopColor;
    expect(bd(second)).not.toBe(bd(first));
  });

  it("paints a Badge's fill and border through the surface", async () => {
    applyFallback();
    await mount(
      <>
        <Badge tone="primary">Solid</Badge>
        <Badge variant="outline">Outline</Badge>
      </>,
    );
    const [solid, outline] = [...document.querySelectorAll<HTMLElement>('[data-ouro="badge"]')] as [HTMLElement, HTMLElement];
    const surface = solid.querySelector<HTMLElement>("[data-ouro-surface]")!;
    expect(getComputedStyle(surface).clipPath).toMatch(/^shape\(/);
    expect(getComputedStyle(surface).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(solid).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    const ring = (el: HTMLElement) => getComputedStyle(el.querySelector<HTMLElement>("[data-ouro-surface]")!, "::after").borderTopColor;
    expect(ring(outline)).not.toBe("rgba(0, 0, 0, 0)");
    expect(ring(solid)).toBe("rgba(0, 0, 0, 0)");
  });

  it("paints a rect Toggle through the surface, pressed fill included, and leaves a pill round", async () => {
    applyFallback();
    await mount(
      <>
        <Toggle label="Rect" variant="outline" defaultPressed />
        <Toggle label="Pill" shape="pill" />
      </>,
    );
    const [rect, pill] = [...document.querySelectorAll<HTMLElement>('[data-ouro="toggle"]')] as [HTMLElement, HTMLElement];
    const surface = rect.querySelector<HTMLElement>("[data-ouro-surface]")!;
    expect(rect.getAttribute("data-ouro-squircle")).toBe("");
    expect(surface.style.zIndex).toBe("-1");
    expect(getComputedStyle(surface).clipPath).toMatch(/^shape\(/);
    expect(getComputedStyle(surface).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(surface, "::after").borderTopColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(rect).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(pill.hasAttribute("data-ouro-squircle")).toBe(false);
    expect(pill.querySelector("[data-ouro-surface]")).toBeNull();
  });

  it("clips an Avatar's surface to a squircle of its own corner size, circle and square alike", async () => {
    applyFallback();
    await mount(
      <>
        <Avatar name="Ana Lind" />
        <Avatar name="Dev Team" shape="square" />
      </>,
    );
    const [round, square] = [...document.querySelectorAll<HTMLElement>("[data-ouro-avatar-surface]")] as [HTMLElement, HTMLElement];
    expect(getComputedStyle(round).clipPath).toMatch(/^shape\(/);
    expect(getComputedStyle(round).getPropertyValue("--ouro-sq-r")).toBe("44%");
    expect(getComputedStyle(square).clipPath).toMatch(/^shape\(/);
    expect(getComputedStyle(square).getPropertyValue("--ouro-sq-r")).toBe("24%");
  });
});

describe("the squircle's corner size where the engine has no corner-shape", () => {
  /** Each squircle's corner size in px, read through a probe that is as wide as --ouro-sq-r, by the element that sets it. */
  async function cornerSizes() {
    await mount(
      <>
        <Button>Save</Button>
        <Badge>New</Badge>
        <TextField label="Name" />
        <Toggle label="Bold" variant="outline" />
        <Card title="Outlined">x</Card>
        <Dialog title="Edit" presentation="dialog" open onOpenChange={() => {}}>
          body
        </Dialog>
      </>,
    );
    const sizes: Record<string, number> = {};
    for (const element of document.querySelectorAll<HTMLElement>('[class*="--ouro-sq-r:calc"], .rounded-ouro-control, .rounded-ouro-control-md')) {
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;display:block;width:var(--ouro-sq-r)";
      element.append(probe);
      sizes[element.closest("[data-ouro]")!.getAttribute("data-ouro")!] = Number.parseFloat(getComputedStyle(probe).width);
      probe.remove();
    }
    return sizes;
  }
  const expected = { button: 10, badge: 8, "text-field": 8, toggle: 10, card: 14, dialog: 14 };

  it("is --radius times its step, with shadcn init's radius steps in place of ouro-base's (#1828)", async () => {
    applyFallback();
    const shadcn = document.createElement("style");
    shadcn.textContent = ":root { --radius: 10px; --radius-md: calc(var(--radius) * 0.8); --radius-lg: var(--radius); --radius-xl: calc(var(--radius) * 1.4); }";
    document.head.append(shadcn);
    styles.push(shadcn);
    expect(await cornerSizes()).toEqual(expected);
  });

  it("is --radius times its step with ouro-base's own radius steps, and follows --ouro-radius-scale", async () => {
    applyFallback();
    const radius = document.createElement("style");
    radius.textContent = ":root { --radius: 10px; }";
    document.head.append(radius);
    styles.push(radius);
    expect(await cornerSizes()).toEqual(expected);
    radius.textContent = ":root { --radius: 10px; --ouro-radius-scale: 2; }";
    expect(await cornerSizes()).toEqual(Object.fromEntries(Object.entries(expected).map(([name, size]) => [name, size * 2])));
  });
});

describe("scrolling past squircle controls where the engine has no corner-shape", () => {
  // A layer of its own for every control kept its clip paths drawn, but WKWebView then composited every one on each
  // scroll frame of a long list. Chromium's layers stand in for WebKit's: CDP lists them, and WebKit's do not.
  it.skipIf(server.browser !== "chromium")("gives no squircle control a layer of its own, so a list of them scrolls as cheaply as plain ones", async () => {
    await mount(
      <>
        <TextField label="Message" />
        <Button>Send</Button>
        <Button variant="outline">Attach</Button>
        <Badge>New</Badge>
        <Toggle label="Bold" variant="outline" />
        <Card title="Thread">x</Card>
        <Avatar name="Ana Lind" />
      </>,
    );
    const before = (await commands.compositedLayers()).length;
    applyFallback();
    expect(document.querySelectorAll("[data-ouro-squircle], [data-ouro-avatar-surface]")).toHaveLength(7);
    expect(await commands.compositedLayers()).toHaveLength(before);
  });
});

describe("the squircle edge where the engine has no corner-shape", () => {
  /** The largest distance from a surface's drawn outline to the n=4 superellipse, as a share of its corner size. */
  it("follows the curve to within 0.4% of the corner size, so the edge is smooth", async () => {
    applyFallback();
    const host = document.createElement("div");
    host.innerHTML = '<div style="position:relative;width:400px;height:400px"><span data-ouro-surface style="--ouro-sq-r:200px;--ouro-sq-w:1px"></span></div>';
    document.body.append(host);
    const surface = host.querySelector<HTMLElement>("[data-ouro-surface]")!;
    const points = getComputedStyle(surface)
      .getPropertyValue("--ouro-sq-o")
      .replaceAll("var(--ouro-sq-r)", "200")
      .replaceAll("100%", "400")
      .split(",")
      .map((point) => {
        const terms: string[] = [];
        let depth = 0;
        let term = "";
        for (const ch of point.trim()) {
          if (ch === "(") depth++;
          if (ch === ")") depth--;
          if (ch === " " && depth === 0) {
            terms.push(term);
            term = "";
          } else term += ch;
        }
        terms.push(term);
        const [x, y] = terms.map((t) => Function(`return ${t.replaceAll("calc", "").replaceAll("px", "")}`)() as number);
        return [x!, y!] as const;
      });
    host.remove();
    expect(points.length).toBeGreaterThanOrEqual(40);
    const r = 200;
    let worst = 0;
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i]!;
      const [x2, y2] = points[(i + 1) % points.length]!;
      for (let s = 0; s <= 8; s++) {
        const x = x1 + ((x2 - x1) * s) / 8;
        const y = y1 + ((y2 - y1) * s) / 8;
        const cx = Math.min(x, 400 - x);
        const cy = Math.min(y, 400 - y);
        if (cx >= r || cy >= r) continue;
        const dx = (r - cx) / r;
        const dy = (r - cy) / r;
        worst = Math.max(worst, Math.abs((dx ** 4 + dy ** 4) ** 0.25 - 1));
      }
    }
    expect(worst).toBeLessThan(0.004);
  });

  it("draws each corner as Bézier curves within 0.1% of the curve, where the engine draws shape()", async () => {
    applyFallback();
    const host = document.createElement("div");
    host.innerHTML = '<div style="position:relative;width:400px;height:400px"><span data-ouro-surface style="--ouro-sq-r:200px;--ouro-sq-w:1px"></span></div>';
    document.body.append(host);
    const surface = host.querySelector<HTMLElement>("[data-ouro-surface]")!;
    const path = getComputedStyle(surface).getPropertyValue("--ouro-sq-path").trim();
    expect(getComputedStyle(surface).clipPath).toMatch(/^shape\(/);
    host.remove();
    const value = (term: string) => Function(`return ${term.replaceAll("var(--ouro-sq-r)", "200").replaceAll("100%", "400").replaceAll("calc", "").replaceAll("px", "")}`)() as number;
    /** The top-level terms of a shape() command, split at spaces outside parentheses. */
    const terms = (command: string) => {
      const out: string[] = [];
      let depth = 0;
      let term = "";
      for (const ch of command.trim()) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === " " && depth === 0) {
          if (term) out.push(term);
          term = "";
        } else term += ch;
      }
      if (term) out.push(term);
      return out;
    };
    const steps = path.replace(/^shape\(/, "").replace(/\)$/, "").split(/,(?![^(]*\))/);
    let at = [0, 0];
    const samples: number[][] = [];
    let curves = 0;
    for (const command of steps) {
      const t = terms(command);
      if (t[0] === "from") at = [value(t[1]!), value(t[2]!)];
      else if (t[0] === "line") {
        const next = [value(t[2]!), value(t[3]!)];
        for (let s = 0; s <= 8; s++) samples.push([at[0]! + ((next[0]! - at[0]!) * s) / 8, at[1]! + ((next[1]! - at[1]!) * s) / 8]);
        at = next;
      } else if (t[0] === "curve") {
        curves++;
        const end = [value(t[2]!), value(t[3]!)];
        const c1 = [value(t[5]!), value(t[6]!)];
        const c2 = [value(t[8]!), value(t[9]!)];
        for (let s = 0; s <= 64; s++) {
          const u = s / 64;
          const v = 1 - u;
          samples.push([0, 1].map((k) => v ** 3 * at[k]! + 3 * v * v * u * c1[k]! + 3 * v * u * u * c2[k]! + u ** 3 * end[k]!));
        }
        at = end;
      }
    }
    expect(curves).toBe(8);
    const r = 200;
    let worst = 0;
    for (const [x, y] of samples) {
      const cx = Math.min(x!, 400 - x!);
      const cy = Math.min(y!, 400 - y!);
      if (cx >= r || cy >= r) continue;
      const dx = (r - cx) / r;
      const dy = (r - cy) / r;
      worst = Math.max(worst, Math.abs((dx ** 4 + dy ** 4) ** 0.25 - 1));
    }
    expect(worst).toBeLessThan(0.001);
  });
});
