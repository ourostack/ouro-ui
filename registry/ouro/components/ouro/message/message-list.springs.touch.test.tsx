import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { springAt } from "@/registry/ouro/lib/ouro/spring";
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
  return {
    scroller,
    messages: () => [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')],
    rerender: (next: ReactNode) => act(async () => root!.render(next)),
  };
}

const chat = (count: number, springy?: boolean) => (
  <MessageList label="Conversation" style={{ height: 600 }} springy={springy}>
    {Array.from({ length: count }, (_, index) => (
      <Message key={index} role={index % 2 ? "assistant" : "user"} name={index % 2 ? "Ouro" : "Ada"}>
        {`Message ${index}: ${"knead ".repeat(14)}`}
      </Message>
    ))}
  </MessageList>
);

const shiftOf = (element: HTMLElement) => (element.style.transform === "" ? 0 : Number(/^translateY\((.+)px\)$/.exec(element.style.transform)![1]));

/** Where a message stands after the first 16ms frame of a push of `push` px from `y` (the feel the docs give). */
function firstFrame(message: HTMLElement, y: number, push: number) {
  const box = message.getBoundingClientRect();
  const reach = Math.min(Math.abs((box.top + box.bottom) / 2 - shiftOf(message) - y) / 400, 1);
  return springAt(20 * Math.tanh((-push * 0.25 * (1 - reach)) / 20), 0, 0, 16, { response: 0.42, damping: 0.72 }).value;
}

/** A finger event at `y` over the list, as the browser sends it. */
function finger(scroller: HTMLElement, type: "touchstart" | "touchmove", y: number) {
  const touch = new Touch({ identifier: 1, target: scroller, clientX: 100, clientY: y });
  scroller.dispatchEvent(new TouchEvent(type, { touches: [touch], changedTouches: [touch], bubbles: true }));
}

it("spreads the messages when a finger pulls past the end, and not when the list itself bounces", async () => {
  const { scroller, messages } = await render(chat(30));
  const frames = holdFrames();
  const y = scroller.getBoundingClientRect().top + 400;
  // At the bottom, a finger moving up has nowhere to scroll: the messages near it rise.
  finger(scroller, "touchstart", y);
  finger(scroller, "touchmove", y - 40);
  frames.step(16);
  const moved = messages().filter((message) => message.style.transform !== "");
  expect(moved.length).toBeGreaterThan(2);
  for (const message of moved) {
    expect(shiftOf(message)).toBeLessThan(0);
    expect(shiftOf(message)).toBeCloseTo(firstFrame(message, y - 40, 40), 4);
  }
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

it("counts the scroll of a finger that rests before it moves as the reader's", async () => {
  const { scroller, messages } = await render(chat(30));
  const scrolled = new Promise((resolve) => scroller.addEventListener("scroll", resolve, { once: true }));
  scroller.scrollTop = 400;
  await scrolled;
  const frames = holdFrames();
  const y = scroller.getBoundingClientRect().top + 20;
  finger(scroller, "touchstart", y);
  frames.step(400);
  finger(scroller, "touchmove", y - 20);
  scroller.scrollTop += 20;
  scroller.dispatchEvent(new Event("scroll"));
  frames.step(16);
  expect(messages().some((message) => shiftOf(message) > 0)).toBe(true);
});

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

it("leaves a finger pulling past the end alone once springy turns off", async () => {
  const { scroller, messages, rerender } = await render(chat(30));
  await rerender(chat(30, false));
  const frames = holdFrames();
  const y = scroller.getBoundingClientRect().top + 400;
  finger(scroller, "touchstart", y);
  finger(scroller, "touchmove", y - 40);
  frames.step(16);
  for (const message of messages()) expect(message.style.transform).toBe("");
});
