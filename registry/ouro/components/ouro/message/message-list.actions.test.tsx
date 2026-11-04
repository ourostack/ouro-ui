import type { ReactNode } from "react";
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
});
