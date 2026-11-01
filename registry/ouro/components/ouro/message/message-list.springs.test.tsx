import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { springAt } from "@/registry/ouro/lib/ouro/spring";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { holdFrames } from "@/registry/ouro/lib/ouro/testing/frames";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

// The feel the docs give: a message trails LAG of each scroll once REACH px from where the reader
// scrolls, at most SPREAD px, follows STRETCH of a push past an end, and settles on SPRING.
const LAG = 0.14;
const REACH = 400;
const SPREAD = 20;
const STRETCH = 0.25;
const SPRING = { response: 0.42, damping: 0.72 };

const roots: Root[] = [];
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of nodes.splice(0)) node.remove();
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
  return {
    scroller,
    messages: () => [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')],
    rerender: (next: ReactNode) => act(async () => root.render(next)),
  };
}

function Chat({ count, from = 0, height = 300, springy }: { count: number; from?: number; height?: number; springy?: boolean }) {
  return (
    <div>
      <button type="button">Before</button>
      <MessageList label="Conversation" style={{ height }} springy={springy}>
        {Array.from({ length: count }, (_, index) => (
          <Message key={from + index} id={`m-${from + index}`} role={(from + index) % 2 ? "assistant" : "user"} name={(from + index) % 2 ? "Ouro" : "Ada"}>
            {`Message ${from + index}: ${"rest the dough ".repeat(3)}`}
          </Message>
        ))}
      </MessageList>
    </div>
  );
}

/** How far the springs draw a message from its place, in px: 0 with no transform. */
function shiftOf(element: HTMLElement): number {
  const transform = element.style.transform;
  return transform === "" ? 0 : Number(/^translateY\((.+)px\)$/.exec(transform)![1]);
}

/** Where a message is laid out, its spring left out. */
function laidOut(element: HTMLElement): { top: number; bottom: number; middle: number } {
  const box = element.getBoundingClientRect();
  const shift = shiftOf(element);
  return { top: box.top - shift, bottom: box.bottom - shift, middle: (box.top + box.bottom) / 2 - shift };
}

/** The reader's wheel over the list at `y`, `delta` px, and the scroll it makes, as the browser would send them. */
function wheel(scroller: HTMLElement, delta: number, y: number) {
  scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, clientY: y, bubbles: true }));
  scroller.scrollTop += delta;
  scroller.dispatchEvent(new Event("scroll"));
}

/** The browser's next scroll event on the list: after `wheel`, its own, which it sends at the next frame. */
const nextScroll = (scroller: HTMLElement) => new Promise((resolve) => scroller.addEventListener("scroll", resolve, { once: true }));

/** A finger at `y` over the list: the touch event the list reads, in any browser (WebKit on a desktop makes no TouchEvent). */
function finger(scroller: HTMLElement, type: "touchstart" | "touchmove", y: number) {
  scroller.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { touches: [{ clientY: y }] }));
}

/** Scrolls the list in code and waits for the browser's scroll event. */
async function scrollInCode(scroller: HTMLElement, top: number) {
  const scrolled = new Promise((resolve) => scroller.addEventListener("scroll", resolve, { once: true }));
  scroller.scrollTop = top;
  await scrolled;
}

/** Where a message stands `ms` into a spring that a scroll of `kick` px and a push of `push` px started. */
function springFor(reach: number, kick: number, push: number, ms: number) {
  return springAt(SPREAD * Math.tanh((kick * LAG * reach - push * (1 - reach)) / SPREAD), 0, 0, ms, SPRING);
}

/**
 * Checks each message against its spring `ms` (the first frame's 16ms) after it began, from where it is laid out
 * relative to `from`: the pointer's height, or the box of the message the keys focused.
 */
function expectFirstFrame(messages: HTMLElement[], from: number | { top: number; bottom: number }, kick: number, push = 0, ms = 16) {
  const span = typeof from === "number" ? { top: from, bottom: from } : from;
  let moved = 0;
  for (const message of messages) {
    const at = laidOut(message).middle;
    const reach = Math.min(Math.max(span.top - at, at - span.bottom, 0) / REACH, 1);
    const want = springFor(reach, kick, push, ms);
    if (Math.abs(want.value) < 0.25 && Math.abs(want.velocity) < 0.01) expect(message.style.transform).toBe("");
    else {
      expect(shiftOf(message)).toBeCloseTo(want.value, 4);
      moved++;
    }
  }
  return moved;
}

/** Whether a message is within half the list's height of its view, where the springs move messages. */
function near(scroller: HTMLElement, message: HTMLElement) {
  const view = scroller.getBoundingClientRect();
  const box = laidOut(message);
  return box.bottom > view.top - view.height / 2 && box.top < view.bottom + view.height / 2;
}

/** Sets the reduced motion preference and waits until the page's media query reads it. */
async function reduceMotion(reduce: boolean) {
  await commands.emulateMedia({ reducedMotion: reduce ? "reduce" : "no-preference" });
  await expect.poll(() => matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(reduce);
}

function expectAtRest(messages: HTMLElement[]) {
  for (const message of messages) {
    expect(message.hasAttribute("style")).toBe(false);
    expect(message.hasAttribute("data-ouro-settling")).toBe(false);
    expect(getComputedStyle(message).transform).toBe("none");
    expect(getComputedStyle(message).willChange).toBe("auto");
  }
}

describe("MessageList springs", () => {
  it("trails the wheel the more the farther a message is from the pointer, and settles back to no transform", async () => {
    const { scroller, messages } = await render(<Chat count={40} />);
    await scrollInCode(scroller, 600);
    const frames = holdFrames();
    const view = scroller.getBoundingClientRect();
    const pointer = view.top + 20;
    wheel(scroller, 30, pointer);
    const top = scroller.scrollTop;
    frames.step(16);
    const band = messages().filter((message) => near(scroller, message));
    expect(expectFirstFrame(band, pointer, 30)).toBeGreaterThan(3);
    for (const message of messages()) if (!band.includes(message)) expect(message.style.transform).toBe("");
    // A message the pointer's reader focuses keeps trailing: only the keys' focus lands it at once.
    const clicked = band.findLast((message) => message.style.transform !== "")!;
    clicked.focus({ preventScroll: true });
    expect(clicked.style.transform).not.toBe("");
    // A frame later, with no more scrolling, each has run 32ms of the same spring.
    frames.step(16);
    expect(expectFirstFrame(band, pointer, 30, 0, 32)).toBeGreaterThan(3);
    // Scrolling down, the messages trail below their places, and drawn with a layer of their own.
    const moving = band.filter((message) => message.style.transform !== "");
    for (const message of moving) {
      expect(shiftOf(message)).toBeGreaterThan(0);
      expect(message.style.willChange).toBe("transform");
      expect(message.hasAttribute("data-ouro-settling")).toBe(true);
    }
    // Scrolled on, then let go, they close in with a hint of overshoot, less than a pixel, and come to rest with no transform at all.
    const farthest = moving.at(-1)!;
    for (let frame = 0; frame < 6; frame++) {
      wheel(scroller, 30, pointer);
      frames.step(16);
    }
    let least = shiftOf(farthest);
    frames.until(() => {
      least = Math.min(least, shiftOf(farthest));
      return scroller.querySelector("[data-ouro-settling]") === null;
    });
    expect(least).toBeLessThan(0);
    expect(least).toBeGreaterThan(-1);
    expect(scroller.scrollTop).toBe(top + 180);
    expectAtRest(messages());
  });

  it("spreads the messages apart on a push past either end, and draws them back", async () => {
    const { scroller, messages } = await render(<Chat count={30} />);
    const frames = holdFrames();
    const view = scroller.getBoundingClientRect();
    const pointer = view.top + view.height * 0.75;
    // At the bottom, a wheel down has nowhere to scroll: the messages near the pointer rise most.
    const bottom = scroller.scrollTop;
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 80, clientY: pointer, bubbles: true }));
    frames.step(16);
    const band = messages().filter((message) => near(scroller, message));
    expect(expectFirstFrame(band, pointer, 0, 80 * STRETCH)).toBeGreaterThan(3);
    for (const message of band.filter((each) => each.style.transform !== "")) expect(shiftOf(message)).toBeLessThan(0);
    frames.step(16);
    expect(expectFirstFrame(band, pointer, 0, 80 * STRETCH, 32)).toBeGreaterThan(3);
    frames.until(() => scroller.querySelector("[data-ouro-settling]") === null);
    expect(scroller.scrollTop).toBe(bottom);
    expectAtRest(messages());
  });

  it("pushes the messages down at the top, counting a wheel's lines as 40px each", async () => {
    const { scroller, messages } = await render(<Chat count={30} />);
    await scrollInCode(scroller, 0);
    const frames = holdFrames();
    const view = scroller.getBoundingClientRect();
    const pointer = view.top + view.height * 0.25;
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -2, deltaMode: 1, clientY: pointer, bubbles: true }));
    frames.step(16);
    const band = messages().filter((message) => near(scroller, message));
    expect(expectFirstFrame(band, pointer, 0, -80 * STRETCH)).toBeGreaterThan(3);
    for (const message of band.filter((each) => each.style.transform !== "")) expect(shiftOf(message)).toBeGreaterThan(0);
    frames.until(() => scroller.querySelector("[data-ouro-settling]") === null);
    expect(scroller.scrollTop).toBe(0);
    expectAtRest(messages());
  });

  it("pushes nothing for a wheel away from an end, or one that scrolls", async () => {
    const { scroller, messages } = await render(<Chat count={30} />);
    await scrollInCode(scroller, 400);
    const frames = holdFrames();
    const pointer = scroller.getBoundingClientRect().top + 10;
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 60, clientY: pointer, bubbles: true }));
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -60, clientY: pointer, bubbles: true }));
    frames.step(16);
    expectAtRest(messages());
  });

  it("never changes the scroll position, and keeps the reader's place by where messages are laid out", async () => {
    const { scroller, messages, rerender } = await render(<Chat count={30} from={20} />);
    await scrollInCode(scroller, 300);
    const frames = holdFrames();
    const view = scroller.getBoundingClientRect();
    const pointer = view.bottom - 10;
    // The browser's own scroll event comes before the history (in one frame, the list would read the history as in place).
    wheel(scroller, -40, pointer);
    await nextScroll(scroller);
    const reading = messages().find((message) => laidOut(message).top >= view.top)!;
    const place = laidOut(reading).top;
    // Older messages load above in the same frame: the list scrolls to keep the reader's place, and
    // no message trails that scroll, only the reader's 40px.
    const before = scroller.scrollTop;
    let adjusted = nextScroll(scroller);
    await rerender(<Chat count={50} from={0} />);
    await adjusted;
    expect(scroller.scrollTop).toBeGreaterThan(before + 100);
    frames.step(16);
    const top = scroller.scrollTop;
    expect(expectFirstFrame(messages().filter((message) => near(scroller, message)), pointer, -40)).toBeGreaterThan(3);
    expect(laidOut(reading).top).toBeCloseTo(place, 0);
    // More history while they spring: the one being read stays where it is laid out.
    adjusted = nextScroll(scroller);
    await rerender(<Chat count={70} from={-20} />);
    await adjusted;
    expect(scroller.scrollTop).toBeGreaterThan(top + 100);
    expect(laidOut(reading).top).toBeCloseTo(place, 0);
    const kept = scroller.scrollTop;
    frames.until(() => scroller.querySelector("[data-ouro-settling]") === null);
    expect(scroller.scrollTop).toBe(kept);
    expect(laidOut(reading).top).toBeCloseTo(place, 0);
  });

  it("moves only the messages in or near view, reading as few in a thousand as in fifty, on one frame loop", async () => {
    const reads: number[] = [];
    for (const count of [50, 1000]) {
      const { scroller, messages } = await render(<Chat count={count} />);
      await scrollInCode(scroller, scroller.scrollHeight / 2);
      const frames = holdFrames();
      const asked = vi.spyOn(window, "requestAnimationFrame");
      const pointer = scroller.getBoundingClientRect().top;
      wheel(scroller, 20, pointer);
      wheel(scroller, 20, pointer);
      // Two scrolls in one frame ask for one frame.
      expect(asked).toHaveBeenCalledTimes(1);
      const measured = vi.spyOn(Element.prototype, "getBoundingClientRect");
      frames.step(16);
      reads.push(measured.mock.calls.length);
      measured.mockRestore();
      expect(asked).toHaveBeenCalledTimes(2);
      const moving = messages().filter((message) => message.style.transform !== "");
      expect(moving.length).toBeGreaterThan(3);
      expect(moving.length).toBeLessThan(20);
      for (const message of moving) expect(near(scroller, message)).toBe(true);
      frames.until(() => scroller.querySelector("[data-ouro-settling]") === null);
      // At rest the loop stops: no frame is asked for.
      const settled = asked.mock.calls.length;
      frames.step(16);
      expect(asked).toHaveBeenCalledTimes(settled);
      asked.mockRestore();
      frames.release();
      await act(async () => roots.pop()!.unmount());
    }
    // Halving finds the messages near view: twenty times the messages takes a handful more reads.
    expect(reads[1]! - reads[0]!).toBeLessThanOrEqual(8);
  });

  it("starts a message that comes near mid-scroll where its nearest moving neighbour is, so no gap opens", async () => {
    // Well down the page, so every message's place on screen is far from 0.
    const { scroller, messages } = await render(
      <div style={{ paddingTop: 2000 }}>
        <Chat count={60} height={400} />
      </div>,
    );
    await scrollInCode(scroller, 800);
    const frames = holdFrames();
    const view = scroller.getBoundingClientRect();
    // The first scroll leaves the messages trailing by different amounts; the next, from far above, moves all
    // those near the band's bottom alike, so a message that arrives there matches the one it started from.
    wheel(scroller, 30, view.top + 150);
    frames.step(16);
    const before = new Set(messages().filter((message) => message.style.transform !== ""));
    wheel(scroller, 150, view.top - 500);
    frames.step(16);
    const last = [...before].at(-1)!;
    const arrived = messages().slice(messages().indexOf(last) + 1).filter((message) => message.style.transform !== "");
    expect(arrived.length).toBeGreaterThan(0);
    for (const message of arrived) expect(shiftOf(message)).toBeCloseTo(shiftOf(last), 3);
    // The messages that left the band at the top rest at once.
    for (const message of messages().filter((each) => each.style.transform !== "")) expect(near(scroller, message)).toBe(true);
    expect([...before].some((message) => !near(scroller, message))).toBe(true);
    frames.until(() => scroller.querySelector("[data-ouro-settling]") === null);

    // Scrolling up, messages come near at the top and start where the topmost moving one is.
    wheel(scroller, -30, view.bottom - 150);
    frames.step(16);
    const moving = new Set(messages().filter((message) => message.style.transform !== ""));
    wheel(scroller, -150, view.bottom + 500);
    frames.step(16);
    const first = [...moving][0]!;
    const above = messages().slice(0, messages().indexOf(first)).filter((message) => message.style.transform !== "");
    expect(above.length).toBeGreaterThan(0);
    for (const message of above) expect(shiftOf(message)).toBeCloseTo(shiftOf(first), 3);
  });

  it("leaves the message under the pointer where it is while the others trail", async () => {
    const { scroller, messages } = await render(<Chat count={40} />);
    await scrollInCode(scroller, 600);
    const frames = holdFrames();
    const view = scroller.getBoundingClientRect();
    const under = messages().find((message) => laidOut(message).top > view.top + view.height / 3)!;
    for (let frame = 0; frame < 3; frame++) {
      wheel(scroller, 10, laidOut(under).middle);
      frames.step(16);
      expect(under.style.transform).toBe("");
      expect(messages().some((message) => shiftOf(message) > 0)).toBe(true);
    }
  });

  it("follows the keys, with the focused message where the scroll starts, and its focus ring moves with it", async () => {
    const { scroller, messages } = await render(<Chat count={30} />);
    (document.querySelector("button") as HTMLElement).focus();
    await pressTab();
    const frames = holdFrames();
    const newest = document.activeElement as HTMLElement;
    expect(newest).toBe(messages().at(-1));
    // After a wheel, the keys scroll from the focused message, not from where the pointer was.
    wheel(scroller, -20, scroller.getBoundingClientRect().top);
    frames.step(16);
    frames.until(() => scroller.querySelector("[data-ouro-settling]") === null);
    // Past the wheel's 250ms, so only the key makes the scroll the reader's.
    frames.step(300);
    // Page Up: the focused message lands exactly where the key puts it, and the others trail above.
    const top = scroller.scrollTop;
    await userEvent.keyboard("{PageUp}");
    scroller.dispatchEvent(new Event("scroll"));
    frames.step(16);
    const paged = document.activeElement as HTMLElement;
    expect(expectFirstFrame(messages().filter((message) => near(scroller, message)), laidOut(paged), scroller.scrollTop - top)).toBeGreaterThan(2);
    expect(paged).not.toBe(newest);
    expect(paged.style.transform).toBe("");
    // Within a pixel: scrolling lands on whole pixels, layout on fractions.
    expect(Math.abs(laidOut(paged).top - scroller.getBoundingClientRect().top - 8)).toBeLessThanOrEqual(1);
    const others = messages().filter((message) => message.style.transform !== "");
    expect(others.length).toBeGreaterThan(0);
    for (const message of others) expect(shiftOf(message)).toBeLessThan(0);
    // The up arrow at once: the message above, still trailing, stops where the key puts it.
    const above = messages()[messages().indexOf(paged) - 1]!;
    expect(shiftOf(above)).toBeLessThan(0);
    await userEvent.keyboard("{ArrowUp}");
    // As focus arrives, before the next frame.
    expect(above.style.transform).toBe("");
    scroller.dispatchEvent(new Event("scroll"));
    frames.step(16);
    expect(document.activeElement).toBe(above);
    expect(above.style.transform).toBe("");
    // Within a pixel: scrolling lands on whole pixels, layout on fractions.
    expect(Math.abs(laidOut(above).top - scroller.getBoundingClientRect().top - 8)).toBeLessThanOrEqual(1);
    // Then a wheel far from it scrolls: the focused message trails too, its ring drawn with it.
    wheel(scroller, -20, scroller.getBoundingClientRect().bottom + 200);
    frames.step(16);
    expect(shiftOf(above)).toBeLessThan(0);
    expect(document.activeElement).toBe(above);
    expect(getComputedStyle(above).outlineStyle).toBe("solid");
    frames.until(() => scroller.querySelector("[data-ouro-settling]") === null);
    expectAtRest(messages());
    // The arrow keys still move between messages.
    const index = messages().indexOf(above);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(messages()[index + 1]);
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(messages().at(-1));
  });

  it("never springs for scrolling the reader did not do: new messages it follows, or scrollTop set in code", async () => {
    const { scroller, messages } = await render(<Chat count={20} />);
    const frames = holdFrames();
    const asked = vi.spyOn(window, "requestAnimationFrame");
    scroller.scrollTop = 200;
    scroller.dispatchEvent(new Event("scroll"));
    scroller.scrollTop = 260;
    scroller.dispatchEvent(new Event("scroll"));
    expect(asked).not.toHaveBeenCalled();
    frames.step(16);
    expectAtRest(messages());
    asked.mockRestore();
  });

  it("follows only the reader's part of a scroll the list adds to as it follows a new message", async () => {
    const { scroller, messages, rerender } = await render(<Chat count={20} />);
    await scrollInCode(scroller, scroller.scrollHeight - scroller.clientHeight - 30);
    const frames = holdFrames();
    const pointer = scroller.getBoundingClientRect().top;
    // The reader scrolls back to the bottom, and in the same frame a message arrives that the list follows.
    wheel(scroller, 30, pointer);
    const before = scroller.scrollTop;
    await rerender(<Chat count={21} />);
    await expect.poll(() => scroller.scrollTop).toBeGreaterThan(before + 20);
    scroller.dispatchEvent(new Event("scroll"));
    frames.step(16);
    expect(expectFirstFrame(messages().filter((message) => near(scroller, message)), pointer, 30)).toBeGreaterThan(3);
  });

  it("springs nothing with springy={false}, while the list still follows new messages and keeps the reader's place", async () => {
    const { scroller, messages, rerender } = await render(<Chat count={20} from={10} springy={false} />);
    const frames = holdFrames();
    await rerender(<Chat count={21} from={10} springy={false} />);
    await expect.poll(() => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight).toBeLessThan(2);
    wheel(scroller, -60, scroller.getBoundingClientRect().top);
    await nextScroll(scroller);
    const reading = messages().find((message) => laidOut(message).top >= scroller.getBoundingClientRect().top)!;
    const place = laidOut(reading).top;
    await rerender(<Chat count={31} from={0} springy={false} />);
    await expect.poll(() => laidOut(reading).top).toBeCloseTo(place, 0);
    frames.step(16);
    expectAtRest(messages());
  });

  it("treats a move of the list's height or more as a jump, not a scroll, and a scroll as the reader's for 250ms after their input", async () => {
    const { scroller, messages } = await render(<Chat count={60} />);
    await scrollInCode(scroller, 400);
    const frames = holdFrames();
    const pointer = scroller.getBoundingClientRect().top;
    wheel(scroller, scroller.clientHeight, pointer);
    frames.step(16);
    expectAtRest(messages());
    wheel(scroller, scroller.clientHeight - 1, pointer);
    frames.step(16);
    expect(messages().some((message) => shiftOf(message) > 0)).toBe(true);
    frames.until(() => scroller.querySelector("[data-ouro-settling]") === null);

    // 250ms after the wheel, a scroll still counts; a moment later it no longer does.
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 0, clientY: pointer, bubbles: true }));
    frames.step(250);
    scroller.scrollTop -= 30;
    scroller.dispatchEvent(new Event("scroll"));
    frames.step(16);
    expect(messages().some((message) => shiftOf(message) < 0)).toBe(true);
    frames.until(() => scroller.querySelector("[data-ouro-settling]") === null);
    frames.step(251);
    scroller.scrollTop -= 30;
    scroller.dispatchEvent(new Event("scroll"));
    frames.step(16);
    expectAtRest(messages());

    // Each scroll of the reader's keeps the next 250ms theirs, as momentum scrolls on after the input.
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 0, clientY: pointer, bubbles: true }));
    frames.step(200);
    scroller.scrollTop -= 1;
    scroller.dispatchEvent(new Event("scroll"));
    frames.step(16);
    frames.step(150);
    expectAtRest(messages());
    scroller.scrollTop -= 30;
    scroller.dispatchEvent(new Event("scroll"));
    frames.step(16);
    expect(messages().some((message) => shiftOf(message) < 0)).toBe(true);
  });

  it("springs messages that arrive after it mounts, inside a group already there too", async () => {
    const grouped = (count: number) => (
      <MessageList label="Conversation" style={{ height: 300 }}>
        <div>
          {count > 4 && <p>Today</p>}
          {Array.from({ length: count }, (_, index) => (
            <Message key={index} role="assistant" name="Ouro">
              {`Message ${index} of ${count}: ${"rest the dough ".repeat(3)}`}
            </Message>
          ))}
        </div>
      </MessageList>
    );
    const { scroller, messages, rerender } = await render(grouped(4));
    await rerender(grouped(40));
    await expect.poll(() => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight).toBeLessThan(2);
    const frames = holdFrames();
    wheel(scroller, -30, scroller.getBoundingClientRect().top);
    frames.step(16);
    expect(shiftOf(messages().at(-1)!)).toBeLessThan(0);
  });

  it("leaves an app's own inline style on a message once it rests", async () => {
    const { scroller } = await render(
      <MessageList label="Conversation" style={{ height: 200 }}>
        {Array.from({ length: 20 }, (_, index) => (
          <Message key={index} role="assistant" name="Ouro" style={{ scrollMarginTop: 4 }}>
            {`Message ${index}: ${"rest the dough ".repeat(3)}`}
          </Message>
        ))}
      </MessageList>,
    );
    const frames = holdFrames();
    wheel(scroller, -30, scroller.getBoundingClientRect().top);
    frames.step(16);
    const moved = [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')].filter((message) => message.style.transform !== "");
    expect(moved.length).toBeGreaterThan(0);
    frames.until(() => scroller.querySelector("[data-ouro-settling]") === null);
    for (const message of moved) expect(message.getAttribute("style")).toBe("scroll-margin-top: 4px;");
  });

  it("moves nothing with reduced motion, or with springy={false}", async () => {
    const { scroller, messages, rerender } = await render(<Chat count={40} />);
    await scrollInCode(scroller, 600);
    await reduceMotion(true);
    const frames = holdFrames();
    const asked = vi.spyOn(window, "requestAnimationFrame");
    const pointer = scroller.getBoundingClientRect().top;
    wheel(scroller, 30, pointer);
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -80, clientY: pointer, bubbles: true }));
    scroller.dispatchEvent(new Event("scroll"));
    expect(asked).not.toHaveBeenCalled();
    frames.step(16);
    expectAtRest(messages());

    // Reduced motion turned on mid-spring stops every message where it belongs, at once.
    await reduceMotion(false);
    frames.step(300);
    await scrollInCode(scroller, 600);
    wheel(scroller, 30, pointer);
    frames.step(16);
    expect(scroller.querySelector("[data-ouro-settling]")).not.toBeNull();
    await reduceMotion(true);
    frames.step(16);
    expectAtRest(messages());

    // springy={false} lets go of messages mid-spring, and springs none after.
    await reduceMotion(false);
    wheel(scroller, 30, pointer);
    frames.step(16);
    expect(scroller.querySelector("[data-ouro-settling]")).not.toBeNull();
    await rerender(<Chat count={40} springy={false} />);
    expectAtRest(messages());
    asked.mockClear();
    wheel(scroller, 30, pointer);
    frames.step(16);
    await scrollInCode(scroller, 0);
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -80, clientY: pointer, bubbles: true }));
    frames.step(16);
    expect(asked).not.toHaveBeenCalled();
    expectAtRest(messages());
    asked.mockRestore();
  });
  it("spreads the messages when a finger pulls past the end, and not when the list itself bounces", async () => {
    const { scroller, messages } = await render(<Chat count={30} />);
    const frames = holdFrames();
    const y = scroller.getBoundingClientRect().top + 200;
    // At the bottom, a finger moving up has nowhere to scroll: the messages near it rise.
    finger(scroller, "touchstart", y);
    finger(scroller, "touchmove", y - 40);
    frames.step(16);
    const band = messages().filter((message) => near(scroller, message));
    expect(expectFirstFrame(band, y - 40, 0, 40 * STRETCH)).toBeGreaterThan(2);
    for (const message of band.filter((each) => each.style.transform !== "")) expect(shiftOf(message)).toBeLessThan(0);
    frames.until(() => scroller.querySelector("[data-ouro-settling]") === null);
    // Where the browser bounced the list itself (its scroll position moved), the springs leave the push to it,
    // and take it up again on the next move if the list then holds still.
    finger(scroller, "touchstart", y);
    scroller.scrollTop -= 1;
    finger(scroller, "touchmove", y - 40);
    frames.step(16);
    expect(scroller.querySelector("[data-ouro-settling]")).toBeNull();
    finger(scroller, "touchmove", y - 60);
    frames.step(16);
    expect(scroller.querySelector("[data-ouro-settling]")).not.toBeNull();
  });

  it("counts the scroll of a finger that rests before it moves as the reader's, from where the finger is", async () => {
    const { scroller, messages } = await render(<Chat count={30} />);
    await scrollInCode(scroller, 400);
    const frames = holdFrames();
    const y = scroller.getBoundingClientRect().top + 20;
    finger(scroller, "touchstart", y);
    frames.step(400);
    finger(scroller, "touchmove", y - 20);
    scroller.scrollTop += 20;
    scroller.dispatchEvent(new Event("scroll"));
    frames.step(16);
    expect(expectFirstFrame(messages().filter((message) => near(scroller, message)), y - 20, 20)).toBeGreaterThan(2);
  });

  it("picks the Tab stop by where messages are laid out while they spring", async () => {
    const { scroller, messages } = await render(<Chat count={40} />);
    // Scroll so that, after the reader's 30px, a message ends 2px inside the list's bottom edge.
    const view = scroller.getBoundingClientRect();
    const edge = messages().find((message) => message.getBoundingClientRect().bottom - view.top + scroller.scrollTop > 900)!;
    const bottom = edge.getBoundingClientRect().bottom - view.top + scroller.scrollTop;
    await scrollInCode(scroller, bottom - scroller.clientHeight + 2 - 30);
    const frames = holdFrames();
    wheel(scroller, 30, view.top);
    frames.step(16);
    // Drawn, it trails past the edge; laid out, it is wholly in view, so it is the newest message wholly in view.
    expect(edge.getBoundingClientRect().bottom).toBeGreaterThan(view.bottom);
    scroller.dispatchEvent(new Event("scroll"));
    expect(edge.getAttribute("tabindex")).toBe("0");
  });

  it("reads where messages are with no more work than before once they rest", async () => {
    const { scroller, messages } = await render(<Chat count={30} />);
    await scrollInCode(scroller, 400);
    const frames = holdFrames();
    wheel(scroller, 30, scroller.getBoundingClientRect().top);
    frames.until(() => scroller.querySelector("[data-ouro-settling]") === null);
    const closest = vi.spyOn(Element.prototype, "closest");
    // The list keeps the reader's place on each scroll, reading every message's box.
    scroller.dispatchEvent(new Event("scroll"));
    expect(closest.mock.contexts.filter((element) => messages().includes(element as HTMLElement))).toEqual([]);
    closest.mockRestore();
  });

  it("leaves a finger pulling past the end alone once springy turns off", async () => {
    const { scroller, messages, rerender } = await render(<Chat count={30} />);
    await rerender(<Chat count={30} springy={false} />);
    const frames = holdFrames();
    const y = scroller.getBoundingClientRect().top + 200;
    finger(scroller, "touchstart", y);
    finger(scroller, "touchmove", y - 40);
    finger(scroller, "touchmove", y - 60);
    frames.step(16);
    expectAtRest(messages());
  });
  it("keeps a tall focused message where the keys put it as they scroll through it", async () => {
    const { scroller } = await render(
      <MessageList label="Conversation" style={{ height: 240 }}>
        <Message role="assistant" name="Ouro" id="long">
          {"A long reply that runs on. ".repeat(60)}
        </Message>
        <Message role="user" name="Ada">
          Thanks
        </Message>
      </MessageList>,
    );
    const long = document.getElementById("long")!;
    await scrollInCode(scroller, 200);
    long.focus({ preventScroll: true });
    const frames = holdFrames();
    // A wheel far from it: the tall message trails.
    wheel(scroller, 20, scroller.getBoundingClientRect().bottom + 400);
    frames.step(16);
    expect(shiftOf(long)).toBeGreaterThan(0);
    // The down arrow scrolls through it without moving focus: it stops trailing at once.
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(long);
    scroller.dispatchEvent(new Event("scroll"));
    frames.step(16);
    expect(long.style.transform).toBe("");
  });
});
