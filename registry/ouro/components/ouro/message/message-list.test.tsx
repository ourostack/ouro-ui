import { type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
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
  id: number;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}

const history = (count: number): Item[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index,
    role: index % 2 ? "assistant" : "user",
    text: `Message ${index}: ${"step ".repeat(12)}`,
  }));

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
