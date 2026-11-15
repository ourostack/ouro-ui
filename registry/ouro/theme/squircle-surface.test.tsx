import { afterEach, describe, expect, it } from "vitest";
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
