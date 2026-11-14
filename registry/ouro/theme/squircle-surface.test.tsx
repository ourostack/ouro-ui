import { afterEach, describe, expect, it } from "vitest";
import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
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
});
