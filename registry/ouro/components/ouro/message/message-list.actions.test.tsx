import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Message, type MessageAction } from "@/registry/ouro/components/ouro/message/message";
import { MessageList } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

afterEach(async () => {
  await userEvent.unhover(document.body);
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const host of mounted) host.remove();
  mounted = [];
});

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return { host, scroller: host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")! };
}

const authors = ["Grace Hopper", "Ana Lind", "Mara Quill"];

interface ChatProps {
  count: number;
  onAction?: (id: string, key: string) => void;
  before?: ReactNode;
}

/** A channel whose messages each have a reaction, a reply, quick reactions and a menu. */
function Channel({ count, onAction = () => {}, before }: ChatProps) {
  return (
    <>
      {before}
      <MessageList label="Launch channel" style={{ height: 360 }}>
        {Array.from({ length: count }, (_, index) => {
          const id = `m${index}`;
          const act = (key: string) => () => onAction(id, key);
          const actions: MessageAction[] = [
            { key: "like", label: "Like", icon: "👍", onClick: act("like") },
            { key: "reply", label: "Reply", icon: "↩", onClick: act("reply") },
          ];
          return (
            <Message
              key={id}
              id={id}
              variant="chat"
              role="assistant"
              name={authors[index % authors.length]!}
              actions={actions}
              quickReactions={[
                { key: "like", label: "Like", icon: "👍", onClick: act("menu-like") },
                { key: "heart", label: "Heart", icon: "❤️", onClick: act("menu-heart") },
                { key: "more", label: "More reactions", icon: "+", onClick: act("more") },
              ]}
              menu={[
                { label: "Reply", shortcut: ["r"], onClick: act("menu-reply") },
                { label: "Copy link", onClick: act("copy") },
              ]}
            >
              {`Message ${index}`}
            </Message>
          );
        })}
      </MessageList>
    </>
  );
}

const bars = () => [...document.querySelectorAll('[role="toolbar"][data-ouro-message-actions]')];
const barIn = (id: string) => document.getElementById(id)!.querySelector('[role="toolbar"]');
const message = (id: string) => document.getElementById(id)!;
const menus = () => [...document.querySelectorAll('[data-ouro="menu"]')].filter((menu) => menu.checkVisibility());

/** Waits for the list's bar code, then puts the pointer on a message's text. */
async function hoverMessage(id: string) {
  await userEvent.hover(message(id).querySelector("[data-ouro-message-content]")!);
}

async function ready(id: string) {
  await expect.poll(async () => (await hoverMessage(id), barIn(id))).not.toBeNull();
}

describe("MessageList actions", () => {
  it("draws one bar for the whole list, on the message the pointer is over, and listens the same for a hundred messages as for two", async () => {
    // Every listener the list, its messages and its layer add, on themselves, the document and the window.
    const listened = async (count: number) => {
      const add = vi.spyOn(EventTarget.prototype, "addEventListener");
      const { host } = await render(<Channel count={count} />);
      await expect.poll(() => (message(`m${count - 1}`).dispatchEvent(new PointerEvent("pointerover", { bubbles: true })), barIn(`m${count - 1}`))).not.toBeNull();
      const calls = add.mock.contexts.filter((target) => target === document || target === window || (target instanceof Node && host.contains(target))).length;
      add.mockRestore();
      await act(async () => roots.pop()!.unmount());
      host.remove();
      return calls;
    };
    // The first list loads the layer's code, whose modules listen once for the page.
    await listened(1);
    expect(await listened(200)).toBe(await listened(20));

    await render(<Channel count={6} />);
    await ready("m5");
    expect(bars()).toHaveLength(1);
    expect(barIn("m5")).not.toBeNull();
    await hoverMessage("m4");
    expect(bars()).toHaveLength(1);
    expect(barIn("m4")).not.toBeNull();
    await userEvent.unhover(document.body);
    await expect.poll(() => bars()).toHaveLength(0);
  });

  it("shows the bar within the pointer's own event, before the next frame, and moves the same bar to the next message", async () => {
    await render(<Channel count={3} />);
    await ready("m2");
    await userEvent.unhover(document.body);
    await expect.poll(() => bars()).toHaveLength(0);
    message("m1").dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    expect(barIn("m1")).not.toBeNull();
    // The same bar moves on, updated rather than built again, so the move costs little on a slow computer.
    const first = barIn("m1");
    message("m2").dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    expect(barIn("m2")).toBe(first);
    expect(barIn("m1")).toBeNull();
  });

  it("shows its first bar adding no event listener, so WebKit restyles nothing as the pointer first reaches a message", async () => {
    // The layer's code loaded by a list before, as an app's second conversation has it.
    const first = await render(<Channel count={2} />);
    await ready("m1");
    await userEvent.unhover(document.body);
    await act(async () => roots.pop()!.unmount());
    first.host.remove();
    await render(<Channel count={4} />);
    // The new list's layer is in place once its rows have taken it.
    await act(async () => void (await new Promise((resolve) => requestAnimationFrame(resolve))));
    const add = vi.spyOn(EventTarget.prototype, "addEventListener");
    try {
      message("m3").dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
      expect(barIn("m3")).not.toBeNull();
      // React gives a portal's element its listeners the first time it renders into it; a wheel listener restyles the
      // whole page in WebKit (151 ms on a long conversation).
      expect(add.mock.calls.map(([type]) => type)).not.toContain("wheel");
    } finally {
      add.mockRestore();
    }
  });

  it("has its bar layer in its first commit once an earlier list has loaded the layer's code", async () => {
    const first = await render(<Channel count={2} />);
    await ready("m1");
    await act(async () => roots.pop()!.unmount());
    first.host.remove();
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    const add = vi.spyOn(EventTarget.prototype, "addEventListener");
    try {
      // Synchronously, so no promise has settled: the layer is there only if the list began with it.
      flushSync(() => root.render(<Channel count={2} />));
      const detached = add.mock.contexts.some((target, index) => add.mock.calls[index]![0] === "wheel" && target instanceof HTMLSpanElement && !target.isConnected);
      expect(detached).toBe(true);
    } finally {
      add.mockRestore();
    }
  });

  it("moves its bar without the list measuring its layout again", async () => {
    const { scroller } = await render(<Channel count={12} />);
    await ready("m11");
    const native = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight")!;
    let reads = 0;
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, get: () => (reads++, native.get!.call(scroller)) });
    try {
      for (const id of ["m10", "m9", "m11"]) {
        await act(async () => void message(id).dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" })));
        expect(barIn(id)).not.toBeNull();
      }
      expect(reads).toBe(0);
    } finally {
      delete (scroller as { scrollHeight?: number }).scrollHeight;
    }
  });

  it("leaves no bar behind when the pointer leaves, the list scrolls, the window loses focus or the menu opens", async () => {
    const { scroller } = await render(<Channel count={12} />);
    await ready("m11");
    // A press in the bar puts focus in it; moving to another message moves the one bar, and focus stays in the page.
    await userEvent.click(page.getByRole("button", { name: "Like" }));
    await hoverMessage("m10");
    expect(bars()).toHaveLength(1);
    expect(barIn("m10")).not.toBeNull();
    expect(document.activeElement).toBe(message("m11"));

    // Scrolled under the pointer: the bar goes from the message, and comes back only on the message the pointer is over now.
    const box = message("m10").querySelector("[data-ouro-message-content]")!.getBoundingClientRect();
    const under = () => document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)!.closest('[data-ouro="message"]');
    await act(async () => void (scroller.scrollTop -= 80));
    await expect.poll(() => barIn("m10")).toBeNull();
    expect(bars().length).toBeLessThanOrEqual(1);
    for (const bar of bars()) expect(bar.closest('[data-ouro="message"]')).toBe(under());
    await hoverMessage("m10");
    expect(bars()).toHaveLength(1);

    await act(async () => void window.dispatchEvent(new Event("blur")));
    expect(bars()).toHaveLength(0);

    await act(async () => void (scroller.scrollTop = scroller.scrollHeight));
    await userEvent.unhover(document.body);
    await hoverMessage("m10");
    await userEvent.click(page.getByRole("button", { name: "More actions" }));
    await expect.element(page.getByRole("menu", { name: "Message actions for Ana Lind" })).toBeVisible();
    expect(bars()).toHaveLength(0);
  });

  it("opens one menu from the bar's button and a right-click, with the reactions on top, and the same menu again for another message", async () => {
    const onAction = vi.fn();
    await render(<Channel count={3} onAction={onAction} />);
    await ready("m2");
    // The menu takes focus straight from the button: focus never stops on the message on the way, as the bar goes.
    const stops: EventTarget[] = [];
    const heard = (event: FocusEvent) => stops.push(event.target!);
    document.addEventListener("focusin", heard);
    await userEvent.click(page.getByRole("button", { name: "More actions" }));
    const menu = page.getByRole("menu", { name: "Message actions for Mara Quill" });
    await expect.element(menu).toBeVisible();
    document.removeEventListener("focusin", heard);
    expect(stops).not.toContain(message("m2"));
    const reactions = menu.getByRole("group", { name: "Reactions" });
    await expect.element(reactions.getByRole("menuitem", { name: "Like" })).toBeVisible();
    await expect.element(reactions.getByRole("menuitem", { name: "More reactions" })).toBeVisible();
    await expect.element(menu.getByRole("menuitem", { name: "Reply" })).toHaveAttribute("aria-keyshortcuts", "R");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => menus()).toHaveLength(0);
    await expect.poll(() => document.activeElement).toBe(message("m2"));

    // A right-click, as the browser sends it (WebKit's driver sends none for a right press).
    const text = message("m1").querySelector("[data-ouro-message-content]")!;
    const box = text.getBoundingClientRect();
    await act(async () => void text.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: box.x + 4, clientY: box.y + 4 })));
    await expect.element(page.getByRole("menu", { name: "Message actions for Ana Lind" })).toBeVisible();
    expect(document.querySelectorAll('[data-ouro="menu"]')).toHaveLength(1);
    await userEvent.click(page.getByRole("menuitem", { name: "Heart" }));
    expect(onAction).toHaveBeenCalledWith("m1", "menu-heart");
  });

  it("puts a line between the reactions and the rest only when its menu has both", async () => {
    const chose = vi.fn();
    await render(
      <MessageList label="Launch channel" style={{ height: 360 }}>
        <Message id="entries" variant="chat" role="assistant" name="Grace Hopper" menu={[{ label: "Reply", onClick: chose }, { label: "Copy link", onClick: chose }]}>
          Entries only
        </Message>
        <Message id="reactions" variant="chat" role="assistant" name="Ana Lind" quickReactions={[{ key: "like", label: "Like", icon: "👍", onClick: chose }, { key: "more", label: "More reactions", icon: "+", onClick: chose }]}>
          Reactions only
        </Message>
        <Message id="empty" variant="chat" role="assistant" name="Mara Quill" quickReactions={[{ key: "like", label: "Like", icon: "👍", onClick: chose }]} menu={[]}>
          Reactions and an empty menu
        </Message>
        <Message id="nameless" variant="chat" role="user" name="" menu={[{ label: "Copy link", onClick: chose }]}>
          Nobody named
        </Message>
      </MessageList>,
    );
    const open = async (id: string, name: string) => {
      await ready(id);
      const text = message(id).querySelector("[data-ouro-message-content]")!;
      const box = text.getBoundingClientRect();
      await act(async () => void text.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: box.x + 4, clientY: box.y + 4 })));
      const menu = page.getByRole("menu", { name });
      await expect.element(menu).toBeVisible();
      const element = menu.element();
      const drawn = { items: [...element.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent), groups: element.querySelectorAll('[role="group"]').length, lines: element.querySelectorAll('[role="separator"]').length };
      await userEvent.keyboard("{Escape}");
      await expect.poll(() => menus()).toHaveLength(0);
      return drawn;
    };
    expect(await open("entries", "Message actions for Grace Hopper")).toEqual({ items: ["Reply", "Copy link"], groups: 0, lines: 0 });
    expect(await open("reactions", "Message actions for Ana Lind")).toEqual({ items: ["👍Like", "+More reactions"], groups: 1, lines: 0 });
    expect(await open("empty", "Message actions for Mara Quill")).toEqual({ items: ["👍Like"], groups: 1, lines: 0 });
    // A message with an empty name gives its menu the plain name.
    expect(await open("nameless", "Message actions")).toEqual({ items: ["Copy link"], groups: 0, lines: 0 });
  });

  it("opens no menu, and leaves the browser's own, on a message whose menu and reactions hold nothing", async () => {
    const like = [{ key: "like", label: "Like", icon: "👍", onClick: () => {} }];
    await render(
      <MessageList label="Launch channel" style={{ height: 360 }}>
        <Message id="none" variant="chat" role="assistant" name="Grace Hopper" actions={like}>
          No menu at all
        </Message>
        <Message id="empty-menu" variant="chat" role="assistant" name="Ana Lind" actions={like} menu={[]}>
          An empty menu
        </Message>
        <Message id="empty-reactions" variant="chat" role="assistant" name="Mara Quill" actions={like} quickReactions={[]}>
          Empty reactions
        </Message>
        <Message id="both-empty" variant="chat" role="assistant" name="Priya Okafor" actions={like} menu={[]} quickReactions={[]}>
          Both empty
        </Message>
        <Message id="entries" variant="chat" role="assistant" name="Jonah Vale" actions={like} menu={[{ label: "Copy link", onClick: () => {} }]}>
          One entry
        </Message>
      </MessageList>,
    );
    const rightClick = async (id: string) => {
      await ready(id);
      const text = message(id).querySelector("[data-ouro-message-content]")!;
      const box = text.getBoundingClientRect();
      let taken = false;
      await act(async () => void (taken = !text.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: box.x + 4, clientY: box.y + 4 }))));
      return taken;
    };
    for (const id of ["none", "empty-menu", "empty-reactions", "both-empty"]) {
      expect(await rightClick(id)).toBe(false);
      expect(menus()).toHaveLength(0);
    }
    expect(await rightClick("entries")).toBe(true);
    await expect.poll(() => menus()).toHaveLength(1);
  });

  it("starts the bar on each message at its first button, whatever had focus in it on the message before", async () => {
    await render(<Channel count={3} />);
    const buttons = (id: string) => [...barIn(id)!.querySelectorAll<HTMLElement>("button")];
    // From the keyboard: onto the newest message, into its bar and along it, then back out and up to the one before.
    await act(async () => message("m2").focus());
    await userEvent.keyboard("{Shift>}{Shift}{/Shift}");
    await expect.poll(() => barIn("m2")).not.toBeNull();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(document.activeElement).toBe(buttons("m2")[1]);
    expect(buttons("m2").map((button) => button.tabIndex)).toEqual([-1, 0, -1]);
    await act(async () => message("m2").focus());
    await userEvent.keyboard("{ArrowUp}");
    await expect.poll(() => barIn("m1")).not.toBeNull();
    expect(buttons("m1").map((button) => button.tabIndex)).toEqual([0, -1, -1]);
  });

  it("sits a post's bar on its name line, as a post's own bar does", async () => {
    await render(
      <MessageList label="Launch channel" style={{ height: 360 }}>
        <Message id="post" variant="post" role="assistant" name="Grace Hopper" actions={[{ key: "like", label: "Like", icon: "👍", onClick: () => {} }]}>
          A post
        </Message>
        <Message id="chat" variant="chat" role="assistant" name="Ana Lind" actions={[{ key: "like", label: "Like", icon: "👍", onClick: () => {} }]}>
          A chat message
        </Message>
      </MessageList>,
    );
    await ready("post");
    const post = getComputedStyle(barIn("post")!).top;
    await ready("chat");
    expect([post, getComputedStyle(barIn("chat")!).top]).toEqual(["-20px", "-32px"]);
  });

  it("marks the list's bar as its layer, or the room beside a bubble that holds it, and never both", async () => {
    const like = [{ key: "like", label: "Like", icon: "👍", onClick: () => {} }];
    await render(
      <MessageList label="Launch channel" style={{ height: 360 }}>
        <Message id="corner" variant="chat" role="assistant" name="Ana Lind" actions={like}>
          A chat message
        </Message>
        <Message id="beside" variant="reply" role="assistant" name="Grace Hopper" actions={like}>
          A reply
        </Message>
      </MessageList>,
    );
    await ready("corner");
    expect(barIn("corner")!.getAttribute("data-ouro-row-layer")).toBe("");
    await ready("beside");
    const bar = barIn("beside")!;
    expect(bar.hasAttribute("data-ouro-row-layer")).toBe(false);
    expect(bar.closest("[data-ouro-message-actions-room]")!.getAttribute("data-ouro-row-layer")).toBe("");
  });

  it("goes on from its bar as from the message's own controls: Tab leaves the list, never into the next message", async () => {
    await render(
      <>
        <button type="button">Before</button>
        <MessageList label="Launch channel" style={{ height: 360 }}>
          {[0, 1].map((index) => (
            <Message key={index} id={`k${index}`} variant="chat" role="assistant" name="Ana Lind" actions={[{ key: "like", label: "Like", icon: "👍", onClick: () => {} }]}>
              {`Message ${index} `}
              <a href={`#link-${index}`}>Link {index}</a>
            </Message>
          ))}
        </MessageList>
        <button type="button">After</button>
      </>,
    );
    await ready("k1");
    await userEvent.unhover(document.body);
    page.getByRole("button", { name: "Before" }).element().focus();
    await pressTab();
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(message("k0"));
    await expect.poll(() => barIn("k0")).not.toBeNull();
    // Through the first message's link and its bar, then out of the list: the next message's link is never a stop.
    const stops: string[] = [];
    for (let press = 0; press < 4 && document.activeElement !== page.getByRole("button", { name: "After" }).element(); press++) {
      await pressTab();
      const at = document.activeElement!;
      stops.push(at.closest("[role=toolbar]") ? "bar" : (at.textContent ?? ""));
    }
    expect(stops).toContain("bar");
    expect(stops).toContain("Link 0");
    expect(stops).not.toContain("Link 1");
    expect(stops.at(-1)).toBe("After");
  });

  it("keeps its bar on the focused message, the same element and still, as the page changes under a pointer resting on another", async () => {
    await render(<Channel count={8} before={<button type="button">Before</button>} />);
    await ready("m7");
    await userEvent.unhover(document.body);
    // The pointer rests on a cover over m5, and the bar is on m7 from the keyboard.
    const cover = document.createElement("div");
    cover.setAttribute("style", "position:fixed;inset:0");
    document.body.append(cover);
    mounted.push(cover);
    const box = message("m5").getBoundingClientRect();
    await userEvent.hover(cover, { position: { x: box.left + box.width / 2, y: box.top + box.height / 2 } });
    page.getByRole("button", { name: "Before" }).element().focus();
    await pressTab();
    expect(document.activeElement).toBe(message("m7"));
    await expect.poll(() => barIn("m7")).not.toBeNull();
    const button = page.getByRole("button", { name: "More actions" }).element();
    const place = JSON.stringify(button.getBoundingClientRect());
    // The cover goes: m5 is under the pointer, which has not moved. For 30 frames, the bar's button stays the same element, in m7, in place.
    await act(async () => cover.remove());
    for (let frame = 0; frame < 30; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(page.getByRole("button", { name: "More actions" }).element()).toBe(button);
      expect(message("m7").contains(button)).toBe(true);
      expect(JSON.stringify(button.getBoundingClientRect())).toBe(place);
    }
  });

  it("opens the menu from the keyboard on the focused message, and Escape puts focus back on it", async () => {
    await render(<Channel count={3} before={<button type="button">Before</button>} />);
    await ready("m2");
    await userEvent.unhover(document.body);
    page.getByRole("button", { name: "Before" }).element().focus();
    await pressTab();
    expect(document.activeElement).toBe(message("m2"));
    await expect.poll(() => barIn("m2")).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(bars()).toHaveLength(0);
    expect(document.activeElement).toBe(message("m2"));

    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    const menu = page.getByRole("menu", { name: "Message actions for Mara Quill" });
    await expect.element(menu).toBeVisible();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.activeElement).toBe(message("m2"));

    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(message("m1"));
    await userEvent.keyboard("{ContextMenu}");
    await expect.element(page.getByRole("menu", { name: "Message actions for Ana Lind" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.activeElement).toBe(message("m1"));
  });

  it("opens the menu within the event once its code has loaded, and draws the bar's host as no box of its own", async () => {
    await render(<Channel count={3} />);
    await ready("m2");
    const slot = message("m2").querySelector("[data-ouro-message-bar-slot]")!;
    expect(getComputedStyle(slot.firstElementChild!).display).toBe("contents");

    const rightClick = (id: string) => {
      const text = message(id).querySelector("[data-ouro-message-content]")!;
      const box = text.getBoundingClientRect();
      text.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: box.x + 4, clientY: box.y + 4 }));
    };
    const menuFor = (name: string) => document.querySelector(`[aria-label="Message actions for ${name}"]`);
    // The first menu waits for Menu's code; the one after it opens before the event returns.
    await act(async () => rightClick("m1"));
    await expect.element(page.getByRole("menu", { name: "Message actions for Ana Lind" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => menus()).toHaveLength(0);
    expect(menuFor("Grace Hopper")).toBeNull();
    rightClick("m0");
    expect(menuFor("Grace Hopper")).not.toBeNull();
  });

  it("moves along the reactions in its menu with Left and Right, the other way in a right-to-left page, and leaves any other target's keys alone", async () => {
    await render(<Channel count={3} />);
    await ready("m1");
    const open = async () => {
      const text = message("m1").querySelector("[data-ouro-message-content]")!;
      const box = text.getBoundingClientRect();
      await act(async () => void text.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: box.x + 4, clientY: box.y + 4 })));
      await expect.element(page.getByRole("menu", { name: "Message actions for Ana Lind" })).toBeVisible();
    };
    const reaction = (name: string) => page.getByRole("menuitem", { name }).element();
    const press = async (key: string, expected: string) => {
      await userEvent.keyboard(key);
      await expect.poll(() => document.activeElement === page.getByRole("menuitem", { name: expected }).query()).toBe(true);
    };
    // Closed once the menu is out of the page, not only hidden: the menu gives focus back to the message after its exit,
    // and a menu opened before that would lose its focus to the message and close (a slow WebKit, #689).
    const close = async () => {
      await userEvent.keyboard("{Escape}");
      await expect.poll(() => document.querySelector('[data-ouro="menu"]')).toBeNull();
      await expect.poll(() => message("m1").contains(document.activeElement)).toBe(true);
    };

    await open();
    reaction("Like").focus();
    await press("{ArrowRight}", "Heart");
    await press("{ArrowRight}", "More reactions");
    await press("{ArrowRight}", "Like");
    await press("{ArrowLeft}", "More reactions");
    await press("{ArrowLeft}", "Heart");

    // The group itself holds none of the row's items, so its keys go on to the menu.
    const group = page.getByRole("group", { name: "Reactions" }).element();
    const heard: KeyboardEvent[] = [];
    const listen = (event: Event) => heard.push(event as KeyboardEvent);
    document.addEventListener("keydown", listen);
    const arrow = () => new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    const before = document.activeElement;
    expect(group.dispatchEvent(arrow())).toBe(true);
    expect(document.activeElement).toBe(before);
    expect(heard).toHaveLength(1);
    // An item's own Right is the row's: taken, and kept from the page.
    expect(reaction("Heart").dispatchEvent(arrow())).toBe(false);
    expect(heard).toHaveLength(1);
    document.removeEventListener("keydown", listen);
    await close();

    document.documentElement.dir = "rtl";
    try {
      await open();
      reaction("Heart").focus();
      await press("{ArrowRight}", "Like");
      await press("{ArrowRight}", "More reactions");
      await press("{ArrowLeft}", "Like");
      await press("{ArrowLeft}", "Heart");
      await close();
    } finally {
      document.documentElement.removeAttribute("dir");
    }
  });

  it("opens the menu from the keyboard under the message's bubble, where its bar's menu button is", async () => {
    // The menu is a sheet on a narrow screen, with no anchor.
    const { innerWidth: width, innerHeight: height } = window;
    await page.viewport(1000, 900);
    try {
      await render(<Channel count={3} before={<button type="button">Before</button>} />);
      await ready("m2");
      await userEvent.unhover(document.body);
      page.getByRole("button", { name: "Before" }).element().focus();
      await pressTab();
      expect(document.activeElement).toBe(message("m2"));
      await expect.poll(() => barIn("m2")).not.toBeNull();
      const bubble = message("m2").querySelector("[data-ouro-message-bar-slot]")!.parentElement!.getBoundingClientRect();
      expect(bubble.left).toBeGreaterThan(message("m2").getBoundingClientRect().left + 20);
      await userEvent.keyboard("{Shift>}{F10}{/Shift}");
      const menu = page.getByRole("menu", { name: "Message actions for Mara Quill" });
      await expect.element(menu).toBeVisible();
      const drawn = menu.element().getBoundingClientRect();
      // The menu, wider than the bubble, starts at its start, just under it.
      expect(Math.abs(drawn.left - bubble.left)).toBeLessThan(2);
      expect(Math.abs(drawn.top - bubble.bottom)).toBeLessThan(10);
    } finally {
      await page.viewport(width, height);
    }
  });
  it("takes its bar's host out of the message when the list goes", async () => {
    await render(<Channel count={2} />);
    await ready("m1");
    const host = message("m1").querySelector("[data-ouro-message-bar-slot]")!.firstElementChild!;
    expect(host.parentNode).not.toBeNull();
    await act(async () => roots.pop()!.unmount());
    expect(host.parentNode).toBeNull();
  });
});
