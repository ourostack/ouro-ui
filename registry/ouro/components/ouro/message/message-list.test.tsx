import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

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
      const { scroller } = await render(<Chat items={history(20)} />);
      expect(scroller.getAttribute("tabindex")).toBe("0");
      expect(getComputedStyle(scroller).outlineStyle).toBe("solid");
      expect(parseFloat(getComputedStyle(scroller).outlineWidth)).toBeGreaterThan(0);
    } finally {
      await commands.emulateMedia({ forcedColors: "none" });
    }
  });

  it("is a named, keyboard-scrollable region that opens at the newest message", async () => {
    const { scroller } = await render(<Chat items={history(20)} />);
    await expect.element(page.getByRole("region", { name: "Conversation" })).toBeVisible();
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(scroller.getAttribute("tabindex")).toBe("0");
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
    // Focus moves to the list, not to <body>, when the button goes.
    expect(document.activeElement).toBe(scroller);

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
