import { useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get list() {
      return host.querySelector<HTMLElement>('[data-ouro="message-list"]')!;
    },
    get scroller() {
      return host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    },
    get live() {
      return host.querySelector<HTMLElement>("[data-ouro-message-list-live]")!;
    },
  };
}

interface Item {
  id: number | string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}

const history = (count: number, from = 0): Item[] =>
  Array.from({ length: count }, (_, offset) => ({
    id: from + offset,
    role: (from + offset) % 2 ? "assistant" : "user",
    text: `Message ${from + offset}: ${"step ".repeat(12)}`,
  }));

/** The first message whose top is inside the list's view, and where that top is. */
function firstVisible(scroller: HTMLElement): { message: Element; top: number } {
  const viewTop = scroller.getBoundingClientRect().top;
  const message = [...scroller.querySelectorAll('[data-ouro="message"]')].find((node) => node.getBoundingClientRect().top >= viewTop)!;
  return { message, top: message.getBoundingClientRect().top };
}

function Chat({ items, label = "Conversation", ...rest }: { items: Item[]; label?: string; jumpLabel?: string; newMessageLabel?: (author: string, text: string) => string }) {
  return (
    <MessageList label={label} style={{ height: 300 }} {...rest}>
      {items.map((item) => (
        <Message key={item.id} role={item.role} name={item.role === "user" ? "Ada" : "Ouro"} streaming={item.streaming}>
          {item.text}
        </Message>
      ))}
    </MessageList>
  );
}

const distanceFromBottom = (scroller: HTMLElement) => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

/** Each text the live region gained, in order, collected from its mutations. */
function recordAnnouncements(live: HTMLElement): { spoken: string[]; stop: () => void } {
  const spoken: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) spoken.push(node.textContent ?? "");
  });
  observer.observe(live, { childList: true, subtree: true });
  return { spoken, stop: () => observer.disconnect() };
}

/** Scrolls with the real mouse wheel over the list, as a person would, and waits for the scroll to settle. */
async function wheel(scroller: HTMLElement, deltaY: number) {
  const before = scroller.scrollTop;
  await userEvent.wheel(scroller, { delta: { y: deltaY } });
  await expect.poll(() => scroller.scrollTop !== before).toBe(true);
  await settle(scroller);
}

/** Waits until the scroll position reads the same across two frames. */
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

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("MessageList", () => {
  it("outlines the scrollable region under forced colours, so a contrast theme shows where it ends", async () => {
    await commands.emulateMedia({ forcedColors: "active" });
    try {
      // Without messages the region itself is the Tab stop while it scrolls.
      const { scroller } = await render(
        <MessageList label="Notes" style={{ height: 300 }}>
          <p>{"A long note. ".repeat(300)}</p>
        </MessageList>,
      );
      expect(scroller.getAttribute("tabindex")).toBe("0");
      expect(getComputedStyle(scroller).outlineStyle).toBe("solid");
      expect(parseFloat(getComputedStyle(scroller).outlineWidth)).toBeGreaterThan(0);
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });

  it("is a named region that opens at the newest message, which is its Tab stop", async () => {
    const { scroller } = await render(<Chat items={history(20)} />);
    await expect.element(page.getByRole("region", { name: "Conversation" })).toBeVisible();
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(scroller.hasAttribute("tabindex")).toBe(false);
    const messages = [...scroller.querySelectorAll('[data-ouro="message"]')];
    expect(messages.map((message) => message.getAttribute("tabindex"))).toEqual([...Array<string>(19).fill("-1"), "0"]);
  });

  it("follows new messages and streaming text while the reader is at the bottom", async () => {
    const items = history(20);
    const { scroller, rerender } = await render(<Chat items={items} />);
    const next = [...items, { id: 20, role: "assistant" as const, text: "Rest", streaming: true }];
    await rerender(<Chat items={next} />);
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    const grown = [...items, { id: 20, role: "assistant" as const, text: "Rest the dough. ".repeat(40), streaming: true }];
    await rerender(<Chat items={grown} />);
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
  });

  it("never moves the view once the reader scrolls up, and offers a jump to the latest", async () => {
    const items = history(20);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await wheel(scroller, -400);
    const top = scroller.scrollTop;
    await expect.element(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();

    await rerender(<Chat items={[...items, { id: 20, role: "assistant", text: "A new reply" }]} />);
    await rerender(<Chat items={[...items, { id: 20, role: "assistant", text: "A new reply. ".repeat(40) }]} />);
    // Two frames, so a resize observer or scroll would have run.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(scroller.scrollTop).toBe(top);

    await userEvent.click(page.getByRole("button", { name: "Jump to latest" }));
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
    // Focus moves to the newest message, not to <body>, when the button goes.
    expect(document.activeElement).toBe([...scroller.querySelectorAll('[data-ouro="message"]')].at(-1));

    // Back at the bottom, it follows again.
    await rerender(<Chat items={[...items, { id: 20, role: "assistant", text: "A new reply" }, { id: 21, role: "user", text: "Thanks" }]} />);
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  });

  it("keeps the reader's place when older history loads in the same update that changes the key of the message they are on", async () => {
    const items = history(20, 10);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await wheel(scroller, -400);
    const before = firstVisible(scroller);
    const index = [...scroller.querySelectorAll('[data-ouro="message"]')].indexOf(before.message);
    const swapped = items.map((item, at) => (at === index ? { ...item, id: `server-${item.id}` } : item));
    await rerender(<Chat items={[...history(10), ...swapped]} />);
    await settle(scroller);
    const replacement = scroller.querySelectorAll('[data-ouro="message"]')[index + 10]!;
    expect(Math.abs(replacement.getBoundingClientRect().top - before.top)).toBeLessThanOrEqual(1);
  });

  it("follows again once the reader scrolls back down to the bottom", async () => {
    const items = history(20);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await wheel(scroller, -200);
    await expect.element(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    await wheel(scroller, 10_000);
    await expect.poll(() => page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
    await rerender(<Chat items={[...items, { id: 20, role: "assistant", text: "More" }]} />);
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  });

  it("stays put when the reader scrolls up only a few pixels", async () => {
    const items = history(20);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await wheel(scroller, -3);
    const top = scroller.scrollTop;
    await rerender(<Chat items={[...items, { id: 20, role: "assistant", text: "More" }]} />);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(scroller.scrollTop).toBe(top);
  });

  it("takes a translated jump label", async () => {
    const { scroller } = await render(<Chat items={history(20)} jumpLabel="Aller au dernier" />);
    await wheel(scroller, -400);
    await expect.element(page.getByRole("button", { name: "Aller au dernier" })).toBeVisible();
  });

  it("announces each new message once, politely, and never the history", async () => {
    const items = history(6);
    const { live, rerender } = await render(<Chat items={items} />);
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("");
    const { spoken, stop } = recordAnnouncements(live);

    await rerender(<Chat items={[...items, { id: 6, role: "assistant", text: "Preheat the oven." }]} />);
    // Re-rendering the same messages says nothing new.
    await rerender(<Chat items={[...items, { id: 6, role: "assistant", text: "Preheat the oven." }]} />);
    await rerender(<Chat label="Chat" items={[...items, { id: 6, role: "assistant", text: "Preheat the oven." }]} />);
    stop();
    expect(spoken).toEqual(["Ouro: Preheat the oven."]);
  });

  it("reads innerText only for a message it reads out, not for a user's message or a streamed token", async () => {
    const items = history(2);
    const { live, rerender } = await render(<Chat items={items} />);
    const { spoken, stop } = recordAnnouncements(live);
    const layout = vi.spyOn(HTMLElement.prototype, "innerText", "get");
    await rerender(<Chat items={[...items, { id: 2, role: "user", text: "Thanks" }]} />);
    await rerender(<Chat items={[...items, { id: 2, role: "user", text: "Thanks" }, { id: 3, role: "assistant", text: "Rest", streaming: true }]} />);
    await rerender(<Chat items={[...items, { id: 2, role: "user", text: "Thanks" }, { id: 3, role: "assistant", text: "Rest it", streaming: true }]} />);
    await act(async () => {});
    expect(layout).not.toHaveBeenCalled();
    await rerender(<Chat items={[...items, { id: 2, role: "user", text: "Thanks" }, { id: 3, role: "assistant", text: "Rest it." }]} />);
    await expect.poll(() => spoken.length).toBe(1);
    expect(layout).toHaveBeenCalled();
    stop();
    expect(spoken).toEqual(["Ouro: Rest it."]);
  });

  it("reads out nothing while it is in a closed panel, without laying out what the panel hides, and reads on once shown", async () => {
    const items = history(2);
    const panel = (node: ReactNode, open: boolean) => <div hidden={open ? undefined : ("until-found" as unknown as boolean)}>{node}</div>;
    const { live, rerender } = await render(panel(<Chat items={items} />, false));
    const { spoken, stop } = recordAnnouncements(live);
    const layout = vi.spyOn(HTMLElement.prototype, "innerText", "get");
    // A streaming reply that ends after the panel opens is still read.
    await rerender(panel(<Chat items={[...items, { id: 2, role: "assistant", text: "Hidden." }, { id: 3, role: "assistant", text: "Rest", streaming: true }]} />, false));
    await act(async () => {});
    expect(layout).not.toHaveBeenCalled();
    await rerender(panel(<Chat items={[...items, { id: 2, role: "assistant", text: "Hidden." }, { id: 3, role: "assistant", text: "Rest it." }]} />, true));
    await expect.poll(() => spoken.length).toBe(1);
    stop();
    expect(spoken).toEqual(["Ouro: Rest it."]);
  });

  it("does not read back the user's own message", async () => {
    const items = history(2);
    const { live, rerender } = await render(<Chat items={items} />);
    const { spoken, stop } = recordAnnouncements(live);
    await rerender(<Chat items={[...items, { id: 2, role: "user", text: "Thanks" }]} />);
    await act(async () => {});
    stop();
    expect(spoken).toEqual([]);
  });

  it("announces a streamed reply once, when it finishes, with its full text", async () => {
    const items = history(2);
    const { live, rerender } = await render(<Chat items={items} />);
    const { spoken, stop } = recordAnnouncements(live);
    await rerender(<Chat items={[...items, { id: 2, role: "assistant", text: "", streaming: true }]} />);
    await rerender(<Chat items={[...items, { id: 2, role: "assistant", text: "Rest it", streaming: true }]} />);
    await rerender(<Chat items={[...items, { id: 2, role: "assistant", text: "Rest it for an hour.", streaming: true }]} />);
    expect(spoken).toEqual([]);
    await rerender(<Chat items={[...items, { id: 2, role: "assistant", text: "Rest it for an hour." }]} />);
    await rerender(<Chat items={[...items, { id: 2, role: "assistant", text: "Rest it for an hour." }]} />);
    await expect.poll(() => spoken.length).toBe(1);
    stop();
    expect(spoken).toEqual(["Ouro: Rest it for an hour."]);
  });

  it("announces a reply that was streaming when the list mounted, once it finishes", async () => {
    const items = history(2);
    const { live, rerender } = await render(<Chat items={[...items, { id: 2, role: "assistant", text: "Rest", streaming: true }]} />);
    const { spoken, stop } = recordAnnouncements(live);
    await rerender(<Chat items={[...items, { id: 2, role: "assistant", text: "Rest it." }]} />);
    await expect.poll(() => spoken.length).toBe(1);
    stop();
    expect(spoken).toEqual(["Ouro: Rest it."]);
  });

  it("announces two messages that arrive together, each once, in order", async () => {
    const items = history(2);
    const { live, rerender } = await render(<Chat items={items} />);
    const { spoken, stop } = recordAnnouncements(live);
    await rerender(
      <Chat
        items={[
          ...items,
          { id: 2, role: "assistant", text: "First." },
          { id: 3, role: "assistant", text: "Second." },
        ]}
      />,
    );
    await expect.poll(() => spoken.length).toBe(2);
    stop();
    expect(spoken).toEqual(["Ouro: First.", "Ouro: Second."]);
  });

  it("announces nothing for the messages it mounts with", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const spoken: string[] = [];
    // Watch the live region from its creation, so a message announced on mount would be seen.
    const observer = new MutationObserver(() => {
      const live = host.querySelector("[data-ouro-message-list-live]");
      if (live?.textContent) spoken.push(live.textContent);
    });
    observer.observe(host, { childList: true, subtree: true, characterData: true });
    const root = createRoot(host);
    roots.push(root);
    await act(async () => root.render(<Chat items={[...history(5), { id: 5, role: "assistant", text: "Rest it.", streaming: false }]} />));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observer.disconnect();
    expect(spoken).toEqual([]);
  });

  it("announces a first reply that arrives in a list that mounted empty", async () => {
    const { live, rerender } = await render(<Chat items={[]} />);
    const { spoken, stop } = recordAnnouncements(live);
    await rerender(<Chat items={[{ id: 0, role: "assistant", text: "Hi, I'm Ouro." }]} />);
    await expect.poll(() => spoken.length).toBe(1);
    stop();
    expect(spoken).toEqual(["Ouro: Hi, I'm Ouro."]);
  });

  it("never announces the first messages that fill an empty list, such as history fetched after mount", async () => {
    const { live, rerender } = await render(<Chat items={[]} />);
    const { spoken, stop } = recordAnnouncements(live);
    await rerender(<Chat items={history(20)} />);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(spoken).toEqual([]);
    await rerender(<Chat items={[...history(20), { id: 20, role: "assistant", text: "Preheat the oven." }]} />);
    await expect.poll(() => spoken.length).toBe(1);
    stop();
    expect(spoken).toEqual(["Ouro: Preheat the oven."]);
  });

  it("never announces older history loaded above, and keeps the reader's place while it loads", async () => {
    const items = history(20, 10);
    const { scroller, live, rerender } = await render(<Chat items={items} />);
    const { spoken, stop } = recordAnnouncements(live);
    await wheel(scroller, -400);
    const before = firstVisible(scroller);
    await rerender(<Chat items={[...history(10), ...items]} />);
    await settle(scroller);
    expect(spoken).toEqual([]);
    // The message the reader was on has not moved.
    expect(Math.abs(before.message.getBoundingClientRect().top - before.top)).toBeLessThanOrEqual(1);
    expect(firstVisible(scroller).message).toBe(before.message);
    await expect.element(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    // A reply after that is still new.
    await rerender(<Chat items={[...history(10), ...items, { id: 30, role: "assistant", text: "Preheat the oven." }]} />);
    await expect.poll(() => spoken.length).toBe(1);
    stop();
    expect(spoken).toEqual(["Ouro: Preheat the oven."]);
  });

  it("keeps the reader's place exactly when they scroll and older history loads in the same frame", async () => {
    const items = history(20, 10);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await wheel(scroller, -400);
    const before = firstVisible(scroller);
    // The reader scrolls 30px up, and older messages arrive, before the browser draws again: the
    // browser sends the scroll event once the older messages are already in the page.
    scroller.scrollTop -= 30;
    await rerender(<Chat items={[...history(10), ...items]} />);
    await settle(scroller);
    // The message the reader was on moved only by their own 30px, not by the history above it.
    expect(Math.abs(before.message.getBoundingClientRect().top - (before.top + 30))).toBeLessThanOrEqual(1);
  });

  it("keeps the reader's place exactly when their scroll event comes after older history arrives, before the list has kept their place", async () => {
    const items = history(20, 10);
    const { scroller } = await render(<Chat items={items} />);
    await wheel(scroller, -400);
    const before = firstVisible(scroller);
    await act(async () => {
      scroller.scrollTop -= 30;
      // The older messages are in the page when the scroll event arrives, and the list has not yet kept the reader's place.
      flushSync(() => roots.at(-1)!.render(<Chat items={[...history(10), ...items]} />));
      scroller.dispatchEvent(new Event("scroll"));
    });
    await settle(scroller);
    expect(Math.abs(before.message.getBoundingClientRect().top - (before.top + 30))).toBeLessThanOrEqual(1);
  });

  it("keeps the first message whose top is in view in place when the one partly above it grows", async () => {
    const items = history(20, 10);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await wheel(scroller, -400);
    const view = scroller.getBoundingClientRect();
    const messages = [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    // Bring a message to sit partly above the view, so the next one is the first whose top is in view.
    const partly = messages.find((message) => message.getBoundingClientRect().bottom > view.top)!;
    scroller.scrollTop += partly.getBoundingClientRect().top - view.top + 10;
    await settle(scroller);
    const index = messages.indexOf(partly);
    const whole = messages[index + 1]!;
    const top = whole.getBoundingClientRect().top;
    await rerender(<Chat items={items.map((item, at) => (at === index ? { ...item, text: `${item.text} ${"more ".repeat(40)}` } : item))} />);
    await settle(scroller);
    expect(Math.abs(whole.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });

  it("keeps the reader's place when a message between them and the newest grows", async () => {
    const items = history(20, 10);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await wheel(scroller, -800);
    const before = firstVisible(scroller);
    // The first message wholly below the reader's view grows; the newest messages, further down, move.
    const view = scroller.getBoundingClientRect();
    const grown = [...scroller.querySelectorAll('[data-ouro="message"]')].findIndex((message) => message.getBoundingClientRect().top >= view.bottom);
    await rerender(<Chat items={items.map((item, at) => (at === grown ? { ...item, text: `${item.text} ${"more ".repeat(40)}` } : item))} />);
    await settle(scroller);
    expect(Math.abs(before.message.getBoundingClientRect().top - before.top)).toBeLessThanOrEqual(1);
  });

  it("keeps the reader's place in a message that fills the view when older history loads above", async () => {
    const items: Item[] = [...history(3, 10), { id: 13, role: "assistant", text: "A long reply that runs on. ".repeat(80) }, ...history(3, 14)];
    const { scroller, rerender } = await render(<Chat items={items} />);
    const long = [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')][3]!;
    // Into the middle of the long reply, whose top is above the view and bottom below it.
    scroller.scrollTop += long.getBoundingClientRect().top - scroller.getBoundingClientRect().top + 200;
    await settle(scroller);
    const top = long.getBoundingClientRect().top;
    await rerender(<Chat items={[...history(10), ...items]} />);
    await settle(scroller);
    expect(Math.abs(long.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });

  it("leaves the correction to the browser where it anchors the scroll itself, so the reader's place moves once, not twice", async () => {
    const items = history(20, 10);
    const { scroller, rerender } = await render(<Chat items={items} />);
    // An app that turns the browser's own scroll anchoring back on, where the browser has it.
    scroller.style.overflowAnchor = "auto";
    await wheel(scroller, -400);
    const before = firstVisible(scroller);
    await rerender(<Chat items={[...history(10), ...items]} />);
    await settle(scroller);
    expect(Math.abs(before.message.getBoundingClientRect().top - before.top)).toBeLessThanOrEqual(1);
    expect(firstVisible(scroller).message).toBe(before.message);
  });

  it("keeps the reader's place among an app's own messages marked data-ouro-message-list-item, and announces them as it does Messages", async () => {
    /** An app's own message, not Ouro's Message, marked for the list. */
    function Post({ item }: { item: Item }) {
      return (
        <article data-ouro-message-list-item="" data-role={item.role} aria-busy={item.streaming || undefined} style={{ padding: 8 }}>
          <span data-ouro-message-author="">{item.role === "user" ? "Ada" : "Grace"}</span>
          <p data-ouro-message-content="">{item.text}</p>
        </article>
      );
    }
    const Posts = ({ items }: { items: Item[] }) => (
      <MessageList label="Team chat" style={{ height: 300 }}>
        {items.map((item) => (
          <Post key={item.id} item={item} />
        ))}
      </MessageList>
    );
    const items = history(20, 10);
    const { scroller, live, rerender } = await render(<Posts items={items} />);
    expect(scroller.querySelector('[data-ouro="message"]')).toBeNull();
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    const { spoken, stop } = recordAnnouncements(live);
    await wheel(scroller, -400);
    const viewTop = scroller.getBoundingClientRect().top;
    const before = [...scroller.querySelectorAll("[data-ouro-message-list-item]")].find((node) => node.getBoundingClientRect().top >= viewTop)!;
    const top = before.getBoundingClientRect().top;
    await rerender(<Posts items={[...history(10), ...items]} />);
    await settle(scroller);
    expect(Math.abs(before.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
    // The reader's own post is not read back; a reply is, once it finishes streaming.
    const sent = [...history(10), ...items, { id: 30, role: "user" as const, text: "On my way." }];
    await rerender(<Posts items={sent} />);
    await rerender(<Posts items={[...sent, { id: 31, role: "assistant", text: "See you", streaming: true }]} />);
    await rerender(<Posts items={[...sent, { id: 31, role: "assistant", text: "See you at six." }]} />);
    await expect.poll(() => spoken.length).toBe(1);
    stop();
    expect(spoken).toEqual(["Grace: See you at six."]);
  });

  it("looks for messages only when one comes, goes or stops streaming, not when a streamed reply gains a formatted word", async () => {
    const chat = (reply: ReactNode, streaming = true) => (
      <MessageList label="Conversation" style={{ height: 300 }}>
        <Message role="user" name="Ada">
          How long does the dough rest?
        </Message>
        <Message role="assistant" name="Ouro" streaming={streaming}>
          {reply}
        </Message>
      </MessageList>
    );
    const { list, live, rerender } = await render(chat("Rest"));
    const { spoken, stop } = recordAnnouncements(live);
    // Each look for messages asks whether the list is in a closed panel.
    const looks = vi.spyOn(list.querySelector<HTMLElement>("[data-ouro-message-list-content]")!, "closest");
    await rerender(chat(<>Rest <b>it</b></>));
    await act(async () => {});
    expect(looks).not.toHaveBeenCalled();
    await rerender(chat(<>Rest <b>it</b> an hour.</>, false));
    await expect.poll(() => spoken.length).toBe(1);
    expect(looks).toHaveBeenCalled();
    stop();
    expect(spoken).toEqual(["Ouro: Rest it an hour."]);
  });

  it("announces a reply that arrives inside a new group, such as the messages under a day's heading", async () => {
    const Days = ({ days }: { days: Item[][] }) => (
      <MessageList label="Conversation" style={{ height: 300 }}>
        {days.map((day, index) => (
          <section key={index} aria-label={`Day ${index + 1}`}>
            {day.map((item) => (
              <Message key={item.id} role={item.role} name={item.role === "user" ? "Ada" : "Ouro"}>
                {item.text}
              </Message>
            ))}
          </section>
        ))}
      </MessageList>
    );
    const { live, rerender } = await render(<Days days={[history(2)]} />);
    const { spoken, stop } = recordAnnouncements(live);
    await rerender(<Days days={[history(2), [{ id: 2, role: "assistant", text: "Good morning." }]]} />);
    await expect.poll(() => spoken.length).toBe(1);
    stop();
    expect(spoken).toEqual(["Ouro: Good morning."]);
  });

  it("announces an app's own message set as HTML, which arrives with the text around it in one change", async () => {
    const Feed = ({ html }: { html: string }) => (
      <MessageList label="Team chat" style={{ height: 300 }}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </MessageList>
    );
    const { live, rerender } = await render(<Feed html="" />);
    const { spoken, stop } = recordAnnouncements(live);
    const post = '<article data-ouro-message-list-item="" data-role="assistant"><span data-ouro-message-author="">Grace</span><p data-ouro-message-content="">Standup moved to ten.</p></article>';
    await rerender(<Feed html={`\n${post}\n`} />);
    await expect.poll(() => spoken.length).toBe(1);
    stop();
    expect(spoken).toEqual(["Grace: Standup moved to ten."]);
  });

  it("says nothing when a message's key changes but it stays in place, as when a temporary id becomes the server's", async () => {
    const items = history(4);
    const { live, rerender } = await render(<Chat items={items} />);
    const { spoken, stop } = recordAnnouncements(live);
    const reply = { id: "temp", role: "assistant" as const, text: "Preheat the oven." };
    await rerender(<Chat items={[...items, reply]} />);
    await expect.poll(() => spoken.length).toBe(1);
    await rerender(<Chat items={[...items, { ...reply, id: "server-9" }]} />);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // A swap and a new reply together: only the reply is new.
    await rerender(<Chat items={[...items, { ...reply, id: "server-10" }, { id: "temp-2", role: "assistant", text: "Then rest it." }]} />);
    await expect.poll(() => spoken.length).toBe(2);
    stop();
    expect(spoken).toEqual(["Ouro: Preheat the oven.", "Ouro: Then rest it."]);
  });

  it("announces a streaming reply once when its key changes mid-stream, when it finishes", async () => {
    const items = history(2);
    const { live, rerender } = await render(<Chat items={items} />);
    const { spoken, stop } = recordAnnouncements(live);
    await rerender(<Chat items={[...items, { id: "temp", role: "assistant", text: "Rest", streaming: true }]} />);
    await rerender(<Chat items={[...items, { id: "server-2", role: "assistant", text: "Rest it", streaming: true }]} />);
    expect(spoken).toEqual([]);
    await rerender(<Chat items={[...items, { id: "server-2", role: "assistant", text: "Rest it." }]} />);
    await expect.poll(() => spoken.length).toBe(1);
    stop();
    expect(spoken).toEqual(["Ouro: Rest it."]);
  });

  it("announces a reply still streaming in the first messages to fill an empty list, once it finishes", async () => {
    const { live, rerender } = await render(<Chat items={[]} />);
    const { spoken, stop } = recordAnnouncements(live);
    await rerender(<Chat items={[...history(4), { id: 4, role: "assistant", text: "Rest", streaming: true }]} />);
    await rerender(<Chat items={[...history(4), { id: 4, role: "assistant", text: "Rest it." }]} />);
    await expect.poll(() => spoken.length).toBe(1);
    stop();
    expect(spoken).toEqual(["Ouro: Rest it."]);
  });

  it("says nothing when the whole conversation is replaced, such as opening another one", async () => {
    const { scroller, live, rerender } = await render(<Chat items={history(20)} />);
    const { spoken, stop } = recordAnnouncements(live);
    await wheel(scroller, -400);
    await rerender(<Chat items={history(20, 100)} />);
    await settle(scroller);
    expect(spoken).toEqual([]);
    await rerender(<Chat items={[...history(20, 100), { id: 120, role: "assistant", text: "Preheat the oven." }]} />);
    await expect.poll(() => spoken.length).toBe(1);
    stop();
    expect(spoken).toEqual(["Ouro: Preheat the oven."]);
  });

  describe("a regenerated reply", () => {
    const asked: Item[] = [...history(4), { id: 4, role: "user", text: "How long?" }];
    const answered: Item[] = [...asked, { id: 5, role: "assistant", text: "An hour." }];

    it("is announced once it finishes, when it streams in under a new key", async () => {
      const { live, rerender } = await render(<Chat items={answered} />);
      const { spoken, stop } = recordAnnouncements(live);
      await rerender(<Chat items={[...asked, { id: 6, role: "assistant", text: "", streaming: true }]} />);
      await rerender(<Chat items={[...asked, { id: 6, role: "assistant", text: "Two hours", streaming: true }]} />);
      expect(spoken).toEqual([]);
      await rerender(<Chat items={[...asked, { id: 6, role: "assistant", text: "Two hours." }]} />);
      await expect.poll(() => spoken.length).toBe(1);
      stop();
      expect(spoken).toEqual(["Ouro: Two hours."]);
    });

    it("is announced when it replaces the last reply under a new key without streaming", async () => {
      const { live, rerender } = await render(<Chat items={answered} />);
      const { spoken, stop } = recordAnnouncements(live);
      await rerender(<Chat items={[...asked, { id: 6, role: "assistant", text: "Two hours." }]} />);
      await expect.poll(() => spoken.length).toBe(1);
      stop();
      expect(spoken).toEqual(["Ouro: Two hours."]);
    });

    it("is announced when it streams again in the same message, once it finishes", async () => {
      const { live, rerender } = await render(<Chat items={answered} />);
      const { spoken, stop } = recordAnnouncements(live);
      await rerender(<Chat items={[...asked, { id: 5, role: "assistant", text: "", streaming: true }]} />);
      await rerender(<Chat items={[...asked, { id: 5, role: "assistant", text: "Two", streaming: true }]} />);
      expect(spoken).toEqual([]);
      await rerender(<Chat items={[...asked, { id: 5, role: "assistant", text: "Two hours." }]} />);
      await expect.poll(() => spoken.length).toBe(1);
      stop();
      expect(spoken).toEqual(["Ouro: Two hours."]);
    });

    it("is announced when it replaces a placeholder that was not streaming", async () => {
      const { live, rerender } = await render(<Chat items={asked} />);
      const { spoken, stop } = recordAnnouncements(live);
      await rerender(<Chat items={[...asked, { id: "typing", role: "assistant", text: "…" }]} />);
      await rerender(<Chat items={[...asked, { id: 9, role: "assistant", text: "An hour." }]} />);
      await expect.poll(() => spoken.at(-1)).toBe("Ouro: An hour.");
      stop();
      expect(spoken).toEqual(["Ouro: …", "Ouro: An hour."]);
    });
  });

  it("takes a translated announcement", async () => {
    const items = history(2);
    const { live, rerender } = await render(<Chat items={items} newMessageLabel={(author, text) => `${author} a écrit : ${text}`} />);
    await rerender(
      <Chat items={[...items, { id: 2, role: "assistant", text: "Bonjour" }]} newMessageLabel={(author, text) => `${author} a écrit : ${text}`} />,
    );
    await expect.poll(() => live.textContent).toBe("Ouro a écrit : Bonjour");
  });

  it("never announces while the reader scrolls", async () => {
    const { scroller, live } = await render(<Chat items={history(20)} />);
    const { spoken, stop } = recordAnnouncements(live);
    await wheel(scroller, -400);
    await expect.element(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    await wheel(scroller, 10_000);
    await expect.poll(() => page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
    stop();
    expect(spoken).toEqual([]);
    expect(live.textContent).toBe("");
  });

  it("keeps the live region outside the scrolling content", async () => {
    const { scroller, live } = await render(<Chat items={history(3)} />);
    expect(scroller.contains(live)).toBe(false);
  });

  it("renders in server HTML and hydrates without a warning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const node = <Chat items={history(3)} />;
    const html = renderToString(node);
    expect(html).toContain('aria-label="Conversation"');
    expect(html).toContain("Message 2");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable = vi.fn();
    let root!: Root;
    await act(async () => {
      root = hydrateRoot(host, node, { onRecoverableError: recoverable });
    });
    roots.push(root);
    expect(recoverable).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("forwards a ref to the root and lets app layout classes win", async () => {
    let element: HTMLElement | null = null;
    const { list } = await render(
      <MessageList label="Chat" className="mt-4" ref={(node) => void (element = node)}>
        <Message role="user" name="Ada">
          Hi
        </Message>
      </MessageList>,
    );
    expect(element).toBe(list);
    expect(getComputedStyle(list).marginTop).toBe("16px");
  });
});

/** Six posts by default, each `Post <n>: …` with whatever `extra` puts in it. */
const posts = (count = 6, extra: (index: number) => ReactNode = () => null) =>
  Array.from({ length: count }, (_, index) => (
    <Message key={index} role={index % 2 ? "assistant" : "user"} name={index % 2 ? "Grace" : "Ada"} id={`post-${index}`}>
      Post {index}: {"a short note ".repeat(6)}
      {extra(index)}
    </Message>
  ));

/** A list between two buttons, so Tab has somewhere to come from and go to. */
function Channel({ children, height = 300, onMessageKeyDown }: { children: ReactNode; height?: number; onMessageKeyDown?: (message: HTMLElement, event: React.KeyboardEvent<HTMLElement>) => void }) {
  return (
    <div>
      <button type="button">Before</button>
      <MessageList label="Channel" style={{ height }} onMessageKeyDown={onMessageKeyDown}>
        {children}
      </MessageList>
      <button type="button">After</button>
    </div>
  );
}

const focusedId = () => document.activeElement?.id ?? "";
/** Within a pixel: layout lands on fractions at some zoom levels. */
const near = (value: number, expected: number) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(1);
const button = (name: string) => page.getByRole("button", { name, exact: true }).element() as HTMLElement;
/** Where an element's top and bottom sit in the list's view, in pixels from its top and its bottom. */
function inView(scroller: HTMLElement, element: Element): { top: number; bottom: number } {
  const view = scroller.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  return { top: box.top - view.top, bottom: view.bottom - box.bottom };
}

describe("MessageList keyboard", () => {
  it("is one Tab stop: Tab lands on the newest message, goes through its controls, and leaves the list", async () => {
    const { scroller } = await render(<Channel>{posts(6, (index) => <a href={`#link-${index}`}>Link {index}</a>)}</Channel>);
    expect(scroller.hasAttribute("tabindex")).toBe(false);
    button("Before").focus();
    await pressTab();
    expect(focusedId()).toBe("post-5");
    // The browser looked at the first message's link on the way in; the list stays at the newest.
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
    await pressTab();
    expect(document.activeElement!.textContent).toBe("Link 5");
    await pressTab();
    expect(document.activeElement).toBe(button("After"));
    // Back in, Shift+Tab lands on the message rather than its last control, then leaves the list.
    await pressTab({ shift: true });
    expect(focusedId()).toBe("post-5");
    await pressTab({ shift: true });
    expect(document.activeElement).toBe(button("Before"));
  });

  it("moves between messages with the arrow keys, Home, End, Page Up and Page Down, with a focus ring", async () => {
    const { scroller } = await render(<Channel>{posts(14)}</Channel>);
    const messages = [...scroller.querySelectorAll<HTMLElement>("article")];
    button("Before").focus();
    await pressTab();
    await userEvent.keyboard("{ArrowUp}");
    expect(focusedId()).toBe("post-12");
    expect(messages.filter((message) => message.getAttribute("tabindex") === "0")).toEqual([messages[12]]);
    expect(getComputedStyle(messages[12]!).outlineStyle).toBe("solid");
    expect(getComputedStyle(messages[12]!).outlineWidth).toBe("2px");
    expect(getComputedStyle(messages[12]!).outlineOffset).toBe("2px");
    const ring = document.createElement("span");
    ring.style.color = "var(--ring)";
    document.body.append(ring);
    mounted.push(ring);
    expect(getComputedStyle(messages[12]!).outlineColor).toBe(getComputedStyle(ring).color);
    await userEvent.keyboard("{ArrowDown}");
    expect(focusedId()).toBe("post-13");
    // At either end the key does nothing, not even scroll.
    const top = scroller.scrollTop;
    await userEvent.keyboard("{ArrowDown}");
    expect(focusedId()).toBe("post-13");
    expect(scroller.scrollTop).toBe(top);

    // Page Up: the farthest message that starts within a list's height above, brought in at the top.
    const expectUp = (from: number) => {
      const start = messages[from]!.getBoundingClientRect().top;
      return messages.findIndex((message, index) => index < from && start - message.getBoundingClientRect().top <= scroller.clientHeight);
    };
    let goal = expectUp(13);
    expect(goal).toBeLessThan(12);
    await userEvent.keyboard("{PageUp}");
    expect(focusedId()).toBe(`post-${goal}`);
    near(inView(scroller, messages[goal]!).top, 8);
    goal = expectUp(goal);
    await userEvent.keyboard("{PageUp}");
    expect(focusedId()).toBe(`post-${goal}`);

    await userEvent.keyboard("{Home}");
    expect(focusedId()).toBe("post-0");
    near(inView(scroller, messages[0]!).top, 8);
    await userEvent.keyboard("{ArrowUp}");
    expect(focusedId()).toBe("post-0");

    // Page Down: the farthest message that starts within a list's height below, brought in at the bottom.
    const start = messages[0]!.getBoundingClientRect().top;
    const down = messages.findLastIndex((message, index) => index > 0 && message.getBoundingClientRect().top - start <= scroller.clientHeight);
    expect(down).toBeGreaterThan(1);
    await userEvent.keyboard("{PageDown}");
    expect(focusedId()).toBe(`post-${down}`);
    near(inView(scroller, messages[down]!).bottom, 8);

    await userEvent.keyboard("{End}");
    expect(focusedId()).toBe("post-13");
    near(inView(scroller, messages[13]!).bottom, 8);
  });

  it("moves a page at a time to the next message when the next starts more than a list's height away", async () => {
    const tall = (index: number) => (
      <Message key={index} role="assistant" name="Grace" id={`post-${index}`}>
        Post {index}: {"a long note ".repeat(index === 1 ? 90 : 4)}
      </Message>
    );
    const { scroller } = await render(<Channel height={200}>{[0, 1, 2].map(tall)}</Channel>);
    const messages = [...scroller.querySelectorAll<HTMLElement>("article")];
    expect(messages[1]!.getBoundingClientRect().height).toBeGreaterThan(400);
    button("Before").focus();
    await pressTab();
    await userEvent.keyboard("{Home}");
    expect(focusedId()).toBe("post-0");
    await userEvent.keyboard("{PageDown}");
    expect(focusedId()).toBe("post-1");
    // Taller than the list, it is brought in at its top, then paged through to its end.
    near(inView(scroller, messages[1]!).top, 8);
    for (let press = 0; press < 10 && focusedId() === "post-1"; press++) await userEvent.keyboard("{PageDown}");
    expect(focusedId()).toBe("post-2");
    await userEvent.keyboard("{PageUp}");
    expect(focusedId()).toBe("post-1");
  });

  it.each([
    ["Tab", false, "Link 0"],
    ["Shift+Tab", true, "Link 1"],
  ])("lands where the browser puts focus with %s when the current message cannot take it", async (_key, shift, landing) => {
    const list = (hide: boolean) => (
      <Channel>
        {posts(2, (index) => <a href={`#link-${index}`}>Link {index}</a>)}
        <Message role="user" name="Ada" id="hidden" style={hide ? { display: "none" } : undefined}>
          <a href="#hidden-link">Hidden link</a>
        </Message>
      </Channel>
    );
    const { rerender } = await render(list(false));
    expect(document.getElementById("hidden")!.getAttribute("tabindex")).toBe("0");
    await rerender(list(true));
    button(shift ? "After" : "Before").focus();
    await pressTab({ shift });
    expect(document.activeElement!.textContent).toBe(landing);
  });

  it("scrolls through a message taller than the list, a line or a page at a time, before moving on", async () => {
    const { scroller } = await render(
      <Channel height={240}>
        <Message role="assistant" name="Grace" id="long">
          {"A long post that runs on. ".repeat(120)}
        </Message>
        <Message role="user" name="Ada" id="short">
          Thanks
        </Message>
      </Channel>,
    );
    const long = scroller.querySelector<HTMLElement>("#long")!;
    button("Before").focus();
    await pressTab();
    expect(focusedId()).toBe("short");
    await userEvent.keyboard("{ArrowUp}");
    expect(focusedId()).toBe("long");
    near(inView(scroller, long).top, 8);
    let top = scroller.scrollTop;
    await userEvent.keyboard("{ArrowDown}");
    expect(focusedId()).toBe("long");
    near(scroller.scrollTop - top, 40);
    top = scroller.scrollTop;
    await userEvent.keyboard("{PageDown}");
    near(scroller.scrollTop - top, 240 - 40);
    top = scroller.scrollTop;
    await userEvent.keyboard("{PageUp}");
    near(top - scroller.scrollTop, 240 - 40);
    // Short of the edge it scrolls only the rest of the way.
    await userEvent.keyboard("{ArrowUp}");
    near(inView(scroller, long).top, 8);
    await userEvent.keyboard("{ArrowUp}");
    expect(focusedId()).toBe("long");
    near(inView(scroller, long).top, 8);
    // Scrolled to its end, the next press moves on.
    await userEvent.keyboard("{End}");
    expect(focusedId()).toBe("short");
    await act(async () => void (scroller.scrollTop = scroller.scrollHeight));
    await userEvent.keyboard("{ArrowUp}");
    await act(async () => void (scroller.scrollTop = scroller.scrollHeight));
    expect(inView(scroller, long).bottom).toBeGreaterThan(8);
    await userEvent.keyboard("{ArrowDown}");
    expect(focusedId()).toBe("short");
  });

  it("scrolls a message taller than the list to its end, with room for its ring, before the down arrow moves on", async () => {
    const { scroller } = await render(
      <Channel height={240}>
        <Message role="assistant" name="Grace" id="long">
          {"A long post that runs on. ".repeat(60)}
        </Message>
        <Message role="user" name="Ada" id="short">
          Thanks
        </Message>
      </Channel>,
    );
    const long = document.getElementById("long")!;
    button("Before").focus();
    await pressTab();
    await userEvent.keyboard("{ArrowUp}");
    let bottom = inView(scroller, long).bottom;
    for (let press = 0; press < 40 && focusedId() === "long"; press++) {
      bottom = inView(scroller, long).bottom;
      await userEvent.keyboard("{ArrowDown}");
    }
    expect(focusedId()).toBe("short");
    near(bottom, 8);
  });

  it("goes into the focused message's toolbar with the right arrow, else its first control, and the left arrow right to left", async () => {
    const thread = (
      <>
        <Message role="assistant" name="Grace" id="toolbar">
          With a toolbar <a href="#a">Link A</a>
          <span role="toolbar" aria-label="Message actions">
            <button type="button">Like</button>
          </span>
        </Message>
        <Message role="assistant" name="Grace" id="link">
          With a link <a href="#b">Link B</a>
        </Message>
        <Message role="user" name="Ada" id="plain">
          Plain
        </Message>
      </>
    );
    await render(
      <>
        <Channel>{thread}</Channel>
        <div dir="rtl">
          <MessageList label="Right to left" style={{ height: 300 }}>
            <Message role="assistant" name="Grace" id="rtl">
              <a href="#c">Link C</a>
            </Message>
          </MessageList>
        </div>
      </>,
    );
    button("Before").focus();
    await pressTab();
    expect(focusedId()).toBe("plain");
    await userEvent.keyboard("{ArrowRight}");
    expect(focusedId()).toBe("plain");
    await userEvent.keyboard("{ArrowUp}{ArrowRight}");
    expect(document.activeElement!.textContent).toBe("Link B");
    // A key in a control inside a message is the control's: the up arrow does not move from a link.
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement!.textContent).toBe("Link B");
    await pressTab({ shift: true });
    expect(focusedId()).toBe("link");
    await userEvent.keyboard("{ArrowUp}{ArrowRight}");
    expect(document.activeElement!.textContent).toBe("Like");

    const rtl = document.getElementById("rtl")!;
    await act(async () => rtl.focus());
    await userEvent.keyboard("{ArrowRight}");
    expect(focusedId()).toBe("rtl");
    await userEvent.keyboard("{ArrowLeft}");
    expect(document.activeElement!.textContent).toBe("Link C");
  });

  it("hands the app a key pressed on the focused message, and not one pressed in a control inside it", async () => {
    const keys: string[] = [];
    const onMessageKeyDown = vi.fn((message: HTMLElement, event: React.KeyboardEvent<HTMLElement>) => {
      keys.push(`${message.id} ${event.key}`);
      if (event.key === "ArrowUp") event.preventDefault();
    });
    await render(<Channel onMessageKeyDown={onMessageKeyDown}>{posts(3, (index) => <a href={`#link-${index}`}>Link {index}</a>)}</Channel>);
    button("Before").focus();
    await pressTab();
    await userEvent.keyboard("1");
    // The app took the up arrow, so the list does not move.
    await userEvent.keyboard("{ArrowUp}");
    expect(focusedId()).toBe("post-2");
    await userEvent.keyboard("{ArrowRight}2");
    expect(keys).toEqual(["post-2 1", "post-2 ArrowUp", "post-2 ArrowRight"]);
  });

  it.each(["Alt", "Control", "Meta", "Shift"])("leaves the down arrow with %s to the browser and the app", async (modifier) => {
    const { scroller } = await render(<Channel>{posts(3)}</Channel>);
    const first = scroller.querySelector<HTMLElement>("article")!;
    await act(async () => first.setAttribute("tabindex", "0"));
    await act(async () => first.focus());
    await userEvent.keyboard(`{${modifier}>}{ArrowDown}{/${modifier}}`);
    expect(focusedId()).toBe("post-0");
  });

  it("leaves a key a control inside a message already handled, Tab included", async () => {
    const hold = (event: React.KeyboardEvent) => event.preventDefault();
    await render(
      <Channel>
        {posts(2)}
        <Message role="user" name="Ada" id="editing">
          <button type="button" onKeyDown={hold}>
            Hold
          </button>
        </Message>
      </Channel>,
    );
    button("Before").focus();
    await pressTab();
    await pressTab();
    expect(document.activeElement).toBe(button("Hold"));
    await pressTab();
    expect(document.activeElement).toBe(button("Hold"));
  });

  it("reaches a control between messages in the Tab order, and passes over the other messages' controls", async () => {
    const { scroller } = await render(
      <Channel>
        {posts(4, (index) => <a href={`#link-${index}`}>Link {index}</a>)}
        <a href="#older">Older replies</a>
        {[0, 1].map((index) => (
          <Message key={`late-${index}`} role="user" name="Ada" id={`late-${index}`}>
            Late {index}
          </Message>
        ))}
      </Channel>,
    );
    expect(scroller.querySelectorAll("article")).toHaveLength(6);
    // Arriving lands on the first stop: the control between the messages, before the newest message.
    button("Before").focus();
    await pressTab();
    expect(document.activeElement!.textContent).toBe("Older replies");
    await pressTab();
    expect(focusedId()).toBe("late-1");
    // From a message above that control, Tab passes over the next message's link to reach it.
    await userEvent.keyboard("{Home}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(focusedId()).toBe("post-3");
    await userEvent.keyboard("{ArrowUp}");
    await pressTab();
    expect(document.activeElement!.textContent).toBe("Link 2");
    await pressTab();
    expect(document.activeElement!.textContent).toBe("Older replies");
    await pressTab({ shift: true });
    expect(document.activeElement!.textContent).toBe("Link 2");
  });

  it("keeps focus where it is when a message arrives, and the Tab stop on the message focused last while it shows", async () => {
    const { scroller, rerender } = await render(<Channel>{posts(12)}</Channel>);
    button("Before").focus();
    await pressTab();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(focusedId()).toBe("post-9");
    await rerender(<Channel>{posts(13)}</Channel>);
    expect(focusedId()).toBe("post-9");
    expect(document.getElementById("post-9")!.getAttribute("tabindex")).toBe("0");
    await pressTab();
    expect(document.activeElement).toBe(button("After"));
    await new Promise((resolve) => setTimeout(resolve));
    await pressTab({ shift: true });
    expect(focusedId()).toBe("post-9");
    // Scrolled away while it has focus, it keeps the Tab stop.
    await wheel(scroller, -2000);
    expect(document.getElementById("post-9")!.getAttribute("tabindex")).toBe("0");
    await wheel(scroller, 2000);

    // Once it is out of view, arriving lands on the newest message in view instead, without scrolling.
    await pressTab();
    await wheel(scroller, -2000);
    const shown = [...scroller.querySelectorAll<HTMLElement>("article")].filter((message) => inView(scroller, message).top >= 0 && inView(scroller, message).bottom >= 0);
    const top = scroller.scrollTop;
    // Scrolled back, "Jump to latest" sits between the list and the next control.
    await expect.element(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    button("Jump to latest").focus();
    await pressTab({ shift: true });
    expect(document.activeElement).toBe(shown.at(-1));
    expect(scroller.scrollTop).toBe(top);
  });

  it("puts the Tab stop on the message that shows, when none shows whole, and on the newest when none shows", async () => {
    const { scroller } = await render(
      <>
        <Channel height={200}>
          <Message role="assistant" name="Grace" id="long">
            {"A long post that runs on. ".repeat(120)}
          </Message>
          <Message role="user" name="Ada" id="short">
            Thanks
          </Message>
        </Channel>
        <div hidden>
          <MessageList label="Closed" style={{ height: 200 }}>
            {posts(3)}
          </MessageList>
        </div>
      </>,
    );
    await wheel(scroller, -400);
    await expect.poll(() => document.getElementById("long")!.getAttribute("tabindex")).toBe("0");
    expect(document.getElementById("short")!.getAttribute("tabindex")).toBe("-1");
    expect(document.getElementById("post-2")!.getAttribute("tabindex")).toBe("0");
  });

  it("moves focus to the message now in the place of a focused message that goes, and leaves a control that goes from a message to the app", async () => {
    const extra = (index: number) => (index === 1 ? <button type="button">Save</button> : null);
    const { rerender } = await render(<Channel>{posts(4, extra)}</Channel>);
    const without = (gone: number[], save = true) => (
      <Channel>{posts(4, save ? extra : () => null).filter((_, index) => !gone.includes(index))}</Channel>
    );
    button("Before").focus();
    await pressTab();
    await userEvent.keyboard("{ArrowUp}");
    expect(focusedId()).toBe("post-2");
    await rerender(without([2]));
    await expect.poll(focusedId).toBe("post-3");

    await userEvent.keyboard("{ArrowUp}{ArrowRight}");
    expect(document.activeElement).toBe(button("Save"));
    await rerender(without([2], false));
    await new Promise((resolve) => setTimeout(resolve));
    expect(document.activeElement).toBe(document.body);
    await act(async () => document.getElementById("post-1")!.focus());

    await rerender(without([0, 1, 2, 3]));
    expect(document.activeElement).toBe(document.body);
  });

  it("moves focus to the one message now in a focused message's place, not past it", async () => {
    const { rerender } = await render(<Channel>{posts(6)}</Channel>);
    await act(async () => document.getElementById("post-2")!.focus());
    await rerender(<Channel>{posts(6).filter((_, index) => index !== 2)}</Channel>);
    await expect.poll(focusedId).toBe("post-3");
  });

  it("moves focus to the message before when the focused newest message goes", async () => {
    const { rerender } = await render(<Channel>{posts(3)}</Channel>);
    button("Before").focus();
    await pressTab();
    expect(focusedId()).toBe("post-2");
    await rerender(<Channel>{posts(2)}</Channel>);
    await expect.poll(focusedId).toBe("post-1");
  });

  it("passes over a disabled, inert or hidden control in the current message", async () => {
    const extra = (index: number) =>
      index === 1 ? (
        <>
          <a href="#link-1">Link 1</a>
          <button type="button" disabled>
            Disabled
          </button>
          <span inert>
            <button type="button">Inert</button>
          </span>
          <button type="button" style={{ visibility: "hidden" }}>
            Hidden
          </button>
        </>
      ) : (
        <a href={`#link-${index}`}>Link {index}</a>
      );
    await render(<Channel>{posts(3, extra)}</Channel>);
    button("Before").focus();
    await pressTab();
    await userEvent.keyboard("{ArrowUp}{ArrowRight}");
    expect(document.activeElement!.textContent).toBe("Link 1");
    await pressTab();
    expect(document.activeElement).toBe(button("After"));
  });

  it("lets a click or code put focus in any message after a Tab press, and makes that message the Tab stop", async () => {
    const { scroller } = await render(<Channel>{posts(3, (index) => <a href={`#link-${index}`}>Link {index}</a>)}</Channel>);
    button("Before").focus();
    await pressTab();
    button("After").focus();
    await new Promise((resolve) => setTimeout(resolve));
    const first = scroller.querySelector<HTMLElement>('a[href="#link-0"]')!;
    await act(async () => first.focus());
    expect(document.activeElement).toBe(first);
    expect(focusedId()).toBe("");
    expect(document.getElementById("post-0")!.getAttribute("tabindex")).toBe("0");
    expect(document.getElementById("post-2")!.getAttribute("tabindex")).toBe("-1");
  });

  it("leaves keys pressed in a message's portal to the portal", async () => {
    function Popup() {
      return createPortal(
        <span>
          <button type="button">First in popup</button>
          <button type="button">Second in popup</button>
        </span>,
        document.body,
      );
    }
    await render(
      <Channel>
        {posts(2)}
        <Message role="user" name="Ada" id="with-popup">
          A popup
          <Popup />
        </Message>
      </Channel>,
    );
    button("First in popup").focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(button("First in popup"));
    await pressTab();
    expect(document.activeElement).toBe(button("Second in popup"));
  });

  it("finds a new Tab stop when the current message goes while the list sits partly above the page's top", async () => {
    const { scroller, rerender } = await render(
      <>
        <div style={{ height: 1500 }} />
        <Channel>{posts(6)}</Channel>
        <div style={{ height: 1500 }} />
      </>,
    );
    button("Before").focus();
    await pressTab();
    await userEvent.keyboard("{ArrowUp}");
    expect(focusedId()).toBe("post-4");
    await pressTab();
    expect(document.activeElement).toBe(button("After"));
    await new Promise((resolve) => setTimeout(resolve));
    window.scrollTo(0, window.scrollY + scroller.getBoundingClientRect().top + 100);
    expect(scroller.getBoundingClientRect().top).toBeLessThan(0);
    await rerender(
      <>
        <div style={{ height: 1500 }} />
        <Channel>{posts(6).filter((_, index) => index !== 4)}</Channel>
        <div style={{ height: 1500 }} />
      </>,
    );
    expect(scroller.querySelectorAll('article[tabindex="0"]')).toHaveLength(1);
    window.scrollTo(0, 0);
  });

  it("leaves focus where it went when a message goes after focus left the list", async () => {
    const { rerender } = await render(<Channel>{posts(3)}</Channel>);
    button("Before").focus();
    await pressTab();
    await pressTab();
    expect(document.activeElement).toBe(button("After"));
    await new Promise((resolve) => setTimeout(resolve));
    await rerender(<Channel>{posts(2)}</Channel>);
    expect(document.activeElement).toBe(button("After"));
  });

  it("gives each message its place among them for screen readers, and keeps an app's own", async () => {
    const list = (count: number, bold = false) => (
      <MessageList label="Channel" style={{ height: 300 }}>
        <article data-ouro-message-list-item="" data-role="assistant" aria-posinset={40} aria-setsize={200}>
          <span data-ouro-message-author="">Grace</span>
          <p data-ouro-message-content="">Loaded earlier {bold ? <b>today</b> : null}</p>
        </article>
        <div data-ouro-message-list-item="" data-role="assistant" id="plain-item">
          <span data-ouro-message-author="">Grace</span>
          <div data-ouro-message-content="">
            A message quoting another:
            <Message role="user" name="Ada" id="quoted">
              Quoted
            </Message>
          </div>
        </div>
        {posts(count)}
      </MessageList>
    );
    const { scroller, rerender } = await render(list(2));
    const positions = () => [...scroller.querySelectorAll("[data-ouro-message-list-item], article")].map((item) => `${item.getAttribute("aria-posinset")}/${item.getAttribute("aria-setsize")}`);
    // The quoted message inside another is not one of the list's own.
    expect(positions()).toEqual(["40/200", "null/null", "null/null", "3/4", "4/4"]);
    expect(document.getElementById("quoted")!.hasAttribute("data-ouro-part")).toBe(false);
    // A message that arrives in the same change as an edit inside another is counted too.
    await rerender(list(3, true));
    expect(positions()).toEqual(["40/200", "null/null", "null/null", "3/5", "4/5", "5/5"]);
    expect(document.getElementById("post-2")!.getAttribute("tabindex")).toBe("-1");
    expect(document.getElementById("plain-item")!.getAttribute("data-ouro-part")).toBe("item");
    expect(document.getElementById("plain-item")!.getAttribute("data-ouro-control")).toBe("message-list");
    // The focus ring rounds on Ouro's Message only; an app's message keeps its corners.
    expect(getComputedStyle(document.getElementById("post-0")!).borderTopLeftRadius).not.toBe("0px");
    expect(getComputedStyle(document.getElementById("plain-item")!).borderTopLeftRadius).toBe("0px");
  });

  it("counts a message that arrives inside a group already there, such as today's messages, and takes it out of the Tab order", async () => {
    const day = (count: number) => (
      <MessageList label="Channel" style={{ height: 300 }}>
        <section aria-label="Today">{posts(count)}</section>
      </MessageList>
    );
    const { rerender } = await render(day(2));
    await rerender(day(3));
    expect(document.getElementById("post-2")!.getAttribute("aria-posinset")).toBe("3");
    expect(document.getElementById("post-0")!.getAttribute("aria-setsize")).toBe("3");
    expect(document.getElementById("post-2")!.getAttribute("tabindex")).toBe("-1");
  });

  it("keeps a list inside a message to its own messages", async () => {
    const { host } = await render(
      <Channel>
        <Message role="assistant" name="Grace" id="outer">
          A thread:
          <MessageList label="Replies" style={{ height: 120 }}>
            <Message role="user" name="Ada" id="inner">
              A reply
            </Message>
          </MessageList>
        </Message>
        <Message role="user" name="Ada" id="newest">
          Newest
        </Message>
      </Channel>,
    );
    const [outer, inner] = [host.querySelector<HTMLElement>("#outer")!, host.querySelector<HTMLElement>("#inner")!];
    expect(outer.getAttribute("aria-posinset")).toBe("1");
    expect(inner.getAttribute("aria-posinset")).toBe("1");
    expect(inner.getAttribute("aria-setsize")).toBe("1");
    await act(async () => inner.focus());
    await userEvent.keyboard("{ArrowDown}");
    expect(focusedId()).toBe("inner");
  });

  it("leaves focus to a message's menu, whose button is replaced as it first opens", async () => {
    await render(
      <Channel>
        {posts(2)}
        <Message variant="chat" role="assistant" name="Mara Quill" id="with-menu" menu={[{ label: "Copy link", onClick: () => {} }]}>
          I have one.
        </Message>
      </Channel>,
    );
    const more = () => document.querySelector<HTMLElement>('#with-menu [data-ouro-part="menu"]');
    await expect.poll(more).not.toBeNull();
    await act(async () => more()!.focus());
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.activeElement).toBe(more());
  });

  it("leaves focus where a component puts it after removing the focused control", async () => {
    function Swap() {
      const [swapped, setSwapped] = useState(false);
      return (
        <Message role="user" name="Ada" id="swap">
          {swapped ? (
            <button type="button" key="after">
              After the swap
            </button>
          ) : (
            <button
              type="button"
              key="before"
              onClick={() => {
                setSwapped(true);
                setTimeout(() => document.getElementById("elsewhere")!.focus());
              }}
            >
              Swap
            </button>
          )}
        </Message>
      );
    }
    await render(
      <>
        <Channel>
          {posts(2)}
          <Swap />
        </Channel>
        <input id="elsewhere" aria-label="Elsewhere" />
      </>,
    );
    await act(async () => button("Swap").focus());
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => document.activeElement!.id).toBe("elsewhere");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(document.activeElement!.id).toBe("elsewhere");
  });

  it("leaves focus on the page when it left the list before the message it was on goes", async () => {
    const { rerender } = await render(<Channel>{posts(3)}</Channel>);
    button("Before").focus();
    await pressTab();
    expect(focusedId()).toBe("post-2");
    await act(async () => (document.activeElement as HTMLElement).blur());
    await new Promise((resolve) => setTimeout(resolve));
    await rerender(<Channel>{posts(2)}</Channel>);
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves focus where the app put it when a message goes as focus leaves it", async () => {
    function Thread() {
      const [sent, setSent] = useState(false);
      return (
        <>
          <Channel>
            {posts(2)}
            {sent ? null : (
              <Message role="user" name="Ada" id="draft">
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById("composer")!.focus();
                    setSent(true);
                  }}
                >
                  Send
                </button>
              </Message>
            )}
          </Channel>
          <input id="composer" aria-label="Composer" />
        </>
      );
    }
    await render(<Thread />);
    button("Before").focus();
    await pressTab();
    await pressTab();
    expect(document.activeElement).toBe(button("Send"));
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => document.getElementById("draft")).toBeNull();
    expect(document.activeElement!.id).toBe("composer");
  });

  it("lands on a control after the newest message when Shift+Tab arrives, and brings a stop out of view into view on Tab", async () => {
    const { scroller } = await render(
      <Channel>
        {posts(1, () => <a href="#link-0">Link 0</a>)}
        <a href="#between">Between</a>
        {posts(9).slice(1)}
        <a href="#bottom">Bottom of the channel</a>
      </Channel>,
    );
    button("After").focus();
    await pressTab({ shift: true });
    expect(document.activeElement!.textContent).toBe("Bottom of the channel");
    await pressTab({ shift: true });
    expect(focusedId()).toBe("post-8");
    // On the way in the browser looks at the first message's link; the first stop is the link after
    // that message, out of view above, and arriving brings it in.
    button("Before").focus();
    await pressTab();
    expect(document.activeElement!.textContent).toBe("Between");
    near(inView(scroller, document.activeElement!).top, 8);
  });

  it("brings a control between messages into view when Tab passes over the other messages to reach it", async () => {
    const { scroller } = await render(
      <Channel>
        {posts(9, (index) => <a href={`#link-${index}`}>Link {index}</a>)}
        <a href="#more">More below</a>
        <Message role="user" name="Ada" id="newest">
          Newest
        </Message>
      </Channel>,
    );
    button("Before").focus();
    await pressTab();
    await pressTab();
    expect(focusedId()).toBe("newest");
    await userEvent.keyboard("{Home}");
    await pressTab();
    expect(document.activeElement!.textContent).toBe("Link 0");
    await pressTab();
    expect(document.activeElement!.textContent).toBe("More below");
    near(inView(scroller, document.activeElement!).bottom, 8);
  });

  it("keeps the list where it is as Shift+Tab leaves it from a message", async () => {
    const { scroller } = await render(<Channel>{posts(10)}</Channel>);
    button("Before").focus();
    await pressTab();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    const top = scroller.scrollTop;
    await pressTab({ shift: true });
    expect(document.activeElement).toBe(button("Before"));
    expect(scroller.scrollTop).toBe(top);
    await pressTab();
    await pressTab();
    expect(document.activeElement).toBe(button("After"));
    expect(scroller.scrollTop).toBe(top);
  });

  it("moves the Tab stop when the message focused last scrolls out of view above, and keeps it while it shows", async () => {
    const { scroller } = await render(<Channel>{posts(14)}</Channel>);
    button("Before").focus();
    await pressTab();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(focusedId()).toBe("post-11");
    button("After").focus();
    await new Promise((resolve) => setTimeout(resolve));
    await wheel(scroller, -60);
    expect(document.getElementById("post-11")!.getAttribute("tabindex")).toBe("0");

    await act(async () => document.getElementById("post-11")!.focus());
    await userEvent.keyboard("{Home}{ArrowDown}{ArrowDown}");
    expect(focusedId()).toBe("post-2");
    button("After").focus();
    await new Promise((resolve) => setTimeout(resolve));
    await wheel(scroller, 3000);
    expect(inView(scroller, document.getElementById("post-2")!).top).toBeLessThan(0);
    await pressTab({ shift: true });
    expect(focusedId()).toBe("post-13");
  });

  it("puts the Tab stop on the newest message when none shows, in a list with no height", async () => {
    const { scroller } = await render(
      <MessageList label="Folded" style={{ height: 0 }}>
        {posts(3)}
      </MessageList>,
    );
    expect(scroller.clientHeight).toBe(0);
    expect(document.getElementById("post-2")!.getAttribute("tabindex")).toBe("0");
  });

  it("puts the Tab stop on the lower of two messages that each show in part", async () => {
    const { scroller } = await render(
      <Channel height={200}>
        <Message role="assistant" name="Grace" id="upper">
          {"An upper post. ".repeat(40)}
        </Message>
        <Message role="assistant" name="Grace" id="lower">
          {"A lower post. ".repeat(40)}
        </Message>
        <Message role="assistant" name="Grace" id="last">
          {"The last post. ".repeat(40)}
        </Message>
      </Channel>,
    );
    const upper = document.getElementById("upper")!;
    const lower = document.getElementById("lower")!;
    expect(upper.getBoundingClientRect().height).toBeGreaterThan(200);
    // Scroll so the upper post's end and the lower post's start share the view.
    await act(async () => void (scroller.scrollTop += inView(scroller, lower).top - 100));
    await settle(scroller);
    expect(inView(scroller, upper).top).toBeLessThan(0);
    expect(inView(scroller, lower).bottom).toBeLessThan(0);
    expect(lower.getAttribute("tabindex")).toBe("0");
  });

  it("brings a message in with room for its ring, at the top, the bottom, or the top for one about the list's height", async () => {
    const { scroller, rerender } = await render(<Channel height={300}>{posts(10)}</Channel>);
    const messages = () => [...scroller.querySelectorAll<HTMLElement>("article")];
    button("Before").focus();
    await pressTab();
    // A message whose top is just inside the margin at the top.
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    const above = messages()[6]!;
    await act(async () => void (scroller.scrollTop += inView(scroller, above).top - 4));
    await settle(scroller);
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(above);
    near(inView(scroller, above).top, 8);
    // A message whose bottom is just inside the margin at the bottom.
    const below = messages()[7]!;
    await act(async () => void (scroller.scrollTop += 4 - inView(scroller, below).bottom));
    await settle(scroller);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(below);
    near(inView(scroller, below).bottom, 8);

    // A message 8px shorter than the list, below the one in focus, comes in at its top.
    await rerender(
      <Channel height={300}>
        <Message role="user" name="Ada" id="short">
          Short
        </Message>
        <Message role="assistant" name="Grace" id="sized">
          <div style={{ height: 0 }} id="sizer" />
        </Message>
        {posts(4)}
      </Channel>,
    );
    const sized = document.getElementById("sized")!;
    const bare = sized.getBoundingClientRect().height;
    await act(async () => void (document.getElementById("sizer")!.style.height = `${scroller.clientHeight - 8 - bare}px`));
    near(sized.getBoundingClientRect().height, scroller.clientHeight - 8);
    await act(async () => document.getElementById("short")!.focus());
    await act(async () => void (scroller.scrollTop = 0));
    await settle(scroller);
    expect(inView(scroller, sized).bottom).toBeLessThan(0);
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(sized);
    near(inView(scroller, sized).top, 8);
  });

  it("leaves Space to scroll the list", async () => {
    const { scroller } = await render(<Channel>{posts(10)}</Channel>);
    button("Before").focus();
    await pressTab();
    await userEvent.keyboard("{Home}");
    const top = scroller.scrollTop;
    await userEvent.keyboard(" ");
    await expect.poll(() => scroller.scrollTop).toBeGreaterThan(top);
  });

  it("marks a Tab press a control keeps from bubbling, and lets another key put focus in any message", async () => {
    await render(
      <div>
        <button
          type="button"
          onKeyDown={(event) => {
            if (event.key === "Enter") document.querySelector<HTMLElement>('a[href="#link-0"]')!.focus();
            if (event.key === "Tab") event.stopPropagation();
          }}
        >
          Go to the first link
        </button>
        <MessageList label="Channel" style={{ height: 300 }}>
          {posts(3, (index) => <a href={`#link-${index}`}>Link {index}</a>)}
        </MessageList>
      </div>,
    );
    button("Go to the first link").focus();
    await pressTab();
    expect(focusedId()).toBe("post-2");
    button("Go to the first link").focus();
    await new Promise((resolve) => setTimeout(resolve));
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement!.textContent).toBe("Link 0");
  });

  it("is the Tab stop itself without messages, and hands focus to the first message that arrives", async () => {
    const notes = (message: boolean) => (
      <Channel>
        <p>{"A long note. ".repeat(300)}</p>
        <button type="button">Inside</button>
        {message ? (
          <Message role="assistant" name="Grace" id="first">
            Hello
          </Message>
        ) : null}
      </Channel>
    );
    const { scroller, rerender } = await render(notes(false));
    expect(scroller.getAttribute("tabindex")).toBe("0");
    // Shift+Tab arrives on its last control, as without the list.
    button("After").focus();
    await pressTab({ shift: true });
    expect(document.activeElement).toBe(button("Inside"));
    // Scrolled back, "Jump to latest" focuses the list itself.
    await wheel(scroller, -400);
    await userEvent.click(page.getByRole("button", { name: "Jump to latest" }));
    expect(document.activeElement).toBe(scroller);
    await rerender(notes(true));
    expect(scroller.hasAttribute("tabindex")).toBe(false);
    expect(focusedId()).toBe("first");
  });

  it("leaves focus where it is when the first message arrives while focus is elsewhere", async () => {
    const notes = (message: boolean) => (
      <Channel>
        <p>{"A long note. ".repeat(300)}</p>
        {message ? (
          <Message role="assistant" name="Grace" id="first">
            Hello
          </Message>
        ) : null}
      </Channel>
    );
    const { rerender } = await render(notes(false));
    button("After").focus();
    await rerender(notes(true));
    expect(document.activeElement).toBe(button("After"));
  });
});

describe("MessageList development messages", () => {
  it.each([
    ["autoScroll", { autoScroll: true }, "autoScroll is not a prop; the list follows new messages while the reader is at the bottom", '<MessageList label="Conversation">'],
    ["stickToBottom", { stickToBottom: true }, "stickToBottom is not a prop; the list follows new messages while the reader is at the bottom", '<MessageList label="Conversation">'],
    ["loose text", { children: "Hi" }, "MessageList holds Messages", '<MessageList label="Conversation"><Message role="user" name="Ada">Hi</Message></MessageList>'],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    const props = { label: "Conversation", children: <Message role="user" name="Ada">Hi</Message>, ...extra } as unknown as Parameters<typeof MessageList>[0];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { list } = await render(<MessageList {...props} />);
    expect(warn).toHaveBeenCalledWith(`[ouro-ui] MessageList: ${problem}. Fix: ${fix}.`);
    expect(list.hasAttribute("autoScroll")).toBe(false);
  });

  it("warns when label is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const props = { children: null } as unknown as Parameters<typeof MessageList>[0];
    await render(<MessageList {...props} />);
    expect(warn).toHaveBeenCalledWith('[ouro-ui] MessageList: label is missing, so the conversation has no name. Fix: <MessageList label="Conversation">.');
  });

  it("checks the className", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await render(
      <MessageList label="Chat" className="bg-muted">
        {null}
      </MessageList>,
    );
    expect(warn).toHaveBeenCalledWith('[ouro-ui] MessageList: "bg-muted" sets appearance, and className is for layout only. Fix: <div className="bg-muted"><MessageList /></div>.');
  });
});
