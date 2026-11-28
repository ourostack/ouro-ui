import { createRef, useState, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList, type MessageListActions } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pressTab } from "@/registry/ouro/lib/ouro/testing/tab";

const roots: Root[] = [];
let mounted: Element[] = [];

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
    content: host.querySelector<HTMLElement>("[data-ouro-message-list-content]")!,
    rerender: async (next: ReactNode) => {
      await act(async () => root.render(next));
      await settle(scroller);
    },
  };
}

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
});

/** Waits a frame, so a ResizeObserver's own report (one frame behind the box it measures) has landed. */
async function frame() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

/** Waits until the list has settled: its scroll position and height read the same across two frames. */
async function settle(scroller: HTMLElement) {
  let last = "";
  await expect
    .poll(async () => {
      await frame();
      const now = `${scroller.scrollTop}|${scroller.scrollHeight}`;
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
}

const distanceFromBottom = (scroller: HTMLElement) => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

const history = (count: number, from = 0) =>
  Array.from({ length: count }, (_, offset) => ({
    id: from + offset,
    role: (from + offset) % 2 ? ("assistant" as const) : ("user" as const),
    text: `Message ${from + offset}: ${"word ".repeat(8)}`,
  }));

function Chat({
  items,
  foot,
  actionsRef,
  maxWidth,
}: {
  items: { id: number; role: "user" | "assistant"; text: ReactNode }[];
  foot?: ReactNode;
  actionsRef?: Ref<MessageListActions>;
  maxWidth?: number;
}) {
  return (
    <MessageList label="Conversation" style={{ height: 300 }} foot={foot} actionsRef={actionsRef} maxWidth={maxWidth}>
      {items.map((item) => (
        <Message key={item.id} id={`m${item.id}`} role={item.role} name={item.role === "user" ? "Ana" : "Ouro"}>
          {item.text}
        </Message>
      ))}
    </MessageList>
  );
}

describe("MessageList foot", () => {
  it("reserves room under the last message for the foot's measured height, with scroll-padding-bottom to match", async () => {
    const foot = <div style={{ height: 64 }}>Composer</div>;
    const { host, scroller, content } = await render(<Chat items={history(2)} foot={foot} />);
    const footBox = host.querySelector<HTMLElement>("[data-ouro-message-list-foot]")!.getBoundingClientRect();
    expect(footBox.height).toBeCloseTo(64, 0);
    const padding = parseFloat(getComputedStyle(content).paddingBottom);
    expect(padding).toBeCloseTo(64, 0);
    expect(parseFloat(getComputedStyle(scroller).scrollPaddingBottom)).toBeCloseTo(64, 0);
    const last = [...scroller.querySelectorAll('[data-ouro="message"]')].at(-1)!.getBoundingClientRect();
    // The newest message sits just above the foot: not covered by it, and not floating far above it either.
    expect(last.bottom).toBeLessThanOrEqual(footBox.top + 1);
    expect(footBox.top - last.bottom).toBeLessThan(2);
  });

  it("keeps the content's own padding when there is no foot", async () => {
    const { content } = await render(<Chat items={history(2)} />);
    expect(parseFloat(getComputedStyle(content).paddingBottom)).toBeCloseTo(16, 0);
  });

  it("keeps the content's own bottom padding at maxWidth too, with no foot to reserve room for", async () => {
    const { content } = await render(<Chat items={history(2)} maxWidth={500} />);
    // maxWidth alone takes the content's style object down the "centred column" branch; without a foot that
    // branch must still leave the content's own p-4 bottom padding alone, not fold in a foot height of 0.
    expect(parseFloat(getComputedStyle(content).paddingBottom)).toBeCloseTo(16, 0);
  });

  it("floats Jump to latest above the foot, not overlapping it", async () => {
    const foot = <div style={{ height: 64 }}>Composer</div>;
    const { host, scroller } = await render(<Chat items={history(40)} foot={foot} />);
    await act(async () => void (scroller.scrollTop = 0));
    await settle(scroller);
    await expect.element(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    const footBox = host.querySelector<HTMLElement>("[data-ouro-message-list-foot]")!.getBoundingClientRect();
    const jumpBox = host.querySelector<HTMLElement>("[data-ouro-message-list-jump]")!.getBoundingClientRect();
    expect(jumpBox.bottom).toBeLessThanOrEqual(footBox.top + 1);
  });

  it("keeps a pinned reader at the list's end as the foot grows taller, covering no message", async () => {
    const { host, scroller, rerender } = await render(<Chat items={history(2)} foot={<div style={{ height: 32 }}>Draft</div>} />);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    await rerender(<Chat items={history(2)} foot={<div style={{ height: 160 }}>A much longer draft, as the reader keeps typing it</div>} />);
    expect(distanceFromBottom(scroller)).toBeLessThanOrEqual(1);
    const footBox = host.querySelector<HTMLElement>("[data-ouro-message-list-foot]")!.getBoundingClientRect();
    const last = [...scroller.querySelectorAll('[data-ouro="message"]')].at(-1)!.getBoundingClientRect();
    expect(last.bottom).toBeLessThanOrEqual(footBox.top + 1);
  });

  it("centres a revealed message within the room the foot leaves, not past the foot's edge", async () => {
    const footHeight = 100;
    const actionsRef = createRef<MessageListActions>();
    const { host, scroller } = await render(<Chat items={history(30)} foot={<div style={{ height: footHeight }}>Composer</div>} actionsRef={actionsRef} />);
    await act(async () => void (scroller.scrollTop = 0));
    await settle(scroller);
    let found = Promise.resolve(false);
    await act(async () => void (found = actionsRef.current!.reveal("m15", { block: "center" })));
    expect(await found).toBe(true);
    await settle(scroller);
    const view = scroller.getBoundingClientRect();
    const box = host.querySelector("#m15")!.getBoundingClientRect();
    const room = view.height - footHeight;
    // Centred in the room above the foot: were the foot's height folded in the wrong direction, this would be off by
    // close to the foot's own height, not a sub-pixel or two (WebKit rounds a centred box up to 1.25px off).
    expect(Math.abs(box.top - view.top - Math.max(0, (room - box.height) / 2))).toBeLessThan(2);
  });

  it("keeps a message keyboard-paged into view the list's own edge margin clear of the foot", async () => {
    const footHeight = 96;
    const { host, scroller } = await render(
      <div>
        <button type="button">Before</button>
        <Chat items={history(20)} foot={<div style={{ height: footHeight }}>Composer</div>} />
      </div>,
    );
    const messages = [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    host.querySelector<HTMLButtonElement>("button")!.focus();
    // Tab lands on the newest message (scrolled to the bottom); Home then scrolls back to the first, so Page Down
    // below pages genuinely forward, the way the no-foot keyboard tests pin a message the same edge margin clear
    // of the scroller's own bottom.
    await pressTab();
    await userEvent.keyboard("{Home}");
    await settle(scroller);
    expect(document.activeElement).toBe(messages[0]);
    const start = messages[0]!.getBoundingClientRect().top;
    const down = messages.findLastIndex((message, index) => index > 0 && message.getBoundingClientRect().top - start <= scroller.clientHeight);
    // Short of the newest, so the foot's reserved room is still there to scroll into, not already the scroller's hard limit.
    expect(down).toBeLessThan(messages.length - 1);
    await userEvent.keyboard("{PageDown}");
    await settle(scroller);
    expect(document.activeElement).toBe(messages[down]);
    const view = scroller.getBoundingClientRect();
    const box = messages[down]!.getBoundingClientRect();
    // 8px (the list's own edge margin) clear of the foot, not clear of the scroller's bare bottom edge.
    expect(view.bottom - box.bottom).toBeCloseTo(footHeight + 8, 0);
  });

  it("renders no foot overlay without a foot, and drops its room when the foot is removed", async () => {
    const none = await render(<Chat items={history(2)} />);
    expect(none.host.querySelector("[data-slot='message-list-foot-overlay']")).toBeNull();
    const { host, content, rerender } = await render(<Chat items={history(2)} foot={<div style={{ height: 64 }}>Composer</div>} />);
    expect(parseFloat(getComputedStyle(content).paddingBottom)).toBeCloseTo(64, 0);
    await rerender(<Chat items={history(2)} />);
    expect(host.querySelector("[data-ouro-message-list-foot]")).toBeNull();
    expect(parseFloat(getComputedStyle(content).paddingBottom)).toBeCloseTo(16, 0);
  });

  it("follows a foot that grows by itself, with no new foot passed in", async () => {
    const Growing = () => {
      const [height, setHeight] = useState(40);
      return (
        <div style={{ height }}>
          <button type="button" onClick={() => setHeight(120)}>
            Grow
          </button>
        </div>
      );
    };
    const stable = <Growing />;
    const { host, content, scroller } = await render(<Chat items={history(2)} foot={stable} />);
    await act(async () => host.querySelector<HTMLButtonElement>("[data-ouro-message-list-foot] button")!.click());
    await settle(scroller);
    expect(parseFloat(getComputedStyle(content).paddingBottom)).toBeCloseTo(120, 0);
  });

  it("reveals a message taller than the room the foot leaves at its top, not its bottom", async () => {
    const actionsRef = createRef<MessageListActions>();
    const items = history(6);
    items[3] = { ...items[3]!, text: "tall ".repeat(120) };
    const { host, scroller } = await render(<Chat items={items} foot={<div style={{ height: 120 }}>Composer</div>} actionsRef={actionsRef} />);
    await act(async () => void (scroller.scrollTop = 0));
    await settle(scroller);
    await act(async () => void actionsRef.current!.reveal("m3", { block: "nearest" }));
    await settle(scroller);
    const view = scroller.getBoundingClientRect();
    expect(host.querySelector("#m3")!.getBoundingClientRect().top - view.top).toBeLessThanOrEqual(12);
  });
  it("measures a foot passed in after the list first rendered without one", async () => {
    const { content, rerender } = await render(<Chat items={history(2)} />);
    expect(parseFloat(getComputedStyle(content).paddingBottom)).toBeCloseTo(16, 0);
    await rerender(<Chat items={history(2)} foot={<div style={{ height: 64 }}>Composer</div>} />);
    expect(parseFloat(getComputedStyle(content).paddingBottom)).toBeCloseTo(64, 0);
  });

  it("keyboard-reveals a message taller than the room the foot leaves at its top", async () => {
    const items: { id: number; role: "user" | "assistant"; text: ReactNode }[] = history(10);
    // Taller than the 180px the 120px foot leaves of the 300px list, yet shorter than the whole list.
    items[3] = { ...items[3]!, text: <div style={{ height: 220 }}>Tall</div> };
    const { host, scroller } = await render(
      <div>
        <button type="button">Before</button>
        <Chat items={items} foot={<div style={{ height: 120 }}>Composer</div>} />
      </div>,
    );
    const messages = [...scroller.querySelectorAll<HTMLElement>('[data-ouro="message"]')];
    host.querySelector<HTMLButtonElement>("button")!.focus();
    await pressTab();
    await userEvent.keyboard("{Home}");
    await settle(scroller);
    expect(document.activeElement).toBe(messages[0]);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    await settle(scroller);
    expect(document.activeElement).toBe(messages[3]);
    const view = scroller.getBoundingClientRect();
    // Aligned at the top, the list's own 8px edge margin below it (to a sub-pixel), not with its bottom just above the foot.
    expect(Math.abs(messages[3]!.getBoundingClientRect().top - view.top - 8)).toBeLessThan(1.5);
  });
});
