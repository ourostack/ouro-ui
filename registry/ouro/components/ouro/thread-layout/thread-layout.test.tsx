import { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadLayout, type ThreadLayoutProps } from "@/registry/ouro/components/ouro/thread-layout/thread-layout";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { ThreadRail } from "@/registry/ouro/components/ouro/thread-rail/thread-rail";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

async function render(node: ReactNode, width = 640) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get layout() {
      return host.querySelector<HTMLElement>('[data-ouro="thread-layout"]')!;
    },
    get conversation() {
      return host.querySelector<HTMLElement>("[data-test-conversation]")!.parentElement!.parentElement!;
    },
    get rail() {
      return host.querySelector<HTMLElement>('[data-ouro="thread-rail"]');
    },
  };
}

/** The conversation's list and reply box, which every test here mounts. */
function Conversation() {
  return (
    <div data-test-conversation="">
      <p>Design reviews</p>
      <textarea aria-label="Draft" />
    </div>
  );
}

/** A thread open beside the conversation, without taking focus, so a test keeps its focus where it put it. */
function Thread() {
  return (
    <ThreadRail label="Thread" title="Replies" autoFocus={false} onClose={() => {}}>
      <p>Meet at eight.</p>
    </ThreadRail>
  );
}

const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

describe("ThreadLayout", () => {
  it("keeps its thread panel 320px wide once the layout is wide enough, at a compact --spacing", async () => {
    const { host } = await render(<ThreadLayout conversation={<p>Replies</p>} thread={<p data-thread="">Thread</p>} />);
    host.style.width = "800px";
    const panel = () => getComputedStyle(host.querySelector<HTMLElement>("[data-thread]")!.parentElement!);
    expect(panel().maxWidth).toBe("320px");
    host.style.setProperty("--spacing", "0.2rem");
    expect(panel().maxWidth).toBe("320px");
  });
  it("is marked with data-ouro and draws no control of its own", async () => {
    const { layout } = await render(<ThreadLayout conversation={<p>Replies</p>} thread={null} />);
    expect(layout.getAttribute("data-ouro")).toBe("thread-layout");
    expect(layout.hasAttribute("data-ouro-control")).toBe(false);
    expect(layout.querySelector("[data-ouro-control]")).toBeNull();
  });

  it("puts the conversation and the rail side by side from 32rem up, the rail at 20rem", async () => {
    const { conversation, rail } = await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} />, 640);
    expect(getComputedStyle(conversation).display).not.toBe("none");
    expect(rail).not.toBeNull();
    const railBox = rail!.getBoundingClientRect();
    expect(railBox.width).toBeCloseTo(20 * rem(), 0);
    expect(conversation.getBoundingClientRect().right).toBeCloseTo(railBox.left, 0);
    expect(conversation.getBoundingClientRect().width).toBeCloseTo(640 - 20 * rem(), 0);
  });

  it("gives the conversation and the rail the box's height, so each fills it", async () => {
    const { host, layout, conversation, rail } = await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} />, 640);
    host.style.height = "300px";
    await expect.poll(() => rail!.getBoundingClientRect().height).toBeCloseTo(300, 0);
    expect(layout.getBoundingClientRect().height).toBeCloseTo(300, 0);
    expect(conversation.getBoundingClientRect().height).toBeCloseTo(300, 0);
  });

  it("gives the rail the whole box below 32rem, and hides the conversation", async () => {
    const { conversation, rail } = await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} />, 360);
    expect(getComputedStyle(conversation).display).toBe("none");
    expect(rail!.getBoundingClientRect().width).toBeCloseTo(360, 0);
    expect(rail!.getBoundingClientRect().left).toBeCloseTo(conversation.getBoundingClientRect().left, 0);
  });

  it("separates the rail with a surface step instead of a line at both widths", async () => {
    const { host, rail } = await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} />, 640);
    const surface = document.createElement("div");
    surface.style.backgroundColor = "var(--accent)";
    host.append(surface);
    expect(getComputedStyle(rail!).backgroundColor).toBe(getComputedStyle(surface).backgroundColor);
    expect(getComputedStyle(rail!).borderInlineStartWidth).toBe("0px");
    host.style.width = "360px";
    await expect.poll(() => getComputedStyle(rail!).borderInlineStartWidth).toBe("0px");
  });

  it.each(["light", "dark"])("keeps a surface step beside a plain or scrolling conversation (%s)", async (scheme) => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.toggle("dark", scheme === "dark");
    const thread = (
      <ThreadRail label="Thread" autoFocus={false} onClose={() => {}}>
        <MessageList label="Replies" className="min-h-0 flex-1">
          <Message role="assistant" name="Assistant">A reply</Message>
        </MessageList>
      </ThreadRail>
    );
    try {
      const { host, rerender } = await render(<ThreadLayout conversation={<Conversation />} thread={thread} />, 800);
      host.style.height = "400px";
      const pane = host.querySelector<HTMLElement>("[data-ouro-thread-layout-conversation]")!;
      const rail = host.querySelector<HTMLElement>('[data-ouro="thread-rail"]')!;
      const railScroller = () => host.querySelector<HTMLElement>('[data-ouro="thread-rail"] [data-ouro-message-list-scroller]')!;
      const surface = document.createElement("div");
      surface.style.backgroundColor = "var(--background)";
      host.append(surface);
      expect(getComputedStyle(pane).backgroundColor).toBe(getComputedStyle(surface).backgroundColor);
      expect(getComputedStyle(pane).backgroundColor).not.toBe(getComputedStyle(rail).backgroundColor);

      await rerender(
        <ThreadLayout
          conversation={<MessageList label="Conversation"><Message role="assistant" name="Assistant">A note</Message></MessageList>}
          thread={thread}
        />,
      );
      const conversationScroller = pane.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
      expect(getComputedStyle(conversationScroller).backgroundColor).not.toBe(getComputedStyle(railScroller()).backgroundColor);
      expect(pane.getBoundingClientRect().right - conversationScroller.getBoundingClientRect().right).toBeGreaterThanOrEqual(20);
    } finally {
      root.classList.toggle("dark", wasDark);
    }
  });

  it("keeps the conversation mounted and its draft while a narrow box hides it", async () => {
    const { host, conversation, rerender } = await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} />, 640);
    const draft = host.querySelector("textarea")!;
    draft.value = "Hold this thought";
    host.style.width = "360px";
    await expect.poll(() => getComputedStyle(conversation).display).toBe("none");
    expect(host.querySelector("textarea")).toBe(draft);
    expect(draft.value).toBe("Hold this thought");
    host.style.width = "640px";
    await expect.poll(() => getComputedStyle(conversation).display).not.toBe("none");
    expect(host.querySelector("textarea")).toBe(draft);
    await rerender(<ThreadLayout conversation={<Conversation />} thread={null} />);
    expect(host.querySelector("textarea")).toBe(draft);
    expect(draft.value).toBe("Hold this thought");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["false", false],
  ])("shows the conversation alone at any width when thread is %s", async (_name, thread) => {
    const { conversation, rail } = await render(<ThreadLayout conversation={<Conversation />} thread={thread} />, 360);
    expect(getComputedStyle(conversation).display).not.toBe("none");
    expect(conversation.getBoundingClientRect().width).toBeCloseTo(360, 0);
    expect(rail).toBeNull();
  });

  it("keeps the conversation's element when a thread opens and closes", async () => {
    const { host, rerender } = await render(<ThreadLayout conversation={<Conversation />} thread={null} />, 640);
    const before = host.querySelector("textarea");
    await rerender(<ThreadLayout conversation={<Conversation />} thread={<Thread />} />);
    expect(host.querySelector("textarea")).toBe(before);
    await rerender(<ThreadLayout conversation={<Conversation />} thread={null} />);
    expect(host.querySelector("textarea")).toBe(before);
  });

  it("gives focus back to the conversation's control that opened the thread, once a narrow box shows it again", async () => {
    function Opened({ open }: { open: boolean }) {
      return (
        <ThreadLayout
          conversation={<button type="button">Show thread</button>}
          thread={open ? <ThreadRail label="Thread" title="Replies" onClose={() => {}}><p>Meet at eight.</p></ThreadRail> : null}
        />
      );
    }
    const { host, rail, rerender } = await render(<Opened open={false} />, 360);
    expect(rail).toBeNull();
    const opener = host.querySelector("button")!;
    opener.focus();
    await rerender(<Opened open />);
    expect(host.querySelector('[data-ouro="thread-rail"]')!.contains(document.activeElement)).toBe(true);
    await rerender(<Opened open={false} />);
    expect(document.activeElement).toBe(opener);
  });

  it("gives focus back to the conversation's control that opened the thread without scrolling the page to it", async () => {
    // The opener sits far down a tall conversation (an earlier message's "N replies" button), so the browser's own
    // scroll-into-view on focus would move the page away from the newest message, were it not held back.
    function Opened({ open }: { open: boolean }) {
      return (
        <ThreadLayout
          conversation={
            <div style={{ height: 2000 }}>
              <button type="button">Show thread</button>
            </div>
          }
          thread={open ? <ThreadRail label="Thread" title="Replies" onClose={() => {}}><p>Meet at eight.</p></ThreadRail> : null}
          className="h-[2000px]"
        />
      );
    }
    const { host, rerender } = await render(<Opened open={false} />, 360);
    host.style.height = "200px";
    host.style.overflow = "auto";
    const opener = host.querySelector("button")!;
    opener.focus();
    await rerender(<Opened open />);
    // The reader scrolled the page to the newest message while the thread covered the conversation.
    host.scrollTop = 1000;
    await rerender(<Opened open={false} />);
    expect(document.activeElement).toBe(opener);
    expect(host.scrollTop).toBe(1000);
  });

  it.each([360, 640])("moves focus to the conversation's heading when a thread closes that nothing in the conversation opened (%dpx)", async (width) => {
    const rail = (open: boolean) => (open ? <ThreadRail label="Thread" title="Replies" onClose={() => {}}><p>Meet at eight.</p></ThreadRail> : null);
    const conversation = (
      <>
        <h2>Design reviews</h2>
        <button type="button">Show thread</button>
      </>
    );
    const { host, rerender } = await render(<ThreadLayout conversation={conversation} thread={rail(true)} />, width);
    expect(host.querySelector('[data-ouro="thread-rail"]')!.contains(document.activeElement)).toBe(true);
    await rerender(<ThreadLayout conversation={conversation} thread={rail(false)} />);
    expect(document.activeElement).toBe(host.querySelector("h2"));
    expect(host.querySelector("h2")!.tabIndex).toBe(-1);
  });

  it("moves focus to the conversation pane, named, when a thread closes that nothing opened and the conversation has no heading", async () => {
    const rail = (open: boolean) => (open ? <ThreadRail label="Thread" title="Replies" onClose={() => {}}><p>Meet at eight.</p></ThreadRail> : null);
    const conversation = <button type="button">Show thread</button>;
    const { host, rerender } = await render(<ThreadLayout conversation={conversation} conversationLabel="Design reviews" thread={rail(true)} />, 360);
    await rerender(<ThreadLayout conversation={conversation} conversationLabel="Design reviews" thread={rail(false)} />);
    const pane = host.querySelector<HTMLElement>('[role="region"][aria-label="Design reviews"]')!;
    expect(document.activeElement).toBe(pane);
    // Out of the tab order: only a script takes focus there.
    expect(pane.tabIndex).toBe(-1);
    expect(pane.contains(host.querySelector("button"))).toBe(true);
  });

  it.each([
    ["one inside a message", <MessageList key="list" label="Messages"><Message role="user" name="Ana"><h3>Agenda</h3></Message></MessageList>],
    ["a hidden one", <h2 key="hidden" hidden>Design reviews</h2>],
    ["a hidden one with a tabindex of its own", <h2 key="own" hidden tabIndex={0}>Design reviews</h2>],
  ])("moves focus to the pane, not to %s, when a thread closes that nothing opened", async (_, conversation) => {
    const rail = (open: boolean) => (open ? <ThreadRail label="Thread" title="Replies" onClose={() => {}}><p>Meet at eight.</p></ThreadRail> : null);
    const { host, rerender } = await render(<ThreadLayout conversation={conversation} thread={rail(true)} />, 640);
    await rerender(<ThreadLayout conversation={conversation} thread={rail(false)} />);
    expect(document.activeElement).toBe(host.querySelector('[role="region"][aria-label="Conversation pane"]'));
    // The heading keeps the tabindex it had, or none.
    expect(host.querySelector("h2, h3")!.getAttribute("tabindex")).toBe(_.includes("of its own") ? "0" : null);
  });

  it("moves focus to the conversation's heading without scrolling the page to it", async () => {
    const title = <h2>Design reviews</h2>;
    const rail = (open: boolean) => (open ? <ThreadRail label="Thread" title="Replies" onClose={() => {}}><p>Meet at eight.</p></ThreadRail> : null);
    // A layout taller than the box that scrolls it, scrolled past the conversation's top.
    const { host, rerender } = await render(<ThreadLayout conversation={title} thread={rail(true)} className="h-[2000px]" />, 640);
    host.style.height = "200px";
    host.style.overflow = "auto";
    host.scrollTop = 1000;
    await rerender(<ThreadLayout conversation={title} thread={rail(false)} className="h-[2000px]" />);
    expect(document.activeElement).toBe(host.querySelector("h2"));
    expect(host.scrollTop).toBe(1000);
  });

  it("keeps a heading's own tabindex when it moves focus to it", async () => {
    const rail = (open: boolean) => (open ? <ThreadRail label="Thread" title="Replies" onClose={() => {}}><p>Meet at eight.</p></ThreadRail> : null);
    const conversation = <h2 tabIndex={0}>Design reviews</h2>;
    const { host, rerender } = await render(<ThreadLayout conversation={conversation} thread={rail(true)} />, 640);
    await rerender(<ThreadLayout conversation={conversation} thread={rail(false)} />);
    expect(document.activeElement).toBe(host.querySelector("h2"));
    expect(host.querySelector("h2")!.tabIndex).toBe(0);
  });

  it("forgets that a closed thread held focus once its opener took it back, so a later thread that opens without focus takes none", async () => {
    function Opened({ open, focus = true }: { open: boolean; focus?: boolean }) {
      return (
        <ThreadLayout
          conversation={
            <>
              <h2>Design reviews</h2>
              <button type="button">Show thread</button>
            </>
          }
          thread={open ? <ThreadRail label="Thread" title="Replies" autoFocus={focus} onClose={() => {}}><p>Meet at eight.</p></ThreadRail> : null}
        />
      );
    }
    const { host, rerender } = await render(<Opened open={false} />, 640);
    host.querySelector("button")!.focus();
    await rerender(<Opened open />);
    await rerender(<Opened open={false} />);
    expect(document.activeElement).toBe(host.querySelector("button"));
    (document.activeElement as HTMLElement).blur();
    await rerender(<Opened open focus={false} />);
    expect(document.activeElement).toBe(document.body);
    // It closes as it opened, holding no focus: focus goes back to the conversation's last control, as before.
    await rerender(<Opened open={false} />);
    expect(document.activeElement).toBe(host.querySelector("button"));
  });

  it("leaves focus on the page when it first shows without a thread, and when a thread opens without taking focus and closes", async () => {
    const conversation = <h2>Design reviews</h2>;
    const { rerender } = await render(<ThreadLayout conversation={conversation} thread={null} />, 640);
    expect(document.activeElement).toBe(document.body);
    await rerender(<ThreadLayout conversation={conversation} thread={<Thread />} />);
    expect(document.activeElement).toBe(document.body);
    await rerender(<ThreadLayout conversation={conversation} thread={null} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves focus on the page when a thread opens without taking it", async () => {
    const conversation = <button type="button">Show thread</button>;
    const { host, rerender } = await render(<ThreadLayout conversation={conversation} thread={null} />, 640);
    const opener = host.querySelector("button")!;
    opener.focus();
    opener.blur();
    await rerender(<ThreadLayout conversation={conversation} thread={<Thread />} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves focus where it is when a thread closes and focus is not lost", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    mounted.push(outside);
    const { host, rerender } = await render(<ThreadLayout conversation={<button type="button">Show thread</button>} thread={<Thread />} />, 360);
    host.querySelector("button")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    outside.focus();
    await rerender(<ThreadLayout conversation={<button type="button">Show thread</button>} thread={null} />);
    expect(document.activeElement).toBe(outside);
  });

  it("takes the app's className last, so its height wins", async () => {
    const { layout } = await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} className="h-[200px]" />);
    expect(layout.getBoundingClientRect().height).toBeCloseTo(200, 0);
  });
});

describe("ThreadLayout dev messages", () => {
  it("warns, quoting the class, when className sets appearance", async () => {
    await render(<ThreadLayout conversation={<Conversation />} className="bg-red-500" />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toBe(
      '[ouro-ui] ThreadLayout: "bg-red-500" sets appearance, and className is for layout only. Fix: remove "bg-red-500"; the theme sets the colors of the panes ThreadLayout holds.',
    );
  });

  it("warns that rail is not a prop, with the fix", async () => {
    const guessed = { conversation: <Conversation />, rail: <Thread /> } as unknown as ThreadLayoutProps;
    await render(<ThreadLayout {...guessed} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toBe(
      '[ouro-ui] ThreadLayout: rail is not a prop; the thread takes its place. Fix: <ThreadLayout conversation={list} thread={open ? <ThreadRail label="Thread" onClose={close} /> : null} />.',
    );
  });

  it("does not warn for a layout className or for a thread", async () => {
    await render(<ThreadLayout conversation={<Conversation />} thread={<Thread />} className="w-full max-w-3xl" />);
    expect(warn).not.toHaveBeenCalled();
  });
});
