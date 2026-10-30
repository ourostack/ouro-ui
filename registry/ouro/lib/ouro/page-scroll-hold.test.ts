import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { holdPageScroll } from "@/registry/ouro/lib/ouro/page-scroll-hold";

// A tall page scrolled to (40, 2000), and a portal like a Base UI overlay's, its popup open.
// Performance's clock is held, so how long the person's scroll lasts is set by the test.

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const at = () => [window.scrollX, window.scrollY];
const releases: Array<() => void> = [];
let page: HTMLElement;

/** A portal holding a popup, open unless `open` is false, and the hold on it. */
function portal(open = true) {
  const element = document.body.appendChild(document.createElement("div"));
  const popup = element.appendChild(document.createElement("div"));
  popup.toggleAttribute("data-open", open);
  const release = holdPageScroll(element);
  releases.push(release);
  return { element, popup, release };
}

/** Scrolls the page as a script does, and returns where the page is once the next frame paints. */
async function scrollTo(left: number, top: number) {
  window.scrollTo({ left, top, behavior: "instant" });
  await frame();
  return at();
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["performance"] });
  page = document.body.appendChild(document.createElement("div"));
  page.style.cssText = "width: 4000px; height: 5000px";
  window.scrollTo({ left: 40, top: 2000, behavior: "instant" });
  await frame();
});

afterEach(async () => {
  releases.splice(0).forEach((release) => release());
  vi.useRealTimers();
  document.documentElement.removeAttribute("style");
  document.body.replaceChildren();
  window.scrollTo({ left: 0, top: 0, behavior: "instant" });
  await frame();
});

describe("holdPageScroll", () => {
  it("undoes a page scroll while a popup is open, before the next frame paints it", async () => {
    portal();
    expect(await scrollTo(0, 4200)).toEqual([40, 2000]);
    expect(await scrollTo(300, 2000)).toEqual([40, 2000]);
  });

  it("undoes a smooth scroll on its first frame, under scroll-behavior: smooth", async () => {
    document.documentElement.style.scrollBehavior = "smooth";
    portal();
    const seen: number[][] = [];
    window.scrollBy({ top: 1500 });
    for (let index = 0; index < 10; index++) {
      await frame();
      seen.push(at());
    }
    expect(seen).toEqual(Array.from({ length: 10 }, () => [40, 2000]));
  });

  it("leaves a scroll that follows the wheel, a touch, the scroll bar, a key nothing handled or a click in the popup", async () => {
    const { popup } = portal();
    // A second, closed popup: a click counts in any of them. And a popup that stops these events
    // stops them too late: the hold sees them as they go down to it.
    portal(false);
    for (const type of ["wheel", "touchmove", "pointerdown", "click"]) {
      for (const element of [page, popup]) element.addEventListener(type, (event) => event.stopPropagation());
    }
    const intents: Array<[string, () => void]> = [
      ["wheel", () => page.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 100 }))],
      ["touch", () => page.dispatchEvent(new Event("touchmove", { bubbles: true }))],
      ["scroll bar", () => document.documentElement.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))],
      ["middle button", () => page.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 1 }))],
      ...[" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].map(
        (key) => [`key ${key}`, () => page.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }))] as [string, () => void],
      ),
      ["click in the popup", () => popup.dispatchEvent(new MouseEvent("click", { bubbles: true }))],
    ];
    let top = 2000;
    for (const [name, act] of intents) {
      top += 10;
      act();
      expect([name, await scrollTo(40, top)]).toEqual([name, [40, top]]);
      // Its place is the page's place now: once the person's scroll is over, a script's goes back to it.
      vi.advanceTimersByTime(1000);
      expect([name, await scrollTo(40, 100)]).toEqual([name, [40, top]]);
    }
  });

  it("does not take a letter, a key a popup handled, or a click or press elsewhere for the person scrolling", async () => {
    portal();
    for (const act of [
      () => page.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" })),
      () => {
        page.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
        page.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowDown" }));
      },
      () => page.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      () => page.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 })),
    ]) {
      act();
      expect(await scrollTo(40, 3000)).toEqual([40, 2000]);
    }
  });

  it("ends the person's scroll at a key a popup handles, such as an arrow moving through a menu", async () => {
    portal();
    page.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    page.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
    page.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowDown" }));
    expect(await scrollTo(40, 3000)).toEqual([40, 2000]);
  });

  it("keeps the page free while the person's scroll goes on, and holds it again once it stops", async () => {
    portal();
    page.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    vi.advanceTimersByTime(900);
    expect(await scrollTo(40, 2100)).toEqual([40, 2100]);
    // Past the second since the wheel, but the scroll was still going 150ms ago.
    vi.advanceTimersByTime(150);
    expect(await scrollTo(40, 2200)).toEqual([40, 2200]);
    vi.advanceTimersByTime(199);
    expect(await scrollTo(40, 2300)).toEqual([40, 2300]);
    vi.advanceTimersByTime(201);
    expect(await scrollTo(40, 2400)).toEqual([40, 2300]);
  });

  it("holds the page again when a popup opens, whatever the person did just before", async () => {
    const { element } = portal();
    element.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    portal();
    expect(await scrollTo(40, 3000)).toEqual([40, 2000]);
  });

  it("lets the page go while no popup is open, and holds it where the page then is once one opens", async () => {
    const { popup } = portal(false);
    expect(await scrollTo(40, 2500)).toEqual([40, 2500]);
    popup.setAttribute("data-open", "");
    expect(await scrollTo(40, 3000)).toEqual([40, 2500]);
    // A closing popup, which Base UI marks closed while it animates out, holds nothing.
    popup.removeAttribute("data-open");
    popup.setAttribute("data-closed", "");
    expect(await scrollTo(40, 2600)).toEqual([40, 2600]);
    // One open popup among closed ones holds the page.
    portal();
    expect(await scrollTo(40, 3000)).toEqual([40, 2600]);
  });

  it("keeps the first popup's place while a second opens over it, and holds until the last lets go", async () => {
    const first = portal();
    const second = portal();
    expect(await scrollTo(40, 3000)).toEqual([40, 2000]);
    second.release();
    expect(await scrollTo(40, 3000)).toEqual([40, 2000]);
    first.release();
    expect(await scrollTo(40, 3000)).toEqual([40, 3000]);
    // Gone for good: an open popup no longer registered holds nothing.
    expect(await scrollTo(40, 2400)).toEqual([40, 2400]);
    // The next hold starts where the page is then.
    portal();
    expect(await scrollTo(40, 100)).toEqual([40, 2400]);
  });

  it("stops listening once the last popup lets go", async () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const removeFromWindow = vi.spyOn(window, "removeEventListener");
    const first = portal();
    const second = portal();
    // One set of listeners, however many popups hold the page.
    expect(add).toHaveBeenCalledTimes(5);
    second.release();
    first.release();
    expect(remove.mock.calls.map(([type, , options]) => [type, options])).toEqual([
      ["wheel", { capture: true, passive: true }],
      ["touchmove", { capture: true, passive: true }],
      ["pointerdown", { capture: true, passive: true }],
      ["click", { capture: true, passive: true }],
      ["scroll", undefined],
    ]);
    expect(removeFromWindow.mock.calls.map(([type]) => type)).toEqual(["keydown"]);
  });
});
