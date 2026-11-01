import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { commands, page } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { rotate } from "@/registry/ouro/lib/ouro/testing/rotate";

// Runs in the `touch` project: Chromium as a 390x844 phone with a coarse pointer.

let root: Root | undefined;
const nodes: Element[] = [];
afterEach(async () => {
  await act(async () => root?.unmount());
  for (const node of nodes.splice(0)) node.remove();
  await rotate(390, 844);
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

/** Waits until the scroll position reads the same across two frames (touch scrolling coasts), and no message springs. */
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
  // And the messages have come to rest from the springs, so where each is drawn is where it is laid out.
  await expect.poll(() => scroller.querySelector("[data-ouro-settling]")).toBeNull();
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
  // Finish this fixture's font reflow before checking that its bottom position stays stable.
  await document.fonts.ready;
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  // Once there it stays there: still pinned two frames later, with no button to jump back.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  expect(jumpButton().query()).toBeNull();

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
  await rotate(844, 390);
  const { scroller } = await render(<Chat items={texts(10)} />);
  const message = scroller.querySelector<HTMLElement>('[data-ouro="message"]')!;
  expect(getComputedStyle(message).fontSize).toBe("16px");
  expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  await swipe(scroller, 150);
  await expect.element(jumpButton()).toBeVisible();
  expect(getComputedStyle(jumpButton().element()).fontSize).toBe("16px");
});

interface Item {
  id: string;
  role: "user" | "assistant";
  text: string;
}
const make = (from: number, count: number): Item[] =>
  Array.from({ length: count }, (_, offset) => ({
    id: `m${from + offset}`,
    role: (from + offset) % 2 ? "assistant" : "user",
    text: `Message ${from + offset}: ${"knead ".repeat(14)}`,
  }));

/** A phone chat screen: the list fills the space above a composer, and the on-screen keyboard shrinks `height`. */
function PhoneChat({ items, height }: { items: Item[]; height: number }) {
  return (
    <div style={{ height, display: "flex", flexDirection: "column" }}>
      <MessageList label="Conversation" className="flex-1">
        {items.map((item) => (
          <Message key={item.id} role={item.role} name={item.role === "user" ? "Ada" : "Ouro"}>
            {item.text}
          </Message>
        ))}
      </MessageList>
      <input aria-label="Message" style={{ height: 44, fontSize: 16 }} />
    </div>
  );
}
const KEYBOARD = 336;

it("stays at the bottom when the on-screen keyboard opens, and follows a new message", async () => {
  const items = make(0, 24);
  const { scroller, rerender } = await render(<PhoneChat items={items} height={800} />);
  expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  await rerender(<PhoneChat items={items} height={800 - KEYBOARD} />);
  await settle(scroller);
  expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  await rerender(<PhoneChat items={[...items, ...make(24, 1)]} height={800 - KEYBOARD} />);
  await settle(scroller);
  expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
});

it("keeps a scrolled-up reader's place while the keyboard opens and closes and messages arrive", async () => {
  const items = make(0, 24);
  const { scroller, rerender } = await render(<PhoneChat items={items} height={800} />);
  await swipe(scroller, 250);
  const top = scroller.scrollTop;
  await rerender(<PhoneChat items={items} height={800 - KEYBOARD} />);
  await settle(scroller);
  expect(scroller.scrollTop).toBe(top);
  await rerender(<PhoneChat items={[...items, ...make(24, 2)]} height={800 - KEYBOARD} />);
  await settle(scroller);
  expect(scroller.scrollTop).toBe(top);
  await rerender(<PhoneChat items={[...items, ...make(24, 2)]} height={800} />);
  await settle(scroller);
  expect(scroller.scrollTop).toBe(top);
  await expect.element(jumpButton()).toBeVisible();
});

it("keeps the message a scrolled-up reader is on in place when older history loads above it", async () => {
  const items = make(10, 20);
  const { scroller, rerender } = await render(<PhoneChat items={items} height={800} />);
  await swipe(scroller, 250);
  const viewTop = scroller.getBoundingClientRect().top;
  const first = [...scroller.querySelectorAll('[data-ouro="message"]')].find((node) => node.getBoundingClientRect().top >= viewTop)!;
  const before = first.getBoundingClientRect().top;
  await rerender(<PhoneChat items={[...make(0, 10), ...items]} height={800} />);
  await settle(scroller);
  expect(Math.abs(first.getBoundingClientRect().top - before)).toBeLessThanOrEqual(1);
  await expect.element(jumpButton()).toBeVisible();
});

it("shows a message's action bar after a tap in a list, where the message itself takes keyboard focus", async () => {
  await render(
    <MessageList label="Channel" style={{ height: 400 }}>
      {["Earlier", "Newest"].map((text) => (
        <Message key={text} variant="chat" role="assistant" name="Mara Quill" id={text} actions={[{ key: "like", label: "Like", icon: "👍", onClick: () => {} }]}>
          {text}
        </Message>
      ))}
    </MessageList>,
  );
  for (const id of ["Newest", "Earlier"]) {
    const message = document.getElementById(id)!;
    expect(message.hasAttribute("tabindex")).toBe(true);
    await expect.poll(() => message.querySelector('[role="toolbar"]')).not.toBeNull();
    const bar = message.querySelector<HTMLElement>('[role="toolbar"]')!;
    expect(getComputedStyle(bar).opacity).toBe("0");
    // A tap whose target is the message itself, as on the space beside its bubble.
    await act(async () => void message.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" })));
    await expect.poll(() => getComputedStyle(bar).opacity).toBe("1");
  }
});
