import { useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList, type MessageListActions } from "@/registry/ouro/components/ouro/message/message-list";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
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
  /** Hidden by the app with `display: none`, so it has no box. */
  hidden?: boolean;
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

function Chat({
  items,
  label = "Conversation",
  ...rest
}: {
  items: Item[];
  label?: string;
  jumpLabel?: string;
  initialAnchor?: string;
  newMessageLabel?: (author: string, text: string) => string;
  loadingOlder?: boolean;
  loadingOlderLabel?: string;
  hasOlder?: boolean;
  windowing?: boolean;
}) {
  return (
    <MessageList label={label} style={{ height: 300 }} {...rest}>
      {items.map((item) => (
        <Message key={item.id} role={item.role} name={item.role === "user" ? "Ana" : "Ouro"} streaming={item.streaming} style={item.hidden ? { display: "none" } : undefined}>
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

/** Waits until the scroll position reads the same across two frames, and no message springs. */
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
  it("sits a short conversation at its bottom, by the composer under it, with the room above it empty", async () => {
    const { scroller } = await render(<Chat items={history(2)} />);
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    const messages = scroller.querySelectorAll('[data-ouro="message"]');
    const last = messages[messages.length - 1]!.getBoundingClientRect();
    const padding = parseFloat(getComputedStyle(content).paddingBottom);
    expect(scroller.getBoundingClientRect().bottom - last.bottom).toBeCloseTo(padding, 0);
    expect(messages[0]!.getBoundingClientRect().top - scroller.getBoundingClientRect().top).toBeGreaterThan(padding);
    expect(scroller.scrollHeight).toBe(scroller.clientHeight);
  });

  it("sits what starts a short conversation, its first child, right above the first message", async () => {
    const { scroller } = await render(
      <MessageList label="Conversation" style={{ height: 300 }}>
        <p data-start="" style={{ margin: 0 }}>
          The start of your conversation with Ana
        </p>
        <Message role="user" name="Ana">
          Hello
        </Message>
      </MessageList>,
    );
    const start = scroller.querySelector("[data-start]")!.getBoundingClientRect();
    const first = scroller.querySelector('[data-ouro="message"]')!.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(scroller.querySelector("[data-ouro-message-list-content]")!).rowGap);
    expect(first.top - start.bottom).toBeCloseTo(gap, 0);
    expect(start.top - scroller.getBoundingClientRect().top).toBeGreaterThan(gap);
  });

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

  it("keeps its messages' parts inside its own scroll box, so focus and scrollIntoView never scroll a box around it", async () => {
    const { host, scroller } = await render(
      <div data-frame="" style={{ height: 400, overflow: "hidden" }}>
        <div style={{ height: 100 }} />
        <MessageList label="Channel" style={{ height: 300 }}>
          {posts(14)}
        </MessageList>
      </div>,
    );
    const frame = host.querySelector<HTMLElement>("[data-frame]")!;
    // Everything placed absolutely in the list, such as each message's screen-reader text, stays in the list's overflow.
    expect(frame.scrollHeight).toBe(frame.clientHeight);
    const first = document.getElementById("post-0")!;
    await act(async () => first.focus());
    first.scrollIntoView({ block: "start" });
    await settle(scroller);
    expect(scroller.scrollTop).toBeLessThan(scroller.scrollHeight - scroller.clientHeight);
    expect(frame.scrollTop).toBe(0);
    expect(document.scrollingElement!.scrollTop).toBe(0);
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

  it("follows its end at the bottom when something in a message reaches past it, though no message changes size", async () => {
    const items = history(20);
    // Placed from the newest message's text, and reaching far below it, as a reply's action bar does beside a short last line.
    const Overhang = ({ late }: { late: boolean }) => (
      <MessageList label="Conversation" style={{ height: 300 }}>
        {items.map((item, index) => (
          <Message key={item.id} role={item.role} name="Ana">
            <span style={{ position: "relative", display: "block" }}>
              {item.text}
              {late && index === items.length - 1 && <span data-overhang="" style={{ position: "absolute", insetInlineStart: 0, top: 0, width: 8, height: 400 }} />}
            </span>
          </Message>
        ))}
      </MessageList>
    );
    const { scroller, rerender } = await render(<Overhang late={false} />);
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    await settle(scroller);
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    const height = content.getBoundingClientRect().height;
    const top = scroller.scrollTop;
    await rerender(<Overhang late />);
    // Nothing changed size: only the end moved.
    expect(content.getBoundingClientRect().height).toBe(height);
    expect(scroller.scrollHeight - scroller.clientHeight).toBeGreaterThan(top + 100);
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    await settle(scroller);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
  });

  it("stays at the end while the reader edits the newest message in place and it grows", async () => {
    const items = history(20);
    const { scroller } = await render(
      <MessageList label="Conversation" style={{ height: 300 }}>
        {items.map((item) => (
          <Message key={item.id} role={item.role} name="Ana">
            {item.text}
          </Message>
        ))}
        <Message role="user" name="Ana">
          <TextArea label="Edit your message" hideLabel variant="plain" autoGrow rows={1} maxRows={8} defaultValue={"Line one\nLine two\nLine three"} />
        </Message>
      </MessageList>,
    );
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    await settle(scroller);
    const editor = page.getByRole("textbox", { name: "Edit your message" });
    // A new line: the editor and the message grow, and the list follows to the end.
    await userEvent.type(editor, "{End}{Enter}Line four");
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
    // More on the same line: the editor measures itself on each key and stays its height.
    await userEvent.type(editor, " and five");
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
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

  it("keeps the reader's place in a message that fills the view as it grows, and as a message above it grows", async () => {
    const items: Item[] = [...history(3, 10), { id: 13, role: "assistant", text: "A long reply that runs on. ".repeat(80) }, ...history(3, 14)];
    const { scroller, rerender } = await render(<Chat items={items} />);
    const long = [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')][3]!;
    // Into the middle of the long reply, whose top is above the view and bottom below it.
    scroller.scrollTop += long.getBoundingClientRect().top - scroller.getBoundingClientRect().top + 200;
    await settle(scroller);
    const top = long.getBoundingClientRect().top;
    const grown = items.map((item, at) => (at === 3 ? { ...item, text: `${item.text} ${"more ".repeat(80)}` } : item));
    await rerender(<Chat items={grown} />);
    await settle(scroller);
    expect(Math.abs(long.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
    // And a message above it grows.
    await rerender(<Chat items={grown.map((item, at) => (at === 0 ? { ...item, text: `${item.text} ${"more ".repeat(40)}` } : item))} />);
    await settle(scroller);
    expect(Math.abs(long.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });

  it("leaves a scroll to the top in the same frame as a message above the reader grows where it put the list", async () => {
    const items = history(20, 10);
    const { scroller } = await render(<Chat items={items} />);
    await wheel(scroller, -400);
    await act(async () => {
      flushSync(() => roots.at(-1)!.render(<Chat items={items.map((item, at) => (at === 0 ? { ...item, text: `${item.text} ${"more ".repeat(40)}` } : item))} />));
      scroller.scrollTop = 0;
      // The scroll event comes before the list has kept the reader's place, as the browser sends it for a scroll by input.
      scroller.dispatchEvent(new Event("scroll"));
    });
    await settle(scroller);
    expect(scroller.scrollTop).toBe(0);
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

  it("keeps the reader's place when a message above them moves to the end and the list keeps its height", async () => {
    const items = history(20, 10);
    // The messages sit in a group, as under a day's heading, so the move happens inside it.
    const list = (order: Item[], note: string) => (
      <MessageList label="Conversation" style={{ height: 300 }}>
        <section aria-label="Today">
          {order.map((item) => (
            <Message key={item.id} role={item.role} name={item.role === "user" ? "Ana" : "Ouro"}>
              {item.text}
            </Message>
          ))}
        </section>
        <p key={note}>Seen</p>
      </MessageList>
    );
    const { scroller, rerender } = await render(list(items, "first"));
    await wheel(scroller, -400);
    const before = firstVisible(scroller);
    // A reply to the first message moves it to the end, as a channel orders posts by their latest activity, and a
    // note that is no message is replaced by another of its size.
    await rerender(list([...items.slice(1), items[0]!], "second"));
    await settle(scroller);
    expect(Math.abs(before.message.getBoundingClientRect().top - before.top)).toBeLessThanOrEqual(1);
  });

  it("keeps the reader's place once when a message above them moves to the end as older history loads", async () => {
    const items = history(20, 10);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await wheel(scroller, -400);
    const before = firstVisible(scroller);
    await rerender(<Chat items={[...history(10), ...items.slice(1), items[0]!]} />);
    await settle(scroller);
    expect(Math.abs(before.message.getBoundingClientRect().top - before.top)).toBeLessThanOrEqual(1);
  });

  /** A conversation whose messages carry ids, so it can open at one, as an app does at a message found by search. */
  function Found({ items, initialAnchor, windowing }: { items: Item[]; initialAnchor?: string; windowing?: boolean }) {
    return (
      <MessageList label="Conversation" style={{ height: 300, marginTop: 120 }} initialAnchor={initialAnchor} windowing={windowing}>
        {items.map((item) => (
          <Message key={item.id} id={`found-${item.id}`} role={item.role} name={item.role === "user" ? "Ana" : "Ouro"}>
            {item.text}
          </Message>
        ))}
      </MessageList>
    );
  }
  /** Whether the message with this id shows whole in the list's view. */
  const inView = (scroller: HTMLElement, id: string) => {
    const view = scroller.getBoundingClientRect();
    const box = document.getElementById(id)!.getBoundingClientRect();
    return box.top >= view.top - 1 && box.bottom <= view.bottom + 1;
  };
  /** Where the list is scrolled in the next frame, before the browser draws it. */
  const nextFrame = (scroller: HTMLElement) => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(scroller.scrollTop)));

  it("opens at the message initialAnchor names, never drawing the newest first, and stops following new messages", async () => {
    const items = history(30);
    const { scroller, rerender } = await render(<Found items={items} initialAnchor="found-5" />);
    const first = await nextFrame(scroller);
    // In the middle of the view, with no transform: it opens there at once, with no movement.
    expect(inView(scroller, "found-5")).toBe(true);
    const view = scroller.getBoundingClientRect();
    const box = document.getElementById("found-5")!.getBoundingClientRect();
    expect(Math.abs(box.top - view.top - (view.bottom - box.bottom))).toBeLessThanOrEqual(2);
    expect(inView(scroller, "found-29")).toBe(false);
    expect([...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')].every((message) => message.style.transform === "")).toBe(true);
    await expect.element(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    // A new message leaves the reader where they are, and does not take them back to the message they opened at.
    await wheel(scroller, 200);
    const top = scroller.scrollTop;
    expect(top).toBeGreaterThan(first);
    await rerender(<Found items={[...items, { id: 30, role: "assistant", text: "A new reply." }]} initialAnchor="found-5" />);
    await settle(scroller);
    expect(scroller.scrollTop).toBe(top);
  });

  it("opens at initialAnchor when it comes with the first messages, after the list mounted empty", async () => {
    const items = history(30);
    const { scroller, rerender } = await render(<Found items={[]} />);
    await rerender(<Found items={items} initialAnchor="found-5" />);
    await nextFrame(scroller);
    expect(inView(scroller, "found-5")).toBe(true);
    expect(inView(scroller, "found-29")).toBe(false);
    // Only the first messages open it: an anchor named later moves nothing.
    await rerender(<Found items={items} initialAnchor="found-20" />);
    await settle(scroller);
    expect(inView(scroller, "found-5")).toBe(true);
  });

  it("opens at the newest message when initialAnchor names no message in the list, or the newest itself", async () => {
    const { scroller } = await render(<Found items={history(30)} initialAnchor="gone" />);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    const { scroller: near } = await render(<Found items={history(30)} initialAnchor="found-29" />);
    expect(distanceFromBottom(near)).toBeLessThanOrEqual(1);
    // An empty name names no message, not one without an id.
    const { scroller: unnamed } = await render(<Chat items={history(30)} initialAnchor="" />);
    expect(distanceFromBottom(unnamed)).toBeLessThanOrEqual(1);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
  });

  it("keeps the message it opened at in place when older messages load before the browser reports the scroll", async () => {
    const items = history(30, 10);
    const { scroller } = await render(<Found items={[]} />);
    let top = 0;
    await act(async () => {
      flushSync(() => roots.at(-1)!.render(<Found items={items} initialAnchor="found-15" />));
      // The list opens as it sees the messages arrive, before the browser draws.
      await Promise.resolve();
      top = document.getElementById("found-15")!.getBoundingClientRect().top;
      flushSync(() => roots.at(-1)!.render(<Found items={[...history(10), ...items]} initialAnchor="found-15" />));
    });
    await settle(scroller);
    expect(Math.abs(document.getElementById("found-15")!.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });

  it("puts pages of older messages in a few at a time, holding the reader's message in place in every frame", async () => {
    // The whole list: a windowed one puts a page in at once, as space above the messages drawn.
    let items = history(200);
    const { scroller, rerender } = await render(<Found items={items} windowing={false} />);
    await settle(scroller);
    scroller.scrollTop = 3000;
    await settle(scroller);
    const reading = firstVisible(scroller);
    // How many messages went into the list in each frame, how far the reader's message moved by any frame, and how much the
    // layout shifted (where the browser measures it).
    const added = [0];
    let moved = 0;
    const shifts: number[] = [];
    const counting = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element && node.matches('[data-ouro="message"]')) added.push(added.pop()! + 1);
    });
    counting.observe(scroller, { childList: true, subtree: true });
    const layout = new PerformanceObserver((list) => list.getEntries().forEach((entry) => shifts.push((entry as PerformanceEntry & { value: number }).value)));
    if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) layout.observe({ type: "layout-shift" });
    let watching = true;
    const frame = () => {
      moved = Math.max(moved, Math.abs(reading.message.getBoundingClientRect().top - reading.top));
      added.push(0);
      if (watching) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    for (let page = 1; page <= 3; page++) {
      // A page of 100: five frames' worth, so the test stays well inside its time on a busy runner.
      items = [...history(100, -100 * page), ...items];
      await rerender(<Found items={items} windowing={false} />);
      // The app drawing the list again for something else, in the same frame, puts no more in.
      await act(async () => {
        flushSync(() => roots.at(-1)!.render(<Found items={items} windowing={false} />));
        flushSync(() => roots.at(-1)!.render(<Found items={items} windowing={false} />));
      });
      await expect.poll(() => scroller.querySelectorAll('[data-ouro="message"]').length).toBe(200 + 100 * page);
    }
    await settle(scroller);
    watching = false;
    counting.disconnect();
    layout.disconnect();
    expect(moved).toBeLessThanOrEqual(1);
    expect(Math.max(...added)).toBeLessThanOrEqual(20);
    expect(shifts.reduce((sum, shift) => sum + shift, 0)).toBeLessThan(0.01);
  });

  it("puts a few older messages in at once", async () => {
    const items = history(30, 20);
    const { scroller, rerender } = await render(<Found items={items} />);
    await rerender(<Found items={[...history(20), ...items]} />);
    expect(scroller.querySelectorAll('[data-ouro="message"]')).toHaveLength(50);
  });

  it("keeps following the end, with no Jump to latest, when the newest message goes and the browser reports the scroll first", async () => {
    const items = history(20, 10);
    const { scroller } = await render(<Chat items={items} />);
    await settle(scroller);
    await act(async () => {
      flushSync(() => roots.at(-1)!.render(<Chat items={items.slice(0, -1)} />));
      // The list's end came up to meet it: the browser reports that scroll before the list sees itself shrink.
      scroller.dispatchEvent(new Event("scroll"));
    });
    // Not for a frame either: the list is at its end as it is now, though not as it was.
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
  });

  it("stays at a message an app scrolls to as the first messages arrive, instead of following to the newest", async () => {
    const items = history(30);
    const { scroller } = await render(<Found items={[]} />);
    await act(async () => {
      flushSync(() => roots.at(-1)!.render(<Found items={items} />));
      // The app scrolls to a found message itself, before the list has seen its messages arrive.
      document.getElementById("found-5")!.scrollIntoView({ block: "start" });
    });
    await settle(scroller);
    expect(inView(scroller, "found-5")).toBe(true);
    await expect.element(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
  });

  /** A channel of an app's own posts, each `height` px tall, in the order given, so which of them start in the view is known. */
  function Tall({ order, height }: { order: number[]; height: number }) {
    return (
      <MessageList label="Channel" style={{ height: 300 }}>
        {order.map((n) => (
          <article key={n} id={`tall-${n}`} data-ouro-message-list-item="" data-role="user" style={{ height, margin: 0 }}>
            <p data-ouro-message-content="" style={{ margin: 0 }}>
              Post {n}
            </p>
          </article>
        ))}
      </MessageList>
    );
  }
  const tall = (n: number) => document.getElementById(`tall-${n}`)!.getBoundingClientRect().top;
  /** Renders posts 0 to 19 and scrolls post 10's top just inside the view. */
  async function scrolledTo10(height: number) {
    const order = Array.from({ length: 20 }, (_, n) => n);
    const { scroller, rerender } = await render(<Tall order={order} height={height} />);
    await settle(scroller);
    scroller.scrollTop += tall(10) - scroller.getBoundingClientRect().top - 1;
    await settle(scroller);
    return { order, scroller, rerender };
  }

  it("keeps the reader's place by the messages around the one they are on when it moves to the end", async () => {
    // Posts 90px tall, so several start in the view, and the first of them gets a reply and moves to the end.
    const { order, scroller, rerender } = await scrolledTo10(90);
    const before = tall(11);
    await rerender(<Tall order={[...order.filter((n) => n !== 10), 10]} height={90} />);
    await settle(scroller);
    expect(Math.abs(tall(11) - before)).toBeLessThanOrEqual(1);
  });

  it("holds the post that fills the view, not the reply above it, when replies sit inside the post", async () => {
    function Thread({ above }: { above: number }) {
      return (
        <MessageList label="Channel" style={{ height: 300 }}>
          <article id="parent" data-ouro-message-list-item="" data-role="user" style={{ margin: 0 }}>
            <div data-ouro-message-list-item="" id="reply-a" style={{ height: above }} />
            <div data-ouro-message-list-item="" id="reply-b" style={{ height: 3000 }} />
          </article>
        </MessageList>
      );
    }
    const { scroller, rerender } = await render(<Thread above={200} />);
    await settle(scroller);
    scroller.scrollTop = 1200;
    await settle(scroller);
    const parentTop = () => document.getElementById("parent")!.getBoundingClientRect().top;
    const before = parentTop();
    await rerender(<Thread above={400} />);
    await settle(scroller);
    // The post that fills the view holds the place, and it did not move, so the list does not correct for the reply's growth.
    expect(Math.abs(parentTop() - before)).toBeLessThanOrEqual(1);
    expect(scroller.scrollTop).toBe(1200);
  });

  it("keeps the reader's place by the other message in view when the one they are on moves to the end", async () => {
    // Posts 160px tall, so only two start in the view: the one that stayed tells the list where the reader is.
    const { order, scroller, rerender } = await scrolledTo10(160);
    const before = tall(11);
    await rerender(<Tall order={[...order.filter((n) => n !== 10), 10]} height={160} />);
    await settle(scroller);
    expect(Math.abs(tall(11) - before)).toBeLessThanOrEqual(1);
  });

  it("keeps the reader's place when the other message in view moves away to the start", async () => {
    // Two posts start in the view, and the second moves to the start of the list: it moved farther, so the place is held by the first.
    const { order, scroller, rerender } = await scrolledTo10(160);
    const before = tall(10);
    await rerender(<Tall order={[11, ...order.filter((n) => n !== 11)]} height={160} />);
    await settle(scroller);
    expect(Math.abs(tall(10) - before)).toBeLessThanOrEqual(1);
  });

  it("keeps the reader's place by the messages that moved together, when one in view moves above the others as older history loads", async () => {
    // Posts 120px tall, so 10, 11 and 12 start in the view. Older posts load above, and 12 moves above 10: it moved
    // least, but past the others, so the place is held by 10.
    const { order, scroller, rerender } = await scrolledTo10(120);
    const before = tall(10);
    const older = Array.from({ length: 4 }, (_, n) => 100 + n);
    await rerender(<Tall order={[...older, ...order.slice(0, 10), 12, 10, 11, ...order.slice(13)]} height={120} />);
    await settle(scroller);
    expect(Math.abs(tall(10) - before)).toBeLessThanOrEqual(1);
  });

  it("stops following the newest message once the list is scrolled up, even before the scroll event comes", async () => {
    const items = history(20, 10);
    const { scroller } = await render(<Chat items={items} />);
    await settle(scroller);
    let top = 0;
    await act(async () => {
      // Code scrolls the list up from its end (to a post's summary as a thread closes), and a message arrives before
      // the browser sends the scroll event.
      scroller.scrollTop -= 200;
      top = scroller.scrollTop;
      flushSync(() => roots.at(-1)!.render(<Chat items={[...items, { id: 30, role: "assistant", text: "A new reply." }]} />));
    });
    await settle(scroller);
    expect(scroller.scrollTop).toBe(top);
    await expect.element(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
  });

  it("keeps following the end when the newest message goes, as the list's end comes up to meet it", async () => {
    const items = history(20, 10);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await settle(scroller);
    await rerender(<Chat items={items.slice(0, -1)} />);
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    await rerender(<Chat items={[...items.slice(0, -1), { id: 30, role: "assistant", text: "A new reply." }]} />);
    await expect.poll(() => distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
  });

  it("shows older messages loading over the top of the list, moving no message as it starts or ends", async () => {
    const items = history(20, 10);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await wheel(scroller, -400);
    const tops = () => [...scroller.querySelectorAll('[data-ouro="message"]')].map((message) => message.getBoundingClientRect().top);
    const before = tops();
    const height = scroller.scrollHeight;
    await rerender(<Chat items={items} loadingOlder />);
    const status = page.getByText("Loading older messages");
    await expect.element(status).toBeVisible();
    // Screen readers hear it once, politely, as it shows.
    expect(status.element().closest('[aria-live="polite"]')).not.toBeNull();
    // An app's own status stays the page's only one.
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(0);
    // Over the list, not in it: no message moved, and the list grew by nothing.
    expect(tops()).toEqual(before);
    expect(scroller.scrollHeight).toBe(height);
    expect(scroller.contains(status.element())).toBe(false);
    await rerender(<Chat items={items} />);
    await expect.element(status).not.toBeInTheDocument();
    expect(tops()).toEqual(before);
  });

  it("keeps room above the first message while hasOlder, so loading older messages covers no message or focus ring and moves nothing", async () => {
    const items = history(20, 10);
    const { scroller, rerender } = await render(<Chat items={items} hasOlder />);
    await act(async () => void (scroller.scrollTop = 0));
    await settle(scroller);
    // The first message, focused from the keyboard, so its focus ring shows.
    await pressTab();
    await userEvent.keyboard("{Home}");
    const first = scroller.querySelector<HTMLElement>('[data-ouro="message"]')!;
    expect(document.activeElement).toBe(first);
    expect(scroller.scrollTop).toBe(0);
    const style = getComputedStyle(first);
    expect(style.outlineStyle).not.toBe("none");
    const ring = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    const tops = () => [...scroller.querySelectorAll('[data-ouro="message"]')].map((message) => message.getBoundingClientRect().top);
    const before = tops();
    const height = scroller.scrollHeight;
    await rerender(<Chat items={items} hasOlder loadingOlder />);
    const pill = page.getByText("Loading older messages").element();
    await expect.poll(() => pill.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(pill.getBoundingClientRect().bottom).toBeLessThanOrEqual(first.getBoundingClientRect().top - ring);
    expect(tops()).toEqual(before);
    expect(scroller.scrollHeight).toBe(height);
    expect(scroller.scrollTop).toBe(0);
    await rerender(<Chat items={items} hasOlder />);
    await expect.element(page.getByText("Loading older messages")).not.toBeInTheDocument();
    expect(tops()).toEqual(before);
  });

  it("takes a text node put in a message for no move of the messages, and throws nothing", async () => {
    const { scroller } = await render(<Chat items={history(20, 10)} />);
    // Scrolled up, where the list holds the reader's place for a change that moves messages.
    await act(async () => void (scroller.scrollTop = 0));
    await settle(scroller);
    const errors: unknown[] = [];
    const report = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener("error", report);
    await act(async () => void scroller.querySelector('[data-ouro="message"]')!.append(document.createTextNode(" more")));
    await settle(scroller);
    window.removeEventListener("error", report);
    expect(errors).toEqual([]);
  });

  it("keeps the room once hasOlder ends while it shows, and drops it without moving a message once it leaves the view", async () => {
    const items = history(20, 10);
    const { scroller, rerender } = await render(<Chat items={items} hasOlder />);
    await act(async () => void (scroller.scrollTop = 0));
    await settle(scroller);
    const tops = () => [...scroller.querySelectorAll('[data-ouro="message"]')].map((message) => message.getBoundingClientRect().top);
    const room = () => scroller.querySelector("[data-ouro-message-list-older-room]");
    const before = tops();
    // The start is reached at the top: the room stays, so nothing moves.
    await rerender(<Chat items={items} />);
    await settle(scroller);
    expect(room()).not.toBeNull();
    expect(tops()).toEqual(before);
    // A scroll that leaves part of it in view keeps it.
    await act(async () => void (scroller.scrollTop = 10));
    await settle(scroller);
    expect(room()).not.toBeNull();
    // Scrolled out of view, it goes, and the messages stay where the scroll put them.
    await act(async () => void (scroller.scrollTop = 200));
    const scrolled = tops();
    await expect.poll(room).toBeNull();
    await settle(scroller);
    tops().forEach((top, index) => near(top, scrolled[index]!));
  });

  it("holds the reader's message still in every frame as the last older page comes and the room above it goes", async () => {
    const items = history(20, 10);
    const { scroller, rerender } = await render(<Chat items={items} hasOlder />);
    await settle(scroller);
    // Scrolled back to the start, where the next page loads.
    await act(async () => void (scroller.scrollTop = 0));
    await settle(scroller);
    const reading = firstVisible(scroller);
    // Where the reader's message is in every frame, and how much the layout shifted (where the browser measures it).
    let moved = 0;
    let watching = true;
    const frame = () => {
      moved = Math.max(moved, Math.abs(reading.message.getBoundingClientRect().top - reading.top));
      if (watching) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const shifts: number[] = [];
    const layout = new PerformanceObserver((list) => list.getEntries().forEach((entry) => shifts.push((entry as PerformanceEntry & { value: number }).value)));
    if (PerformanceObserver.supportedEntryTypes.includes("layout-shift")) layout.observe({ type: "layout-shift" });
    // The last page: nothing older, so the room goes once the list has kept the reader's place and it is out of view.
    await rerender(<Chat items={[...history(10), ...items]} />);
    await expect.poll(() => scroller.querySelector("[data-ouro-message-list-older-room]")).toBeNull();
    await settle(scroller);
    watching = false;
    layout.disconnect();
    expect(moved).toBeLessThanOrEqual(1);
    expect(shifts.reduce((sum, shift) => sum + shift, 0)).toBeLessThan(0.001);
  });

  it("drops the room at once when hasOlder ends at the list's end or with the room out of view, and adds it without moving a message", async () => {
    const items = history(20, 10);
    const room = () => scroller.querySelector("[data-ouro-message-list-older-room]");
    const tops = () => [...scroller.querySelectorAll('[data-ouro="message"]')].map((message) => message.getBoundingClientRect().top);
    const { scroller, rerender } = await render(<Chat items={items} />);
    expect(room()).toBeNull();
    // Added at the end: the list stays at its end.
    await rerender(<Chat items={items} hasOlder />);
    expect(room()).not.toBeNull();
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    // Ended at the end: it goes at once, and the list stays at its end.
    let before = tops();
    await rerender(<Chat items={items} />);
    expect(room()).toBeNull();
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    tops().forEach((top, index) => near(top, before[index]!));
    // So in a short conversation, where it shows at the end.
    const short = await render(<Chat items={history(2)} hasOlder />);
    const shortRoom = short.scroller.querySelector("[data-ouro-message-list-older-room]")!;
    expect(shortRoom.getBoundingClientRect().bottom).toBeGreaterThan(short.scroller.getBoundingClientRect().top);
    const shortTops = [...short.scroller.querySelectorAll('[data-ouro="message"]')].map((message) => message.getBoundingClientRect().top);
    await short.rerender(<Chat items={history(2)} />);
    expect(short.scroller.querySelector("[data-ouro-message-list-older-room]")).toBeNull();
    expect([...short.scroller.querySelectorAll('[data-ouro="message"]')].map((message) => message.getBoundingClientRect().top)).toEqual(shortTops);
    // Added mid-conversation: the reader's messages stay where they are.
    await wheel(scroller, -400);
    before = tops();
    await rerender(<Chat items={items} hasOlder />);
    await settle(scroller);
    expect(room()).not.toBeNull();
    tops().forEach((top, index) => near(top, before[index]!));
    // Ended out of view: it goes at once, with no scroll to wait for.
    await rerender(<Chat items={items} />);
    expect(room()).toBeNull();
    tops().forEach((top, index) => near(top, before[index]!));
  });

  it("takes a translated label for older messages loading", async () => {
    await render(<Chat items={history(3)} loadingOlder loadingOlderLabel="Cargando mensajes anteriores" />);
    await expect.element(page.getByText("Cargando mensajes anteriores")).toBeVisible();
  });

  it("keeps the reader's place among an app's own messages marked data-ouro-message-list-item, and announces them as it does Messages", async () => {
    /** An app's own message, not Ouro's Message, marked for the list. */
    function Post({ item }: { item: Item }) {
      return (
        <article data-ouro-message-list-item="" data-role={item.role} aria-busy={item.streaming || undefined} style={{ padding: 8 }}>
          <span data-ouro-message-author="">{item.role === "user" ? "Ana" : "Grace"}</span>
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
        <Message role="user" name="Ana">
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
              <Message key={item.id} role={item.role} name={item.role === "user" ? "Ana" : "Ouro"}>
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

  it("centres the conversation at maxWidth in a wider list, the user's own messages with it, and fills a narrower one", async () => {
    const list = (width: number, maxWidth?: number) => (
      <MessageList label="Conversation" style={{ width, height: 300 }} maxWidth={maxWidth}>
        <Message role="assistant" name="Ouro" id="theirs">
          Rest the dough for an hour.
        </Message>
        <Message role="user" name="Ana" id="mine">
          Covered?
        </Message>
      </MessageList>
    );
    const { host, rerender } = await render(list(1200, 600));
    const content = () => host.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    const scroller = () => host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    const rect = (element: Element) => element.getBoundingClientRect();
    expect(rect(content()).width).toBeCloseTo(600, 0);
    const room = scroller().clientWidth - 600;
    expect(rect(content()).left - rect(scroller()).left).toBeCloseTo(room / 2, 0);
    // The user's own message ends at the column's edge, inside its 16px padding, not at the list's.
    expect(rect(document.getElementById("mine")!).right).toBeCloseTo(rect(content()).right - 16, 0);
    await rerender(list(400, 600));
    expect(rect(content()).width).toBeCloseTo(scroller().clientWidth, 0);
    await rerender(list(1200));
    expect(rect(content()).width).toBeCloseTo(scroller().clientWidth, 0);
    expect(content().style.cssText).toBe("");
  });

  it("forwards a ref to the root and lets app layout classes win", async () => {
    let element: HTMLElement | null = null;
    const { list } = await render(
      <MessageList label="Chat" className="mt-4" ref={(node) => void (element = node)}>
        <Message role="user" name="Ana">
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
    <Message key={index} role={index % 2 ? "assistant" : "user"} name={index % 2 ? "Grace" : "Ana"} id={`post-${index}`}>
      Post {index}: {"a short note ".repeat(6)}
      {extra(index)}
    </Message>
  ));

/** A list between two buttons, so Tab has somewhere to come from and go to. */
function Channel({
  children,
  height = 300,
  onMessageKeyDown,
  pageKeys,
}: {
  children: ReactNode;
  height?: number;
  onMessageKeyDown?: (message: HTMLElement, event: React.KeyboardEvent<HTMLElement>) => void;
  pageKeys?: boolean;
}) {
  return (
    <div>
      <button type="button">Before</button>
      <MessageList label="Channel" style={{ height }} onMessageKeyDown={onMessageKeyDown} pageKeys={pageKeys}>
        {children}
      </MessageList>
      <button type="button">After</button>
    </div>
  );
}

const focusedId = () => document.activeElement?.id ?? "";
/** The ids of the list's messages in the Tab order; every other message has `tabindex="-1"`. */
const tabStops = (scroller: HTMLElement) => {
  const messages = [...scroller.querySelectorAll<HTMLElement>('[data-ouro-part="item"]')];
  expect(messages.every((message) => ["0", "-1"].includes(message.getAttribute("tabindex")!))).toBe(true);
  return messages.filter((message) => message.getAttribute("tabindex") === "0").map((message) => message.id);
};
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

  it("reads ⌘↑ and ⌘↓ as Home and End, and ⌥↑ and ⌥↓ as Page Up and Page Down, on a Mac", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    if ("userAgentData" in navigator) vi.spyOn(navigator as Navigator & { userAgentData: { platform: string } }, "userAgentData", "get").mockReturnValue({ platform: "macOS" } as never);
    const { scroller } = await render(<Channel>{posts(14)}</Channel>);
    button("Before").focus();
    await pressTab();
    expect(focusedId()).toBe("post-13");
    await userEvent.keyboard("{Meta>}{ArrowUp}{/Meta}");
    expect(focusedId()).toBe("post-0");
    await userEvent.keyboard("{Meta>}{ArrowDown}{/Meta}");
    expect(focusedId()).toBe("post-13");
    const messages = [...scroller.querySelectorAll<HTMLElement>("article")];
    const start = messages[13]!.getBoundingClientRect().top;
    const up = messages.findIndex((message, index) => index < 13 && start - message.getBoundingClientRect().top <= scroller.clientHeight);
    expect(up).toBeLessThan(12);
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(focusedId()).toBe(`post-${up}`);
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(Number(focusedId().slice(5))).toBeGreaterThan(up + 1);
  });

  it("leaves Page Up and Page Down, and ⌥↑ and ⌥↓ on a Mac, to the app with pageKeys={false}, and moves with the other keys", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    if ("userAgentData" in navigator) vi.spyOn(navigator as Navigator & { userAgentData: { platform: string } }, "userAgentData", "get").mockReturnValue({ platform: "macOS" } as never);
    // An app's window shortcut, listening in the bubble phase, as most do.
    const heard: string[] = [];
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Alt" || event.key === "Meta") return;
      heard.push(`${event.altKey ? "Alt+" : ""}${event.metaKey ? "Meta+" : ""}${event.key}${event.defaultPrevented ? " prevented" : ""}`);
    };
    const { rerender } = await render(<Channel>{posts(14)}</Channel>);
    await rerender(<Channel pageKeys={false}>{posts(14)}</Channel>);
    button("Before").focus();
    await pressTab();
    expect(focusedId()).toBe("post-13");
    window.addEventListener("keydown", onKey);
    try {
      await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
      await userEvent.keyboard("{PageUp}");
      expect(focusedId()).toBe("post-13");
      await userEvent.keyboard("{ArrowUp}");
      expect(focusedId()).toBe("post-12");
      await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
      await userEvent.keyboard("{PageDown}");
      expect(focusedId()).toBe("post-12");
      // ⌘↑ is still Home.
      await userEvent.keyboard("{Meta>}{ArrowUp}{/Meta}");
      expect(focusedId()).toBe("post-0");
      expect(heard).toEqual(["Alt+ArrowUp", "PageUp", "ArrowUp prevented", "Alt+ArrowDown", "PageDown", "Meta+ArrowUp prevented"]);
    } finally {
      window.removeEventListener("keydown", onKey);
    }
  });

  it("leaves ⌘↑, ⌘↓, ⌥↑ and ⌥↓ alone on a Mac once an app's capture-phase shortcut prevented them", async () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    if ("userAgentData" in navigator) vi.spyOn(navigator as Navigator & { userAgentData: { platform: string } }, "userAgentData", "get").mockReturnValue({ platform: "macOS" } as never);
    const heard: string[] = [];
    const onKey = (event: KeyboardEvent) => {
      if (!event.key.startsWith("Arrow") || !(event.altKey || event.metaKey)) return;
      heard.push(`${event.metaKey ? "Meta" : "Alt"}+${event.key}`);
      event.preventDefault();
    };
    await render(<Channel>{posts(14)}</Channel>);
    button("Before").focus();
    await pressTab();
    window.addEventListener("keydown", onKey, { capture: true });
    try {
      for (const press of ["{Alt>}{ArrowUp}{/Alt}", "{Meta>}{ArrowUp}{/Meta}", "{Alt>}{ArrowDown}{/Alt}", "{Meta>}{ArrowDown}{/Meta}"]) {
        await userEvent.keyboard(press);
        expect(focusedId()).toBe("post-13");
      }
      expect(heard).toEqual(["Alt+ArrowUp", "Meta+ArrowUp", "Alt+ArrowDown", "Meta+ArrowDown"]);
    } finally {
      window.removeEventListener("keydown", onKey, { capture: true });
    }
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
        <Message role="user" name="Ana" id="hidden" style={hide ? { display: "none" } : undefined}>
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
        <Message role="user" name="Ana" id="short">
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
        <Message role="user" name="Ana" id="short">
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
        <Message role="user" name="Ana" id="plain">
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
    // Elsewhere than a Mac, where ⌘ and ⌥ with an arrow are its missing Home, End and Page keys.
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    if ("userAgentData" in navigator) vi.spyOn(navigator as Navigator & { userAgentData: { platform: string } }, "userAgentData", "get").mockReturnValue({ platform: "Windows" } as never);
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
        <Message role="user" name="Ana" id="editing">
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
          <Message key={`late-${index}`} role="user" name="Ana" id={`late-${index}`}>
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
          <Message role="user" name="Ana" id="short">
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
        <Message role="user" name="Ana" id="with-popup">
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
            <Message role="user" name="Ana" id="quoted">
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
    // Once the list has followed the new message, the scroll puts the Tab stop on it, the newest in view; until then
    // the stop stays where it was. Read it after the scroll, so the result never depends on when the scroll event lands.
    await settle(scroller);
    expect(tabStops(scroller)).toEqual(["post-2"]);
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
            <Message role="user" name="Ana" id="inner">
              A reply
            </Message>
          </MessageList>
        </Message>
        <Message role="user" name="Ana" id="newest">
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

  it("passes over the focus guards around an open menu's button, so Tab never bounces back to the message", async () => {
    await render(
      <Channel>
        {posts(2)}
        <Message
          variant="post"
          role="assistant"
          name="Mara Quill"
          id="with-thread"
          menu={[{ label: "Copy link", onClick: () => {} }]}
          footer={
            <button type="button" aria-label="2 replies">
              2 replies
            </button>
          }
        >
          Settings mockups.
        </Message>
      </Channel>,
    );
    const message = document.getElementById("with-thread")!;
    const more = () => message.querySelector<HTMLElement>('[data-ouro-part="menu"]');
    await expect.poll(more).not.toBeNull();
    await userEvent.click(more()!);
    await expect.element(page.getByRole("menuitem", { name: "Copy link" })).toBeVisible();
    // The menu's guards stand around its button while it is open, as a screen reader's cursor or a click lands on the message.
    expect(message.querySelector("[data-base-ui-focus-guard]")).not.toBeNull();
    // The menu takes focus on the frame after it opens. In WebKit, where the click left focus on the page, that frame can
    // come after the menu shows, and would take focus from the message back into the menu: let it pass first.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await act(async () => message.focus());
    expect(document.activeElement).toBe(message);
    // Before the fix, the guard ahead of the menu's button took this Tab, closed the menu and dropped focus to the page.
    const reached: string[] = [];
    for (let press = 0; press < 3; press++) {
      await pressTab();
      reached.push(document.activeElement!.getAttribute("aria-label") || document.activeElement!.id || document.activeElement!.textContent);
    }
    expect(reached.slice(0, 2).toSorted()).toEqual(["2 replies", "More actions"]);
    expect(reached[2]).toBe("After");
    await pressTab({ shift: true });
    expect(focusedId()).toBe("with-thread");
  });

  it("leaves Tab into a radio group in a message to the browser, which enters it at the checked radio", async () => {
    await render(
      <Channel>
        {posts(1)}
        <Message role="assistant" name="Grace" id="poll">
          Lunch?
          <label>
            <input type="radio" name="lunch" value="soup" /> Soup
          </label>
          <label>
            <input type="radio" name="lunch" value="salad" defaultChecked /> Salad
          </label>
        </Message>
      </Channel>,
    );
    button("Before").focus();
    await pressTab();
    expect(focusedId()).toBe("poll");
    await pressTab();
    expect((document.activeElement as HTMLInputElement).value).toBe("salad");
  });

  it("leaves focus where a component puts it after removing the focused control", async () => {
    function Swap() {
      const [swapped, setSwapped] = useState(false);
      return (
        <Message role="user" name="Ana" id="swap">
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
              <Message role="user" name="Ana" id="draft">
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
        <Message role="user" name="Ana" id="newest">
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
        <Message role="user" name="Ana" id="short">
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
    // The list keeps the reader's place as the message grows, in a frame before the scroll to the top below.
    await settle(scroller);
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

  it("moves focus from a focused message replaced under a new key to its replacement, not to its old index, as older messages go in above", async () => {
    const recent = history(15, 100);
    const { scroller, rerender } = await render(<Chat items={recent} />);
    await settle(scroller);
    const newest = [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')].at(-1)!;
    newest.focus();
    await settle(scroller);
    // In one commit: older messages in above, and the newest swapped for the server's copy, a new key with the same text.
    await rerender(<Chat items={[...history(10, 0), ...recent.slice(0, -1), { ...recent.at(-1)!, id: "sent" }]} />);
    await settle(scroller);
    const replacement = [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')].at(-1)!;
    expect(replacement).not.toBe(newest);
    expect(document.activeElement).toBe(replacement);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(2);
  });
});

describe("MessageList development messages", () => {
  it.each([
    ["autoScroll", { autoScroll: true }, "autoScroll is not a prop; the list follows new messages while the reader is at the bottom", '<MessageList label="Conversation">'],
    ["stickToBottom", { stickToBottom: true }, "stickToBottom is not a prop; the list follows new messages while the reader is at the bottom", '<MessageList label="Conversation">'],
    ["loose text", { children: "Hi" }, "MessageList holds Messages", '<MessageList label="Conversation"><Message role="user" name="Ana">Hi</Message></MessageList>'],
  ])("warns for %s with the fix", async (_name, extra, problem, fix) => {
    const props = { label: "Conversation", children: <Message role="user" name="Ana">Hi</Message>, ...extra } as unknown as Parameters<typeof MessageList>[0];
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

describe("MessageList through a long conversation", () => {
  /** The boxes read for one scroll event, on average over `steps` scrolls up of `by` px, each reported as the browser would. */
  function readsPerScroll(scroller: HTMLElement, steps = 10, by = 40): number {
    const measured = vi.spyOn(Element.prototype, "getBoundingClientRect");
    for (let step = 0; step < steps; step++) {
      scroller.scrollTop -= by;
      scroller.dispatchEvent(new Event("scroll"));
    }
    const reads = measured.mock.calls.length / steps;
    measured.mockRestore();
    return reads;
  }
  /** Into the middle of the conversation, away from the newest, as a reader scrolling up through it. */
  async function scrolledUp(scroller: HTMLElement) {
    scroller.scrollTop = scroller.scrollHeight / 2;
    scroller.dispatchEvent(new Event("scroll"));
    await settle(scroller);
  }
  const inView = (scroller: HTMLElement, element: Element) => {
    const box = element.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    return box.top >= view.top && box.bottom <= view.bottom;
  };

  it("reads as few boxes on a scroll through a thousand messages as through fifty, and keeps the Tab stop on a message in view", async () => {
    const reads: number[] = [];
    for (const count of [50, 1000]) {
      const { scroller } = await render(<Chat items={history(count)} />);
      await scrolledUp(scroller);
      reads.push(readsPerScroll(scroller));
      // The Tab stop follows the scroll: the last message the view shows whole.
      const messages = [...scroller.querySelectorAll('[data-ouro="message"]')];
      expect(scroller.querySelector('[data-ouro="message"][tabindex="0"]')).toBe(messages.findLast((message) => inView(scroller, message)));
      await act(async () => roots.pop()!.unmount());
    }
    // Halving finds the messages in view: twenty times the messages takes a handful more reads, not twenty times as many.
    expect(reads[1]! - reads[0]!).toBeLessThanOrEqual(12);
  });

  it("keeps the reader's place as older history loads above, reading as few boxes in a thousand messages as in fifty", async () => {
    const reads: number[] = [];
    for (const count of [50, 1000]) {
      const { scroller, rerender } = await render(<Chat items={history(count, 1000)} />);
      await scrolledUp(scroller);
      const before = firstVisible(scroller);
      const measured = vi.spyOn(Element.prototype, "getBoundingClientRect");
      await rerender(<Chat items={[...history(50, 950), ...history(count, 1000)]} />);
      await settle(scroller);
      reads.push(measured.mock.calls.length);
      measured.mockRestore();
      expect(Math.abs(before.message.getBoundingClientRect().top - before.top)).toBeLessThanOrEqual(1);
      await act(async () => roots.pop()!.unmount());
    }
    expect(reads[1]! - reads[0]!).toBeLessThanOrEqual(120);
  });

  // A hidden message (display: none) has an all-zero box, wherever it sits: the halving must not take its top of 0 for its place.
  const hiding = (items: Item[], hidden: number[]) => items.map((item, at) => (hidden.includes(at) ? { ...item, hidden: true } : item));
  /** The first message with a box whose top is in the list's view, and where that top is. */
  const firstShown = (scroller: HTMLElement) => {
    const view = scroller.getBoundingClientRect();
    const message = [...scroller.querySelectorAll('[data-ouro="message"]')].find((node) => node.getClientRects().length > 0 && node.getBoundingClientRect().top >= view.top)!;
    return { message, top: message.getBoundingClientRect().top };
  };

  it("keeps the reader's place as they scroll and older history loads, under a header, with a hidden message in view and one below it", async () => {
    // 200 messages: the first halving step lands on the 101st, hidden below the view, and the 63rd, in view, is hidden too.
    const items = hiding(history(200, 1000), [62, 100]);
    const { scroller, rerender } = await render(
      <div style={{ paddingTop: 120 }}>
        <Chat windowing={false} items={items} />
      </div>,
    );
    await settle(scroller);
    const messages = [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    scroller.scrollTop += messages[60]!.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.dispatchEvent(new Event("scroll"));
    await settle(scroller);
    scroller.scrollTop -= 20;
    scroller.dispatchEvent(new Event("scroll"));
    await settle(scroller);
    const before = firstShown(scroller);
    await rerender(
      <div style={{ paddingTop: 120 }}>
        <Chat windowing={false} items={[...history(50, 950), ...items]} />
      </div>,
    );
    await settle(scroller);
    expect(Math.abs(before.message.getBoundingClientRect().top - before.top)).toBeLessThanOrEqual(1);
  });

  it("never puts the Tab stop on a hidden message, the newest or one in view, as the view shows the messages around it", async () => {
    const items = hiding(history(60), [30, 59]);
    const { scroller } = await render(
      <div style={{ paddingTop: 120 }}>
        <Chat windowing={false} items={items} />
      </div>,
    );
    const messages = [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    const lastWhole = () => messages.findLast((message) => message.getClientRects().length > 0 && inView(scroller, message));
    // At the newest, the newest is hidden: the Tab stop is the last message the view shows whole.
    expect(scroller.querySelector('[data-ouro="message"][tabindex="0"]')).toBe(lastWhole());
    // Up to where the hidden 31st would sit in the view.
    scroller.scrollTop += messages[29]!.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.dispatchEvent(new Event("scroll"));
    expect(scroller.querySelector('[data-ouro="message"][tabindex="0"]')).toBe(lastWhole());
  });

  it("holds a message that fills the view by it and the few after it, not by every message to the newest", async () => {
    const items: Item[] = [...history(500), { id: "long", role: "assistant", text: "A long reply that runs on. ".repeat(200) }, ...history(500, 500)];
    const { scroller, rerender } = await render(<Chat windowing={false} items={items} />);
    const long = [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')][500]!;
    // Into the middle of the long reply, whose top is above the view and bottom below it.
    scroller.scrollTop += long.getBoundingClientRect().top - scroller.getBoundingClientRect().top + 300;
    scroller.dispatchEvent(new Event("scroll"));
    await settle(scroller);
    expect(readsPerScroll(scroller, 5, 10)).toBeLessThanOrEqual(40);
    // A message above it grows, and the reader's place in the long reply stays.
    const top = long.getBoundingClientRect().top;
    await rerender(<Chat windowing={false} items={items.map((item, at) => (at === 499 ? { ...item, text: `${item.text} ${"more ".repeat(60)}` } : item))} />);
    await settle(scroller);
    expect(Math.abs(long.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });
});

describe("MessageList when no message starts in view", () => {
  const long = (id: number | string): Item => ({ id, role: "assistant", text: "A long reply that runs on. ".repeat(80) });
  const grow = (items: Item[], id: number | string) => items.map((item) => (item.id === id ? { ...item, text: `${item.text} ${"more ".repeat(80)}` } : item));
  /**
   * Scrolls into `node` until its bottom is 150px below the view's: it fills the view, and the next message starts
   * within a view's height below, so the list holds it too.
   */
  const into = async (scroller: HTMLElement, node: Element) => {
    const box = node.getBoundingClientRect();
    scroller.scrollTop += box.bottom - scroller.getBoundingClientRect().bottom - 150;
    scroller.dispatchEvent(new Event("scroll"));
    await settle(scroller);
  };

  it("keeps the reader's place in the first message as it grows, when it fills the view", async () => {
    const items = [long("first"), ...history(5)];
    const { scroller, rerender } = await render(<Chat items={items} />);
    const first = scroller.querySelector('[data-ouro="message"]')!;
    await into(scroller, first);
    const top = first.getBoundingClientRect().top;
    await rerender(<Chat items={grow(items, "first")} />);
    await settle(scroller);
    expect(Math.abs(first.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });

  it("keeps the reader's place in a message that fills the view as it grows, under a header, with a hidden message after it", async () => {
    const items = [...history(5), long("long"), { ...history(1, 5)[0]!, hidden: true }, ...history(5, 6)];
    const list = (shown: Item[]) => (
      <div style={{ paddingTop: 120 }}>
        <Chat items={shown} />
      </div>
    );
    const { scroller, rerender } = await render(list(items));
    const filler = [...scroller.querySelectorAll('[data-ouro="message"]')][5]!;
    await into(scroller, filler);
    const top = filler.getBoundingClientRect().top;
    await rerender(list(grow(items, "long")));
    await settle(scroller);
    expect(Math.abs(filler.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });

  it("keeps what the reader sees in something of the app's own between messages, when a message above it grows", async () => {
    const list = (more: string) => (
      <MessageList label="Conversation" style={{ height: 300 }}>
        <Message role="user" name="Ana">
          {`Above the timeline.${more}`}
        </Message>
        <div data-timeline="" style={{ height: 1500 }} />
        <Message role="assistant" name="Ouro">
          Below the timeline.
        </Message>
        <Message role="assistant" name="Ouro">
          The newest.
        </Message>
      </MessageList>
    );
    const { scroller, rerender } = await render(list(""));
    const timeline = scroller.querySelector("[data-timeline]")!;
    await into(scroller, timeline);
    const top = timeline.getBoundingClientRect().top;
    await rerender(list(` ${"more ".repeat(80)}`));
    await settle(scroller);
    expect(Math.abs(timeline.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });

  it("keeps the reader's place in a post that fills the view as it grows, past a reply inside it above the view", async () => {
    const list = (more: string) => (
      <MessageList label="Channel" style={{ height: 300 }}>
        <Message role="user" name="Ana">
          Morning.
        </Message>
        <article data-ouro-message-list-item="" data-role="user" data-post="">
          <p data-ouro-message-content="" style={{ margin: 0 }}>
            {"A post that runs on. ".repeat(20)}
          </p>
          <article data-ouro-message-list-item="" data-role="assistant">
            <span data-ouro-message-content="">A reply, near the top of the post.</span>
          </article>
          <p style={{ margin: 0 }}>{`${"The post runs on below its reply. ".repeat(80)}${more}`}</p>
        </article>
        <Message role="assistant" name="Ouro">
          Under the post.
        </Message>
        <Message role="assistant" name="Ouro">
          The newest.
        </Message>
      </MessageList>
    );
    const { scroller, rerender } = await render(list(""));
    const post = scroller.querySelector("[data-post]")!;
    const reply = post.querySelector("[data-ouro-message-list-item]")!;
    await into(scroller, post);
    expect(reply.getBoundingClientRect().bottom).toBeLessThan(scroller.getBoundingClientRect().top);
    const top = post.getBoundingClientRect().top;
    await rerender(list(` ${"more ".repeat(80)}`));
    await settle(scroller);
    expect(Math.abs(post.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });

  it("keeps the next message where it was when the message that fills the view goes", async () => {
    const items = [...history(30), long("long"), ...history(20, 30)];
    const { scroller, rerender } = await render(<Chat items={items} />);
    const messages = [...scroller.querySelectorAll('[data-ouro="message"]')];
    await into(scroller, messages[30]!);
    const next = messages[31]!;
    const top = next.getBoundingClientRect().top;
    await rerender(<Chat items={items.filter((item) => item.id !== "long")} />);
    await settle(scroller);
    expect(Math.abs(next.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });
});

describe("MessageList's place, to the pixel", () => {
  // A row with a fractional height, as text, pictures and zoom make them, and the content the list reads.
  const row = (id: number) => (
    <article key={id} data-ouro-message-list-item="" data-role="assistant">
      <span data-ouro-message-author="">Ouro</span>
      <p data-ouro-message-content="" style={{ margin: 0, height: "30.3px" }}>{`Post ${id}`}</p>
    </article>
  );
  const page = (from: number, count: number) => Array.from({ length: count }, (_, index) => row(from + index));

  it("keeps the reader's place to a pixel while older posts go in above a row at a time, where the scroll position is in whole pixels", async () => {
    const posts = page(1000, 80);
    const { scroller, rerender } = await render(<MessageList label="Channel" style={{ height: 300 }}>{posts}</MessageList>);
    scroller.scrollTop = scroller.scrollHeight / 2;
    scroller.dispatchEvent(new Event("scroll"));
    await settle(scroller);
    const reader = [...scroller.querySelectorAll<HTMLElement>("[data-ouro-message-list-item]")].find((post) => post.getBoundingClientRect().top >= scroller.getBoundingClientRect().top)!;
    const top = reader.getBoundingClientRect().top;
    // Forty rows, one per update, as an app draws an older page over later frames.
    for (let drawn = 1; drawn <= 40; drawn++) {
      await rerender(
        <MessageList label="Channel" style={{ height: 300 }}>
          {[...page(1000 - drawn, drawn), ...posts]}
        </MessageList>,
      );
    }
    await settle(scroller);
    expect(Math.abs(reader.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });

  it("does not carry a move the browser took later, as smooth scrolling does, so the list does not overshoot", async () => {
    const posts = page(1000, 80);
    const { scroller, rerender } = await render(<MessageList label="Channel" style={{ height: 300 }}>{posts}</MessageList>);
    scroller.scrollTop = scroller.scrollHeight / 2;
    scroller.dispatchEvent(new Event("scroll"));
    await settle(scroller);
    const reader = [...scroller.querySelectorAll<HTMLElement>("[data-ouro-message-list-item]")].find((post) => post.getBoundingClientRect().top >= scroller.getBoundingClientRect().top)!;
    const top = reader.getBoundingClientRect().top;
    const own = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    // A write that reads back unchanged and lands a moment later, as an animated scroll does.
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => own.get!.call(scroller),
      set: (value: number) => {
        setTimeout(() => own.set!.call(scroller, value), 60);
      },
    });
    for (let drawn = 1; drawn <= 3; drawn++) {
      await rerender(
        <MessageList label="Channel" style={{ height: 300 }}>
          {[...page(1000 - drawn, drawn), ...posts]}
        </MessageList>,
      );
      await new Promise((resolve) => setTimeout(resolve, 120));
      scroller.dispatchEvent(new Event("scroll"));
    }
    delete (scroller as { scrollTop?: number }).scrollTop;
    await settle(scroller);
    expect(Math.abs(reader.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
  });

  // What a correction the list's start stopped could not make is no debt: the next correction starts from the place the reader is at.
  // The scroll position it is at, from the height of the first post that goes.
  for (const [at, title] of [
    [() => 3, "well short of the move"],
    [(first: number) => first - 1, "a pixel short of the move"],
  ] as const) {
    it(`does not carry a move the start of the list stopped, ${title}, into the next correction`, async () => {
      const first = (
        <article key="first" data-ouro-message-list-item="" data-role="assistant">
          <p data-ouro-message-content="" style={{ margin: 0, height: 2 }}>First</p>
        </article>
      );
      const rest = page(1, 40);
      const list = (posts: ReactNode[]) => (
        <MessageList label="Channel" style={{ height: 300 }}>
          {posts}
        </MessageList>
      );
      const { scroller, rerender } = await render(list([first, ...rest]));
      const [before, reader] = scroller.querySelectorAll<HTMLElement>("[data-ouro-message-list-item]") as unknown as [HTMLElement, HTMLElement];
      // How far the reader's post moves up when the first goes.
      const moves = reader.getBoundingClientRect().top - before.getBoundingClientRect().top;
      scroller.scrollTop = at(moves);
      scroller.dispatchEvent(new Event("scroll"));
      await settle(scroller);
      // The first goes: the reader's post moves up by its height, and the scroll position can go up only by what it is at.
      await rerender(list(rest));
      await expect.poll(() => scroller.scrollTop).toBe(0);
      const top = reader.getBoundingClientRect().top;
      await rerender(list([first, ...rest]));
      await settle(scroller);
      // It comes back as the first does, so the reader's post is where it was, not short of it by what the first move missed.
      expect(Math.abs(reader.getBoundingClientRect().top - top)).toBeLessThan(0.5);
    });
  }
});

describe("MessageList switching conversations", () => {
  /** A conversation with someone, its messages' ids and text their own. */
  const conversation = (name: string, count: number): Item[] => history(count).map((item) => ({ ...item, id: `${name}-${item.id}`, text: `${name}: ${item.text}` }));
  /** A list that shows one conversation, keyed by it (remounted on a switch) or not (the same list, its messages replaced). */
  function Switcher({
    open,
    keyed,
    count = 1000,
    initialAnchor,
    items = conversation(open, count),
    welcome = false,
    actions,
    named = false,
    called,
    byIndex = false,
    children,
  }: {
    open: string;
    keyed: boolean;
    count?: number;
    initialAnchor?: string;
    items?: Item[];
    /** What starts every conversation, first, under the same key in each. */
    welcome?: boolean;
    /** Tell the list which conversation it shows, with `conversation`. */
    named?: boolean;
    /** The `conversation` to name, when it is not the one whose messages show (an app between fetches). */
    called?: string;
    /** Key the messages by their place, as conversations that share keys do. */
    byIndex?: boolean;
    /** What follows the list, such as a composer. */
    children?: ReactNode;
    actions?: { current: MessageListActions | null };
  }) {
    return (
      <>
      <MessageList key={keyed ? open : undefined} label={`Chat with ${open}`} style={{ height: 300 }} initialAnchor={initialAnchor} conversation={called ?? (named ? open : undefined)} actionsRef={actions}>
        {welcome && <p key="welcome">The start of your conversation</p>}
        {items.map((item, at) => (
          <Message key={byIndex ? at : item.id} id={String(item.id)} role={item.role} name={item.role === "user" ? "Ana" : open}>
            {item.text}
          </Message>
        ))}
      </MessageList>
      {children}
      </>
    );
  }
  /**
   * A root whose `commit` returns once React has committed and the list's observers have run, before any frame: what the
   * browser draws first. Outside `act`, which can let a frame, and older messages with it, go in. `reads` counts the boxes
   * the commit read.
   */
  function mount() {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    const handle = {
      host,
      reads: 0,
      commit: async (node: ReactNode) => {
        const measured = vi.spyOn(Element.prototype, "getBoundingClientRect");
        flushSync(() => root.render(node));
        await Promise.resolve();
        handle.reads = measured.mock.calls.length;
        measured.mockRestore();
      },
      get scroller() {
        return host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
      },
    };
    return handle;
  }
  const messagesOf = (scroller: HTMLElement) => [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
  /** How many messages the conversation holds, as the newest says to screen readers: the whole conversation, drawn or not. */
  const setSize = (scroller: HTMLElement) => messagesOf(scroller).at(-1)!.getAttribute("aria-setsize");
  /** How far the newest message's bottom is above the list's. */
  const newestGap = (scroller: HTMLElement) => scroller.getBoundingClientRect().bottom - messagesOf(scroller).at(-1)!.getBoundingClientRect().bottom;
  /**
   * After each frame the browser draws, until every message is in: where `watched` sits in the list's view, and how many
   * messages show in it.
   */
  async function framesUntilDrawn(scroller: HTMLElement, watched: () => number) {
    const frames: { at: number; showing: number }[] = [];
    do {
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
      const view = scroller.getBoundingClientRect();
      const showing = messagesOf(scroller).filter((message) => {
        const box = message.getBoundingClientRect();
        return box.bottom > view.top && box.top < view.bottom;
      }).length;
      frames.push({ at: watched(), showing });
    } while (frames.length < 6);
    return frames;
  }
  /** The frames that moved `watched` from where it was, or showed no message: none, with no jump and no blank frame. */
  const moved = (frames: { at: number; showing: number }[], at: number) => frames.filter((frame) => Math.abs(frame.at - at) > 1 || frame.showing === 0);

  it("opens a thousand messages at the newest in its first frame, drawing only the newest, then the rest above without moving the view", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed />);
    const { scroller } = list;
    // The first commit draws no more messages than a tall list shows, and reads as many boxes for a thousand as for a hundred.
    expect(messagesOf(scroller).length).toBeLessThanOrEqual(40);
    const short = mount();
    await short.commit(<Switcher open="theo" keyed count={100} />);
    expect(list.reads).toBeLessThanOrEqual(short.reads + 20);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(2);
    const gap = newestGap(scroller);
    expect(moved(await framesUntilDrawn(scroller, () => newestGap(scroller)), gap)).toEqual([]);
    expect(setSize(scroller)).toBe("1000");
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(2);
  });

  it("opens at the newest in its first frame when a thousand messages come after it mounted empty", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed count={0} />);
    await list.commit(<Switcher open="mara" keyed />);
    const { scroller } = list;
    expect(messagesOf(scroller).length).toBeLessThanOrEqual(40);
    expect(list.reads).toBeLessThanOrEqual(400);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(2);
    const gap = newestGap(scroller);
    expect(moved(await framesUntilDrawn(scroller, () => newestGap(scroller)), gap)).toEqual([]);
    expect(setSize(scroller)).toBe("1000");
  });

  it.each([
    ["keyed by conversation", true],
    ["whose messages are replaced", false],
  ])("switches a list %s to another conversation of a thousand at its newest, in its first frame, from anywhere in the one before", async (_, keyed) => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={keyed} />);
    await settle(list.scroller);
    // The reader is up in the middle of the conversation, with "Jump to latest".
    list.scroller.scrollTop = list.scroller.scrollHeight / 2;
    list.scroller.dispatchEvent(new Event("scroll"));
    await settle(list.scroller);
    await expect.element(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    await list.commit(<Switcher open="theo" keyed={keyed} />);
    const { scroller } = list;
    // Only the other conversation's newest, at its end, with nothing to jump to, and the Tab stop on its newest message.
    const drawn = messagesOf(scroller);
    expect(drawn.length).toBeLessThanOrEqual(40);
    expect(drawn.every((message) => message.id.startsWith("theo-"))).toBe(true);
    expect(list.reads).toBeLessThanOrEqual(400);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(2);
    await expect.poll(() => list.host.querySelector("[data-ouro-message-list-jump]")).toBeNull();
    expect(scroller.querySelector('[data-ouro="message"][tabindex="0"]')!.id).toBe("theo-999");
    const gap = newestGap(scroller);
    expect(moved(await framesUntilDrawn(scroller, () => newestGap(scroller)), gap)).toEqual([]);
    expect(setSize(scroller)).toBe("1000");
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(2);
    // History is never announced.
    expect(list.host.querySelector("[data-ouro-message-list-live]")!.textContent).toBe("");
  });

  it("follows the end of the conversation it switched to, with nothing to jump to by its first frame, from where the reader was", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} />);
    await settle(list.scroller);
    list.scroller.scrollTop = list.scroller.scrollHeight / 2;
    list.scroller.dispatchEvent(new Event("scroll"));
    await settle(list.scroller);
    await expect.element(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    await list.commit(<Switcher open="theo" keyed={false} />);
    // Before any observer has spoken: the switch itself took the jump away.
    expect(list.host.querySelector("[data-ouro-message-list-jump]")).toBeNull();
    // The next message to come is followed, as at the end of any conversation, not held where the reader is.
    await list.commit(<Switcher open="theo" keyed={false} items={[...conversation("theo", 1000), { id: "theo-1000", role: "assistant", text: "theo: and one more" }]} />);
    await settle(list.scroller);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
    expect(list.host.querySelector("[data-ouro-message-list-jump]")).toBeNull();
  });

  it.each([true, false])("does not switch on an empty commit, so a focused message that went waits for the next conversation's messages (named: %s)", async (named) => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} count={5} named={named} />);
    await settle(list.scroller);
    const item = list.host.querySelector<HTMLElement>("[role=article], article")!;
    item.focus();
    expect(document.activeElement).toBe(item);
    // Loading: the next conversation named, with nothing of it yet. A switch here would find no message to focus.
    await list.commit(<Switcher open="theo" keyed={false} count={5} named={named} items={[]} />);
    await settle(list.scroller);
    await list.commit(<Switcher open="theo" keyed={false} count={5} named={named} />);
    await settle(list.scroller);
    expect(list.host.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(item);
    expect(document.activeElement?.textContent).toContain("theo");
  });

  it("keeps track of the message focus lands on in the next conversation, after a list that held none, through messages that arrive", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} count={5} />);
    await settle(list.scroller);
    messagesOf(list.scroller).at(-1)!.focus();
    await list.commit(<Switcher open="theo" keyed={false} count={5} items={[]} />);
    await settle(list.scroller);
    await list.commit(<Switcher open="theo" keyed={false} count={5} />);
    await settle(list.scroller);
    expect(list.host.contains(document.activeElement)).toBe(true);
    await list.commit(<Switcher open="theo" keyed={false} count={6} />);
    await settle(list.scroller);
    await list.commit(<Switcher open="theo" keyed={false} count={4} />);
    await settle(list.scroller);
    expect(list.host.contains(document.activeElement)).toBe(true);
  });

  it("moves focus to the message that followed the one that went, in the same conversation", async () => {
    const list = mount();
    const all = conversation("mara", 8);
    await list.commit(<Switcher open="mara" keyed={false} named items={all} />);
    await settle(list.scroller);
    const focused = list.host.querySelector<HTMLElement>(`[id="${all[3]!.id}"]`)!;
    focused.focus();
    await settle(list.scroller);
    expect(document.activeElement).toBe(focused);
    await list.commit(<Switcher open="mara" keyed={false} named items={all.filter((_, at) => at !== 3)} />);
    await settle(list.scroller);
    expect(document.activeElement?.id).toBe(String(all[4]!.id));
  });

  it("keeps track of the message focus lands on when what a list held none of comes back as the same conversation", async () => {
    const list = mount();
    const all = conversation("mara", 6);
    await list.commit(<Switcher open="mara" keyed={false} named items={all} />);
    await settle(list.scroller);
    list.host.querySelector<HTMLElement>(`[id="${all[5]!.id}"]`)!.focus();
    await list.commit(<Switcher open="mara" keyed={false} named items={[]} />);
    await settle(list.scroller);
    await list.commit(<Switcher open="mara" keyed={false} named items={all.slice(0, 5)} />);
    await settle(list.scroller);
    list.host.querySelector<HTMLElement>(`[id="${all[4]!.id}"]`)!.focus();
    await list.commit(<Switcher open="mara" keyed={false} named items={all} />);
    await settle(list.scroller);
    await list.commit(<Switcher open="mara" keyed={false} named items={all.slice(0, 4)} />);
    await settle(list.scroller);
    expect(list.host.contains(document.activeElement)).toBe(true);
  });

  it("does not take focus into the next conversation's messages once the reader has moved focus elsewhere and let go of it", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} count={5} />);
    await settle(list.scroller);
    list.host.querySelector<HTMLElement>("[role=article], article")!.focus();
    await list.commit(<Switcher open="theo" keyed={false} count={5} items={[]} />);
    await settle(list.scroller);
    const outside = document.body.appendChild(document.createElement("button"));
    outside.focus();
    outside.blur();
    expect(document.activeElement).toBe(document.body);
    await list.commit(<Switcher open="theo" keyed={false} count={5} />);
    await settle(list.scroller);
    outside.remove();
    expect(document.activeElement).toBe(document.body);
  });

  it("switches at the newest, drawing only the newest, when what starts every conversation keeps its key and conversation says which", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} welcome named />);
    await settle(list.scroller);
    list.scroller.scrollTop = list.scroller.scrollHeight / 2;
    list.scroller.dispatchEvent(new Event("scroll"));
    await settle(list.scroller);
    await list.commit(<Switcher open="theo" keyed={false} welcome named />);
    expect(messagesOf(list.scroller).length).toBeLessThanOrEqual(40);
    expect(messagesOf(list.scroller).every((message) => message.id.startsWith("theo-"))).toBe(true);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
    await settle(list.scroller);
    expect(messagesOf(list.scroller).at(-1)!.id).toBe("theo-999");
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("opens the next conversation at its newest, drawing only the newest and with focus on it, after the list held none for a while", async () => {
    const list = mount();
    // initialAnchor names a message of the first conversation: it opened there, and has no say in the next.
    await list.commit(<Switcher open="mara" keyed={false} initialAnchor="mara-900" />);
    await settle(list.scroller);
    messagesOf(list.scroller).at(-1)!.focus();
    await list.commit(<Switcher open="mara" keyed={false} initialAnchor="mara-900" count={0} />);
    await settle(list.scroller);
    await list.commit(<Switcher open="theo" keyed={false} initialAnchor="mara-900" />);
    expect(messagesOf(list.scroller).length).toBeLessThanOrEqual(40);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
    await expect.poll(() => document.activeElement?.id).toBe("theo-999");
    await settle(list.scroller);
    expect(setSize(list.scroller)).toBe("1000");
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("keeps focus on the newest message, at the end, when it is replaced under a new key after older messages went in above it", async () => {
    const items = conversation("mara", 1000);
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} items={items} />);
    // Focused while only the newest are drawn: the 40th of 40.
    messagesOf(list.scroller).at(-1)!.focus();
    await settle(list.scroller);
    await list.commit(<Switcher open="mara" keyed={false} items={[...items.slice(0, -1), { ...items.at(-1)!, id: "mara-sent" }]} />);
    await settle(list.scroller);
    await expect.poll(() => document.activeElement?.id).toBe("mara-sent");
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("stays at its end when a picture in a message shrinks and grows back between frames, as a placeholder swapped for its picture does", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} count={60} />);
    await settle(list.scroller);
    // A picture in a message near the end, above the view's bottom.
    const picture = document.createElement("div");
    picture.style.height = "600px";
    messagesOf(list.scroller).at(-3)!.querySelector("[data-ouro-message-content]")!.append(picture);
    await settle(list.scroller);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
    // In one task: the placeholder goes, something reads the layout (an app's layout effect), and the picture comes.
    picture.style.height = "0px";
    void list.scroller.scrollHeight;
    picture.style.height = "600px";
    await settle(list.scroller);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
    expect(list.host.querySelector("[data-ouro-message-list-jump]")).toBeNull();
    // The picture goes for good: the list stays at its end, and keeps no room above the messages once the frame is done.
    picture.remove();
    await settle(list.scroller);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
    const content = list.scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    expect(Math.abs(list.scroller.scrollHeight - content.offsetHeight)).toBeLessThanOrEqual(1);
    // The reader leaves the end, and the message they are on stays where it shows.
    list.scroller.scrollTop -= 200;
    list.scroller.dispatchEvent(new Event("scroll"));
    const before = firstVisible(list.scroller);
    await settle(list.scroller);
    expect(Math.abs(firstVisible(list.scroller).top - before.top)).toBeLessThanOrEqual(1);
    expect(list.host.querySelector("[data-ouro-message-list-jump]")).not.toBeNull();
  });

  it("keeps no floor under content that only fills the view, as a short conversation does, when it opens a conversation", async () => {
    const list = mount();
    const mark = () => list.host.querySelector<HTMLElement>("[data-ouro-message-list-floor]")!;
    const content = () => list.scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    await list.commit(<Switcher open="mara" keyed={false} count={3} />);
    await settle(list.scroller);
    await list.commit(<Switcher open="mari" keyed={false} count={3} />);
    // The content is as tall as the view, no taller: nothing to keep from shrinking.
    expect(content().offsetHeight).toBe(list.scroller.clientHeight);
    expect(mark().style.display).toBe("");
  });

  it("looks again for another conversation only when the first or newest messages change, so a change inside leaves the keys it compares with as they were", async () => {
    const list = mount();
    const mara = conversation("mara", 60);
    const renamed = (items: Item[], from: number, to: number, as: string) => items.map((item, at) => (at >= from && at < to ? { ...item, id: `${as}-${at}` } : item));
    await list.commit(<Switcher open="mara" keyed={false} items={mara} />);
    await settle(list.scroller);
    const inside = renamed(mara, 1, 56, "x");
    await list.commit(<Switcher open="mara" keyed={false} items={inside} />);
    list.scroller.scrollTop = 0;
    list.scroller.dispatchEvent(new Event("scroll"));
    await settle(list.scroller);
    // The first and the newest three change, so the list looks again: the messages share no key with those it held when it last looked.
    const ends = renamed(renamed(inside, 0, 1, "y"), 56, 60, "y");
    await list.commit(<Switcher open="mara" keyed={false} items={ends} />);
    await settle(list.scroller);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("takes messages that are not elements, which have no key, for no sharing of keys with the conversation before", async () => {
    const list = mount();
    const room = (name: string) => (
      <MessageList label="Chat" style={{ height: 300 }}>
        {"Earlier"}
        {conversation(name, 60).map((item) => (
          <Message key={item.id} id={String(item.id)} role={item.role} name={name}>
            {item.text}
          </Message>
        ))}
      </MessageList>
    );
    await list.commit(room("mara"));
    await settle(list.scroller);
    list.scroller.scrollTop = 0;
    list.scroller.dispatchEvent(new Event("scroll"));
    await settle(list.scroller);
    await list.commit(room("theo"));
    await settle(list.scroller);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("does not hold the end again when a change at its end leaves the content as tall as the floor it holds", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} count={60} />);
    await settle(list.scroller);
    const held = vi.spyOn(window, "getComputedStyle");
    messagesOf(list.scroller).at(-1)!.append(document.createComment("nothing to see"));
    await Promise.resolve();
    await Promise.resolve();
    const holds = held.mock.calls.length;
    held.mockRestore();
    expect(holds).toBe(0);
  });

  it("moves focus to the message that came where the focused one was, its temporary key swapped for the server's", async () => {
    const list = mount();
    const all = conversation("mara", 8);
    await list.commit(<Switcher open="mara" keyed={false} named items={all} />);
    await settle(list.scroller);
    list.host.querySelector<HTMLElement>(`[id="${all[3]!.id}"]`)!.focus();
    await settle(list.scroller);
    await list.commit(<Switcher open="mara" keyed={false} named items={all.map((item, at) => (at === 3 ? { ...item, id: "mara-sent" } : item))} />);
    await settle(list.scroller);
    expect(document.activeElement?.id).toBe("mara-sent");
  });

  it("holds a floor in the layout under long content at its end, and lets it out of the layout when the content is short", async () => {
    const list = mount();
    const mark = () => list.host.querySelector<HTMLElement>("[data-ouro-message-list-floor]")!;
    await list.commit(<Switcher open="mara" keyed={false} count={60} />);
    await settle(list.scroller);
    expect(mark().style.display).toBe("block");
    await list.commit(<Switcher open="mari" keyed={false} count={1} />);
    await settle(list.scroller);
    expect(mark().style.display).toBe("");
  });

  it("does not read the content's height when a change at its end moves nothing and no floor is held", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} count={3} />);
    await settle(list.scroller);
    const content = list.scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get");
    messagesOf(list.scroller).at(-1)!.append(document.createComment("nothing to see"));
    await Promise.resolve();
    await Promise.resolve();
    const reads = height.mock.contexts.filter((on) => on === content).length;
    height.mockRestore();
    expect(reads).toBe(0);
  });

  it("opens at its end, before the browser draws, when its messages come after it mounted empty", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} items={[]} />);
    await list.commit(<Switcher open="mara" keyed={false} count={60} />);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  /** Scrolls the list up from its end by `by`, as a reader does, and waits for it to settle. */
  async function upBy(scroller: HTMLElement, by: number) {
    scroller.scrollTop -= by;
    scroller.dispatchEvent(new Event("scroll"));
    await settle(scroller);
  }

  it("keeps the reader's place, the messages and focus when the newest three get new keys in place, while scrolled up", async () => {
    const items = conversation("mara", 200);
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} items={items} />);
    await settle(list.scroller);
    await upBy(list.scroller, 250);
    const reading = firstVisible(list.scroller);
    (reading.message as HTMLElement).focus({ preventScroll: true });
    const top = list.scroller.scrollTop;
    // Temporary ids swapped for the server's, with the same text.
    await list.commit(<Switcher open="mara" keyed={false} items={items.map((item, at) => (at >= 197 ? { ...item, id: `${item.id}-sent` } : item))} />);
    await settle(list.scroller);
    expect(setSize(list.scroller)).toBe("200");
    expect(list.scroller.scrollTop).toBe(top);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(1);
    expect(document.activeElement).toBe(reading.message);
    expect(list.host.querySelector("[data-ouro-message-list-jump]")).not.toBeNull();
  });

  it("takes removing the newest five, as a regenerated turn does, for the same conversation", async () => {
    const items = conversation("mara", 200);
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} items={items} />);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    const reading = firstVisible(list.scroller);
    await list.commit(<Switcher open="mara" keyed={false} items={items.slice(0, -5)} />);
    await settle(list.scroller);
    // No switch: the place is kept, within what windowing moves as it measures again (it does not go to the end).
    expect(setSize(list.scroller)).toBe("195");
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(8);
  });

  it("takes a switch from conversation alone: one whose messages share keys with the last is a switch, and messages re-keyed in the same one are not", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named byIndex />);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    // Keyed by place in both, 0 to 999 and 0 to 899: no key is new, so only conversation says it is another one.
    await list.commit(<Switcher open="theo" keyed={false} named byIndex count={900} />);
    expect(messagesOf(list.scroller).length).toBeLessThanOrEqual(40);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    const reading = firstVisible(list.scroller);
    // Every message of the same conversation re-keyed at once: no switch. Windowing holds a place by a child's key, so the new keys
    // cost it a few pixels as the measured heights are replaced (3 to 4 px measured), which the 8 px allows.
    await list.commit(<Switcher open="theo" keyed={false} named count={900} />);
    await settle(list.scroller);
    expect(setSize(list.scroller)).toBe("900");
    expect(Math.abs(firstVisible(list.scroller).top - reading.top)).toBeLessThanOrEqual(8);
    expect(firstVisible(list.scroller).message.id).toBe(reading.message.id);
  });

  it("switches when the conversation is named before its messages come, as an app that keeps the last messages while it fetches does", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named />);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    const reading = firstVisible(list.scroller);
    (reading.message as HTMLElement).focus({ preventScroll: true });
    // Named first, with the last conversation's messages still showing: nothing moves yet.
    await list.commit(<Switcher open="mara" keyed={false} called="theo" />);
    await settle(list.scroller);
    expect(setSize(list.scroller)).toBe("1000");
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(1);
    expect(document.activeElement).toBe(reading.message);
    // A message comes in the conversation still showing: still nothing moves, and the name still waits.
    await list.commit(<Switcher open="mara" keyed={false} called="theo" items={[...conversation("mara", 1000), { id: "mara-new", role: "assistant", text: "A reply." }]} />);
    await settle(list.scroller);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(1);
    expect(setSize(list.scroller)).toBe("1001");
    // Its messages come: it opens at their newest, drawing only the newest, with focus on the newest in view.
    await list.commit(<Switcher open="theo" keyed={false} named />);
    expect(messagesOf(list.scroller).length).toBeLessThanOrEqual(40);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
    await expect.poll(() => document.activeElement?.id).toBe("theo-999");
    await settle(list.scroller);
    expect(setSize(list.scroller)).toBe("1000");
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("takes messages that come before their conversation is named for the last one's, and opens nothing when it is named after them", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named />);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    // The other conversation's messages, still under the last one's name: the same conversation, as far as the list can tell.
    await list.commit(<Switcher open="theo" keyed={false} called="mara" />);
    await settle(list.scroller);
    expect(setSize(list.scroller)).toBe("1000");
    const top = list.scroller.scrollTop;
    // Named a commit later: it names the messages the list holds, so nothing moves, now or as the next message comes.
    await list.commit(<Switcher open="theo" keyed={false} named />);
    await settle(list.scroller);
    expect(list.scroller.scrollTop).toBe(top);
    expect(setSize(list.scroller)).toBe("1000");
    await list.commit(<Switcher open="theo" keyed={false} named items={[...conversation("theo", 1000), { id: "theo-new", role: "assistant", text: "A reply." }]} />);
    await settle(list.scroller);
    expect(list.scroller.scrollTop).toBe(top);
    expect(setSize(list.scroller)).toBe("1001");
  });

  it("adopts a name that comes after its messages, so switching back in one commit opens the last conversation at its newest", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named />);
    await settle(list.scroller);
    // Theo's messages come under Mara's name, then Theo is named.
    await list.commit(<Switcher open="theo" keyed={false} called="mara" />);
    await settle(list.scroller);
    await list.commit(<Switcher open="theo" keyed={false} named />);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    (firstVisible(list.scroller).message as HTMLElement).focus({ preventScroll: true });
    // Back to Mara, her name and her messages together.
    await list.commit(<Switcher open="mara" keyed={false} named />);
    expect(messagesOf(list.scroller).length).toBeLessThanOrEqual(40);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
    await expect.poll(() => document.activeElement?.id).toBe("mara-999");
    await settle(list.scroller);
    expect(setSize(list.scroller)).toBe("1000");
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("adopts a conversation first named for the messages it holds, leaving a scrolled-up reader where they are", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} count={200} />);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    const reading = firstVisible(list.scroller);
    // A new chat gets its id from the server.
    await list.commit(<Switcher open="mara" keyed={false} count={200} named />);
    await settle(list.scroller);
    expect(setSize(list.scroller)).toBe("200");
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(1);
    expect(list.host.querySelector("[data-ouro-message-list-jump]")).not.toBeNull();
    // Named back and forth before another's messages come: nothing waits, and nothing moves.
    await list.commit(<Switcher open="mara" keyed={false} count={200} called="theo" />);
    await list.commit(<Switcher open="mara" keyed={false} count={200} named />);
    await list.commit(<Switcher open="mara" keyed={false} items={[...conversation("mara", 200), { id: "mara-new", role: "assistant", text: "A reply." }]} named />);
    await settle(list.scroller);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(1);
  });

  it("opens a conversation named while the list holds no messages at its newest as they come", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named />);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    await list.commit(<Switcher open="mara" keyed={false} named count={0} />);
    await list.commit(<Switcher open="mara" keyed={false} called="theo" count={0} />);
    await list.commit(<Switcher open="theo" keyed={false} named />);
    expect(messagesOf(list.scroller).length).toBeLessThanOrEqual(40);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("opens the messages that come with a conversation first named, when they share no key with those it held", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} count={200} />);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    await list.commit(<Switcher open="theo" keyed={false} named />);
    expect(messagesOf(list.scroller).length).toBeLessThanOrEqual(40);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("lets go of a message that went once focus lands elsewhere, so a message that comes later never takes focus", async () => {
    const composer = (disabled: boolean) => <textarea aria-label="Reply" disabled={disabled} />;
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} count={30}>{composer(false)}</Switcher>);
    await settle(list.scroller);
    messagesOf(list.scroller).at(-1)!.focus();
    await list.commit(<Switcher open="mara" keyed={false} count={0}>{composer(false)}</Switcher>);
    // The reader goes to the composer, and the next conversation comes.
    list.host.querySelector("textarea")!.focus();
    await list.commit(<Switcher open="theo" keyed={false} count={30}>{composer(false)}</Switcher>);
    await settle(list.scroller);
    // The composer is disabled while a reply streams: focus falls to the page, and a new message comes.
    await list.commit(<Switcher open="theo" keyed={false} count={30}>{composer(true)}</Switcher>);
    await expect.poll(() => document.activeElement).toBe(document.body);
    await list.commit(<Switcher open="theo" keyed={false} items={[...conversation("theo", 30), { id: "theo-new", role: "assistant", text: "A reply." }]}>{composer(true)}</Switcher>);
    await settle(list.scroller);
    expect(document.activeElement).toBe(document.body);
  });

  it("moves focus from the first message, replaced under a new key, to its replacement", async () => {
    const items = conversation("mara", 10);
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} items={items} />);
    await settle(list.scroller);
    messagesOf(list.scroller)[0]!.focus();
    await list.commit(<Switcher open="mara" keyed={false} items={[{ ...items[0]!, id: "mara-first" }, ...items.slice(1)]} />);
    await expect.poll(() => document.activeElement?.id).toBe("mara-first");
  });

  it("lets go of a message that went when the same conversation's messages come back, which is no switch", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named count={30} />);
    await settle(list.scroller);
    messagesOf(list.scroller).at(-1)!.focus();
    await list.commit(<Switcher open="mara" keyed={false} named count={0} />);
    expect(document.activeElement).toBe(document.body);
    await list.commit(<Switcher open="mara" keyed={false} named count={30} />);
    await settle(list.scroller);
    expect(document.activeElement).toBe(document.body);
  });

  it("tells a reveal still on its way that it found nothing when the list switches, and opens the next conversation at its newest", async () => {
    const actions: { current: MessageListActions | null } = { current: null };
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} actions={actions} />);
    await settle(list.scroller);
    let found: boolean | undefined;
    // Far up, not drawn: on its way when the switch comes in the same task.
    void actions.current!.reveal("mara-10").then((result) => (found = result));
    await list.commit(<Switcher open="theo" keyed={false} actions={actions} />);
    await expect.poll(() => found).toBe(false);
    await settle(list.scroller);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("moves focus on a message of the conversation before to the newest in view of the next, without scrolling", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} count={200} />);
    await settle(list.scroller);
    messagesOf(list.scroller).at(-3)!.focus();
    await settle(list.scroller);
    await list.commit(<Switcher open="theo" keyed={false} count={200} />);
    await expect.poll(() => document.activeElement?.id).toBe("theo-199");
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
    await settle(list.scroller);
    await expect.poll(() => document.activeElement?.id).toBe("theo-199");
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("keeps the reader's place, and opens nothing, when every message in view gets a new key in place and the rest keep theirs", async () => {
    const items = conversation("mara", 200);
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} count={200} />);
    const { scroller } = list;
    await settle(scroller);
    scroller.scrollTop = scroller.scrollHeight / 2;
    scroller.dispatchEvent(new Event("scroll"));
    await settle(scroller);
    const before = firstVisible(scroller);
    const view = scroller.getBoundingClientRect();
    // The messages in view: a temporary id each, swapped for the server's.
    const swapped = new Set(messagesOf(scroller).filter((message) => message.getBoundingClientRect().bottom > view.top && message.getBoundingClientRect().top < view.bottom).map((message) => message.id));
    await list.commit(<Switcher open="mara" keyed={false} items={items.map((item) => (swapped.has(String(item.id)) ? { ...item, id: `${item.id}-sent` } : item))} />);
    await settle(scroller);
    const after = firstVisible(scroller);
    expect(after.message.textContent).toBe(before.message.textContent);
    expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
    expect(list.host.querySelector("[data-ouro-message-list-jump]")).not.toBeNull();
  });

  it("opens at initialAnchor far back in a thousand messages, drawing from it, and holds it still as the rest go in above", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed initialAnchor="mara-300" />);
    const { scroller } = list;
    expect(messagesOf(scroller).length).toBeLessThanOrEqual(40);
    const anchor = () => document.getElementById("mara-300")!.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const at = anchor();
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(scroller.clientHeight);
    expect(moved(await framesUntilDrawn(scroller, anchor), at)).toEqual([]);
    expect(setSize(scroller)).toBe("1000");
  });
});
