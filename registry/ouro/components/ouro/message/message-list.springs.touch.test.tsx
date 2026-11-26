import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { holdFrames } from "@/registry/ouro/lib/ouro/testing/frames";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
  // Every message in: a long conversation puts its older messages in above the newest, a few a frame.
  return {
    scroller,
    messages: () => [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')],
  };
}

const chat = (count: number) => (
  // Whole: the springs move what is drawn, and this conversation is short.
  <MessageList label="Conversation" style={{ height: 600 }} windowing={false}>
    {Array.from({ length: count }, (_, index) => (
      <Message key={index} role={index % 2 ? "assistant" : "user"} name={index % 2 ? "Ouro" : "Ana"}>
        {`Message ${index}: ${"knead ".repeat(14)}`}
      </Message>
    ))}
  </MessageList>
);

it("springs the messages through a swipe and its fling, and leaves the scroll position where the fling stops", async () => {
  const { scroller, messages } = await render(chat(60));
  const seen = new Set<HTMLElement>();
  const watch = new MutationObserver(() => {
    for (const message of messages()) if (message.style.transform !== "") seen.add(message);
  });
  watch.observe(scroller, { attributes: true, subtree: true, attributeFilter: ["style"] });
  const box = scroller.getBoundingClientRect();
  const x = box.left + box.width / 2;
  await commands.touchDrag({ from: [x, box.top + 120], to: [x, box.top + 520], steps: 8, durationMs: 120 });
  await expect.poll(() => seen.size).toBeGreaterThan(2);
  await expect.poll(() => scroller.querySelector("[data-ouro-settling]")).toBeNull();
  watch.disconnect();
  const top = scroller.scrollTop;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  expect(scroller.scrollTop).toBe(top);
  for (const message of messages()) expect(getComputedStyle(message).transform).toBe("none");
});


it("follows the whole of a fling through a long frame, and settles only once it stops", async () => {
  const { scroller, messages } = await render(chat(60));
  // A frame of 400ms early in the fling, as a busy page has: the fling goes on off the main thread, and its next
  // scroll event comes more than the springs' 250ms after the last.
  let scrolls = 0;
  const stall = () => {
    if (++scrolls !== 2) return;
    const until = performance.now() + 400;
    while (performance.now() < until);
  };
  let ended = false;
  const end = () => (ended = true);
  scroller.addEventListener("scroll", stall);
  scroller.addEventListener("scrollend", end);
  const box = scroller.getBoundingClientRect();
  const x = box.left + box.width / 2;
  await commands.touchDrag({ from: [x, box.top + 120], to: [x, box.top + 520], steps: 8, durationMs: 120 });
  await expect.poll(() => scrolls).toBeGreaterThan(2);
  await expect.poll(() => scroller.querySelector("[data-ouro-settling]")).toBeNull();
  // The messages followed the fling to its end, so they settle after it stops, and the scroll position holds.
  expect(ended).toBe(true);
  const top = scroller.scrollTop;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  expect(scroller.scrollTop).toBe(top);
  // Once the fling ended, the list's own scroll is not the reader's: no message trails it.
  scroller.removeEventListener("scroll", stall);
  scroller.removeEventListener("scrollend", end);
  await new Promise((resolve) => setTimeout(resolve, 300));
  scroller.scrollTop -= 200;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (const message of messages()) expect(message.style.transform).toBe("");
});

it("still follows a late scroll event after scrollend reset `scrolling`, without `going` to carry it", async () => {
  const { scroller, messages } = await render(chat(60));
  // Holds every frame from before the drag even starts: a native frame requested before this test
  // held them would run on its own, outside this test's control (the browser's own pace, not this
  // test's), so nothing may run until this test calls `step`.
  const frames = holdFrames();
  const box = scroller.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const drag = commands.touchDrag({ from: [x, box.top + 300], to: [x, box.top + 260], steps: 2, durationMs: 40 });
  // The drag's touches reach the page over the real clock (through CDP, outside this frame hold), so
  // this test steps the held frames alongside it, until the one the drag's own scroll asked for has
  // drawn a message, or the drag itself finishes first.
  let dragDone = false;
  void drag.then(() => (dragDone = true));
  while (!dragDone && scroller.querySelector("[data-ouro-settling]") === null) {
    frames.step();
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await drag;
  frames.step();
  expect(scroller.querySelector("[data-ouro-settling]")).not.toBeNull();
  // The reader's scroll really ended (scrollend), resetting `scrolling` to false, while messages are
  // still settling (`moving` non-empty): springs asks for one more frame (not run yet, held above).
  scroller.dispatchEvent(new Event("scrollend"));
  // A jump of the list's height or more, with no scroll event yet: as far as springs knows, nothing
  // happened since the last frame it read.
  const before = scroller.scrollTop;
  scroller.scrollTop -= box.height + 50;
  // A scroll event lands within springs' own ARMED window, after `scrollend` already reset `scrolling`:
  // its own listener's `going ||= scrolling` reads `scrolling` as false here, so `going` does not arm,
  // even though this same call reopens `scrolling` to true for the frame right after (#3736, #3741).
  scroller.dispatchEvent(new Event("scroll"));
  // The one frame now due reads the jump with `going` false and `scrolling` newly true: it must
  // still take the jump as the fling's own (kept going by `scrolling` alone), seeding the messages
  // the jump newly brings into view the same as the ones already moving, not a jump to discard,
  // which would leave the messages the jump reveals with no transform of their own (popping in at
  // rest instead of trailing in, #3736, #3741).
  frames.step();
  const after = scroller.scrollTop;
  expect(after).toBeLessThan(before - box.height);
  const seeded = messages().filter((message) => message.style.transform !== "").length;
  expect(seeded).toBeGreaterThanOrEqual(6);
  frames.release();
});
