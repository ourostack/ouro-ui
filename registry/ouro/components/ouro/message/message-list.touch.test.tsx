import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
  await page.viewport(390, 844);
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  nodes.push(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return {
    rerender: (next: ReactNode) => act(async () => root!.render(next)),
    scroller: host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!,
  };
}

const texts = (count: number) => Array.from({ length: count }, (_, index) => `Message ${index}: ${"knead ".repeat(14)}`);

function Chat({ items }: { items: string[] }) {
  return (
    <MessageList label="Conversation" style={{ height: Math.min(innerHeight - 40, 600) }}>
      {items.map((text, index) => (
        <Message key={index} role={index % 2 ? "assistant" : "user"} name={index % 2 ? "Ouro" : "Ada"}>
          {text}
        </Message>
      ))}
    </MessageList>
  );
}

const distanceFromBottom = (scroller: HTMLElement) => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

/** Waits until the scroll position reads the same across two frames (touch scrolling coasts). */
async function settle(scroller: HTMLElement) {
  let last = -1;
  await expect
    .poll(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const same = scroller.scrollTop === last;
      last = scroller.scrollTop;
      return same;
    })
    .toBe(true);
}

/** A real one-finger swipe on the list: positive `dy` drags the content down, toward older messages. */
async function swipe(scroller: HTMLElement, dy: number) {
  const rect = scroller.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2 - dy / 2;
  await commands.touchDrag({ from: [x, y], to: [x, y + dy], steps: 12 });
  await settle(scroller);
}

const jumpButton = () => page.getByRole("button", { name: "Jump to latest" });

it("keeps the reader's place on a phone once they swipe up, and jumps back with a 44px button", async () => {
  const items = texts(24);
  const { scroller, rerender } = await render(<Chat items={items} />);
  expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);

  await swipe(scroller, 250);
  expect(distanceFromBottom(scroller)).toBeGreaterThan(100);
  await expect.element(jumpButton()).toBeVisible();
  const top = scroller.scrollTop;

  await rerender(<Chat items={[...items, "A new reply"]} />);
  await rerender(<Chat items={[...items, "A new reply ".repeat(30)]} />);
  await settle(scroller);
  expect(scroller.scrollTop).toBe(top);

  const button = jumpButton().element() as HTMLElement;
  const rect = button.getBoundingClientRect();
  const hits = (x: number, y: number) => button.contains(document.elementFromPoint(x, y));
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  expect(hits(cx, cy - 21) && hits(cx, cy + 21)).toBe(true);
  expect(getComputedStyle(button).fontSize).toBe("16px");

  await commands.tap("[data-ouro-message-list-jump]");
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  await expect.poll(() => jumpButton().query()).toBeNull();
});

it("follows new messages again after the reader swipes back to the bottom", async () => {
  const items = texts(24);
  const { scroller, rerender } = await render(<Chat items={items} />);
  await swipe(scroller, 250);
  await expect.element(jumpButton()).toBeVisible();
  // Swipe back down to the bottom, a screenful at a time.
  for (let swipes = 0; swipes < 10 && distanceFromBottom(scroller) > 1; swipes++) await swipe(scroller, -300);
  await expect.poll(() => jumpButton().query()).toBeNull();
  await rerender(<Chat items={[...items, "Next step"]} />);
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
});

it("keeps 16px message text on a landscape phone", async () => {
  await page.viewport(844, 390);
  const { scroller } = await render(<Chat items={texts(10)} />);
  const message = scroller.querySelector<HTMLElement>('[data-ouro="message"]')!;
  expect(getComputedStyle(message).fontSize).toBe("16px");
  expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  await swipe(scroller, 150);
  await expect.element(jumpButton()).toBeVisible();
  expect(getComputedStyle(jumpButton().element()).fontSize).toBe("16px");
});
