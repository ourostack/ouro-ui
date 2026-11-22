import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList, type MessageListFindReport } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
let mounted: Element[] = [];

beforeAll(() => import("@/registry/ouro/components/ouro/message/message-list-parts"));

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const host of mounted) host.remove();
  mounted = [];
});

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function Chat({ current, hasOlder, twice, tall, at, report }: { current: number; hasOlder?: boolean; twice?: boolean; tall?: boolean; at?: number; report: MessageListFindReport[] }) {
  const [reports] = useState(report);
  return (
    <MessageList label="Chat" style={{ height: 300, width: 360 }} hasOlder={hasOlder} find={{ query: "needle", current }} onFindMatches={(next) => reports.push(next)}>
      {Array.from({ length: 400 }, (_, id) => (
        <Message key={id} id={`m${id}`} role={id % 2 ? "assistant" : "user"} name="Ana" style={{ height: id === 200 && tall ? undefined : 80, boxSizing: "border-box" }}>
          {id === 200 && tall ? <div style={{ height: 1200 }} /> : null}
          {id === 200 && twice ? "Message 200 needle needle" : id === 3 || id === 200 || id === at ? `Message ${id} needle` : `Message ${id}`}
        </Message>
      ))}
    </MessageList>
  );
}

describe("MessageList find in a windowed list", () => {
  it("draws a match that is not drawn, scrolls it into view and highlights it as the current one", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    const report: MessageListFindReport[] = [];
    await act(async () => root.render(<Chat current={0} report={report} />));
    const scroller = host.querySelector<HTMLElement>("[data-ouro='message-list']")!.querySelector<HTMLElement>("[data-ouro-message-list-scroller]") ?? host.querySelector<HTMLElement>("[data-ouro='message-list']")!;
    expect(host.querySelector("#m200")).toBeNull();
    await act(async () => root.render(<Chat current={1} report={report} />));
    await expect.poll(() => host.querySelector("#m200") !== null).toBe(true);
    await expect.poll(async () => {
      await frame();
      const row = host.querySelector("#m200")!.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      return row.top >= view.top && row.bottom <= view.bottom;
    }).toBe(true);
    await expect.poll(() => [...(CSS.highlights.get("ouro-find-current") ?? [])].map((range) => range.toString())).toEqual(["needle"]);
    expect(report.at(-1)).toEqual({ count: 2, current: 1, partial: false });
  });

  it("reports that more matches may lie in history that has not loaded", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    const report: MessageListFindReport[] = [];
    await act(async () => root.render(<Chat current={0} hasOlder report={report} />));
    expect(report.at(-1)?.partial).toBe(true);
  });

  it("draws the message again for the next match inside it after the window moved away", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    const report: MessageListFindReport[] = [];
    await act(async () => root.render(<Chat twice current={1} report={report} />));
    await expect.poll(() => host.querySelector("#m200") !== null).toBe(true);
    const scroller = host.querySelector<HTMLElement>("[data-ouro='message-list']")!.querySelector<HTMLElement>("[data-ouro-message-list-scroller]") ?? host.querySelector<HTMLElement>("[data-ouro='message-list']")!;
    await act(async () => scroller.scrollTo({ top: 0, behavior: "instant" }));
    await expect.poll(() => host.querySelector("#m200") === null).toBe(true);
    await act(async () => root.render(<Chat twice current={2} report={report} />));
    await expect.poll(() => host.querySelector("#m200") !== null).toBe(true);
    await expect.poll(() => [...(CSS.highlights.get("ouro-find-current") ?? [])].map((range) => range.toString())).toEqual(["needle"]);
    expect(report.at(-1)).toEqual({ count: 3, current: 2, partial: false });
  });

  it("scrolls to the match itself once its message is drawn, when the message is taller than the list", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    const report: MessageListFindReport[] = [];
    await act(async () => root.render(<Chat tall current={0} report={report} />));
    await act(async () => root.render(<Chat tall current={1} report={report} />));
    await expect.poll(() => host.querySelector("#m200") !== null).toBe(true);
    const scroller = host.querySelector<HTMLElement>("[data-ouro='message-list']")!.querySelector<HTMLElement>("[data-ouro-message-list-scroller]") ?? host.querySelector<HTMLElement>("[data-ouro='message-list']")!;
    await expect.poll(async () => {
      await frame();
      const match = ([...(CSS.highlights.get("ouro-find-current") ?? [])][0] as Range | undefined)?.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      return match !== undefined && match.top >= view.top && match.bottom <= view.bottom;
    }).toBe(true);
  });

  it("does not scroll back to a match that was in the window, once the reader has moved away", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(host);
    const root = createRoot(host);
    roots.push(root);
    const report: MessageListFindReport[] = [];
    await act(async () => root.render(<Chat at={398} current={2} report={report} />));
    const scroller = host.querySelector<HTMLElement>("[data-ouro='message-list']")!.querySelector<HTMLElement>("[data-ouro-message-list-scroller]") ?? host.querySelector<HTMLElement>("[data-ouro='message-list']")!;
    await expect.poll(() => [...(CSS.highlights.get("ouro-find-current") ?? [])].map((range) => range.toString())).toEqual(["needle"]);
    await act(async () => scroller.scrollTo({ top: scroller.scrollTop - 200, behavior: "instant" }));
    await frame();
    const top = scroller.scrollTop;
    await act(async () => host.querySelector("[data-ouro-message-list-slot]")!.parentElement!.append(document.createElement("i")));
    await frame();
    await frame();
    expect(scroller.scrollTop).toBe(top);
  });
});
