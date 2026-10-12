import type { JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { FLICK_VELOCITY, useDrag, type DragOptions, type DragState } from "@/registry/ouro/lib/ouro/use-drag";

// Pointer events are dispatched, each with a time the test sets, so a release is exactly
// as fast as the test says. Real touch and mouse drags run through the hook in the
// SwipeActions and Reorderable tests.

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  vi.restoreAllMocks();
});

type Calls = { start: DragState[]; move: DragState[]; end: (DragState & { cancelled: boolean })[] };

function Pad({ calls, options }: { calls: Calls; options?: Partial<DragOptions> | undefined }): JSX.Element {
  const drag = useDrag({
    axis: "x",
    onStart: (state) => {
      calls.start.push(state);
    },
    onMove: (state) => calls.move.push(state),
    onEnd: (state) => calls.end.push(state),
    ...options,
  });
  return <div data-testid="pad" style={{ width: 200, height: 100 }} {...drag} />;
}

async function mount(options?: Partial<DragOptions>) {
  const calls: Calls = { start: [], move: [], end: [] };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const render = (next?: Partial<DragOptions>) => act(async () => root!.render(<Pad calls={calls} options={next} />));
  await render(options);
  return { calls, pad: host.querySelector<HTMLElement>("[data-testid=pad]")!, render };
}

let clock = 1000;
/** Dispatches a pointer event `ms` after the last one. */
async function fire(target: EventTarget, type: string, x: number, y: number, ms = 16, init: PointerEventInit = {}) {
  clock += ms;
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", isPrimary: true, button: 0, clientX: x, clientY: y, ...init });
  Object.defineProperty(event, "timeStamp", { value: clock });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("useDrag", () => {
  it("starts once the pointer has moved 10px along the axis, and reports movement from the grab point", async () => {
    const { calls, pad } = await mount();
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 106, 52);
    expect(calls.start).toEqual([]);
    expect(calls.move).toEqual([]);
    const started = await fire(pad, "pointermove", 112, 53);
    expect(calls.start.length).toBe(1);
    expect(calls.start[0]!.delta).toBe(12);
    expect(calls.start[0]!.event).toBe(started);
    // The move that started it is a move too, 1:1 with the pointer.
    expect(calls.move.map((state) => state.delta)).toEqual([12]);
    await fire(pad, "pointermove", 60, 90);
    expect(calls.move.map((state) => state.delta)).toEqual([12, -40]);
    expect(calls.start.length).toBe(1);
    const lifted = await fire(pad, "pointerup", 60, 90);
    expect(calls.end.length).toBe(1);
    expect(calls.end[0]).toMatchObject({ delta: -40, cancelled: false });
    expect(calls.end[0]!.event).toBe(lifted);
    // The gesture is over: later moves are nobody's.
    await fire(pad, "pointermove", 0, 0);
    expect(calls.move.length).toBe(2);
  });

  it("follows the vertical axis when asked", async () => {
    const { calls, pad } = await mount({ axis: "y" });
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 103, 75);
    await fire(pad, "pointerup", 103, 75);
    expect(calls.move.map((state) => state.delta)).toEqual([25]);
    expect(calls.end[0]!.delta).toBe(25);
  });

  it("gives the gesture up when the other axis wins the first 10px, so the page scrolls", async () => {
    const { calls, pad } = await mount();
    const capture = vi.spyOn(pad, "setPointerCapture");
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 104, 54);
    await fire(pad, "pointermove", 108, 64);
    // Given up: a later sideways move starts nothing, and nothing was captured.
    await fire(pad, "pointermove", 20, 64);
    await fire(pad, "pointerup", 20, 64);
    expect(calls).toEqual({ start: [], move: [], end: [] });
    expect(capture).not.toHaveBeenCalled();
    // A tie goes to the page.
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 112, 62);
    await fire(pad, "pointerup", 112, 62);
    expect(calls.start).toEqual([]);
  });

  it("ignores the other axis for an element that takes every touch", async () => {
    const { calls, pad } = await mount({ axis: "y", crossAxis: "ignore" });
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 160, 54);
    expect(calls.start).toEqual([]);
    await fire(pad, "pointermove", 170, 61);
    expect(calls.start.length).toBe(1);
    expect(calls.move.map((state) => state.delta)).toEqual([11]);
    await fire(pad, "pointerup", 170, 61);
  });

  it("takes its own threshold", async () => {
    const { calls, pad } = await mount({ threshold: 3 });
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 102, 50);
    expect(calls.start.length).toBe(0);
    await fire(pad, "pointermove", 104, 50);
    expect(calls.start.length).toBe(1);
    await fire(pad, "pointerup", 104, 50);
  });

  it("measures velocity over the last 100ms, in px per millisecond, and calls a fast release a flick", async () => {
    const { calls, pad } = await mount();
    expect(FLICK_VELOCITY).toBe(0.11);
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 120, 50, 20);
    await fire(pad, "pointermove", 140, 50, 20);
    // 40px in 40ms.
    expect(calls.move.at(-1)!.velocity).toBeCloseTo(1, 9);
    expect(calls.move.at(-1)!.flick).toBe(true);
    await fire(pad, "pointerup", 140, 50, 10);
    expect(calls.end[0]!.velocity).toBeCloseTo(1, 9);
    expect(calls.end[0]!.flick).toBe(true);

    // Out and then back: the sign is the direction at release, whatever the distance.
    await fire(pad, "pointerdown", 100, 50, 1000);
    for (let step = 1; step <= 5; step++) await fire(pad, "pointermove", 100 + step * 20, 50, 30);
    for (let step = 1; step <= 5; step++) await fire(pad, "pointermove", 200 - step * 4, 50, 30);
    await fire(pad, "pointerup", 180, 50, 10);
    expect(calls.end[1]!.delta).toBe(80);
    expect(calls.end[1]!.velocity).toBeLessThan(0);
    expect(calls.end[1]!.flick).toBe(true);

    // A finger that rests before it lifts has no velocity, and a slow one is no flick.
    await fire(pad, "pointerdown", 100, 50, 1000);
    await fire(pad, "pointermove", 160, 50, 20);
    await fire(pad, "pointerup", 160, 50, 300);
    expect(calls.end[2]).toMatchObject({ velocity: 0, flick: false });
    await fire(pad, "pointerdown", 100, 50, 1000);
    await fire(pad, "pointermove", 112, 50, 50);
    await fire(pad, "pointermove", 115, 50, 50);
    await fire(pad, "pointerup", 115, 50, 10);
    expect(calls.end[3]!.velocity).toBeCloseTo(0.06, 9);
    expect(calls.end[3]!.flick).toBe(false);
    // Two events in the same instant give no velocity, not a division by zero.
    await fire(pad, "pointerdown", 100, 50, 1000);
    await fire(pad, "pointermove", 130, 50, 0);
    expect(calls.move.at(-1)!.velocity).toBe(0);
    await fire(pad, "pointerup", 130, 50, 0);
  });

  it("reports a cancel as cancelled", async () => {
    const { calls, pad } = await mount();
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 140, 50);
    await fire(pad, "pointercancel", 140, 50);
    expect(calls.end).toMatchObject([{ delta: 40, cancelled: true }]);
    // A press that never became a drag ends without a word.
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointercancel", 100, 50);
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointerup", 103, 50);
    expect(calls.end.length).toBe(1);
  });

  it("follows the first pointer only, and a mouse's primary button only", async () => {
    const { calls, pad } = await mount();
    await fire(pad, "pointerdown", 100, 50, 16, { isPrimary: false, pointerId: 7 });
    await fire(pad, "pointermove", 160, 50, 16, { pointerId: 7 });
    await fire(pad, "pointerdown", 100, 50, 16, { pointerType: "mouse", button: 2 });
    await fire(pad, "pointermove", 160, 50, 16, { pointerType: "mouse" });
    expect(calls.start).toEqual([]);

    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 130, 50);
    // A second finger lands mid-drag: it neither restarts nor steers nor ends the drag.
    await fire(pad, "pointerdown", 10, 50, 16, { pointerId: 2 });
    await fire(pad, "pointermove", 0, 50, 16, { pointerId: 2 });
    await fire(pad, "pointerup", 0, 50, 16, { pointerId: 2 });
    await fire(pad, "pointercancel", 0, 50, 16, { pointerId: 2 });
    expect(calls.start.length).toBe(1);
    expect(calls.move.map((state) => state.delta)).toEqual([30]);
    expect(calls.end).toEqual([]);
    await fire(pad, "pointerup", 130, 50);
    expect(calls.end.length).toBe(1);
  });

  it("starts over with a new press when the last one never became a drag and its release went unheard", async () => {
    const { calls, pad } = await mount();
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 104, 50);
    // No pointerup arrives (the browser showed a dialog, say). The next press is a fresh gesture.
    await fire(pad, "pointerdown", 40, 50, 1000);
    await fire(pad, "pointermove", 60, 50);
    expect(calls.move.map((state) => state.delta)).toEqual([20]);
    await fire(pad, "pointerup", 60, 50);
    expect(calls.end.length).toBe(1);
  });

  it("lets onStart refuse the drag", async () => {
    const { calls, pad } = await mount({ onStart: (state) => state.event.pointerType !== "mouse" });
    const capture = vi.spyOn(pad, "setPointerCapture");
    await fire(pad, "pointerdown", 100, 50, 16, { pointerType: "mouse" });
    await fire(pad, "pointermove", 160, 50, 16, { pointerType: "mouse" });
    await fire(pad, "pointermove", 190, 50, 16, { pointerType: "mouse" });
    await fire(pad, "pointerup", 190, 50, 16, { pointerType: "mouse" });
    expect(calls.move).toEqual([]);
    expect(calls.end).toEqual([]);
    expect(capture).not.toHaveBeenCalled();
    await fire(pad, "pointerdown", 100, 50, 16, { pointerType: "pen" });
    await fire(pad, "pointermove", 160, 50, 16, { pointerType: "pen" });
    expect(calls.move.length).toBe(1);
    await fire(pad, "pointerup", 160, 50, 16, { pointerType: "pen" });
  });

  it("needs no onStart", async () => {
    const { calls, pad } = await mount({ onStart: undefined });
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 130, 50);
    await fire(pad, "pointerup", 130, 50);
    expect(calls.move.length).toBe(1);
    expect(calls.end.length).toBe(1);
  });

  it("captures the pointer once the drag has started, not before, and works when the browser refuses", async () => {
    const { calls, pad } = await mount();
    const capture = vi.spyOn(pad, "setPointerCapture").mockImplementation(() => {});
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 105, 50);
    expect(capture).not.toHaveBeenCalled();
    await fire(pad, "pointermove", 115, 50);
    await fire(pad, "pointermove", 125, 50);
    expect(capture.mock.calls).toEqual([[1]]);
    await fire(pad, "pointerup", 125, 50);
    // A dispatched pointer is not one the browser has, so capturing it throws: the drag goes on.
    capture.mockRestore();
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 130, 50);
    expect(calls.move.length).toBe(3);
    await fire(pad, "pointerup", 130, 50);
  });

  it("hears a pointer that has left the element before it could be captured", async () => {
    const { calls, pad } = await mount();
    await fire(pad, "pointerdown", 100, 50, 16, { pointerType: "mouse" });
    // The mouse is outside the element now: its events reach the window only.
    await fire(window, "pointermove", 400, 50, 16, { pointerType: "mouse" });
    await fire(window, "pointermove", 420, 50, 16, { pointerType: "mouse" });
    await fire(window, "pointerup", 420, 50, 16, { pointerType: "mouse" });
    expect(calls.move.map((state) => state.delta)).toEqual([300, 320]);
    expect(calls.end.length).toBe(1);
    // An event the element and the window both hear counts once.
    expect(calls.start.length).toBe(1);
  });

  it("uses the handlers of the latest render, and keeps the same props between renders", async () => {
    const { calls, pad, render } = await mount();
    const later = vi.fn();
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 130, 50);
    await render({ onMove: later });
    await fire(pad, "pointermove", 140, 50);
    expect(calls.move.length).toBe(1);
    expect(later).toHaveBeenCalledTimes(1);
    await fire(pad, "pointerup", 140, 50);
  });

  it("stops listening when its component unmounts mid-drag", async () => {
    const { calls, pad } = await mount();
    const removed = vi.spyOn(window, "removeEventListener");
    await fire(pad, "pointerdown", 100, 50);
    await fire(pad, "pointermove", 130, 50);
    await act(async () => root!.unmount());
    root = undefined;
    expect(removed.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(["pointermove", "pointerup", "pointercancel"]));
    await fire(window, "pointermove", 160, 50);
    await fire(window, "pointerup", 160, 50);
    expect(calls.move.length).toBe(1);
    expect(calls.end).toEqual([]);
  });
});
