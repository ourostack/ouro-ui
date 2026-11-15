import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, server, userEvent } from "vitest/browser";
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
    expect(getComputedStyle(surface).clipPath).toMatch(/^polygon\(/);
    expect(getComputedStyle(surface, "::after").clipPath).toMatch(/^polygon\(evenodd/);
    expect(getComputedStyle(button).borderTopColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(button, "::before").display).toBe("none");
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
    expect(getComputedStyle(label).position).toBe("relative");
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
    expect(getComputedStyle(surface).clipPath).toMatch(/^polygon\(/);
    expect(getComputedStyle(surface).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(outlined!).borderTopColor).toBe("rgba(0, 0, 0, 0)");
    expect(bare!.querySelector("[data-ouro-surface]")).toBeNull();
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
    expect(getComputedStyle(surface).clipPath).toMatch(/^polygon\(/);
    expect(getComputedStyle(surface, "::after").clipPath).toMatch(/^polygon\(evenodd/);
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
    expect(getComputedStyle(surface).clipPath).toMatch(/^polygon\(/);
    expect(getComputedStyle(surface, "::after").clipPath).toMatch(/^polygon\(evenodd/);
    expect(getComputedStyle(first).borderTopColor).toBe("rgba(0, 0, 0, 0)");
    const bd = (el: HTMLElement) => getComputedStyle(el.querySelector<HTMLElement>("[data-ouro-surface]")!, "::after").backgroundColor;
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
    expect(getComputedStyle(surface).clipPath).toMatch(/^polygon\(/);
    expect(getComputedStyle(surface).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(solid).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    const ring = (el: HTMLElement) => getComputedStyle(el.querySelector<HTMLElement>("[data-ouro-surface]")!, "::after").backgroundColor;
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
    expect(getComputedStyle(surface).clipPath).toMatch(/^polygon\(/);
    expect(getComputedStyle(surface).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(surface, "::after").backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
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
    expect(getComputedStyle(round).clipPath).toMatch(/^polygon\(/);
    expect(getComputedStyle(round).getPropertyValue("--ouro-sq-r")).toBe("44%");
    expect(getComputedStyle(square).clipPath).toMatch(/^polygon\(/);
    expect(getComputedStyle(square).getPropertyValue("--ouro-sq-r")).toBe("24%");
  });
});

describe("typing beside squircle controls where the engine has no corner-shape", () => {
  // Safari and WKWebView redraw every clip path a repaint touches, so typing that repainted the controls around a field
  // cost each key the clip paths' work. Chromium's layers stand in for WebKit's: CDP lists them, and WebKit's do not.
  it.skipIf(server.browser !== "chromium")("draws each squircle control on a layer of its own, so typing in a field beside it never redraws its edge", async () => {
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
    const names = (layers: { element: string | null }[]) => layers.map((layer) => layer.element);
    const before = names(await commands.compositedLayers());
    applyFallback();
    const squircles = document.querySelectorAll("[data-ouro-squircle], [data-ouro-avatar-surface]");
    expect(squircles).toHaveLength(7);
    const after = names(await commands.compositedLayers());
    for (const element of before) after.splice(after.indexOf(element), 1);
    expect(after.length).toBeGreaterThanOrEqual(squircles.length);
    const own = ['BUTTON[data-ouro="button"]', 'SPAN[data-ouro="badge"]', 'BUTTON[data-ouro="toggle"]', 'DIV[data-ouro="card"]'];
    const layered = (elements: (string | null)[]) => own.filter((name) => elements.some((element) => element?.startsWith(name)));
    expect(layered(after)).toEqual(own);
    await userEvent.type(document.querySelector("input")!, "see you soon");
    expect(layered(names(await commands.compositedLayers()))).toEqual(own);
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
});
