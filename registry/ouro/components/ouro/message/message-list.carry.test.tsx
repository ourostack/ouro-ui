import { createRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { userEvent } from "vitest/browser";
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
  tall?: number;
}

const conversation = (count: number, from = 0): Item[] => Array.from({ length: count }, (_, offset) => ({ id: from + offset, text: `Message ${from + offset}` }));

function Chat({ items, actionsRef, windowing, springy }: { items: Item[]; actionsRef?: React.Ref<MessageListActions>; windowing?: boolean; springy?: boolean }) {
  return (
    <MessageList label="Conversation" style={{ height: 400, width: 360 }} actionsRef={actionsRef} windowing={windowing} springy={springy}>
      {items.map((item) => (
        <Message key={item.id} id={`m${item.id}`} role={item.id % 2 ? "assistant" : "user"} name={item.id % 2 ? "Ouro" : "Ana"}>
          {item.tall === undefined ? item.text : <div style={{ height: item.tall }} />}
        </Message>
      ))}
    </MessageList>
  );
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const messages = (scroller: HTMLElement) => [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
const ids = (scroller: HTMLElement) => messages(scroller).map((message) => Number(message.id.slice(1)));
const distanceFromBottom = (scroller: HTMLElement) => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
const ROUNDING = 2;

async function settle(scroller: HTMLElement) {
  const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]");
  let last = "";
  await expect
    .poll(async () => {
      await frame();
      const now = `${scroller.scrollTop}|${scroller.scrollHeight}|${ids(scroller).join(",")}|${content?.style.translate}|${content?.style.marginBlockStart}`;
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
}

async function scrollTo(scroller: HTMLElement, top: number) {
  await act(async () => void scroller.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "mouse" })));
  const before = scroller.scrollTop;
  const taken = new Promise<void>((resolve) => scroller.addEventListener("scroll", () => resolve(), { once: true }));
  await act(async () => void (scroller.scrollTop = top));
  if (scroller.scrollTop !== before) await taken;
  await act(async () => void document.dispatchEvent(new PointerEvent("pointerup", { pointerType: "mouse" })));
  await settle(scroller);
}

function firstVisible(scroller: HTMLElement): { message: HTMLElement; top: number } {
  const viewTop = scroller.getBoundingClientRect().top;
  const message = messages(scroller).find((node) => node.getBoundingClientRect().top >= viewTop)!;
  return { message, top: message.getBoundingClientRect().top };
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
  };
}

describe("MessageList carry and reach", () => {
  it("keeps what a write mid-wheel did not land drawn by the translate, until a later write lands it", async () => {
    let from = 100;
    const chat = () => <Chat items={conversation(300 - from, from)} windowing={false} />;
    const { scroller, rerender } = await render(chat());
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    let now = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    await scrollTo(scroller, 300);
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
    from -= 20;
    await rerender(chat());
    const held = content.style.translate;
    expect(held).not.toBe("");
    const own = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
    let lands = 0.5;
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => own.get!.call(scroller),
      set: (value: number) => {
        const at = own.get!.call(scroller);
        own.set!.call(scroller, at + (value - at) * (value === 40 ? 1 : lands));
      },
    });
    onTestFinished(() => void delete (scroller as { scrollTop?: number }).scrollTop);
    // The reader nears the top while the wheel turns: the carry is paid, and the write lands in part.
    await act(async () => void (scroller.scrollTop = 40));
    await expect.poll(() => content.style.translate).not.toBe(held);
    const carriedPx = (value: string) => -Number(/(-?[\d.]+)px$/.exec(value)![1]);
    const landed = scroller.scrollTop - 40;
    expect(landed).toBeGreaterThan(0);
    expect(carriedPx(content.style.translate)).toBeCloseTo(Math.round(carriedPx(held)) - landed, 3);
    // What goes in above meanwhile is still held, so the reader's place stays: the part landed moved the anchors with it.
    const kept = carriedPx(content.style.translate);
    from -= 20;
    await rerender(chat());
    expect(carriedPx(content.style.translate)).toBeGreaterThan(kept);
    // A later write lands in full, and the translate goes.
    lands = 1;
    now += 10_000;
    await expect.poll(() => content.style.translate).toBe("");
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


  it("lets the space go once a shrink above past the top has been paid and the reader has scrolled beyond it", async () => {
    const items = (shrunk: boolean, last: number) =>
      conversation(300).map((item) => ({ ...item, tall: item.id === 0 ? (shrunk ? 20 : 300) : item.id === 299 ? last : 60 }));
    const { scroller, rerender } = await render(<Chat items={items(false, 60)} springy={false} windowing={false} />);
    await scrollTo(scroller, 100);
    let now = 1_000_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
    await rerender(<Chat items={items(true, 60)} springy={false} windowing={false} />);
    now += 10_000;
    await frame();
    await settle(scroller);
    await scrollTo(scroller, 600);
    await rerender(<Chat items={items(true, 61)} springy={false} windowing={false} />);
    await settle(scroller);
    expect(scroller.scrollTop).toBeGreaterThan(0);
  });

  it("settles a reveal at a child that has the id as a prop but draws no element with it, saying nothing was shown", async () => {
    const actions = createRef<MessageListActions>();
    function Ghost({ id }: { id: string }) {
      return <p data-ghost={id}>Drawn without its id</p>;
    }
    await render(
      <MessageList label="Conversation" style={{ height: 400, width: 360 }} actionsRef={actions}>
        {[<Ghost key="ghost" id="ghost" />, ...conversation(5).map((item) => <Message key={item.id} id={`m${item.id}`} role="user" name="Ana">{item.text}</Message>)]}
      </MessageList>,
    );
    let found = Promise.resolve(true);
    await act(async () => void (found = actions.current!.reveal("ghost")));
    expect(await found).toBe(false);
  });

  it("drops what is held when the reader goes to the newest, so the end is where the scroll goes", async () => {
    const actions = createRef<MessageListActions>();
    let from = 100;
    const chat = () => <Chat items={conversation(300 - from, from)} windowing={false} actionsRef={actions} />;
    const { scroller, rerender } = await render(chat());
    const content = scroller.querySelector<HTMLElement>("[data-ouro-message-list-content]")!;
    vi.spyOn(performance, "now").mockImplementation(() => 1_000_000);
    await scrollTo(scroller, 300);
    scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -20 }));
    from -= 20;
    await rerender(chat());
    expect(content.style.translate).not.toBe("");
    await act(async () => actions.current!.jumpToNewest());
    expect(content.style.translate).toBe("");
    await settle(scroller);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
  });

  it("moves past a day's heading with the arrow keys, drawing the message it reaches", async () => {
    const items = conversation(1000);
    const day = (id: number) => (id % 10 === 0 ? <p key={`day-${id}`}>Day {id / 10}</p> : null);
    function Typing() {
      return null;
    }
    await render(
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
    await act(async () => document.getElementById("m999")!.focus({ preventScroll: true }));
    await userEvent.keyboard("{ArrowUp}");
    await expect.poll(() => document.activeElement?.id).toBe("m998");
    for (let step = 0; step < 8; step++) await userEvent.keyboard("{ArrowUp}");
    await expect.poll(() => document.activeElement?.id).toBe("m990");
    await userEvent.keyboard("{ArrowUp}");
    await expect.poll(() => document.activeElement?.id).toBe("m989");
    await userEvent.keyboard("{ArrowDown}");
    await expect.poll(() => document.activeElement?.id).toBe("m990");
  });
});
