import { createRef, type ReactNode, type Ref } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList, type MessageListActions } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

interface Item {
  id: number;
  text: string;
  streaming?: boolean;
  quote?: number;
}

/** Messages `from` to `from + count - 1`; with `varied`, of five lengths, else all one line. */
const conversation = (count: number, from = 0, varied = false): Item[] =>
  Array.from({ length: count }, (_, offset) => {
    const id = from + offset;
    const lines = varied ? ((id % 5) + 5) % 5 : 0;
    return { id, text: `Message ${id}${" more words in this message".repeat(lines * 4)}` };
  });

function Chat({
  items,
  actionsRef,
  first,
  onQuote,
  before,
  ...rest
}: {
  items: Item[];
  actionsRef?: Ref<MessageListActions>;
  first?: ReactNode;
  onQuote?: (id: number) => void;
  initialAnchor?: string;
  windowing?: boolean;
  /** What to put before the message with this id, such as a day's heading. */
  before?: (id: number) => ReactNode;
}) {
  return (
    <MessageList label="Conversation" style={{ height: 400, width: 360 }} actionsRef={actionsRef} {...rest}>
      {first}
      {items.flatMap((item) => [
        before?.(item.id),
        <Message
          key={item.id}
          id={`m${item.id}`}
          role={item.id % 2 ? "assistant" : "user"}
          name={item.id % 2 ? "Ouro" : "Ana"}
          streaming={item.streaming}
          quote={item.quote === undefined ? undefined : { author: "Ana", excerpt: `Message ${item.quote}`, onActivate: () => onQuote?.(item.quote!) }}
        >
          {item.text}
        </Message>,
      ])}
    </MessageList>
  );
}

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
  await settle(scroller);
  return {
    host,
    scroller,
    rerender: async (next: ReactNode) => {
      await act(async () => root.render(next));
      await settle(scroller);
    },
    live: host.querySelector<HTMLElement>("[data-ouro-message-list-live]")!,
  };
}

const messages = (scroller: HTMLElement) => [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
const ids = (scroller: HTMLElement) => messages(scroller).map((message) => Number(message.id.slice(1)));
const distanceFromBottom = (scroller: HTMLElement) => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/** Waits until the list has settled: the scroll position, its height and the messages drawn read the same across two frames. */
async function settle(scroller: HTMLElement) {
  let last = "";
  await expect
    .poll(async () => {
      await frame();
      const now = `${scroller.scrollTop}|${scroller.scrollHeight}|${ids(scroller).join(",")}`;
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
}

/** Scrolls the list in code, as a reader would by any means, and waits for it to settle. */
async function scrollTo(scroller: HTMLElement, top: number) {
  await act(async () => void (scroller.scrollTop = top));
  await settle(scroller);
}

/** The first message whose top is in the list's view, and where that top is. */
function firstVisible(scroller: HTMLElement): { message: HTMLElement; top: number } {
  const viewTop = scroller.getBoundingClientRect().top;
  const message = messages(scroller).find((node) => node.getBoundingClientRect().top >= viewTop)!;
  return { message, top: message.getBoundingClientRect().top };
}

/**
 * How far a message brought into view may land from where it was asked to go: WebKit scrolls by whole pixels, and the list
 * leaves a move of under half a pixel alone.
 */
const ROUNDING = 2;

/** Where a message sits in the view: its middle, from the view's middle. */
function offCentre(scroller: HTMLElement, id: string) {
  const box = document.getElementById(id)!.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  return (box.top + box.bottom) / 2 - (view.top + view.bottom) / 2;
}

/** Whether a message shows whole in the list's view. */
function inView(scroller: HTMLElement, id: string) {
  const box = document.getElementById(id)!.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  return box.top >= view.top - 0.5 && box.bottom <= view.bottom + 0.5;
}

/** Each text the live region gained, in order. */
function recordAnnouncements(live: HTMLElement): string[] {
  const spoken: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) spoken.push(node.textContent ?? "");
  });
  observer.observe(live, { childList: true, subtree: true });
  return spoken;
}

describe("MessageList windowing", () => {
  it("draws only the messages near the view of a long conversation, in a list as tall as all of them", async () => {
    const items = conversation(500);
    const { scroller } = await render(<Chat items={items} />);
    const whole = await render(<Chat items={items} windowing={false} />);
    // The newest shows at the bottom, as in a whole list, and only a few screens' worth are drawn.
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(inView(scroller, "m499")).toBe(true);
    expect(messages(scroller).length).toBeLessThan(50);
    expect(messages(whole.scroller)).toHaveLength(500);
    // The drawn messages are the newest ones, in order.
    const drawn = ids(scroller);
    expect(drawn).toEqual(drawn.map((_, index) => drawn[0]! + index));
    expect(drawn.at(-1)).toBe(499);
    // As tall as the whole list, within 1%: the space for messages not drawn is the average height of those measured.
    expect(Math.abs(scroller.scrollHeight - whole.scroller.scrollHeight)).toBeLessThan(whole.scroller.scrollHeight / 100);
    // Screen readers hear where a message is among all of them.
    expect(document.getElementById("m499")!.getAttribute("aria-posinset")).toBe("500");
    expect(document.getElementById("m499")!.getAttribute("aria-setsize")).toBe("500");
    // The space for the others hides from screen readers.
    for (const space of scroller.querySelectorAll("[data-ouro-message-list-space]")) expect(space.getAttribute("aria-hidden")).toBe("true");
  });

  it("puts each child in a slot that draws no box, keeping a continued message's spacing, in a list of any length", async () => {
    for (const count of [10, 200]) {
      const items = conversation(count);
      const { scroller } = await render(
        <MessageList label="Conversation" style={{ height: 400, width: 360 }}>
          {items.map((item, index) => (
            <Message key={item.id} id={`m${item.id}`} role="assistant" name="Ouro" continued={index === count - 1}>
              {item.text}
            </Message>
          ))}
        </MessageList>,
      );
      const content = scroller.querySelector("[data-ouro-message-list-content]")!;
      const slots = [...content.querySelectorAll(":scope > [data-ouro-message-list-slot]")];
      expect(slots.length).toBe(messages(scroller).length);
      for (const slot of slots) {
        expect(getComputedStyle(slot).display).toBe("contents");
        expect(slot.children).toHaveLength(1);
        expect(slot.firstElementChild!.matches('[data-ouro="message"]')).toBe(true);
      }
      // A continued message sits closer to the one before it: 16px apart, less 12.
      const last = document.getElementById(`m${count - 1}`)!;
      const before = document.getElementById(`m${count - 2}`)!;
      expect(last.getBoundingClientRect().top - before.getBoundingClientRect().bottom).toBeCloseTo(4, 0);
    }
  });

  it("draws a post's hairline after the post before it, each in its own slot, long list or short", async () => {
    for (const count of [3, 100]) {
      const { scroller } = await render(
        <MessageList label="Channel" style={{ height: 400, width: 360 }}>
          {conversation(count).map((item) => (
            <Message key={item.id} id={`m${item.id}`} variant="post" role="assistant" name="Mara Quill">
              {item.text}
            </Message>
          ))}
        </MessageList>,
      );
      const line = (id: string) => getComputedStyle(document.getElementById(id)!.querySelector("[data-ouro-message-body]")!, "::before");
      expect(line(`m${count - 1}`).borderTopStyle).toBe("solid");
      expect(line(`m${count - 2}`).borderTopWidth).toBe("1px");
      // The first post drawn after space kept for others has none until the one before it draws.
      const first = messages(scroller)[0]!;
      if (count === 3) expect(line(first.id).content).toBe("none");
      await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    }
  });

  it("keeps a conversation of 60 messages whole, and windows it once it grows past 60, leaving the view where it is", async () => {
    const { scroller, rerender } = await render(<Chat items={conversation(60, 40, true)} />);
    expect(messages(scroller)).toHaveLength(60);
    expect(scroller.querySelector("[data-ouro-message-list-space]")).toBeNull();
    await scrollTo(scroller, 600);
    const reading = firstVisible(scroller);
    // Older history loads above, and the list grows long: the reader's message stays where it was.
    await rerender(<Chat items={conversation(100, 0, true)} />);
    expect(reading.message.isConnected).toBe(true);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(1);
    expect(messages(scroller).length).toBeLessThan(100);
    expect(scroller.querySelector("[data-ouro-message-list-space]")).not.toBeNull();
  });

  it("keeps every message in the page with windowing={false}", async () => {
    const items = conversation(200, 0, true);
    const { scroller, rerender } = await render(<Chat items={items} windowing={false} />);
    expect(messages(scroller)).toHaveLength(200);
    expect(scroller.querySelector("[data-ouro-message-list-space]")).toBeNull();
    expect(document.getElementById("m0")!.getAttribute("aria-posinset")).toBe("1");
    // Turned on and off again, the view stays where it is.
    await scrollTo(scroller, 3000);
    const reading = firstVisible(scroller);
    await rerender(<Chat items={items} />);
    expect(messages(scroller).length).toBeLessThan(60);
    await rerender(<Chat items={items} windowing={false} />);
    expect(messages(scroller)).toHaveLength(200);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(1);
  });

  it("draws the messages a scroll reaches, in order, and drops the ones it leaves", async () => {
    const { scroller } = await render(<Chat items={conversation(1000, 0, true)} />);
    await scrollTo(scroller, scroller.scrollHeight / 2);
    const drawn = ids(scroller).filter((id) => id !== 999);
    expect(drawn).toEqual(drawn.map((_, index) => drawn[0]! + index));
    expect(drawn.length).toBeLessThan(60);
    // What is drawn reaches past the view both ways, and every message the view shows is drawn.
    const view = scroller.getBoundingClientRect();
    const first = document.getElementById(`m${drawn[0]}`)!.getBoundingClientRect();
    const last = document.getElementById(`m${drawn.at(-1)}`)!.getBoundingClientRect();
    expect(first.top).toBeLessThan(view.top - 400);
    expect(last.bottom).toBeGreaterThan(view.bottom + 400);
    // The newest stays drawn, for what arrives next.
    expect(document.getElementById("m999")).not.toBeNull();
    // Far up, the first messages draw, and those the scroll left go.
    await scrollTo(scroller, 0);
    expect(ids(scroller)[0]).toBe(0);
    expect(ids(scroller)).not.toContain(drawn[0]);
  });

  it("keeps the reader's place while messages above are measured, scrolling up through them", async () => {
    const { scroller } = await render(<Chat items={conversation(1000, 0, true)} />);
    // Up a screen at a time: each step draws messages the list had only estimated, above the reader.
    for (let step = 0; step < 6; step++) {
      const top = scroller.scrollTop;
      await act(async () => void (scroller.scrollTop = top - 380));
      const reading = firstVisible(scroller);
      await settle(scroller);
      expect(reading.message.isConnected).toBe(true);
      expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the reader's place when a page of older messages loads above, putting it in at once", async () => {
    let items = conversation(500, 0, true);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await scrollTo(scroller, 400);
    const reading = firstVisible(scroller);
    let moved = 0;
    let watching = true;
    const watch = () => {
      moved = Math.max(moved, Math.abs(reading.message.getBoundingClientRect().top - reading.top));
      if (watching) requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    for (let page = 1; page <= 3; page++) {
      items = [...conversation(100, -100 * page, true), ...items];
      await rerender(<Chat items={items} />);
    }
    watching = false;
    // Held in every frame, to within WebKit's whole-pixel scrolling of space whose height has fractions.
    expect(moved).toBeLessThanOrEqual(ROUNDING);
    // Put in at once, as space: a page draws no more messages than the view needs.
    expect(messages(scroller).length).toBeLessThan(60);
    expect(document.getElementById("m-300")).toBeNull();
  });

  it("follows new messages and streaming text at the bottom, and shows Jump to latest once the reader scrolls up", async () => {
    let items = conversation(300, 0, true);
    const { scroller, rerender } = await render(<Chat items={items} />);
    for (let next = 300; next < 305; next++) {
      items = [...items, { id: next, text: `Message ${next}` }];
      await rerender(<Chat items={items} />);
      expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    }
    items = [...items, { id: 305, text: "Thinking", streaming: true }];
    await rerender(<Chat items={items} />);
    items = [...items.slice(0, -1), { id: 305, text: "Thinking it through, ".repeat(30), streaming: true }];
    await rerender(<Chat items={items} />);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
    await scrollTo(scroller, 2000);
    await expect.element(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    // Up the conversation, a new message moves nothing.
    const reading = firstVisible(scroller);
    await rerender(<Chat items={[...items, { id: 306, text: "Message 306" }]} />);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(1);
  });

  it("jumps to the newest message from far up, and follows new messages again", async () => {
    const actions = createRef<MessageListActions>();
    let items = conversation(1000, 0, true);
    const { scroller, rerender } = await render(<Chat items={items} actionsRef={actions} />);
    await scrollTo(scroller, 0);
    await act(async () => actions.current!.jumpToNewest());
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(inView(scroller, "m999")).toBe(true);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
    items = [...items, { id: 1000, text: "Message 1000" }];
    await rerender(<Chat items={items} actionsRef={actions} />);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    // The button does the same, and gives the newest message focus.
    await scrollTo(scroller, 0);
    await userEvent.click(page.getByRole("button", { name: "Jump to latest" }));
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(document.activeElement).toBe(document.getElementById("m1000"));
  });

  it("reveals a message that is not drawn, by its id, in the middle of the view, and focuses it when asked", async () => {
    const actions = createRef<MessageListActions>();
    const { scroller } = await render(<Chat items={conversation(1000, 0, true)} actionsRef={actions} />);
    expect(document.getElementById("m120")).toBeNull();
    let found = false;
    await act(async () => void (found = actions.current!.reveal("m120")));
    await settle(scroller);
    expect(found).toBe(true);
    expect(Math.abs(offCentre(scroller, "m120"))).toBeLessThanOrEqual(ROUNDING);
    expect(document.activeElement).toBe(document.body);
    // The list stops following new messages there.
    expect(distanceFromBottom(scroller)).toBeGreaterThan(1000);
    await act(async () => void actions.current!.reveal("m700", { focus: true, block: "start" }));
    await settle(scroller);
    expect(document.activeElement).toBe(document.getElementById("m700"));
    expect(Math.abs(document.getElementById("m700")!.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8)).toBeLessThanOrEqual(ROUNDING);
    // In a whole list too.
    const whole = createRef<MessageListActions>();
    const other = await render(<Chat items={conversation(30)} actionsRef={whole} windowing={false} />);
    await act(async () => void whole.current!.reveal("m3", { focus: true }));
    await settle(other.scroller);
    expect(Math.abs(offCentre(other.scroller, "m3"))).toBeLessThanOrEqual(ROUNDING);
    expect(document.activeElement).toBe(document.getElementById("m3"));
  });

  it("reveals nothing, and says so, for an id no message has", async () => {
    const actions = createRef<MessageListActions>();
    const { scroller } = await render(<Chat items={conversation(200)} actionsRef={actions} />);
    const top = scroller.scrollTop;
    expect(actions.current!.reveal("nowhere")).toBe(false);
    await settle(scroller);
    expect(scroller.scrollTop).toBe(top);
  });

  it("reveals a message once it goes in, and gives up on one deleted before it shows", async () => {
    const actions = createRef<MessageListActions>();
    let items = conversation(40, 100);
    const { scroller } = await render(<Chat items={items} actionsRef={actions} windowing={false} />);
    // Deleted in the same render it was asked for: the list stays at its end, following, and nothing is left waiting.
    await act(async () => {
      actions.current!.reveal("m110");
      roots.at(-1)!.render(<Chat items={items.filter((item) => item.id !== 110)} actionsRef={actions} windowing={false} />);
    });
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    // A page of older messages goes into a whole list a few at a time: the oldest shows once it is in.
    items = [...conversation(100), ...items];
    await act(async () => roots.at(-1)!.render(<Chat items={items} actionsRef={actions} windowing={false} />));
    expect(document.getElementById("m0")).toBeNull();
    await act(async () => void actions.current!.reveal("m0", { focus: true }));
    await expect.poll(() => document.activeElement?.id).toBe("m0");
    await settle(scroller);
    expect(inView(scroller, "m0")).toBe(true);
  });

  it("reveals a message by an id inside it, or what starts the conversation, and leaves one in view where it is with block nearest", async () => {
    const actions = createRef<MessageListActions>();
    const items = conversation(600, 0, true).map((item) => (item.id === 50 ? { ...item, text: "See the recipe" } : item));
    // Takes an id, and puts it on no element.
    function Pinned(props: { id: string }) {
      return <p data-pinned={props.id.length}>Pinned: the recipe.</p>;
    }
    const { scroller } = await render(
      <Chat
        items={items}
        actionsRef={actions}
        first={<p id="start">The start of your conversation with Ouro.</p>}
        before={(id) =>
          id === 50 ? (
            <Pinned key="pinned" id="pinned" />
          ) : id === 51 ? (
            <p key="code" id="code-51">
              Code from Message 51
            </p>
          ) : id === 598 ? (
            <p key="note">
              <span id="note-598">A note</span> on Message 598
            </p>
          ) : null
        }
      />,
    );
    // An id deep inside what a child draws, found while it is drawn, as the newest messages are.
    await act(async () => void actions.current!.reveal("note-598"));
    await settle(scroller);
    expect(Math.abs(offCentre(scroller, "note-598"))).toBeLessThanOrEqual(ROUNDING);
    // Not drawn, and on an element the child draws: shown at the top of the view, clear of its edge.
    await act(async () => void actions.current!.reveal("start", { block: "start" }));
    await settle(scroller);
    expect(Math.abs(document.getElementById("start")!.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8)).toBeLessThanOrEqual(ROUNDING);
    // Below the view, with block nearest: scrolled up only as far as it takes.
    await act(async () => void actions.current!.reveal("m300", { block: "nearest" }));
    await settle(scroller);
    const bottom = document.getElementById("m300")!.getBoundingClientRect().bottom;
    expect(Math.abs(bottom - (scroller.getBoundingClientRect().bottom - 8))).toBeLessThanOrEqual(ROUNDING);
    // In view already: nothing moves.
    await act(async () => void actions.current!.reveal("m300"));
    await settle(scroller);
    const top = scroller.scrollTop;
    await act(async () => void actions.current!.reveal("m300", { block: "nearest" }));
    await settle(scroller);
    expect(Math.abs(scroller.scrollTop - top)).toBeLessThanOrEqual(ROUNDING);
    // An id inside what a child draws, found while it is drawn.
    await act(async () => void actions.current!.reveal("code-51"));
    await settle(scroller);
    expect(Math.abs(offCentre(scroller, "code-51"))).toBeLessThanOrEqual(ROUNDING);
    // A child that takes an id and draws no element with it: the list can find no element to show, and moves nothing.
    const still = scroller.scrollTop;
    let found = false;
    await act(async () => void (found = actions.current!.reveal("pinned")));
    await settle(scroller);
    expect(found).toBe(true);
    expect(scroller.scrollTop).toBe(still);
  });

  it("shows the quoted message far up the conversation when the reader presses its quote", async () => {
    const actions = createRef<MessageListActions>();
    const items = [...conversation(800, 0, true), { id: 800, text: "Yes, that one.", quote: 42 }];
    const { scroller } = await render(<Chat items={items} actionsRef={actions} onQuote={(id) => actions.current!.reveal(`m${id}`, { focus: true })} />);
    await userEvent.click(page.getByRole("button", { name: /Quoting Ana/ }));
    await settle(scroller);
    expect(document.activeElement).toBe(document.getElementById("m42"));
    expect(Math.abs(offCentre(scroller, "m42"))).toBeLessThanOrEqual(ROUNDING);
  });

  it("finds a message by its text among the app's messages, which the page does not hold, and reveals it", async () => {
    const actions = createRef<MessageListActions>();
    const items = conversation(1500, 0, true).map((item) => (item.id === 77 ? { ...item, text: "The ferry leaves at noon." } : item));
    const { scroller } = await render(<Chat items={items} actionsRef={actions} />);
    // The page holds only what is drawn, so the app searches its own messages.
    expect(scroller.textContent).not.toContain("ferry");
    const match = items.find((item) => item.text.includes("ferry"))!;
    await act(async () => void actions.current!.reveal(`m${match.id}`));
    await settle(scroller);
    expect(inView(scroller, "m77")).toBe(true);
    expect(scroller.textContent).toContain("ferry");
  });

  it("opens at an initialAnchor far up the conversation, never drawing the newest first", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    // What the first draw shows: the anchor, in the list's view, before the browser paints.
    let first = Number.NaN;
    const observer = new MutationObserver(() => {
      const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]");
      if (scroller && Number.isNaN(first) && document.getElementById("m200")) first = Math.abs(offCentre(scroller, "m200"));
    });
    observer.observe(host, { childList: true, subtree: true });
    await act(async () => root.render(<Chat items={conversation(2000, 0, true)} initialAnchor="m200" />));
    observer.disconnect();
    const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    await settle(scroller);
    expect(first).toBeLessThanOrEqual(ROUNDING);
    expect(Math.abs(offCentre(scroller, "m200"))).toBeLessThanOrEqual(ROUNDING);
    expect(distanceFromBottom(scroller)).toBeGreaterThan(10_000);
  });

  it("moves focus to the first message with Home and back to the newest with End, drawing the message it reaches", async () => {
    const { scroller } = await render(<Chat items={conversation(1000, 0, true)} first={<p>The start of your conversation with Ouro.</p>} />);
    await act(async () => document.getElementById("m999")!.focus());
    await userEvent.keyboard("{Home}");
    await settle(scroller);
    expect(document.activeElement).toBe(document.getElementById("m0"));
    expect(inView(scroller, "m0")).toBe(true);
    // What starts the conversation is no message: the count leaves it out once it is drawn.
    expect(document.getElementById("m0")!.getAttribute("aria-posinset")).toBe("1");
    expect(document.getElementById("m0")!.getAttribute("aria-setsize")).toBe("1000");
    await userEvent.keyboard("{End}");
    await settle(scroller);
    expect(document.activeElement).toBe(document.getElementById("m999"));
    expect(inView(scroller, "m999")).toBe(true);
    expect(document.getElementById("m999")!.getAttribute("aria-posinset")).toBe("1000");
    // Known now to hold no message, what starts the conversation is passed over at once.
    await userEvent.keyboard("{Home}");
    await settle(scroller);
    expect(document.activeElement).toBe(document.getElementById("m0"));
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(document.getElementById("m0"));
  });

  it("walks up past the messages first drawn with the Up arrow, each one drawn and shown as focus reaches it", async () => {
    const { scroller } = await render(<Chat items={conversation(400, 0, true)} />);
    await act(async () => document.getElementById("m399")!.focus());
    for (let step = 1; step <= 40; step++) {
      await userEvent.keyboard("{ArrowUp}");
      await expect.poll(() => document.activeElement?.id).toBe(`m${399 - step}`);
    }
    await settle(scroller);
    expect(inView(scroller, "m359")).toBe(true);
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(() => document.activeElement?.id).toBe("m360");
  });

  it("keeps the message with focus drawn, and focus on it, as the reader scrolls far away", async () => {
    const { scroller } = await render(<Chat items={conversation(1000, 0, true)} />);
    await act(async () => document.getElementById("m995")!.focus());
    await scrollTo(scroller, 0);
    expect(document.getElementById("m995")).not.toBeNull();
    expect(document.activeElement).toBe(document.getElementById("m995"));
    expect(scroller.scrollTop).toBe(0);
  });

  it("announces a new message once, and never a message drawn again as the reader scrolls", async () => {
    let items = conversation(500, 0, true);
    const { scroller, rerender, live } = await render(<Chat items={items} />);
    const spoken = recordAnnouncements(live);
    await scrollTo(scroller, 0);
    await scrollTo(scroller, scroller.scrollHeight);
    expect(spoken).toEqual([]);
    items = [...items, { id: 501, text: "Preheat the oven." }];
    await rerender(<Chat items={items} />);
    expect(spoken).toEqual(["Ouro: Preheat the oven."]);
    // Scrolled far up, two arrive at once: both are heard, and drawing the end again later says nothing more.
    await scrollTo(scroller, 0);
    items = [...items, { id: 503, text: "Then the tray." }, { id: 505, text: "Then the timer." }];
    await rerender(<Chat items={items} />);
    expect(spoken).toEqual(["Ouro: Preheat the oven.", "Ouro: Then the tray.", "Ouro: Then the timer."]);
    await scrollTo(scroller, scroller.scrollHeight);
    expect(spoken).toHaveLength(3);
    // The newest going, far up the conversation, draws the one before it again, which is not new.
    await scrollTo(scroller, 0);
    await rerender(<Chat items={items.slice(0, -1)} />);
    expect(document.getElementById("m503")).not.toBeNull();
    expect(spoken).toHaveLength(3);
  });

  it("moves past day headings with the arrow keys, drawing the message it reaches, and counts only messages", async () => {
    const items = conversation(1000, 0, true);
    const day = (id: number) => (id % 10 === 0 ? <p key={`day-${id}`}>Day {id / 10}</p> : null);
    function Typing() {
      return null;
    }
    const { scroller } = await render(
      <MessageList label="Conversation" style={{ height: 400, width: 360 }} initialAnchor="m200">
        {items.flatMap((item) => [
          day(item.id),
          item.id === 999 ? <Typing key="typing" /> : null,
          <Message key={item.id} id={`m${item.id}`} role={item.id % 2 ? "assistant" : "user"} name={item.id % 2 ? "Ouro" : "Ana"}>
            {item.text}
          </Message>,
        ])}
      </MessageList>,
    );
    // Opened far up, the newest is drawn alone at the end; focus on it, from code that does not scroll to it.
    expect(document.getElementById("m998")).toBeNull();
    await act(async () => document.getElementById("m999")!.focus({ preventScroll: true }));
    // Up: past what draws nothing, to the message before, drawn and shown as it takes focus.
    await userEvent.keyboard("{ArrowUp}");
    await expect.poll(() => document.activeElement?.id).toBe("m998");
    await settle(scroller);
    expect(inView(scroller, "m998")).toBe(true);
    // Up across a day's heading.
    for (let step = 0; step < 9; step++) await userEvent.keyboard("{ArrowUp}");
    await expect.poll(() => document.activeElement?.id).toBe("m989");
    await userEvent.keyboard("{ArrowUp}");
    await expect.poll(() => document.activeElement?.id).toBe("m988");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect.poll(() => document.activeElement?.id).toBe("m990");
    // The headings drawn so far are counted out: the count reaches 1,000 once every one has been drawn.
    expect(Number(document.getElementById("m990")!.getAttribute("aria-setsize"))).toBeLessThan(1100);
    expect(Number(document.getElementById("m990")!.getAttribute("aria-setsize"))).toBeGreaterThanOrEqual(1000);
  });

  it("counts each message of a child that holds two, and moves between them", async () => {
    const items = conversation(200);
    const { scroller } = await render(
      <MessageList label="Conversation" style={{ height: 400, width: 360 }}>
        {items.map((item) =>
          item.id === 198 ? (
            <div key="pair" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Message id="m198" role="user" name="Ana">
                {item.text}
              </Message>
              <Message id="m198b" role="user" name="Ana">
                And another thing.
              </Message>
            </div>
          ) : (
            <Message key={item.id} id={`m${item.id}`} role={item.id % 2 ? "assistant" : "user"} name="Ana">
              {item.text}
            </Message>
          ),
        )}
      </MessageList>,
    );
    expect(document.getElementById("m198b")!.getAttribute("aria-posinset")).toBe("200");
    expect(document.getElementById("m199")!.getAttribute("aria-posinset")).toBe("201");
    expect(document.getElementById("m199")!.getAttribute("aria-setsize")).toBe("201");
    await act(async () => document.getElementById("m199")!.focus());
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement?.id).toBe("m198b");
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement?.id).toBe("m198");
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement?.id).toBe("m198b");
    await settle(scroller);
  });

  it("keeps drawing what is near the view when the messages it drew are deleted", async () => {
    const items = conversation(400, 0, true);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await scrollTo(scroller, 0);
    await rerender(<Chat items={items.slice(30)} />);
    await scrollTo(scroller, 0);
    expect(ids(scroller)[0]).toBe(30);
    expect(inView(scroller, "m30")).toBe(true);
  });

  it("waits to measure while inside a hidden panel, and windows once it shows", async () => {
    const panel = document.createElement("div");
    panel.hidden = true;
    document.body.append(panel);
    mounted.push(panel);
    const root = createRoot(panel);
    roots.push(root);
    await act(async () => root.render(<Chat items={conversation(500, 0, true)} />));
    const scroller = panel.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    await act(async () => void scroller.dispatchEvent(new Event("scroll")));
    expect(messages(scroller).length).toBeLessThan(40);
    await act(async () => void (panel.hidden = false));
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(inView(scroller, "m499")).toBe(true);
    expect(messages(scroller).length).toBeLessThan(60);
  });

  it("still windows a long list with stray text among its messages", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { scroller } = await render(
      <MessageList label="Conversation" style={{ height: 400, width: 360 }}>
        {"Older messages"}
        {conversation(100).map((item) => (
          <Message key={item.id} id={`m${item.id}`} role="user" name="Ana">
            {item.text}
          </Message>
        ))}
      </MessageList>,
    );
    expect(warn).toHaveBeenCalled();
    expect(messages(scroller).length).toBeLessThan(60);
    expect(inView(scroller, "m99")).toBe(true);
  });

  it("keeps a button before the messages drawn, and focus on it, as older messages load below it", async () => {
    let items = conversation(200, 0, true);
    const loadOlder = <button key="older">Load older messages</button>;
    const { scroller, rerender } = await render(<Chat items={items} first={loadOlder} />);
    await scrollTo(scroller, 0);
    await act(async () => page.getByRole("button", { name: "Load older messages" }).element().focus());
    // Older history goes in between the button and the messages, and the reader's place holds: the button is far above.
    items = [...conversation(300, -300, true), ...items];
    await rerender(<Chat items={items} first={loadOlder} />);
    expect(document.activeElement?.textContent).toBe("Load older messages");
    expect(scroller.scrollTop).toBeGreaterThan(10_000);
  });

  it("announces a reply that finishes streaming out of view, though a newer message came after it", async () => {
    let items = [...conversation(300, 0, true), { id: 301, text: "Thinking", streaming: true }];
    const { scroller, rerender, live } = await render(<Chat items={items} />);
    const spoken = recordAnnouncements(live);
    items = [...items, { id: 302, text: "Never mind." }];
    await rerender(<Chat items={items} />);
    await scrollTo(scroller, 0);
    expect(document.getElementById("m301")).not.toBeNull();
    items = items.map((item) => (item.id === 301 ? { id: 301, text: "Done thinking." } : item));
    await rerender(<Chat items={items} />);
    expect(spoken).toEqual(["Ouro: Done thinking."]);
    // Heard, it is drawn no longer.
    await expect.poll(() => document.getElementById("m301")).toBeNull();
  });

  it("scrolls through a message taller than the list with the arrow keys before moving on", async () => {
    const items = conversation(300, 0, true).map((item) => (item.id === 150 ? { ...item, text: "A long reply. ".repeat(400) } : item));
    const actions = createRef<MessageListActions>();
    const { scroller } = await render(<Chat items={items} actionsRef={actions} />);
    await act(async () => void actions.current!.reveal("m150", { focus: true, block: "start" }));
    await settle(scroller);
    const top = scroller.scrollTop;
    await userEvent.keyboard("{ArrowDown}");
    await settle(scroller);
    expect(document.activeElement?.id).toBe("m150");
    expect(scroller.scrollTop - top).toBeCloseTo(40, 0);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    await settle(scroller);
    expect(document.activeElement?.id).toBe("m149");
  });

  it("opens a conversation that fills a list holding only a greeting at its end, drawing only the newest", async () => {
    const greeting = <p key="greeting">Ask Ouro anything.</p>;
    const { scroller, host, rerender } = await render(<Chat items={[]} first={greeting} />);
    let added = 0;
    const counting = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) added += node.querySelectorAll('[data-ouro="message"]').length;
    });
    counting.observe(host, { childList: true, subtree: true });
    await rerender(<Chat items={conversation(2000, 0, true)} first={greeting} />);
    counting.disconnect();
    expect(added).toBeLessThan(60);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  });

  it("moves focus to the message now in the place of a focused message that is deleted, wherever the window has gone", async () => {
    let items = conversation(1000, 0, true);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await act(async () => document.getElementById("m999")!.focus());
    for (let step = 0; step < 5; step++) await userEvent.keyboard("{ArrowUp}");
    await expect.poll(() => document.activeElement?.id).toBe("m994");
    await settle(scroller);
    items = items.filter((item) => item.id !== 994);
    await rerender(<Chat items={items} />);
    expect(document.activeElement?.id).toBe("m995");
    // Scrolled far from it, the message in its place is drawn first.
    await act(async () => void document.getElementById("m995")!.focus());
    await scrollTo(scroller, 0);
    items = items.filter((item) => item.id !== 995);
    await rerender(<Chat items={items} />);
    await expect.poll(() => document.activeElement?.id).toBe("m996");
    expect(inView(scroller, "m996")).toBe(true);
    // Messages not drawn deleted far above, then the focused one: focus goes to the one after it.
    items = items.filter((item) => item.id > 20);
    await rerender(<Chat items={items} />);
    items = items.filter((item) => item.id !== 996);
    await rerender(<Chat items={items} />);
    await expect.poll(() => document.activeElement?.id).toBe("m997");
    // The newest deleted while focused: focus goes to the newest left.
    await act(async () => document.getElementById("m999")!.focus());
    items = items.filter((item) => item.id !== 999);
    await rerender(<Chat items={items} />);
    await expect.poll(() => document.activeElement?.id).toBe("m998");
  });

  it("follows the message the reader sends after code took the list to its end in the same moment", async () => {
    let items = conversation(500, 0, true);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await scrollTo(scroller, 0);
    items = [...items, { id: 500, text: "Sent from far up." }];
    await act(async () => {
      scroller.scrollTop = scroller.scrollHeight;
      roots.at(-1)!.render(<Chat items={items} />);
    });
    await rerender(<Chat items={items} />);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(inView(scroller, "m500")).toBe(true);
  });

  it("draws the newest screenful in server HTML and hydrates it without a warning", async () => {
    const items = conversation(2000);
    const html = renderToString(<Chat items={items} />);
    const drawn = html.match(/data-ouro="message"/g)!.length;
    expect(drawn).toBeGreaterThan(5);
    expect(drawn).toBeLessThan(40);
    expect(html).toContain('id="m1999"');
    expect(html).not.toContain('id="m0"');
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    mounted.push(host);
    const recoverable: unknown[] = [];
    await act(async () => void roots.push(hydrateRoot(host, <Chat items={items} />, { onRecoverableError: (error) => recoverable.push(error) })));
    const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    await settle(scroller);
    expect(recoverable).toEqual([]);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  });
});
