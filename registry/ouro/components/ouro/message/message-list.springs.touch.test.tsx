import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

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
  <MessageList label="Conversation" style={{ height: 600 }}>
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
