import { afterEach, expect, test } from "vitest";
import { commands } from "vitest/browser";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";

test("the touch project reports a coarse pointer at 390x844", () => {
  expect(matchMedia("(pointer: coarse)").matches).toBe(true);
  expect(innerWidth).toBe(390);
});

test("rotate names the test that had the page zoomed", async () => {
  await commands.setPageZoom(2);
  expect(await commands.pageZoom()).toBeCloseTo(2);
  try {
    // Touch commands find their events on a zoomed page too.
    await commands.touchStep({ type: "touchStart", x: 100, y: 100 });
    await commands.touchStep({ type: "touchEnd" });
    await expect(rotate(844, 390)).rejects.toThrow(
      '"rotate names the test that had the page zoomed" had the page zoomed to 2.00 when rotate(844, 390) ran',
    );
  } finally {
    await commands.resetPageZoom();
  }
  expect(await commands.pageZoom()).toBe(1);
  await rotate(844, 390);
  expect(innerWidth).toBe(844);
  await rotate(390, 844);
});

const nodes: Element[] = [];
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const node of nodes.splice(0)) node.remove();
});

/** A 300px horizontal scroller with 900px of content, at the top left of the page. */
function scroller(): HTMLElement {
  const element = document.createElement("div");
  Object.assign(element.style, { position: "absolute", top: "0", left: "0", width: "300px", height: "200px", overflowX: "auto" });
  const content = document.createElement("div");
  Object.assign(content.style, { width: "900px", height: "200px" });
  element.append(content);
  document.body.append(element);
  nodes.push(element);
  return element;
}

/** Swipes left across the scroller with `touchDrag`. */
const swipe = () => commands.touchDrag({ from: [260, 100], to: [40, 100], steps: 10 });

/**
 * Counts the touchstart and pointerdown events the page sees. While a finger is still
 * down, Chromium swallows the next gesture's start, so a swipe handler that starts on
 * pointerdown (a toast's) never sees it.
 */
function watchStarts(): () => string[] {
  const seen: string[] = [];
  const listener = (event: Event) => seen.push(event.type);
  for (const type of ["touchstart", "pointerdown"]) addEventListener(type, listener, true);
  return () => {
    for (const type of ["touchstart", "pointerdown"]) removeEventListener(type, listener, true);
    return seen;
  };
}

test("lifts the finger in finally when a step throws mid-gesture, so the next touch works", async () => {
  const element = scroller();
  await expect(
    (async () => {
      try {
        await commands.touchStep({ type: "touchStart", x: 260, y: 100 });
        await commands.touchStep({ type: "touchMove", x: 200, y: 100 });
        throw new Error("an assertion failed mid-gesture");
      } finally {
        await commands.touchStep({ type: "touchEnd" });
      }
    })(),
  ).rejects.toThrow("mid-gesture");
  const before = element.scrollLeft;
  const starts = watchStarts();
  await swipe();
  await expect.poll(() => element.scrollLeft).toBeGreaterThan(before + 100);
  expect(starts()).toEqual(["pointerdown", "touchstart"]);
});

test("lifts a finger a test left down before the next gesture starts", async () => {
  const element = scroller();
  // A test that failed without lifting its finger.
  await commands.touchStep({ type: "touchStart", x: 260, y: 100 });
  await commands.touchStep({ type: "touchMove", x: 250, y: 100 });
  let starts = watchStarts();
  await swipe();
  expect(starts()).toEqual(["pointerdown", "touchstart"]);
  // And a new touchStep gesture starts clean too.
  await commands.touchStep({ type: "touchStart", x: 260, y: 100 });
  starts = watchStarts();
  await commands.touchStep({ type: "touchStart", x: 260, y: 100 });
  for (const x of [200, 140, 80]) await commands.touchStep({ type: "touchMove", x, y: 100 });
  await commands.touchStep({ type: "touchEnd" });
  expect(starts()).toEqual(["pointerdown", "touchstart"]);
  expect(element.scrollLeft).toBeGreaterThan(0);
});

/** Records each touchmove and touchend the page handles, as its type and the finger's x. */
function watchTouches(): string[] {
  const seen: string[] = [];
  const listener = (event: TouchEvent) => seen.push(`${event.type} ${Math.round(event.changedTouches[0]!.clientX)}`);
  for (const type of ["touchmove", "touchend"] as const) addEventListener(type, listener, true);
  cleanups.push(() => {
    for (const type of ["touchmove", "touchend"] as const) removeEventListener(type, listener, true);
  });
  return seen;
}

test("touchStep resolves once the page has handled its event, also a move during a scroll", async () => {
  scroller();
  const seen = watchTouches();
  await commands.touchStep({ type: "touchStart", x: 260, y: 100 });
  try {
    // Within Chromium's slop distance of the touchstart: Chromium keeps these from the page.
    await commands.touchStep({ type: "touchMove", x: 256, y: 100 });
    await commands.touchStep({ type: "touchMove", x: 256, y: 100 });
    expect(seen).toEqual([]);
    // The first of these starts the scroll. Chromium then hands the page at most one
    // touchmove every 200ms, so each later one is still queued when CDP resolves.
    for (const x of [200, 180, 160, 140]) {
      await commands.touchStep({ type: "touchMove", x, y: 100 });
      expect(seen.at(-1)).toBe(`touchmove ${x}`);
    }
  } finally {
    await commands.touchStep({ type: "touchEnd" });
  }
  expect(seen.at(-1)).toBe("touchend 140");
});

test("touchDrag resolves when the gesture removes its target, whose touchend never reaches window", async () => {
  const element = scroller();
  element.style.overflowX = "hidden";
  element.addEventListener("touchmove", () => element.remove(), { once: true });
  const seen = watchTouches();
  await commands.touchDrag({ from: [260, 100], to: [40, 100], steps: 10 });
  expect(seen.filter((entry) => entry.startsWith("touchend"))).toEqual([]);
  // The next gesture starts clean.
  const next = scroller();
  await swipe();
  await expect.poll(() => next.scrollLeft).toBeGreaterThan(100);
});

test("a touch the page never handles throws, naming the event and what the page saw", async () => {
  const frame = document.createElement("iframe");
  Object.assign(frame.style, { position: "absolute", top: "0", left: "0", width: "300px", height: "200px", border: "0" });
  frame.srcdoc = "<body style='margin:0'><div style='height:200px'></div></body>";
  const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  document.body.append(frame);
  nodes.push(frame);
  await loaded;
  // A frame that has just loaded may not be hit-testable yet; CI saw the first touch land on nothing.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await commands.touchStep({ type: "touchStart", x: 100, y: 100 });
  // The finger's target goes away with its frame, so no page gets the touchend.
  frame.remove();
  await expect(commands.touchStep({ type: "touchEnd" })).rejects.toThrow(
    "touchStep: the page did not handle the touchEnd at (100, 100) within 5000ms. It handled: no touch events. Is the page visible and rendering, and is the point inside it?",
  );
  // The next gesture starts clean.
  const element = scroller();
  await swipe();
  await expect.poll(() => element.scrollLeft).toBeGreaterThan(100);
});

test("touchDrag with durationMs spans exactly that long in the page's event timestamps", async () => {
  scroller();
  const stamps: Record<string, number> = {};
  const listener = (event: Event) => (stamps[event.type] = event.timeStamp);
  for (const type of ["touchstart", "touchend"]) addEventListener(type, listener, true);
  try {
    // No wait: touchDrag resolves once the page has handled the touchend.
    await commands.touchDrag({ from: [260, 100], to: [40, 100], steps: 10, durationMs: 300 });
  } finally {
    for (const type of ["touchstart", "touchend"]) removeEventListener(type, listener, true);
  }
  expect(stamps["touchend"]! - stamps["touchstart"]!).toBeCloseTo(300, 0);
});
