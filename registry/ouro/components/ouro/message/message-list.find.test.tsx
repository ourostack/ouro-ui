import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Message } from "@/registry/ouro/components/ouro/message/message";
import { MessageList, type MessageListFind, type MessageListFindReport } from "@/registry/ouro/components/ouro/message/message-list";
import { act } from "@/registry/ouro/lib/ouro/testing/act";
import { pageCss } from "@/registry/ouro/lib/ouro/testing/page-css";

const roots: Root[] = [];
let mounted: Element[] = [];

// The find layer loads on demand; having it loaded keeps its arrival inside the act that renders the list.
beforeAll(() => import("@/registry/ouro/components/ouro/message/message-list-parts"));

afterEach(async () => {
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
  return { host, root };
}

const lines = ["Lunch at noon", "Nothing to add", "Café for lunch, or LUNCH out", "Straße ahead"];

function Chat({ find, onFindMatches }: { find?: MessageListFind; onFindMatches?: (report: MessageListFindReport) => void }) {
  return (
    <MessageList label="Chat" style={{ height: 300 }} find={find} onFindMatches={onFindMatches}>
      {lines.map((text, index) => (
        <Message key={index} id={`m${index}`} variant="chat" role="assistant" name="Ana">
          {text}
        </Message>
      ))}
    </MessageList>
  );
}

const highlighted = (name: string) => [...(CSS.highlights.get(name) ?? [])].map((range) => range.toString());

describe("MessageList find", () => {
  it("reports how many matches there are and which is current, folding case and accents", async () => {
    const report = vi.fn();
    await render(<Chat find={{ query: "lunch", current: 2 }} onFindMatches={report} />);
    await expect.poll(() => report.mock.lastCall?.[0]).toEqual({ count: 3, current: 2, partial: false });
  });

  it("counts the matches before the current one's message, wherever it is", async () => {
    const report = vi.fn();
    await render(<Chat find={{ query: "lunch", current: 0 }} onFindMatches={report} />);
    await expect.poll(() => report.mock.lastCall?.[0]).toEqual({ count: 3, current: 0, partial: false });
  });

  it("reports to the latest onFindMatches, and carries the highlight classes on the list", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { host, root } = await render(<Chat find={{ query: "lunch" }} onFindMatches={first} />);
    await expect.poll(() => first.mock.calls.length).toBeGreaterThan(0);
    await act(async () => root.render(<Chat find={{ query: "ahead" }} onFindMatches={second} />));
    await expect.poll(() => second.mock.lastCall?.[0]).toEqual({ count: 1, current: 0, partial: false });
    expect(first.mock.lastCall?.[0]).toEqual({ count: 3, current: 0, partial: false });
    expect(host.querySelector("[data-ouro=message-list]")!.className).toContain("[&::highlight(ouro-find-current)]:bg-primary");
  });

  it("wraps the current match round, and reports none for an empty query", async () => {
    const report = vi.fn();
    const { root } = await render(<Chat find={{ query: "lunch", current: -1 }} onFindMatches={report} />);
    await expect.poll(() => report.mock.lastCall?.[0]).toEqual({ count: 3, current: 2, partial: false });
    report.mockClear();
    await act(async () => root.render(<Chat find={{ query: "" }} onFindMatches={report} />));
    await expect.poll(() => report.mock.lastCall?.[0]).toEqual({ count: 0, current: null, partial: false });
    expect(highlighted("ouro-find")).toEqual([]);
  });

  it("highlights each match in the text, the current one apart, without changing the text", async () => {
    const { host } = await render(<Chat find={{ query: "lunch", current: 1 }} />);
    await expect.poll(() => [...highlighted("ouro-find"), ...highlighted("ouro-find-current")].sort()).toEqual(["LUNCH", "Lunch", "lunch"]);
    expect(highlighted("ouro-find-current")).toEqual(["lunch"]);
    expect(host.textContent).toContain("Café for lunch, or LUNCH out");
  });

  it("matches across accents, and takes the fold from the find", async () => {
    await render(<Chat find={{ query: "cafe" }} />);
    await expect.poll(() => highlighted("ouro-find-current")).toEqual(["Café"]);
  });

  it("leaves the scroll where the reader put it when the parent renders again", async () => {
    const many = (find: MessageListFind) => (
      <MessageList label="Chat" style={{ height: 200 }} find={find}>
        {Array.from({ length: 12 }, (_, index) => (
          <Message key={index} id={`s${index}`} variant="chat" role="assistant" name="Ana">
            {index === 0 ? "needle" : `Filler ${index}`}
          </Message>
        ))}
      </MessageList>
    );
    const { host, root } = await render(many({ query: "needle" }));
    const scroller = host.querySelector<HTMLElement>("[data-ouro-message-list-scroller]")!;
    await expect.poll(() => CSS.highlights.get("ouro-find-current")?.size).toBe(1);
    await act(async () => scroller.scrollTo({ top: scroller.scrollHeight, behavior: "instant" }));
    const scrollTo = vi.spyOn(scroller, "scrollTo");
    await act(async () => root.render(many({ query: "needle" })));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("clears the highlights when the list goes away", async () => {
    const { root } = await render(<Chat find={{ query: "lunch" }} />);
    await expect.poll(() => highlighted("ouro-find-current")).toHaveLength(1);
    await act(async () => root.unmount());
    expect(CSS.highlights.has("ouro-find")).toBe(false);
    expect(CSS.highlights.has("ouro-find-current")).toBe(false);
  });

  it("does not move focus out of a find box", async () => {
    const { host } = await render(
      <>
        <input aria-label="Find" />
        <Chat find={{ query: "lunch" }} />
      </>,
    );
    const input = host.querySelector("input")!;
    input.focus();
    await expect.poll(() => CSS.highlights.get("ouro-find-current")?.size).toBe(1);
    expect(document.activeElement).toBe(input);
  });

  it("styles matches from theme tokens, with system colours in forced colours", async () => {
    await render(<Chat find={{ query: "lunch" }} />);
    await expect.poll(() => pageCss()).toContain("::highlight(ouro-find-current)");
    const css = pageCss();
    expect(css).toContain("::highlight(ouro-find-current)");
    expect(css).toMatch(/ouro-find\\\)\\\]\\:text-foreground/);
    expect(css).toMatch(/Highlight/);
    expect(css).toMatch(/MarkText/);
  });
});
