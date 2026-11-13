import { Activity, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, server, userEvent } from "vitest/browser";
import { AX_ACTION_ATTRIBUTE, expectAxRendered } from "@/registry/ouro/ax/component";
import { SnapPiP, type SnapPiPCorner, type SnapPiPProps } from "@/registry/ouro/components/ouro/snap-pip/snap-pip";
import { anchorFor, cornerToward, HINT_DELAY, nearestCorner, snapPipAx, widthFor } from "@/registry/ouro/components/ouro/snap-pip/snap-pip-styles";
import { rubberband } from "@/registry/ouro/lib/ouro/spring";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { watchAnnouncements } from "@/registry/ouro/lib/ouro/testing/announcements";
import { holdFrames, type HeldFrames } from "@/registry/ouro/lib/ouro/testing/frames";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

// Most drags here are dispatched pointer events, each with a time the test sets, so a release is
// exactly as fast as the test says and runs the same in Chromium and WebKit. The real mouse throws
// and drags (`commands.flick`, `commands.drag`) are Chromium's.

const chromiumOnly = it.skipIf(server.browser !== "chromium");

let root: Root | undefined;
let stage: HTMLElement;
const nodes: Element[] = [];

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error");
});
let frames: HeldFrames | undefined;
/**
 * Waits for the stage's first ResizeObserver report to reach the picture, which reflows it to its
 * corner. An observer made after the picture's hears the same step after it, so this waits for
 * that report, not a guessed time.
 */
const reported = () =>
  act(
    () =>
      new Promise<void>((done) => {
        const observer = new ResizeObserver(() => {
          observer.disconnect();
          done();
        });
        observer.observe(stage);
      }),
  );
/**
 * Holds frames only after the stage's first ResizeObserver report has reached the picture. Held
 * sooner, that report lands at the browser's next rendering step, which can be mid-gesture, such
 * as during a press that catches a throw.
 */
async function freeze() {
  if (!frames) await reported();
  return (frames ??= holdFrames());
}
afterEach(async () => {
  frames?.release();
  frames = undefined;
  await act(async () => root?.unmount());
  root = undefined;
  for (const node of nodes.splice(0)) node.remove();
  // An announcement still on its way writes to the region it was given, gone from the page with it.
  document.querySelector("[data-ouro-announcer]")?.remove();
  expect(error).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

// The stage the tests use: 380 by 480, so a small picture is 160 by 100, and its corners are at
// x 16 or 204 and y 16 or 364. It can go from 0 to 220 across and 0 to 380 down.
const LEFT = 16;
const RIGHT = 204;
const TOP = 16;
const BOTTOM = 364;

async function render(node: ReactNode) {
  if (!root) {
    stage = document.createElement("div");
    Object.assign(stage.style, { position: "relative", width: "380px", height: "480px" });
    document.body.append(stage);
    nodes.push(stage);
    root = createRoot(stage);
  }
  await act(async () => root!.render(node));
  return pip();
}

const pip = () => stage.querySelector<HTMLElement>('[data-ouro="snap-pip"]')!;
const hint = () => pip().querySelector<HTMLElement>('[data-ouro="snap-pip-hint"]')!;
const hintShown = () => hint().hasAttribute("data-open");
/** The pointer comes onto the picture, or leaves it, as React hears it. */
const enter = (pointerType: string) => act(async () => void pip().dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType })));
const leave = (pointerType: string) => act(async () => void pip().dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType, relatedTarget: document.body })));
const wait = (ms: number) => act(() => new Promise<void>((done) => setTimeout(done, ms)));
/** Moves the real pointer off the stage, to the viewport's bottom-right corner. */
async function park() {
  const away = document.createElement("div");
  Object.assign(away.style, { position: "fixed", right: "0", bottom: "0", width: "8px", height: "8px" });
  document.body.append(away);
  nodes.push(away);
  await userEvent.hover(away);
}
/** Moves keyboard focus onto the picture with Tab, from a button before the stage. */
async function tabTo() {
  const before = document.createElement("button");
  stage.before(before);
  nodes.push(before);
  before.focus();
  await pressTab();
  expect(document.activeElement).toBe(pip());
}
const self = (props: Partial<SnapPiPProps> = {}) => (
  <SnapPiP label="Your camera" {...props}>
    <div data-testid="video" style={{ width: "100%", height: "100%" }} />
  </SnapPiP>
);
/** Where the picture is, in px from the stage's top-left corner. */
const at = (element = pip()): [number, number] => {
  const [x = "0", y = "0"] = element.style.translate.split(" ");
  return [parseFloat(x), parseFloat(y)];
};
/** Checks where the picture is, to the thousandth of a px a style keeps. */
function expectAt(x: number, y: number) {
  const [left, top] = at();
  expect(left).toBeCloseTo(x, 2);
  expect(top).toBeCloseTo(y, 2);
}
const settling = (element = pip()) => element.hasAttribute("data-ouro-settling");
const rest = (element = pip()) => {
  if (frames) return frames.until(() => !settling(element), 16);
  return expect.poll(() => settling(element)).toBe(false);
};
/** Steps held frames until the picture rests, and returns every place it was. */
function path(element = pip()): [number, number][] {
  const seen: [number, number][] = [];
  frames!.until(() => {
    seen.push(at(element));
    return !settling(element);
  }, 16);
  return seen;
}
function middle(element: Element): [number, number] {
  const rect = element.getBoundingClientRect();
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

let clock = 1000;
/** Dispatches a pointer event on the picture `ms` after the last one. While the pointer is down its button is held. */
async function fire(type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", x: number, y: number, ms = 16) {
  clock += ms;
  const buttons = type === "pointerdown" || type === "pointermove" ? 1 : 0;
  // Not the mouse's id (1), so a real pointer event the browser sends mid-test is no part of this gesture.
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, buttons, clientX: x, clientY: y });
  Object.defineProperty(event, "timeStamp", { value: clock });
  await act(async () => {
    pip().dispatchEvent(event);
  });
}
/** Drags the picture by (dx, dy) in `steps` moves `ms` apart, and lifts the pointer `release` ms after the last. */
async function throwBy(dx: number, dy: number, { steps = 4, ms = 10, release = 0 } = {}) {
  const [x, y] = middle(pip());
  await fire("pointerdown", x, y);
  for (let step = 1; step <= steps; step++) await fire("pointermove", x + (dx * step) / steps, y + (dy * step) / steps, ms);
  await fire("pointerup", x + dx, y + dy, release);
}
/** Records every time the picture gains `data-ouro-settling`. */
function watchSettling(element = pip()) {
  const starts: number[] = [];
  const observer = new MutationObserver(() => {
    if (settling(element)) starts.push(starts.length);
  });
  observer.observe(element, { attributes: true, attributeFilter: ["data-ouro-settling"] });
  return { count: () => starts.length, stop: () => observer.disconnect() };
}

describe("SnapPiP", () => {
  it("is a focusable group named by its label, described by its corner and hint, which shows beside it on keyboard focus", async () => {
    const element = await render(self({ id: "self-view" }));
    expect(element.getAttribute("role")).toBe("group");
    expect(element.id).toBe("self-view");
    expect(element.tabIndex).toBe(0);
    expect(element.getAttribute("aria-label")).toBe("Your camera");
    const description = document.getElementById(element.getAttribute("aria-describedby")!)!;
    expect(description.textContent).toBe("Bottom right. Option-arrow keys to move it");
    // The app's content sits in a frame that clips it to the picture's rounded corners.
    const frame = element.querySelector<HTMLElement>('[data-ouro="snap-pip-frame"]')!;
    expect(frame.querySelector('[data-testid="video"]')).not.toBeNull();
    expect(getComputedStyle(frame).overflow).toBe("hidden");
    expect(getComputedStyle(frame).borderRadius).toBe(getComputedStyle(element).borderRadius);
    const shown = hint();
    expect(shown.getAttribute("aria-hidden")).toBe("true");
    expect(shown.textContent).toBe("Option-arrow keys to move it");
    expect(getComputedStyle(shown).opacity).toBe("0");
    expect(getComputedStyle(shown).pointerEvents).toBe("none");
    // A click focuses it without showing the hint: that is for the keyboard, or a resting pointer.
    await userEvent.click(element);
    expect(document.activeElement).toBe(element);
    expect(hintShown()).toBe(false);
    await park();
    element.blur();
    await pressTab();
    expect(document.activeElement).toBe(element);
    expect(hintShown()).toBe(true);
    expect(shown.getAttribute("data-open")).toBe("");
    expect(shown.getAttribute("data-side")).toBe("top");
    expect(shown.style.right).toBe("0px");
    await expect.poll(() => getComputedStyle(shown).opacity).toBe("1");
    expect(getComputedStyle(shown).pointerEvents).toBe("auto");
    // Beside the picture, toward the middle: above it in a bottom corner, lined up with its right edge, on one line.
    const picture = element.getBoundingClientRect();
    const box = shown.getBoundingClientRect();
    expect(box.bottom).toBe(picture.top);
    expect(box.right).toBe(picture.right);
    expect(shown.firstElementChild!.getBoundingClientRect().height).toBe(24);
    expect(box.height).toBe(32);
    // Below it in a top corner, lined up with its left edge.
    await userEvent.keyboard("{Escape}");
    await act(async () => root!.unmount());
    root = undefined;
    const top = await render(self({ defaultCorner: "top-left" }));
    await tabTo();
    expect(hintShown()).toBe(true);
    expect(hint().getAttribute("data-side")).toBe("bottom");
    expect(hint().style.left).toBe("0px");
    expect(hint().getBoundingClientRect().top).toBe(top.getBoundingClientRect().bottom);
    expect(hint().getBoundingClientRect().left).toBe(top.getBoundingClientRect().left);
    await act(async () => top.blur());
    expect(hintShown()).toBe(false);
  });

  it("puts the hint away on Escape, a move or a press, until focus and the pointer have left", async () => {
    const element = await render(self());
    const outside = vi.fn();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && outside();
    document.addEventListener("keydown", onKey);
    await tabTo();
    expect(hintShown()).toBe(true);
    // Escape is the hint's: it goes no further.
    await userEvent.keyboard("{Escape}");
    expect(hintShown()).toBe(false);
    expect(outside).not.toHaveBeenCalled();
    // With nothing showing, Escape is the page's.
    await userEvent.keyboard("{Escape}");
    expect(outside).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", onKey);
    // Put away, it stays away while focus stays, even when the pointer comes to rest on it.
    await enter("mouse");
    await wait(HINT_DELAY + 50);
    expect(hintShown()).toBe(false);
    await leave("mouse");
    // Focus that leaves and comes back shows it again; the first move puts it away.
    await tabTo();
    expect(hintShown()).toBe(true);
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(hintShown()).toBe(false);
    await rest();
    await tabTo();
    expect(hintShown()).toBe(true);
    // So does Option-Return.
    await userEvent.keyboard("{Alt>}{Enter}{/Alt}");
    expect(hintShown()).toBe(false);
    await tabTo();
    expect(hintShown()).toBe(true);
    // And a press.
    const [x, y] = middle(element);
    await fire("pointerdown", x, y);
    expect(hintShown()).toBe(false);
    await fire("pointerup", x, y);
  });

  it("keeps the hint keyboard focus showed when the pointer comes and goes", async () => {
    await render(self());
    await park();
    await tabTo();
    expect(hintShown()).toBe(true);
    await enter("mouse");
    await leave("mouse");
    expect(hintShown()).toBe(true);
  });

  it("moves to a corner a key asks for with no overshoot", async () => {
    const element = await render(self());
    element.focus();
    await freeze();
    await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    const seen = path();
    expect(Math.min(...seen.map(([left]) => left))).toBeGreaterThanOrEqual(LEFT);
    expect(at()).toEqual([LEFT, BOTTOM]);
  });

  it("shows the hint when the pointer rests on it, keeps it while the pointer moves onto it, and never on touch", async () => {
    const element = await render(self());
    // The hint opens HINT_DELAY after the pointer rests, so a read of "not yet" right after the hover
    // races that delay on a loaded runner. Record when the pointer arrives and when the hint opens,
    // as they happen, and check the gap instead.
    let arrived = 0;
    pip().addEventListener("pointerover", () => (arrived ||= performance.now()), { once: true });
    const opened: number[] = [];
    const watch = new MutationObserver(() => hintShown() && opened.push(performance.now()));
    watch.observe(hint(), { attributes: true, attributeFilter: ["data-open"] });
    await userEvent.hover(element);
    await expect.poll(() => hintShown(), { timeout: HINT_DELAY + 1000 }).toBe(true);
    watch.disconnect();
    expect(arrived).toBeGreaterThan(0);
    // A timer does not fire early; the slack allows for the browser's clock rounding.
    const [shownAt = 0] = opened;
    expect(shownAt - arrived).toBeGreaterThanOrEqual(HINT_DELAY - 5);
    // Onto the hint, across the gap: it stays.
    await userEvent.hover(hint().firstElementChild!);
    await wait(50);
    expect(hintShown()).toBe(true);
    // Pressing the hint leaves the picture be, and a double-click there doesn't resize it.
    const press = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1 });
    await act(async () => void hint().dispatchEvent(press));
    expect(hintShown()).toBe(true);
    await act(async () => void hint().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(element.getAttribute("data-size")).toBe("small");
    // Away from both: it goes.
    await park();
    expect(hintShown()).toBe(false);
    // A pointer that leaves before the delay never shows it, and nor does one that presses first.
    await enter("mouse");
    await leave("mouse");
    await wait(HINT_DELAY + 50);
    expect(hintShown()).toBe(false);
    await enter("pen");
    const [x, y] = middle(element);
    await fire("pointerdown", x, y);
    await fire("pointerup", x, y);
    await wait(HINT_DELAY + 50);
    expect(hintShown()).toBe(false);
    await leave("pen");
    // A finger never shows it.
    await enter("touch");
    await wait(HINT_DELAY + 50);
    expect(hintShown()).toBe(false);
    // A pen that rests on it does.
    await enter("pen");
    await wait(HINT_DELAY + 50);
    expect(hintShown()).toBe(true);
  });

  it("reads translated corners and hint", async () => {
    const element = await render(
      self({
        defaultCorner: "top-right",
        hint: "Wahltaste und Pfeiltasten zum Verschieben",
        cornerLabels: { "top-left": "Oben links", "top-right": "Oben rechts", "bottom-left": "Unten links", "bottom-right": "Unten rechts" },
      }),
    );
    expect(document.getElementById(element.getAttribute("aria-describedby")!)!.textContent).toBe("Oben rechts. Wahltaste und Pfeiltasten zum Verschieben");
  });

  it("starts in its corner, inset from the container's edges, and forwards its ref", async () => {
    const ref = { current: null as HTMLDivElement | null };
    const element = await render(self({ ref }));
    expect(ref.current).toBe(element);
    expect(element.getAttribute("data-corner")).toBe("bottom-right");
    expect(at()).toEqual([RIGHT, BOTTOM]);
    expect(element.getBoundingClientRect().width).toBe(160);
    expect(element.getBoundingClientRect().height).toBe(100);
    expect(element.getBoundingClientRect().right).toBe(stage.getBoundingClientRect().right - 16);
    // A new ref takes the element, and the old one lets it go.
    const next = { current: null as HTMLDivElement | null };
    await render(self({ ref: next }));
    expect(next.current).toBe(element);
    expect(ref.current).toBeNull();
    await act(async () => root!.unmount());
    root = undefined;
    expect(next.current).toBeNull();
    await render(self({ defaultCorner: "top-left", inset: 24 }));
    expect(at()).toEqual([24, 24]);
  });

  it("sizes itself from the container's width, small and large", async () => {
    expect([380, 900, 1200, 1500, 1799, 1800, 2400].map((width) => [widthFor(width, "small", 16), widthFor(width, "large", 16)])).toEqual([
      [160, 240],
      [160, 300],
      [200, 400],
      [250, 500],
      [300, 600],
      [288, 480],
      [288, 480],
    ]);
    // Never wider than the stage less its inset on each side.
    expect([widthFor(300, "large", 16), widthFor(150, "small", 16), widthFor(20, "small", 16)]).toEqual([240, 118, 0]);
    const element = await render(self({ aspectRatio: 9 / 16 }));
    stage.style.width = "1200px";
    await expect.poll(() => element.getBoundingClientRect().width).toBe(200);
    expect(element.getBoundingClientRect().height).toBeCloseTo((200 * 16) / 9, 0);
  });

  it("renders to a string in its corner, placed by CSS until it measures its container", () => {
    const html = renderToString(self());
    expect(html).toContain('data-ouro="snap-pip"');
    expect(html).toContain('data-ax-action="move"');
    expect(html).toMatch(/style="right:16px;bottom:16px;width:clamp\(160px, calc\(100% \/ 6\), 320px\);aspect-ratio:1.6"/);
    const large = renderToString(self({ defaultCorner: "top-left", defaultSize: "large", inset: 8 }));
    expect(large).toMatch(/style="left:8px;top:8px;width:clamp\(160px, calc\(100% \/ 3\), 480px\);aspect-ratio:1.6"/);
    expect(warn).not.toHaveBeenCalled();
  });

  it("follows the pointer from the first pixel and lifts while dragged", async () => {
    const element = await render(self());
    const [x, y] = middle(element);
    await fire("pointerdown", x, y);
    // Only pressed, as a double-click is, it doesn't lift.
    expect(element.hasAttribute("data-dragging")).toBe(false);
    // Half a pixel is not yet a drag; a whole one is.
    await fire("pointermove", x - 0.5, y);
    expect(at()).toEqual([RIGHT, BOTTOM]);
    expect(element.hasAttribute("data-dragging")).toBe(false);
    await fire("pointermove", x - 1, y);
    expect(at()).toEqual([RIGHT - 1, BOTTOM]);
    expect(element.getAttribute("data-dragging")).toBe("");
    await expect.poll(() => getComputedStyle(element).scale).toBe("1.04");
    expect(getComputedStyle(element).cursor).toBe("grabbing");
    await fire("pointermove", x - 31, y - 52);
    expect(at()).toEqual([RIGHT - 31, BOTTOM - 52]);
    await fire("pointerup", x - 31, y - 52, 150);
    expect(element.hasAttribute("data-dragging")).toBe(false);
    expect(getComputedStyle(element).cursor).toBe("auto");
    await rest();
    expect(at()).toEqual([RIGHT, BOTTOM]);
    await expect.poll(() => getComputedStyle(element).scale).toBe("none");
  });

  it("drops slowly into the corner whose place is nearest beside a side panel, and flicks across it", async () => {
    // A side panel along the right: the right corners' places are at x 84, so the line between left and right is at 50, not 110.
    const panel = { x: 260, y: 0, width: 120, height: 480 };
    const onCornerChange = vi.fn();
    await render(self({ keepOut: [panel], onCornerChange }));
    expect(at()).toEqual([84, BOTTOM]);
    await freeze();
    // Set down slowly at x 54: nearer the right-hand place than the left corner.
    await throwBy(-30, 0, { steps: 3, ms: 40, release: 120 });
    expect(onCornerChange).not.toHaveBeenCalled();
    rest();
    expect(at()).toEqual([84, BOTTOM]);
    // At x 44, the left one.
    await throwBy(-40, 0, { steps: 4, ms: 40, release: 120 });
    expect(onCornerChange.mock.calls).toEqual([["bottom-left"]]);
    rest();
    expect(at()).toEqual([LEFT, BOTTOM]);
    // A flick to the right lands beside the panel, with a little overshoot.
    await throwBy(30, 0);
    expect(onCornerChange).toHaveBeenLastCalledWith("bottom-right");
    const seen = path();
    expect(at()).toEqual([84, BOTTOM]);
    expect(Math.max(...seen.map(([left]) => left))).toBeGreaterThan(84);
  });

  it("picks the corner whose place, clear of the keep-outs, is nearest", () => {
    // A 1440 by 900 stage with a side panel 360 wide: the right-hand places are at x 840.
    const wide = { width: 1440, height: 900 };
    const pip = { width: 224, height: 140 };
    const panel = { x: 1080, y: 0, width: 360, height: 900 };
    expect(nearestCorner({ x: 550, y: 744 }, wide, pip, 16, [panel])).toBe("bottom-right");
    expect(nearestCorner({ x: 420, y: 744 }, wide, pip, 16, [panel])).toBe("bottom-left");
    expect(nearestCorner({ x: 550, y: 744 }, wide, pip, 16, [])).toBe("bottom-left");
    // A band along the bottom of a 1280 by 420 stage: the bottom places are at y 199, so the line is at 107.5.
    const call = { width: 1280, height: 420 };
    const small = { width: 213, height: 133 };
    const band = { x: 0, y: 348, width: 1280, height: 72 };
    expect(nearestCorner({ x: 1051, y: 120 }, call, small, 16, [band])).toBe("bottom-right");
    expect(nearestCorner({ x: 1051, y: 100 }, call, small, 16, [band])).toBe("top-right");
    expect(nearestCorner({ x: 0, y: 0 }, call, small, 16, [band])).toBe("top-left");
    // Far past a corner, still that corner; halfway between two, the first in reading order.
    expect(nearestCorner({ x: 5000, y: 5000 }, call, small, 16, [band])).toBe("bottom-right");
    expect(nearestCorner({ x: (16 + 1051) / 2, y: 16 }, call, small, 16, [])).toBe("top-left");
  });

  it("goes to the corner a flick points at, across the stage, with a little overshoot", async () => {
    const onCornerChange = vi.fn();
    const element = await render(self({ onCornerChange }));
    const announced = watchAnnouncements();
    await freeze();
    // Up and to the left at 1.5 and 1 px/ms: it lands nowhere near the top-left corner, but coasts there.
    await throwBy(-60, -40);
    expect(at()).toEqual([RIGHT - 60, BOTTOM - 40]);
    expect(onCornerChange.mock.calls).toEqual([["top-left"]]);
    expect(element.getAttribute("data-corner")).toBe("top-left");
    expect(settling()).toBe(true);
    // It carries on at the speed it was thrown: about 24px and 16px in the first frame.
    frames!.step(16);
    const [firstX, firstY] = at();
    expect(firstX).toBeLessThan(RIGHT - 60 - 15);
    expect(firstY).toBeLessThan(BOTTOM - 40 - 10);
    const seen = path();
    expect(Math.min(...seen.map(([left]) => left))).toBeLessThan(LEFT - 1);
    expect(at()).toEqual([LEFT, TOP]);
    expect(settling()).toBe(false);
    frames!.release();
    frames = undefined;
    await expect.poll(() => announced.count("Top left")).toBe(1);
    announced.stop();
  });

  it("keeps a flick going when the stage resizes mid-flight without moving its corner's place", async () => {
    await render(self());
    await freeze();
    await throwBy(-60, -40);
    frames!.step(16);
    expect(settling()).toBe(true);
    expect(pip().getAttribute("data-ouro-settling")).toBe("");
    // The top-left place doesn't depend on the stage's size.
    stage.style.height = "500px";
    await act(() => new Promise<void>((done) => setTimeout(done, 50)));
    expect(settling()).toBe(true);
    const seen = path();
    expect(Math.min(...seen.map(([left]) => left))).toBeLessThan(LEFT - 1);
    expect(at()).toEqual([LEFT, TOP]);
  });

  it("says nothing when the app moves it before the person has", async () => {
    const announced = watchAnnouncements();
    await render(self({ corner: "bottom-right", onCornerChange: () => {} }));
    await render(self({ corner: "top-left", onCornerChange: () => {} }));
    await rest();
    expect(at()).toEqual([LEFT, TOP]);
    await wait(100);
    expect(announced.count("Top left")).toBe(0);
    announced.stop();
  });

  it("calls a release at exactly the flick speed a flick, and overshoots", async () => {
    const onCornerChange = vi.fn();
    await render(self({ onCornerChange }));
    await freeze();
    const [x, y] = middle(pip());
    await fire("pointerdown", x, y);
    await fire("pointermove", x - 73, y, 300);
    // The last 100ms: 11px, 0.11 px/ms.
    await fire("pointermove", x - 84, y, 100);
    await fire("pointerup", x - 84, y, 0);
    expect(onCornerChange.mock.calls).toEqual([["bottom-left"]]);
    expect(Math.min(...path().map(([left]) => left))).toBeLessThan(LEFT - 1);
  });

  it("goes to the nearest corner after a slow drop, with no overshoot", async () => {
    const onCornerChange = vi.fn();
    await render(self({ onCornerChange }));
    await freeze();
    // Left past the middle and a little up, then held still before the release: no throw at all.
    await throwBy(-140, -60, { steps: 6, ms: 40, release: 120 });
    expect(onCornerChange.mock.calls).toEqual([["bottom-left"]]);
    const seen = path();
    expect(Math.min(...seen.map(([left]) => left))).toBeGreaterThanOrEqual(LEFT);
    expect(Math.max(...seen.map(([, top]) => top))).toBeLessThanOrEqual(BOTTOM);
    expect(at()).toEqual([LEFT, BOTTOM]);
  });

  it("stays where it is when dropped back in its own corner, and announces nothing", async () => {
    const onCornerChange = vi.fn();
    const announced = watchAnnouncements();
    await render(self({ onCornerChange }));
    const watch = watchSettling();
    const [x, y] = middle(pip());
    await fire("pointerdown", x, y);
    await fire("pointermove", x - 5, y - 5);
    await fire("pointermove", x, y);
    await fire("pointerup", x, y, 150);
    expect(at()).toEqual([RIGHT, BOTTOM]);
    expect(onCornerChange).not.toHaveBeenCalled();
    expect(watch.count()).toBe(0);
    watch.stop();
    // The next move is the first thing announced.
    pip().focus();
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await rest();
    await expect.poll(() => announced.count("Top right")).toBe(1);
    expect(announced.changes.map((change) => change.text)).toEqual(["Top right"]);
    announced.stop();
  });

  it("springs on from its corner when it reaches it still moving", async () => {
    await render(self());
    await freeze();
    for (const [dx, dy] of [
      [-30, 0],
      [0, -30],
    ] as const) {
      const [x, y] = middle(pip());
      await fire("pointerdown", x, y);
      await fire("pointermove", x + dx, y + dy, 100);
      // Back on its corner, at 0.6 px/ms: it overshoots and comes back.
      await fire("pointermove", x, y, 50);
      await fire("pointerup", x, y, 0);
      expect(at()).toEqual([RIGHT, BOTTOM]);
      expect(settling()).toBe(true);
      rest();
      expect(at()).toEqual([RIGHT, BOTTOM]);
    }
  });

  chromiumOnly("throws to a corner with a real mouse flick, and drops into the nearest with a slow real drag", async () => {
    const onCornerChange = vi.fn();
    const element = await render(self({ onCornerChange }));
    const [x, y] = middle(element);
    await commands.flick({ from: [x, y], to: [x - 40, y - 60], steps: 4, durationMs: 40 });
    await expect.poll(() => onCornerChange.mock.calls).toEqual([["top-left"]]);
    await rest();
    expect(at()).toEqual([LEFT, TOP]);
    const [fromX, fromY] = middle(element);
    await commands.drag({ from: [fromX, fromY], to: [fromX + 150, fromY + 10], steps: 10, durationMs: 1200 });
    await expect.poll(() => onCornerChange.mock.calls.length).toBe(2);
    expect(onCornerChange).toHaveBeenLastCalledWith("top-right");
    await rest();
    expect(at()).toEqual([RIGHT, TOP]);
    // The real mouse leaves the stage, so it never comes to rest on a picture a later test moves under it.
    await park();
  });

  it("catches it in flight, holds it under the pointer, and lets it go on when only pressed", async () => {
    const element = await render(self());
    await freeze();
    await throwBy(-60, -40);
    frames!.step(16);
    frames!.step(16);
    const caught = at();
    expect(caught).not.toEqual([LEFT, TOP]);
    expect(settling()).toBe(true);
    const [x, y] = middle(element);
    await fire("pointerdown", x, y);
    expect(settling()).toBe(false);
    frames!.step(16);
    expect(at()).toEqual(caught);
    // Only pressed: it goes on to the corner it was thrown to.
    await fire("pointerup", x, y);
    expect(element.hasAttribute("data-dragging")).toBe(false);
    expect(settling()).toBe(true);
    rest();
    expect(at()).toEqual([LEFT, TOP]);
    // Pressed at rest, it holds still and stays.
    await fire("pointerdown", x, y);
    await fire("pointerup", x, y);
    expect(settling()).toBe(false);
    expect(at()).toEqual([LEFT, TOP]);
  });

  it("stays under a pointer that holds it while a keep-out changes, and takes the new place on release", async () => {
    const bar = document.createElement("div");
    Object.assign(bar.style, { position: "absolute", left: "0", right: "0", bottom: "0", height: "80px" });
    await render(self({ keepOut: [{ current: bar }] }));
    stage.append(bar);
    await render(self({ keepOut: [{ current: bar }] }));
    await expect.poll(() => at()).toEqual([RIGHT, 400 - 16 - 100]);
    await rest();
    // Pressed and held: the band grows under it, and it stays put.
    const [x, y] = middle(pip());
    await fire("pointerdown", x, y);
    bar.style.height = "120px";
    await wait(100);
    expect(settling()).toBe(false);
    expect(at()).toEqual([RIGHT, 400 - 16 - 100]);
    // Let go: it takes the new place.
    await fire("pointerup", x, y);
    await rest();
    expect(at()).toEqual([RIGHT, 360 - 16 - 100]);
    // Let go after a press, it follows the band again.
    bar.style.height = "100px";
    await expect.poll(() => settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, 380 - 16 - 100]);
    // Thrown and let go, too.
    await throwBy(0, -1, { steps: 2, ms: 200 });
    await rest();
    bar.style.height = "80px";
    await expect.poll(() => settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, 400 - 16 - 100]);
  });

  it("catches it in flight and drops it somewhere else", async () => {
    const onCornerChange = vi.fn();
    await render(self({ onCornerChange }));
    await freeze();
    await throwBy(-60, -40);
    frames!.step(16);
    const [x, y] = middle(pip());
    const caught = at();
    await fire("pointerdown", x, y);
    await fire("pointermove", x - 60, y + 40, 40);
    expectAt(caught[0] - 60, caught[1] + 40);
    await fire("pointerup", x - 60, y + 40, 150);
    expect(onCornerChange.mock.calls).toEqual([["top-left"], ["bottom-left"]]);
    rest();
    expect(at()).toEqual([LEFT, BOTTOM]);
  });

  it("keeps the browser from dragging an image inside it away", async () => {
    const element = await render(
      <SnapPiP label="Your camera">
        <img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
      </SnapPiP>,
    );
    const start = new DragEvent("dragstart", { bubbles: true, cancelable: true });
    element.querySelector("img")!.dispatchEvent(start);
    expect(start.defaultPrevented).toBe(true);
    expect(getComputedStyle(element.querySelector("img")!).pointerEvents).toBe("none");
  });

  it("goes back to its corner when the browser cancels the drag", async () => {
    const onCornerChange = vi.fn();
    const element = await render(self({ onCornerChange }));
    const [x, y] = middle(element);
    await fire("pointerdown", x, y);
    await fire("pointermove", x - 150, y - 300);
    await fire("pointercancel", x - 150, y - 300);
    expect(element.hasAttribute("data-dragging")).toBe(false);
    await rest();
    expect(at()).toEqual([RIGHT, BOTTOM]);
    expect(onCornerChange).not.toHaveBeenCalled();
  });

  it("resists past the container's edges, more the further it goes", async () => {
    const element = await render(self());
    const [x, y] = middle(element);
    await fire("pointerdown", x, y);
    // Its furthest place is 220 across and 380 down.
    await fire("pointermove", x + 60, y + 40);
    expectAt(220 + rubberband(44, 160), 380 + rubberband(24, 100));
    await fire("pointermove", x + 160, y + 140);
    const [farX, farY] = at();
    expect(farX - 220).toBeLessThan(144);
    expect(farX).toBeCloseTo(220 + rubberband(144, 160));
    expect(farY).toBeCloseTo(380 + rubberband(124, 100));
    await fire("pointermove", x - 300, y - 400);
    expectAt(rubberband(-96, 160), rubberband(-36, 100));
    await fire("pointerup", x - 300, y - 400, 150);
    await rest();
    expect(at()).toEqual([LEFT, TOP]);
  });

  it("keeps its corners clear of keep-outs, rectangles or elements, and follows them with the spring when they change", async () => {
    // A band of controls along the bottom: the bottom corners sit above it.
    const band = { x: 0, y: 400, width: 380, height: 80 };
    const element = await render(self({ keepOut: [band] }));
    expect(at()).toEqual([RIGHT, 400 - 16 - 100]);
    // The band grows: it follows with the spring.
    await render(self({ keepOut: [{ ...band, y: 360, height: 120 }] }));
    expect(settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, 360 - 16 - 100]);
    // A side panel along the right: the right corners move left, clear of it.
    await render(self({ keepOut: [{ x: 260, y: 0, width: 120, height: 480 }] }));
    await rest();
    expect(at()).toEqual([260 - 16 - 160, BOTTOM]);
    // An element: measured, and followed when it resizes.
    const bar = document.createElement("div");
    Object.assign(bar.style, { position: "absolute", left: "0", right: "0", bottom: "0", height: "80px" });
    stage.append(bar);
    await render(self({ keepOut: [{ current: bar }, { current: null }] }));
    await rest();
    expect(at()).toEqual([RIGHT, 400 - 16 - 100]);
    // The same element in a new list stays watched.
    await render(self({ keepOut: [{ current: bar }] }));
    expect(settling()).toBe(false);
    bar.style.height = "120px";
    await expect.poll(() => settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, 360 - 16 - 100]);
    // Let go of, it no longer moves the picture.
    await render(self({ keepOut: [] }));
    await rest();
    expect(at()).toEqual([RIGHT, BOTTOM]);
    const watch = watchSettling(element);
    bar.style.height = "200px";
    await act(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    expect(watch.count()).toBe(0);
    watch.stop();
  });

  it("keeps following its keep-out elements after a hidden Activity shows it again", async () => {
    const bar = document.createElement("div");
    Object.assign(bar.style, { position: "absolute", left: "0", right: "0", bottom: "0", height: "80px" });
    const shown = (mode: "visible" | "hidden") => <Activity mode={mode}>{self({ keepOut: [{ current: bar }] })}</Activity>;
    await render(shown("visible"));
    stage.append(bar);
    await render(shown("visible"));
    await expect.poll(() => at()).toEqual([RIGHT, 400 - 16 - 100]);
    await render(shown("hidden"));
    await render(shown("visible"));
    await rest();
    // The element resizes: the picture follows it, as it did before it was hidden.
    bar.style.height = "120px";
    await expect.poll(() => settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, 360 - 16 - 100]);
  });

  it("notices a keep-out element that comes deep inside the container, with no render", async () => {
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const sizes = vi.spyOn(ResizeObserver.prototype, "observe");
    const unobserve = vi.spyOn(ResizeObserver.prototype, "unobserve");
    const ref: { current: HTMLElement | null } = { current: null };
    await park();
    await render(self({ keepOut: [ref] }));
    // The whole container, not only its children.
    expect(observe).toHaveBeenCalledWith(stage, { childList: true, subtree: true });
    const wrapper = document.createElement("div");
    stage.append(wrapper);
    await rest();
    expect(at()).toEqual([RIGHT, BOTTOM]);
    const bar = document.createElement("div");
    Object.assign(bar.style, { position: "absolute", left: "0", right: "0", bottom: "0", height: "80px" });
    ref.current = bar;
    wrapper.append(bar);
    await expect.poll(() => settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, 400 - 16 - 100]);
    // It watches the element's size from then on, once, however often it renders.
    await render(self({ keepOut: [ref] }));
    expect(sizes.mock.calls.filter(([target]) => target === bar)).toHaveLength(1);
    // Taken away, it stops watching it, and goes back to its corner.
    ref.current = null;
    bar.remove();
    await expect.poll(() => unobserve.mock.calls.some(([target]) => target === bar)).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, BOTTOM]);
  });

  it("starts clear of a keep-out element that comes behind a ref with no render at once, and watches its size from then on", async () => {
    const ref: { current: HTMLElement | null } = { current: null };
    await park();
    await render(self({ keepOut: [ref] }));
    // Past the stage's first size report, which reflows too, only the element's coming moves the picture.
    await reported();
    expect(at()).toEqual([RIGHT, BOTTOM]);
    const bar = document.createElement("div");
    Object.assign(bar.style, { position: "absolute", left: "0", right: "0", bottom: "0", height: "80px" });
    ref.current = bar;
    stage.append(bar);
    // On its way as the element comes, in the content observer's microtask, not a rendering step later with the element's first size report.
    await Promise.resolve();
    expect(settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, 400 - 16 - 100]);
    // It grows, with nothing rendered, added or taken away: only its own size report moves the picture.
    bar.style.height = "120px";
    await expect.poll(() => settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, 360 - 16 - 100]);
  });

  it("lets go of what it observes when it unmounts", async () => {
    const mutations = vi.spyOn(MutationObserver.prototype, "disconnect");
    const resizes = vi.spyOn(ResizeObserver.prototype, "disconnect");
    const element = await render(self());
    const removed = vi.spyOn(element, "removeEventListener");
    mutations.mockClear();
    resizes.mockClear();
    await act(async () => root!.unmount());
    root = undefined;
    expect(mutations).toHaveBeenCalled();
    expect(resizes).toHaveBeenCalled();
    // The drag's touch listener goes too.
    expect(removed.mock.calls.map(([type]) => type)).toContain("touchmove");
  });

  it("measures keep-out elements inside the container's border, rendered by the app or not", async () => {
    stage = document.createElement("div");
    // 380 by 480 inside a 4px border, away from the page's top-left corner.
    Object.assign(stage.style, { position: "relative", boxSizing: "content-box", width: "380px", height: "480px", border: "4px solid", margin: "24px 0 0 40px" });
    document.body.append(stage);
    nodes.push(stage);
    root = createRoot(stage);
    const band = { current: null as HTMLDivElement | null };
    const panel = { current: null as HTMLDivElement | null };
    const layout = (keepOut: SnapPiPProps["keepOut"]) => (
      <>
        <div ref={band} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 80 }} />
        <div ref={panel} style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 120 }} />
        {self({ keepOut })}
      </>
    );
    await act(async () => root!.render(layout([band])));
    await rest();
    expect(at()).toEqual([RIGHT, 400 - 16 - 100]);
    // Another element in its place: watched from then on, and measured at once.
    await act(async () => root!.render(layout([panel])));
    await expect.poll(() => at()).toEqual([260 - 16 - 160, BOTTOM]);
  });

  it("goes back to its corner when a keep-out element behind the same ref goes away, and clears it when it comes back", async () => {
    // Captions the app turns on and off behind one ref, rendered with the picture.
    const captions = { current: null as HTMLDivElement | null };
    const band = { position: "absolute", left: 0, right: 0, bottom: 0, height: 80 } as const;
    const call = (on: boolean) => (
      <>
        {on ? <div ref={captions} style={band} /> : null}
        {self({ keepOut: [captions] })}
      </>
    );
    await render(call(true));
    expect(at()).toEqual([RIGHT, 400 - 16 - 100]);
    await render(call(false));
    expect(settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, BOTTOM]);
    await render(call(true));
    expect(settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, 400 - 16 - 100]);
    await act(async () => root!.unmount());
    root = undefined;
    // Captions another part of the app shows and hides, without rendering the picture again.
    let show: (on: boolean) => void = () => {};
    function Captions() {
      const [on, set] = useState(false);
      show = set;
      return on ? <div ref={captions} style={band} /> : null;
    }
    const picture = self({ keepOut: [captions] });
    await render(
      <>
        <Captions />
        {picture}
      </>,
    );
    expect(at()).toEqual([RIGHT, BOTTOM]);
    await act(async () => show(true));
    await expect.poll(() => settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, 400 - 16 - 100]);
    await act(async () => show(false));
    await expect.poll(() => settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, BOTTOM]);
  });

  it("leaves it to the pointer once a drag begins, after an Option-arrow key mid-press", async () => {
    const onCornerChange = vi.fn();
    const element = await render(self({ onCornerChange }));
    element.focus();
    await freeze();
    const [x, y] = middle(element);
    await fire("pointerdown", x, y);
    // Pressed, not yet dragged: the key sets it off for the top.
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(settling()).toBe(true);
    await fire("pointermove", x - 20, y);
    // The pointer has it now: it stops, and holds still under it.
    expect(settling()).toBe(false);
    expect(at()).toEqual([RIGHT - 20, BOTTOM]);
    frames!.step(16);
    expect(at()).toEqual([RIGHT - 20, BOTTOM]);
    // While dragged, a key does nothing.
    await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(settling()).toBe(false);
    frames!.step(16);
    expect(at()).toEqual([RIGHT - 20, BOTTOM]);
    expect(onCornerChange.mock.calls).toEqual([["top-right"]]);
    await fire("pointerup", x - 20, y, 150);
    expect(onCornerChange).toHaveBeenLastCalledWith("bottom-right");
  });

  it("follows a keep-out that changes in flight from where it is, and one that changes mid-drag on release", async () => {
    const band = { x: 0, y: 400, width: 380, height: 80 };
    await render(self({ keepOut: [band] }));
    await freeze();
    await throwBy(-60, -40);
    frames!.step(16);
    frames!.step(16);
    const before = at();
    // Thrown to the top left; a band appears along the top while it flies there.
    const top = { x: 0, y: 0, width: 380, height: 60 };
    await render(self({ keepOut: [band, top] }));
    expect(settling()).toBe(true);
    // It carried on from where it was, with no jump.
    expect(Math.abs(at()[0] - before[0])).toBeLessThan(1);
    rest();
    expect(at()).toEqual([LEFT, 60 + 16]);
    // A band that moves during a drag counts on release.
    const [x, y] = middle(pip());
    await fire("pointerdown", x, y);
    await fire("pointermove", x + 10, y + 300, 40);
    await render(self({ keepOut: [{ x: 0, y: 380, width: 380, height: 100 }] }));
    expect(at()).toEqual([LEFT + 10, 76 + 300]);
    await fire("pointerup", x + 10, y + 300, 150);
    rest();
    expect(at()).toEqual([LEFT, 380 - 16 - 100]);
  });

  it("finds each corner's place clear of every keep-out, toward the middle, or keeps the corner when nothing clears", () => {
    const stageBox = { width: 380, height: 480 };
    const small = { width: 160, height: 100 };
    // Two stacked bands: clear of both.
    const captions = { x: 0, y: 320, width: 380, height: 60 };
    const controls = { x: 100, y: 400, width: 180, height: 80 };
    expect(anchorFor("bottom-left", stageBox, small, 16, [controls, captions])).toEqual({ x: 16, y: 320 - 16 - 100 });
    // A narrow centred bar the corners already clear does not move them.
    const bar = { x: 180, y: 400, width: 20, height: 80 };
    expect([anchorFor("bottom-right", stageBox, small, 16, [bar]), anchorFor("bottom-left", stageBox, small, 16, [bar])]).toEqual([
      { x: 204, y: 364 },
      { x: 16, y: 364 },
    ]);
    // A box in the corner: the nearer way out, up or sideways.
    expect(anchorFor("top-left", stageBox, small, 16, [{ x: 0, y: 0, width: 40, height: 200 }])).toEqual({ x: 56, y: 16 });
    expect(anchorFor("top-right", stageBox, small, 16, [{ x: 200, y: 0, width: 180, height: 30 }])).toEqual({ x: 204, y: 46 });
    // A band along the bottom: the right corner moves up, keeping its own side.
    expect(anchorFor("bottom-right", stageBox, small, 16, [{ x: 0, y: 400, width: 380, height: 80 }])).toEqual({ x: 204, y: 284 });
    // A box in the corner as far across as down: the first way out, sideways.
    expect(anchorFor("top-left", stageBox, small, 16, [{ x: 0, y: 0, width: 40, height: 40 }])).toEqual({ x: 56, y: 16 });
    // Places at the stage's very edges count.
    expect(anchorFor("top-left", stageBox, small, 16, [{ x: 0, y: 0, width: 204, height: 480 }])).toEqual({ x: 220, y: 16 });
    expect(anchorFor("bottom-right", stageBox, small, 16, [{ x: 176, y: 0, width: 204, height: 480 }])).toEqual({ x: 0, y: 364 });
    expect(anchorFor("top-left", stageBox, small, 16, [{ x: 0, y: 0, width: 380, height: 364 }])).toEqual({ x: 16, y: 380 });
    expect(anchorFor("bottom-right", stageBox, small, 16, [{ x: 0, y: 116, width: 380, height: 364 }])).toEqual({ x: 204, y: 0 });
    // Places past the stage's edges, or out toward the corner's own edge, don't count.
    expect(anchorFor("bottom-right", stageBox, small, 16, [{ x: 100, y: 0, width: 280, height: 480 }])).toEqual({ x: 204, y: 364 });
    expect(anchorFor("top-left", stageBox, small, 16, [{ x: 0, y: 0, width: 300, height: 480 }])).toEqual({ x: 16, y: 16 });
    expect(anchorFor("top-left", stageBox, small, 16, [{ x: -40, y: 0, width: 30, height: 480 }, { x: 170, y: 0, width: 20, height: 150 }])).toEqual({ x: 16, y: 166 });
    expect(anchorFor("top-right", stageBox, small, 16, [{ x: 390, y: 0, width: 30, height: 480 }, { x: 190, y: 0, width: 20, height: 150 }])).toEqual({ x: 204, y: 166 });
    expect(anchorFor("bottom-right", stageBox, small, 16, [{ x: 0, y: 490, width: 380, height: 30 }, { x: 0, y: 364, width: 380, height: 5 }])).toEqual({ x: 204, y: 248 });
    // With no inset, a place that only touches a keep-out clears it, on every side.
    expect([
      anchorFor("top-left", stageBox, small, 0, [{ x: 0, y: 0, width: 40, height: 480 }]),
      anchorFor("top-right", stageBox, small, 0, [{ x: 300, y: 0, width: 80, height: 480 }]),
      anchorFor("top-left", stageBox, small, 0, [{ x: 0, y: 0, width: 380, height: 40 }]),
      anchorFor("bottom-right", stageBox, small, 0, [{ x: 0, y: 400, width: 380, height: 80 }]),
    ]).toEqual([
      { x: 40, y: 0 },
      { x: 140, y: 0 },
      { x: 0, y: 40 },
      { x: 220, y: 300 },
    ]);
    // Nothing inside the stage clears it: the corner itself.
    expect(anchorFor("bottom-right", stageBox, small, 16, [{ x: 0, y: 0, width: 380, height: 480 }])).toEqual({ x: 204, y: 364 });
    expect(anchorFor("top-left", stageBox, small, 16, [])).toEqual({ x: 16, y: 16 });
  });

  it("names the next corner each Option-arrow key goes to", () => {
    expect(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].map((key) => cornerToward("bottom-right", key as "ArrowLeft"))).toEqual([
      "bottom-left",
      "bottom-right",
      "top-right",
      "bottom-right",
    ]);
    expect(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].map((key) => cornerToward("top-left", key as "ArrowLeft"))).toEqual([
      "top-left",
      "top-right",
      "top-left",
      "bottom-left",
    ]);
  });

  it("stays in its corner without a spring while the container resizes, in the same frame", async () => {
    const element = await render(self());
    const watch = watchSettling(element);
    // An observer made after the picture's own runs after it, before the frame is painted: the picture is in its corner already.
    const seen: [number, number][] = [];
    const after = new ResizeObserver(() => seen.push(at()));
    after.observe(stage);
    await expect.poll(() => seen.length).toBe(1);
    stage.style.width = "340px";
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1]).toEqual([340 - 160 - 16, BOTTOM]);
    after.disconnect();
    stage.style.width = "300px";
    await expect.poll(() => at()).toEqual([300 - 160 - 16, BOTTOM]);
    stage.style.height = "300px";
    await expect.poll(() => at()).toEqual([300 - 160 - 16, 300 - 100 - 16]);
    // Wide enough for the next size up: still in its corner, at once.
    stage.style.width = "1200px";
    await expect.poll(() => at()).toEqual([1200 - 200 - 16, 300 - 125 - 16]);
    expect(watch.count()).toBe(0);
    watch.stop();
  });

  it("moves to the next corner that way with Option and an arrow, and announces it once it settles", async () => {
    const onCornerChange = vi.fn();
    const element = await render(self({ onCornerChange }));
    const announced = watchAnnouncements();
    element.focus();
    // Held frames, so a slow runner can't finish a move before the test sees it start.
    await freeze();
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(onCornerChange.mock.calls).toEqual([["top-right"]]);
    expect(element.getAttribute("data-corner")).toBe("top-right");
    expect(settling()).toBe(true);
    // Never during the move.
    expect(announced.count("Top right")).toBe(0);
    await rest();
    expect(at()).toEqual([RIGHT, TOP]);
    await expect.poll(() => announced.count("Top right")).toBe(1);
    // Already at the top: nothing moves, and it says where it is again.
    const up = new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true, cancelable: true });
    await act(async () => void element.dispatchEvent(up));
    expect(up.defaultPrevented).toBe(true);
    expect(settling()).toBe(false);
    expect(onCornerChange.mock.calls).toEqual([["top-right"]]);
    await expect.poll(() => announced.count("Top right")).toBe(2);
    // Without Option, or with another modifier too, an arrow is left to the page.
    for (const init of [{}, { altKey: true, ctrlKey: true }, { altKey: true, metaKey: true }, { altKey: true, key: "a" }]) {
      const key = new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true, ...init });
      await act(async () => void element.dispatchEvent(key));
      expect(key.defaultPrevented).toBe(false);
    }
    expect(settling()).toBe(false);
    await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(settling()).toBe(true);
    await rest();
    expect(at()).toEqual([LEFT, TOP]);
    await expect.poll(() => announced.count("Top left")).toBe(1);
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(settling()).toBe(true);
    await rest();
    expect(at()).toEqual([LEFT, BOTTOM]);
    await expect.poll(() => announced.count("Bottom left")).toBe(1);
    await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(settling()).toBe(true);
    await rest();
    expect(at()).toEqual([RIGHT, BOTTOM]);
    expect(onCornerChange.mock.calls.flat()).toEqual(["top-right", "top-left", "bottom-left", "bottom-right"]);
    await expect.poll(() => announced.count("Bottom right")).toBe(1);
    expect(announced.changes.map((change) => change.text)).toEqual(["Top right", "Top right", "Top left", "Bottom left", "Bottom right"]);
    announced.stop();
  });

  it("goes on from where it is when a second key comes mid-move, and announces only where it settles", async () => {
    const element = await render(self());
    const announced = watchAnnouncements();
    element.focus();
    await freeze();
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    frames!.step(16);
    // Toward the side it is on its way to: it says nothing mid-move, also once the announcer's 100ms delay has passed.
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await wait(150);
    expect(announced.count("Top right")).toBe(0);
    frames!.step(16);
    await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    rest();
    expect(at()).toEqual([LEFT, TOP]);
    frames!.release();
    frames = undefined;
    await expect.poll(() => announced.count("Top left")).toBe(1);
    expect(announced.count("Top right")).toBe(0);
    announced.stop();
  });

  it("toggles small and large on a double-click or Option-Return, controlled or not", async () => {
    const onSizeChange = vi.fn();
    const element = await render(self({ onSizeChange }));
    const watch = watchSettling(element);
    await userEvent.dblClick(element);
    expect(onSizeChange.mock.calls).toEqual([["large"]]);
    expect(element.getAttribute("data-size")).toBe("large");
    expect(element.getBoundingClientRect().width).toBe(240);
    // It grows from its corner, at once.
    expect(at()).toEqual([380 - 240 - 16, 480 - 150 - 16]);
    element.focus();
    await userEvent.keyboard("{Alt>}{Enter}{/Alt}");
    expect(onSizeChange.mock.calls).toEqual([["large"], ["small"]]);
    expect(at()).toEqual([RIGHT, BOTTOM]);
    expect(watch.count()).toBe(0);
    watch.stop();
    // Controlled, it says what the person asked for and keeps the size it is given.
    await render(self({ size: "small", onSizeChange }));
    await userEvent.keyboard("{Alt>}{Enter}{/Alt}");
    expect(onSizeChange).toHaveBeenLastCalledWith("large");
    expect(element.getAttribute("data-size")).toBe("small");
    await render(self({ size: "large", onSizeChange }));
    expect(element.getBoundingClientRect().width).toBe(240);
    // Option-Return is its key, not the page's.
    const enter = new KeyboardEvent("keydown", { key: "Enter", altKey: true, bubbles: true, cancelable: true });
    await act(async () => void element.dispatchEvent(enter));
    expect(enter.defaultPrevented).toBe(true);
    expect(onSizeChange).toHaveBeenLastCalledWith("small");
  });

  it("moves with Option and an arrow while its hint shows, and puts the hint away", async () => {
    const onCornerChange = vi.fn();
    await render(self({ onCornerChange }));
    await tabTo();
    expect(hintShown()).toBe(true);
    // One keydown, Option held, so no press of Option alone comes first and puts the hint away.
    const up = new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true, cancelable: true });
    await act(async () => void pip().dispatchEvent(up));
    expect(onCornerChange.mock.calls).toEqual([["top-right"]]);
    expect(hintShown()).toBe(false);
  });

  it("follows a controlled corner with the spring, and goes back to it when the app keeps it", async () => {
    const onCornerChange = vi.fn();
    const announced = watchAnnouncements();
    const element = await render(self({ corner: "top-left", onCornerChange }));
    expect(at()).toEqual([LEFT, TOP]);
    expect(warn).not.toHaveBeenCalled();
    element.focus();
    await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(onCornerChange.mock.calls).toEqual([["top-right"]]);
    await rest();
    expect(at()).toEqual([LEFT, TOP]);
    expect(element.getAttribute("data-corner")).toBe("top-left");
    await render(self({ corner: "bottom-left", onCornerChange }));
    expect(settling()).toBe(true);
    await rest();
    expect(at()).toEqual([LEFT, BOTTOM]);
    announced.stop();
    // A corner the app sets mid-drag waits for the release.
    await render(self({ corner: "bottom-left", onCornerChange }));
    await rest();
    const [px, py] = middle(element);
    await fire("pointerdown", px, py);
    await fire("pointermove", px + 20, py - 20);
    await render(self({ corner: "top-right", onCornerChange }));
    expect(at()).toEqual([LEFT + 20, BOTTOM - 20]);
    expect(settling()).toBe(false);
    await fire("pointerup", px + 20, py - 20, 150);
    await rest();
    expect(at()).toEqual([RIGHT, TOP]);
    // A thrown picture the app keeps where it was goes back too.
    await freeze();
    await throwBy(-200, 300);
    expect(onCornerChange).toHaveBeenLastCalledWith("bottom-left");
    rest();
    expect(at()).toEqual([RIGHT, TOP]);
  });

  it("announces a move the person makes and the app keeps, and not one the app makes", async () => {
    let setCorner: (corner: SnapPiPCorner) => void = () => {};
    function Remembering() {
      const [corner, set] = useState<SnapPiPCorner>("bottom-right");
      setCorner = set;
      return self({ corner, onCornerChange: set });
    }
    const element = await render(<Remembering />);
    const announced = watchAnnouncements();
    await act(async () => setCorner("bottom-left"));
    expect(settling()).toBe(true);
    await rest();
    expect(at()).toEqual([LEFT, BOTTOM]);
    element.focus();
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(element.getAttribute("data-corner")).toBe("top-left");
    await rest();
    expect(at()).toEqual([LEFT, TOP]);
    await expect.poll(() => announced.count("Top left")).toBe(1);
    expect(announced.changes.map((change) => change.text)).toEqual(["Top left"]);
    announced.stop();
  });

  it("says nothing when the app keeps it where it was after a key, nor for the app's own move after that", async () => {
    let setCorner: (corner: SnapPiPCorner) => void = () => {};
    function Keeping() {
      const [corner, set] = useState<SnapPiPCorner>("bottom-right");
      setCorner = set;
      return self({ corner, onCornerChange: () => {} });
    }
    const element = await render(<Keeping />);
    const announced = watchAnnouncements();
    element.focus();
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(element.getAttribute("data-corner")).toBe("bottom-right");
    await rest();
    expect(at()).toEqual([RIGHT, BOTTOM]);
    await act(async () => setCorner("top-left"));
    await rest();
    expect(at()).toEqual([LEFT, TOP]);
    // Past the announcer's 100ms delay.
    await wait(150);
    expect(announced.changes).toEqual([]);
    announced.stop();
  });

  it("jumps to its corner with reduced motion, with no lift and no rubberband", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    const onCornerChange = vi.fn();
    const element = await render(self({ onCornerChange }));
    const watch = watchSettling(element);
    const announced = watchAnnouncements();
    element.focus();
    await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(at()).toEqual([LEFT, BOTTOM]);
    await expect.poll(() => announced.count("Bottom left")).toBe(1);
    const [x, y] = middle(element);
    await fire("pointerdown", x, y);
    // Held against the edges, not past them, and never lifted.
    await fire("pointermove", x - 100, y + 100);
    expect(at()).toEqual([0, 380]);
    expect(element.hasAttribute("data-dragging")).toBe(false);
    expect(getComputedStyle(element).scale).toBe("none");
    await fire("pointermove", x + 400, y - 500);
    expect(at()).toEqual([220, 0]);
    await fire("pointerup", x + 400, y - 500, 0);
    expect(at()).toEqual([RIGHT, TOP]);
    expect(onCornerChange.mock.calls).toEqual([["bottom-left"], ["top-right"]]);
    expect(watch.count()).toBe(0);
    watch.stop();
    announced.stop();
  });

  it("stops moving when it is unmounted mid-flight", async () => {
    const element = await render(self());
    element.focus();
    await freeze();
    await userEvent.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    frames!.step(16);
    expect(settling(element)).toBe(true);
    await act(async () => root!.unmount());
    root = undefined;
    expect(settling(element)).toBe(false);
    frames!.step(16);
  });

  it("declares no agent reads and one move only the person makes, on the picture", async () => {
    expect(snapPipAx).toEqual({
      component: "SnapPiP",
      reads: [],
      actions: [{ id: "move", summary: "Move the person's own picture to another corner.", effect: "private", personOnly: "You can't move the person's own picture; only they can." }],
    });
    const element = await render(self());
    expectAxRendered(snapPipAx, element.parentElement!);
    expect(element.getAttribute(AX_ACTION_ATTRIBUTE)).toBe("move");
    expect(element.getAttribute("data-ouro-control")).toBe("snap-pip");
    expect(element.getAttribute("data-ouro-part")).toBe("pip");
  });

  it.each([
    ["no label", { label: "" }, "label is required; it names the picture for screen readers", '<SnapPiP label="Your camera">'],
    ["a corner that is not one", { corner: "middle", onCornerChange: () => {} }, 'corner="middle" is not a corner; use "top-left", "top-right", "bottom-left", "bottom-right"', '<SnapPiP corner="bottom-right">'],
    ["a defaultCorner that is not one", { defaultCorner: "center" }, 'defaultCorner="center" is not a corner; use "top-left", "top-right", "bottom-left", "bottom-right"', '<SnapPiP defaultCorner="bottom-right">'],
    ["a size that is not one", { size: "medium" }, 'size="medium" is not a size; use "small", "large"', '<SnapPiP size="small">'],
    ["a defaultSize that is not one", { defaultSize: "huge" }, 'defaultSize="huge" is not a size; use "small", "large"', '<SnapPiP defaultSize="small">'],
    ["a corner without onCornerChange", { corner: "top-left" }, "corner is controlled without onCornerChange, so a throw comes back to it", "<SnapPiP corner={corner} onCornerChange={setCorner}>"],
    ["position", { position: { x: 0, y: 0 } }, "position is not a prop; it rests in a corner", '<SnapPiP corner="bottom-right">'],
    ["offset as a number", { offset: 8 }, "offset is not a prop", "<SnapPiP inset={8}>"],
    ["offset as a string", { offset: "8px" }, "offset is not a prop", "<SnapPiP inset={16}>"],
    ["avoid", { avoid: [] }, "avoid is not a prop", "<SnapPiP keepOut={[toolbarRef]}>"],
  ])("says what is wrong with %s, with the fix", async (_name, extra, problem, fix) => {
    await render(self(extra as unknown as Partial<SnapPiPProps>));
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] SnapPiP: ${problem}. Fix: ${fix}.`);
  });

  it("falls back to the bottom-right corner and the small size for values that are not ones", async () => {
    const element = await render(self({ corner: "middle" as never, onCornerChange: () => {}, size: "medium" as never }));
    expect(element.getAttribute("data-corner")).toBe("bottom-right");
    expect(element.getAttribute("data-size")).toBe("small");
    await act(async () => root!.unmount());
    root = undefined;
    const fallback = await render(self({ defaultCorner: "center" as never, defaultSize: "huge" as never }));
    expect(fallback.getAttribute("data-corner")).toBe("bottom-right");
    expect(at()).toEqual([RIGHT, BOTTOM]);
    expect(fallback.getAttribute("data-size")).toBe("small");
  });

  it("takes layout classes and warns about appearance classes", async () => {
    const element = await render(self({ className: "z-20" }));
    expect(element.classList.contains("z-20")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    await act(async () => root!.unmount());
    root = undefined;
    await render(self({ className: "bg-red-500" }));
    expect(warn).toHaveBeenCalledWith('[ouro-ui] SnapPiP: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; style what you put inside it.');
  });
});
