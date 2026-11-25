import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList, type MessageListActions } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

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

const distanceFromBottom = (scroller: HTMLElement) => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

/** Waits until the scroll position reads the same across two frames, and no message springs. */
async function settle(scroller: HTMLElement) {
  let last = -1;
  await expect
    .poll(
      async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const same = scroller.scrollTop === last;
        last = scroller.scrollTop;
        return same;
      },
      { interval: 0 },
    )
    .toBe(true);
  // And the messages have come to rest from the springs, so where each is drawn is where it is laid out.
  await expect.poll(() => scroller.querySelector("[data-ouro-settling]"), { interval: 16 }).toBeNull();
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
    rekey = "",
    windowing,
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
    /** Prefixed to each message's key, which changes every key and no id: the same messages, re-keyed. */
    rekey?: string;
    /** What follows the list, such as a composer. */
    children?: ReactNode;
    actions?: { current: MessageListActions | null };
    windowing?: boolean;
  }) {
    return (
      <>
      <MessageList key={keyed ? open : undefined} label={`Chat with ${open}`} style={{ height: 300 }} initialAnchor={initialAnchor} conversation={called ?? (named ? open : undefined)} actionsRef={actions} windowing={windowing}>
        {welcome && <p key="welcome">The start of your conversation</p>}
        {items.map((item, at) => (
          <Message key={byIndex ? at : `${rekey}${item.id}`} id={String(item.id)} role={item.role} name={item.role === "user" ? "Ana" : open}>
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
    // A list drawn once before, so the lists below start as lists do in a page that has drawn one.
    const warm = mount();
    await warm.commit(<Switcher open="mara" keyed />);
    await settle(warm.scroller);
    await warm.commit(<div />);
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

  it("switches to a conversation at the message initialAnchor names, away from the end, or at the end when it names the newest", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} />);
    await settle(list.scroller);
    await list.commit(<Switcher open="theo" keyed={false} initialAnchor="theo-500" />);
    await settle(list.scroller);
    expect(messagesOf(list.scroller).some((message) => message.id === "theo-500")).toBe(true);
    expect(distanceFromBottom(list.scroller)).toBeGreaterThan(2);
    await list.commit(<Switcher open="ana" keyed={false} initialAnchor="ana-999" />);
    await settle(list.scroller);
    expect(messagesOf(list.scroller).at(-1)!.id).toBe("ana-999");
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

  it("opens a conversation with its newest message in view in the first frame when its long messages fold shorter in the same task, as behind See more", async () => {
    // A message that, once drawn, measures itself and folds to two lines when it is longer: a render that comes after the list
    // opened at its end.
    function Folding({ text }: { text: string }) {
      const ref = useRef<HTMLDivElement>(null);
      const [folded, setFolded] = useState(false);
      useLayoutEffect(() => setFolded(ref.current!.offsetHeight > 40), []);
      return (
        <div ref={ref} style={folded ? { maxHeight: 40, overflow: "hidden" } : undefined}>
          {text}
        </div>
      );
    }
    const items = conversation("mara", 20);
    const list = mount();
    // What the first frame after the press shows, read as an app's own frame callback reads it: before the browser lays out.
    const first = new Promise<{ end: number; newest: boolean }>((resolve) =>
      requestAnimationFrame(() => {
        const view = list.scroller.getBoundingClientRect();
        const newest = document.getElementById(String(items.at(-1)!.id))!.getBoundingClientRect();
        const content = list.scroller.querySelector("[data-ouro-message-list-content]")!.getBoundingClientRect();
        resolve({ end: content.bottom - view.bottom, newest: newest.top >= view.top && newest.bottom <= view.bottom });
      }),
    );
    await list.commit(
      <MessageList key="mara" label="Chat with mara" style={{ height: 300 }}>
        {items.map((item) => (
          <Message key={item.id} id={String(item.id)} role={item.role} name="mara">
            <Folding text={`${item.text} ${"and more of it ".repeat(40)}`} />
          </Message>
        ))}
      </MessageList>,
    );
    const frame = await first;
    expect(Math.abs(frame.end)).toBeLessThanOrEqual(1);
    expect(frame.newest).toBe(true);
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
    // Every message of the same conversation re-keyed at once: no switch, and the place is held (a named conversation carries its measured heights over).
    await list.commit(<Switcher open="theo" keyed={false} named count={900} />);
    await settle(list.scroller);
    expect(setSize(list.scroller)).toBe("900");
    expect(Math.abs(firstVisible(list.scroller).top - reading.top)).toBeLessThanOrEqual(1);
    expect(firstVisible(list.scroller).message.id).toBe(reading.message.id);
  });

  it("forgets the place it was read at when it switches to a conversation that shares its keys, and opens that one at its newest", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named byIndex />);
    await settle(list.scroller);
    await upBy(list.scroller, 30000);
    const reading = firstVisible(list.scroller).message as HTMLElement;
    const at = reading.id.slice("mara-".length);
    expect(Number(at)).toBeLessThan(850);
    reading.focus({ preventScroll: true });
    expect(document.activeElement).toBe(reading);
    await list.commit(<Switcher open="theo" keyed={false} named byIndex count={900} />);
    const drawn = messagesOf(list.scroller);
    expect(drawn.length).toBeLessThanOrEqual(40);
    expect(drawn.map((message) => message.id)).not.toContain(`theo-${at}`);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
    expect(list.scroller.parentElement!.querySelector("button")).toBeNull();
  });

  it("opens a conversation whole from its first message, though a page of older messages was still coming into the one before it", async () => {
    const list = mount();
    const older = (name: string, count: number): Item[] => conversation(name, count);
    const mara = conversation("mara", 30);
    await list.commit(<Switcher windowing={false} open="mara" keyed={false} named items={mara} />);
    // Older messages arrive: the first moves up, and the edge steps toward it a frame at a time.
    await list.commit(<Switcher windowing={false} open="mara" keyed={false} named items={[...older("old", 30), ...mara]} />);
    // Another conversation comes, with the first message that was drawn after its own first twenty-five.
    const theo = [...conversation("theo", 25), mara[0]!, ...conversation("theo-end", 14)];
    await list.commit(<Switcher windowing={false} open="theo" keyed={false} named items={theo} />);
    expect(messagesOf(list.scroller)[0]!.id).toBe("theo-0");
  });

  it("draws the next conversation from its newest in the commit of a switch from a scrolled-up band, whatever band the one before drew", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named items={conversation("mara", 300)} />);
    await settle(list.scroller);
    await upBy(list.scroller, 30000);
    const seen: HTMLElement[] = [];
    const watch = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement) seen.push(...(node.matches('[data-ouro="message"]') ? [node] : node.querySelectorAll<HTMLElement>('[data-ouro="message"]')));
    });
    watch.observe(list.scroller, { childList: true, subtree: true });
    await list.commit(<Switcher open="theo" keyed={false} named items={conversation("theo", 300)} />);
    watch.disconnect();
    const ids = seen.map((node) => node.id);
    // Only the newest are mounted, none of the old band's range, and they fill the view; the stale band (a mutant that keeps it) draws only the newest.
    expect(ids.every((id) => id.startsWith("theo-") && Number(id.slice(5)) >= 250)).toBe(true);
    const view = list.scroller.getBoundingClientRect();
    expect(messagesOf(list.scroller)[0]!.getBoundingClientRect().top).toBeLessThanOrEqual(view.top);
    // Only what the view shows: the rows past its edges draw after the switch's frame is painted.
    const drawn = seen.filter((node) => node.isConnected).reduce((height, node) => height + node.getBoundingClientRect().height, 0);
    expect(drawn).toBeLessThan(view.height + 400);
  });

  it("confirms what a change under the same name leaves, so a rename that changes nothing waits for the messages to follow", async () => {
    const list = mount();
    const all = conversation("ann", 90);
    const show = (name: string, items: Item[]) => <Switcher open={name} keyed={false} named items={items} />;
    await list.commit(show("ann", all.slice(0, 30)));
    await list.commit(show("ann", all.slice(15, 45)));
    await list.commit(show("ann", all.slice(30, 60)));
    // Named for another, its messages unchanged: they are still the one before's until others come.
    await list.commit(show("bo", all.slice(30, 60)));
    upBy(list.scroller, 2000);
    await list.commit(show("bo", conversation("bo", 30)));
    expect(messagesOf(list.scroller).at(-1)!.id).toBe("bo-29");
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("confirms nothing for messages that come back to a list emptied under the same name, so a rename that changes nothing is taken at once", async () => {
    const list = mount();
    const show = (name: string, items: Item[]) => <Switcher open={name} keyed={false} named items={items} />;
    await list.commit(show("ann", conversation("ann", 30)));
    await list.commit(show("ann", []));
    const next = conversation("bo", 30);
    await list.commit(show("ann", next));
    // Named for bo, its messages unchanged: they are not ann's, so the name is taken with no switch.
    await list.commit(show("bo", next));
    upBy(list.scroller, 2000);
    await list.commit(show("bo", conversation("cy", 30)));
    // No switch: the reader is where they were, not at the newest.
    expect(distanceFromBottom(list.scroller)).toBeGreaterThan(100);
  });

  it("takes a rename with any one of the first message, the number of newest messages or one of them changed for a switch, and a name given to messages the list holds for none", async () => {
    const opens = async (from: ReactNode, to: ReactNode) => {
      const list = mount();
      await list.commit(from);
      await settle(list.scroller);
      await upBy(list.scroller, 400);
      await list.commit(to);
      await settle(list.scroller);
      return distanceFromBottom(list.scroller) <= 2;
    };
    const mara = conversation("mara", 1000);
    const tall = [
      { id: "tall-a", role: "assistant" as const, text: "word ".repeat(4000) },
      { id: "tall-b", role: "user" as const, text: "ok" },
    ];
    // Only the first message is another's.
    expect(await opens(<Switcher open="mara" keyed={false} named items={mara} />, <Switcher open="theo" keyed={false} named items={mara.map((item, at) => (at === 0 ? { ...item, id: "theo-first" } : item))} />)).toBe(true);
    // Only the number of newest messages differs: the first is the same, so is the one that is left.
    expect(await opens(<Switcher open="mara" keyed={false} named items={tall} />, <Switcher open="theo" keyed={false} named items={tall.slice(0, 1)} />)).toBe(true);
    // Only the last message is another's.
    expect(await opens(<Switcher open="mara" keyed={false} named items={mara} />, <Switcher open="theo" keyed={false} named items={mara.map((item, at) => (at === 999 ? { ...item, id: "theo-last" } : item))} />)).toBe(true);
    // Named for the messages it holds, with another message come: still the same conversation.
    expect(await opens(<Switcher open="mara" keyed={false} items={mara} />, <Switcher open="mara" keyed={false} named items={[...mara, { id: "mara-new", role: "assistant", text: "A reply." }]} />)).toBe(false);
  });

  it("opens the conversation named before its messages come when it is the one a list that mounted empty is first named for", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named items={[]} />);
    await list.commit(<Switcher open="mara" keyed={false} named />);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    // Named for another, its messages still those held: it waits for them, and opens at their newest when they come.
    await list.commit(<Switcher open="mara" keyed={false} called="theo" />);
    await settle(list.scroller);
    await list.commit(<Switcher open="theo" keyed={false} named />);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
  });

  it("forgets a name that waits for messages when the list is named for the conversation it holds again", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named />);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    await list.commit(<Switcher open="mara" keyed={false} called="theo" />);
    await settle(list.scroller);
    await list.commit(<Switcher open="mara" keyed={false} called="mara" />);
    await settle(list.scroller);
    await list.commit(<Switcher open="mara" keyed={false} called="mara" items={conversation("theo", 1000)} />);
    await settle(list.scroller);
    expect(distanceFromBottom(list.scroller)).toBeGreaterThan(100);
  });

  it("takes a second new name given while one waits for its messages as a rename of its own, so it is a switch when messages changed with it", async () => {
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named />);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    await list.commit(<Switcher open="mara" keyed={false} called="theo" />);
    await settle(list.scroller);
    await list.commit(<Switcher open="mara" keyed={false} called="kai" items={[...conversation("mara", 1000), { id: "mara-new", role: "assistant", text: "A reply." }]} />);
    await settle(list.scroller);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
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

  /** Messages whose heights differ, by up to four more lines of words than the first: as the rows of a chat do. */
  const varied = (name: string, count: number, unit: number): Item[] =>
    conversation(name, count).map((item, at) => ({ ...item, text: `${item.text}${" more words in this message".repeat((at % 5) * unit)}` }));
  /** Scrolls the list up to `top` in code, as the reader does by its scrollbar: in steps of `step` px to measure the rows on the way. */
  async function scrollUpTo(scroller: HTMLElement, top: number, step?: number) {
    while (step !== undefined && scroller.scrollTop - top > step) await upBy(scroller, step);
    await upBy(scroller, scroller.scrollTop - top);
  }
  it("holds the reader's place through a full re-key of a named conversation, with its rows not yet measured, in messages of varied heights", async () => {
    const items = varied("mara", 900, 4);
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named items={items} />);
    await settle(list.scroller);
    await scrollUpTo(list.scroller, Math.round(list.scroller.scrollHeight / 2));
    const reading = firstVisible(list.scroller);
    await list.commit(<Switcher open="mara" keyed={false} named items={items} rekey="sent-" />);
    await settle(list.scroller);
    expect(setSize(list.scroller)).toBe("900");
    const after = firstVisible(list.scroller);
    expect(after.message.id).toBe(reading.message.id);
    expect(Math.abs(after.top - reading.top)).toBeLessThanOrEqual(1);
    expect(list.host.querySelector("[data-ouro-message-list-jump]")).not.toBeNull();
  });

  it("holds the reader's place through a full re-key of a named conversation, with its rows measured by scrolling up through them, in messages of varied heights", async () => {
    const items = varied("mara", 900, 4);
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named items={items} />);
    await settle(list.scroller);
    await scrollUpTo(list.scroller, Math.round(list.scroller.scrollHeight / 2), 600);
    const reading = firstVisible(list.scroller);
    await list.commit(<Switcher open="mara" keyed={false} named items={items} rekey="sent-" />);
    await settle(list.scroller);
    expect(setSize(list.scroller)).toBe("900");
    const after = firstVisible(list.scroller);
    expect(after.message.id).toBe(reading.message.id);
    expect(Math.abs(after.top - reading.top)).toBeLessThanOrEqual(1);
  }, 60_000);

  it("holds the reader's place through a full re-key of a named conversation, with messages a few hundred pixels tall", async () => {
    const items = varied("mara", 900, 16);
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named items={items} />);
    await settle(list.scroller);
    await scrollUpTo(list.scroller, Math.round(list.scroller.scrollHeight / 2));
    // The fixture is tall: its tallest message is a few hundred pixels.
    expect(Math.max(...messagesOf(list.scroller).map((message) => message.getBoundingClientRect().height))).toBeGreaterThan(200);
    const reading = firstVisible(list.scroller);
    await list.commit(<Switcher open="mara" keyed={false} named items={items} rekey="sent-" />);
    await settle(list.scroller);
    const after = firstVisible(list.scroller);
    expect(after.message.id).toBe(reading.message.id);
    expect(Math.abs(after.top - reading.top)).toBeLessThanOrEqual(1);
  });

  it("opens the newest message when every message gets a new key with no conversation named, as another conversation's messages would", async () => {
    const items = conversation("mara", 900);
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} items={items} />);
    await settle(list.scroller);
    await upBy(list.scroller, 1200);
    await list.commit(<Switcher open="mara" keyed={false} items={items} rekey="sent-" />);
    await settle(list.scroller);
    expect(distanceFromBottom(list.scroller)).toBeLessThanOrEqual(2);
  });

  it("makes a switched conversation of the same count as tall as a fresh list of it, with no height of the one before", async () => {
    // Tall messages before, short ones after: a height carried over from the one before would make the list far taller.
    const long = " a long line of words to fill the message".repeat(6);
    const before = conversation("mara", 900).map((item, at) => ({ ...item, text: `${item.text}${long.repeat(1 + (at % 4))}` }));
    const after = conversation("theo", 900).map((item) => ({ ...item, role: "assistant" as const }));
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named items={before} />);
    await settle(list.scroller);
    // Every row of the one before is measured: scroll through it from the top to its end.
    await scrollUpTo(list.scroller, 0);
    while (list.scroller.scrollTop + list.scroller.clientHeight < list.scroller.scrollHeight) await upBy(list.scroller, -800);
    await list.commit(<Switcher open="theo" keyed={false} named items={after} />);
    await settle(list.scroller);
    // Compared as the switch settles, before the rows of the new conversation are measured.
    expect(messagesOf(list.scroller).length).toBeLessThan(100);
    const fresh = mount();
    await fresh.commit(<Switcher open="theo" keyed={false} named items={after} />);
    await settle(fresh.scroller);
    expect(list.scroller.scrollHeight).toBe(fresh.scroller.scrollHeight);
  }, 120_000);

  it("makes a full re-key that changes the count as tall as a fresh list of the same messages, with no height carried by place", async () => {
    // Tall messages first, short ones after: a height carried over by place, one row off, would make the list hundreds of pixels taller.
    const long = " a long line of words to fill the message".repeat(8);
    const rows: Item[] = Array.from({ length: 900 }, (_, id) => ({ id: `mara-${id}`, role: "assistant" as const, text: `mara ${id}${id < 450 ? long : ""}` }));
    // A list drawn once before, so the list below starts as a list does in a page that has drawn one.
    const warm = mount();
    await warm.commit(<Switcher open="mara" keyed={false} named items={rows} />);
    await settle(warm.scroller);
    await warm.commit(<div />);
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named items={rows} />);
    await settle(list.scroller);
    // Every row measured: the list is scrolled through from its top to its end, then back to the middle.
    await scrollUpTo(list.scroller, 0);
    while (list.scroller.scrollTop + list.scroller.clientHeight < list.scroller.scrollHeight) await upBy(list.scroller, -800);
    await scrollUpTo(list.scroller, Math.round(list.scroller.scrollHeight / 2));
    // One message comes in before the oldest, and every key changes, so the count changes and no key survives.
    const next: Item[] = [{ id: "mara-new", role: "assistant", text: "mara new" }, ...rows];
    await list.commit(<Switcher open="mara" keyed={false} named items={next} rekey="sent-" />);
    // As the re-key settles, while most of the new rows are unmeasured.
    await settle(list.scroller);
    expect(messagesOf(list.scroller).length).toBeLessThan(100);
    const fresh = mount();
    await fresh.commit(<Switcher open="mara" keyed={false} named items={next} />);
    await settle(fresh.scroller);
    expect(list.scroller.scrollHeight).toBe(fresh.scroller.scrollHeight);
  }, 120_000);

  it("keeps the rows above and below a reader's view as two spaces, through a named re-key of taller messages before the list's first frame", async () => {
    const items = varied("mara", 900, 4);
    const taller = varied("mara", 900, 8);
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named items={items} />);
    // The reader moves to the middle in the same task: the rows there are drawn, but not measured, when the re-key comes.
    await act(async () => {
      list.scroller.scrollTop = Math.round(list.scroller.scrollHeight / 2);
      list.scroller.dispatchEvent(new Event("scroll"));
    });
    await list.commit(<Switcher open="mara" keyed={false} named items={taller} rekey="sent-" />);
    await settle(list.scroller);
    // The rows above and below the view are two runs not drawn: each keeps its space.
    expect(list.scroller.querySelectorAll("[data-ouro-message-list-space]").length).toBe(2);
  }, 60_000);

  it("keeps a partial re-key's rows at their own heights: sliding the window by one message leaves the list as tall as it was", async () => {
    const items = varied("mara", 900, 4);
    const list = mount();
    await list.commit(<Switcher open="mara" keyed={false} named items={items} />);
    await settle(list.scroller);
    // Measure the rows at the top, then go back to the end: the top message is measured, and it is the one that leaves.
    await scrollUpTo(list.scroller, 0, 600);
    await upBy(list.scroller, -list.scroller.scrollHeight);
    const before = list.scroller.scrollHeight;
    // The oldest leaves and an equally tall message comes at the end under a new key; the others keep their keys.
    const slid = [...items.slice(1), { ...items[0]!, id: "mara-new" }];
    await list.commit(<Switcher open="mara" keyed={false} named items={slid} />);
    await settle(list.scroller);
    expect(Math.abs(list.scroller.scrollHeight - before)).toBeLessThanOrEqual(0.5);
  }, 60_000);

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
