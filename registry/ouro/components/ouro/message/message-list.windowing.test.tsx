import { Fragment, Profiler, createRef, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList, type MessageListActions } from "@/registry/ouro/components/ouro/message/message-list";
import { OLDER_CHUNK } from "@/registry/ouro/components/ouro/message/message-list-styles";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { holdFrames } from "@/registry/ouro/lib/ouro/testing/frames";
import { pageCss } from "@/registry/ouro/lib/ouro/testing/page-css";

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
  /** Content of exactly this height, in pixels, instead of the text. */
  tall?: number;
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
  conversation?: string;
  hasOlder?: boolean;
  windowing?: boolean;
  springy?: boolean;
  /** What to put before the message with this id, such as a day's heading. */
  before?: (id: number) => ReactNode;
  style?: CSSProperties;
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
          {item.tall === undefined ? item.text : <div style={{ height: item.tall }} />}
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
    root,
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

/** A post the app's own component draws, its variant set by the component's own state, not by the list's render. */
function OwnPost({ expose }: { expose: (set: (variant: "post" | "chat") => void) => void }) {
  const [variant, setVariant] = useState<"post" | "chat">("post");
  useLayoutEffect(() => expose(setVariant), [expose]);
  return (
    <Message id="m1" variant={variant} role="assistant" name="Mara Quill">
      Message 1
    </Message>
  );
}

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

/**
 * Scrolls the list as the reader would by dragging its scrollbar, and waits for it to settle. The pointer stays down until the
 * list has taken the scroll, as a drag holds it across frames: the scroll event lands while the press holds it, however late.
 */
async function scrollTo(scroller: HTMLElement, top: number) {
  await act(async () => void scroller.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse" })));
  const before = scroller.scrollTop;
  const taken = new Promise<void>((resolve) => scroller.addEventListener("scroll", () => resolve(), { once: true }));
  await act(async () => void (scroller.scrollTop = top));
  if (scroller.scrollTop !== before) await taken;
  await act(async () => void document.dispatchEvent(new PointerEvent("pointerup", { pointerType: "mouse" })));
  await settle(scroller);
}

/**
 * Runs `land` in a task of its own, as an app's fetch callback does, and `ended` at that task's end: in the first frame
 * callback after it, or the next task, whichever comes first, so before anything the task left for later runs.
 */
function landInATask(land: () => void, ended: () => void) {
  return new Promise<void>((resolve) => {
    const start = new MessageChannel();
    start.port1.onmessage = () => {
      start.port1.close();
      const after = new MessageChannel();
      let frame = 0;
      let over = false;
      const end = () => {
        if (over) return;
        over = true;
        after.port1.close();
        cancelAnimationFrame(frame);
        ended();
        resolve();
      };
      after.port1.onmessage = end;
      after.port2.postMessage(null);
      frame = requestAnimationFrame(end);
      land();
    };
    start.port2.postMessage(null);
  });
}

/** The numbers from `from`, `count` of them. */
const span = (from: number, count: number) => Array.from({ length: count }, (_, at) => from + at);

/** A list of rows 8 to 16px tall, so the overscan around its 400px view reaches more rows than a chunk. */
function ShortRows({ ids, keyOf = String, hasOlder, conversation }: { ids: number[]; keyOf?: (id: number) => string; hasOlder?: boolean; conversation?: string }) {
  return (
    <MessageList label="Conversation" style={{ height: 400, width: 360 }} hasOlder={hasOlder} conversation={conversation}>
      {ids.map((id) => (
        <Message key={keyOf(id)} id={`m${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height: 8 + ((((id * 37) % 9) + 9) % 9), boxSizing: "border-box" }}>
          {`Message ${id}`}
        </Message>
      ))}
    </MessageList>
  );
}

/** Scrolls the list in code alone, as find in page, a screen reader or a test tool does, and waits for it to settle. */
async function codeScrollTo(scroller: HTMLElement, top: number) {
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
 * Checks that the messages drawn, besides those kept, are the band and what is still drawn of the one before it: one run, from
 * a message that ends below 1600px above the view, and no later than the first that ends below 800px, to the last that starts
 * above 800px below it, or later within 1600px.
 */
function expectBand(scroller: HTMLElement, kept: readonly number[]) {
  const drawn = ids(scroller).filter((id) => !kept.includes(id));
  expect(drawn).toEqual(drawn.map((_, index) => drawn[0]! + index));
  const view = scroller.getBoundingClientRect();
  const first = document.getElementById(`m${drawn[0]}`)!.getBoundingClientRect();
  const last = document.getElementById(`m${drawn.at(-1)}`)!.getBoundingClientRect();
  expect(first.bottom).toBeGreaterThan(view.top - 1600);
  expect(first.top - 16).toBeLessThanOrEqual(view.top - 800 + 1);
  expect(last.top).toBeLessThan(view.bottom + 1600);
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

  it("keeps the reader's place over rows not drawn yet without a :has() selector over the whole conversation, which reads every element against every message", async () => {
    // Messages, some wrapped in an element of the app's, and a day's heading before every tenth.
    const children = conversation(400).flatMap((item) => [
      item.id % 10 === 0 ? <h3 key={`day-${item.id}`} style={{ margin: 0 }}>{`Day ${item.id / 10}`}</h3> : null,
      item.id % 3 === 0 ? (
        <div key={item.id}>
          <Message id={`m${item.id}`} role="assistant" name="Ouro">{item.text}</Message>
        </div>
      ) : (
        <Message key={item.id} id={`m${item.id}`} role="assistant" name="Ouro">{item.text}</Message>
      ),
    ]);
    const { scroller } = await render(<MessageList label="Conversation" style={{ height: 400, width: 360 }}>{children}</MessageList>);
    const selectors: string[] = [];
    const all = Element.prototype.querySelectorAll;
    vi.spyOn(Element.prototype, "querySelectorAll").mockImplementation(function (this: Element, selector: string) {
      selectors.push(selector);
      return all.call(this, selector);
    } as typeof Element.prototype.querySelectorAll);
    // The reader's wheel, far up, where nothing is drawn yet: the list holds its place by what shows, which is no message.
    for (const top of [scroller.scrollTop / 2, scroller.scrollTop / 4]) {
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -4000 }));
      scroller.scrollTop = top;
      scroller.dispatchEvent(new Event("scroll"));
      await settle(scroller);
    }
    expect(selectors.length).toBeGreaterThan(0);
    expect(selectors.filter((selector) => selector.includes(":has("))).toEqual([]);
    // It still lands on messages.
    expect(firstVisible(scroller).message).toBeDefined();
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

  it("draws a hairline between posts the app wraps in its own component, from the DOM and not the props", async () => {
    function Post({ id }: { id: string }) {
      return (
        <Message id={id} variant="post" role="assistant" name="Mara Quill">
          {`Message ${id}`}
        </Message>
      );
    }
    await render(
      <MessageList label="Channel" style={{ height: 400, width: 360 }}>
        {[0, 1, 2].map((id) => (
          <Post key={id} id={`m${id}`} />
        ))}
      </MessageList>,
    );
    const line = (id: string) => getComputedStyle(document.getElementById(id)!.querySelector("[data-ouro-message-body]")!, "::before");
    expect(line("m0").content).toBe("none");
    expect(line("m1").content).not.toBe("none");
    expect(line("m1").borderTopWidth).toBe("1px");
    expect(line("m2").content).not.toBe("none");
  });

  it("takes a post's hairline away when the post before it stops being a post, and draws it back when it is one", async () => {
    const list = (middle: "post" | "chat") => (
      <MessageList label="Channel" style={{ height: 400, width: 360 }}>
        {[0, 1, 2].map((id) => (
          <Message key={id} id={`m${id}`} variant={id === 1 ? middle : "post"} role="assistant" name="Mara Quill">
            {`Message ${id}`}
          </Message>
        ))}
      </MessageList>
    );
    const { rerender } = await render(list("post"));
    const line = (id: string) => getComputedStyle(document.getElementById(id)!.querySelector("[data-ouro-message-body]")!, "::before");
    expect(line("m2").content).not.toBe("none");
    await rerender(list("chat"));
    expect(line("m2").content).toBe("none");
    await rerender(list("post"));
    expect(line("m2").content).not.toBe("none");
  });

  it("takes a post's hairline away when the post before it changes variant with no render of the list", async () => {
    let setOwn!: (variant: "post" | "chat") => void;
    const { host } = await render(
      <MessageList label="Channel" style={{ height: 400, width: 360 }}>
        <Message key={0} id="m0" variant="post" role="assistant" name="Mara Quill">
          Message 0
        </Message>
        <OwnPost key={1} expose={(set) => (setOwn = set)} />
        <Message key={2} id="m2" variant="post" role="assistant" name="Mara Quill">
          Message 2
        </Message>
      </MessageList>,
    );
    const line = () => getComputedStyle(host.querySelector("#m2 [data-ouro-message-body]")!, "::before");
    expect(line().content).not.toBe("none");
    await act(async () => setOwn("chat"));
    await expect.poll(() => line().content).toBe("none");
    await act(async () => setOwn("post"));
    await expect.poll(() => line().content).not.toBe("none");
  });

  it("draws the hairline between posts in a list with no :has() or sibling rule over its slots, which WebKit restyles for", async () => {
    await render(
      <MessageList label="Channel" style={{ height: 400, width: 360 }}>
        {conversation(3).map((item) => (
          <Message key={item.id} id={`m${item.id}`} variant="post" role="assistant" name="Mara Quill">
            {item.text}
          </Message>
        ))}
      </MessageList>,
    );
    const css = pageCss();
    expect(css).toContain("data-ouro-message-list-after-post");
    // Each rule of the page, by its selector: none may relate the list's slots by :has() or as siblings.
    expect(css.split("}").filter((rule) => rule.includes("data-ouro-message-list-slot") && (rule.includes(":has(") || rule.includes("+[data-ouro-message-list-slot]")))).toEqual([]);
    const body = document.getElementById("m2")!.querySelector("[data-ouro-message-body]")!;
    expect(getComputedStyle(body, "::before").content).not.toBe("none");
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

  it("holds growth above the reader without writing the scroll position while the wheel turns, a page's worth too, and pays it once the wheel rests", async () => {
    const { scroller, rerender } = await render(<Chat items={conversation(500)} />);
    await scrollTo(scroller, 3000);
    await settle(scroller);
    const reading = firstVisible(scroller);
    const above = Number(reading.message.id.slice(1)) - 1;
    const grow = (words: number) =>
      conversation(500).map((item) => (item.id === above ? { ...item, text: item.text + " more words".repeat(words) } : item));
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    // The reader's clock, so a loaded machine's slow render cannot let the wheel rest early.
    let now = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const turn = () => scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
    for (const words of [6, 120]) {
      const before = scroller.scrollTop;
      turn();
      await rerender(<Chat items={grow(words)} />);
      // Held by drawing the content up, never by writing the scroll position, which would stop the wheel's own scroll.
      expect(scroller.scrollTop).toBe(before);
      expect(content.style.translate).not.toBe("");
      expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
      // Neither the wheel turning on nor a scroll away from either end pays it.
      turn();
      scroller.dispatchEvent(new Event("scroll"));
      expect(content.style.translate).not.toBe("");
      expect(scroller.scrollTop).toBe(before);
      // Written to the scroll position in one move once the wheel has rested.
      now += 100;
      await expect.poll(() => content.style.translate).toBe("");
      expect(scroller.scrollTop).toBeGreaterThan(before);
      await settle(scroller);
      expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
    }
  });

  it.each([
    { begins: 0, from: 3000, grows: true, when: "after its last event, as WebKit animates it" },
    { begins: 200, from: 3000, grows: true, when: "after a scroll that began past the wheel's rest, as a loaded machine begins it" },
    // Drawn down, the content leaves no space at the end it starts near, which the wheel turns away from.
    { begins: 0, from: Infinity, grows: false, when: "upward from the end, near which it starts, as a message above shrinks" },
  ])("holds a message above the reader that changes size while the scroll a wheel started goes on $when, and pays it once that scroll ends", async ({ begins, from, grows }) => {
    // Shrinking, 60px messages, one of which goes 21px shorter: as a row drawn in place of the space kept for it, shorter than the estimate.
    const items = grows ? conversation(500) : conversation(500).map((item) => ({ ...item, tall: 60 }));
    const { scroller, root } = await render(<Chat items={items} />);
    await scrollTo(scroller, Math.min(from, scroller.scrollHeight));
    await settle(scroller);
    const reading = firstVisible(scroller);
    // The nearest message whose bottom is farther above the view than the whole 300px scroll goes, so the scroll never brings it into
    // view: on a loaded machine the scroll's first event comes a hundred pixels or more into it, and a nearer message would be in view
    // by then, holding the place itself (#1646). The list keeps 800px above the view drawn, so it is there.
    const viewTop = scroller.getBoundingClientRect().top;
    let above = Number(reading.message.id.slice(1)) - 1;
    while (document.getElementById(`m${above}`)!.getBoundingClientRect().bottom > viewTop - 340) above--;
    // Whether the message was still above the view as it changed, as the test means it to be.
    let aboveView: boolean | undefined;
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    let now = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    // The list's own writes to the scroll position, which would stop the browser's scroll.
    let writes = 0;
    // The trace a failure prints (#1646): each scroll, `translate` change, write to the scroll position and `scrollend`, in real ms.
    const log: string[] = [];
    const real = () => Math.round(Date.now() - window.performance.timeOrigin);
    const own = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    const top = () => Math.round(own.get!.call(scroller));
    Object.defineProperty(scroller, "scrollTop", { configurable: true, get: () => own.get!.call(scroller), set: (value: number) => (writes++, log.push(`w${real()} ${top()}->${Math.round(value)}`), own.set!.call(scroller, value)) });
    scroller.addEventListener("scroll", (event) => log.push(`s${real()} ${top()} ${content.style.translate || "-"} ${event.isTrusted ? "T" : "u"}`));
    scroller.addEventListener("scrollend", () => log.push(`e${real()} ${top()} ${content.style.translate || "-"}`));
    const translates = new MutationObserver(() => log.push(`t${real()} ${content.style.translate || "-"} ${top()}`));
    translates.observe(content, { attributes: true, attributeFilter: ["style"] });
    onTestFinished(() => translates.disconnect());
    // In the browser's own scroll, past the wheel's rest, before it ends: a message above grows, or shrinks.
    const grow = () => {
      // Once the scroll has left the end, which the list follows while it is there, by more than a message shrinks: the browser
      // itself moves a scroll position past the new end. Still within a quarter of the view of it.
      if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= (grows ? 2 : 30)) return scroller.addEventListener("scroll", grow, { once: true });
      now += 200;
      aboveView = document.getElementById(`m${above}`)!.getBoundingClientRect().bottom <= scroller.getBoundingClientRect().top;
      // What the list measures as it holds the change (#1646): every box it reads of a message or the content over the next two
      // frames, as `r<ms> <id>:<top>` (the content as `c`), so a failure shows which message held the place and how far it moved.
      const box = Element.prototype.getBoundingClientRect;
      const reads: string[] = [];
      Element.prototype.getBoundingClientRect = function (this: Element) {
        const rect = box.call(this);
        const name = this === content ? "c" : /^m\d+$/.test(this.id) ? this.id : "";
        if (name && reads.length < 80) reads.push(`${name}:${Math.round(rect.top)}`);
        return rect;
      };
      const restore = () => {
        Element.prototype.getBoundingClientRect = box;
        log.push(`r${real()} grew ${above} reads ${reads.join(" ") || "none"}`);
      };
      onTestFinished(() => void (Element.prototype.getBoundingClientRect = box));
      requestAnimationFrame(() => requestAnimationFrame(restore));
      flushSync(() => root.render(<Chat items={items.map((item) => (item.id === above ? (grows ? { ...item, text: item.text + " more words".repeat(40) } : { ...item, tall: 39 }) : item))} />));
    };
    scroller.addEventListener("scroll", grow, { once: true });
    const ended = new Promise<{ writes: number; translate: string }>((resolve) =>
      scroller.addEventListener("scrollend", () => resolve({ writes, translate: content.style.translate }), { once: true }),
    );
    let atEnd = { writes: -1, translate: "" };
    await act(async () => {
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
      now += begins;
      // A scroll the browser animates over frames, as WebKit does a wheel's.
      scroller.scrollBy({ top: -300, behavior: "smooth" });
      atEnd = await ended;
    });
    log.push(`end writes=${atEnd.writes} translate=${atEnd.translate || "-"}`);
    // Held by drawing the content up, never by writing the scroll position, until the scroll ended.
    expect(atEnd.writes).toBe(0);
    expect(atEnd.translate).not.toBe("");
    // Once the scroll has ended, written to the scroll position.
    now += 100;
    await expect.poll(() => content.style.translate).toBe("");
    await settle(scroller);
    delete (scroller as { scrollTop?: number }).scrollTop;
    log.push(`final top=${Math.round(reading.message.getBoundingClientRect().top)} want=${Math.round(reading.top + 300)} scrollTop=${Math.round(scroller.scrollTop)}`);
    expect(aboveView, `m${above} was above the view as it changed`).toBe(true);
    // Where the reader's scroll took it, the growth above taken out.
    expect(Math.abs(reading.message.getBoundingClientRect().top - (reading.top + 300)), log.join(" | ")).toBeLessThanOrEqual(ROUNDING);
  });

  it.each([
    { when: "near the bottom, turning up, the end it turns toward being the top", from: -50, by: -50, tall: 39, pays: false },
    { when: "near the bottom, turning down toward it", from: -50, by: 50, tall: 39, pays: true },
    { when: "near the top, turning down, a message above shrinking, which would show space above the first", from: 110, by: 50, tall: 39, pays: true },
    { when: "at the top, turning down, a message above growing, which shows no space", from: 20, by: 20, tall: 100, pays: false },
  ])("while the wheel turns, $when, pays a change above at once only when it says so ($pays)", async ({ from, by, tall, pays }) => {
    // 60px messages, one of which changes size: a row drawn in place of the space kept for it, unlike the estimate.
    let items = conversation(500).map((item) => ({ ...item, tall: 60 }));
    const { scroller, root } = await render(<Chat items={items} springy={false} />);
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    // Where the wheel's scroll ends: from the bottom, below 0. It starts `by` before that.
    const start = (from < 0 ? scroller.scrollHeight - scroller.clientHeight + from : from) - by;
    await scrollTo(scroller, start);
    vi.spyOn(performance, "now").mockReturnValue(1_000_000);
    const own = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    let writes = 0;
    Object.defineProperty(scroller, "scrollTop", { configurable: true, get: () => own.get!.call(scroller), set: (value: number) => (writes++, own.set!.call(scroller, value)) });
    onTestFinished(() => void delete (scroller as { scrollTop?: number }).scrollTop);
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: Math.sign(by) * 20 }));
    // The wheel's scroll: within a quarter of the view of the end it starts near, where the list pays what it carries toward that end.
    const scrolled = new Promise((resolve) => scroller.addEventListener("scroll", resolve, { once: true }));
    own.set!.call(scroller, start + by);
    await scrolled;
    const reading = firstVisible(scroller);
    const above = Math.max(0, Number(reading.message.id.slice(1)) - 3);
    items = items.map((item) => (item.id === above ? { ...item, tall } : item));
    await act(async () => root.render(<Chat items={items} springy={false} />));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    // Paid, by writing the scroll position once; or held, by drawing the content, with no write that would stop the wheel.
    expect(writes).toBe(pays ? 1 : 0);
    expect(content.style.translate === "").toBe(pays);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
  });

  it.each([
    { start: "following the end", leave: 0, row: "a row above" },
    { start: "near the end, having left it", leave: 10, row: "a row above" },
    { start: "following the end", leave: 0, row: "the last message, below the reader," },
  ])("keeps the scroll range while the wheel turns, $start, so $row that comes in shorter never pulls the scroll position, which ends WebKit's wheel", async ({ leave, row }) => {
    const below = row.startsWith("the last");
    // 60px messages, one of which comes in 39px shorter: a row drawn in place of the space kept for it, shorter than the estimate.
    let items = conversation(500).map((item) => ({ ...item, tall: 60 }));
    const { scroller, root } = await render(<Chat items={items} springy={false} />);
    if (leave > 0) {
      await scrollTo(scroller, scroller.scrollTop - leave);
      // A change while the wheel is at rest: the list lets its hold on the end go.
      items = [...items.slice(0, -1), { ...items.at(-1)!, tall: 61 }];
      await act(async () => root.render(<Chat items={items} springy={false} />));
      await settle(scroller);
    }
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    vi.spyOn(performance, "now").mockReturnValue(1_000_000);
    const own = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
    // The wheel's scroll, 20px up: closer to the end than the row will shrink.
    const scrolled = new Promise((resolve) => scroller.addEventListener("scroll", resolve, { once: true }));
    own.set!.call(scroller, own.get!.call(scroller) - 20);
    await scrolled;
    const at = scroller.scrollTop;
    const reading = firstVisible(scroller);
    // Any scroll from here is the browser's, pulling the position into a shorter range: no one else scrolls.
    let pulled = 0;
    scroller.addEventListener("scroll", () => pulled++);
    const shrinks = below ? items.at(-1)!.id : Number(reading.message.id.slice(1)) - 3;
    items = items.map((item) => (item.id === shrinks ? { ...item, tall: 21 } : item));
    await act(async () => root.render(<Chat items={items} springy={false} />));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // The wheel turns again: the range it holds stays, though the content is now shorter.
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(pulled).toBe(0);
    expect(scroller.scrollTop).toBe(at);
    // Above, held by drawing the content down; below, nothing the reader sees moved.
    expect(content.style.translate === "").toBe(below);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
    // Once the wheel rests, what was carried goes into the scroll position and the hold on the range goes, so the end is
    // the last message's, with no room past it.
    vi.spyOn(performance, "now").mockReturnValue(1_010_000);
    await expect.poll(() => content.style.translate).toBe("");
    await settle(scroller);
    // A row above that came in shorter left the reader's place where it was; a shorter last message ends the range sooner, and
    // a reader that near the end comes down with it, the wheel at rest.
    if (!below) expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
    expect(scroller.querySelector<HTMLElement>("[data-ouro-message-list-floor]")!.style.display).toBe("");
    own.set!.call(scroller, scroller.scrollHeight);
    await settle(scroller);
    // The content's 16px padding below the last message, and not the 39px the shorter row left.
    expect(scroller.getBoundingClientRect().bottom - messages(scroller).at(-1)!.getBoundingClientRect().bottom).toBeLessThanOrEqual(16 + ROUNDING);
  });

  it("lets the hold on the end go at a change once the reader has left it with no wheel turning, so a last message that comes in shorter leaves no room past it", async () => {
    let items = conversation(500).map((item) => ({ ...item, tall: 60 }));
    const { scroller, root } = await render(<Chat items={items} springy={false} />);
    // Up by the scrollbar, well away from the end.
    await scrollTo(scroller, scroller.scrollTop - 1000);
    items = items.map((item, index) => (index === items.length - 1 ? { ...item, tall: 21 } : item));
    await act(async () => root.render(<Chat items={items} springy={false} />));
    await settle(scroller);
    expect(scroller.querySelector<HTMLElement>("[data-ouro-message-list-floor]")!.style.display).toBe("");
    await scrollTo(scroller, scroller.scrollHeight);
    // The content's 16px padding below the last message, and not the 39px it lost.
    expect(scroller.getBoundingClientRect().bottom - messages(scroller).at(-1)!.getBoundingClientRect().bottom).toBeLessThanOrEqual(16 + ROUNDING);
  });

  it("counts as the wheel's only the first scroll a turn starts, or any while it turns, never the list's own, as WebKit sends no scrollend after either, though it lands in the frame the wheel turned in", async () => {
    // As in WebKit: no scrollend from the browser, so a scroll wrongly counted as the wheel's would hold the reader's place by
    // drawing the content up, for good.
    const browsers = (event: Event) => void (event.isTrusted && event.stopImmediatePropagation());
    window.addEventListener("scrollend", browsers, { capture: true });
    onTestFinished(() => window.removeEventListener("scrollend", browsers, { capture: true }));
    // No springs: this clock holds them still, drawn away from where the place is held.
    let items = conversation(500);
    const { scroller, root } = await render(<Chat items={items} springy={false} />);
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    let now = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    // Each turn's frame lasts until the next scroll has been handled, as on a runner too loaded to draw a frame between them:
    // only the time since the turn says whose that scroll is.
    const frame = Object.getOwnPropertyDescriptor(AnimationTimeline.prototype, "currentTime")!;
    const turn = (deltaY: number) => {
      const held = frame.get!.call(document.timeline);
      Object.defineProperty(document.timeline, "currentTime", { configurable: true, get: () => held });
      scroller.addEventListener("scroll", () => void delete (document.timeline as { currentTime?: unknown }).currentTime, { once: true });
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY }));
    };
    onTestFinished(() => void delete (document.timeline as { currentTime?: unknown }).currentTime);
    const scrolled = () => new Promise((resolve) => scroller.addEventListener("scroll", resolve, { once: true }));
    // A message above the reader grows: held by writing the scroll position, the wheel at rest, so nothing is drawn up.
    const heldByScrolling = async () => {
      const reading = firstVisible(scroller);
      const above = Number(reading.message.id.slice(1)) - 1;
      items = items.map((item) => (item.id === above ? { ...item, text: item.text + " more words".repeat(40) } : item));
      await act(async () => root.render(<Chat items={items} springy={false} />));
      await settle(scroller);
      expect(content.style.translate).toBe("");
      expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
    };
    // At the end, a turn down scrolls nothing, and the list follows a new message there: its own scroll, not the wheel's.
    turn(20);
    const followed = scrolled();
    items = [...items, { id: 500, text: "Message 500" }];
    await act(async () => root.render(<Chat items={items} springy={false} />));
    await followed;
    now += 10_000;
    await scrollTo(scroller, 3000);
    await heldByScrolling();
    // Back at the end, turning up, the list follows another new message there, then the wheel's scroll begins, late: the
    // list's own write left the turn's start, so that scroll is the wheel's, and a message above that grows once the turn's
    // rest has passed is held by drawing, the scroll position unwritten.
    await scrollTo(scroller, scroller.scrollHeight);
    now += 10_000;
    turn(-20);
    const followedAgain = scrolled();
    items = [...items, { id: 501, text: "Message 501" }];
    await act(async () => root.render(<Chat items={items} springy={false} />));
    await followedAgain;
    now += 100;
    const late = scrolled();
    scroller.scrollTop -= 600;
    await late;
    now += 200;
    await settle(scroller);
    const reading = firstVisible(scroller);
    const before = scroller.scrollTop;
    items = items.map((item) => (item.id === Number(reading.message.id.slice(1)) - 1 ? { ...item, text: item.text + " more words".repeat(40) } : item));
    await act(async () => root.render(<Chat items={items} springy={false} />));
    expect(scroller.scrollTop).toBe(before);
    expect(content.style.translate).not.toBe("");
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
    // A loaded machine sends scrollend between the parts of one wheel scroll: a scroll after it holds the carry for the rest again.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    onTestFinished(() => void vi.useRealTimers());
    const frameLater = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    scroller.dispatchEvent(new Event("scrollend"));
    vi.advanceTimersByTime(79);
    const more = scrolled();
    scroller.scrollTop -= 5;
    await more;
    now += 10_000;
    for (let elapsed = 0; elapsed < 78; elapsed += 6) {
      vi.advanceTimersByTime(6);
      await frameLater();
      expect(content.style.translate).not.toBe("");
    }
    vi.advanceTimersByTime(200);
    await frameLater();
    await expect.poll(() => content.style.translate).toBe("");
    vi.useRealTimers();
    // The browser says the wheel's scroll ended, and once it rests the scroll position takes what was held.
    scroller.dispatchEvent(new Event("scrollend"));
    now += 10_000;
    await expect.poll(() => content.style.translate).toBe("");
    await scrollTo(scroller, 3000);
    // A turn's scroll is the wheel's until it ends; a scrollbar's 200ms after that is not.
    turn(-20);
    const wheels = scrolled();
    scroller.scrollTop -= 50;
    await wheels;
    scroller.dispatchEvent(new Event("scrollend"));
    now += 200;
    await scrollTo(scroller, 2500);
    await heldByScrolling();
    // The first scroll a whole second after a turn is not the turn's.
    now += 10_000;
    turn(-20);
    now += 1000;
    await scrollTo(scroller, 2000);
    await heldByScrolling();
  });

  it("pays what it holds as the reader nears either end, so what went in above is in reach while the wheel still turns", async () => {
    const actions = createRef<MessageListActions>();
    let from = 100;
    const chat = () => <Chat items={conversation(300 - from, from)} windowing={false} actionsRef={actions} />;
    const { scroller, root, rerender } = await render(chat());
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    let now = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const turn = () => scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
    // Where a message is laid out, less its spring: this clock holds the springs still.
    const laid = (message: HTMLElement) => message.getBoundingClientRect().top - Number(/translateY\((-?[\d.]+)px\)/.exec(message.style.transform)?.[1] ?? 0);
    const reader = () => {
      const { message } = firstVisible(scroller);
      return { message, top: laid(message) };
    };
    // Twenty older messages go in above while the wheel turns: held by the content drawn up, away from either end.
    const older = async () => {
      from -= 20;
      await rerender(chat());
    };
    await scrollTo(scroller, 300);
    let reading = reader();
    turn();
    await older();
    expect(scroller.scrollTop).toBe(300);
    expect(content.style.translate).not.toBe("");
    // The reader scrolls on toward the top, the wheel still turning: the scroll position takes what was held before they reach it.
    await act(async () => void (scroller.scrollTop = 40));
    await expect.poll(() => content.style.translate).toBe("");
    expect(scroller.scrollTop).toBeGreaterThan(1000);
    expect(Math.abs(laid(reading.message) - reading.top - 260)).toBeLessThanOrEqual(ROUNDING);
    // A wheel that reaches the top pays before its scroll is reported (a wheel at the top scrolls nothing, so reports none), and
    // what goes in above in the same task, before that report, is held from where the list scrolled itself to.
    await scrollTo(scroller, 400);
    reading = reader();
    turn();
    await older();
    expect(content.style.translate).not.toBe("");
    from -= 20;
    await act(async () => {
      scroller.scrollTop = 90;
      turn();
      expect(content.style.translate).toBe("");
      root.render(chat());
    });
    expect(scroller.scrollTop).toBeGreaterThan(1000);
    expect(content.style.translate).not.toBe("");
    expect(Math.abs(laid(reading.message) - reading.top - 310)).toBeLessThanOrEqual(ROUNDING);
    // The wheel rests, and near the bottom what goes in above is paid at once, so the bottom never shows empty space.
    now += 10_000;
    await expect.poll(() => content.style.translate).toBe("");
    await scrollTo(scroller, scroller.scrollHeight - scroller.clientHeight - 60);
    const nearBottom = scroller.scrollTop;
    turn();
    await older();
    expect(content.style.translate).toBe("");
    expect(scroller.scrollTop).toBeGreaterThan(nearBottom + 1000);
    // Going to the newest drops what is held: the end is where it goes.
    await scrollTo(scroller, 300);
    turn();
    await older();
    expect(content.style.translate).not.toBe("");
    await act(async () => actions.current!.jumpToNewest());
    expect(content.style.translate).toBe("");
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  });

  it("keeps the wheel turning through the frame it turned in, however long that frame takes", async () => {
    const { scroller, root } = await render(<Chat items={conversation(500)} />);
    await scrollTo(scroller, 3000);
    await settle(scroller);
    const reading = firstVisible(scroller);
    const above = Number(reading.message.id.slice(1)) - 1;
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    let now = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const grown = conversation(500).map((item) => (item.id === above ? { ...item, text: item.text + " more words".repeat(120) } : item));
    const before = scroller.scrollTop;
    // The clock holds the rest timer, so the read below cannot race it: installed after the setup above, which needs real timers.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    onTestFinished(() => void vi.useRealTimers());
    // A frame far longer than the rest, in which the wheel turned: its next events would wait behind it, so the wheel still turns.
    await act(async () => {
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
      now += 10_000;
      root.render(<Chat items={grown} />);
    });
    expect(content.style.translate).not.toBe("");
    expect(scroller.scrollTop).toBe(before);
    // A later frame begins with no wheel: it has rested, and the scroll position takes what was held. The rest is a real 80 ms
    // timer the read above would otherwise race on a loaded runner, so the clock holds it until the test lets it run.
    await expect.poll(() => {
      vi.runOnlyPendingTimers();
      return content.style.translate;
    }).toBe("");
    vi.useRealTimers();
    expect(scroller.scrollTop).toBeGreaterThan(before);
    await settle(scroller);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
  });

  it("pays what it carries together with a later change above in one write once the wheel has rested, never in two that each round to whole pixels (#1646)", async () => {
    const { scroller, root } = await render(<Chat items={conversation(500)} />);
    await scrollTo(scroller, 3000);
    await settle(scroller);
    const reading = firstVisible(scroller);
    const above = Number(reading.message.id.slice(1)) - 1;
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    let now = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const grown = (words: number) => conversation(500).map((item) => (item.id === above ? { ...item, text: item.text + " more words".repeat(words) } : item));
    const own = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    let writes = 0;
    Object.defineProperty(scroller, "scrollTop", { configurable: true, get: () => own.get!.call(scroller), set: (value: number) => (writes++, own.set!.call(scroller, value)) });
    onTestFinished(() => void delete (scroller as { scrollTop?: number }).scrollTop);
    // The clock holds the rest timer, so only the reader's clock decides whether the wheel has rested.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    onTestFinished(() => void vi.useRealTimers());
    await act(async () => {
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
      root.render(<Chat items={grown(6)} />);
    });
    expect(content.style.translate).not.toBe("");
    expect(writes).toBe(0);
    // The wheel has rested, but what it carried is not paid yet: the next change above joins it.
    now += 10_000;
    await frame();
    await act(async () => root.render(<Chat items={grown(12)} />));
    expect(content.style.translate).toBe("");
    expect(writes).toBe(1);
    vi.useRealTimers();
    await settle(scroller);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
  });
  it("draws the content down for a shrink above of any size while the wheel turns, never writing the scroll position, and writes it once the wheel rests", async () => {
    let above = 1;
    const base = (shrink: number) => conversation(500).map((item) => (item.id === 0 ? item : { ...item, tall: item.id === above ? 120 - shrink : 20 }));
    let now = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { scroller, rerender } = await render(<Chat items={base(0)} />);
    await scrollTo(scroller, 3000);
    await settle(scroller);
    above = Number(firstVisible(scroller).message.id.slice(1)) - 1;
    await rerender(<Chat items={base(0)} />);
    await settle(scroller);
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    // How far the content is drawn down, holding the reader's place, in px.
    const drawnDown = () => Number(/(-?[\d.]+)px$/.exec(content.style.translate)?.[1] ?? 0);
    const read = async (shrink: number, rest: number) => {
      const before = scroller.scrollTop;
      const reading = firstVisible(scroller);
      now += 10_000;
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
      now += rest;
      // Two frames, so only the time decides whether the wheel has rested.
      await frame();
      await rerender(<Chat items={base(shrink)} />);
      const result = { written: before - scroller.scrollTop, down: drawnDown(), moved: reading.message.getBoundingClientRect().top - reading.top };
      now += 10_000;
      await rerender(<Chat items={base(0)} />);
      await settle(scroller);
      await expect.poll(() => content.style.translate).toBe("");
      return result;
    };
    // While the wheel turns, the scroll position is never written, which would stop WebKit's own scroll: the reader's place holds.
    for (const shrink of [3, 20, 90]) {
      const turning = await read(shrink, 79);
      expect(turning.written).toBe(0);
      expect(Math.abs(turning.down - shrink)).toBeLessThanOrEqual(ROUNDING);
      expect(Math.abs(turning.moved)).toBeLessThanOrEqual(ROUNDING);
    }
    // Once the wheel has rested, the scroll position takes the shrink at once.
    const rested = await read(20, 80);
    expect(rested.down).toBe(0);
    expect(Math.abs(rested.written - 20)).toBeLessThanOrEqual(ROUNDING);
  });

  /**
   * Turns the wheel up from the end of a conversation whose 60 newest rows are tall and whose 240 older ones are short, 300px a
   * step, as a slowed page hands a wheel's scroll over, with the wheel never resting: the rows above come in far shorter than the
   * estimate the tall ones set, and what that moves is carried, never paid, until the reader nears the top. The step that brings
   * them within reach of it lands 100px short of what is carried, whatever the rows' heights and the runner's timing: past what the
   * scroll position can take when the list pays it. Returns how far the reader's row moved, beyond their own scroll, in the worst
   * step, and what was carried as that step began.
   */
  async function wheelToTheTop({ height = 400 } = {}) {
    const items = conversation(300).map((item) => ({ ...item, tall: item.id >= 240 ? 160 : 20 }));
    const style = { height, width: 360 };
    const { scroller, root, rerender } = await render(<Chat items={items} springy={false} style={style} />);
    const clock = { now: 1_000_000 };
    vi.spyOn(performance, "now").mockImplementation(() => clock.now);
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    const middle = () => {
      const view = scroller.getBoundingClientRect();
      const centre = (view.top + view.bottom) / 2;
      return messages(scroller).find((node) => node.getBoundingClientRect().bottom > centre)!;
    };
    // How far the content is drawn down, holding the reader's place, in px: what is carried.
    const carried = () => Number(/(-?[\d.]+)px$/.exec(content.style.translate)?.[1] ?? 0);
    let worst = 0;
    let past = 0;
    // About 90 steps reach the top; a list that never lets the reader get there fails here, not at the test's timeout.
    for (let step = 0; step < 150 && scroller.scrollTop > 0; step++) {
      const row = middle();
      const before = row.getBoundingClientRect().top;
      const top = scroller.scrollTop;
      // The list pays what it carries once the reader is within a quarter of the view of it, past the top.
      const within = top - 300 < carried() + scroller.clientHeight / 4;
      if (within && past === 0) past = carried();
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -300 }));
      scroller.scrollTop = within ? Math.max(0, Math.min(top - 300, carried() - 100)) : top - 300;
      const reader = top - scroller.scrollTop;
      await frame();
      worst = Math.max(worst, Math.abs(row.getBoundingClientRect().top - (before + reader)));
    }
    expect(scroller.scrollTop).toBe(0);
    return { scroller, content, clock, worst, past, items, root, style, rerender };
  }

  it("holds the reader's place for a message deleted above them in the frame the space above the first message goes, before the list's own scroll is reported", async () => {
    // A short view, so the space is more than half of it.
    const { scroller, content, clock, items, root, style } = await wheelToTheTop({ height: 120 });
    await frame();
    const space = content.offsetTop;
    expect(space).toBeGreaterThan(60);
    // The wheel turns on, down past the space.
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 300 }));
    scroller.scrollTop = space + 100;
    await frame();
    await settle(scroller);
    const reading = firstVisible(scroller);
    const gone = Number(reading.message.id.slice(1)) - 1;
    // As the space goes, once the wheel rests, the message just above the reader is deleted, in the same task.
    let went = false;
    const deleted = new MutationObserver(() => {
      if (content.offsetTop !== 0) return;
      went = true;
      deleted.disconnect();
      flushSync(() => root.render(<Chat items={items.filter((item) => item.id !== gone)} springy={false} style={style} />));
    });
    deleted.observe(content, { attributes: true, attributeFilter: ["style"] });
    clock.now += 10_000;
    await expect.poll(() => went).toBe(true);
    await settle(scroller);
    expect(document.getElementById(`m${gone}`)).toBeNull();
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(1);
  });

  it("holds the reader's place at once when something above the view that is no message changes size, as an animation frame's callbacks read it (#702)", async () => {
    const items = conversation(60).map((item) => ({ ...item, tall: 100 }));
    const { scroller } = await render(<Chat items={items} springy={false} style={{ height: 400, width: 360 }} />);
    await scrollTo(scroller, 3000);
    const reading = firstVisible(scroller);
    const above = document.getElementById(`m${Number(reading.message.id.slice(1)) - 2}`)!;
    const placeholder = document.createElement("div");
    placeholder.style.height = "20px";
    above.append(placeholder);
    await settle(scroller);
    const read = new Promise<number>((resolve) => {
      // A picture's placeholder gives way to the picture, in a task of its own; the frame's callbacks come before the resize observer.
      setTimeout(() => {
        const picture = document.createElement("div");
        picture.style.height = "140px";
        placeholder.replaceWith(picture);
        requestAnimationFrame(() => resolve(Math.abs(reading.message.getBoundingClientRect().top - reading.top)));
      });
    });
    expect(await read).toBeLessThanOrEqual(1);
  });

  /** Lets the wheel rest at the top, and waits until the list has taken it: the mark that held the scroll range while it turned goes. */
  async function restWheel(scroller: HTMLElement, clock: { now: number }) {
    const floor = scroller.querySelector<HTMLElement>("[data-ouro-message-list-floor]")!;
    expect(floor.style.display).toBe("block");
    // The wheel's scroll ends, as the browser says it does; the reader pushes the wheel up once more at the top, and lets it rest.
    scroller.dispatchEvent(new Event("scrollend"));
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
    clock.now += 10_000;
    await expect.poll(() => floor.style.display).toBe("");
    await settle(scroller);
  }

  it("holds the reader's row to the pixel as a wheel takes them past the top before the shorter rows above were paid, keeping the rest as space above the first message", async () => {
    const { content, worst, past } = await wheelToTheTop();
    // The premise: what was carried as the reader came within reach of the top, which their step took them 100px past.
    expect(past).toBeGreaterThan(100);
    expect(document.getElementById("m0")).not.toBeNull();
    expect(worst).toBeLessThanOrEqual(1);
    // What the top stopped is space above the first message.
    expect(content.offsetTop).toBeGreaterThanOrEqual(100);
  });

  it("holds the reader's row to the pixel and keeps no space above the first message as a wheel takes them to the top past rows already measured", async () => {
    // Older rows far shorter than the estimate the newest set, as in wheelToTheTop, fewer of them.
    const items = conversation(60).map((item) => ({ ...item, tall: item.id >= 40 ? 160 : 20 }));
    const { scroller } = await render(<Chat items={items} springy={false} />);
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    // Every row measured first, by the scrollbar up to the top, and back to the end.
    while (scroller.scrollTop > 0) await scrollTo(scroller, scroller.scrollTop - 300);
    await scrollTo(scroller, scroller.scrollHeight);
    const clock = { now: 1_000_000 };
    vi.spyOn(performance, "now").mockImplementation(() => clock.now);
    let worst = 0;
    for (let step = 0; step < 150 && scroller.scrollTop > 0; step++) {
      const row = firstVisible(scroller).message;
      const before = row.getBoundingClientRect().top;
      const top = scroller.scrollTop;
      scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -300 }));
      scroller.scrollTop = top - 300;
      const reader = top - scroller.scrollTop;
      await frame();
      worst = Math.max(worst, Math.abs(row.getBoundingClientRect().top - (before + reader)));
    }
    expect(scroller.scrollTop).toBe(0);
    expect(worst).toBeLessThanOrEqual(1);
    // Nothing was carried to the top, so nothing is kept above the first message.
    expect(content.offsetTop).toBe(0);
  });

  it("keeps the space above the first message while the wheel turns, and lets it go without moving anything once the reader is past it and the wheel rests", async () => {
    const { scroller, content, clock } = await wheelToTheTop();
    await frame();
    const space = content.offsetTop;
    expect(space).toBeGreaterThan(1);
    // The wheel turns on, down past the space: the space stays, as writing the scroll position would end the wheel's scroll.
    const reading = firstVisible(scroller);
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 300 }));
    scroller.scrollTop = space + 200;
    const scrolled = scroller.scrollTop;
    await frame();
    expect(content.offsetTop).toBe(space);
    expect(Math.abs(reading.message.getBoundingClientRect().top - (reading.top - scrolled))).toBeLessThanOrEqual(1);
    // Once it rests, the space goes, and the scroll position with it: nothing on screen moves.
    const resting = firstVisible(scroller);
    clock.now += 10_000;
    await expect.poll(() => content.offsetTop).toBe(0);
    await settle(scroller);
    expect(Math.abs(resting.message.getBoundingClientRect().top - resting.top)).toBeLessThanOrEqual(1);
  });

  it("keeps the space above the first message while the reader is in it once the wheel rests, and lets it go without moving anything as they scroll past it", async () => {
    const { scroller, content, clock } = await wheelToTheTop();
    await frame();
    const space = content.offsetTop;
    expect(space).toBeGreaterThan(1);
    await restWheel(scroller, clock);
    // At the top, the space shows: letting it go there would move the content up under the reader.
    expect(scroller.scrollTop).toBe(0);
    expect(content.offsetTop).toBe(space);
    const reading = firstVisible(scroller);
    await scrollTo(scroller, space + 100);
    expect(content.offsetTop).toBe(0);
    // Only the reader's scroll moved the row.
    expect(Math.abs(reading.message.getBoundingClientRect().top - (reading.top - space - 100))).toBeLessThanOrEqual(1);
  });

  /**
   * Twenty messages, drawn whole, the reader 60px down: the first, partly above the view, shrinks while the wheel turns, more than
   * the scroll position can take, so what the top stops is space above the first message. The wheel has not rested.
   */
  async function spaceAboveWhole() {
    const items = (first: number, changed?: number, tall = 150) => conversation(20).map((item) => ({ ...item, tall: item.id === 0 ? first : item.id === changed ? tall : 150 }));
    const { scroller, rerender } = await render(<Chat items={items(150)} springy={false} />);
    await scrollTo(scroller, 60);
    const clock = { now: 1_000_000 };
    vi.spyOn(performance, "now").mockImplementation(() => clock.now);
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    const reading = firstVisible(scroller);
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
    await rerender(<Chat items={items(20)} springy={false} />);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(1);
    const space = content.offsetTop;
    expect(space).toBeGreaterThan(1);
    return { scroller, content, clock, space, rerender, change: (changed: number, tall: number) => rerender(<Chat items={items(20, changed, tall)} springy={false} />) };
  }

  it("lets the space above the first message go at the end, following it, once the wheel that took the reader there rests", async () => {
    const { scroller, content, clock, rerender } = await spaceAboveWhole();
    // The wheel rests at the top, so the hold on the range goes, and turns again, down to the end.
    await restWheel(scroller, clock);
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 300 }));
    scroller.scrollTop = scroller.scrollHeight;
    await frame();
    // The wheel's scroll ends at the end, and the wheel rests.
    scroller.dispatchEvent(new Event("scrollend"));
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 100 }));
    clock.now += 10_000;
    await expect.poll(() => content.offsetTop).toBe(0);
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
    // In one task, the last message shrinks, something reads the layout, and it grows back, as a placeholder swapped for its
    // picture: the hold on the range, which came up with the content, keeps the list at its end.
    const picture = document.getElementById("m19")!.querySelector<HTMLElement>('div[style*="height: 150px"]')!;
    picture.style.height = "0px";
    void scroller.scrollHeight;
    picture.style.height = "150px";
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
    // The next message is followed.
    await rerender(<Chat items={[...conversation(20).map((item) => ({ ...item, tall: item.id === 0 ? 20 : 150 })), { id: 20, text: "Message 20" }]} springy={false} />);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(document.getElementById("m20")!.getBoundingClientRect().bottom).toBeLessThanOrEqual(scroller.getBoundingClientRect().bottom);
  });

  it("drops the space above the first message as another conversation opens, which opens at its end, following it", async () => {
    const { scroller, content, rerender } = await spaceAboveWhole();
    await rerender(<Chat conversation="b" items={conversation(20, 100).map((item) => ({ ...item, tall: 150 }))} springy={false} />);
    expect(content.offsetTop).toBe(0);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
  });

  it("resets following the end, the room for older history and a carried translate when another conversation opens, as a fresh list would", async () => {
    const { scroller, rerender } = await render(<Chat conversation="a" items={conversation(500)} hasOlder />);
    await scrollTo(scroller, 3000);
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    const reading = firstVisible(scroller);
    const above = Number(reading.message.id.slice(1)) - 1;
    // The reader's clock, so the wheel still turns when the list opens: what it carries is not yet written to the scroll position.
    const now = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
    await rerender(
      <Chat conversation="a" hasOlder items={conversation(500).map((item) => (item.id === above ? { ...item, text: item.text + " more words".repeat(120) } : item))} />,
    );
    expect(content.style.translate).not.toBe("");
    expect(scroller.querySelector("[data-ouro-message-list-older-room]")).not.toBeNull();
    await rerender(<Chat conversation="b" items={conversation(300, 1000)} />);
    expect(content.style.translate).toBe("");
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(page.getByRole("button", { name: "Jump to latest" }).query()).toBeNull();
    await expect.poll(() => scroller.querySelector("[data-ouro-message-list-older-room]")).toBeNull();
    expect(inView(scroller, "m1299")).toBe(true);
  });

  it("holds the reader's place as a message above them grows, after the space above the first message went and they scrolled on, in a conversation drawn whole", async () => {
    const { scroller, content, clock, space, change } = await spaceAboveWhole();
    await restWheel(scroller, clock);
    await scrollTo(scroller, space + 100);
    expect(content.offsetTop).toBe(0);
    // On, a screen and more at a time, with the scrollbar.
    await scrollTo(scroller, scroller.scrollTop + 500);
    await scrollTo(scroller, scroller.scrollTop + 500);
    const now = firstVisible(scroller);
    await change(Number(now.message.id.slice(1)) - 1, 400);
    expect(Math.abs(now.message.getBoundingClientRect().top - now.top)).toBeLessThanOrEqual(1);
  });

  it("keeps the scroll range to the content's end, below the space above the first message, while the wheel turns, so a row above that comes in shorter never pulls the scroll position", async () => {
    const { scroller, content, clock, space, change } = await spaceAboveWhole();
    // The wheel rests at the top, so the hold on the range goes, and turns again.
    await restWheel(scroller, clock);
    expect(content.offsetTop).toBe(space);
    // Down to the end and 20px back up, without resting: the space stays.
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: 300 }));
    scroller.scrollTop = scroller.scrollHeight;
    await frame();
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
    scroller.scrollTop -= 20;
    await frame();
    const at = scroller.scrollTop;
    const reading = firstVisible(scroller);
    let pulled = 0;
    scroller.addEventListener("scroll", () => pulled++);
    // A row above comes in shorter by less than the space: without the space, the hold on the range would not reach the end.
    const shrink = Math.min(39, space - 1);
    await change(Number(reading.message.id.slice(1)) - 2, 150 - shrink);
    await frame();
    expect(pulled).toBe(0);
    expect(scroller.scrollTop).toBe(at);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
  });

  it("keeps a conversation of 20 messages whole, and windows it once it grows past 20, leaving the view where it is", async () => {
    const { scroller, rerender } = await render(<Chat items={conversation(20, 80, true)} />);
    expect(messages(scroller)).toHaveLength(20);
    expect(scroller.querySelector("[data-ouro-message-list-space]")).toBeNull();
    await scrollTo(scroller, 600);
    const reading = firstVisible(scroller);
    // Older history loads above, and the list grows long: the reader's message stays where it was.
    await rerender(<Chat items={conversation(100, 0, true)} />);
    expect(reading.message.isConnected).toBe(true);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(1);
    expect(messages(scroller).length).toBeLessThan(100);
    expect(scroller.querySelector("[data-ouro-message-list-space]")).not.toBeNull();
    // A conversation of 60 that comes at once, as an app's cached newest page does, draws only what is near the view.
    const page = await render(<Chat items={conversation(60, 0, true)} />);
    expect(messages(page.scroller).length).toBeLessThan(40);
  });

  it("keeps the reader's place far up a list that grows long, though code scrolled it there before the browser reported the scroll", async () => {
    // A short conversation, then a long one, which opens at its newest, not at the rows the short one drew whole; then another,
    // short one, which draws whole.
    const { scroller, root, rerender } = await render(<Chat items={conversation(20, 2000)} />);
    const drawnIds: number[] = [];
    const watch = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement) for (const message of node.querySelectorAll<HTMLElement>('[data-ouro="message"]')) drawnIds.push(Number(message.id.slice(1)));
    });
    watch.observe(scroller, { childList: true, subtree: true });
    await act(async () => void flushSync(() => root.render(<Chat items={conversation(300, 1000)} />)));
    watch.disconnect();
    expect(drawnIds.length).toBeGreaterThan(0);
    expect(drawnIds.every((id) => id >= 1250)).toBe(true);
    await settle(scroller);
    const items = Array.from({ length: 20 }, (_, id) => ({ id, text: `Message ${id}`, tall: 200 }));
    await rerender(<Chat items={items} />);
    expect(messages(scroller)).toHaveLength(20);
    let reading = firstVisible(scroller);
    await act(async () => {
      // Far above what a first draw from the end reaches, and a message arrives before the scroll event.
      scroller.scrollTop -= 3000;
      reading = firstVisible(scroller);
      flushSync(() => root.render(<Chat items={[...items, { id: 20, text: "A new reply." }]} />));
    });
    await settle(scroller);
    expect(reading.message.isConnected).toBe(true);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
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
    // The band, and what is still drawn of the one before it within twice that: the first drawn ends past 1600px above the view,
    // the next one down would start 800px or more below it (each message 16px after the last), and the last starts within 1600px.
    expect(first.bottom).toBeGreaterThan(view.top - 1600);
    expect(last.bottom + 16).toBeGreaterThanOrEqual(view.bottom + 800 - 1);
    expect(last.top).toBeLessThan(view.bottom + 1600);
    // The newest stays drawn, for what arrives next.
    expect(document.getElementById("m999")).not.toBeNull();
    // Far up, the first messages draw, and those the scroll left go.
    await scrollTo(scroller, 0);
    expect(ids(scroller)[0]).toBe(0);
    expect(ids(scroller)).not.toContain(drawn[0]);
  });

  it("keeps a message drawn while code brings the messages after it into view, until it is twice the overscan from the view", async () => {
    const { scroller } = await render(<Chat items={conversation(1000, 0, true)} />);
    await scrollTo(scroller, scroller.scrollHeight / 2);
    const keep = 2 * Math.max(800, scroller.clientHeight);
    // The list places messages by their slots, each with the gap before it: the edge is good to a gap.
    const slack = 16;
    // The first message drawn while the reader goes down, then the last while they go up (not the newest, which always draws).
    const newest = messages(scroller).at(-1)!;
    for (const down of [true, false]) {
      const edge = down ? messages(scroller)[0]! : messages(scroller).filter((message) => message !== newest).at(-1)!;
      // How far the message is past the view's edge on its side.
      const past = () => {
        const view = scroller.getBoundingClientRect();
        const box = edge.getBoundingClientRect();
        return down ? view.top - box.bottom : box.top - view.bottom;
      };
      // Most of the way in one move the band still overlaps, then a step at a time, as a scan measuring each message does.
      await scrollTo(scroller, scroller.scrollTop + (down ? 1 : -1) * (keep - past() - 120));
      let distance = past();
      expect(distance).toBeGreaterThan(keep / 2);
      for (let step = 0; edge.isConnected; step++) {
        expect(step).toBeLessThan(40);
        expect(distance).toBeLessThan(keep + slack);
        const before = scroller.scrollTop;
        await scrollTo(scroller, before + (down ? 10 : -10));
        distance = edge.isConnected ? past() : distance + Math.abs(scroller.scrollTop - before);
      }
      // It goes once it is twice the overscan away, not before.
      expect(distance).toBeGreaterThan(keep - slack);
    }
  });

  it.each([
    ["from the moment the list opens", codeScrollTo],
    ["once the reader has dragged the scrollbar and let go", scrollTo],
  ])("keeps every message drawn while code brings one after another into view, %s, and lets the far ones go at the reader's next scroll", async (_, first) => {
    const { scroller } = await render(<Chat items={conversation(1000, 0, true)} />);
    await first(scroller, scroller.scrollHeight / 2);
    // Code moves the list up a long way, drawing more above, then walks down through the messages drawn, as a contrast
    // check measuring each does (not on to the newest, which always draws, far below them).
    await codeScrollTo(scroller, scroller.scrollTop - 1200);
    const walked = messages(scroller).slice(0, -1);
    for (const message of walked) {
      await act(async () => message.scrollIntoView({ block: "nearest", behavior: "instant" }));
      await settle(scroller);
    }
    expect(walked.filter((message) => !message.isConnected).map((message) => message.id)).toEqual([]);
    // The reader's own scroll lets the ones far from the view go.
    await scrollTo(scroller, scroller.scrollTop + 10);
    expect(walked[0]!.isConnected).toBe(false);
  });

  for (const { by, app } of [
    { by: "the list", app: false },
    { by: "the app's code", app: true },
  ]) {
    it(`keeps no more messages drawn than the reader's scroll would, while ${by} keeps a live conversation at its end through 200 new messages`, async () => {
      let items = conversation(100, 0, true);
      const { scroller, root } = await render(<Chat items={items} />);
      let most = 0;
      for (let next = 100; next < 300; next++) {
        items = [...items, { id: next, text: `Message ${next}${" and more".repeat(next % 7)}` }];
        await act(async () => root.render(<Chat items={items} />));
        // A chat that sticks to the bottom itself, on top of the list's own following.
        if (app) await act(async () => void (scroller.scrollTop = scroller.scrollHeight));
        if (next % 10 === 9) await settle(scroller);
        most = Math.max(most, messages(scroller).length);
      }
      await settle(scroller);
      expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
      expect(most).toBeLessThan(40);
    });
  }

  it("lets the far messages go while the reader holds the scrollbar, through pauses in the drag", async () => {
    const { scroller } = await render(<Chat items={conversation(1000, 0, true)} />);
    const start = messages(scroller).filter((message) => message.id !== "m999");
    await act(async () => void scroller.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse" })));
    // Up in steps, each one ended before the next, as a drag that stops and goes on does.
    for (let step = 0; step < 8; step++) await codeScrollTo(scroller, scroller.scrollTop - 400);
    // The drag ends as the browser takes the pointer (a cancel), and code's scrolls after it keep what is drawn again.
    await act(async () => void document.dispatchEvent(new PointerEvent("pointercancel", { pointerType: "mouse" })));
    expect(start.filter((message) => message.isConnected)).toEqual([]);
    const drawn = messages(scroller)[0]!;
    for (let step = 0; step < 4; step++) await codeScrollTo(scroller, scroller.scrollTop + 500);
    expect(drawn.isConnected).toBe(true);
  });

  it("lets the far messages go as the reader turns the wheel up through them", async () => {
    const { scroller } = await render(<Chat items={conversation(1000, 0, true)} />);
    const start = messages(scroller).filter((message) => message.id !== "m999");
    for (let step = 0; step < 8; step++) {
      await act(async () => {
        scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -400 }));
        scroller.scrollTop -= 400;
      });
      await settle(scroller);
    }
    expect(start.filter((message) => message.isConnected)).toEqual([]);
  });

  it("draws only the window around a far message that code jumps to, and none of the messages between", async () => {
    const { scroller } = await render(<Chat items={conversation(1000, 0, true)} />);
    // A jump past the messages drawn, up or back down, though nearer than code's keep distance, lets them go too.
    const near = messages(scroller).map((message) => message.id);
    await codeScrollTo(scroller, scroller.scrollTop - 4000);
    expect(messages(scroller).filter((message) => near.includes(message.id) && message.id !== "m999")).toEqual([]);
    const above = messages(scroller).filter((message) => message.id !== "m999");
    await codeScrollTo(scroller, scroller.scrollTop + 3000);
    expect(above.filter((message) => message.isConnected)).toEqual([]);
    const before = messages(scroller).map((message) => message.id);
    await codeScrollTo(scroller, 0);
    const drawn = messages(scroller).map((message) => Number(message.id.slice(1)));
    // The start of the conversation, and the newest message, which always draws; nothing from where the list was.
    expect(drawn.filter((id) => id >= 100 && id !== 999)).toEqual([]);
    expect(before.some((id) => drawn.includes(Number(id.slice(1))) && id !== "m999")).toBe(false);
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

  it("commits once in the task a page of older messages lands in, holding the reader's row, and draws the page's rows the overscan reaches in later frames, a chunk at most a frame", async () => {
    let commits = 0;
    const list = (from: number, count: number) => (
      <Profiler id="list" onRender={() => void commits++}>
        <ShortRows ids={span(from, count)} />
      </Profiler>
    );
    const { root, scroller } = await render(list(0, 200));
    await scrollTo(scroller, 0);
    const reading = firstVisible(scroller);
    const older = () => ids(scroller).filter((id) => id < 0);
    let moved = 0;
    const watch = () => (moved = Math.max(moved, Math.abs(reading.message.getBoundingClientRect().top - reading.top)));
    // The older rows drawn by the end of each frame, from the end of the task the page lands in, and whether each frame's are
    // those nearest the reader.
    const drawnByFrame: number[] = [];
    let nearestFirst = true;
    let watching = true;
    const tick = () => {
      watch();
      const drawn = older();
      drawnByFrame.push(drawn.length);
      nearestFirst &&= drawn.every((id, at) => id === at - drawn.length);
      if (watching) requestAnimationFrame(tick);
    };
    commits = 0;
    let landing = { commits: 0, older: -1 };
    await landInATask(
      () => flushSync(() => root.render(list(-200, 400))),
      () => {
        landing = { commits, older: older().length };
        watch();
        requestAnimationFrame(tick);
      },
    );
    await settle(scroller);
    watching = false;
    watch();
    expect(landing).toEqual({ commits: 1, older: 0 });
    // Every row of the page the overscan reaches is drawn in the end, more than a chunk of them, in frames after the one it landed in.
    expectBand(scroller, [199]);
    expect(older().length).toBeGreaterThan(OLDER_CHUNK);
    const added = drawnByFrame.map((count, frame) => count - (drawnByFrame[frame - 1] ?? 0));
    expect(Math.max(...added)).toBeLessThanOrEqual(OLDER_CHUNK);
    expect(nearestFirst).toBe(true);
    expect(moved).toBeLessThanOrEqual(1);
  });

  it("commits at most twice a frame as a page of older messages draws in after it lands", async () => {
    let commits = 0;
    const list = (from: number, count: number) => (
      <Profiler id="list" onRender={() => void commits++}>
        <ShortRows ids={span(from, count)} />
      </Profiler>
    );
    const { root, scroller } = await render(list(0, 200));
    await scrollTo(scroller, 0);
    const older = () => ids(scroller).filter((id) => id < 0).length;
    await landInATask(
      () => flushSync(() => root.render(list(-200, 400))),
      () => {},
    );
    // Commits in each frame, counted from one frame's callback to the next, and the older rows drawn by each frame. One is the
    // chunk's render; the other re-renders the avatars at scroll priority with no state change asking for it.
    const perFrame: number[] = [];
    const drawn: number[] = [];
    let seen = commits;
    for (let frames = 0; frames < 200; frames++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      perFrame.push(commits - seen);
      seen = commits;
      drawn.push(older());
      if (drawn.length >= 7 && drawn.slice(-6).every((count) => count === drawn.at(-1))) break;
    }
    expect(older()).toBeGreaterThan(OLDER_CHUNK);
    expect(Math.max(...perFrame)).toBeLessThanOrEqual(2);
  });

  it("marks the messages a commit brings in, in that commit, before the observer that follows it runs", async () => {
    const { root, scroller } = await render(<ShortRows ids={span(0, 5)} />);
    flushSync(() => root.render(<ShortRows ids={span(-3, 8)} />));
    // Read at once: the marks of the new messages are written by the commit, not by the mutation observer after it.
    const added = document.getElementById("m-3")!;
    expect(added.getAttribute("data-ouro-control")).toBe("message-list");
    expect(added.getAttribute("tabindex")).toBe("-1");
    await settle(scroller);
  });

  it("sizes the rows not drawn at the average of the rows drawn, so equal rows are as tall before the reader scrolls through them", async () => {
    let commits = 0;
    const Equal = ({ ids }: { ids: number[] }) => (
      <Profiler id="equal" onRender={() => void commits++}>
        <MessageList label="Conversation" style={{ height: 400, width: 360 }}>
          {ids.map((id) => (
            <Message key={String(id)} id={`m${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height: 20, boxSizing: "border-box" }}>
              {`Message ${id}`}
            </Message>
          ))}
        </MessageList>
      </Profiler>
    );
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    flushSync(() => root.render(<Equal ids={span(0, 300)} />));
    // The mount and the measure of the rows drawn render four times in the task, the measure's render among them.
    expect(commits).toBe(4);
    const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    await settle(scroller);
    const opened = scroller.scrollHeight;
    while (scroller.scrollTop > 0) await scrollTo(scroller, Math.max(0, scroller.scrollTop - 400));
    await settle(scroller);
    expect(opened).toBe(scroller.scrollHeight);
  });

  it("does not spend a second chunk on rows the first chunk has not drawn yet, when a frame runs before React commits it", async () => {
    let commits = 0;
    const list = (from: number, count: number) => (
      <Profiler id="list" onRender={() => void commits++}>
        <ShortRows ids={span(from, count)} />
      </Profiler>
    );
    const { root, scroller } = await render(list(0, 200));
    await scrollTo(scroller, 0);
    const older = () => ids(scroller).filter((id) => id < 0);
    // The frames are held, so the test runs the drip frames itself: two in a row, with no task between them for React to commit the first chunk in.
    const frames = holdFrames();
    let landing = { commits: 0, older: -1 };
    commits = 0;
    await landInATask(
      () => flushSync(() => root.render(list(-200, 400))),
      () => void (landing = { commits, older: older().length }),
    );
    expect(landing).toEqual({ commits: 1, older: 0 });
    frames.step();
    frames.step();
    await expect.poll(() => older().length).toBeGreaterThan(0);
    expect(older().length).toBeLessThanOrEqual(OLDER_CHUNK);
    frames.release();
    await settle(scroller);
    expectBand(scroller, [199]);
    expect(older().length).toBeGreaterThan(OLDER_CHUNK);
  });

  it("draws, in the task a page of older messages lands in, the rows of it the view shows, so no space kept for a row shows", async () => {
    const { root, scroller } = await render(<ShortRows ids={span(0, 200)} hasOlder />);
    // At the top, the view shows the room kept above the first message, where the page's newest rows land.
    await scrollTo(scroller, 0);
    const reading = firstVisible(scroller);
    let landing = { older: 0, spaceShown: true, moved: Infinity };
    await landInATask(
      () => flushSync(() => root.render(<ShortRows ids={span(-200, 400)} hasOlder />)),
      () => {
        const view = scroller.getBoundingClientRect();
        const shown = (space: Element) => {
          const box = space.getBoundingClientRect();
          return box.bottom > view.top + 1 && box.top < view.bottom - 1;
        };
        landing = {
          older: ids(scroller).filter((id) => id < 0).length,
          spaceShown: [...scroller.querySelectorAll("[data-ouro-message-list-space]")].some(shown),
          moved: Math.abs(reading.message.getBoundingClientRect().top - reading.top),
        };
      },
    );
    expect(landing.older).toBeGreaterThan(0);
    expect(landing.spaceShown).toBe(false);
    expect(landing.moved).toBeLessThanOrEqual(1);
  });

  it("keeps a message whose key changes in place out of view drawn through the task it changes in", async () => {
    const { root, scroller } = await render(<ShortRows ids={span(0, 200)} />);
    await scrollTo(scroller, scroller.scrollHeight / 2);
    const top = scroller.getBoundingClientRect().top;
    // One between the band's edges: a key that changes at an edge leaves the band to find itself again.
    const above = ids(scroller).filter((each) => document.getElementById(`m${each}`)!.getBoundingClientRect().bottom < top - 100);
    const id = above[Math.floor(above.length / 2)]!;
    let drawn = false;
    await landInATask(
      // A temporary id swapped for the server's, as a sent message's is.
      () => flushSync(() => root.render(<ShortRows ids={span(0, 200)} keyOf={(each) => (each === id ? `server-${each}` : String(each))} />)),
      () => (drawn = document.getElementById(`m${id}`) !== null),
    );
    expect(drawn).toBe(true);
  });

  it("draws, in the task messages in view are deleted, the rows already in the list that the overscan then reaches, holding none for later frames", async () => {
    const { root, scroller } = await render(<ShortRows ids={span(0, 300)} />);
    await scrollTo(scroller, scroller.scrollHeight / 2);
    const reading = firstVisible(scroller);
    // Twenty messages from the one at the view's top: the rows below move up, and the band reaches rows it had not drawn.
    const gone = new Set(span(Number(reading.message.id.slice(1)), 20));
    let atEnd: number[] = [];
    await landInATask(
      () => flushSync(() => root.render(<ShortRows ids={span(0, 300).filter((id) => !gone.has(id))} />)),
      () => (atEnd = ids(scroller)),
    );
    await settle(scroller);
    // No message that was in the list waits for a later frame: the rows after the task are the rows at its end.
    expect(ids(scroller).filter((id) => !atEnd.includes(id))).toEqual([]);
  });

  it("draws the rows past the view's edges of another conversation it opens all at once after its first frame, not a chunk a frame", async () => {
    const { root, scroller } = await render(<ShortRows ids={span(0, 300)} conversation="ana" keyOf={(id) => `ana-${id}`} />);
    // The messages added in each frame after the commit that opens the other conversation. The watch starts before
    // that commit, which lands in one task, so a frame that follows it on a slow runner is never missed (#2203).
    let added = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) added += node.querySelectorAll('[data-ouro="message"]').length + Number(node.matches('[data-ouro="message"]'));
    });
    observer.observe(scroller, { childList: true, subtree: true });
    const perFrame: number[] = [];
    let watching = true;
    const tick = () => {
      perFrame.push(added);
      added = 0;
      if (watching) requestAnimationFrame(tick);
    };
    await landInATask(
      () => flushSync(() => root.render(<ShortRows ids={span(0, 300)} conversation="theo" keyOf={(id) => `theo-${id}`} />)),
      () => {
        // The commit's own rows, the ones in view, are not a frame's.
        added = 0;
        requestAnimationFrame(tick);
      },
    );
    await settle(scroller);
    watching = false;
    observer.disconnect();
    expect(Math.max(...perFrame)).toBeGreaterThan(OLDER_CHUNK);
  });

  it("moves no row the reader looks at by a pixel in any frame, scrolling up through 100 rows never drawn whose heights differ from the estimate by up to 40px", async () => {
    // Heights from 60 to 140px: the estimate, the average of those first drawn, is wrong by up to 40px for each row.
    const heightOf = (id: number) => 60 + ((id * 37) % 81);
    const rows = Array.from({ length: 600 }, (_, id) => (
      <Message key={id} id={`m${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height: heightOf(id), boxSizing: "border-box" }}>
        {`Message ${id}`}
      </Message>
    ));
    const { scroller } = await render(
      <MessageList label="Conversation" style={{ height: 400, width: 360 }}>
        {rows}
      </MessageList>,
    );
    const middle = () => {
      const view = scroller.getBoundingClientRect();
      const centre = (view.top + view.bottom) / 2;
      return messages(scroller).find((node) => node.getBoundingClientRect().bottom > centre)!;
    };
    let worst = 0;
    let jumps = 0;
    const seen = new Set<number>();
    for (let step = 0; step < 450; step++) {
      const row = middle();
      const before = row.getBoundingClientRect().top;
      const scrolled = scroller.scrollTop;
      scroller.scrollTop = scrolled - 24;
      const reader = scrolled - scroller.scrollTop;
      await frame();
      const moved = row.isConnected ? Math.abs(row.getBoundingClientRect().top - (before + reader)) : 0;
      worst = Math.max(worst, moved);
      if (moved >= 1) jumps++;
      for (const id of ids(scroller)) seen.add(id);
    }
    await settle(scroller);
    // About 100 rows, none of which was drawn when the reader began.
    expect(seen.size).toBeGreaterThan(100);
    expect(jumps).toBe(0);
    expect(worst).toBeLessThan(1);
  }, 60_000);

  it("opens a conversation of 300 rows of varied heights at its end, moving the row at the view's top by no more than a pixel in any frame", async () => {
    const rows = Array.from({ length: 300 }, (_, id) => (
      <Message key={id} id={`m${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height: 60 + ((id * 37) % 81), boxSizing: "border-box" }}>
        {`Message ${id}`}
      </Message>
    ));
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    let worst = 0;
    // The scroll position may change as the rows past the view draw after the first paint, their heights replacing the
    // estimate in the space above: what the reader sees, the row at the view's top, stays.
    let last: { node: HTMLElement; row: number } | null = null;
    const watch = () => {
      const list = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]");
      const view = list?.getBoundingClientRect();
      const first = list === null ? undefined : messages(list).find((node) => node.getBoundingClientRect().bottom > view!.top);
      if (list !== null && first !== undefined) {
        const now = { node: first, row: first.getBoundingClientRect().top - view!.top };
        if (last !== null) worst = Math.max(worst, now.node === last.node ? Math.abs(now.row - last.row) : Infinity);
        last = now;
      }
    };
    let watching = true;
    const tick = () => {
      watch();
      if (watching) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await act(async () => root.render(<MessageList label="Conversation" style={{ height: 400, width: 360 }}>{rows}</MessageList>));
    const start = performance.now();
    while (performance.now() - start < 1000) await frame();
    watching = false;
    const list = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    expect(distanceFromBottom(list)).toBeLessThanOrEqual(1);
    expect(last).not.toBeNull();
    expect(worst).toBeLessThanOrEqual(1);
  });

  it("opens with no more rows than fill the window, and draws the rows past the view's edges only after the first paint", async () => {
    const { innerWidth: width, innerHeight: height } = window;
    await page.viewport(800, 600);
    try {
      // A list taller than the window measured last: the next one still draws no more than the window holds.
      await render(<Chat items={conversation(100)} style={{ height: 1000, width: 360 }} />);
      const renders = new Set<number>();
      function Counted({ id }: { id: number }) {
        renders.add(id);
        return (
          <Message id={`m${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height: 80, boxSizing: "border-box" }}>
            {`Message ${id}`}
          </Message>
        );
      }
      const host = document.createElement("div");
      document.body.append(host);
      mounted.push(host);
      const root = createRoot(host);
      roots.push(root);
      let opened = new Set<number>();
      await act(async () => {
        // The commit that opens the list, with the renders its layout effects ask for, before any frame.
        flushSync(() =>
          root.render(
            <MessageList label="Conversation" style={{ height: 400, width: 360 }}>
              {Array.from({ length: 300 }, (_, id) => (
                <Counted key={id} id={id} />
              ))}
            </MessageList>,
          ),
        );
        opened = new Set(renders);
      });
      // A row is 80px and the gap 16px: the commit that opens the list draws what fills the window, and no more.
      expect(opened.size).toBeLessThanOrEqual(Math.ceil(window.innerHeight / 96) + 1);
      expect(opened.has(299)).toBe(true);
      const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
      await settle(scroller);
      // Then the overscan: 800px above the view.
      expect(messages(scroller).length).toBeGreaterThanOrEqual(Math.floor((400 + 800) / 96));
      expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    } finally {
      await page.viewport(width, height);
    }
  });

  it("remembers no view from a list given no height, so the next list's first render still fills its view, with no second render to fill it", async () => {
    await render(<Chat items={conversation(100)} style={{ height: 400, width: 360 }} />);
    // A list laid out with no height (a pane collapsed to nothing): it windows, and has no view to remember.
    const { scroller: empty } = await render(<Chat items={conversation(100)} style={{ height: 0, width: 360 }} />);
    expect(empty.clientHeight).toBe(0);
    // The messages in the page as the newest one's layout effect runs: the first render's, before the list's own effects.
    let first = 0;
    function Newest() {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        first = ref.current!.closest("[data-ouro-message-list-content]")!.querySelectorAll('[data-ouro="message"]').length;
      }, []);
      return (
        <Message id="m299" role="assistant" name="Ouro" style={{ height: 80, boxSizing: "border-box" }}>
          <div ref={ref}>Message 299</div>
        </Message>
      );
    }
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    await act(async () =>
      root.render(
        <MessageList label="Conversation" style={{ height: 400, width: 360 }}>
          {Array.from({ length: 299 }, (_, id) => (
            <Message key={id} id={`m${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height: 80, boxSizing: "border-box" }}>
              {`Message ${id}`}
            </Message>
          ))}
          <Newest key={299} />
        </MessageList>,
      ),
    );
    // A row is 80px and the gap 16px: the 400px view the first list measured, filled.
    expect(first).toBeGreaterThanOrEqual(Math.floor(400 / 96));
  });

  /**
   * 300 rows of exactly `height` px each, the newest of which reports how many messages are in the page as its layout effect runs,
   * in the first commit, with the list's content.
   */
  function shortRows(height: number, onFirst: (count: number, content: HTMLElement) => void) {
    function Newest() {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        const content = ref.current!.closest<HTMLElement>("[data-ouro-message-list-content]")!;
        onFirst(content.querySelectorAll('[data-ouro="message"]').length, content);
      }, []);
      return (
        <Message id="m299" role="assistant" name="Ouro" style={{ height, boxSizing: "border-box" }}>
          <div ref={ref} />
        </Message>
      );
    }
    return [
      ...Array.from({ length: 299 }, (_, id) => <Message key={id} id={`m${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height, boxSizing: "border-box" }} />),
      <Newest key={299} />,
    ];
  }

  it("draws as many short rows as fill the view in the first commit, given their estimatedItemHeight", async () => {
    // A 400px view, measured, for the next list to take as its own.
    await render(<Chat items={conversation(100)} />);
    let first = 0;
    await render(
      <MessageList label="Conversation" estimatedItemHeight={24} style={{ height: 400, width: 360 }}>
        {shortRows(24, (count) => (first = count))}
      </MessageList>,
    );
    // A row is 24px and the gap 16px: the 400px view, filled. The list's own first guess, 96px, would draw five.
    expect(first).toBeGreaterThanOrEqual(Math.floor(400 / 40));
  });

  it("draws only the rows that fill the view in the first commit, given their estimatedItemHeight, where the built-in estimate would draw more", async () => {
    const { innerWidth: width, innerHeight: height } = window;
    await page.viewport(800, 900);
    try {
      // A 600px view, measured, for the next list to take as its own.
      await render(<Chat items={conversation(100)} style={{ height: 600, width: 360 }} />);
      let first = 0;
      await render(
        <MessageList label="Conversation" estimatedItemHeight={130} style={{ height: 600, width: 360 }}>
          {shortRows(130, (count) => (first = count))}
        </MessageList>,
      );
      // Five 130px rows fill 600px; at 96px a row, the list would draw seven.
      expect(first).toBe(5);
    } finally {
      await page.viewport(width, height);
    }
  });

  it("opens with the estimate a heightCache kept from the list before it, for the rows neither measured", async () => {
    const heightCache = new Map<string, number>();
    // In the first commit, before the list measures anything: the space kept above the rows drawn, and how many rows it stands for.
    let first = { drawn: 0, space: 0 };
    const rows = (count: number) =>
      shortRows(24, (_, content) => {
        const drawn = Number(content.querySelector<HTMLElement>('[data-ouro="message"]')!.id.slice(1));
        first = { drawn, space: content.querySelector<HTMLElement>("[data-ouro-message-list-space]")!.getBoundingClientRect().height };
      }).slice(300 - count);
    const { root } = await render(
      <MessageList label="Conversation" heightCache={heightCache} style={{ height: 400, width: 360 }}>
        {rows(100)}
      </MessageList>,
    );
    await act(async () => root.unmount());
    // The same conversation, with 200 older rows that no list has measured: they are 24px each, as the rows measured were.
    await render(
      <MessageList label="Conversation" heightCache={heightCache} style={{ height: 400, width: 360 }}>
        {rows(300)}
      </MessageList>,
    );
    expect(first.drawn).toBeGreaterThan(200);
    // The rows 0 to 199 at the estimate kept, 24px; those after them, measured by the list before.
    expect(first.space).toBeCloseTo(24 * first.drawn + 16 * (first.drawn - 1), 0);
  });

  it("keeps the space for the rows not drawn at estimatedItemHeight each, not the average of the rows measured", async () => {
    const { scroller } = await render(
      <MessageList label="Conversation" estimatedItemHeight={57} style={{ height: 400, width: 360 }}>
        {shortRows(24, () => {})}
      </MessageList>,
    );
    const drawn = ids(scroller)[0]!;
    expect(drawn).toBeGreaterThan(0);
    // The rows above the first drawn, 57px each, with the 16px gap between them; the measured rows are 24px.
    const space = scroller.querySelector<HTMLElement>("[data-ouro-message-list-space]")!;
    expect(space.getBoundingClientRect().height).toBeCloseTo(57 * drawn + 16 * (drawn - 1), 0);
  });

  it("reads each cached height once a render at most, and none on a scroll, so a long conversation's window costs little to find", async () => {
    const count = 1000;
    let reads = 0;
    let renders = 0;
    class Counted extends Map<string, number> {
      override get(key: string) {
        reads++;
        return super.get(key);
      }
    }
    const cache = new Counted();
    const { scroller } = await render(
      <Profiler id="list" onRender={() => void renders++}>
        <MessageList label="Conversation" style={{ height: 400, width: 360 }} heightCache={cache}>
          {conversation(count).map((item) => (
            <Message key={item.id} id={`m${item.id}`} role={item.id % 2 ? "assistant" : "user"} name={item.id % 2 ? "Ouro" : "Ana"}>
              {item.text}
            </Message>
          ))}
        </MessageList>
      </Profiler>,
    );
    reads = 0;
    renders = 0;
    for (let step = 1; step <= 5; step++) await scrollTo(scroller, scroller.scrollTop - 4);
    expect(reads).toBeLessThanOrEqual(renders * count);
  });

  it("keeps the height of every row in a heightCache the app hands in, so a list that mounts again with it is as tall, in its first commit, as it was", async () => {
    const heightOf = (id: number) => 60 + ((id * 37) % 81);
    // The scroll height as the newest row's layout effect finds it: in the commit that draws it, before the list's own effects run.
    const firstCommit: number[] = [];
    function Newest() {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        firstCommit.push(ref.current!.closest<HTMLElement>("[data-ouro-message-list-scroller]")!.scrollHeight);
      }, []);
      return <div ref={ref} style={{ height: 80 }} />;
    }
    const list = (cache: Map<string, number>, width = 360) => (
      <MessageList label="Conversation" style={{ height: 400, width }} heightCache={cache}>
        {Array.from({ length: 400 }, (_, id) => (
          <Message key={id} id={`m${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height: heightOf(id), boxSizing: "border-box" }}>
            {`Message ${id}`}
          </Message>
        ))}
        <Newest key="newest" />
      </MessageList>
    );
    const cache = new Map<string, number>();
    const first = await render(list(cache));
    // Scrolled through, so every row has been drawn and measured once.
    for (let top = first.scroller.scrollHeight; top > 0; top -= 1200) await scrollTo(first.scroller, top);
    await scrollTo(first.scroller, 0);
    const known = first.scroller.scrollHeight;
    expect(cache.size).toBeGreaterThan(300);
    // Handed another map, the list writes to it from then on.
    const other = new Map<string, number>();
    await first.rerender(list(other));
    await scrollTo(first.scroller, 1200);
    expect(other.size).toBeGreaterThan(0);
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    for (const node of mounted) node.remove();
    mounted = [];
    firstCommit.length = 0;
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    // A few pixels wider: the same width to the nearest 8, so the same heights.
    await act(async () => root.render(list(cache, 363)));
    expect(firstCommit).toHaveLength(1);
    expect(Math.abs(firstCommit[0]! - known)).toBeLessThanOrEqual(1);
  }, 60_000);

  it("reads the heightCache that comes with another conversation from its first commit, as tall as that conversation's list was, and writes only to its own", async () => {
    // Rows of one conversation are 60 to 140px tall, the other's 30px: the estimate each list takes for the rows it has not measured differs.
    const heightOf = (name: string, id: number) => (name === "b" ? 60 + ((id * 37) % 81) : 30);
    // The scroll height as the newest row's layout effect finds it, in the commit that draws it, before the list's own effects run.
    const firstCommit: number[] = [];
    function Newest({ name }: { name: string }) {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        firstCommit.push(ref.current!.closest<HTMLElement>("[data-ouro-message-list-scroller]")!.scrollHeight);
      }, [name]);
      return <div ref={ref} style={{ height: 80 }} />;
    }
    const list = (name: string, cache: Map<string, number>) => (
      <MessageList conversation={name} label="Conversation" style={{ height: 400, width: 360 }} heightCache={cache}>
        {Array.from({ length: 400 }, (_, id) => (
          <Message key={`${name}${id}`} id={`m${name}${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height: heightOf(name, id), boxSizing: "border-box" }}>
            {`Message ${id}`}
          </Message>
        ))}
        <Newest key={`newest-${name}`} name={name} />
      </MessageList>
    );
    const cacheB = new Map<string, number>();
    const earlier = await render(list("b", cacheB));
    const known = earlier.scroller.scrollHeight;
    await act(async () => earlier.root.unmount());
    earlier.host.remove();
    const cacheA = new Map<string, number>();
    const { scroller, rerender } = await render(list("a", cacheA));
    const before = cacheB.size;
    firstCommit.length = 0;
    await rerender(list("b", cacheB));
    expect(firstCommit).toHaveLength(1);
    expect(Math.abs(firstCommit[0]! - known)).toBeLessThanOrEqual(1);
    // Rows it has not drawn before are measured into the map it was handed, and none of its rows into the one before.
    await scrollTo(scroller, 1200);
    expect(cacheB.size).toBeGreaterThan(before);
    expect([...cacheA.keys()].filter((key) => key.startsWith("b"))).toEqual([]);
  }, 60_000);

  it("opens a switch to a conversation whose heightCache is still empty as a list that mounts with an empty one does, not with the estimate of the one before", async () => {
    // Rows of one conversation are 30px, the other's 60 to 140px: the list learns an estimate from the first that the second's must not take.
    const heightOf = (name: string, id: number) => (name === "b" ? 60 + ((id * 37) % 81) : 30);
    const firstCommit: number[] = [];
    function Newest({ name }: { name: string }) {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        firstCommit.push(ref.current!.closest<HTMLElement>("[data-ouro-message-list-scroller]")!.scrollHeight);
      }, [name]);
      return <div ref={ref} style={{ height: 80 }} />;
    }
    const list = (name: string, cache: Map<string, number>) => (
      <MessageList conversation={name} label="Conversation" style={{ height: 400, width: 360 }} heightCache={cache}>
        {Array.from({ length: 400 }, (_, id) => (
          <Message key={`${name}${id}`} id={`m${name}${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height: heightOf(name, id), boxSizing: "border-box" }}>
            {`Message ${id}`}
          </Message>
        ))}
        <Newest key={`newest-${name}`} name={name} />
      </MessageList>
    );
    firstCommit.length = 0;
    const fresh = await render(list("b", new Map()));
    const mounted = firstCommit[0]!;
    await act(async () => fresh.root.unmount());
    fresh.host.remove();
    const cacheA = new Map<string, number>();
    const { rerender } = await render(list("a", cacheA));
    expect(cacheA.size).toBeGreaterThan(0);
    firstCommit.length = 0;
    await rerender(list("b", new Map()));
    expect(firstCommit).toHaveLength(1);
    // The two draw a different number of the newest rows in that commit, so they differ by part of a view; the estimate of the
    // conversation before, 30px for rows the default takes at 96, would put the switch thousands of pixels short.
    expect(Math.abs(firstCommit[0]! - mounted)).toBeLessThan(400);
  }, 60_000);

  it("moves nothing when a heightCache comes with the same conversation mid-conversation: the heights measured stay, and so does the reader's place", async () => {
    // Rows of 140px from 300 on, of 60 to 78px before: the estimate the list takes is that of the newest rows, far from theirs.
    const heightOf = (id: number) => (id >= 300 ? 140 : 60 + ((id * 7) % 7) * 3);
    // The newest row's key changes in place with its height, so the list looks at its messages without a switch.
    const list = (cache: Map<string, number>, newest: string) => (
      <MessageList conversation="a" label="Conversation" style={{ height: 400, width: 360 }} heightCache={cache}>
        {Array.from({ length: 400 }, (_, id) => (
          <Message key={id === 399 ? newest : id} id={`m${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height: heightOf(id), boxSizing: "border-box" }}>
            {`Message ${id}`}
          </Message>
        ))}
      </MessageList>
    );
    const { scroller, rerender } = await render(list(new Map(), "399"));
    // Every row measured, then the reader scrolled up through the middle.
    for (let top = scroller.scrollHeight; top > 0; top -= 1200) await scrollTo(scroller, top);
    await scrollTo(scroller, 4000);
    const reading = firstVisible(scroller);
    const height = scroller.scrollHeight;
    const top = scroller.scrollTop;
    await rerender(list(new Map(), "newest"));
    expect(scroller.scrollHeight).toBe(height);
    expect(scroller.scrollTop).toBe(top);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
  }, 60_000);

  it("keeps a switch to a conversation of the same heights as tall as the one before, under the heightCache it keeps, after a resize", async () => {
    const heightOf = (id: number) => (id >= 300 ? 140 : 60 + ((id * 7) % 7) * 3);
    const cache = new Map<string, number>();
    // The newest three rows of the second conversation have keys of their own, so it is a switch; the rest share the first's keys.
    const list = (name: string, width: number) => (
      <MessageList conversation={name} label="Conversation" style={{ height: 400, width }} heightCache={cache}>
        {Array.from({ length: 400 }, (_, id) => (
          <Message key={id < 397 ? `k${id}` : `${name}${id}`} id={`${name}${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height: heightOf(id), boxSizing: "border-box" }}>
            {`Message ${id}`}
          </Message>
        ))}
      </MessageList>
    );
    const { scroller, rerender } = await render(list("a", 360));
    // Every row measured at the first width, then the list is resized: the rows not drawn keep the heights they were measured at.
    for (let top = scroller.scrollHeight; top > 0; top -= 1200) await scrollTo(scroller, top);
    await rerender(list("a", 440));
    const first = scroller.scrollHeight;
    await rerender(list("b", 440));
    expect(Math.abs(scroller.scrollHeight - first)).toBeLessThanOrEqual(1);
  }, 60_000);

  it("estimates the rows not drawn from the heightCache at the width the list has now, once it is resized", async () => {
    const cache = new Map<string, number>();
    for (let id = 0; id < 400; id++) cache.set(`.$${id}\0${440}`, 50);
    const rows = Array.from({ length: 400 }, (_, id) => (
      <Message key={id} id={`m${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"} style={{ height: 100, boxSizing: "border-box" }}>
        {`Message ${id}`}
      </Message>
    ));
    const { scroller, rerender } = await render(
      <MessageList label="Conversation" style={{ height: 400, width: 360 }} heightCache={cache}>
        {rows}
      </MessageList>,
    );
    const narrow = scroller.scrollHeight;
    await rerender(
      <MessageList label="Conversation" style={{ height: 400, width: 440 }} heightCache={cache}>
        {rows}
      </MessageList>,
    );
    // The rows not drawn, nearly all of them, are 50px at this width and were 100px at the other.
    expect(narrow - scroller.scrollHeight).toBeGreaterThan(10_000);
  });

  it("draws, in the commit a short list the reader scrolled up in takes 200 older rows and 360 newer, no more rows than the 60 it drew and the 20 newest", async () => {
    const renders = new Set<number>();
    function Counted({ id }: { id: number }) {
      renders.add(id);
      return (
        <Message id={`m${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"}>
          {`Message ${id}`}
        </Message>
      );
    }
    const list = (from: number, count: number) => (
      <MessageList label="Conversation" style={{ height: 400, width: 360 }}>
        {Array.from({ length: count }, (_, offset) => (
          <Counted key={from + offset} id={from + offset} />
        ))}
      </MessageList>
    );
    const { scroller, rerender } = await render(list(0, 40));
    await scrollTo(scroller, 200);
    renders.clear();
    await rerender(list(-200, 600));
    // Those, and the band the window then finds for the view.
    expect(renders.size).toBeLessThanOrEqual(120);
    expect(renders.size).toBeGreaterThan(20);
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

  it("holds the reader's place by the messages when a heading that stays put in the view comes with them, as one fixed there would", async () => {
    // One message taller than the view fills it, with the next just below. A heading that does not move with the content shows too.
    const tall = "A long message. ".repeat(60);
    const items = (above: string): Item[] => conversation(600).map((item) => (item.id === 300 ? { ...item, text: tall } : item.id === 299 ? { ...item, text: above } : item));
    const actions = createRef<MessageListActions>();
    const chat = (above: string, headingTop: number) => (
      <Chat items={items(above)} actionsRef={actions} before={(id) => (id === 300 ? <p key="day" id="day-300" style={{ position: "fixed", top: headingTop }}>Tuesday</p> : null)} />
    );
    const { scroller, rerender } = await render(chat("Short.", 0));
    const view = scroller.getBoundingClientRect();
    await rerender(chat("Short.", view.top + 20));
    await act(async () => void actions.current!.reveal("m300"));
    await settle(scroller);
    const filler = () => document.getElementById("m300")!.getBoundingClientRect();
    await scrollTo(scroller, scroller.scrollTop + (filler().top - view.top) + 100);
    expect(filler().top).toBeLessThan(view.top);
    expect(filler().bottom).toBeGreaterThan(view.bottom);
    expect(document.getElementById("day-300")!.getBoundingClientRect().top).toBeGreaterThan(view.top);
    const top = filler().top;
    const height = scroller.scrollHeight;
    // The message above grows: the filler goes down with everything below it, and the list scrolls to hold it where it was.
    await rerender(chat("A message that grows. ".repeat(40), view.top + 20));
    expect(scroller.scrollHeight).toBeGreaterThan(height + 100);
    expect(Math.abs(filler().top - top)).toBeLessThanOrEqual(ROUNDING);
  });

  it("holds a heading that shows alone in the view, not the messages below it, when the heading grows", async () => {
    const actions = createRef<MessageListActions>();
    const chat = (height: number) => (
      <Chat items={conversation(600)} actionsRef={actions} before={(id) => (id === 300 ? <p key="day" id="day-300" style={{ margin: 0, height }}>Tuesday</p> : null)} />
    );
    const { scroller, rerender } = await render(chat(900));
    await act(async () => void actions.current!.reveal("m300"));
    await settle(scroller);
    const view = scroller.getBoundingClientRect();
    const heading = () => document.getElementById("day-300")!.getBoundingClientRect();
    // The view sits inside the heading, with the next message a little below it: the only message drawn near is not in view.
    await scrollTo(scroller, scroller.scrollTop + (heading().top - view.top) + 200);
    expect(heading().top).toBeLessThan(view.top);
    expect(heading().bottom).toBeGreaterThan(view.bottom);
    const before = scroller.scrollTop;
    await rerender(chat(1200));
    await settle(scroller);
    // The heading is what the reader is reading: its growth below them moves them nowhere.
    expect(Math.abs(scroller.scrollTop - before)).toBeLessThanOrEqual(ROUNDING);
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
    // Frames are held while the page goes in, so the oldest has not gone in yet however slow the runner (#789).
    items = [...conversation(100), ...items];
    const frames = holdFrames();
    await act(async () => roots.at(-1)!.render(<Chat items={items} actionsRef={actions} windowing={false} />));
    expect(document.getElementById("m0")).toBeNull();
    await act(async () => void actions.current!.reveal("m0", { focus: true }));
    expect(document.getElementById("m0")).toBeNull();
    frames.release();
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
      const view = scroller.getBoundingClientRect();
      const drawn = messages(scroller).map((node) => node.getBoundingClientRect());
      around = drawn[0]!.top <= view.top && drawn.filter((box) => box.top < view.bottom).at(-1)!.bottom >= view.bottom;
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

  it("re-opens at the initialAnchor that comes with another conversation, with no remount, and at its newest without one", async () => {
    const { host, scroller, rerender } = await render(<Chat conversation="a" items={conversation(2000, 0, true)} />);
    await scrollTo(scroller, 8000);
    // What the switch's first draw shows: the anchor, in the list's view, before the browser paints.
    let first = Number.NaN;
    let around = false;
    const observer = new MutationObserver(() => {
      if (!Number.isNaN(first) || !document.getElementById("m2200")) return;
      first = Math.abs(offCentre(scroller, "m2200"));
      const view = scroller.getBoundingClientRect();
      const drawn = messages(scroller).map((node) => node.getBoundingClientRect());
      around = drawn[0]!.top <= view.top && drawn.filter((box) => box.top < view.bottom).at(-1)!.bottom >= view.bottom;
    });
    observer.observe(host, { childList: true, subtree: true });
    await rerender(<Chat conversation="b" items={conversation(2000, 2000, true)} initialAnchor="m2200" />);
    observer.disconnect();
    expect(host.querySelector("[data-ouro-message-list-scroller]")).toBe(scroller);
    expect(first).toBeLessThanOrEqual(ROUNDING);
    expect(around).toBe(true);
    expect(Math.abs(offCentre(scroller, "m2200"))).toBeLessThanOrEqual(ROUNDING);
    expect(distanceFromBottom(scroller)).toBeGreaterThan(10_000);
    await rerender(<Chat conversation="c" items={conversation(300, 4000)} />);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    expect(inView(scroller, "m4299")).toBe(true);
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

  it("draws only the window of a page of older messages that goes in after a first child that is no message, above a reader at the top", async () => {
    const renders = new Set<number>();
    function Counted({ id }: { id: number }) {
      renders.add(id);
      return (
        <Message id={`m${id}`} role={id % 2 ? "assistant" : "user"} name={id % 2 ? "Ouro" : "Ana"}>
          {`Message ${id}`}
        </Message>
      );
    }
    const list = (from: number, count: number) => (
      <MessageList label="Conversation" style={{ height: 400, width: 360 }}>
        <p key="start">The start of the conversation</p>
        {Array.from({ length: count }, (_, offset) => (
          <Counted key={from + offset} id={from + offset} />
        ))}
      </MessageList>
    );
    const { scroller, rerender } = await render(list(0, 100));
    await scrollTo(scroller, 0);
    const reading = firstVisible(scroller);
    renders.clear();
    await rerender(list(-60, 160));
    // The page goes in as space: of its 60 rows, only those the view and its overscan reach draw.
    expect([...renders].filter((id) => id < 0).length).toBeLessThan(30);
    expect(Math.abs(reading.message.getBoundingClientRect().top - reading.top)).toBeLessThanOrEqual(ROUNDING);
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

  it("keeps a child that says it is busy drawn far from the view, by aria-busy as a boolean or a string", async () => {
    const before = (id: number) =>
      id === 300 ? (
        <p key="busy-boolean" id="busy-boolean" aria-busy={true}>
          Loading earlier replies
        </p>
      ) : id === 320 ? (
        <p key="busy-string" id="busy-string" aria-busy="true">
          Loading a file
        </p>
      ) : id === 340 ? (
        <p key="idle" id="idle" aria-busy={false}>
          Loaded
        </p>
      ) : null;
    const { scroller } = await render(<Chat items={conversation(400, 0, true)} initialAnchor="m50" before={before} />);
    expect(ids(scroller)).toContain(50);
    expect(document.getElementById("busy-boolean")).not.toBeNull();
    expect(document.getElementById("busy-string")).not.toBeNull();
    expect(document.getElementById("idle")).toBeNull();
    expect(document.getElementById("m300")).toBeNull();
  });

  it("draws none of the newest messages it opened with, not for a moment, when it opens far up at an anchor", async () => {
    // Which messages go into the page, from before the list's first drawing.
    const added = new Set<string>();
    const watch = new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes) if (node instanceof Element) for (const message of node.querySelectorAll('[data-ouro="message"]')) added.add(message.id);
    });
    watch.observe(document.body, { childList: true, subtree: true });
    const { scroller } = await render(<Chat items={conversation(400, 0, true)} initialAnchor="m100" />);
    watch.disconnect();
    expect(ids(scroller)).toContain(100);
    expect(added.has("m399")).toBe(true);
    expect([...added].filter((id) => Number(id.slice(1)) >= 380 && id !== "m399")).toEqual([]);
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
