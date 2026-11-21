import { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findInMessages } from "@/registry/ouro/lib/ouro/find-messages";
import { ALL_MATCHES, CURRENT_MATCH, useFindHighlights } from "@/registry/ouro/lib/ouro/use-find-highlights";
import { act } from "@/registry/ouro/lib/ouro/testing/act";

const roots: Root[] = [];
const hosts: Element[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  for (const host of hosts.splice(0)) host.remove();
  vi.restoreAllMocks();
});

const rows = [
  { key: "a", text: "one fox and two foxes" },
  { key: "b", text: "no match here" },
  { key: "c", text: "a last fox" },
];

function Harness({ query, current, reduced = false, tall = false, roomy = false, none = false, stray = false, shortA = false, fold, locale }: { stray?: boolean; shortA?: boolean; none?: boolean; fold?: "none" | "case" | "accents" | "all"; locale?: string; query: string; current: number; reduced?: boolean; tall?: boolean; roomy?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const find = { query, ...(fold ? { fold } : {}), ...(locale ? { locale } : {}) };
  const result = findInMessages(rows, find);
  useFindHighlights({ scroller, content, slot: "data-key", find: none ? undefined : find, result, current, reduced });
  return (
    <div ref={scroller} data-testid="scroller" style={{ height: roomy ? 300 : 80, overflow: "auto" }}>
      <div ref={content}>
        {rows.map((row, index) => (
          <p key={row.key} data-key={row.key} style={{ margin: 0, height: tall ? 400 : roomy ? 60 : undefined }}>
            <span data-ouro-message-content="" data-index={index}>
              {shortA && row.key === "a" ? "one fox" : row.text}
            </span>
          </p>
        ))}
        {stray ? (
          <p data-key="z">
            <span data-ouro-message-content="">a stray fox</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

async function mount(props: Parameters<typeof Harness>[0]) {
  const host = document.createElement("div");
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(<Harness {...props} />));
  return { host, root };
}

const drawn = (name: string) => [...(CSS.highlights.get(name) ?? [])].map((range) => range.toString());

describe("useFindHighlights", () => {
  it("draws nothing for a list with no find, and takes the fold and locale a find names", async () => {
    await mount({ query: "fox", current: 0, none: true });
    expect(drawn(ALL_MATCHES)).toEqual([]);
    await mount({ query: "FOX", current: 0, fold: "none" });
    expect(drawn(CURRENT_MATCH)).toEqual([]);
    await mount({ query: "FOX", current: 0, fold: "case", locale: "en" });
    expect(drawn(CURRENT_MATCH)).toEqual(["fox"]);
  });

  it("draws the current match apart from the others, and clears both when the query empties or the list goes", async () => {
    const { root } = await mount({ query: "fox", current: 3 });
    expect(drawn(CURRENT_MATCH)).toEqual(["fox"]);
    expect(drawn(ALL_MATCHES)).toEqual(["fox", "fox"]);
    await act(async () => root.render(<Harness query="" current={0} />));
    expect(CSS.highlights.has(ALL_MATCHES)).toBe(false);
    expect(CSS.highlights.has(CURRENT_MATCH)).toBe(false);
    await act(async () => root.render(<Harness query="fox" current={0} />));
    expect(drawn(ALL_MATCHES)).toHaveLength(2);
    await act(async () => root.unmount());
    roots.length = 0;
    expect(CSS.highlights.has(ALL_MATCHES)).toBe(false);
    expect(CSS.highlights.has(CURRENT_MATCH)).toBe(false);
  });

  it("draws again when the text in the list changes, once per burst of changes, and stops when it unmounts", async () => {
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const { host, root } = await mount({ query: "fox", current: 0 });
    expect(drawn(ALL_MATCHES)).toHaveLength(2);
    const text = host.querySelector("[data-key=a] [data-ouro-message-content]")!;
    text.textContent = "fox fox fox";
    text.textContent = "fox fox fox fox";
    await expect.poll(() => drawn(ALL_MATCHES).length + drawn(CURRENT_MATCH).length).toBe(5);
    expect(cancel).toHaveBeenCalled();
    cancel.mockClear();
    await act(async () => root.unmount());
    roots.length = 0;
    expect(cancel).toHaveBeenCalled();
    text.textContent = "fox";
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(CSS.highlights.has(ALL_MATCHES)).toBe(false);
  });

  it("draws again when only the characters of a text node change", async () => {
    const { host } = await mount({ query: "fox", current: 0 });
    expect(drawn(ALL_MATCHES)).toHaveLength(2);
    const node = host.querySelector("[data-key=a] [data-ouro-message-content]")!.firstChild as Text;
    node.data = "fox fox fox fox";
    await expect.poll(() => drawn(ALL_MATCHES).length + drawn(CURRENT_MATCH).length).toBe(5);
  });

  it("scrolls by exactly what brings a match back 48px inside the view, and not at all from that line inward", async () => {
    const scrollTo = vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => undefined);
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    const { root } = await mount({ query: "zzz", current: 0, roomy: true });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => rect(100, 300));
    const place = vi.spyOn(Range.prototype, "getBoundingClientRect");
    const moveFor = async (top: number, bottom: number) => {
      place.mockImplementation(() => rect(top, bottom));
      scrollTo.mockClear();
      await act(async () => root.render(<Harness query="zzz" current={0} roomy />));
      await act(async () => root.render(<Harness query="last" current={0} roomy />));
      return scrollTo.mock.calls.length === 0 ? 0 : (scrollTo.mock.calls[0]![0] as ScrollToOptions).top;
    };
    expect(await moveFor(140, 160)).toBe(-8);
    expect(await moveFor(148, 168)).toBe(0);
    expect(await moveFor(160, 200)).toBe(0);
    expect(await moveFor(240, 252)).toBe(0);
    expect(await moveFor(250, 270)).toBe(18);
  });

  it("leaves out an element the result has no matches for, even when its text matches", async () => {
    await mount({ query: "fox", current: 0, stray: true });
    expect(drawn(ALL_MATCHES)).toEqual(["fox", "fox"]);
    expect(drawn(CURRENT_MATCH)).toEqual(["fox"]);
  });

  it("falls back to the last drawn match of a message when the text drawn has fewer than the result counted", async () => {
    await mount({ query: "fox", current: 1, shortA: true });
    expect(drawn(CURRENT_MATCH)).toEqual(["fox"]);
    expect(drawn(ALL_MATCHES)).toEqual(["fox"]);
  });

  it("draws every match of a message other than the current one's as an ordinary match, the second included", async () => {
    await mount({ query: "fox", current: 2 });
    expect(drawn(CURRENT_MATCH)).toHaveLength(1);
    expect(drawn(ALL_MATCHES)).toHaveLength(2);
    await mount({ query: "fox", current: 0, roomy: true });
    expect(drawn(ALL_MATCHES)).toHaveLength(2);
  });

  it("puts the current highlight on the occurrence the index names", async () => {
    const { host } = await mount({ query: "fox", current: 1 });
    const current = [...CSS.highlights.get(CURRENT_MATCH)!][0]!;
    expect(current.startContainer.parentElement?.closest("[data-key]")?.getAttribute("data-key")).toBe("a");
    expect(current.startOffset).toBe(current.startContainer.textContent!.indexOf("fox", 5));
    expect(host.querySelectorAll("[data-key]")).toHaveLength(3);
  });

  it("scrolls a current match that is out of view to it, smoothly or at once under reduced motion, and leaves one in view", async () => {
    const scrollTo = vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => undefined);
    const { root } = await mount({ query: "last", current: 0, tall: true });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const [options] = scrollTo.mock.calls[0] as unknown as [ScrollToOptions];
    expect(options.behavior).toBe("smooth");
    expect(options.top).toBeGreaterThan(700);
    await act(async () => root.render(<Harness query="last" current={0} tall reduced />));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    scrollTo.mockClear();
    await act(async () => root.render(<Harness query="last" current={0} roomy reduced />));
    expect(scrollTo).not.toHaveBeenCalled();
    await act(async () => root.render(<Harness query="foxes" current={0} tall reduced />));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "instant" }));
  });

  it("leaves the scroll alone for a match already well inside the view", async () => {
    const scrollTo = vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => undefined);
    await mount({ query: "last", current: 0, roomy: true });
    expect(drawn(CURRENT_MATCH)).toEqual(["last"]);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls up to a match above the view, leaving room above it", async () => {
    const { host, root } = await mount({ query: "last", current: 0, tall: true });
    const view = host.querySelector<HTMLElement>("[data-testid=scroller]")!;
    await act(async () => root.render(<Harness query="zzz" current={0} tall />));
    view.scrollTop = view.scrollHeight;
    const scrollTo = vi.spyOn(view, "scrollTo").mockImplementation(() => undefined);
    await act(async () => root.render(<Harness query="one" current={0} tall />));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const [options] = scrollTo.mock.calls[0] as unknown as [ScrollToOptions];
    const match = ([...CSS.highlights.get(CURRENT_MATCH)!][0] as Range).getBoundingClientRect();
    expect(options.top).toBeCloseTo(view.scrollTop + match.top - view.getBoundingClientRect().top - 48, 0);
  });

  it("does nothing where the browser has no highlight API", async () => {
    const highlights = Object.getOwnPropertyDescriptor(CSS, "highlights");
    Object.defineProperty(CSS, "highlights", { value: undefined, configurable: true });
    delete (CSS as unknown as Record<string, unknown>)["highlights"];
    try {
      await mount({ query: "fox", current: 0 });
    } finally {
      if (highlights) Object.defineProperty(CSS, "highlights", highlights);
    }
  });
});
