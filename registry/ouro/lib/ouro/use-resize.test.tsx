import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResize, type ResizeRange } from "@/registry/ouro/lib/ouro/use-resize";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const range: ResizeRange = { least: 80, most: 400, step: 20, offset: 0, now: 100 };

let root: Root | undefined;
const calls: [number, boolean][] = [];

function Edge({ grow, read = range }: { grow?: "up" | "down" | undefined; read?: ResizeRange | undefined }) {
  const { props, dragging } = useResize({ label: "Resize", read: () => read, onResize: (px, settled) => calls.push([px, settled]), grow });
  return <div {...props} data-state={String(dragging)} data-test-harness />;
}

async function shown(grow?: "up" | "down", read?: ResizeRange): Promise<{ edge: HTMLElement; capture: ReturnType<typeof vi.fn> }> {
  const container = document.body.appendChild(document.createElement("div"));
  root = createRoot(container);
  await act(async () => root!.render(<Edge grow={grow} read={read} />));
  const edge = container.firstElementChild as HTMLElement;
  const capture = vi.fn();
  edge.setPointerCapture = capture as never;
  return { edge, capture };
}

const pointer = (edge: HTMLElement, type: string, init: PointerEventInit) =>
  act(async () => void edge.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, button: 0, ...init })));

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  calls.length = 0;
  document.body.replaceChildren();
});

describe("useResize", () => {
  it("reads its initial range in the browser's frame, not the mount commit", async () => {
    const read = vi.fn(() => range);
    function InitialEdge() {
      const { props } = useResize({ label: "Resize", read, onResize: () => {} });
      return <div {...props} data-test-harness />;
    }
    const container = document.body.appendChild(document.createElement("div"));
    root = createRoot(container);
    flushSync(() => root!.render(<InitialEdge />));
    expect(read).not.toHaveBeenCalled();
    await expect.poll(() => read.mock.calls.length).toBe(1);
    expect(container.firstElementChild!.getAttribute("aria-valuenow")).toBe("100");
  });

  it("drags in whole steps, marks the edge while it drags, and lands once on release", async () => {
    const { edge, capture } = await shown();
    await pointer(edge, "pointerdown", { clientY: 300 });
    expect(capture).toHaveBeenCalledWith(7);
    expect(edge.hasAttribute("data-dragging")).toBe(true);
    expect(edge.getAttribute("data-dragging")).toBe("");
    expect(edge.getAttribute("data-ouro-edge")).toBe("drag");
    await pointer(edge, "pointermove", { clientY: 260 });
    expect(calls).toEqual([[140, false]]);
    await pointer(edge, "pointerup", { clientY: 260 });
    expect(calls).toEqual([[140, false], [140, true]]);
    expect(edge.hasAttribute("data-dragging")).toBe(false);
    expect(edge.getAttribute("data-ouro-edge")).toBe("focus");
    await act(async () => edge.blur());
    expect(edge.hasAttribute("data-ouro-edge")).toBe(false);
  });

  it("follows the pointer to the pixel when the range has no step, kept between its floor and ceiling", async () => {
    const { edge } = await shown(undefined, { ...range, step: 0 });
    await pointer(edge, "pointerdown", { clientY: 300 });
    await pointer(edge, "pointermove", { clientY: 263 });
    await pointer(edge, "pointerup", { clientY: 0 });
    expect(calls).toEqual([[137, false], [400, true]]);
  });

  it("grows the other way when the edge grows down", async () => {
    const { edge } = await shown("down");
    await pointer(edge, "pointerdown", { clientY: 300 });
    await pointer(edge, "pointerup", { clientY: 340 });
    expect(calls).toEqual([[140, true]]);
  });

  it("ignores a press that is not the primary button, and moves and releases from another pointer", async () => {
    const { edge, capture } = await shown();
    await pointer(edge, "pointerdown", { clientY: 300, button: 2 });
    expect(capture).not.toHaveBeenCalled();
    expect(edge.hasAttribute("data-dragging")).toBe(false);
    await pointer(edge, "pointermove", { clientY: 200 });
    await pointer(edge, "pointerup", { clientY: 200 });
    await pointer(edge, "pointercancel", {});
    expect(calls).toEqual([]);

    await pointer(edge, "pointerdown", { clientY: 300 });
    await pointer(edge, "pointermove", { clientY: 200, pointerId: 8 });
    await pointer(edge, "pointerup", { clientY: 200, pointerId: 8 });
    await pointer(edge, "pointercancel", { pointerId: 8 });
    expect(calls).toEqual([]);
    expect(edge.hasAttribute("data-dragging")).toBe(true);
  });

  it("does not repeat a size it already reported", async () => {
    const { edge } = await shown();
    await pointer(edge, "pointerdown", { clientY: 300 });
    await pointer(edge, "pointermove", { clientY: 260 });
    await pointer(edge, "pointermove", { clientY: 259 });
    expect(calls).toEqual([[140, false]]);
  });

  it("puts the size back on a cancel, and stops dragging", async () => {
    const { edge } = await shown();
    await pointer(edge, "pointerdown", { clientY: 300 });
    await pointer(edge, "pointermove", { clientY: 200 });
    await pointer(edge, "pointercancel", {});
    expect(calls.at(-1)).toEqual([100, true]);
    expect(edge.hasAttribute("data-dragging")).toBe(false);
    await pointer(edge, "pointerup", { clientY: 100 });
    expect(calls.length).toBe(2);
  });

  it("moves a step with the arrows and to the ends with Home and End", async () => {
    const { edge } = await shown();
    const press = (key: string) => act(async () => void edge.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
    await press("ArrowUp");
    await press("ArrowDown");
    await press("Home");
    await press("End");
    expect(calls).toEqual([[120, true], [80, true], [80, true], [400, true]]);
  });

  it("leaves a key it does not use alone", async () => {
    const { edge } = await shown();
    const event = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    await act(async () => void edge.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    const modified = new KeyboardEvent("keydown", { key: "Home", ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => void edge.dispatchEvent(modified));
    expect(modified.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });
});
