import { Fragment, createRef, type ReactNode, type Ref } from "react";
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

/**
 * Checks that the messages drawn, besides those kept, are exactly the band: one run, from the first that ends below 800px
 * above the view to the last that starts above 800px below it.
 */
function expectBand(scroller: HTMLElement, kept: readonly number[]) {
  const drawn = ids(scroller).filter((id) => !kept.includes(id));
  expect(drawn).toEqual(drawn.map((_, index) => drawn[0]! + index));
  const view = scroller.getBoundingClientRect();
  const first = document.getElementById(`m${drawn[0]}`)!.getBoundingClientRect();
  const last = document.getElementById(`m${drawn.at(-1)}`)!.getBoundingClientRect();
  expect(first.bottom).toBeGreaterThan(view.top - 800);
  expect(first.top - 16).toBeLessThanOrEqual(view.top - 800 + 1);
  expect(last.top).toBeLessThan(view.bottom + 800);
  expect(last.bottom + 16).toBeGreaterThanOrEqual(view.bottom + 800 - 1);
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
      // Elements only: no stray text among them.
      expect([...content.childNodes].every((node) => node.nodeType === Node.ELEMENT_NODE)).toBe(true);
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
      expect(line(`m${count - 1}`).content).not.toBe("none");
      expect(line(`m${count - 1}`).borderTopStyle).toBe("solid");
      expect(line(`m${count - 2}`).borderTopWidth).toBe("1px");
      // Across the text, from its start to the end, midway between the posts, in the theme's border colour, and only on top.
      const hairline = line(`m${count - 1}`);
      const body = document.getElementById(`m${count - 1}`)!.querySelector("[data-ouro-message-body]")!.getBoundingClientRect();
      expect(hairline.position).toBe("absolute");
      expect(parseFloat(hairline.width)).toBeCloseTo(body.width, 0);
      expect(hairline.top).toBe("-12px");
      expect(hairline.borderLeftWidth).toBe("0px");
      const probe = document.createElement("span");
      probe.style.color = "var(--border)";
      scroller.append(probe);
      expect(hairline.borderTopColor).toBe(getComputedStyle(probe).color);
      probe.remove();
      // The first post drawn after space kept for others has none until the one before it draws.
      const first = messages(scroller)[0]!;
      if (count === 3) expect(line(first.id).content).toBe("none");
      await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    }
  });

  it("keeps the reader's place when a short conversation that took a long one's place grows long", async () => {
    const { scroller, rerender } = await render(<Chat items={conversation(500, 0, true)} />);
    // Another conversation, short, in the same list; the reader scrolls up in it, and older history loads above.
    await rerender(<Chat items={conversation(40, 2000, true)} />);
    await scrollTo(scroller, 400);
    const reading = firstVisible(scroller);
    await rerender(<Chat items={conversation(140, 1900, true)} />);
    expect(reading.message.isConnected).toBe(true);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
  });

  it("measures each child by what it draws, its margins too, so once scrolled through it is exactly as tall as the whole list", async () => {
    // Messages that follow on (a negative margin), an app's own items with a margin below, children with a hidden part,
    // and, last, a child that draws nothing.
    function Typing() {
      return null;
    }
    const children = conversation(240, 0, true).map((item) => {
      const message = (
        <Message id={`m${item.id}`} role="assistant" name="Ouro" continued={item.id % 3 !== 0}>
          {item.text}
        </Message>
      );
      if (item.id % 7 === 0)
        return (
          <Fragment key={item.id}>
            <span hidden />
            {message}
          </Fragment>
        );
      if (item.id === 120)
        return (
          <Fragment key={item.id}>
            <Typing />
          </Fragment>
        );
      if (item.id % 11 === 0)
        return (
          <article key={item.id} id={`m${item.id}`} data-ouro-message-list-item="" data-role="assistant" style={{ marginBottom: 10 }}>
            <span data-ouro-message-author="">Ouro</span>
            <p data-ouro-message-content="">{item.text}</p>
          </article>
        );
      return <Fragment key={item.id}>{message}</Fragment>;
    });
    const list = (windowing: boolean) => (
      <MessageList label="Conversation" style={{ height: 400, width: 360 }} windowing={windowing}>
        {[...children, <Typing key="typing" />]}
      </MessageList>
    );
    const whole = await render(list(false));
    const { scroller } = await render(list(true));
    expect(messages(scroller).length).toBeLessThan(60);
    for (let top = 0; top < scroller.scrollHeight; top += 900) await scrollTo(scroller, top);
    await scrollTo(scroller, scroller.scrollHeight);
    expect(Math.abs(scroller.scrollHeight - whole.scroller.scrollHeight)).toBeLessThanOrEqual(1);
    expect(messages(scroller).length).toBeLessThan(60);
  });

  it("springs no message as it reveals one, though the reader's wheel just turned", async () => {
    const actions = createRef<MessageListActions>();
    const { scroller } = await render(<Chat items={conversation(300, 0, true)} actionsRef={actions} />);
    // Near the top, measured, a little way down.
    await scrollTo(scroller, 0);
    await scrollTo(scroller, 100);
    expect(scroller.scrollTop).toBe(100);
    const below = messages(scroller).find((message) => message.getBoundingClientRect().top > scroller.getBoundingClientRect().bottom)!;
    let sprung = false;
    const watch = new MutationObserver(() => (sprung ||= scroller.querySelector("[data-ouro-settling]") !== null));
    watch.observe(scroller, { attributes: true, subtree: true, attributeFilter: ["data-ouro-settling"] });
    await act(async () => {
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 0, clientY: scroller.getBoundingClientRect().top + 10 }));
      void actions.current!.reveal(below.id);
    });
    await settle(scroller);
    watch.disconnect();
    expect(scroller.scrollTop).toBeGreaterThan(100);
    expect(sprung).toBe(false);
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
    // With a child that draws nothing among them, as a typing indicator does while no one types.
    function Typing() {
      return null;
    }
    const { scroller } = await render(<Chat items={conversation(1000, 0, true)} before={(id) => (id === 500 ? <Typing key="typing" /> : null)} />);
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
    // Exactly the band: the first drawn ends past 800px above the view, the next one down would start 800px or more below it
    // (each message 16px after the last), and the messages either side of the run lie outside those edges.
    expect(first.bottom).toBeGreaterThan(view.top - 800);
    expect(last.bottom + 16).toBeGreaterThanOrEqual(view.bottom + 800 - 1);
    expect(last.top).toBeLessThan(view.bottom + 800);
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
    // From far up again, with a message arriving before the browser reports the jump's scroll: followed too.
    await scrollTo(scroller, 0);
    items = [...items, { id: 1001, text: "Message 1001" }];
    await act(async () => {
      actions.current!.jumpToNewest();
      roots.at(-1)!.render(<Chat items={items} actionsRef={actions} />);
    });
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    items = items.slice(0, -1);
    await rerender(<Chat items={items} actionsRef={actions} />);
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
    let found = Promise.resolve(false);
    await act(async () => void (found = actions.current!.reveal("m120")));
    expect(await found).toBe(true);
    await settle(scroller);
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

  it("reveals a row component that takes no id by its key, and opens at one by its key, resolving once it is in place", async () => {
    // An app's row: memoized, keyed by the message's id, taking no id prop itself; the id it gives Message is its own.
    function Row({ item }: { item: Item }) {
      return (
        <Message id={`row-${item.id}`} role={item.id % 2 ? "assistant" : "user"} name="Ana">
          {item.text}
        </Message>
      );
    }
    const actions = createRef<MessageListActions>();
    const rows = (anchor?: string) => (
      <MessageList label="Conversation" style={{ height: 400, width: 360 }} actionsRef={actions} initialAnchor={anchor}>
        {[<p key="older=1">Older messages load above.</p>, ...conversation(1000, 0, true).map((item) => <Row key={`m:${item.id}`} item={item} />)]}
      </MessageList>
    );
    const { scroller } = await render(rows("m:300"));
    expect(Math.abs(offCentre(scroller, "row-300"))).toBeLessThanOrEqual(ROUNDING);
    // By key, though the row takes no id and is not drawn; resolved once it is drawn, in place and focused.
    expect(document.getElementById("row-700")).toBeNull();
    let found = Promise.resolve(false);
    await act(async () => void (found = actions.current!.reveal("m:700", { focus: true })));
    expect(await found).toBe(true);
    expect(document.activeElement?.id).toBe("row-700");
    expect(inView(scroller, "row-700")).toBe(true);
    // By the id its row gives Message, once drawn.
    await act(async () => void (found = actions.current!.reveal("row-701", { block: "start" })));
    expect(await found).toBe(true);
    // A child that holds no message, by its key: shown itself.
    await act(async () => void (found = actions.current!.reveal("older=1", { block: "start" })));
    expect(await found).toBe(true);
    await settle(scroller);
    const older = [...scroller.querySelectorAll("p")].find((node) => node.textContent === "Older messages load above.")!;
    expect(Math.abs(older.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8)).toBeLessThanOrEqual(ROUNDING);
    // A reveal another takes the place of says so.
    let first = Promise.resolve(true);
    await act(async () => {
      first = actions.current!.reveal("m:500");
      found = actions.current!.reveal("m:900");
    });
    expect(await first).toBe(false);
    expect(await found).toBe(true);
    await settle(scroller);
    expect(inView(scroller, "row-900")).toBe(true);
  });

  it("keeps a heading revealed far below the messages drawn in place while the messages around it are measured", async () => {
    const actions = createRef<MessageListActions>();
    const { scroller } = await render(
      <Chat items={conversation(600, 0, true)} actionsRef={actions} before={(id) => (id === 400 ? <p key="day" id="day-400">Tuesday</p> : null)} />,
    );
    // From the top, where the messages drawn are all above where the heading goes.
    await scrollTo(scroller, 0);
    await act(async () => void actions.current!.reveal("day-400"));
    await settle(scroller);
    expect(Math.abs(offCentre(scroller, "day-400"))).toBeLessThanOrEqual(ROUNDING);
  });

  it("reveals nothing, and says so, for an id no message has", async () => {
    const actions = createRef<MessageListActions>();
    const { scroller } = await render(<Chat items={conversation(200)} actionsRef={actions} />);
    const top = scroller.scrollTop;
    expect(await actions.current!.reveal("nowhere")).toBe(false);
    await settle(scroller);
    expect(scroller.scrollTop).toBe(top);
    // Nor does it take the place of a reveal on its way.
    let pending = Promise.resolve(false);
    await act(async () => {
      pending = actions.current!.reveal("m50");
      void actions.current!.reveal("nowhere");
    });
    expect(await pending).toBe(true);
  });

  it("reveals a message once it goes in, and gives up on one deleted before it shows", async () => {
    const actions = createRef<MessageListActions>();
    let items = conversation(40, 100);
    const { scroller } = await render(<Chat items={items} actionsRef={actions} windowing={false} />);
    // Deleted in the same render it was asked for: the list stays at its end, following, and the reveal says it found nothing.
    let gone = Promise.resolve(true);
    await act(async () => {
      gone = actions.current!.reveal("m110");
      roots.at(-1)!.render(<Chat items={items.filter((item) => item.id !== 110)} actionsRef={actions} windowing={false} />);
    });
    expect(await gone).toBe(false);
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
    // A child that takes an id and draws no element with it: the list finds no element to show, moves nothing, and says so.
    const still = scroller.scrollTop;
    let found = Promise.resolve(true);
    await act(async () => void (found = actions.current!.reveal("pinned")));
    expect(await found).toBe(false);
    await settle(scroller);
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
    let around = false;
    const observer = new MutationObserver(() => {
      const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]");
      if (!scroller || !Number.isNaN(first) || !document.getElementById("m200")) return;
      first = Math.abs(offCentre(scroller, "m200"));
      // The messages either side are drawn with it, filling the view.
      around = document.getElementById("m196") !== null && document.getElementById("m204") !== null;
    });
    observer.observe(host, { childList: true, subtree: true });
    await act(async () => root.render(<Chat items={conversation(2000, 0, true)} initialAnchor="m200" />));
    observer.disconnect();
    const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    await settle(scroller);
    expect(first).toBeLessThanOrEqual(ROUNDING);
    expect(around).toBe(true);
    expect(Math.abs(offCentre(scroller, "m200"))).toBeLessThanOrEqual(ROUNDING);
    expect(distanceFromBottom(scroller)).toBeGreaterThan(10_000);
  });

  it("opens at its first message when initialAnchor names it", async () => {
    const { scroller } = await render(<Chat items={conversation(2000, 0, true)} initialAnchor="m0" />);
    expect(inView(scroller, "m0")).toBe(true);
    expect(scroller.scrollTop).toBeLessThanOrEqual(ROUNDING);
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
    // Past the newest, a page down goes nowhere.
    await userEvent.keyboard("{PageDown}");
    expect(document.activeElement).toBe(document.getElementById("m999"));
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
    const actions = createRef<MessageListActions>();
    const { scroller } = await render(
      <MessageList label="Conversation" style={{ height: 400, width: 360 }} actionsRef={actions}>
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
    // Revealed by the second's id, that one; by the child's key, its first.
    await act(async () => void actions.current!.reveal("m198b", { focus: true }));
    await expect.poll(() => document.activeElement?.id).toBe("m198b");
    await act(async () => void actions.current!.reveal("pair", { focus: true }));
    await expect.poll(() => document.activeElement?.id).toBe("m198");
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
    // And again, focus where the list put it.
    items = items.filter((item) => item.id !== 995);
    await rerender(<Chat items={items} />);
    await expect.poll(() => document.activeElement?.id).toBe("m996");
    items = [...items.slice(0, -4), { id: 995, text: "Message 995" }, ...items.slice(-4)];
    await rerender(<Chat items={items} />);
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

  it("announces a reply far up the conversation that streams again, once it finishes", async () => {
    let items = conversation(300, 0, true);
    const { scroller, rerender, live } = await render(<Chat items={items} />);
    const spoken = recordAnnouncements(live);
    await scrollTo(scroller, 0);
    expect(document.getElementById("m151")).toBeNull();
    // Regenerated where the reader is not: it streams, then finishes.
    items = items.map((item) => (item.id === 151 ? { id: 151, text: "Thinking", streaming: true } : item));
    await rerender(<Chat items={items} />);
    items = items.map((item) => (item.id === 151 ? { id: 151, text: "A better answer." } : item));
    await rerender(<Chat items={items} />);
    expect(spoken).toEqual(["Ouro: A better answer."]);
  });

  it("announces both of two replies that finish streaming out of view", async () => {
    let items = [...conversation(300, 0, true), { id: 301, text: "One", streaming: true }, { id: 303, text: "Two", streaming: true }];
    const { scroller, rerender, live } = await render(<Chat items={items} />);
    const spoken = recordAnnouncements(live);
    items = [...items, { id: 304, text: "Never mind." }];
    await rerender(<Chat items={items} />);
    await scrollTo(scroller, 0);
    items = items.map((item) => (item.id === 301 || item.id === 303 ? { id: item.id, text: `Done ${item.id}.` } : item));
    await rerender(<Chat items={items} />);
    expect(spoken).toEqual(["Ouro: Done 301.", "Ouro: Done 303."]);
  });

  it("hears both of two messages that are the first to arrive, far up the conversation", async () => {
    // Opened far up, at a message found by search: nothing has come or gone since it opened.
    let items = conversation(300, 0, true);
    const { rerender, live } = await render(<Chat items={items} initialAnchor="m40" />);
    const spoken = recordAnnouncements(live);
    items = [...items, { id: 301, text: "Then the tray." }, { id: 303, text: "Then the timer." }];
    await rerender(<Chat items={items} initialAnchor="m40" />);
    expect(spoken).toEqual(["Ouro: Then the tray.", "Ouro: Then the timer."]);
  });

  it("draws what a taller view reaches as the list grows taller, scrolled up", async () => {
    const { scroller, host } = await render(<Chat items={conversation(1000, 0, true)} />);
    await scrollTo(scroller, scroller.scrollHeight / 2);
    const list = host.querySelector<HTMLElement>('[data-ouro="message-list"]')!;
    await act(async () => void (list.style.height = "2400px"));
    await settle(scroller);
    const view = scroller.getBoundingClientRect();
    const drawn = messages(scroller).filter((message) => message.id !== "m999");
    expect(drawn.at(-1)!.getBoundingClientRect().bottom).toBeGreaterThan(view.bottom + 800 - 16 - 1);
  });

  it("draws exactly the band, though the messages far from the end are much longer than the first guess", async () => {
    // Long messages early in the conversation, short ones late: the first guess, from the end, is far too short for the start.
    const items = conversation(1000).map((item) => (item.id < 700 ? { ...item, text: `Message ${item.id}${" a long early message".repeat(20)}` } : item));
    const { scroller } = await render(<Chat items={items} />);
    for (const top of [scroller.scrollHeight / 3, scroller.scrollHeight / 2]) {
      await scrollTo(scroller, top);
      expectBand(scroller, [999]);
    }
  });

  it("scrolls only as far as it takes for a message revealed nearest, at either edge, and to the top of a tall one, in a list down the page", async () => {
    const actions = createRef<MessageListActions>();
    const items = conversation(400, 0, true).map((item) => (item.id === 150 ? { ...item, text: "A long reply. ".repeat(400) } : item));
    const { scroller } = await render(
      <div style={{ paddingTop: 37 }}>
        <Chat items={items} actionsRef={actions} />
      </div>,
    );
    const view = () => scroller.getBoundingClientRect();
    const box = (id: string) => document.getElementById(id)!.getBoundingClientRect();
    const reveal = async (id: string, block: "start" | "nearest") => {
      await act(async () => void actions.current!.reveal(id, { block }));
      await settle(scroller);
    };
    // At its top, clear of the edge; then nudged up past it, back to it.
    await reveal("m300", "start");
    expect(Math.abs(box("m300").top - view().top - 8)).toBeLessThanOrEqual(ROUNDING);
    await scrollTo(scroller, scroller.scrollTop + 4);
    await reveal("m300", "nearest");
    expect(Math.abs(box("m300").top - view().top - 8)).toBeLessThanOrEqual(ROUNDING);
    // From above, to its bottom, clear of the edge; then nudged down past it, back to it.
    await reveal("m306", "nearest");
    expect(Math.abs(box("m306").bottom - view().bottom + 8)).toBeLessThanOrEqual(ROUNDING);
    await scrollTo(scroller, scroller.scrollTop - 4);
    await reveal("m306", "nearest");
    expect(Math.abs(box("m306").bottom - view().bottom + 8)).toBeLessThanOrEqual(ROUNDING);
    // Taller than the list: its top, from below as from above.
    await reveal("m120", "start");
    await reveal("m150", "nearest");
    expect(Math.abs(box("m150").top - view().top - 8)).toBeLessThanOrEqual(ROUNDING);
  });

  it("reveals a message nearly as tall as the list from its top, from below, so its start shows clear of the edge", async () => {
    const actions = createRef<MessageListActions>();
    const { scroller } = await render(<Chat items={conversation(400, 0, true)} actionsRef={actions} />);
    await act(async () => void actions.current!.reveal("m300", { block: "start" }));
    await settle(scroller);
    // Taller than the view less its two margins, but not taller than the view.
    const room = scroller.clientHeight;
    const message = document.getElementById("m300")!;
    message.style.height = `${room - 4}px`;
    await settle(scroller);
    // Up a screen and a bit, so it lies below the view, still drawn.
    await scrollTo(scroller, scroller.scrollTop - room - 100);
    expect(message.getBoundingClientRect().top).toBeGreaterThan(scroller.getBoundingClientRect().bottom);
    await act(async () => void actions.current!.reveal("m300", { block: "nearest" }));
    await settle(scroller);
    expect(Math.abs(message.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8)).toBeLessThanOrEqual(ROUNDING);
  });

  it("places the band by a child that draws a box, not by one first in the list that draws nothing, in a list down the page", async () => {
    function Nothing() {
      return null;
    }
    const { scroller } = await render(
      <div style={{ paddingTop: 300 }}>
        <Chat items={conversation(400, 0, true)} first={<Nothing key="intro" />} />
      </div>,
    );
    await scrollTo(scroller, 0);
    const drawn = ids(scroller).filter((id) => id !== 399);
    expect(drawn[0]).toBe(0);
    expect(drawn).toEqual(drawn.map((_, index) => index));
    const view = scroller.getBoundingClientRect();
    const last = document.getElementById(`m${drawn.at(-1)}`)!.getBoundingClientRect();
    // Within a gap of the overscan's edge: the list counts a gap before the first message, which the empty child leaves out.
    expect(last.top).toBeLessThan(view.bottom + 800 + 16);
    expect(last.bottom + 16).toBeGreaterThanOrEqual(view.bottom + 800 - 1);
  });

  it("leaves Jump to latest hidden when jumpToNewest runs at the end", async () => {
    const actions = createRef<MessageListActions>();
    const { scroller } = await render(<Chat items={conversation(300, 0, true)} actionsRef={actions} />);
    await act(async () => actions.current!.jumpToNewest());
    await settle(scroller);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
  });

  it("draws the newest 20 of many messages that arrive at once far up, so those are heard", async () => {
    let items = conversation(300, 0, true);
    const { scroller, rerender } = await render(<Chat items={items} />);
    await scrollTo(scroller, 0);
    // Which messages go into the page as they arrive: they stay until they are heard.
    const added = new Set<string>();
    const watch = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) for (const message of node.querySelectorAll('[data-ouro="message"]')) added.add(message.id);
    });
    watch.observe(scroller, { childList: true, subtree: true });
    items = [...items, ...Array.from({ length: 30 }, (_, offset) => ({ id: 301 + 2 * offset, text: `Arrived ${offset}.` }))];
    await rerender(<Chat items={items} />);
    watch.disconnect();
    expect(added.has("m319")).toBe(false);
    expect(added.has("m321")).toBe(true);
    expect(added.has("m359")).toBe(true);
  });

  it("reveals a message in a list that does not spring", async () => {
    const actions = createRef<MessageListActions>();
    const { scroller } = await render(
      <MessageList label="Conversation" style={{ height: 400, width: 360 }} actionsRef={actions} springy={false}>
        {conversation(300, 0, true).map((item) => (
          <Message key={item.id} id={`m${item.id}`} role="assistant" name="Ouro">
            {item.text}
          </Message>
        ))}
      </MessageList>,
    );
    let found = Promise.resolve(false);
    await act(async () => void (found = actions.current!.reveal("m40")));
    expect(await found).toBe(true);
    await settle(scroller);
    expect(Math.abs(offCentre(scroller, "m40"))).toBeLessThanOrEqual(ROUNDING);
  });

  it("hands focus on to the next message past a day's heading, or to the first of a child with two, when the focused one is deleted", async () => {
    function Day({ messages }: { messages: Item[] }) {
      return (
        <MessageList label="Conversation" style={{ height: 400, width: 360 }}>
          {messages.flatMap((item) => [
            item.id === 193 ? <p key="day">Wednesday</p> : null,
            item.id === 195 ? (
              <div key="pair" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Message id="m195" role="assistant" name="Ouro">
                  {item.text}
                </Message>
                <Message id="m195b" role="assistant" name="Ouro">
                  And another thing.
                </Message>
              </div>
            ) : (
              <Message key={item.id} id={`m${item.id}`} role="assistant" name="Ouro">
                {item.text}
              </Message>
            ),
          ])}
        </MessageList>
      );
    }
    let items = conversation(200);
    const { rerender } = await render(<Day messages={items} />);
    await act(async () => document.getElementById("m192")!.focus());
    items = items.filter((item) => item.id !== 192);
    await rerender(<Day messages={items} />);
    await expect.poll(() => document.activeElement?.id).toBe("m193");
    await act(async () => document.getElementById("m194")!.focus());
    items = items.filter((item) => item.id !== 194);
    await rerender(<Day messages={items} />);
    await expect.poll(() => document.activeElement?.id).toBe("m195");
  });

  it("hands focus on when the focused message is deleted, after focus left the list and came straight back", async () => {
    let items = conversation(30);
    const { rerender, host } = await render(
      <>
        <button type="button">Outside</button>
        <Chat items={items} />
      </>,
    );
    const outside = host.querySelector("button")!;
    // Out to a control of the app's and back at once, as a menu that closes hands focus back.
    await act(async () => {
      document.getElementById("m28")!.focus();
      outside.focus();
      document.getElementById("m27")!.focus();
    });
    // The list's own timer for focus leaving it, queued first, runs before this one.
    await new Promise((resolve) => setTimeout(resolve));
    items = items.filter((item) => item.id !== 27);
    await rerender(
      <>
        <button type="button">Outside</button>
        <Chat items={items} />
      </>,
    );
    await expect.poll(() => document.activeElement?.id).toBe("m28");
  });

  it("draws the newest screenful in server HTML and hydrates it without a warning", async () => {
    const items = conversation(2000);
    const html = renderToString(<Chat items={items} />);
    const drawn = html.match(/data-ouro="message"/g)!.length;
    expect(drawn).toBeGreaterThan(5);
    // From the end, 1600px of the first guess at a message's height, 96px: the newest 17.
    expect(drawn).toBe(17);
    // Opened at a message far up: it and 800px of messages either side, and the newest.
    const anchored = renderToString(<Chat items={items} initialAnchor="m200" />);
    expect(anchored.match(/data-ouro="message"/g)!.length).toBe(20);
    expect(anchored).toContain('id="m191"');
    expect(anchored).toContain('id="m209"');
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
