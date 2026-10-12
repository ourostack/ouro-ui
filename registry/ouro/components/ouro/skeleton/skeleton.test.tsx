import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { Skeleton, type SkeletonProps } from "@/registry/ouro/components/ouro/skeleton/skeleton";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  host.style.width = "300px";
  host.style.fontSize = "16px";
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return host.querySelector<HTMLElement>('[data-ouro="skeleton"]')!;
}

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

const warnings = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

describe("Skeleton", () => {
  it("is a decorative placeholder screen readers skip", async () => {
    const skeleton = await render(<Skeleton />);
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton.textContent).toBe("");
  });

  it("is a full-width rounded block by default", async () => {
    const skeleton = await render(<Skeleton />);
    const rect = skeleton.getBoundingClientRect();
    expect(skeleton.getAttribute("data-shape")).toBe("rect");
    expect(rect.width).toBe(300);
    expect(rect.height).toBe(16);
    expect(getComputedStyle(skeleton).borderTopLeftRadius).not.toBe("0px");
  });

  it("is a line of text with shape text, and a circle with shape circle", async () => {
    const text = await render(<Skeleton shape="text" />);
    expect(text.getBoundingClientRect().height).toBeCloseTo(16 * 0.75, 0);
    const circle = await render(<Skeleton shape="circle" />);
    const rect = circle.getBoundingClientRect();
    expect(rect.width).toBe(40);
    expect(rect.height).toBe(40);
    expect(Number.parseFloat(getComputedStyle(circle).borderTopLeftRadius)).toBeGreaterThanOrEqual(20);
  });

  it("takes its size from layout classes, and a circle stays round", async () => {
    expect((await render(<Skeleton className="h-24 w-32" />)).getBoundingClientRect()).toMatchObject({ width: 128, height: 96 });
    expect((await render(<Skeleton shape="circle" className="size-12" />)).getBoundingClientRect()).toMatchObject({ width: 48, height: 48 });
    expect((await render(<Skeleton shape="circle" className="w-16" />)).getBoundingClientRect()).toMatchObject({ width: 64, height: 64 });
    expect(warnings()).toEqual([]);
  });

  it("shimmers, and pulses its opacity instead with reduced motion", async () => {
    const skeleton = await render(<Skeleton />);
    expect(getComputedStyle(skeleton).animationName).toBe("ouro-shimmer");
    await commands.emulateMedia({ reducedMotion: "reduce" });
    expect(getComputedStyle(skeleton).animationName).toBe("ouro-pulse");
  });

  it("passes attributes through and renders on the server", async () => {
    const skeleton = await render(<Skeleton id="avatar" data-testid="avatar" />);
    expect(skeleton.id).toBe("avatar");
    expect(renderToString(<Skeleton shape="circle" />)).toContain('data-shape="circle"');
  });

  it("warns, once each, for guessed props, an unknown shape and appearance classes, and renders the defaults", async () => {
    const props = { shape: "square", variant: "circular", animation: false, width: 120, height: 20 } as unknown as SkeletonProps;
    const skeleton = await render(<Skeleton {...props} className="rounded-full bg-gray-200" />);
    expect(skeleton.getAttribute("data-shape")).toBe("rect");
    expect(warnings()).toEqual([
      '[ouro-ui] Skeleton: "rounded-full" sets appearance, and className is for layout only. Fix: shape="circle".',
      '[ouro-ui] Skeleton: shape="square" is not a shape; use "rect", "text", "circle". Fix: <Skeleton shape="rect">.',
      '[ouro-ui] Skeleton: variant is not a prop. Fix: <Skeleton shape="circle">.',
      "[ouro-ui] Skeleton: animation is not a prop; Skeleton shimmers, and pulses with reduced motion. Fix: <Skeleton>.",
      '[ouro-ui] Skeleton: width is not a prop. Fix: <Skeleton className="w-[120px]">.',
      '[ouro-ui] Skeleton: height is not a prop. Fix: <Skeleton className="h-[20px]">.',
    ]);
  });

  it("maps each MUI variant and other appearance classes to the fix", async () => {
    for (const variant of ["text", "rectangular", "rounded", "wave"]) {
      await render(<Skeleton {...({ variant } as unknown as SkeletonProps)} />);
    }
    await render(<Skeleton className="rounded-md" />);
    await render(<Skeleton className="bg-muted" />);
    await render(<Skeleton {...({ width: "50%", height: "2rem" } as unknown as SkeletonProps)} />);
    expect(warnings()).toEqual([
      '[ouro-ui] Skeleton: variant is not a prop. Fix: <Skeleton shape="text">.',
      '[ouro-ui] Skeleton: variant is not a prop. Fix: <Skeleton shape="rect">.',
      '[ouro-ui] Skeleton: variant is not a prop. Fix: <Skeleton shape="rect">.',
      '[ouro-ui] Skeleton: variant is not a prop. Fix: <Skeleton shape="rect">.',
      '[ouro-ui] Skeleton: "rounded-md" sets appearance, and className is for layout only. Fix: shape="rect".',
      '[ouro-ui] Skeleton: "bg-muted" sets appearance, and className is for layout only. Fix: remove it; Skeleton takes its color from the theme\'s --muted.',
      '[ouro-ui] Skeleton: width is not a prop. Fix: <Skeleton className="w-[50%]">.',
      '[ouro-ui] Skeleton: height is not a prop. Fix: <Skeleton className="h-[2rem]">.',
    ]);
  });
});
