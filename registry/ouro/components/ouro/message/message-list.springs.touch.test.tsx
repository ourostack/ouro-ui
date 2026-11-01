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
  return {
    scroller,
    messages: () => [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')],
  };
}

const chat = (count: number) => (
  <MessageList label="Conversation" style={{ height: 600 }}>
    {Array.from({ length: count }, (_, index) => (
      <Message key={index} role={index % 2 ? "assistant" : "user"} name={index % 2 ? "Ouro" : "Ada"}>
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

